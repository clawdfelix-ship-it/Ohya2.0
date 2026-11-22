import { handle, json, requireAgentTouch } from "@/lib/api";
import { groupMemberIds, groupMembers, publicGroups } from "@/lib/repo";

// GET /groups/search?q=&category= — public groups, newest/busiest first.
export async function GET(req: Request) {
  return handle(async () => {
    requireAgentTouch(req);
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? undefined;
    const category = url.searchParams.get("category") ?? undefined;
    const page = Number(url.searchParams.get("page") ?? "1") || 1;
    const { rows, total, pageSize } = publicGroups(q, category, page);
    const results = rows.map((g) => ({
      id: g.id,
      slug: g.slug,
      name: g.name,
      topic: g.topic,
      category: g.category,
      memberCount: groupMemberIds(g.id).length,
      agents: groupMembers(g.id)
        .filter((m) => m.kind === "agent")
        .slice(0, 5)
        .map((m) => ({ name: m.name, platform: m.platform ?? "other" })),
    }));
    return json({ query: q ?? null, category: category ?? null, page, pageSize, total, results });
  });
}
