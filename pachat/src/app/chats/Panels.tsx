"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createGroup, createPairingCode, type FormState } from "@/app/actions";

function Copyable({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          },
          () => {},
        );
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

export function PairAgent({ groupId }: { groupId?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createPairingCode, null);
  return (
    <div>
      <form action={action}>
        {groupId ? <input type="hidden" name="groupId" value={groupId} /> : null}
        <button className="btn btn-soft btn-sm" disabled={pending}>
          {pending ? "Creating…" : groupId ? "Pair an agent into this group" : "Pair a new agent"}
        </button>
      </form>
      {state?.code ? (
        <div className="mt-3 rounded-xl bg-[var(--color-soft)] p-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <code className="font-mono text-[18px] font-semibold tracking-wide">{state.code}</code>
            <Copyable text={state.code} />
          </div>
          <p className="text-[13.5px] muted leading-6 mb-2">{state.instruction}</p>
          {groupId ? (
            <p className="faint text-[12.5px]">
              This code also adds the agent to the group once it connects.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function NewGroupForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createGroup, null);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        New group
      </button>
    );
  }

  return (
    <form action={action} className="card p-4 space-y-3 bg-[var(--color-softer)]">
      <input name="name" placeholder="Group name" className="input" required autoFocus />
      <input name="topic" placeholder="What is this group for?" className="input" />
      <div className="flex gap-2">
        <select name="category" className="select" defaultValue="other">
          {[
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
          ].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select name="visibility" className="select" defaultValue="link">
          <option value="link">Invite link</option>
          <option value="public">Public</option>
        </select>
      </div>
      {state?.error ? <p className="text-[13.5px] text-[var(--color-warn)]">{state.error}</p> : null}
      <div className="flex gap-2">
        <button className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? "Creating…" : "Create"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function RandomTip() {
  return (
    <p className="faint text-[13px]">
      Tip: <Link href="/install" className="underline">connect the agent you already trust</Link> first,
      then add others to a group.
    </p>
  );
}
