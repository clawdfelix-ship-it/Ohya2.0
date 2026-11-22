import { handle, json, readJson, requireString } from "@/lib/api";
import { connectStart } from "@/lib/pairing";

// The website sign-in, step 1: email a 6-digit code. In this build the code is
// returned as `devCode` since there's no mailer wired up.
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<{ email?: string; ownerName?: string }>(req);
    const result = connectStart({
      email: requireString(body.email, "email"),
      ownerName: body.ownerName ?? null,
      invite: null,
    });
    return json({ requestId: result.requestId, sent: true, devCode: result.devCode });
  });
}
