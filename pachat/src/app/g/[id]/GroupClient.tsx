"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  addAgent,
  createInvite,
  dissolveGroupAction,
  leaveGroup,
  removeMember,
  sendMessageAction,
  transferOwner,
  updateGroupSettings,
  type FormState,
} from "@/app/actions";

const CATEGORIES = [
  "other",
  "investing",
  "legal",
  "business",
  "tech",
  "travel",
  "food",
  "sports",
  "health",
  "education",
];

function CopyField({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input readOnly value={value} className="input font-mono text-[13px]" onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="btn btn-ghost btn-sm flex-none"
        onClick={() =>
          navigator.clipboard?.writeText(value).then(
            () => {
              setDone(true);
              setTimeout(() => setDone(false), 1500);
            },
            () => {},
          )
        }
      >
        {done ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function Composer({ groupId }: { groupId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(sendMessageAction, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="card p-3">
      <input type="hidden" name="groupId" value={groupId} />
      <textarea
        name="text"
        rows={2}
        placeholder="Message the group…  @name to mention"
        className="textarea border-0 shadow-none focus:shadow-none px-1 resize-none"
      />
      <div className="flex items-center justify-between gap-3 mt-1">
        <p className="faint text-[12px] hidden sm:block">
          @Name mentions one member · “all agents” pings every agent
        </p>
        <button className="btn btn-primary btn-sm ml-auto" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </button>
      </div>
      {state?.error ? (
        <p className="text-[13px] text-[var(--color-warn)] px-1 pt-1">{state.error}</p>
      ) : null}
    </form>
  );
}

export function LeaveButton({ groupId }: { groupId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(leaveGroup, null);
  return (
    <form action={action}>
      <input type="hidden" name="groupId" value={groupId} />
      <button className="btn btn-ghost btn-sm" disabled={pending}>
        Leave group
      </button>
      {state?.error ? (
        <p className="text-[13px] text-[var(--color-warn)] mt-1">{state.error}</p>
      ) : null}
    </form>
  );
}

export interface ManageMember {
  memberId: string;
  name: string;
  platform: string | null;
  human: boolean;
  isOwner: boolean;
}

export function Manage({
  groupId,
  name,
  topic,
  category,
  visibility,
  inviteUrl,
  members,
  addableAgents,
  canDissolve,
}: {
  groupId: string;
  name: string;
  topic: string;
  category: string;
  visibility: string;
  inviteUrl: string | null;
  members: ManageMember[];
  addableAgents: { id: string; name: string; platform: string }[];
  canDissolve: boolean;
}) {
  const [settingsState, settingsAction, settingsPending] = useActionState<FormState, FormData>(
    updateGroupSettings,
    null,
  );
  const [inviteState, inviteAction, invitePending] = useActionState<FormState, FormData>(
    createInvite,
    null,
  );
  const [addState, addAction, addPending] = useActionState<FormState, FormData>(addAgent, null);
  const [removeState, removeAction] = useActionState<FormState, FormData>(removeMember, null);
  const [transferState, transferAction] = useActionState<FormState, FormData>(transferOwner, null);
  const [dissolveState, dissolveAction, dissolvePending] = useActionState<FormState, FormData>(
    dissolveGroupAction,
    null,
  );

  const status =
    settingsState?.message ??
    settingsState?.error ??
    addState?.message ??
    addState?.error ??
    removeState?.message ??
    removeState?.error ??
    transferState?.message ??
    transferState?.error ??
    inviteState?.error ??
    dissolveState?.error ??
    null;
  const statusError =
    settingsState?.error || addState?.error || removeState?.error || transferState?.error || inviteState?.error || dissolveState?.error;

  const shareUrl = inviteState?.url ?? inviteUrl;

  return (
    <div className="card p-5 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-[16px]">Manage</h2>
        {status ? (
          <p className={`text-[13px] ${statusError ? "text-[var(--color-warn)]" : "text-[var(--color-good)]"}`}>
            {status}
          </p>
        ) : null}
      </div>

      {/* Settings */}
      <form action={settingsAction} className="space-y-3">
        <input type="hidden" name="groupId" value={groupId} />
        <label className="block">
          <span className="text-[13px] muted mb-1 block">Name</span>
          <input name="name" className="input" defaultValue={name} required />
        </label>
        <label className="block">
          <span className="text-[13px] muted mb-1 block">Topic</span>
          <input name="topic" className="input" defaultValue={topic} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[13px] muted mb-1 block">Category</span>
            <select name="category" className="select" defaultValue={category}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[13px] muted mb-1 block">Visibility</span>
            <select name="visibility" className="select" defaultValue={visibility}>
              <option value="link">Invite link</option>
              <option value="public">Public</option>
            </select>
          </label>
        </div>
        <button className="btn btn-soft btn-sm" disabled={settingsPending}>
          {settingsPending ? "Saving…" : "Save settings"}
        </button>
      </form>

      <div className="hairline" />

      {/* Invite */}
      <div>
        <h3 className="font-semibold text-[14.5px] mb-2">Invite people</h3>
        {shareUrl ? (
          <CopyField value={shareUrl} />
        ) : (
          <form action={inviteAction}>
            <input type="hidden" name="groupId" value={groupId} />
            <button className="btn btn-soft btn-sm" disabled={invitePending}>
              {invitePending ? "Creating…" : "Create invite link"}
            </button>
          </form>
        )}
      </div>

      <div className="hairline" />

      {/* Add agents */}
      <div>
        <h3 className="font-semibold text-[14.5px] mb-2">Your agents</h3>
        {addableAgents.length === 0 ? (
          <p className="muted text-[13.5px]">All of your agents are already here.</p>
        ) : (
          <form action={addAction} className="flex gap-2">
            <input type="hidden" name="groupId" value={groupId} />
            <select name="agentId" className="select" required defaultValue="">
              <option value="" disabled>
                Choose an agent…
              </option>
              {addableAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <button className="btn btn-soft btn-sm flex-none" disabled={addPending}>
              Add
            </button>
          </form>
        )}
      </div>

      <div className="hairline" />

      {/* Members */}
      <div>
        <h3 className="font-semibold text-[14.5px] mb-2">Members</h3>
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.memberId} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium truncate">
                  {m.name}
                  {m.human ? <span className="faint font-normal"> · person</span> : null}
                  {m.isOwner ? <span className="faint font-normal"> · owner</span> : null}
                </p>
              </div>
              {!m.isOwner ? (
                <div className="flex items-center gap-1.5">
                  <form action={transferAction}>
                    <input type="hidden" name="groupId" value={groupId} />
                    <input type="hidden" name="memberId" value={m.memberId} />
                    <button className="btn btn-ghost btn-sm">Make owner</button>
                  </form>
                  <form action={removeAction}>
                    <input type="hidden" name="groupId" value={groupId} />
                    <input type="hidden" name="memberId" value={m.memberId} />
                    <button className="btn btn-ghost btn-sm">Remove</button>
                  </form>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {/* Danger zone */}
      {canDissolve ? (
        <>
          <div className="hairline" />
          <details>
            <summary className="text-[14px] muted cursor-pointer select-none">Danger zone</summary>
            <form action={dissolveAction} className="mt-3">
              <input type="hidden" name="groupId" value={groupId} />
              <button className="btn btn-ghost btn-sm text-[var(--color-warn)]" disabled={dissolvePending}>
                {dissolvePending ? "Dissolving…" : "Dissolve this group"}
              </button>
            </form>
          </details>
        </>
      ) : null}
    </div>
  );
}
