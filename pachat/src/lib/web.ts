import { redirect } from "next/navigation";
import { all, get } from "./db";
import { getSessionUser } from "./auth";
import {
  agentsOf,
  classifyReach,
  ensureCard,
  ensureHumanMember,
  friendsOf,
  getGroupById,
  getMemberById,
  groupMemberIds,
  memberGroupIds,
} from "./repo";
import { groupSummary, isOnOwnerSide, membersView, originFromEnv } from "./views";
import { messageView } from "./service";
import type { MemberRow, MessageRow, UserRow } from "./types";

// The website reads and writes as the owner's own human member, so the owner
// can post on pachat.ai exactly as an agent would see them ("your owner").

export async function requireUser(): Promise<UserRow> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** The owner's human member, created on demand the first time they act. */
export function humanMemberFor(user: UserRow): MemberRow {
  return ensureHumanMember(user);
}

export interface DashGroup {
  id: string;
  name: string;
  topic: string;
  category: string;
  kind: string;
  visibility: string;
  unread: number;
  memberCount: number;
  onOwnerSide: boolean;
  last: { seq: number; text: string; createdAt: number } | null;
}

export interface DashAgent {
  id: string;
  name: string;
  platform: string;
  intro: string | null;
  reach: ReturnType<typeof classifyReach>;
  cardCode: string;
  groups: string[];
  lastSeenAt: number | null;
}

export interface Dashboard {
  user: UserRow;
  human: MemberRow;
  groups: DashGroup[];
  chats: DashGroup[];
  agents: DashAgent[];
  friends: { memberId: string; name: string; platform: string; intro?: string }[];
  requests: { requestId: string; from: { memberId: string; name: string; platform: string }; note: string | null }[];
}

function toDashGroup(groupId: string, human: MemberRow): DashGroup | null {
  const group = getGroupById(groupId);
  if (!group || group.dissolved) return null;
  const s = groupSummary(group, human);
  return {
    id: group.id,
    name: group.name,
    topic: group.topic,
    category: group.category,
    kind: group.kind,
    visibility: group.visibility,
    unread: s.unread,
    memberCount: s.memberCount,
    onOwnerSide: isOnOwnerSide(group, human.user_id),
    last: s.lastMessage ? { seq: s.lastMessage.seq, text: s.lastMessage.text, createdAt: s.lastMessage.createdAt } : null,
  };
}

export function dashboardFor(user: UserRow, human: MemberRow): Dashboard {
  const ids = memberGroupIds(human.id);
  const rows = ids.map((id) => toDashGroup(id, human)).filter((g): g is DashGroup => !!g);

  const groups = rows.filter((g) => g.kind !== "dm");
  const chats = rows.filter((g) => g.kind === "dm");

  const agents: DashAgent[] = agentsOf(user.id).map((a) => {
    const mids = memberGroupIds(a.id);
    const names = mids
      .map((id) => getGroupById(id))
      .filter((g): g is NonNullable<typeof g> => !!g && !g.dissolved)
      .map((g) => g.name);
    return {
      id: a.id,
      name: a.name,
      platform: a.platform ?? "other",
      intro: a.intro ?? null,
      reach: classifyReach(a),
      cardCode: ensureCard(a.id),
      groups: names,
      lastSeenAt: a.last_seen_at ?? null,
    };
  });

  const friends = friendsOf(human.id)
    .filter((f) => f.kind === "agent")
    .map((f) => ({
      memberId: f.id,
      name: f.name,
      platform: f.platform ?? "other",
      ...(f.intro ? { intro: f.intro } : {}),
    }));

  const requests = all<{ id: string; from_member_id: string; note: string | null }>(
    `SELECT id, from_member_id, note FROM friend_requests
     WHERE to_member_id = ? AND status = 'pending' ORDER BY created_at DESC`,
    human.id,
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
    };
  });

  return { user, human, groups, chats, agents, friends, requests };
}

export interface GroupDetail {
  group: {
    id: string;
    name: string;
    topic: string;
    rules: string | null;
    category: string;
    visibility: string;
    kind: string;
    joinQuestion: string | null;
    ownerName: string;
    ownerMemberId: string;
    onOwnerSide: boolean;
  };
  members: ReturnType<typeof membersView>;
  messages: ReturnType<typeof messageView>[];
  invite: { code: string; url: string } | null;
}

export function groupDetailFor(groupId: string, user: UserRow): GroupDetail | null {
  const group = getGroupById(groupId);
  if (!group || group.dissolved) return null;
  const human = humanMemberFor(user);
  if (!groupMemberIds(group.id).includes(human.id) && !isOnOwnerSide(group, user.id)) return null;

  const rows = all<MessageRow>(
    "SELECT * FROM messages WHERE group_id = ? ORDER BY seq DESC LIMIT 80",
    group.id,
  ).reverse();
  const messages = rows.map((m) => messageView(m, { userId: user.id, memberId: human.id }));

  const invite = get<{ code: string }>(
    "SELECT code FROM invites WHERE group_id = ? AND kind = 'group' ORDER BY created_at DESC LIMIT 1",
    group.id,
  );
  const owner = getMemberById(group.owner_member_id);

  return {
    group: {
      id: group.id,
      name: group.name,
      topic: group.topic,
      rules: group.rules ?? null,
      category: group.category,
      visibility: group.visibility,
      kind: group.kind,
      joinQuestion: group.join_question ?? null,
      ownerName: owner?.name ?? "Unknown",
      ownerMemberId: group.owner_member_id,
      onOwnerSide: isOnOwnerSide(group, user.id),
    },
    members: membersView(group.id, user.id),
    messages,
    invite: invite ? { code: invite.code, url: `${originFromEnv()}/join/${invite.code}` } : null,
  };
}
