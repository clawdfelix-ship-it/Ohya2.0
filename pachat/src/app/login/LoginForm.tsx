"use client";

import { useActionState } from "react";
import { startLogin, verifyLogin, type LoginState } from "@/app/actions";

export function LoginForm({ defaultIntent }: { defaultIntent?: string }) {
  const [startState, startAction, startPending] = useActionState<LoginState | null, FormData>(
    startLogin,
    null,
  );
  const [verifyState, verifyAction, verifyPending] = useActionState<LoginState | null, FormData>(
    verifyLogin,
    null,
  );

  const onCodeStep = startState?.step === "code" || verifyState?.step === "code";
  const requestId = verifyState?.requestId ?? startState?.requestId ?? "";
  const email = verifyState?.email ?? startState?.email ?? "";
  const devCode = startState?.devCode;

  if (onCodeStep) {
    return (
      <form action={verifyAction} className="space-y-4">
        <div>
          <h2 className="display text-[22px] mb-1">Enter your code</h2>
          <p className="muted text-[14px]">
            We sent a 6-digit code to <strong className="text-[var(--color-ink)]">{email || "your email"}</strong>.
          </p>
        </div>
        {devCode ? (
          <div className="rounded-xl bg-[var(--color-soft)] px-4 py-3 text-[13.5px]">
            <span className="faint">No mailer in this build — your code is</span>{" "}
            <code className="font-mono font-semibold">{devCode}</code>
          </div>
        ) : null}
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="email" value={email} />
        <input
          name="code"
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={6}
          placeholder="000000"
          className="input text-center tracking-[0.4em] font-mono text-[20px]"
          required
          autoFocus
        />
        {verifyState?.error ? (
          <p className="text-[14px] text-[var(--color-warn)]">{verifyState.error}</p>
        ) : null}
        <button className="btn btn-primary w-full" disabled={verifyPending}>
          {verifyPending ? "Checking…" : "Continue"}
        </button>
        <p className="faint text-[13px] text-center">
          Wrong email? Reload the page to start again.
        </p>
      </form>
    );
  }

  return (
    <form action={startAction} className="space-y-4">
      <div>
        <h2 className="display text-[22px] mb-1">
          {defaultIntent === "signup" ? "Create your account" : "Welcome back"}
        </h2>
        <p className="muted text-[14px]">Your email is your owner identity on Pachat.</p>
      </div>
      <label className="block">
        <span className="text-[13.5px] muted mb-1 block">Email</span>
        <input
          name="email"
          type="email"
          placeholder="you@example.com"
          className="input"
          defaultValue={startState?.email ?? ""}
          required
          autoFocus
        />
      </label>
      <label className="block">
        <span className="text-[13.5px] muted mb-1 block">
          Your name <span className="faint">(optional)</span>
        </span>
        <input name="ownerName" placeholder="Dana" className="input" />
      </label>
      {startState?.error ? (
        <p className="text-[14px] text-[var(--color-warn)]">{startState.error}</p>
      ) : null}
      <button className="btn btn-primary w-full" disabled={startPending}>
        {startPending ? "Sending…" : "Email me a code"}
      </button>
      <p className="faint text-[13px] text-center">
        By continuing you agree to be a decent person in group chats.
      </p>
    </form>
  );
}
