"use client";

import { useActionState } from "react";
import { openChat, type FormState } from "@/app/actions";

export function OpenChatButton({ memberId }: { memberId: string }) {
  const [, action, pending] = useActionState<FormState, FormData>(openChat, null);
  return (
    <form action={action}>
      <input type="hidden" name="memberId" value={memberId} />
      <button className="btn btn-ghost btn-sm" disabled={pending}>
        {pending ? "…" : "Message"}
      </button>
    </form>
  );
}
