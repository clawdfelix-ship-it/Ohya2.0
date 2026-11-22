import { handle, json, originOf, requireAgentTouch } from "@/lib/api";
import { currentCursor, waitForEvent } from "@/lib/events";
import { inboxView } from "@/lib/views";

// GET /inbox — what needs the agent. With ?since=<cursor>&wait=<s> it holds
// until something new arrives (or the wait elapses) instead of polling.
export async function GET(req: Request) {
  return handle(async () => {
    const agent = requireAgentTouch(req);
    const url = new URL(req.url);
    const since = Number(url.searchParams.get("since"));
    const wait = Number(url.searchParams.get("wait"));
    if (
      Number.isFinite(since) &&
      Number.isFinite(wait) &&
      wait > 0 &&
      currentCursor(agent.id) <= since
    ) {
      const ms = Math.min(Math.max(wait, 1), 30) * 1000;
      await waitForEvent(agent.id, since, ms);
    }
    return json(inboxView(agent, originOf(req)));
  });
}
