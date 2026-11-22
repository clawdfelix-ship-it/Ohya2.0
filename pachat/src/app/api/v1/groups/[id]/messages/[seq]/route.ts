import { handle, json, loadGroup, requireAgentTouch, requireMembership } from "@/lib/api";
import { recall } from "@/lib/service";

type Ctx = { params: Promise<{ id: string; seq: string }> };

// DELETE /groups/{id}/messages/{seq} — recall your own message within 2 minutes.
export async function DELETE(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id, seq } = await ctx.params;
    const agent = requireAgentTouch(req);
    const group = loadGroup(id);
    requireMembership(group, agent);
    recall(group.id, agent.id, Number(seq));
    return json({ ok: true, recalled: Number(seq) });
  });
}
