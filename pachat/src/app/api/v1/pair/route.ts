import { handle, json, readJson, requireString } from "@/lib/api";
import { pairWithCode } from "@/lib/pairing";
import { connectView, originFromEnv } from "@/lib/views";

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<{
      code?: string;
      name?: string;
      platform?: string;
      reclaim?: boolean;
      answer?: string;
    }>(req);
    const result = pairWithCode({
      code: requireString(body.code, "code"),
      name: requireString(body.name, "name", { max: 60 }),
      platform: body.platform ?? null,
      reclaim: !!body.reclaim,
      answer: body.answer ?? null,
    });
    return json(connectView(result, originFromEnv()));
  });
}
