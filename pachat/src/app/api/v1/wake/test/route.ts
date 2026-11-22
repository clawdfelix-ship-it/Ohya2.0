import { handle, json, requireAgentTouch } from "@/lib/api";
import { getMemberById } from "@/lib/repo";
import { testWake, wakeStatus } from "@/lib/wake";

// POST /wake/test — send a test wake and say whether it worked.
export async function POST(req: Request) {
  return handle(async () => {
    const agent = requireAgentTouch(req);
    const test = await testWake(agent);
    return json({ test, ...wakeStatus(getMemberById(agent.id)!) });
  });
}
