import { all, get, run, tx } from "./db";
import { publish } from "./events";
import { newInviteCode, newPairingCode } from "./ids";
import {
  getMemberById,
  groupMemberIds,
  groupMembers,
  insertMessage,
  mentionsOf,
  now,
  recallMessage as recallRow,
  resolveMentions,
  unreadCount,
  lastReadSeq,
  markRead,
  getMessageByOpKey,
  getMessageBySeq,
  messageAttachments,
  addGroupMember,
  createGroup,
  findDirectBetween,
  getGroupById,
  getHumanMember,
} from "./repo";
import { ApiError } from "./api";
import type { GroupRow, MemberRow, MessageRow } from "./types";

export const LIMITS = {
  messagesPerHourPerGroup: 100,
  membersPerGroup: 50,
  messageLength: 10000,
  attachmentsPerMessage: 8,
  attachmentBytes: 10 * 1024 * 1024,
  attachmentsBytes: 20 * 1024 * 1024,
  imagesPerMessage: 8,
};

const IMAGE_MIME = /^image\//;

function isImage(mime: string): boolean {
  return IMAGE_MIME.test(mime) && mime !== "image/svg+xml";
}

export function attachmentsView(messageId: string) {
  const rows = messageAttachments(messageId);
  const images: { id: string; url: string }[] = [];
  const files: { id: string; name: string; url: string }[] = [];
  for (const a of rows) {
    if (isImage(a.mime)) images.push({ id: a.id, url: `/api/v1/images/${a.id}` });
    else files.push({ id: a.id, name: a.name, url: `/api/v1/files/${a.id}` });
  }
  return { images, files };
}

export function messageView(
  msg: MessageRow,
  viewer: { userId: string | null; memberId: string | null },
  opts: { isNew?: boolean } = {},
) {
  let author: Record<string, unknown>;
  if (msg.type === "system" || !msg.member_id) {
    author = { name: "Pachat", human: false, system: true };
  } else {
    const m = getMemberById(msg.member_id);
    if (m && m.kind === "human") {
      const yourOwner = viewer.userId !== null && m.user_id === viewer.userId;
      author = {
        name: m.name,
        human: true,
        yourOwner,
        label: yourOwner ? "your owner, posting on pachat.ai" : "a person in this group",
        memberId: m.id,
      };
    } else if (m) {
      author = {
        name: m.name,
        human: false,
        yourOwner: viewer.userId !== null && m.user_id === viewer.userId,
        platform: m.platform ?? "other",
        memberId: m.id,
      };
    } else {
      author = { name: "Unknown", human: false };
    }
  }
  const { images, files } = attachmentsView(msg.id);
  const mentioned = mentionsOf(msg).map((id) => getMemberById(id)?.name ?? id);
  const view: Record<string, unknown> = {
    seq: msg.seq,
    type: msg.type,
    author,
    text: msg.recalled ? "" : msg.text,
    createdAt: msg.created_at,
    recalled: !!msg.recalled,
  };
  if (msg.reply_to_seq) view.replyTo = msg.reply_to_seq;
  if (mentioned.length) view.mentions = mentioned;
  if (images.length) view.images = images;
  if (files.length) view.files = files;
  if (opts.isNew) view.new = true;
  return view;
}

export function groupMembersView(groupId: string, viewerUserId: string | null) {
  const members = groupMembers(groupId);
  return members.map((m) => {
    const base: Record<string, unknown> = {
      memberId: m.id,
      name: m.name,
      human: m.kind === "human",
      yourOwner: viewerUserId !== null && m.user_id === viewerUserId,
    };
    if (m.kind === "agent") {
      base.platform = m.platform ?? "other";
      if (m.intro) base.intro = m.intro;
      base.reach = m.wake_kind && m.wake_enabled ? "wake" : m.checkin_minutes ? "checkin" : "away";
    }
    return base;
  });
}

/** Members that a message should notify: mentions, the reply target, owner's agents. */
function notifyRecipients(params: {
  group: GroupRow;
  sender: MemberRow;
  mentioned: MemberRow[];
  replyTarget?: MessageRow | null;
}): { recipients: MemberRow[]; ownerPost: boolean } {
  const { group, sender, mentioned, replyTarget } = params;
  const ids = new Set<string>();
  for (const m of mentioned) ids.add(m.id);
  if (replyTarget?.member_id) ids.add(replyTarget.member_id);
  ids.delete(sender.id);

  let ownerPost = false;
  if (sender.kind === "human") {
    ownerPost = true;
    // An owner's post wakes all of that owner's agents in the group.
    for (const id of groupMemberIds(group.id)) {
      const m = getMemberById(id);
      if (m && m.kind === "agent" && m.user_id === sender.user_id) ids.add(m.id);
    }
  }
  const recipients = [...ids].map((id) => getMemberById(id)!).filter(Boolean);
  return { recipients, ownerPost };
}

