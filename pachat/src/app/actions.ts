"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { get } from "@/lib/db";
import { createSessionValue, sessionCookieName, sessionMaxAge } from "@/lib/auth";
import { connectStart, ownerSignIn } from "@/lib/pairing";
import {
  createGroupForMember,
  createGroupInvite,
  makePairingCode,
  openChatFor,
  postSystem,
  sendMessage,
} from "@/lib/service";
import { publish } from "@/lib/events";
import { ApiError } from "@/lib/api";
import {
  addFriendship,
  addGroupMember,
  agentsOf,
  countOutsiders,
  dissolveGroup,
  findInvite,
  getFriendRequest,
  getGroupById,
  getMemberById,
  groupMemberIds,
  groupMembers,
  isGroupMember,
  markRead,
  removeGroupMember,
  setFriendRequestStatus,
  setGroupOwner,
  updateGroup,
} from "@/lib/repo";
import { humanMemberFor, requireUser } from "@/lib/web";

export type FormState = {
  error?: string;
  ok?: boolean;
  code?: string;
  instruction?: string;
  url?: string;
  message?: string;
} | null;

export interface LoginState {
  step: "email" | "code";
  error?: string;
  requestId?: string;
  devCode?: string;
  email?: string;
}

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function lastSeq(groupId: string): number {
  return get<{ s: number | null }>("SELECT MAX(seq) AS s FROM messages WHERE group_id = ?", groupId)?.s ?? 0;
}

// ---- Auth -----------------------------------------------------------------

export async function startLogin(_prev: LoginState | null, fd: FormData): Promise<LoginState> {
  const email = str(fd, "email");
  const ownerName = str(fd, "ownerName");
  try {
    const result = connectStart({ email, ownerName: ownerName || null, invite: null });
    return { step: "code", requestId: result.requestId, devCode: result.devCode, email };
  } catch (err) {
    return { step: "email", error: (err as Error).message, email };
  }
}

export async function verifyLogin(_prev: LoginState | null, fd: FormData): Promise<LoginState> {
  const requestId = str(fd, "requestId");
  const code = str(fd, "code");
  const email = str(fd, "email");
  let userId: string;
  try {
    const { user } = ownerSignIn({ requestId, code });
    userId = user.id;
  } catch (err) {
    return { step: "code", error: (err as Error).message, requestId, email };
  }
  const store = await cookies();
  store.set(sessionCookieName(), createSessionValue(userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: sessionMaxAge(),
    secure: process.env.NODE_ENV === "production",
  });
  redirect("/chats");
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  store.delete(sessionCookieName());
  redirect("/");
}

// ---- Groups & chats -------------------------------------------------------

export async function createGroup(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const human = humanMemberFor(user);
  const name = str(fd, "name");
  const topic = str(fd, "topic");
  const category = str(fd, "category") || "other";
  const visibility = str(fd, "visibility") === "public" ? "public" : "link";
  let groupId: string;
  try {
    const group = createGroupForMember({ name, topic, category, visibility, owner: human });
    groupId = group.id;
  } catch (err) {
    return { error: (err as Error).message };
  }
  revalidatePath("/chats");
  redirect(`/g/${groupId}`);
}

export async function updateGroupSettings(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  const group = getGroupById(groupId);
  if (!group) return { error: "That group no longer exists." };
  if (getMemberById(group.owner_member_id)?.user_id !== user.id) {
    return { error: "Only the owner's side can change these settings." };
  }
  const name = str(fd, "name");
  if (!name) return { error: "A group needs a name." };
  const visibility = str(fd, "visibility") === "public" ? "public" : "link";
  updateGroup(group.id, {
    name,
    topic: str(fd, "topic"),
    category: str(fd, "category") || group.category,
    visibility,
  });
  postSystem(group.id, `${user.name} updated the group settings.`, {});
  revalidatePath(`/g/${group.id}`);
  return { ok: true, message: "Saved." };
}

export async function sendMessageAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const human = humanMemberFor(user);
  const groupId = str(fd, "groupId");
  const text = str(fd, "text");
  const group = getGroupById(groupId);
  if (!group) return { error: "That group no longer exists." };
  if (!groupMemberIds(group.id).includes(human.id)) return { error: "You're not in that group." };
  if (!text) return { error: "" };
  try {
    // The owner is looking at the chat, so read up to now first.
    markRead(group.id, human.id, lastSeq(group.id));
    sendMessage({ group, sender: human, text, mentions: broadcastMentions(group.id, text), ignoreNew: true });
  } catch (err) {
    if (err instanceof ApiError) return { error: err.message };
    return { error: "Could not send that." };
  }
  revalidatePath(`/g/${group.id}`);
  return { ok: true };
}

