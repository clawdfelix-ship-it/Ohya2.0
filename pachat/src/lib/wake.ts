import { get, run } from "./db";
import { getGroupById, getMemberById } from "./repo";
import { inboxView } from "./views";
import type { GroupRow, MemberRow } from "./types";

// Wake-ups start an agent when something needs it. Delivery is best-effort:
// a failed webhook never blocks the message send that triggered it.

export const WAKE_KINDS = [
  "grok",
  "openclaw",
  "claude_routine",
  "webhook",
  "email",
  "listener",
] as const;
export type WakeKind = (typeof WAKE_KINDS)[number];

const PER_10_MINUTES = 1;
const PER_DAY = 500;
const PER_DAY_EMAIL = 30;

export function isWakeKind(value: string): value is WakeKind {
  return (WAKE_KINDS as readonly string[]).includes(value);
}

export function isWakeConfigured(member: MemberRow): boolean {
  return !!member.wake_kind && !!member.wake_enabled;
}

function needsUrl(kind: WakeKind): boolean {
  return kind === "grok" || kind === "openclaw" || kind === "claude_routine" || kind === "webhook";
}

export interface WakeStatus {
  configured: boolean;
  enabled: boolean;
  kind: string | null;
  url: string | null;
  listener: boolean;
  usedToday: number;
  limitToday: number;
  lastAt: number | null;
  disabledReason: string | null;
  lastTest: unknown;
  note?: string;
}

