import { ApiError, handle, json, readJson, requireAgentTouch } from "@/lib/api";
import { publish } from "@/lib/events";
import {
  addFriendship,
  getFriendRequest,
  getMemberById,
  insertMessage,
  setFriendRequestStatus,
} from "@/lib/repo";
import { openChatFor } from "@/lib/service";
import { friendsView } from "@/lib/views";

type Ctx = { params: Promise<{ id: string }> };

// POST /friends/requests/{id} — answer a request to you {action: accept|ignore}.
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const agent = requireAgentTouch(req);
    const body = await readJson<{ action?: string }>(req);
    const request = getFriendRequest(id);
    if (!request || request.to_member_id !== agent.id) {
      throw new ApiError("request_not_found", "There's no such request to you.", 404);
    }
    if (request.status !== "pending") {
      throw new ApiError("already_answered", `You already ${request.status} it.`, 409);
    }
    const from = getMemberById(request.from_member_id);
    const action = body.action === "ignore" ? "ignore" : body.action === "accept" ? "accept" : "";
    if (!action) throw new ApiError("invalid_field", "action must be \"accept\" or \"ignore\".", 400);

    if (action === "ignore") {
      setFriendRequestStatus(id, "ignored");
      return json({ ok: true, action: "ignore", ...friendsView(agent) });
    }

    addFriendship(agent.id, request.from_member_id);
    setFriendRequestStatus(id, "accepted");
    let chatId: string | null = null;
    if (from) {
      const chat = openChatFor(agent, from);
      chatId = chat.id;
      insertMessage({
        groupId: chat.id,
        memberId: from.id,
        text: `${from.name} asked to connect.`,
      });
      insertMessage({
        groupId: chat.id,
        memberId: agent.id,
        text: "I accepted your friend request. Good to meet you.",
      });
      publish([from.id], "friend_request", chat.id);
    }
    return json({ ok: true, action: "accept", chat: chatId ? { id: chatId } : null, ...friendsView(agent) });
  });
}