/** @-names are resolved inside sendMessage; this adds the two broadcast forms. */
function broadcastMentions(groupId: string, text: string): string[] {
  const out: string[] = [];
  const members = groupMembers(groupId);
  if (/\ball agents\b/i.test(text)) for (const m of members) if (m.kind === "agent") out.push(m.id);
  if (/\ball people\b/i.test(text)) for (const m of members) if (m.kind === "human") out.push(m.id);
  return out;
}

export async function markGroupRead(fd: FormData): Promise<void> {
  const user = await requireUser();
  const human = humanMemberFor(user);
  const groupId = String(fd.get("groupId") ?? "");
  const group = getGroupById(groupId);
  if (!group || !groupMemberIds(group.id).includes(human.id)) return;
  markRead(group.id, human.id, lastSeq(group.id));
}

export async function leaveGroup(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const human = humanMemberFor(user);
  const groupId = str(fd, "groupId");
  const group = getGroupById(groupId);
  if (!group) return { error: "That group no longer exists." };
  if (!groupMemberIds(group.id).includes(human.id)) return { error: "You're not in that group." };

  const wasOwner = group.owner_member_id === human.id;
  removeGroupMember(group.id, human.id);
  if (wasOwner) {
    const remaining = groupMembers(group.id);
    const successor =
      remaining.find((m) => m.kind === "human" && m.user_id === human.user_id) ??
      remaining.find((m) => m.user_id === human.user_id) ??
      remaining[0] ??
      null;
    if (!successor) {
      dissolveGroup(group.id);
      revalidatePath("/chats");
      redirect("/chats");
    }
    setGroupOwner(group.id, successor.id);
    postSystem(group.id, `${human.name} left. ${successor.name} now owns the group.`, {
      exceptMemberId: human.id,
    });
  } else if (groupMemberIds(group.id).length > 0) {
    postSystem(group.id, `${human.name} left the group.`, { exceptMemberId: human.id });
  }
  revalidatePath("/chats");
  redirect("/chats");
}

export async function dissolveGroupAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  const group = getGroupById(groupId);
  if (!group) return { error: "That group no longer exists." };
  if (getMemberById(group.owner_member_id)?.user_id !== user.id) {
    return { error: "Only the owner's side can dissolve this group." };
  }
  if (countOutsiders(group.id, user.id) > 0) {
    return { error: "People outside your account are here. Remove them first." };
  }
  dissolveGroup(group.id);
  revalidatePath("/chats");
  redirect("/chats");
}

export async function transferOwner(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  const memberId = str(fd, "memberId");
  const group = getGroupById(groupId);
  if (!group) return { error: "That group no longer exists." };
  if (getMemberById(group.owner_member_id)?.user_id !== user.id) {
    return { error: "Only the owner's side can hand this group on." };
  }
  if (!isGroupMember(group.id, memberId)) return { error: "They're not in this group." };
  setGroupOwner(group.id, memberId);
  const next = getMemberById(memberId);
  postSystem(group.id, `${next?.name ?? "A member"} now owns the group.`, {});
  revalidatePath(`/g/${group.id}`);
  return { ok: true, message: `${next?.name ?? "Member"} now owns the group.` };
}

export async function removeMember(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  const memberId = str(fd, "memberId");
  const group = getGroupById(groupId);
  if (!group) return { error: "That group no longer exists." };
  if (getMemberById(group.owner_member_id)?.user_id !== user.id) {
    return { error: "Only the owner's side can remove members." };
  }
  if (memberId === group.owner_member_id) {
    return { error: "The owner can't be removed. Hand the group on first." };
  }
  const member = getMemberById(memberId);
  if (!member) return { error: "No such member." };
  removeGroupMember(group.id, memberId);
  // A person goes with their agents.
  if (member.kind === "human") {
    for (const a of agentsOf(member.user_id)) {
      if (groupMemberIds(group.id).includes(a.id)) removeGroupMember(group.id, a.id);
    }
  }
  postSystem(group.id, `${member.name} was removed from the group.`, { exceptMemberId: memberId });
  revalidatePath(`/g/${group.id}`);
  return { ok: true, message: `${member.name} removed.` };
}

