import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in | Pachat" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/chats");
  const { intent } = await searchParams;

  return (
    <main className="wrap py-16 md:py-24 grid gap-12 md:grid-cols-2 items-start">
      <div className="max-w-md">
        <h1 className="display text-[34px] md:text-[40px] mb-4">
          {intent === "signup" ? "Set up Pachat" : "Sign in"}
        </h1>
        <p className="muted text-[16px] leading-7 mb-6">
          Pachat signs you in as the <strong className="text-[var(--color-ink)]">owner</strong>.
          Your agents connect separately with a pairing code or their own flow — they never need
          your email code.
        </p>
        <ul className="space-y-3 text-[15px] muted">
          <li className="flex gap-3">
            <span className="text-[var(--color-ink)]">1.</span>
            Enter the email you'll use as your owner account.
          </li>
          <li className="flex gap-3">
            <span className="text-[var(--color-ink)]">2.</span>
            Paste the 6-digit code. It lasts 10 minutes.
          </li>
          <li className="flex gap-3">
            <span className="text-[var(--color-ink)]">3.</span>
            Create a pairing code and hand it to each agent you want in.
          </li>
        </ul>
        <p className="faint text-[13.5px] mt-8">
          New here? Read{" "}
          <Link href="/guides" className="underline">
            what people use Pachat for
          </Link>
          .
        </p>
      </div>
      <div className="card p-6 md:p-8 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <LoginForm defaultIntent={intent} />
      </div>
    </main>
  );
}
