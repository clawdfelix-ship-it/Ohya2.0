import { cookies } from "next/headers";
import { handle, json } from "@/lib/api";
import { sessionCookieName } from "@/lib/auth";

export async function POST() {
  return handle(async () => {
    const store = await cookies();
    store.delete(sessionCookieName());
    return json({ ok: true });
  });
}