export async function createInvite(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId");
  const group = getGroupById(groupId);
  if (!group) return { error: "That group no longer exists." };
  if (getMemberById(group.owner_member_id)?.user_id !== user.id) {
    return { error: "Only the owner's side can invite." };
  }
  const invite = createGroupInvite(group);
  revalidatePath(`/g/${group.id}`);
  return { ok: true, url: invite.url };
}

export async function addAgent(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const human = humanMemberFor(user);
  const groupId = str(fd, "groupId");
  const agentId = str(fd, "agentId");
  const group = getGroupById(groupId);
  if (!group) return { error: "That group no longer exists." };
  const agent = getMemberById(agentId);
  if (!agent || agent.kind !== "agent" || agent.user_id !== user.id) {
    return { error: "That's not one of your agents." };
  }
  if (groupMemberIds(group.id).length >= 50) return { error: "This group is full (50 members)." };
  if (!isGroupMember(group.id, agent.id)) {
    addGroupMember(group.id, agent.id, human.id);
    publish([agent.id], "group_added", group.id);
    postSystem(group.id, `${agent.name} was added to the group.`, { exceptMemberId: agent.id });
  }
  revalidatePath(`/g/${group.id}`);
  return { ok: true, message: `${agent.name} added.` };
}

export async function createPairingCode(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const groupId = str(fd, "groupId") || null;
  const result = makePairingCode({ userId: user.id, groupId });
  return { ok: true, code: result.code, instruction: result.instruction };
}

export async function reclaimAgent(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const agentId = str(fd, "agentId");
  const agent = getMemberById(agentId);
  if (!agent || agent.kind !== "agent" || agent.user_id !== user.id) {
    return { error: "That's not one of your agents." };
  }
  const result = makePairingCode({ userId: user.id, reclaimMemberId: agent.id });
  return { ok: true, code: result.code, instruction: result.instruction };
}

export async function respondFriendRequest(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const human = humanMemberFor(user);
  const requestId = str(fd, "requestId");
  const action = str(fd, "action");
  const req = getFriendRequest(requestId);
  if (!req || req.to_member_id !== human.id) return { error: "That request is gone." };
  if (action === "accept") {
    addFriendship(req.from_member_id, human.id);
    setFriendRequestStatus(requestId, "accepted");
    const other = getMemberById(req.from_member_id);
    if (other) {
      const chat = openChatFor(human, other);
      publish([other.id], "notice", chat.id);
    }
  } else {
    setFriendRequestStatus(requestId, "ignored");
  }
  revalidatePath("/chats");
  return { ok: true, message: action === "accept" ? "You're now friends." : "Request dismissed." };
}

/** Form-only wrapper so a plain <form action={...}> can accept or ignore. */
export async function respondRequestForm(fd: FormData): Promise<void> {
  await respondFriendRequest(null, fd);
}

export async function openChat(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const human = humanMemberFor(user);
  const memberId = str(fd, "memberId");
  const other = getMemberById(memberId);
  if (!other) return { error: "No such member." };
  const chat = openChatFor(human, other);
  redirect(`/g/${chat.id}`);
}

export async function joinPublicGroup(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const human = humanMemberFor(user);
  const groupId = str(fd, "groupId");
  const group = getGroupById(groupId);
  if (!group) return { error: "That group no longer exists." };
  if (group.visibility !== "public") return { error: "That group is link-only." };
  if (!isGroupMember(group.id, human.id)) {
    addGroupMember(group.id, human.id, null);
    publish([human.id], "group_added", group.id);
  }
  revalidatePath("/world");
  redirect(`/g/${group.id}`);
}

export async function acceptInvite(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const human = humanMemberFor(user);
  const code = str(fd, "code").replace(/.*\//, "");
  const invite = findInvite(code);
  if (!invite || invite.kind !== "group" || !invite.group_id) {
    return { error: "That invite link isn't valid." };
  }
  const group = getGroupById(invite.group_id);
  if (!group) return { error: "That group no longer exists." };
  if (!isGroupMember(group.id, human.id)) {
    addGroupMember(group.id, human.id, null);
    publish([human.id], "group_added", group.id);
  }
  redirect(`/g/${group.id}`);
}
