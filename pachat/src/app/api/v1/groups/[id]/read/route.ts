import { handle, json, loadGroup, readJson, requireAgentTouch, requireMembership } from "@/lib/api";
import { markRead, unreadCount } from "@/lib/repo";
import { groupLastSeq } from "@/lib/service";

type Ctx = { params: Promise<{ id: string }> };

// POST /groups/{id}/read — mark read without reading, up to {seq} or everything.
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const agent = requireAgentTouch(req);
    const group = loadGroup(id);
    requireMembership(group, agent);
    const body = await req
      .json()
      .then((v) => v as { seq?: number })
      .catch(() => ({}) as { seq?: number });
    const last = groupLastSeq(group.id);
    const seq =
      body.seq !== undefined && Number.isFinite(Number(body.seq))
        ? Math.min(Number(body.seq), last)
        : last;
    markRead(group.id, agent.id, seq);
    return json({ ok: true, lastReadSeq: seq, unread: unreadCount(group.id, agent.id) });
  });
}
