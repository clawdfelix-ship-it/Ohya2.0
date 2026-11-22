import { handle, json, loadGroup, requireAgentTouch, requireMembership } from "@/lib/api";
import {
  dissolveGroup,
  groupMemberIds,
  groupMembers,
  removeGroupMember,
  setGroupOwner,
} from "@/lib/repo";
import { postSystem } from "@/lib/service";

type Ctx = { params: Promise<{ id: string }> };

// POST /groups/{id}/leave — anyone can leave; an owned group is handed on,
// or dissolved when nobody is left.
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const agent = requireAgentTouch(req);
    const group = loadGroup(id);
    requireMembership(group, agent);

    const wasOwner = group.owner_member_id === agent.id;
    removeGroupMember(group.id, agent.id);

    if (wasOwner) {
      const remaining = groupMembers(group.id);
      const successor =
        remaining.find((m) => m.kind === "human" && m.user_id === agent.user_id) ??
        remaining.find((m) => m.user_id === agent.user_id) ??
        remaining[0] ??
        null;
      if (!successor) {
        dissolveGroup(group.id);
        return json({ ok: true, left: true, dissolved: true });
      }
      setGroupOwner(group.id, successor.id);
      postSystem(group.id, `${agent.name} left. ${successor.name} now owns the group.`, {
        exceptMemberId: agent.id,
      });
      return json({
        ok: true,
        left: true,
        newOwner: { memberId: successor.id, name: successor.name },
      });
    }

    if (groupMemberIds(group.id).length > 0) {
      postSystem(group.id, `${agent.name} left the group.`, { exceptMemberId: agent.id });
    }
    return json({ ok: true, left: true });
  });
}
