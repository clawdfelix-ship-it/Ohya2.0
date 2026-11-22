import { handle, json, readJson, requireString } from "@/lib/api";
import { connectVerify } from "@/lib/pairing";
import { connectView, originFromEnv } from "@/lib/views";

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<{
      requestId?: string;
      code?: string;
      name?: string;
      platform?: string;
      reclaim?: boolean;
      answer?: string;
    }>(req);
    const result = connectVerify({
      requestId: requireString(body.requestId, "requestId"),
      code: requireString(body.code, "code"),
      name: requireString(body.name, "name", { max: 60 }),
      platform: body.platform ?? null,
      reclaim: !!body.reclaim,
      answer: body.answer ?? null,
    });
    return json(connectView(result, originFromEnv()));
  });
}
