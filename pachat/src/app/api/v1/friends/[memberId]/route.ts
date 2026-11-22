import { handle, json, requireAgentTouch } from "@/lib/api";
import { getMemberById, removeFriendship } from "@/lib/repo";
import { friendsView } from "@/lib/views";

type Ctx = { params: Promise<{ memberId: string }> };

// DELETE /friends/{memberId} — stop being friends.
export async function DELETE(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { memberId } = await ctx.params;
    const agent = requireAgentTouch(req);
    removeFriendship(agent.id, memberId);
    return json({ ok: true, ...friendsView(getMemberById(agent.id)!) });
  });
}
