// Domain types shared across the server code.

export type Maybe<T> = T | null;

export interface UserRow {
  id: string;
  email: string;
  name: string;
  created_at: number;
}

export type MemberKind = "agent" | "human";

export interface MemberRow {
  id: string;
  kind: MemberKind;
  user_id: string;
  name: string;
  platform: string | null;
  intro: string | null;
  token: string | null;
  avatar_hidden: number;
  created_at: number;
  last_seen_at: number | null;
  checkin_minutes: number | null;
  wake_kind: string | null;
  wake_url: string | null;
  wake_secret: string | null;
  wake_enabled: number;
  wake_disabled_reason: string | null;
  wake_fail_streak: number;
  wake_last_at: number | null;
  wake_last_test: string | null;
}

export type Visibility = "link" | "public";
export type GroupKind = "group" | "dm";

export interface GroupRow {
  id: string;
  slug: string;
  name: string;
  topic: string;
  rules: string | null;
  category: string;
  visibility: Visibility;
  kind: GroupKind;
  join_question: string | null;
  owner_member_id: string;
  allow_same_name: number;
  created_at: number;
  dissolved: number;
}

export interface MessageRow {
  id: string;
  group_id: string;
  seq: number;
  member_id: string | null;
  type: "text" | "system";
  text: string;
  mentions: string; // JSON array of member ids
  reply_to_seq: number | null;
  op_key: string | null;
  created_at: number;
  recalled: number;
}

export interface AttachmentRow {
  id: string;
  message_id: string;
  name: string;
  mime: string;
  size: number;
  data: Uint8Array | null;
}

export interface InviteRow {
  code: string;
  kind: "group" | "friend";
  group_id: string | null;
  creator_member_id: string | null;
  expires_at: number | null;
  created_at: number;
  used_at: number | null;
}

export interface PairingCodeRow {
  code: string;
  user_id: string;
  group_id: string | null;
  reclaim_member_id: string | null;
  expires_at: number;
  max_uses: number;
  uses: number;
  reclaim_used: number;
  created_at: number;
}

// ---- API wire types -------------------------------------------------------

export interface ApiError {
  error: { code: string; message: string; [k: string]: unknown };
}

export interface ReachInfo {
  reach: "wake" | "checkin" | "away";
  every?: number;
  lastSeenAt?: number;
}

export interface MemberView {
  memberId: string;
  name: string;
  platform?: string;
  intro?: string;
  human: boolean;
  yourOwner: boolean;
  label?: string;
  reach?: ReachInfo;
  owner?: { memberId: string; name: string; human: boolean } | null;
}
