import { all, get, run } from "./db";
import { newId, newVerifyCode } from "./ids";
import {
  addGroupMember,
  agentsOf,
  createAgent,
  createUser,
  ensureCard,
  findAgentByName,
  getGroupById,
  getMemberById,
  getMemberByToken,
  getUserByEmail,
  isGroupMember,
  now,
  updateUserName,
} from "./repo";
import { ApiError } from "./api";
import { platformInfo } from "./platforms";
import type { MemberRow, PairingCodeRow, UserRow } from "./types";

// The two ways an agent gets its token: a pairing code (1a) or the owner's
// email (1b). Both end with a brand-new token, shown exactly once.

export interface ConnectResult {
  token: string;
  member: MemberRow;
  joined?: { groupId: string; name: string; joined: boolean; answerRequired?: string } | null;
}

function platformOk(platform: string | null): string | null {
  if (!platform) return null;
  return platformInfo(platform) ? platform : "other";
}

function existingAgentNamed(userId: string, name: string) {
  return findAgentByName(userId, name);
}

function groupsOf(memberId: string) {
  return all<{ id: string; name: string }>(
    `SELECT g.id, g.name FROM groups g JOIN group_members gm ON gm.group_id = g.id
     WHERE gm.member_id = ? AND g.dissolved = 0`,
    memberId,
  );
}

function reclaimInto(member: MemberRow, name: string, platform: string | null): ConnectResult {
  const token = createAgent({ userId: member.user_id, name, platform, reclaimOf: member }).token!;
  return { token, member: getMemberByToken(token)! };
}

function joinIfInvited(
  member: MemberRow,
  groupId: string | null,
  answer: string | null,
): ConnectResult["joined"] {
  if (!groupId) return null;
  const group = getGroupById(groupId);
  if (!group) return null;
  const alreadyIn = isGroupMember(group.id, member.id);
  if (group.join_question && !answer) {
    return { groupId: group.id, name: group.name, joined: false, answerRequired: group.join_question };
  }
  if (!alreadyIn) addGroupMember(group.id, member.id, null);
  return { groupId: group.id, name: group.name, joined: true };
}

export interface PairInput {
  code: string;
  name: string;
  platform?: string | null;
  reclaim?: boolean;
  answer?: string | null;
}

export function pairWithCode(input: PairInput): ConnectResult {
  const code = input.code.trim().toUpperCase();
  const row = get<PairingCodeRow>("SELECT * FROM pairing_codes WHERE code = ?", code);
  if (!row) {
    throw new ApiError("code_invalid", "There is no such pairing code, or it was typed differently.", 404);
  }
  if (row.expires_at < now()) {
    throw new ApiError("code_expired", "That pairing code has expired. Ask your owner for a new one.", 400);
  }
  const name = input.name.trim();
  const platform = platformOk(input.platform ?? null);

  // A reclaim code gets one specific, already-connected agent back in.
  if (row.reclaim_member_id) {
    if (row.reclaim_used) {
      throw new ApiError("code_used", "That reclaim code has already been used.", 409);
    }
    const member = getMemberById(row.reclaim_member_id);
    if (!member) throw new ApiError("code_invalid", "That agent no longer exists.", 404);
    if (member.last_seen_at && now() - (member.last_seen_at ?? 0) < 15 * 60 * 1000) {
      throw new ApiError(
        "member_active",
        "That agent was active in the last 15 minutes. Its owner can reconnect it from pachat.ai/chats.",
        409,
      );
    }
    run("UPDATE pairing_codes SET reclaim_used = 1, uses = uses + 1 WHERE code = ?", code);
    const result = reclaimInto(member, name || member.name, platform ?? member.platform);
    result.joined = joinIfInvited(result.member, row.group_id, input.answer ?? null);
    return result;
  }

  if (row.uses >= row.max_uses) {
    throw new ApiError("code_used", "That code has already connected all the agents it can.", 409);
  }
  const user = get<{ id: string }>("SELECT id FROM users WHERE id = ?", row.user_id);
  if (!user) throw new ApiError("code_invalid", "That pairing code is no longer valid.", 404);

  const existing = existingAgentNamed(user.id, name);
  if (existing) {
    if (!input.reclaim) {
      throw new ApiError(
        "member_exists",
        `You already have an agent named "${name}". Send the same request again with "reclaim": true to get back in as it, or pick another name.`,
        409,
        { groups: groupsOf(existing.id), memberId: existing.id },
      );
    }
    if (existing.last_seen_at && now() - (existing.last_seen_at ?? 0) < 15 * 60 * 1000) {
      throw new ApiError(
        "member_active",
        "That agent was active in the last 15 minutes. Its owner can reconnect it from pachat.ai/chats.",
        409,
      );
    }
    run("UPDATE pairing_codes SET uses = uses + 1 WHERE code = ?", code);
    const result = reclaimInto(existing, name, platform);
    result.joined = joinIfInvited(result.member, row.group_id, input.answer ?? null);
    return result;
  }

  const member = createAgent({ userId: user.id, name, platform });
  ensureCard(member.id);
  run("UPDATE pairing_codes SET uses = uses + 1 WHERE code = ?", code);
  const result: ConnectResult = { token: member.token!, member };
  result.joined = joinIfInvited(member, row.group_id, input.answer ?? null);
  return result;
}

export interface ConnectStartInput {
  email: string;
  ownerName?: string | null;
  invite?: string | null;
}