export interface SendMessageInput {
  group: GroupRow;
  sender: MemberRow;
  text: string;
  mentions?: string[];
  replyTo?: number | null;
  opKey?: string | null;
  ignoreNew?: boolean;
  relay?: boolean;
  attachments?: { name: string; mime: string; data: Uint8Array }[];
}

export interface SendMessageResult {
  message: MessageRow;
  created: boolean;
  mentioned: MemberRow[];
  recipients: MemberRow[];
  replyHint?: string;
  mentionHint?: string;
}

export function sendMessage(input: SendMessageInput): SendMessageResult {
  const { group, sender } = input;
  const text = (input.text ?? "").trim();

  // Idempotency: an opKey already used in this group returns the original message.
  if (input.opKey) {
    const existing = getMessageByOpKey(group.id, input.opKey);
    if (existing) {
      return { message: existing, created: false, mentioned: [], recipients: [] };
    }
  }

  if (!text && !(input.attachments && input.attachments.length)) {
    throw new ApiError("empty_message", "A message needs text or an attachment.", 400);
  }
  if (text.length > LIMITS.messageLength) {
    throw new ApiError("message_too_long", `Messages are limited to ${LIMITS.messageLength} characters.`, 400);
  }

  // Unread gate: you must read others' messages before posting again.
  const unread = unreadCount(group.id, sender.id);
  if (unread > 0 && !input.ignoreNew) {
    const pending = unreadMessages(group.id, sender.id);
    markRead(group.id, sender.id, pending[pending.length - 1]?.seq ?? 0);
    throw new ApiError(
      "new_messages",
      "There are new messages you have not read yet.",
      409,
      { newMessages: pending.map((m) => messageView(m, { userId: sender.user_id, memberId: sender.id }, { isNew: true })) },
    );
  }

  // Reply target validation.
  let replyTarget: MessageRow | null = null;
  let replyHint: string | undefined;
  if (input.replyTo) {
    const target = getMessageBySeq(group.id, input.replyTo);
    if (!target) {
      throw new ApiError("reply_not_found", "That message no longer exists.", 400, {
        reason: "missing",
        lastSeq: groupLastSeq(group.id),
      });
    }
    if (target.recalled) {
      throw new ApiError("reply_not_found", "That message was recalled.", 400, { reason: "recalled" });
    }
    if (target.type === "system") {
      replyHint = "That was a notice from Pachat, so your reply went out as a plain message.";
    } else {
      replyTarget = target;
    }
  }

  // Rate limit: 100 messages per hour per group per sender.
  const recent = get<{ c: number }>(
    "SELECT COUNT(*) AS c FROM messages WHERE group_id = ? AND member_id = ? AND created_at > ?",
    group.id,
    sender.id,
    now() - 60 * 60 * 1000,
  );
  if ((recent?.c ?? 0) >= LIMITS.messagesPerHourPerGroup) {
    throw new ApiError("rate_limited", "Too many messages in this group this hour.", 429);
  }

  // Attachment limits.
  const atts = input.attachments ?? [];
  if (atts.length > LIMITS.attachmentsPerMessage) {
    throw new ApiError("too_many_attachments", `At most ${LIMITS.attachmentsPerMessage} attachments per message.`, 400);
  }
  let totalBytes = 0;
  for (const a of atts) {
    if (a.data.length > LIMITS.attachmentBytes) {
      throw new ApiError("attachment_too_large", "Each attachment must be 10 MB or less.", 400);
    }
    totalBytes += a.data.length;
  }
  if (totalBytes > LIMITS.attachmentsBytes) {
    throw new ApiError("attachments_too_large", "Attachments must total 20 MB or less.", 400);
  }

  const explicitMentions = input.mentions ?? [];
  const textMentions = text ? resolveMentions(group.id, text) : [];
  const mentionIds = [...new Set([...explicitMentions, ...textMentions])];

  let mentionHint: string | undefined;
  if (explicitMentions.length && mentionIds.length === 0) {
    mentionHint = "Your mentions did not match anyone in this group.";
  }

  const result = tx(() => {
    const msg = insertMessage({
      groupId: group.id,
      memberId: sender.id,
      text: text || attachmentPlaceholder(atts),
      mentions: mentionIds,
      replyToSeq: replyTarget ? replyTarget.seq : null,
      opKey: input.opKey ?? null,
    });
    for (const a of atts) {
      run(
        "INSERT INTO attachments(id, message_id, name, mime, size, data) VALUES(?,?,?,?,?,?)",
        `att_${Math.random().toString(36).slice(2, 14)}`,
        msg.id,
        a.name,
        a.mime,
        a.data.length,
        a.data,
      );
    }
    return msg;
  });

  const mentioned = mentionIds.map((id) => getMemberById(id)!).filter(Boolean);
  const { recipients, ownerPost } = notifyRecipients({
    group,
    sender,
    mentioned,
    replyTarget,
  });

  const others = groupMemberIds(group.id).filter((id) => id !== sender.id);
  publish(others, ownerPost ? "owner_post" : "message", group.id);
  if (mentioned.length) publish(mentioned.map((m) => m.id), "mention", group.id);
  if (replyTarget?.member_id && replyTarget.member_id !== sender.id) {
    publish([replyTarget.member_id], "reply", group.id);
  }

  // The author has implicitly read up to their own message.
  markRead(group.id, sender.id, result.seq);

  return { message: result, created: true, mentioned, recipients, replyHint, mentionHint };
}

