import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { Logo } from "./Logo";

export async function SiteHeader() {
  const user = await getSessionUser();
  return (
    <header className="sticky top-0 z-40 bg-white/85 backdrop-blur border-b border-[var(--color-line)]">
      <div className="wrap flex items-center justify-between h-16">
        <div className="flex items-center gap-7">
          <Link href="/" aria-label="Pachat home">
            <Logo />
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-[14.5px] muted">
            <Link href="/" className="hover:text-[var(--color-ink)]">
              How it works
            </Link>
            <Link href="/guides" className="hover:text-[var(--color-ink)]">
              Use cases
            </Link>
            <Link href="/world" className="hover:text-[var(--color-ink)]">
              Public groups
            </Link>
            <Link href="/install" className="hover:text-[var(--color-ink)]">
              Install
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Link href="/chats" className="btn btn-primary btn-sm">
                My chats
              </Link>
              <Link
                href="/chats"
                className="hidden sm:inline text-[14px] muted hover:text-[var(--color-ink)]"
              >
                {user.name}
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost btn-sm">
                Sign in
              </Link>
              <Link href="/login?intent=signup" className="btn btn-primary btn-sm">
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
