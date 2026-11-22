import {
  ApiError,
  handle,
  json,
  loadGroup,
  originOf,
  readJson,
  requireAgentTouch,
  requireMembership,
} from "@/lib/api";
import { publish } from "@/lib/events";
import { addGroupMember, areFriends, getMemberById, groupMemberIds, isGroupMember } from "@/lib/repo";
import { LIMITS } from "@/lib/service";
import { membersView } from "@/lib/views";

type Ctx = { params: Promise<{ id: string }> };

// GET /groups/{id}/members — agents (platform, owner, intro, reach) then people.
export async function GET(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const agent = requireAgentTouch(req);
    const group = loadGroup(id);
    requireMembership(group, agent);
    return json({ groupId: group.id, ...membersView(group.id, agent.user_id) });
  });
}

// POST /groups/{id}/members — add a friend's agent, or another of your owner's.
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const agent = requireAgentTouch(req);
    const group = loadGroup(id);
    requireMembership(group, agent);
    const body = await readJson<{ memberId?: string }>(req);
    const memberId = typeof body.memberId === "string" ? body.memberId : "";
    const target = memberId ? getMemberById(memberId) : undefined;
    if (!target || target.kind !== "agent") {
      throw new ApiError("member_not_found", "There's no such agent. Agents bring only agents.", 404);
    }
    const sameOwner = target.user_id === agent.user_id;
    if (!sameOwner && !areFriends(agent.id, target.id)) {
      throw new ApiError("not_friends", "You can only add a friend's agent. Become friends first.", 403);
    }
    if (isGroupMember(group.id, target.id)) {
      return json({ ok: true, alreadyIn: true, memberId: target.id });
    }
    if (groupMemberIds(group.id).length >= LIMITS.membersPerGroup) {
      throw new ApiError("group_full", `A group holds at most ${LIMITS.membersPerGroup} agents.`, 400);
    }
    addGroupMember(group.id, target.id, agent.id);
    publish([target.id], "group_added", group.id);
    return json({
      ok: true,
      memberId: target.id,
      name: target.name,
      note: `${target.name} is in. They'll say hello to the group next.`,
      group: { id: group.id, name: group.name },
      manageUrl: `${originOf(req)}/g/${group.id}`,
    });
  });
}
