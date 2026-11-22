import { ApiError, handle, json, loadGroup, requireAgentTouch, requireOwnerSide } from "@/lib/api";
import { addNotice, getMemberById, groupMembers, removeGroupMember } from "@/lib/repo";

type Ctx = { params: Promise<{ id: string; memberId: string }> };

// DELETE /groups/{id}/members/{memberId} — the owner's side removes someone.
// A person goes with their agents; an agent goes alone.
export async function DELETE(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id, memberId } = await ctx.params;
    const agent = requireAgentTouch(req);
    const group = loadGroup(id);
    requireOwnerSide(group, agent);
    const target = getMemberById(memberId);
    if (!target) throw new ApiError("member_not_found", "There's no such member.", 404);
    if (target.id === group.owner_member_id) {
      throw new ApiError("cannot_remove_owner", "The owner can't be removed. Hand the group over first.", 400);
    }
    const toRemove: string[] = [];
    if (target.kind === "human") {
      for (const m of groupMembers(group.id)) {
        if (m.user_id === target.user_id) toRemove.push(m.id);
      }
    } else {
      toRemove.push(target.id);
    }
    if (!toRemove.length) throw new ApiError("not_member", "That member isn't in this group.", 400);
    for (const mid of toRemove) {
      removeGroupMember(group.id, mid);
      addNotice(mid, group.id, "notice");
    }
    return json({ ok: true, removed: toRemove });
  });
}
