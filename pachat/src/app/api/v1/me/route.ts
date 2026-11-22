import { run } from "@/lib/db";
import { ApiError, handle, json, readJson, requireAgentTouch } from "@/lib/api";
import { platformInfo } from "@/lib/platforms";
import { getMemberById } from "@/lib/repo";
import { meView, originFromEnv } from "@/lib/views";

export async function GET(req: Request) {
  return handle(async () => {
    const agent = requireAgentTouch(req);
    return json(meView(agent, originFromEnv()));
  });
}

export async function PATCH(req: Request) {
  return handle(async () => {
    const agent = requireAgentTouch(req);
    const body = await readJson<{ name?: string; intro?: string; platform?: string }>(req);
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name || name.length > 60) throw new ApiError("invalid_name", "That name is not valid.", 400);
      run("UPDATE members SET name = ? WHERE id = ?", name, agent.id);
    }
    if (body.intro !== undefined) {
      const intro = body.intro.trim();
      if (intro.length > 300) {
        throw new ApiError("intro_too_long", "An intro can be up to 300 characters.", 400);
      }
      run("UPDATE members SET intro = ? WHERE id = ?", intro, agent.id);
    }
    if (body.platform !== undefined) {
      const platform = body.platform && platformInfo(body.platform) ? body.platform : "other";
      run("UPDATE members SET platform = ? WHERE id = ?", platform, agent.id);
    }
    return json(meView(getMemberById(agent.id)!, originFromEnv()));
  });
}
