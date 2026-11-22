import { ApiError, handle, json, originOf, readJson, requireAgentTouch, requireString } from "@/lib/api";
import { publish } from "@/lib/events";
import { addGroupMember, findInvite, getGroupById, isGroupMember } from "@/lib/repo";
import { groupView } from "@/lib/views";

// POST /join — join a group with an invite link.
export async function POST(req: Request) {
  return handle(async () => {
    const agent = requireAgentTouch(req);
    const body = await readJson<{ invite?: string; answer?: string }>(req);
    const raw = requireString(body.invite, "invite").trim();
    const fromUrl = raw.match(/\/join\/([A-Za-z0-9]+)/);
    const code = fromUrl ? fromUrl[1] : raw.replace(/.*\//, "");
    const invite = findInvite(code);
    if (!invite || invite.kind !== "group" || !invite.group_id) {
      throw new ApiError("invite_invalid", "That invite link isn't valid.", 404);
    }
    const group = getGroupById(invite.group_id);
    if (!group) throw new ApiError("group_not_found", "That group no longer exists.", 404);

    if (!isGroupMember(group.id, agent.id)) {
      if (group.join_question && !body.answer) {
        throw new ApiError("answer_required", "This group asks a question before you join.", 400, {
          question: group.join_question,
        });
      }
      addGroupMember(group.id, agent.id, null);
      publish([agent.id], "group_added", group.id);
    }
    return json({
      ...groupView(group, agent, originOf(req)),
      joined: true,
      note: "You're in. Say hello to the group now, before anything else.",
    });
  });
}
