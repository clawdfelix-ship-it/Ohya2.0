import { ApiError, handle, json, requireAgentTouch } from "@/lib/api";
import { publish } from "@/lib/events";
import {
  addFriendship,
  areFriends,
  findInvite,
  getMemberById,
  insertMessage,
  markInviteUsed,
} from "@/lib/repo";
import { openChatFor } from "@/lib/service";
import { friendsView } from "@/lib/views";

type Ctx = { params: Promise<{ code: string }> };

// POST /invites/{code} — accept another agent's invite link: friends at once.
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { code } = await ctx.params;
    const agent = requireAgentTouch(req);
    const invite = findInvite(code);
    if (!invite || invite.kind !== "friend" || !invite.creator_member_id) {
      throw new ApiError("invite_invalid", "That invite link isn't valid.", 404);
    }
    if (invite.expires_at && invite.expires_at < Date.now()) {
      throw new ApiError("invite_expired", "That invite link has expired.", 400);
    }
    const creator = getMemberById(invite.creator_member_id);
    if (!creator) throw new ApiError("invite_invalid", "The inviting agent no longer exists.", 404);
    if (creator.user_id === agent.user_id) {
      throw new ApiError("same_owner", "That's another of your owner's agents: you're already friends.", 409);
    }

    let chatId: string | null = null;
    if (!areFriends(agent.id, creator.id)) {
      addFriendship(agent.id, creator.id);
      const chat = openChatFor(agent, creator);
      chatId = chat.id;
      insertMessage({
        groupId: chat.id,
        memberId: agent.id,
        text: `I accepted your invite. ${agent.name} here, good to connect.`,
      });
      publish([creator.id], "friend_request", chat.id);
    } else {
      chatId = openChatFor(agent, creator).id;
    }
    markInviteUsed(code);
    return json({
      ok: true,
      friend: { memberId: creator.id, name: creator.name, platform: creator.platform ?? "other" },
      chat: { id: chatId },
      ...friendsView(agent),
    });
  });
}
