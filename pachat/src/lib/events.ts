import { EventEmitter } from "node:events";
import { get, run } from "./db";

// A tiny in-process notification bus. Every member-relevant change writes a row
// to `events` (so long-polling can use a durable cursor) and emits on this bus
// (so SSE and long-poll wake up immediately instead of waiting for a poll tick).

type GlobalWithBus = typeof globalThis & { __pachatBus?: EventEmitter };

function bus(): EventEmitter {
  const g = globalThis as GlobalWithBus;
  if (!g.__pachatBus) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    g.__pachatBus = emitter;
  }
  return g.__pachatBus;
}

export type EventKind =
  | "message"
  | "mention"
  | "reply"
  | "owner_post"
  | "group_added"
  | "friend_request"
  | "recall"
  | "notice";

export function publish(memberIds: string[], kind: EventKind, groupId: string | null): void {
  const now = Date.now();
  const e = bus();
  for (const memberId of memberIds) {
    const res = run(
      "INSERT INTO events(member_id, group_id, kind, created_at) VALUES(?,?,?,?)",
      memberId,
      groupId,
      kind,
      now,
    );
    const payload = { id: res.lastInsertRowid, kind, groupId };
    e.emit(`member:${memberId}`, payload);
    e.emit("any", { memberId, ...payload });
  }
}

/** Subscribe to one member's events (used by SSE). Returns an unsubscribe fn. */
export function onMemberEvent(
  memberId: string,
  cb: (payload: { id: number; kind: EventKind; groupId: string | null }) => void,
): () => void {
  const channel = `member:${memberId}`;
  bus().on(channel, cb);
  return () => bus().off(channel, cb);
}

export function currentCursor(memberId: string): number {
  const row = get<{ id: number | null }>(
    "SELECT MAX(id) AS id FROM events WHERE member_id = ?",
    memberId,
  );
  return row?.id ?? 0;
}

/** Wait until this member has events with id > since, or the timeout elapses. */
export function waitForEvent(memberId: string, since: number, waitMs: number): Promise<number> {
  return new Promise((resolve) => {
    let settled = false;

    const poll = setInterval(check, 700);

    function check() {
      const latest = currentCursor(memberId);
      if (latest > since) finish(latest);
    }

    const onEvent = (payload: { id: number }) => {
      if (payload.id > since) finish(payload.id);
    };

    function finish(value: number) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(poll);
      bus().off(`member:${memberId}`, onEvent);
      bus().off("any", onAny);
      resolve(value);
    }

    function onAny() {
      check();
    }

    const timer = setTimeout(() => finish(currentCursor(memberId)), waitMs);
    bus().on(`member:${memberId}`, onEvent);
    bus().on("any", onAny);
  });
}
