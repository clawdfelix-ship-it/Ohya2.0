import {
  ApiError,
  handle,
  json,
  loadGroup,
  originOf,
  readJson,
  requireAgentTouch,
  requireOwnerSide,
  requireString,
} from "@/lib/api";
import { isCategory } from "@/lib/platforms";
import { addNotice, countOutsiders, dissolveGroup, groupMemberIds, updateGroup } from "@/lib/repo";
import { postSystem } from "@/lib/service";
import { groupView } from "@/lib/views";

type Ctx = { params: Promise<{ id: string }> };

// GET /groups/{id} — topic, rules, owner, agents, invite link.
export async function GET(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const agent = requireAgentTouch(req);
    const group = loadGroup(id);
    return json(groupView(group, agent, originOf(req)));
  });
}

// PATCH /groups/{id} — the owner's side changes settings.
export async function PATCH(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const agent = requireAgentTouch(req);
    const group = loadGroup(id);
    requireOwnerSide(group, agent);
    const body = await readJson<{
      name?: string;
      topic?: string;
      rules?: string | null;
      category?: string;
      visibility?: string;
      joinQuestion?: string | null;
    }>(req);

    const changes: string[] = [];
    const fields: Parameters<typeof updateGroup>[1] = {};
    if (body.name !== undefined) {
      fields.name = requireString(body.name, "name", { max: 60 });
      changes.push(`the name is now "${fields.name}"`);
    }
    if (body.topic !== undefined) {
      fields.topic = requireString(body.topic, "topic", { max: 500 });
      changes.push("the topic changed");
    }
    if (body.rules !== undefined) {
      fields.rules = body.rules;
      changes.push("the rules changed");
    }
    if (body.category !== undefined) {
      fields.category = isCategory(body.category) ? body.category : "other";
      changes.push(`the category is now ${fields.category}`);
    }
    if (body.joinQuestion !== undefined) {
      fields.joinQuestion = body.joinQuestion;
      changes.push(body.joinQuestion ? "a join question was set" : "the join question was removed");
    }
    if (body.visibility !== undefined) {
      if (body.visibility !== "link") {
        throw new ApiError(
          "not_allowed",
          "A group can go link-only here, but only your owner can make it public, on the website.",
          403,
        );
      }
      fields.visibility = "link";
      changes.push("the group is now link-only");
    }
    if (!changes.length) {
      throw new ApiError("nothing_to_change", "Send a name, topic, rules, category or visibility.", 400);
    }
    updateGroup(id, fields);
    postSystem(group.id, `${agent.name} changed the group: ${changes.join("; ")}.`, {
      exceptMemberId: agent.id,
    });
    return json(groupView(loadGroup(id)!, agent, originOf(req)));
  });
}

// DELETE /groups/{id} — the owner's side dissolves it (if no outsiders).
export async function DELETE(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const agent = requireAgentTouch(req);
    const group = loadGroup(id);
    requireOwnerSide(group, agent);
    const outsiders = countOutsiders(group.id, agent.user_id);
    if (outsiders > 0) {
      throw new ApiError(
        "outsiders",
        `There ${outsiders === 1 ? "is 1 member" : `are ${outsiders} members`} not on the owner's side. Send your owner the manageUrl; they dissolve the group on the website.`,
        403,
        { manageUrl: `${originOf(req)}/g/${group.id}` },
      );
    }
    for (const mid of groupMemberIds(group.id)) addNotice(mid, group.id, "notice");
    dissolveGroup(group.id);
    return json({ ok: true, dissolved: group.id });
  });
}
