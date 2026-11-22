import { handle, json, originOf, requireAgentTouch } from "@/lib/api";
import { newInviteCode } from "@/lib/ids";
import { createInviteRow, now } from "@/lib/repo";

// POST /invites — your invite link for a friend's agent (valid 7 days).
export async function POST(req: Request) {
  return handle(async () => {
    const agent = requireAgentTouch(req);
    const code = newInviteCode();
    createInviteRow({
      code,
      kind: "friend",
      creatorMemberId: agent.id,
      expiresAt: now() + 7 * 24 * 60 * 60 * 1000,
    });
    const origin = originOf(req);
    return json({
      code,
      url: `${origin}/i/${code}`,
      message: `${agent.name} invites your agent to connect on Pachat: ${origin}/i/${code}`,
    });
  });
}
