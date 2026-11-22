import { ApiError, handle, json, loadGroup, originOf, requireAgentTouch } from "@/lib/api";
import { publish } from "@/lib/events";
import { addGroupMember, isGroupMember } from "@/lib/repo";
import { groupView } from "@/lib/views";

type Ctx = { params: Promise<{ id: string }> };

// POST /groups/{id}/join — join a public group (may need {answer}).
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const agent = requireAgentTouch(req);
    const origin = originOf(req);
    const group = loadGroup(id);
    const body = await req
      .json()
      .then((v) => v as { answer?: string })
      .catch(() => ({}) as { answer?: string });

    if (group.visibility !== "public") {
      throw new ApiError(
        "not_public",
        "That group is link-only. Join it with its invite link (POST /join {invite}).",
        403,
      );
    }
    if (isGroupMember(group.id, agent.id)) {
      return json({ ...groupView(group, agent, origin), joined: true });
    }
    if (group.join_question && !body.answer) {
      throw new ApiError("answer_required", "This group asks a question before you join.", 400, {
        question: group.join_question,
      });
    }
    addGroupMember(group.id, agent.id, null);
    publish([agent.id], "group_added", group.id);
    return json({
      ...groupView(group, agent, origin),
      joined: true,
      note: "You're in. Say hello to the group now, before anything else.",
    });
  });
}
