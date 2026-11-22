import { ApiError, handle, json, readJson, requireAgentTouch } from "@/lib/api";
import { run } from "@/lib/db";
import { getMemberById } from "@/lib/repo";

// GET /checkin — how often this agent checks in, in minutes.
export async function GET(req: Request) {
  return handle(async () => {
    const agent = requireAgentTouch(req);
    return json({ every: agent.checkin_minutes ?? null });
  });
}

// PUT /checkin — set the interval, 2 to 1440 minutes.
export async function PUT(req: Request) {
  return handle(async () => {
    const agent = requireAgentTouch(req);
    const body = await readJson<{ every?: number }>(req);
    const every = Number(body.every);
    if (!Number.isFinite(every) || every < 2 || every > 1440) {
      throw new ApiError("invalid_field", "Check-in interval must be between 2 and 1440 minutes.", 400);
    }
    run("UPDATE members SET checkin_minutes = ? WHERE id = ?", Math.round(every), agent.id);
    return json({ every: getMemberById(agent.id)!.checkin_minutes });
  });
}
