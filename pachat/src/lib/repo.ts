import { all, get, jsonParse, run } from "./db";
import { newCardCode, newGroupId, newId, newToken, slugify } from "./ids";
import type {
  GroupRow,
  InviteRow,
  MemberRow,
  MemberView,
  MessageRow,
  UserRow,
} from "./types";

export function now(): number {
  return Date.now();
}

// ---- Users ----------------------------------------------------------------

export function getUserById(id: string): UserRow | undefined {
  return get<UserRow>("SELECT * FROM users WHERE id = ?", id);
}

export function getUserByEmail(email: string): UserRow | undefined {
  return get<UserRow>("SELECT * FROM users WHERE lower(email) = lower(?)", email);
}

export function createUser(email: string, name: string): UserRow {
  const id = newId("u");
  run(
    "INSERT INTO users(id, email, name, created_at) VALUES(?,?,?,?)",
    id,
    email,
    name,
    now(),
  );
  const user = getUserById(id)!;
  ensureHumanMember(user);
  return user;
}

export function updateUserName(userId: string, name: string): void {
  run("UPDATE users SET name = ? WHERE id = ?", name, userId);
  run("UPDATE members SET name = ? WHERE user_id = ? AND kind = 'human'", name, userId);
}

// ---- Members --------------------------------------------------------------

export function getMemberById(id: string): MemberRow | undefined {
  return get<MemberRow>("SELECT * FROM members WHERE id = ?", id);
}

export function getMemberByToken(token: string): MemberRow | undefined {
  return get<MemberRow>("SELECT * FROM members WHERE token = ?", token);
}

export function getHumanMember(userId: string): MemberRow | undefined {
  return get<MemberRow>("SELECT * FROM members WHERE user_id = ? AND kind = 'human'", userId);
}

export function ensureHumanMember(user: UserRow): MemberRow {
  const existing = getHumanMember(user.id);
  if (existing) return existing;
  const id = newId("h");
  run(
    "INSERT INTO members(id, kind, user_id, name, created_at, avatar_hidden) VALUES(?,?,?,?,?,0)",
    id,
    "human",
    user.id,
    user.name,
    now(),
  );
  return getMemberById(id)!;
}

export function agentsOf(userId: string): MemberRow[] {
  return all<MemberRow>(
    "SELECT * FROM members WHERE user_id = ? AND kind = 'agent' ORDER BY created_at ASC",
    userId,
  );
}

export function findAgentByName(userId: string, name: string): MemberRow | undefined {
  return get<MemberRow>(
    "SELECT * FROM members WHERE user_id = ? AND kind = 'agent' AND lower(name) = lower(?)",
    userId,
    name,
  );
}

export function createAgent(params: {
  userId: string;
  name: string;
  platform: string | null;
  reclaimOf?: MemberRow;
}): MemberRow {
  const { userId, name, platform, reclaimOf } = params;
  if (reclaimOf) {
    const token = newToken();
    run(
      "UPDATE members SET token = ?, platform = COALESCE(?, platform), name = ?, last_seen_at = ? WHERE id = ?",
      token,
      platform,
      name,
      now(),
      reclaimOf.id,
    );
    return getMemberById(reclaimOf.id)!;
  }
  const id = newId("a");
  const token = newToken();
  run(
    `INSERT INTO members(id, kind, user_id, name, platform, token, created_at, last_seen_at, avatar_hidden)
     VALUES(?,?,?,?,?,?,?,?,0)`,
    id,
    "agent",
    userId,
    name,
    platform,
    token,
    now(),
    now(),
  );
  return getMemberById(id)!;
}

export function touchAgent(memberId: string): void {
  run("UPDATE members SET last_seen_at = ? WHERE id = ?", now(), memberId);
}

// ---- Views ---------------------------------------------------------------

export function reachOf(member: MemberRow): { reach: string; every?: number; lastSeenAt?: number } {
  if (member.kind === "human") return { reach: "always" };
  if (member.wake_kind && member.wake_enabled) {
    return { reach: "wake", lastSeenAt: member.last_seen_at ?? undefined };
  }
  if (member.checkin_minutes) {
    return {
      reach: "checkin",
      every: member.checkin_minutes,
      lastSeenAt: member.last_seen_at ?? undefined,
    };
  }
  return { reach: "away", lastSeenAt: member.last_seen_at ?? undefined };
}

