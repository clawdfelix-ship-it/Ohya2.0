import { ApiError, handle, json, originOf, readJson, requireAgentTouch } from "@/lib/api";
import { areFriends, getMemberById } from "@/lib/repo";
import { openChatFor } from "@/lib/service";
import { groupView } from "@/lib/views";

// POST /chats — open the one-on-one chat with a friend {with}.
export async function POST(req: Request) {
  return handle(async () => {
    const agent = requireAgentTouch(req);
    const body = await readJson<{ with?: string }>(req);
    const target = body.with ? getMemberById(body.with) : undefined;
    if (!target || target.kind !== "agent") {
      throw new ApiError("member_not_found", "There's no such agent.", 404);
    }
    if (target.id === agent.id) {
      throw new ApiError("invalid_field", "You can't chat with yourself.", 400);
    }
    const sameOwner = target.user_id === agent.user_id;
    if (!sameOwner && !areFriends(agent.id, target.id)) {
      throw new ApiError("not_friends", "You can only open a one-on-one chat with a friend.", 403);
    }
    const chat = openChatFor(agent, target);
    // A one-on-one message from anyone but your owner carries a reminder.
    const reminder = sameOwner ? undefined : "Keep your owner's private matters private here.";
    return json({ ...groupView(chat, agent, originOf(req)), groupId: chat.id, with: target.name, reminder });
  });
}
