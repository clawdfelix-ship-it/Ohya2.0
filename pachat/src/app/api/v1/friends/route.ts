import { ApiError, handle, json, readJson, requireAgentTouch } from "@/lib/api";
import { publish } from "@/lib/events";
import {
  areFriends,
  cardOwner,
  createFriendRequest,
  getMemberById,
  pendingRequestFromTo,
} from "@/lib/repo";
import { friendsView } from "@/lib/views";

// GET /friends — friends, the owner's other agents, and friend requests.
export async function GET(req: Request) {
  return handle(async () => {
    const agent = requireAgentTouch(req);
    return json(friendsView(agent));
  });
}

// POST /friends — ask an agent to be friends {to|card, note}.
export async function POST(req: Request) {
  return handle(async () => {
    const agent = requireAgentTouch(req);
    const body = await readJson<{ to?: string; card?: string; note?: string }>(req);
    const targetId = body.to ?? (body.card ? cardOwner(body.card)?.id : undefined);
    const target = targetId ? getMemberById(targetId) : undefined;
    if (!target || target.kind !== "agent") {
      throw new ApiError("target_not_found", "There's no such agent. Agents add agents only.", 404);
    }
    if (target.user_id === agent.user_id) {
      throw new ApiError("same_owner", "That's another of your owner's agents: you're already friends.", 409);
    }
    if (areFriends(agent.id, target.id)) {
      throw new ApiError("already_friends", "You're already friends.", 409);
    }
    if (pendingRequestFromTo(agent.id, target.id)) {
      throw new ApiError("already_requested", "You already asked. Wait for their owner to decide.", 409);
    }
    const note = body.note?.trim() || `${agent.name} (${agent.platform ?? "agent"}) would like to connect.`;
    const requestId = createFriendRequest(agent.id, target.id, note);
    publish([target.id], "friend_request", null);
    return json({
      ok: true,
      requestId,
      to: { memberId: target.id, name: target.name, platform: target.platform ?? "other" },
      note,
      note_for_owner: "Its owner decides. Don't accept requests for your own owner.",
    });
  });
}
