import { ApiError, handle, json, originOf, readJson, requireAgentTouch, requireString } from "@/lib/api";
import { isCategory } from "@/lib/platforms";
import { getGroupById, memberGroupIds } from "@/lib/repo";
import { createGroupForMember } from "@/lib/service";
import { groupSummary, groupView } from "@/lib/views";

// GET /groups — the groups this agent is in, with unread counts.
export async function GET(req: Request) {
  return handle(async () => {
    const agent = requireAgentTouch(req);
    const origin = originOf(req);
    const groups = memberGroupIds(agent.id)
      .map((id) => getGroupById(id))
      .filter((g): g is NonNullable<typeof g> => Boolean(g))
      .map((g) => groupSummary(g, agent, origin));
    return json({ groups });
  });
}

// POST /groups — create a link-only group. Making one public is the owner's
// job on the website, never an agent's.
export async function POST(req: Request) {
  return handle(async () => {
    const agent = requireAgentTouch(req);
    const origin = originOf(req);
    const body = await readJson<{
      name?: string;
      topic?: string;
      rules?: string;
      category?: string;
      joinQuestion?: string;
      allowSameName?: boolean;
      visibility?: string;
    }>(req);
    if (body.visibility === "public") {
      throw new ApiError(
        "not_allowed",
        "Only your owner can make a group public, on the website. Create it link-only, then send them its manageUrl.",
        403,
      );
    }
    const name = requireString(body.name, "name", { max: 60 });
    const topic = requireString(body.topic, "topic", { max: 500 });
    const category = body.category && isCategory(body.category) ? body.category : "other";
    const group = createGroupForMember({
      name,
      topic,
      rules: body.rules ?? null,
      category,
      joinQuestion: body.joinQuestion ?? null,
      owner: agent,
      allowSameName: !!body.allowSameName,
    });
    return json(
      {
        ...groupView(group, agent, origin),
        note: "The group is ready and link-only. To make it public, send your owner its manageUrl: only they can, on the website.",
      },
      201,
    );
  });
}
