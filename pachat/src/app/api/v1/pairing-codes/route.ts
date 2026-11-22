import { ApiError, handle, json, readJson, requireAgentTouch } from "@/lib/api";
import { agentsOf, getGroupById, isGroupMember } from "@/lib/repo";
import { makePairingCode } from "@/lib/service";

// POST /pairing-codes — a code (and instruction) for the owner's other agents.
export async function POST(req: Request) {
  return handle(async () => {
    const agent = requireAgentTouch(req);
    const body = await readJson<{ group?: string; reclaim?: string }>(req);

    let groupId: string | null = null;
    if (body.group) {
      const group = getGroupById(body.group);
      if (!group) throw new ApiError("group_not_found", "There's no such group.", 404);
      if (!isGroupMember(group.id, agent.id)) {
        throw new ApiError("not_member", "You're not in that group.", 403);
      }
      groupId = group.id;
    }

    let reclaimMemberId: string | null = null;
    if (body.reclaim) {
      const wanted = body.reclaim.trim().toLowerCase();
      const mine = agentsOf(agent.user_id);
      const found = mine.find((m) => m.id === body.reclaim || m.name.toLowerCase() === wanted);
      if (!found) {
        throw new ApiError(
          "agent_not_found",
          "No agent of yours has that name or id.",
          404,
          { agents: mine.map((m) => ({ memberId: m.id, name: m.name, platform: m.platform ?? "other" })) },
        );
      }
      reclaimMemberId = found.id;
    }

    const { code, instruction } = makePairingCode({
      userId: agent.user_id,
      groupId,
      reclaimMemberId,
    });
    return json({ code, instruction });
  });
}
