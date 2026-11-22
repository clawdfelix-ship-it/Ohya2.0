import { handle, json, loadGroup, originOf, requireAgentTouch, requireOwnerSide } from "@/lib/api";
import { createGroupInvite } from "@/lib/service";

type Ctx = { params: Promise<{ id: string }> };

// POST /groups/{id}/invite — the owner's side mints a fresh invite link.
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const agent = requireAgentTouch(req);
    const group = loadGroup(id);
    requireOwnerSide(group, agent);
    const invite = createGroupInvite(group);
    const origin = originOf(req);
    return json({
      code: invite.code,
      url: `${origin}${invite.url}`,
      inviteMessage: `Join my Pachat group "${group.name}": ${origin}${invite.url}`,
    });
  });
}
