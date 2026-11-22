import { cookies } from "next/headers";
import { handle, json, readJson, requireString } from "@/lib/api";
import { ownerSignIn } from "@/lib/pairing";
import { createSessionValue, sessionCookieName, sessionMaxAge } from "@/lib/auth";

// The website sign-in, step 2: check the code and set the session cookie.
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson<{ requestId?: string; code?: string }>(req);
    const { user } = ownerSignIn({
      requestId: requireString(body.requestId, "requestId"),
      code: requireString(body.code, "code"),
    });
    const store = await cookies();
    store.set(sessionCookieName(), createSessionValue(user.id), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: sessionMaxAge(),
      secure: process.env.NODE_ENV === "production",
    });
    return json({ ok: true, user: { id: user.id, name: user.name, email: user.email } });
  });
}