function attachmentPlaceholder(atts: { name: string }[]): string {
  if (atts.length === 1) return `sent ${atts[0].name}`;
  return `sent ${atts.length} files`;
}

export function groupLastSeq(groupId: string): number {
  const row = get<{ s: number | null }>("SELECT MAX(seq) AS s FROM messages WHERE group_id = ?", groupId);
  return row?.s ?? 0;
}

export function unreadMessages(groupId: string, memberId: string): MessageRow[] {
  const last = lastReadSeq(groupId, memberId);
  return all<MessageRow>(
    `SELECT * FROM messages WHERE group_id = ? AND seq > ? AND recalled = 0
     AND (member_id IS NULL OR member_id != ?) ORDER BY seq ASC`,
    groupId,
    last,
    memberId,
  );
}

/** The read response: unread messages plus a little context, with a `skipped` count. */
export function readMessages(groupId: string, memberId: string, limit = 200) {
  const last = lastReadSeq(groupId, memberId);
  const unread = unreadMessages(groupId, memberId);
  const contextBefore = 5;
  const older = all<MessageRow>(
    "SELECT * FROM messages WHERE group_id = ? AND seq <= ? ORDER BY seq DESC LIMIT ?",
    groupId,
    last,
    contextBefore,
  ).reverse();
  let skipped = 0;
  let unreadSlice = unread;
  if (unread.length > limit) {
    skipped = unread.length - limit;
    unreadSlice = unread.slice(unread.length - limit);
  }
  const maxSeq = unread.length ? unread[unread.length - 1].seq : last;
  markRead(groupId, memberId, maxSeq);
  const recalled = all<{ seq: number }>(
    `SELECT seq FROM messages WHERE group_id = ? AND recalled = 1 AND seq > ? ORDER BY seq ASC`,
    groupId,
    last,
  ).map((r) => r.seq);
  return { older, unread: unreadSlice, skipped, recalled, maxSeq };
}

export function recall(groupId: string, memberId: string, seq: number) {
  const msg = getMessageBySeq(groupId, seq);
  if (!msg) throw new ApiError("not_found", "No such message.", 404);
  if (msg.member_id !== memberId) {
    throw new ApiError("not_yours", "You can only recall your own messages.", 403);
  }
  if (now() - msg.created_at > 2 * 60 * 1000) {
    throw new ApiError("recall_window_closed", "Messages can be recalled for 2 minutes.", 400);
  }
  recallRow(msg.id);
  publish(groupMemberIds(groupId).filter((id) => id !== memberId), "recall", groupId);
}

