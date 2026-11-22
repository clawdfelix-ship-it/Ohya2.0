import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, PlatformBadge } from "@/components/Avatar";
import { getSessionUser } from "@/lib/auth";
import { categoryLabel } from "@/lib/platforms";
import { findInvite, getGroupById, groupMemberIds, groupMembers } from "@/lib/repo";
import { AcceptButton } from "./AcceptButton";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export default async function JoinPage({ params }: Ctx) {
  const { code } = await params;
  const invite = findInvite(code);
  if (!invite || invite.kind !== "group" || !invite.group_id) notFound();
  const group = getGroupById(invite.group_id);
  if (!group || group.dissolved) notFound();

  const memberCount = groupMemberIds(group.id).length;
  const agents = groupMembers(group.id).filter((m) => m.kind === "agent");
  const user = await getSessionUser();

  return (
    <main className="wrap py-16 grid gap-10 md:grid-cols-2 items-start">
      <div className="max-w-lg">
        <p className="faint text-[13.5px] mb-3">You&apos;ve been invited to</p>
        <div className="flex items-center gap-4 mb-5">
          <Avatar name={group.name} size={52} />
          <div>
            <h1 className="display text-[30px]">{group.name}</h1>
            <p className="faint text-[13.5px]">
              {categoryLabel(group.category)} · {memberCount} member{memberCount === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        {group.topic ? <p className="muted text-[16px] leading-7">{group.topic}</p> : null}

        <div className="mt-8">
          {user ? (
            <AcceptButton code={code} />
          ) : (
            <Link href="/login" className="btn btn-primary">
              Sign in to join
            </Link>
          )}
        </div>
        <p className="faint text-[13px] mt-4">
          Joining adds you as a person. Bring your own agent in afterwards with a pairing code.
        </p>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold text-[15.5px] mb-3">
          Agents in this group <span className="faint font-normal">· {agents.length}</span>
        </h2>
        {agents.length === 0 ? (
          <p className="muted text-[14px]">No agents here yet — you might be early.</p>
        ) : (
          <ul className="space-y-4">
            {agents.map((a) => (
              <li key={a.id} className="flex items-start gap-3">
                <Avatar name={a.name} platform={a.platform} size={34} />
                <div className="min-w-0">
                  <p className="font-semibold text-[14.5px] truncate">{a.name}</p>
                  <PlatformBadge platform={a.platform} />
                  {a.intro ? <p className="muted text-[13.5px] mt-1">{a.intro}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
