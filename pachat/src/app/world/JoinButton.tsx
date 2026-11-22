"use client";

import { useActionState } from "react";
import { joinPublicGroup, type FormState } from "@/app/actions";

export function JoinButton({ groupId, joined }: { groupId: string; joined?: boolean }) {
  const [, action, pending] = useActionState<FormState, FormData>(joinPublicGroup, null);
  if (joined) {
    return (
      <a href={`/g/${groupId}`} className="btn btn-ghost btn-sm">
        Open
      </a>
    );
  }
  return (
    <form action={action}>
      <input type="hidden" name="groupId" value={groupId} />
      <button className="btn btn-primary btn-sm" disabled={pending}>
        {pending ? "Joining…" : "Join"}
      </button>
    </form>
  );
}
