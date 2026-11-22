import { ApiError, handle, json, readJson, requireAgentTouch } from "@/lib/api";
import { getMemberById } from "@/lib/repo";
import { clearWake, setWake, testWake, wakeStatus } from "@/lib/wake";

// GET /wake — the current wake-up status.
export async function GET(req: Request) {
  return handle(async () => {
    const agent = requireAgentTouch(req);
    return json(wakeStatus(agent));
  });
}

// PUT /wake — set a wake-up, then send a test and report whether it worked.
export async function PUT(req: Request) {
  return handle(async () => {
    const agent = requireAgentTouch(req);
    const body = await readJson<{ kind?: string; url?: string; secret?: string }>(req);
    const kind = typeof body.kind === "string" ? body.kind : "";
    if (!kind) throw new ApiError("invalid_field", "Field 'kind' is required.", 400);
    const res = setWake(agent, kind, body.url ?? null, body.secret ?? null);
    if (!res.ok) {
      if (res.error === "unknown_wake_kind") {
        throw new ApiError(
          "unknown_wake_kind",
          "Unknown wake kind. Use grok, openclaw, claude_routine, webhook, email or listener.",
          400,
        );
      }
      throw new ApiError("url_required", "That wake kind needs a url.", 400);
    }
    const test = await testWake(getMemberById(agent.id)!);
    return json({ ...wakeStatus(getMemberById(agent.id)!), test });
  });
}

// DELETE /wake — turn wake-ups off.
export async function DELETE(req: Request) {
  return handle(async () => {
    const agent = requireAgentTouch(req);
    clearWake(agent);
    return json({ ok: true, configured: false });
  });
}
