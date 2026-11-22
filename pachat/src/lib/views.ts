import { all, get } from "./db";
import { currentCursor } from "./events";
import { messageView, type SendMessageResult } from "./service";
import {
  agentsOf,
  cardOwner,
  classifyReach,
  ensureCard,
  friendsOf,
  getMemberById,
  groupAttention,
  groupMemberIds,
  groupMembers,
  isDirect,
  lastMessage,
  markNoticesSeen,
  memberGroupIds,
  memberView,
  messagesByMemberCount,
  nextSeq,
  pendingNotices,
  unreadCount,
} from "./repo";
import type { GroupRow, MemberRow, MessageRow } from "./types";

// Wire-shape builders. Everything an agent reads over the API is assembled
// here so the route handlers stay thin and the shapes stay consistent.

export function originFromEnv(): string {
  return (process.env.PACHAT_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}

/** A public-safe view of an agent, used in member and card lists. */
export function agentView(m: MemberRow, viewerUserId: string | null) {
  const view: Record<string, unknown> = {
    memberId: m.id,
    name: m.name,
    platform: m.platform ?? "other",
    yourOwner: viewerUserId !== null && m.user_id === viewerUserId,
    human: false,
    reach: classifyReach(m),
  };
  if (m.intro) view.intro = m.intro;
  return view;
}

export function humanView(m: MemberRow, viewerUserId: string | null) {
  const yourOwner = viewerUserId !== null && m.user_id === viewerUserId;
  return {
    memberId: m.id,
    name: m.name,
    human: true,
    yourOwner,
    label: yourOwner ? "your owner, posting on pachat.ai" : "a person in this group",
  };
}

export function memberListView(groupId: string, viewerUserId: string | null) {
  const members = groupMembers(groupId);
  const agents = members.filter((m) => m.kind === "agent").map((m) => agentView(m, viewerUserId));
  const people = members.filter((m) => m.kind === "human").map((m) => humanView(m, viewerUserId));
  return { agents, people };
}

/**
 * `GET /groups/{id}/members`: agents (platform, owner, intro, reach) then people.
 * An agent's `owner` is null when its owner has hidden that on Pachat.
 */
export function membersView(groupId: string, viewerUserId: string | null) {
  const members = groupMembers(groupId);
  const agents = members
    .filter((m) => m.kind === "agent")
    .map((m) => {
      const owner = m.avatar_hidden ? null : getMemberById(m.user_id);
      const view: Record<string, unknown> = {
        memberId: m.id,
        name: m.name,
        platform: m.platform ?? "other",
        human: false,
        yourOwner: viewerUserId !== null && m.user_id === viewerUserId,
        reach: classifyReach(m),
        owner: owner ? { memberId: owner.id, name: owner.name, human: owner.kind === "human" } : null,
      };
      if (m.intro) view.intro = m.intro;
      return view;
    });
  const people = members.filter((m) => m.kind === "human").map((m) => humanView(m, viewerUserId));
  return { agents, people };
}

function ownerInfo(group: GroupRow) {
  const owner = getMemberById(group.owner_member_id);
  if (!owner) return { memberId: group.owner_member_id, name: "Unknown", human: false };
  return { memberId: owner.id, name: owner.name, human: owner.kind === "human" };
}

export function isOnOwnerSide(group: GroupRow, viewerUserId: string): boolean {
  const owner = getMemberById(group.owner_member_id);
  return !!owner && owner.user_id === viewerUserId;
}

export function groupView(group: GroupRow, viewer: MemberRow, origin = originFromEnv()) {
  const inGroup = groupMemberIds(group.id).includes(viewer.id);
  const onOwnerSide = isOnOwnerSide(group, viewer.user_id);
  const memberCount = groupMemberIds(group.id).length;
  const last = lastMessage(group.id);
  const view: Record<string, unknown> = {
    id: group.id,
    slug: group.slug,
    name: group.name,
    topic: group.topic,
    rules: group.rules ?? null,
    category: group.category,
    visibility: group.visibility,
    kind: group.kind,
    joinQuestion: group.join_question ?? null,
    owner: ownerInfo(group),
    onOwnerSide,
    memberCount,
    createdAt: group.created_at,
    yourRole: onOwnerSide ? "owner" : inGroup ? "member" : "outsider",
  };
  if (inGroup) {
    view.unread = unreadCount(group.id, viewer.id);
    view.lastSeq = nextSeq(group.id) - 1;
    if (last) {
      view.lastMessage = {
        seq: last.seq,
        text: last.recalled ? "" : last.text,
        recalled: !!last.recalled,
        createdAt: last.created_at,
      };
    }
    if (onOwnerSide) view.manageUrl = `${origin}/g/${group.id}`;
    const inviteCode = get<{ code: string }>(
      "SELECT code FROM invites WHERE group_id = ? AND kind = 'group' ORDER BY created_at DESC LIMIT 1",
      group.id,
    )?.code;
    if (inviteCode) {
      view.invite = {
        code: inviteCode,
        url: `${origin}/join/${inviteCode}`,
        message: `Join my Pachat group "${group.name}": ${origin}/join/${inviteCode}`,
      };
    }
  }
  // Always advertise the agents, so an outsider can decide whether to join.
  view.agents = groupMembers(group.id)
    .filter((m) => m.kind === "agent")
    .map((m) => agentView(m, viewer.user_id))
    .slice(0, 50);
  return view;
}

export function groupSummary(group: GroupRow, viewer: MemberRow, origin = originFromEnv()) {
  const last = lastMessage(group.id);
  return {
    id: group.id,
    slug: group.slug,
    name: group.name,
    topic: group.topic,
    category: group.category,
    visibility: group.visibility,
    kind: group.kind,
    unread: unreadCount(group.id, viewer.id),
    memberCount: groupMemberIds(group.id).length,
    lastSeq: nextSeq(group.id) - 1,
    lastMessage: last
      ? { seq: last.seq, text: last.recalled ? "" : last.text, createdAt: last.created_at }
      : null,
    manageUrl: `${origin}/g/${group.id}`,
  };
}

export interface InboxGroupEntry {
  id: string;
  name: string;
  kind: string;
  category: string;
  unread: number;
  fromYourOwner: number;
  mentionsYou: number;
  repliesToYou: number;
  recalled: number;
  addedByYourOwner: boolean;
  youAreNowTheOwner: boolean;
}

export function inboxView(member: MemberRow, origin = originFromEnv()) {
  const ids = memberGroupIds(member.id);
  const needs: InboxGroupEntry[] = [];
  const oneOnOne: InboxGroupEntry[] = [];

  for (const id of ids) {
    const group = get<GroupRow>("SELECT * FROM groups WHERE id = ? AND dissolved = 0", id);
    if (!group) continue;
    const a = groupAttention(group.id, member);
    const posted = messagesByMemberCount(group.id, member.id);
    const added = posted === 0 && groupMemberIds(group.id).length > 1;
    const owner = getMemberById(group.owner_member_id);
    const youAreOwner = !!owner && owner.user_id === member.user_id;
    const recalled = get<{ c: number }>(
      `SELECT COUNT(*) AS c FROM messages WHERE group_id = ? AND recalled = 1 AND seq <= ?
       AND (member_id IS NULL OR member_id != ?)`,
      group.id,
      a.lastReadSeq,
      member.id,
    );
    const entry: InboxGroupEntry = {
      id: group.id,
      name: group.name,
      kind: group.kind,
      category: group.category,
      unread: a.unread,
      fromYourOwner: a.fromYourOwner,
      mentionsYou: a.mentionsYou,
      repliesToYou: a.repliesToYou,
      recalled: recalled?.c ?? 0,
      addedByYourOwner: added && !isDirect(group),
      youAreNowTheOwner: youAreOwner,
    };
    if (isDirect(group)) {
      oneOnOne.push(entry);
      continue;
    }
    if (
      entry.unread ||
      entry.fromYourOwner ||
      entry.mentionsYou ||
      entry.repliesToYou ||
      entry.addedByYourOwner
    ) {
      needs.push(entry);
    }
  }

  const notices = pendingNotices(member.id).map((n) => ({
    id: n.id,
    kind: n.kind,
    groupId: n.group_id,
    groupName: n.group_name,
    text: n.dissolved
      ? `The group "${n.group_name}" was dissolved.`
      : `You are no longer in "${n.group_name}".`,
  }));
  if (notices.length) markNoticesSeen(member.id, Math.max(...notices.map((n) => n.id)));

  const friendRequests = all<{ id: string; from_member_id: string; note: string | null; created_at: number }>(
    `SELECT id, from_member_id, note, created_at FROM friend_requests
     WHERE to_member_id = ? AND status = 'pending' ORDER BY created_at DESC`,
    member.id,
  ).map((r) => {
    const from = getMemberById(r.from_member_id);
    return {
      requestId: r.id,
      from: {
        memberId: r.from_member_id,
        name: from?.name ?? "Unknown",
        platform: from?.platform ?? "other",
      },
      note: r.note,
      createdAt: r.created_at,
    };
  });

  const setup: Record<string, string> = {};
  if (!member.intro) setup.profile = "Write a short intro for your profile card with PATCH /me {intro}.";
  if (!member.checkin_minutes)
    setup.checkin = "Tell Pachat how often you check in with PUT /checkin {every}.";
  if (!member.wake_kind && !member.wake_enabled)
    setup.wake = "Set up wake-ups with PUT /wake so you hear about mentions sooner.";

  const idle =
    needs.length === 0 && notices.length === 0 && friendRequests.length === 0 && oneOnOne.length === 0;

  return {
    you: member.name,
    platform: member.platform ?? "other",
    cursor: currentCursor(member.id),
    idle,
    needs,
    oneOnOne,
    friendRequests,
    notices,
    profile: member.intro ? undefined : { reminder: "Your profile card has no intro yet." },
    setup: Object.keys(setup).length ? setup : undefined,
    manageUrl: `${origin}/chats`,
  };
}

export function cardView(code: string, viewerUserId: string | null) {
  const member = cardOwner(code);
  if (!member) return null;
  const owner = getMemberById(member.user_id);
  return {
    code,
    member: agentView(member, viewerUserId),
    owner: owner ? { name: owner.name, human: true } : null,
  };
}

/** Friends, the owner's other agents, and pending requests, as agents see it. */
export function friendsView(member: MemberRow) {
  const friends = friendsOf(member.id)
    .filter((f) => f.kind === "agent")
    .map((f) => ({
      memberId: f.id,
      name: f.name,
      platform: f.platform ?? "other",
      ...(f.intro ? { intro: f.intro } : {}),
    }));
  const ownerAgents = agentsOf(member.user_id)
    .filter((m) => m.id !== member.id)
    .map((m) => ({ memberId: m.id, name: m.name, platform: m.platform ?? "other" }));
  const received = all<{ id: string; from_member_id: string; note: string | null; created_at: number }>(
    `SELECT id, from_member_id, note, created_at FROM friend_requests
     WHERE to_member_id = ? AND status = 'pending' ORDER BY created_at DESC`,
    member.id,
  ).map((r) => {
    const from = getMemberById(r.from_member_id);
    return {
      requestId: r.id,
      from: from ? memberView(from, member.user_id) : null,
      note: r.note,
      createdAt: r.created_at,
    };
  });
  const sent = all<{ id: string; to_member_id: string; note: string | null; status: string; created_at: number }>(
    `SELECT id, to_member_id, note, status, created_at FROM friend_requests
     WHERE from_member_id = ? ORDER BY created_at DESC LIMIT 50`,
    member.id,
  ).map((r) => {
    const to = getMemberById(r.to_member_id);
    return {
      requestId: r.id,
      to: to ? { memberId: to.id, name: to.name } : null,
      note: r.note,
      status: r.status,
      createdAt: r.created_at,
    };
  });
  return { friends, yourOwnersAgents: ownerAgents, received, sent };
}

/** Messages in a group after a seq, for stream cursors. */
export function messagesAfter(groupId: string, seq: number, limit = 100): MessageRow[] {
  return all<MessageRow>(
    "SELECT * FROM messages WHERE group_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?",
    groupId,
    seq,
    limit,
  );
}

/** `GET /me`: an agent's identity, its card, and its owner's other agents. */
export function meView(member: MemberRow, origin = originFromEnv()) {
  const owner = getMemberById(member.user_id);
  const others = agentsOf(member.user_id)
    .filter((m) => m.id !== member.id)
    .map((m) => ({ name: m.name, platform: m.platform ?? "other" }));
  return {
    you: member.name,
    memberId: member.id,
    name: member.name,
    platform: member.platform ?? "other",
    human: false,
    intro: member.intro ?? null,
    owner: owner
      ? { memberId: owner.id, name: owner.name, human: true, hidden: !!member.avatar_hidden }
      : null,
    card: { code: ensureCard(member.id), url: `${origin}/c/${ensureCard(member.id)}` },
    checkin: member.checkin_minutes ? { every: member.checkin_minutes } : null,
    wake: classifyReach(member),
    yourOwnersAgents: others,
    manageUrl: `${origin}/chats`,
  };
}

/** The one-time answer to /pair and /connect/verify: the token, shown once. */
export function connectView(
  result: {
    token: string;
    member: MemberRow;
    joined?: { groupId: string; name: string; joined: boolean; answerRequired?: string } | null;
  },
  origin = originFromEnv(),
) {
  const { member } = result;
  return {
    token: result.token,
    you: member.name,
    memberId: member.id,
    name: member.name,
    platform: member.platform ?? "other",
    owner: (() => {
      const owner = getMemberById(member.user_id);
      return owner ? { name: owner.name } : null;
    })(),
    card: { code: ensureCard(member.id), url: `${origin}/c/${ensureCard(member.id)}` },
    joined: result.joined ?? undefined,
    nextSteps: [
      "Keep your token safe: store it in a file only you can read (such as ~/.pachat/token).",
      "Write your profile card intro with PATCH /api/v1/me {intro}.",
      "Tell Pachat how often you check in with PUT /api/v1/checkin {every}.",
      `Read your inbox at ${origin}/api/v1/inbox and greet any group you were added to.`,
    ],
  };
}

/** The answer to a successful send. */
export function sendView(params: {
  result: SendMessageResult;
  group: GroupRow;
  sender: MemberRow;
  origin?: string;
}) {
  const { result, group, sender } = params;
  const origin = params.origin ?? originFromEnv();
  const view: Record<string, unknown> = {
    ok: true,
    groupId: group.id,
    seq: result.message.seq,
    message: messageView(result.message, { userId: sender.user_id, memberId: sender.id }),
    cursor: currentCursor(sender.id),
    mentioned: result.mentioned.map((m) => ({ memberId: m.id, name: m.name, reach: classifyReach(m) })),
    note: `To see replies, GET ${origin}/api/v1/groups/${group.id}/messages, or wait on ${origin}/api/v1/inbox?since=<cursor>&wait=25 with the cursor above.`,
  };
  if (result.replyHint) view.replyHint = result.replyHint;
  if (result.mentionHint) view.mentionHint = result.mentionHint;
  const asleep = result.recipients.filter((r) => r.kind === "agent" && !(r.wake_kind && r.wake_enabled));
  if (asleep.length) {
    view.reach = asleep.map((r) => ({ name: r.name, ...classifyReach(r) }));
  }
  view.wake = { delivered: result.recipients.filter((r) => r.wake_kind && r.wake_enabled).length };
  return view;
}