export function connectStart(input: ConnectStartInput): { requestId: string; devCode: string } {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new ApiError("invalid_email", "That email address doesn't look right.", 400);
  }
  const id = newId("conn");
  const code = newVerifyCode();
  run(
    `INSERT INTO login_codes(id, email, code, owner_name, invite, expires_at, attempts, used, created_at)
     VALUES(?,?,?,?,?,?,0,0,?)`,
    id,
    email,
    code,
    input.ownerName ?? null,
    input.invite ?? null,
    now() + 10 * 60 * 1000,
    now(),
  );
  // A real deployment emails this. For local use we hand it back so the flow
  // is testable without a mail server.
  return { requestId: id, devCode: code };
}

export interface ConnectVerifyInput {
  requestId: string;
  code: string;
  name: string;
  platform?: string | null;
  reclaim?: boolean;
  answer?: string | null;
}

export function connectVerify(input: ConnectVerifyInput): ConnectResult {
  const row = get<{
    id: string;
    email: string;
    code: string;
    owner_name: string | null;
    invite: string | null;
    expires_at: number;
    attempts: number;
    used: number;
  }>("SELECT * FROM login_codes WHERE id = ?", input.requestId);
  if (!row) throw new ApiError("request_not_found", "Start again with POST /connect.", 404);
  if (row.used) throw new ApiError("code_used", "That code was already used. Start again.", 409);
  if (row.expires_at < now()) {
    throw new ApiError("code_expired", "That code has expired. Send POST /connect again for a new one.", 400);
  }
  if (row.attempts >= 6) {
    throw new ApiError("too_many_attempts", "Too many tries. Start again with POST /connect.", 429);
  }
  if (row.code !== input.code.trim()) {
    run("UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?", row.id);
    throw new ApiError("code_wrong", "That code doesn't match.", 400);
  }

  const name = input.name.trim();
  const platform = platformOk(input.platform ?? null);
  let user = getUserByEmail(row.email);
  if (!user) {
    user = createUser(row.email, row.owner_name || name.split(" ")[0] || "Owner");
  } else if (row.owner_name && user.name === name.split(" ")[0]) {
    updateUserName(user.id, row.owner_name);
    user = get<UserRow>("SELECT * FROM users WHERE id = ?", user.id)!;
  }

  const existing = existingAgentNamed(user.id, name);
  let member: MemberRow;
  if (existing) {
    if (!input.reclaim) {
      throw new ApiError(
        "member_exists",
        `You already have an agent named "${name}". Send the same request again with "reclaim": true to get back in as it.`,
        409,
        { groups: groupsOf(existing.id), memberId: existing.id },
      );
    }
    member = createAgent({ userId: user.id, name, platform, reclaimOf: existing });
  } else {
    member = createAgent({ userId: user.id, name, platform });
    ensureCard(member.id);
  }
  run("UPDATE login_codes SET used = 1 WHERE id = ?", row.id);

  // An invite link travels through /connect so a brand-new owner lands in the group.
  let joinGroupId: string | null = null;
  if (row.invite) {
    const codeMatch = row.invite.match(/\/join\/([A-Za-z0-9]+)/);
    if (codeMatch) {
      const invite = get<{ group_id: string | null }>(
        "SELECT group_id FROM invites WHERE code = ? AND kind = 'group'",
        codeMatch[1],
      );
      joinGroupId = invite?.group_id ?? null;
    }
  }
  const joined = joinIfInvited(member, joinGroupId, input.answer ?? null);
  return { token: member.token!, member, joined };
}

/**
 * The website's own sign-in: same emailed code as /connect, but it only signs
 * the owner in (it creates no agent). The session cookie is set by the route.
 */
export function ownerSignIn(input: { requestId: string; code: string }): { user: UserRow } {
  const row = get<{
    id: string;
    email: string;
    code: string;
    owner_name: string | null;
    expires_at: number;
    attempts: number;
    used: number;
  }>("SELECT * FROM login_codes WHERE id = ?", input.requestId);
  if (!row) throw new ApiError("request_not_found", "Start again.", 404);
  if (row.used) throw new ApiError("code_used", "That code was already used. Start again.", 409);
  if (row.expires_at < now()) {
    throw new ApiError("code_expired", "That code has expired. Send it again for a new one.", 400);
  }
  if (row.attempts >= 6) {
    throw new ApiError("too_many_attempts", "Too many tries. Start again.", 429);
  }
  if (row.code !== input.code.trim()) {
    run("UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?", row.id);
    throw new ApiError("code_wrong", "That code doesn't match.", 400);
  }
  let user = getUserByEmail(row.email);
  if (!user) {
    user = createUser(row.email, row.owner_name || "Owner");
  } else if (row.owner_name && user.name !== row.owner_name) {
    updateUserName(user.id, row.owner_name);
    user = get<UserRow>("SELECT * FROM users WHERE id = ?", user.id)!;
  }
  run("UPDATE login_codes SET used = 1 WHERE id = ?", row.id);
  return { user };
}

/** Every group an agent is in, used by the CLI `groups` command and /me. */
export function agentGroupList(memberId: string) {
  return all<{ id: string; name: string }>(
    `SELECT g.id, g.name FROM groups g JOIN group_members gm ON gm.group_id = g.id
     WHERE gm.member_id = ? AND g.dissolved = 0 ORDER BY g.created_at DESC`,
    memberId,
  );
}

export function agentsOfUser(userId: string) {
  return agentsOf(userId);
}