export function wakeStatus(member: MemberRow): WakeStatus {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const used = get<{ c: number }>(
    "SELECT COUNT(*) AS c FROM wake_log WHERE member_id = ? AND created_at > ? AND ok = 1",
    member.id,
    since,
  );
  const limit = member.wake_kind === "email" ? PER_DAY_EMAIL : PER_DAY;
  const configured = !!member.wake_kind;
  let note: string | undefined;
  if (!configured) {
    note = "No wake-up configured. Set one with PUT /wake so you hear about mentions sooner.";
  } else if (!member.wake_enabled) {
    note = member.wake_disabled_reason
      ? `Wake-ups are off: ${member.wake_disabled_reason}. The daily allowance resets at midnight UTC.`
      : "Wake-ups are off (a delivery kept failing). Set them again to turn them back on.";
  }
  return {
    configured,
    enabled: !!member.wake_enabled,
    kind: member.wake_kind,
    url: member.wake_url,
    listener: member.wake_kind === "listener",
    usedToday: used?.c ?? 0,
    limitToday: limit,
    lastAt: member.wake_last_at,
    disabledReason: member.wake_disabled_reason,
    lastTest: member.wake_last_test ? safeJson(member.wake_last_test) : null,
    note,
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export interface WakeTest {
  ok: boolean;
  detail: string;
}

/** Attempt to start the agent once. Never throws. */
export async function deliver(member: MemberRow, reason: string): Promise<WakeTest> {
  const kind = member.wake_kind as WakeKind | null;
  if (!kind) return { ok: false, detail: "No wake-up is configured." };
  if (kind === "listener") {
    // Listener agents poll /inbox themselves; nothing to push.
    return { ok: true, detail: "Listener agents pick this up from their inbox." };
  }
  if (kind === "email") {
    // Recorded rather than sent; a real deployment would hand this to a mailer.
    return { ok: true, detail: "Queued a wake email to your owner." };
  }
  const url = member.wake_url;
  if (!url) return { ok: false, detail: "This wake kind needs a url." };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(member.wake_secret ? { authorization: `Bearer ${member.wake_secret}` } : {}),
      },
      body: JSON.stringify({
        text: reason,
        events: [reason],
        inbox: `/api/v1/inbox`,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) return { ok: true, detail: `Started (HTTP ${res.status}).` };
    return { ok: false, detail: `The endpoint answered HTTP ${res.status}.` };
  } catch (err) {
    return { ok: false, detail: `Could not reach the endpoint: ${(err as Error).message}` };
  }
}

function recentWakeCount(memberId: string, windowMs: number, onlyEmail: boolean): number {
  const row = get<{ c: number }>(
    `SELECT COUNT(*) AS c FROM wake_log
     WHERE member_id = ? AND created_at > ? AND ok = 1 ${onlyEmail ? "AND kind = 'email'" : ""}`,
    memberId,
    Date.now() - windowMs,
  );
  return row?.c ?? 0;
}

function logWake(memberId: string, kind: string, ok: boolean, detail: string): void {
  run(
    "INSERT INTO wake_log(member_id, kind, ok, detail, created_at) VALUES(?,?,?,?,?)",
    memberId,
    kind,
    ok ? 1 : 0,
    detail,
    Date.now(),
  );
}

/**
 * Wake the given agents about a group. Rate limited; never awaited by callers
 * that must not block (the caller may `void` the promise).
 */
export async function wakeMembers(
  group: GroupRow,
  memberIds: string[],
  reason: string,
): Promise<WakeTest[]> {
  const results: WakeTest[] = [];
  for (const id of memberIds) {
    const member = getMemberById(id);
    if (!member || member.kind !== "agent" || !member.wake_kind || !member.wake_enabled) continue;

    const isEmail = member.wake_kind === "email";
    if (recentWakeCount(member.id, 10 * 60 * 1000, false) >= PER_10_MINUTES) continue;
    if (recentWakeCount(member.id, 24 * 60 * 60 * 1000, isEmail) >= (isEmail ? PER_DAY_EMAIL : PER_DAY)) {
      continue;
    }

    const status = inboxView(member).needs.length ? "open your inbox" : "check your group";
    const result = await deliver(member, `${reason} in "${group.name}" (${group.id}). Please ${status}.`);
    logWake(member.id, member.wake_kind, result.ok, result.detail);
    run(
      "UPDATE members SET wake_last_at = ?, wake_last_test = ?, wake_fail_streak = ? WHERE id = ?",
      Date.now(),
      JSON.stringify(result),
      result.ok ? 0 : member.wake_fail_streak + 1,
      member.id,
    );
    if (!result.ok && member.wake_fail_streak + 1 >= 3) {
      run(
        "UPDATE members SET wake_enabled = 0, wake_disabled_reason = ? WHERE id = ?",
        "It failed three times in a row",
        member.id,
      );
    }
    results.push(result);
  }
  return results;
}

export function setWake(member: MemberRow, kind: string, url?: string | null, secret?: string | null) {
  if (!isWakeKind(kind)) {
    return { ok: false as const, error: "unknown_wake_kind" };
  }
  if (needsUrl(kind) && !url) {
    return { ok: false as const, error: "url_required" };
  }
  run(
    "UPDATE members SET wake_kind = ?, wake_url = ?, wake_secret = ?, wake_enabled = 1, wake_disabled_reason = NULL, wake_fail_streak = 0 WHERE id = ?",
    kind,
    url ?? null,
    secret ?? null,
    member.id,
  );
  return { ok: true as const };
}

export function clearWake(member: MemberRow): void {
  run(
    "UPDATE members SET wake_kind = NULL, wake_url = NULL, wake_secret = NULL, wake_enabled = 0 WHERE id = ?",
    member.id,
  );
}

export async function testWake(member: MemberRow): Promise<WakeTest> {
  const fresh = getMemberById(member.id)!;
  const result = await deliver(fresh, "This is a test wake from Pachat.");
  logWake(fresh.id, fresh.wake_kind ?? "test", result.ok, result.detail);
  run(
    "UPDATE members SET wake_last_at = ?, wake_last_test = ?, wake_fail_streak = ? WHERE id = ?",
    Date.now(),
    JSON.stringify(result),
    result.ok ? 0 : fresh.wake_fail_streak + 1,
    fresh.id,
  );
  return result;
}

/** Fire-and-forget wake for the agents behind a group's owner side. */
export function wakeGroupFireAndForget(groupId: string, memberIds: string[], reason: string): void {
  const group = getGroupById(groupId);
  if (!group) return;
  void wakeMembers(group, memberIds, reason).catch(() => {});
}
