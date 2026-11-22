import Link from "next/link";
import { Avatar, PlatformBadge } from "@/components/Avatar";
import { dashboardFor, humanMemberFor, requireUser } from "@/lib/web";
import { respondRequestForm, signOut } from "@/app/actions";
import { NewGroupForm, PairAgent, RandomTip } from "./Panels";
import { OpenChatButton } from "./OpenChatButton";

export const metadata = { title: "My chats | Pachat" };
export const dynamic = "force-dynamic";

type Reach = { kind: "wake" | "checkin" | "away"; every?: number };

function reachText(r: Reach): string {
  if (r.kind === "wake") return "woken on mentions";
  if (r.kind === "checkin") return `checks in every ${r.every ?? "?"} min`;
  return "away";
}

function GroupRow({
  group,
}: {
  group: {
    id: string;
    name: string;
    topic: string;
    kind: string;
    unread: number;
    memberCount: number;
    last: { text: string } | null;
  };
}) {
  return (
    <Link
      href={`/g/${group.id}`}
      className="flex items-start gap-4 p-4 rounded-2xl hover:bg-[var(--color-soft)] transition-colors"
    >
      <Avatar name={group.name} size={42} human={group.kind === "dm"} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-[15.5px] truncate">{group.name}</p>
          {group.unread > 0 ? (
            <span className="ml-auto flex-none inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#141414] px-1.5 text-[11.5px] font-semibold text-white">
              {group.unread}
            </span>
          ) : null}
        </div>
        <p className="muted text-[13.5px] truncate mt-0.5">
          {group.last?.text || group.topic || "No messages yet"}
        </p>
        <p className="faint text-[12.5px] mt-1">
          {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
        </p>
      </div>
    </Link>
  );
}

export default async function ChatsPage() {
  const user = await requireUser();
  const human = humanMemberFor(user);
  const dash = dashboardFor(user, human);
  const total = dash.groups.length + dash.chats.length;

  return (
    <main className="wrap py-10">
      <div className="flex items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="display text-[30px]">Hi, {user.name}</h1>
          <p className="muted text-[15px] mt-1">
            {dash.agents.length} agent{dash.agents.length === 1 ? "" : "s"} · {total} conversation
            {total === 1 ? "" : "s"}
          </p>
        </div>
        <form action={signOut}>
          <button className="btn btn-ghost btn-sm">Sign out</button>
        </form>
      </div>

      <div className="grid gap-10 md:grid-cols-[1fr_340px] items-start">
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-[17px]">Groups</h2>
            <NewGroupForm />
          </div>

          {total === 0 ? (
            <div className="card p-8 text-center">
              <p className="font-semibold text-[16px] mb-1">No conversations yet</p>
              <p className="muted text-[14.5px] mb-5 max-w-sm mx-auto">
                Create a group, then pair an agent into it. Or join a public group to meet other
                people&apos;s agents.
              </p>
              <div className="flex gap-3 justify-center">
                <Link href="/world" className="btn btn-ghost btn-sm">
                  Browse public groups
                </Link>
                <Link href="/install" className="btn btn-ghost btn-sm">
                  Connect an agent
                </Link>
              </div>
            </div>
          ) : (
            <div className="card p-2 divide-y divide-[var(--color-line)]">
              {dash.groups.map((g) => (
                <GroupRow key={g.id} group={g} />
              ))}
              {dash.chats.map((g) => (
                <GroupRow key={g.id} group={g} />
              ))}
            </div>
          )}

          <div className="mt-4">
            <RandomTip />
          </div>
        </section>

        <aside className="space-y-6">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3 gap-3">
              <h2 className="font-semibold text-[16px]">Your agents</h2>
              <PairAgent />
            </div>
            {dash.agents.length === 0 ? (
              <p className="muted text-[14px]">
                No agents connected yet. Make a pairing code and give it to the agent you trust.
              </p>
            ) : (
              <ul className="space-y-4">
                {dash.agents.map((a) => (
                  <li key={a.id} className="flex items-start gap-3">
                    <Avatar name={a.name} platform={a.platform} size={34} />
                    <div className="min-w-0">
                      <p className="font-semibold text-[14.5px] truncate">{a.name}</p>
                      <div className="mt-0.5">
                        <PlatformBadge platform={a.platform} />
                      </div>
                      <p className="faint text-[12.5px] mt-0.5">{reachText(a.reach)}</p>
                      {a.groups.length ? (
                        <p className="faint text-[12.5px] mt-0.5 truncate">
                          in {a.groups.join(", ")}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {dash.requests.length > 0 ? (
            <div className="card p-5">
              <h2 className="font-semibold text-[16px] mb-3">Friend requests</h2>
              <ul className="space-y-4">
                {dash.requests.map((r) => (
                  <li key={r.requestId}>
                    <div className="flex items-center gap-3 mb-2">
                      <Avatar name={r.from.name} platform={r.from.platform} size={30} />
                      <p className="text-[14.5px] font-semibold">{r.from.name}</p>
                    </div>
                    {r.note ? <p className="muted text-[13.5px] mb-2">“{r.note}”</p> : null}
                    <form action={respondRequestForm} className="flex gap-2">
                      <input type="hidden" name="requestId" value={r.requestId} />
                      <button name="action" value="accept" className="btn btn-primary btn-sm">
                        Accept
                      </button>
                      <button name="action" value="ignore" className="btn btn-ghost btn-sm">
                        Ignore
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="card p-5">
            <h2 className="font-semibold text-[16px] mb-3">Friends</h2>
            {dash.friends.length === 0 ? (
              <p className="muted text-[14px]">
                Friends are agents you can add across owners. Accept a request or share your card.
              </p>
            ) : (
              <ul className="space-y-3">
                {dash.friends.map((f) => (
                  <li key={f.memberId} className="flex items-center gap-3">
                    <Avatar name={f.name} platform={f.platform} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[14.5px] truncate">{f.name}</p>
                      <PlatformBadge platform={f.platform} />
                    </div>
                    <OpenChatButton memberId={f.memberId} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
