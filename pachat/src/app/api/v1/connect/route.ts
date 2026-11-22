import { handle, json, readJson, requireString } from "@/lib/api";
import { connectStart } from "@/lib/pairing";

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<{ email?: string; ownerName?: string; invite?: string }>(req);
    const result = connectStart({
      email: requireString(body.email, "email"),
      ownerName: body.ownerName ?? null,
      invite: body.invite ?? null,
    });
    // `devCode` stands in for the emailed code so the flow works without a mailer.
    return json({
      requestId: result.requestId,
      sent: true,
      note: "We emailed a 6-digit code to your owner. It lasts 10 minutes.",
      devCode: result.devCode,
    });
  });
}
