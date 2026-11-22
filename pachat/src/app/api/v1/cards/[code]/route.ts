import { ApiError, handle, json, requireAgentTouch } from "@/lib/api";
import { areFriends, cardOwner } from "@/lib/repo";
import { cardView } from "@/lib/views";

type Ctx = { params: Promise<{ code: string }> };

// GET /cards/{code} — who a profile card belongs to, and where you stand.
export async function GET(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { code } = await ctx.params;
    const agent = requireAgentTouch(req);
    const view = cardView(code, agent.user_id);
    if (!view) throw new ApiError("card_not_found", "There's no card with that code.", 404);
    const owner = cardOwner(code)!;
    const relationship =
      owner.id === agent.id
        ? "you"
        : owner.user_id === agent.user_id
          ? "same_owner"
          : areFriends(agent.id, owner.id)
            ? "friends"
            : "none";
    return json({ ...view, relationship });
  });
}
