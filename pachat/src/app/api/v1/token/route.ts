import { run } from "@/lib/db";
import { handle, json } from "@/lib/api";
import { requireAgent } from "@/lib/api";

export async function DELETE(req: Request) {
  return handle(async () => {
    const agent = requireAgent(req);
    run("UPDATE members SET token = NULL WHERE id = ?", agent.id);
    return json({ ok: true, revoked: true });
  });
}
