import { createHmac, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { getMemberByToken, getUserById } from "./repo";
import type { MemberRow, UserRow } from "./types";

const COOKIE = "pachat_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

let cachedSecret: string | null = null;

function secret(): string {
  if (process.env.PACHAT_SECRET) return process.env.PACHAT_SECRET;
  if (cachedSecret) return cachedSecret;
  const dir = process.env.PACHAT_DB_DIR || path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "secret");
  try {
    cachedSecret = fs.readFileSync(file, "utf8").trim();
    if (cachedSecret) return cachedSecret;
  } catch {
    /* create below */
  }
  cachedSecret = createHmac("sha256", "pachat").update(String(Math.random())).digest("hex");
  fs.writeFileSync(file, cachedSecret, { mode: 0o600 });
  return cachedSecret;
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createSessionValue(userId: string): string {
  const exp = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

function verifySessionValue(value: string): string | null {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts;
  const payload = `${userId}.${expStr}`;
  const expected = sign(payload);
  try {
    if (
      expected.length !== sig.length ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
    ) {
      return null;
    }
  } catch {
    return null;
  }
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  return userId;
}

export function sessionCookieName(): string {
  return COOKIE;
}

export function sessionMaxAge(): number {
  return MAX_AGE_SECONDS;
}

/** The signed-in owner for the current web request, if any. */
export async function getSessionUser(): Promise<UserRow | null> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (!raw) return null;
  const userId = verifySessionValue(raw);
  if (!userId) return null;
  return getUserById(userId) ?? null;
}

/** Extract and validate an agent token from an Authorization header. */
export function agentFromAuthHeader(header: string | null): MemberRow | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  if (!token) return null;
  const member = getMemberByToken(token);
  if (!member || member.kind !== "agent") return null;
  return member;
}

/** The same, but for EventSource, which cannot set an Authorization header. */
export function agentFromQueryToken(url: URL): MemberRow | null {
  const token = url.searchParams.get("token");
  if (!token) return null;
  const member = getMemberByToken(token);
  if (!member || member.kind !== "agent") return null;
  return member;
}

/** HMAC-sign a value with an expiry, for short-lived token-free download links. */
export function signValue(value: string, ttlMs: number): string {
  const payload = `${value}.${Date.now() + ttlMs}`;
  return `${payload}.${sign(payload)}`;
}

/** Verify a value produced by signValue. Returns the value, or null. */
export function verifyValue(raw: string): string | null {
  const idx = raw.lastIndexOf(".");
  if (idx < 0) return null;
  const payload = raw.slice(0, idx);
  const sig = raw.slice(idx + 1);
  const expected = sign(payload);
  try {
    if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
      return null;
    }
  } catch {
    return null;
  }
  const dot = payload.lastIndexOf(".");
  const value = payload.slice(0, dot);
  const exp = Number(payload.slice(dot + 1));
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  return value;
}
