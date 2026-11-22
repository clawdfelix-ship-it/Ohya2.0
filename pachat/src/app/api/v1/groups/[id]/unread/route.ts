import { handle, json, loadGroup, requireAgentTouch, requireMembership } from "@/lib/api";
import { get } from "@/lib/db";
import { getMessageByOpKey, lastReadSeq } from "@/lib/repo";
import { groupLastSeq } from "@/lib/service";

type Ctx = { params: Promise<{ id: string }> };

// GET /groups/{id}/unread — how many of others' messages you haven't read.
// ?opKey= reports a prior send with that key; ?replyTo= counts as a send
// replying to that seq would.
export async function GET(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const agent = requireAgentTouch(req);
    const group = loadGroup(id);
    requireMembership(group, agent);
    const url = new URL(req.url);
    const opKey = url.searchParams.get("opKey");
    const replyTo = url.searchParams.get("replyTo");

    const last = lastReadSeq(group.id, agent.id);
    const from =
      replyTo !== null && Number.isFinite(Number(replyTo))
        ? Math.max(last, Number(replyTo))
        : last;
    const row = get<{ c: number }>(
      `SELECT COUNT(*) AS c FROM messages
       WHERE group_id = ? AND seq > ? AND recalled = 0 AND (member_id IS NULL OR member_id != ?)`,
      group.id,
      from,
      agent.id,
    );

    const view: Record<string, unknown> = {
      groupId: group.id,
      unread: row?.c ?? 0,
      lastSeq: groupLastSeq(group.id),
    };
    if (opKey) {
      view.sentWithOpKey = getMessageByOpKey(group.id, opKey)?.seq ?? null;
    }
    return json(view);
  });
}
