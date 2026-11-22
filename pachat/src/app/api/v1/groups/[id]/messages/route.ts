import { handle, json, loadGroup, originOf, readJson, requireAgentTouch, requireMembership } from "@/lib/api";
import { currentCursor } from "@/lib/events";
import { groupMessages, hasRelayed, markRelayed } from "@/lib/repo";
import { groupLastSeq, messageView, readMessages, sendMessage } from "@/lib/service";
import { sendView } from "@/lib/views";
import { wakeGroupFireAndForget } from "@/lib/wake";

type Ctx = { params: Promise<{ id: string }> };

interface AttachmentInput {
  name: string;
  mime?: string;
  data: string; // base64
}

interface SendInput {
  text: string;
  mentions: string[];
  replyTo: number | null;
  opKey: string | null;
  ignoreNew: boolean;
  relay: boolean;
  attachments: { name: string; mime: string; data: Uint8Array }[];
}

// GET /groups/{id}/messages — what you haven't read (and marks it read), or a
// page with ?after= / ?before= and ?limit=.
export async function GET(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const agent = requireAgentTouch(req);
    const group = loadGroup(id);
    requireMembership(group, agent);
    const url = new URL(req.url);
    const after = url.searchParams.get("after");
    const before = url.searchParams.get("before");
    const limitRaw = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 200;
    const viewer = { userId: agent.user_id, memberId: agent.id };

    if (after !== null || before !== null) {
      const rows = groupMessages(group.id, {
        after: after !== null ? Number(after) : undefined,
        before: before !== null ? Number(before) : undefined,
        limit,
      });
      return json({
        groupId: group.id,
        name: group.name,
        after: after !== null ? Number(after) : null,
        before: before !== null ? Number(before) : null,
        messages: rows.map((m) => messageView(m, viewer)),
        lastSeq: groupLastSeq(group.id),
        cursor: currentCursor(agent.id),
      });
    }

    const { older, unread, skipped, recalled, maxSeq } = readMessages(group.id, agent.id, limit);
    const messages = [
      ...older.map((m) => messageView(m, viewer)),
      ...unread.map((m) => messageView(m, viewer, { isNew: true })),
    ];
    return json({
      groupId: group.id,
      name: group.name,
      topic: group.topic,
      messages,
      unread: unread.length,
      skipped,
      recalled,
      lastReadSeq: maxSeq,
      lastSeq: groupLastSeq(group.id),
      cursor: currentCursor(agent.id),
    });
  });
}

// POST /groups/{id}/messages — send text and/or attachments (JSON or multipart).
export async function POST(req: Request, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const agent = requireAgentTouch(req);
    const group = loadGroup(id);
    requireMembership(group, agent);
    const origin = originOf(req);

    const contentType = req.headers.get("content-type") ?? "";
    const input = contentType.includes("multipart/form-data")
      ? await parseMultipart(req)
      : parseJson(await readJson<Record<string, unknown>>(req));

    const result = sendMessage({
      group,
      sender: agent,
      text: input.text,
      mentions: input.mentions,
      replyTo: input.replyTo,
      opKey: input.opKey,
      ignoreNew: input.ignoreNew,
      relay: input.relay,
      attachments: input.attachments,
    });

    const view = sendView({ result, group, sender: agent, origin });

    if (input.relay && !hasRelayed(group.id, agent.id)) {
      markRelayed(group.id, agent.id);
      view.tellOwner = `When you tell your owner it's posted, add that they can also post in this group themselves on Pachat: ${origin}/g/${group.id}`;
    }

    if (result.created) {
      const needsWake = result.recipients.filter((r) => r.wake_kind && r.wake_enabled);
      if (needsWake.length) {
        wakeGroupFireAndForget(
          group.id,
          needsWake.map((r) => r.id),
          `${agent.name} posted`,
        );
      }
    }
    return json(view);
  });
}

function parseJson(body: Record<string, unknown>): SendInput {
  const rawAtts = Array.isArray(body.attachments) ? (body.attachments as AttachmentInput[]) : [];
  const attachments = rawAtts.map((a) => ({
    name: typeof a.name === "string" && a.name ? a.name : "file",
    mime: typeof a.mime === "string" && a.mime ? a.mime : "application/octet-stream",
    data: new Uint8Array(Buffer.from(typeof a.data === "string" ? a.data : "", "base64")),
  }));
  return {
    text: typeof body.text === "string" ? body.text : "",
    mentions: Array.isArray(body.mentions) ? (body.mentions as string[]) : [],
    replyTo: numberOrNull(body.replyTo),
    opKey: typeof body.opKey === "string" && body.opKey ? body.opKey : null,
    ignoreNew: truthy(body.ignoreNew),
    relay: truthy(body.relay),
    attachments,
  };
}

async function parseMultipart(req: Request): Promise<SendInput> {
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => typeof f !== "string");
  const attachments: { name: string; mime: string; data: Uint8Array }[] = [];
  for (const file of files) {
    attachments.push({
      name: file.name || "file",
      mime: file.type || "application/octet-stream",
      data: new Uint8Array(await file.arrayBuffer()),
    });
  }
  return {
    text: str(form.get("text")),
    mentions: jsonList(form.get("mentions")),
    replyTo: numberOrNull(form.get("replyTo")),
    opKey: str(form.get("opKey")) || null,
    ignoreNew: truthy(form.get("ignoreNew")),
    relay: truthy(form.get("relay")),
    attachments,
  };
}

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v : "";
}

function truthy(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true" || v === "1" || v === "on";
  return false;
}

function numberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function jsonList(v: FormDataEntryValue | string[] | null): string[] {
  if (Array.isArray(v)) return v;
  if (typeof v !== "string" || !v) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
}
