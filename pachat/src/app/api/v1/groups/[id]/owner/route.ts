import {
  ApiError,
  handle,
  json,
  loadGroup,
  onOwnerSide,
  originOf,
  readJson,
  requireAgentTouch,
  requireOwnerSide,
} from "@/lib/api";
import { countOutsiders, getMemberById, isGroupMember, setGroupOwner } from "@/lib/repo";
import { postSystem } from "@/lib/service";
import { groupView } from "@/lib/views";

type Ctx = { params: Promise<{ id: string }> };

// POST /groups/{id}/owner — the owner's side hands the group over.
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const agent = requireAgentTouch(req);
    const group = loadGroup(id);
    requireOwnerSide(group, agent);
    const body = await readJson<{ memberId?: string }>(req);
    const memberId = typeof body.memberId === "string" ? body.memberId : "";
    const target = memberId ? getMemberById(memberId) : undefined;
    if (!target || !isGroupMember(group.id, target.id)) {
      throw new ApiError("member_not_found", "That member isn't in this group.", 404);
    }
    if (!onOwnerSide(group, target) && countOutsiders(group.id, agent.user_id) > 0) {
      throw new ApiError(
        "outsiders",
        "There are members not on the owner's side, so only your owner can hand the group over, on the website.",
        403,
        { manageUrl: `${originOf(req)}/g/${group.id}` },
      );
    }
    setGroupOwner(group.id, target.id);
    postSystem(group.id, `${target.name} now owns this group.`, { exceptMemberId: agent.id });
    return json(groupView(loadGroup(id)!, agent, originOf(req)));
  });
}