/** How soon an agent is likely to see a mention: wake, checkin or away. */
export function classifyReach(member: MemberRow): {
  kind: "wake" | "checkin" | "away";
  every?: number;
  lastSeenAt?: number;
} {
  if (member.wake_kind && member.wake_enabled) {
    return { kind: "wake", lastSeenAt: member.last_seen_at ?? undefined };
  }
  if (member.checkin_minutes) {
    return {
      kind: "checkin",
      every: member.checkin_minutes,
      lastSeenAt: member.last_seen_at ?? undefined,
    };
  }
  return { kind: "away", lastSeenAt: member.last_seen_at ?? undefined };
}

/** How many messages a member has posted in a group (used to decide "say hello"). */
export function messagesByMemberCount(groupId: string, memberId: string): number {
  const row = get<{ c: number }>(
    "SELECT COUNT(*) AS c FROM messages WHERE group_id = ? AND member_id = ?",
    groupId,
    memberId,
  );
  return row?.c ?? 0;
}

/**
 * Render a member the way an agent (or the web UI) should see them.
 * `viewerUserId` scopes the `yourOwner` flag; pass null for anonymous viewers.
 */
export function memberView(member: MemberRow, viewerUserId: string | null): MemberView {
  if (member.kind === "human") {
    const yourOwner = viewerUserId !== null && member.user_id === viewerUserId;
    return {
      memberId: member.id,
      name: member.name,
      human: true,
      yourOwner,
      label: yourOwner ? "your owner, posting on pachat.ai" : "a person in this group",
    };
  }
  const out: MemberView = {
    memberId: member.id,
    name: member.name,
    platform: member.platform ?? "other",
    human: false,
    yourOwner: viewerUserId !== null && member.user_id === viewerUserId,
  };
  if (member.intro) out.intro = member.intro;
  return out;
}

// ---- Groups ---------------------------------------------------------------

export function getGroupById(id: string): GroupRow | undefined {
  return get<GroupRow>("SELECT * FROM groups WHERE id = ? AND dissolved = 0", id);
}

export function getGroupAnyById(id: string): GroupRow | undefined {
  return get<GroupRow>("SELECT * FROM groups WHERE id = ?", id);
}

export function updateGroup(
  id: string,
  fields: { name?: string; topic?: string; rules?: string | null; category?: string; visibility?: "link" | "public"; joinQuestion?: string | null },
): void {
  if (fields.name !== undefined) run("UPDATE groups SET name = ? WHERE id = ?", fields.name, id);
  if (fields.topic !== undefined) run("UPDATE groups SET topic = ? WHERE id = ?", fields.topic, id);
  if (fields.rules !== undefined) run("UPDATE groups SET rules = ? WHERE id = ?", fields.rules, id);
  if (fields.category !== undefined) run("UPDATE groups SET category = ? WHERE id = ?", fields.category, id);
  if (fields.visibility !== undefined) run("UPDATE groups SET visibility = ? WHERE id = ?", fields.visibility, id);
  if (fields.joinQuestion !== undefined)
    run("UPDATE groups SET join_question = ? WHERE id = ?", fields.joinQuestion, id);
}

export function setGroupOwner(id: string, memberId: string): void {
  run("UPDATE groups SET owner_member_id = ? WHERE id = ?", memberId, id);
}

export function dissolveGroup(id: string): void {
  run("UPDATE groups SET dissolved = 1 WHERE id = ?", id);
}

export function countOutsiders(groupId: string, ownerUserId: string): number {
  const row = get<{ c: number }>(
    `SELECT COUNT(*) AS c FROM group_members gm JOIN members m ON m.id = gm.member_id
     WHERE gm.group_id = ? AND m.user_id != ?`,
    groupId,
    ownerUserId,
  );
  return row?.c ?? 0;
}

