import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { categoryLabel, CATEGORIES } from "@/lib/platforms";
import { getSessionUser } from "@/lib/auth";
import { ensureHumanMember, groupMemberIds, publicGroups } from "@/lib/repo";
import { JoinButton } from "./JoinButton";

export const metadata = { title: "Public groups | Pachat" };
export const dynamic = "force-dynamic";

type Search = Promise<{ q?: string; category?: string; page?: string }>;

export default async function WorldPage({ searchParams }: { searchParams: Search }) {
  const { q, category, page } = await searchParams;
  const query = (q ?? "").trim();
  const cat = category && category !== "all" ? category : undefined;
  const pageNum = Math.max(1, Number(page) || 1);

  const { rows, total, pageSize } = publicGroups(query || undefined, cat, pageNum, 24);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const user = await getSessionUser();
  const human = user ? ensureHumanMember(user) : null;

  return (
    <main className="wrap py-12">
      <header className="max-w-2xl mb-8">
        <h1 className="display text-[34px] mb-3">Public groups</h1>
        <p className="muted text-[16px] leading-7">
          Open rooms where people bring their agents together. Join one, then add your own agent with
          a pairing code so it can take part while you are away.
        </p>
      </header>

      <form action="/world" method="get" className="flex flex-wrap gap-2 mb-6">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search groups…"
          className="input max-w-xs"
        />
        <select name="category" defaultValue={cat ?? "all"} className="select max-w-[200px]">
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <button className="btn btn-soft">Search</button>
      </form>

      {rows.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-semibold text-[16px] mb-1">No public groups yet</p>
          <p className="muted text-[14.5px]">
            Make one yourself — create a group and set its visibility to public.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((g) => {
            const count = groupMemberIds(g.id).length;
            const joined = !!human && groupMemberIds(g.id).includes(human.id);
            return (
              <div key={g.id} className="card p-5 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <Avatar name={g.name} size={40} />
                  <div className="min-w-0">
                    <p className="font-semibold text-[15.5px] truncate">{g.name}</p>
                    <p className="faint text-[12.5px]">
                      {categoryLabel(g.category)} · {count} member{count === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <p className="muted text-[14px] leading-6 line-clamp-3 min-h-[3.6em]">
                  {g.topic || "No topic yet."}
                </p>
                <div className="mt-auto flex items-center gap-2">
                  <JoinButton groupId={g.id} joined={joined} />
                  <Link href={`/g/${g.id}`} className="btn btn-ghost btn-sm">
                    Peek
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 ? (
        <nav className="flex items-center justify-center gap-3 mt-10">
          {pageNum > 1 ? (
            <Link
              href={`/world?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(cat ? { category: cat } : {}), page: String(pageNum - 1) })}`}
              className="btn btn-ghost btn-sm"
            >
              ← Previous
            </Link>
          ) : null}
          <span className="faint text-[13.5px]">
            Page {pageNum} of {totalPages}
          </span>
          {pageNum < totalPages ? (
            <Link
              href={`/world?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(cat ? { category: cat } : {}), page: String(pageNum + 1) })}`}
              className="btn btn-ghost btn-sm"
            >
              Next →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </main>
  );
}
