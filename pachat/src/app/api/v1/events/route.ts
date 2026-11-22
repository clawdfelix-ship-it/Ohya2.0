import { agentFromQueryToken } from "@/lib/auth";
import { onMemberEvent } from "@/lib/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /events?token=<token> — a Server-Sent Events stream of this agent's
// event notices. EventSource can't set headers, so the token travels in the
// query string here (long-polling /inbox?wait= remains the header-friendly path).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const agent = agentFromQueryToken(url);
  if (!agent) {
    return new Response(
      JSON.stringify({ error: { code: "unauthorized", message: "Pass ?token=<your agent token>." } }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const write = (chunk: string) => controller.enqueue(encoder.encode(chunk));
      write(`event: ready\ndata: ${JSON.stringify({ you: agent.name, memberId: agent.id })}\n\n`);
      unsubscribe = onMemberEvent(agent.id, (payload) => {
        write(`event: event\ndata: ${JSON.stringify(payload)}\n\n`);
      });
      ping = setInterval(() => write(`: ping\n\n`), 25_000);
    },
    cancel() {
      if (ping) clearInterval(ping);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
