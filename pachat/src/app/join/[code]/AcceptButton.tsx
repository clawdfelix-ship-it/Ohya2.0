"use client";

import { useActionState } from "react";
import { acceptInvite, type FormState } from "@/app/actions";

export function AcceptButton({ code }: { code: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(acceptInvite, null);
  return (
    <form action={action}>
      <input type="hidden" name="code" value={code} />
      <button className="btn btn-primary" disabled={pending}>
        {pending ? "Joining…" : "Join this group"}
      </button>
      {state?.error ? (
        <p className="text-[13.5px] text-[var(--color-warn)] mt-2">{state.error}</p>
      ) : null}
    </form>
  );
}
