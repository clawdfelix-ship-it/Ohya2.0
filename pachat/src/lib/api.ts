import { NextResponse } from "next/server";
import { agentFromAuthHeader, agentFromQueryToken, getSessionUser } from "./auth";
import { getGroupById, getMemberById, isGroupMember, touchAgent } from "./repo";
import type { GroupRow, MemberRow, UserRow } from "./types";

export class ApiError extends Error {
  code: string;
  status: number;
  extra: Record<string, unknown>;

  constructor(code: string, message: string, status = 400, extra: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

export function apiError(
  code: string,
  message: string,
  status = 400,
  extra: Record<string, unknown> = {},
) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status });
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/** Wrap an API handler so thrown ApiErrors become the documented error shape. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.code, err.message, err.status, err.extra);
    }
    console.error("[api] unexpected", err);
    return apiError("server_error", "Something went wrong.", 500);
  }
}

/** Resolve the calling agent from the Authorization header, or throw 401. */
export function requireAgent(req: Request): MemberRow {
  const member = agentFromAuthHeader(req.headers.get("authorization"));
  if (!member) {
    throw new ApiError("unauthorized", "Missing or invalid agent token.", 401);
  }
  return member;
}

/** Touch last_seen so reach/‘checkin’ stays accurate, then return the agent. */
export function requireAgentTouch(req: Request): MemberRow {
  const agent = requireAgent(req);
  touchAgent(agent.id);
  return agent;
}

export async function requireSessionUser(): Promise<UserRow> {
  const user = await getSessionUser();
  if (!user) throw new ApiError("unauthorized", "Sign in to continue.", 401);
  return user;
}

/**
 * Accept either an agent token (header or ?token=) or a signed-in owner's
 * cookie. Used by attachment/image/file reads that both agents and the web UI
 * fetch.
 */
export async function requireAnyAuth(req: Request): Promise<void> {
  const url = new URL(req.url);
  if (agentFromAuthHeader(req.headers.get("authorization"))) return;
  if (agentFromQueryToken(url)) return;
  if (await getSessionUser()) return;
  throw new ApiError("unauthorized", "Sign in, or send your agent token.", 401);
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError("bad_json", "Request body must be valid JSON.", 400);
  }
}

export function originOf(req: Request): string {
  if (process.env.PACHAT_BASE_URL) return process.env.PACHAT_BASE_URL.replace(/\/$/, "");
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  return `${proto}://${host}`;
}

export function requireString(value: unknown, field: string, opts: { max?: number } = {}): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError("invalid_field", `Field '${field}' is required.`, 400);
  }
  const v = value.trim();
  if (opts.max && v.length > opts.max) {
    throw new ApiError("invalid_field", `Field '${field}' is too long.`, 400);
  }
  return v;
}

// ---- Group guards ---------------------------------------------------------

export function loadGroup(id: string): GroupRow {
  const group = getGroupById(id);
  if (!group) throw new ApiError("group_not_found", "There's no such group, or it was dissolved.", 404);
  return group;
}

export function requireMembership(group: GroupRow, member: MemberRow): void {
  if (!isGroupMember(group.id, member.id)) {
    throw new ApiError("not_member", "You are not in that group.", 403);
  }
}

export function onOwnerSide(group: GroupRow, member: MemberRow): boolean {
  const owner = getMemberById(group.owner_member_id);
  return !!owner && owner.user_id === member.user_id;
}

export function requireOwnerSide(group: GroupRow, member: MemberRow): void {
  if (!onOwnerSide(group, member)) {
    const owner = getMemberById(group.owner_member_id);
    throw new ApiError(
      "not_owner",
      owner
        ? `Only the owner's side manages this group. It's owned by ${owner.name}.`
        : "Only the owner's side manages this group.",
      403,
      { owner: owner ? { memberId: owner.id, name: owner.name, human: owner.kind === "human" } : null },
    );
  }
}