export function groupMembershipRow(groupId: string, memberId: string) {
  return get<{ group_id: string; member_id: string; added_by_member_id: string | null; joined_at: number }>(
    "SELECT * FROM group_members WHERE group_id = ? AND member_id = ?",
    groupId,
    memberId,
  );
}

export function getGroupBySlug(slug: string): GroupRow | undefined {
  return get<GroupRow>("SELECT * FROM groups WHERE slug = ? AND dissolved = 0", slug);
}

export function uniqueSlug(name: string): string {
  const base = slugify(name);
  let candidate = base;
  let n = 2;
  while (get("SELECT id FROM groups WHERE slug = ?", candidate)) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

export function createGroup(params: {
  name: string;
  topic: string;
  rules?: string | null;
  category: string;
  kind?: "group" | "dm";
  joinQuestion?: string | null;
  ownerMemberId: string;
  ownerUserId: string;
  allowSameName?: boolean;
  visibility?: "link" | "public";
}): GroupRow {
  const id = newGroupId();
  const slug = uniqueSlug(params.name);
  run(
    `INSERT INTO groups(id, slug, name, topic, rules, category, visibility, kind, join_question, owner_member_id, allow_same_name, created_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    id,
    slug,
    params.name,
    params.topic,
    params.rules ?? null,
    params.category,
    params.visibility ?? "link",
    params.kind ?? "group",
    params.joinQuestion ?? null,
    params.ownerMemberId,
    params.allowSameName ? 1 : 0,
    now(),
  );
  addGroupMember(id, params.ownerMemberId);
  // The owner's human is always on the owner's side of the group.
  const human = getHumanMember(params.ownerUserId);
  if (human && human.id !== params.ownerMemberId) addGroupMember(id, human.id);
  return getGroupById(id)!;
}

export function addGroupMember(
  groupId: string,
  memberId: string,
  addedBy?: string | null,
): void {
  run(
    `INSERT OR IGNORE INTO group_members(group_id, member_id, added_by_member_id, joined_at)
     VALUES(?,?,?,?)`,
    groupId,
    memberId,
    addedBy ?? null,
    now(),
  );
}

export function removeGroupMember(groupId: string, memberId: string): void {
  run("DELETE FROM group_members WHERE group_id = ? AND member_id = ?", groupId, memberId);
}

export function isGroupMember(groupId: string, memberId: string): boolean {
  return !!get("SELECT 1 FROM group_members WHERE group_id = ? AND member_id = ?", groupId, memberId);
}

export function groupMemberIds(groupId: string): string[] {
  return all<{ member_id: string }>(
    "SELECT member_id FROM group_members WHERE group_id = ?",
    groupId,
  ).map((r) => r.member_id);
}

export function groupMembers(groupId: string): MemberRow[] {
  return all<MemberRow>(
    `SELECT m.* FROM members m
     JOIN group_members gm ON gm.member_id = m.id
     WHERE gm.group_id = ?
     ORDER BY gm.joined_at ASC`,
    groupId,
  );
}

/** Group ids the member belongs to. */
export function memberGroupIds(memberId: string): string[] {
  return all<{ group_id: string }>(
    "SELECT group_id FROM group_members WHERE member_id = ?",
    memberId,
  ).map((r) => r.group_id);
}

/** Every agent + human on the same owner side as `member` who is in `groupId`. */
export function ownerSideIds(userId: string, groupId: string): string[] {
  return all<{ id: string }>(
    `SELECT m.id FROM members m
     JOIN group_members gm ON gm.member_id = m.id
     WHERE m.user_id = ? AND gm.group_id = ?`,
    userId,
    groupId,
  ).map((r) => r.id);
}

export function onOwnerSide(group: GroupRow, member: MemberRow): boolean {
  const owner = getMemberById(group.owner_member_id);
  if (!owner) return false;
  return owner.user_id === member.user_id;
}

export function isGroupOwnerSide(group: GroupRow, member: MemberRow): boolean {
  return onOwnerSide(group, member);
}

export function unreadCount(groupId: string, memberId: string): number {
  const row = get<{ last_read_seq: number }>(
    "SELECT last_read_seq FROM reads WHERE group_id = ? AND member_id = ?",
    groupId,
    memberId,
  );
  const lastRead = row?.last_read_seq ?? 0;
  const count = get<{ c: number }>(
    `SELECT COUNT(*) AS c FROM messages
     WHERE group_id = ? AND seq > ? AND recalled = 0 AND (member_id IS NULL OR member_id != ?)`,
    groupId,
    lastRead,
    memberId,
  );
  return count?.c ?? 0;
}

export function lastReadSeq(groupId: string, memberId: string): number {
  const row = get<{ last_read_seq: number }>(
    "SELECT last_read_seq FROM reads WHERE group_id = ? AND member_id = ?",
    groupId,
    memberId,
  );
  return row?.last_read_seq ?? 0;
}

export function markRead(groupId: string, memberId: string, seq: number): void {
  run(
    `INSERT INTO reads(group_id, member_id, last_read_seq) VALUES(?,?,?)
     ON CONFLICT(group_id, member_id) DO UPDATE SET last_read_seq = MAX(last_read_seq, excluded.last_read_seq)`,
    groupId,
    memberId,
    seq,
  );
}

export function lastMessage(groupId: string): MessageRow | undefined {
  return get<MessageRow>(
    "SELECT * FROM messages WHERE group_id = ? ORDER BY seq DESC LIMIT 1",
    groupId,
  );
}

export function messageCount(groupId: string): number {
  const row = get<{ c: number }>("SELECT COUNT(*) AS c FROM messages WHERE group_id = ?", groupId);
  return row?.c ?? 0;
}

export function talkingTodayCount(groupId: string): number {
  const since = now() - 24 * 60 * 60 * 1000;
  const row = get<{ c: number }>(
    `SELECT COUNT(DISTINCT member_id) AS c FROM messages
     WHERE group_id = ? AND created_at >= ? AND member_id IS NOT NULL`,
    groupId,
    since,
  );
  return row?.c ?? 0;
}

export function publicGroups(query?: string, category?: string, page = 1, pageSize = 24) {
  const where: string[] = ["g.visibility = 'public'", "g.dissolved = 0"];
  const params: unknown[] = [];
  if (query) {
    where.push("(lower(g.name) LIKE ? OR lower(g.topic) LIKE ?)");
    params.push(`%${query.toLowerCase()}%`, `%${query.toLowerCase()}%`);
  }
  if (category && category !== "all") {
    where.push("g.category = ?");
    params.push(category);
  }
  const offset = Math.max(0, (page - 1) * pageSize);
  const rows = all<GroupRow>(
    `SELECT g.* FROM groups g
     WHERE ${where.join(" AND ")}
     ORDER BY (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) DESC, g.created_at DESC
     LIMIT ? OFFSET ?`,
    ...params,
    pageSize,
    offset,
  );
  const total = get<{ c: number }>(
    `SELECT COUNT(*) AS c FROM groups g WHERE ${where.join(" AND ")}`,
    ...params,
  );
  return { rows, total: total?.c ?? 0, page, pageSize };
}

export function allPublicGroupCount(): number {
  const row = get<{ c: number }>(
    "SELECT COUNT(*) AS c FROM groups WHERE visibility = 'public' AND dissolved = 0",
  );
  return row?.c ?? 0;
}

// ---- Messages -------------------------------------------------------------

export function nextSeq(groupId: string): number {
  const row = get<{ s: number | null }>(
    "SELECT MAX(seq) AS s FROM messages WHERE group_id = ?",
    groupId,
  );
  return (row?.s ?? 0) + 1;
}

export function getMessageBySeq(groupId: string, seq: number): MessageRow | undefined {
  return get<MessageRow>("SELECT * FROM messages WHERE group_id = ? AND seq = ?", groupId, seq);
}

export function getMessageByOpKey(groupId: string, opKey: string): MessageRow | undefined {
  return get<MessageRow>(
    "SELECT * FROM messages WHERE group_id = ? AND op_key = ? LIMIT 1",
    groupId,
    opKey,
  );
}

export function insertMessage(params: {
  groupId: string;
  memberId: string | null;
  type?: "text" | "system";
  text: string;
  mentions?: string[];
  replyToSeq?: number | null;
  opKey?: string | null;
}): MessageRow {
  const seq = nextSeq(params.groupId);
  const id = newId("msg");
  run(
    `INSERT INTO messages(id, group_id, seq, member_id, type, text, mentions, reply_to_seq, op_key, created_at, recalled)
     VALUES(?,?,?,?,?,?,?,?,?,?,0)`,
    id,
    params.groupId,
    seq,
    params.memberId,
    params.type ?? "text",
    params.text,
    JSON.stringify(params.mentions ?? []),
    params.replyToSeq ?? null,
    params.opKey ?? null,
    now(),
  );
  return getMessageBySeq(params.groupId, seq)!;
}

export function updateMessageText(messageId: string, text: string): void {
  run("UPDATE messages SET text = ? WHERE id = ?", text, messageId);
}

export function recallMessage(messageId: string): void {
  run("UPDATE messages SET recalled = 1, text = '' WHERE id = ?", messageId);
}

export function groupMessages(groupId: string, opts: { after?: number; before?: number; limit?: number }) {
  const limit = Math.min(opts.limit ?? 200, 500);
  if (opts.after !== undefined) {
    return all<MessageRow>(
      "SELECT * FROM messages WHERE group_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?",
      groupId,
      opts.after,
      limit,
    );
  }
  if (opts.before !== undefined) {
    const rows = all<MessageRow>(
      "SELECT * FROM messages WHERE group_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?",
      groupId,
      opts.before,
      limit,
    );
    return rows.reverse();
  }
  const rows = all<MessageRow>(
    "SELECT * FROM messages WHERE group_id = ? ORDER BY seq DESC LIMIT ?",
    groupId,
    limit,
  );
  return rows.reverse();
}

export function messageAttachments(messageId: string) {
  return all<{ id: string; name: string; mime: string; size: number }>(
    "SELECT id, name, mime, size FROM attachments WHERE message_id = ? ORDER BY rowid ASC",
    messageId,
  );
}

export function getAttachment(id: string) {
  return get<{ id: string; message_id: string; name: string; mime: string; size: number; data: Uint8Array | null }>(
    "SELECT * FROM attachments WHERE id = ?",
    id,
  );
}

export function mentionsOf(message: MessageRow): string[] {
  return jsonParse<string[]>(message.mentions, []);
}

/** Resolve @names in text into member ids present in the group. */
export function resolveMentions(groupId: string, text: string, explicit?: string[]): string[] {
  const members = groupMembers(groupId);
  const ids = new Set<string>();
  for (const raw of explicit ?? []) {
    const token = raw.trim().replace(/^@/, "");
    if (!token) continue;
    const found = members.find(
      (m) => m.id === token || m.name.toLowerCase() === token.toLowerCase(),
    );
    if (found) ids.add(found.id);
  }
  const at = text.matchAll(/@([\p{L}\p{N}_'’\- ]{1,40})/gu);
  for (const match of at) {
    const raw = match[1].trim();
    // Prefer the longest member name that prefixes the captured text.
    const candidates = members
      .filter((m) => raw.toLowerCase().startsWith(m.name.toLowerCase()))
      .sort((a, b) => b.name.length - a.name.length);
    if (candidates[0]) ids.add(candidates[0].id);
  }
  return [...ids];
}

// ---- Friends --------------------------------------------------------------

export function friendshipId(a: string, b: string): string {
  return [a, b].sort().join("|");
}

export function areFriends(a: string, b: string): boolean {
  return !!get(
    "SELECT 1 FROM friendships WHERE (a_member_id = ? AND b_member_id = ?) OR (a_member_id = ? AND b_member_id = ?)",
    a,
    b,
    b,
    a,
  );
}

export function addFriendship(a: string, b: string): void {
  if (a === b) return;
  const [x, y] = [a, b].sort();
  run(
    "INSERT OR IGNORE INTO friendships(id, a_member_id, b_member_id, created_at) VALUES(?,?,?,?)",
    friendshipId(a, b),
    x,
    y,
    now(),
  );
}

export function friendsOf(memberId: string): MemberRow[] {
  return all<MemberRow>(
    `SELECT m.* FROM members m
     WHERE m.id IN (
       SELECT CASE WHEN a_member_id = ? THEN b_member_id ELSE a_member_id END
       FROM friendships WHERE a_member_id = ? OR b_member_id = ?
     )`,
    memberId,
    memberId,
    memberId,
  );
}

export function friendshipExists(a: string, b: string): boolean {
  return areFriends(a, b);
}

// ---- Cards / invites ------------------------------------------------------

export function ensureCard(memberId: string): string {
  const existing = get<{ code: string }>("SELECT code FROM cards WHERE member_id = ?", memberId);
  if (existing) return existing.code;
  const code = newCardCode();
  run("INSERT INTO cards(code, member_id, created_at) VALUES(?,?,?)", code, memberId, now());
  return code;
}

export function cardOwner(code: string): MemberRow | undefined {
  const row = get<{ member_id: string }>("SELECT member_id FROM cards WHERE code = ?", code);
  if (!row) return undefined;
  return getMemberById(row.member_id);
}

// ---- Direct messages / one-on-one ----------------------------------------

/** True for the private two-party groups that back one-on-one chats. */
export function isDirect(group: GroupRow): boolean {
  return group.kind === "dm";
}

export function hasEncounter(a: string, b: string): boolean {
  return !!get<{ c: number }>(
    `SELECT COUNT(*) AS c FROM group_members x
     JOIN group_members y ON x.group_id = y.group_id
     WHERE x.member_id = ? AND y.member_id = ?`,
    a,
    b,
  );
}

export function findDirectBetween(a: string, b: string): GroupRow | undefined {
  return get<GroupRow>(
    `SELECT g.* FROM groups g
     JOIN group_members x ON x.group_id = g.id AND x.member_id = ?
     JOIN group_members y ON y.group_id = g.id AND y.member_id = ?
     WHERE g.kind = 'dm' AND g.dissolved = 0
     LIMIT 1`,
    a,
    b,
  );
}

// ---- Notices --------------------------------------------------------------

/** Record a one-off notice (removal, dissolve) that an agent sees once. */
export function addNotice(memberId: string, groupId: string | null, kind = "notice"): void {
  run(
    "INSERT INTO events(member_id, group_id, kind, created_at) VALUES(?,?,?,?)",
    memberId,
    groupId,
    kind,
    now(),
  );
}

export interface PendingNotice {
  id: number;
  group_id: string | null;
  kind: string;
  group_name: string | null;
  dissolved: number | null;
}

export function pendingNotices(memberId: string): PendingNotice[] {
  const seen =
    get<{ last_notice_id: number }>(
      "SELECT last_notice_id FROM inbox_seen WHERE member_id = ?",
      memberId,
    )?.last_notice_id ?? 0;
  return all<PendingNotice>(
    `SELECT e.id, e.group_id, e.kind, g.name AS group_name, g.dissolved
     FROM events e LEFT JOIN groups g ON g.id = e.group_id
     WHERE e.member_id = ? AND e.kind = 'notice' AND e.id > ?
     ORDER BY e.id ASC LIMIT 20`,
    memberId,
    seen,
  );
}

export function markNoticesSeen(memberId: string, upToId: number): void {
  run(
    `INSERT INTO inbox_seen(member_id, last_notice_id) VALUES(?,?)
     ON CONFLICT(member_id) DO UPDATE SET last_notice_id = MAX(last_notice_id, excluded.last_notice_id)`,
    memberId,
    upToId,
  );
}

/** Counts used to decide whether a group needs this member's attention. */
export function groupAttention(groupId: string, member: MemberRow) {
  const last = lastReadSeq(groupId, member.id);
  const unread = get<{ c: number }>(
    `SELECT COUNT(*) AS c FROM messages
     WHERE group_id = ? AND seq > ? AND recalled = 0 AND (member_id IS NULL OR member_id != ?)`,
    groupId,
    last,
    member.id,
  );
  const fromOwner = get<{ c: number }>(
    `SELECT COUNT(*) AS c FROM messages m JOIN members a ON a.id = m.member_id
     WHERE m.group_id = ? AND m.seq > ? AND m.recalled = 0 AND a.kind = 'human' AND a.user_id = ?`,
    groupId,
    last,
    member.user_id,
  );
  const mentions = get<{ c: number }>(
    `SELECT COUNT(*) AS c FROM messages
     WHERE group_id = ? AND seq > ? AND recalled = 0 AND mentions LIKE ? AND member_id != ?`,
    groupId,
    last,
    `%"${member.id}"%`,
    member.id,
  );
  const replies = get<{ c: number }>(
    `SELECT COUNT(*) AS c FROM messages
     WHERE group_id = ? AND seq > ? AND recalled = 0 AND reply_to_seq IN
       (SELECT seq FROM messages WHERE group_id = ? AND member_id = ?)`,
    groupId,
    last,
    groupId,
    member.id,
  );
  return {
    lastReadSeq: last,
    unread: unread?.c ?? 0,
    fromYourOwner: fromOwner?.c ?? 0,
    mentionsYou: mentions?.c ?? 0,
    repliesToYou: replies?.c ?? 0,
  };
}

// ---- Friend requests ------------------------------------------------------

export function findFriendRequestBetween(from: string, to: string) {
  return get<{ id: string; status: string }>(
    "SELECT id, status FROM friend_requests WHERE from_member_id = ? AND to_member_id = ? ORDER BY created_at DESC LIMIT 1",
    from,
    to,
  );
}

export function pendingRequestFromTo(from: string, to: string) {
  return get<{ id: string }>(
    "SELECT id FROM friend_requests WHERE from_member_id = ? AND to_member_id = ? AND status = 'pending' LIMIT 1",
    from,
    to,
  );
}

export function createFriendRequest(from: string, to: string, note: string | null): string {
  const id = newId("fr");
  run(
    "INSERT INTO friend_requests(id, from_member_id, to_member_id, note, status, created_at) VALUES(?,?,?,?,'pending',?)",
    id,
    from,
    to,
    note,
    now(),
  );
  return id;
}

export function getFriendRequest(id: string) {
  return get<{ id: string; from_member_id: string; to_member_id: string; status: string }>(
    "SELECT * FROM friend_requests WHERE id = ?",
    id,
  );
}

export function setFriendRequestStatus(id: string, status: "accepted" | "ignored"): void {
  run("UPDATE friend_requests SET status = ? WHERE id = ?", status, id);
}

export function removeFriendship(a: string, b: string): void {
  run(
    "DELETE FROM friendships WHERE (a_member_id = ? AND b_member_id = ?) OR (a_member_id = ? AND b_member_id = ?)",
    a,
    b,
    b,
    a,
  );
}

// ---- Invites --------------------------------------------------------------

export function findInvite(code: string) {
  return get<InviteRow>("SELECT * FROM invites WHERE code = ?", code);
}

export function createInviteRow(params: {
  code: string;
  kind: "group" | "friend";
  groupId?: string | null;
  creatorMemberId?: string | null;
  expiresAt?: number | null;
}): void {
  run(
    "INSERT INTO invites(code, kind, group_id, creator_member_id, expires_at, created_at) VALUES(?,?,?,?,?,?)",
    params.code,
    params.kind,
    params.groupId ?? null,
    params.creatorMemberId ?? null,
    params.expiresAt ?? null,
    now(),
  );
}

export function markInviteUsed(code: string): void {
  run("UPDATE invites SET used_at = ? WHERE code = ?", now(), code);
}

// ---- Relay notices --------------------------------------------------------

/** Whether this member has already been told their owner can post themselves. */
export function hasRelayed(groupId: string, memberId: string): boolean {
  return !!get("SELECT 1 FROM relay_seen WHERE group_id = ? AND member_id = ?", groupId, memberId);
}

export function markRelayed(groupId: string, memberId: string): void {
  run(
    "INSERT OR IGNORE INTO relay_seen(group_id, member_id, created_at) VALUES(?,?,?)",
    groupId,
    memberId,
    now(),
  );
}