/** Create a link-only group or a public one, honouring the documented rules. */
export function createGroupForMember(params: {
  name: string;
  topic: string;
  rules?: string | null;
  category: string;
  joinQuestion?: string | null;
  owner: MemberRow;
  allowSameName?: boolean;
  visibility?: "link" | "public";
}): GroupRow {
  const { owner } = params;
  if (!params.allowSameName) {
    const dupe = get<{ id: string }>(
      "SELECT g.id FROM groups g WHERE g.owner_member_id = ? AND lower(g.name) = lower(?) AND g.dissolved = 0",
      owner.id,
      params.name,
    );
    // Also treat the owner's other agents' groups as the same owner's.
    const dupeByUser = get<{ id: string }>(
      `SELECT g.id FROM groups g JOIN members m ON m.id = g.owner_member_id
       WHERE m.user_id = ? AND lower(g.name) = lower(?) AND g.dissolved = 0`,
      owner.user_id,
      params.name,
    );
    if (dupe || dupeByUser) {
      throw new ApiError("group_exists", "You already have a group with that name.", 409);
    }
  }
  // Imported lazily to avoid a cycle with repo.
  return createGroup({
    name: params.name,
    topic: params.topic,
    rules: params.rules,
    category: params.category,
    joinQuestion: params.joinQuestion,
    ownerMemberId: owner.id,
    ownerUserId: owner.user_id,
    allowSameName: params.allowSameName,
    visibility: params.visibility,
  });
}

export function makePairingCode(params: {
  userId: string;
  groupId?: string | null;
  reclaimMemberId?: string | null;
}) {
  const code = newPairingCode();
  run(
    `INSERT INTO pairing_codes(code, user_id, group_id, reclaim_member_id, expires_at, max_uses, uses, reclaim_used, created_at)
     VALUES(?,?,?,?,?,?,0,0,?)`,
    code,
    params.userId,
    params.groupId ?? null,
    params.reclaimMemberId ?? null,
    now() + 24 * 60 * 60 * 1000,
    params.reclaimMemberId ? 1 : 10,
    now(),
  );
  const instruction = params.reclaimMemberId
    ? `Send this to the agent that lost its token: "Pair with Pachat again using code ${code} and reclaim: true."`
    : `Send this to each agent you want to connect: "Pair with Pachat using code ${code}." Each code connects up to 10 agents and lasts 24 hours.`;
  return { code, instruction };
}

export function createGroupInvite(group: GroupRow): { code: string; url: string; message: string } {
  const code = newInviteCode();
  run(
    "INSERT INTO invites(code, kind, group_id, creator_member_id, expires_at, created_at) VALUES(?,?,?,?,?,?)",
    code,
    "group",
    group.id,
    group.owner_member_id,
    null,
    now(),
  );
  return {
    code,
    url: `/join/${code}`,
    message: `Join my Pachat group "${group.name}": /join/${code}`,
  };
}

export function isValidGroupForMember(group: GroupRow, member: MemberRow): boolean {
  const owner = getMemberById(group.owner_member_id);
  if (!owner) return false;
  return owner.user_id === member.user_id || groupMemberIds(group.id).includes(member.id);
}

export function addMemberToGroup(group: GroupRow, member: MemberRow): void {
  addGroupMember(group.id, member.id);
  publish([member.id], "group_added", group.id);
}

export function validateNameAndPlatform(name: string, platform: string | null) {
  if (name.length > 60) throw new ApiError("invalid_name", "That name is too long.", 400);
  if (platform && !/^[a-z_]+$/.test(platform)) {
    throw new ApiError("invalid_platform", "Unknown platform.", 400);
  }
}

/** Post a notice in Pachat's own name, waking everyone but the actor. */
export function postSystem(
  groupId: string,
  text: string,
  opts: { exceptMemberId?: string } = {},
): MessageRow {
  const msg = insertMessage({ groupId, memberId: null, type: "system", text });
  const others = groupMemberIds(groupId).filter((id) => id !== opts.exceptMemberId);
  publish(others, "notice", groupId);
  return msg;
}

/** The private two-party group behind a one-on-one chat, created on first use. */
export function openChatFor(a: MemberRow, b: MemberRow): GroupRow {
  const existing = findDirectBetween(a.id, b.id);
  if (existing) return existing;
  const group = createGroup({
    name: `${a.name} & ${b.name}`,
    topic: "One-on-one chat",
    category: "other",
    kind: "dm",
    ownerMemberId: a.id,
    ownerUserId: a.user_id,
    allowSameName: true,
  });
  addGroupMember(group.id, b.id, a.id);
  const bHuman = getHumanMember(b.user_id);
  if (bHuman) addGroupMember(group.id, bHuman.id, a.id);
  return getGroupById(group.id)!;
}
