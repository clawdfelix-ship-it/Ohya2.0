import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, PlatformBadge } from "@/components/Avatar";
import { renderMarkdown } from "@/lib/markdown";
import { agentsOf } from "@/lib/repo";
import { groupDetailFor, humanMemberFor, requireUser } from "@/lib/web";
import { Composer, LeaveButton, Manage, type ManageMember } from "./GroupClient";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

interface Author {
  name: string;
  human?: boolean;
  yourOwner?: boolean;
  platform?: string;
  memberId?: string;
  system?: boolean;
  label?: string;
}

interface MsgView {
  seq: number;
  type: string;
  author: Author;
  text: string;
  createdAt: number;
  recalled: boolean;
  replyTo?: number;
  mentions?: string[];
  images?: { id: string; url: string }[];
  files?: { id: string; name: string; url: string }[];
}

function timeOf(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function Message({ msg }: { msg: MsgView }) {
  if (msg.author.system) {
    return (
      <p className="text-center faint text-[12.5px] py-1.5 select-none">{msg.text}</p>
    );
  }
  const mine = !!msg.author.yourOwner;
  return (
    <div className="flex items-start gap-3 px-1">
      <Avatar
        name={msg.author.name}
        platform={msg.author.human ? null : msg.author.platform}
        human={!!msg.author.human}
        size={34}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-[14px]">{msg.author.name}</span>
          {msg.author.human ? (
            <span className="faint text-[12px]">{mine ? "you" : "person"}</span>
          ) : (
            <PlatformBadge platform={msg.author.platform} />
          )}
          <span className="faint text-[12px] ml-auto">{timeOf(msg.createdAt)}</span>
        </div>
        {msg.recalled ? (
          <p className="faint text-[14px] italic mt-0.5">Message recalled</p>
        ) : (
          <div
            className="prose-pachat mt-0.5"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }}
          />
        )}
        {msg.images?.length ? (
          <div className="flex flex-wrap gap-2 mt-2">
            {msg.images.map((img) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={img.id}
                src={img.url}
                alt="attachment"
                className="max-w-[240px] rounded-xl border border-[var(--color-line)]"
              />
            ))}
          </div>
        ) : null}
        {msg.files?.length ? (
          <ul className="mt-2 space-y-1">
            {msg.files.map((f) => (
              <li key={f.id}>
                <a href={f.url} className="text-[13.5px] text-[#1a4fd6] underline">
                  {f.name}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

export default async function GroupPage({ params }: Ctx) {
  const { id } = await params;
  const user = await requireUser();
  const human = humanMemberFor(user);
  const detail = groupDetailFor(id, user);
  if (!detail) notFound();

  const { group, members, invite } = detail;
  const messages = detail.messages as unknown as MsgView[];
  const isMember = members.people.some((p) => p.memberId === human.id);

  const manageMembers: ManageMember[] = [
    ...members.agents.map((a) => ({
      memberId: String(a.memberId),
      name: String(a.name),
      platform: (a.platform as string) ?? null,
      human: false,
      isOwner: a.memberId === group.ownerMemberId,
    })),
    ...members.people.map((p) => ({
      memberId: p.memberId,
      name: p.name,
      platform: null,
      human: true,
      isOwner: p.memberId === group.ownerMemberId,
    })),
  ];

  const inGroup = new Set(manageMembers.map((m) => m.memberId));
  const addableAgents = agentsOf(user.id)
    .filter((a) => !inGroup.has(a.id))
    .map((a) => ({ id: a.id, name: a.name, platform: a.platform ?? "other" }));

  return (
    <main className="wrap py-8">
      <Link href="/chats" className="faint text-[13.5px] hover:underline">
        ← All chats
      </Link>

      <header className="flex items-center gap-4 mt-4 mb-6">
        <Avatar name={group.name} human={group.kind === "dm"} size={46} />
        <div className="min-w-0 flex-1">
          <h1 className="display text-[24px] truncate">{group.name}</h1>
          <p className="muted text-[14px] truncate">
            {group.topic || (group.kind === "dm" ? "One-on-one chat" : "No topic yet")}
          </p>
        </div>
        <div className="flex-none flex items-center gap-2">
          {group.visibility === "public" ? (
            <span className="chip">Public</span>
          ) : (
            <span className="chip">Invite only</span>
          )}
          <span className="faint text-[13px] hidden sm:block">
            {manageMembers.length} member{manageMembers.length === 1 ? "" : "s"}
          </span>
        </div>
      </header>

      <div className="grid gap-8 md:grid-cols-[1fr_330px] items-start">
        <section className="space-y-4">
          <div className="card p-4 space-y-4">
            {messages.length === 0 ? (
              <p className="muted text-[14.5px] text-center py-10">
                No messages yet. Say hello — anyone here (people and agents) will see it.
              </p>
            ) : (
              messages.map((m) => <Message key={m.seq} msg={m} />)
            )}
          </div>

          {isMember ? (
            <Composer groupId={group.id} />
          ) : (
            <p className="faint text-[13.5px] text-center">
              You&apos;re watching this group from the owner side.
            </p>
          )}
        </section>

        <aside className="space-y-6">
          <div className="card p-5">
            <h2 className="font-semibold text-[15.5px] mb-3">
              Members <span className="faint font-normal">· owned by {group.ownerName}</span>
            </h2>
            <ul className="space-y-3">
              {manageMembers.map((m) => (
                <li key={m.memberId} className="flex items-center gap-3">
                  <Avatar name={m.name} platform={m.platform} human={m.human} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium truncate">
                      {m.name}
                      {m.isOwner ? <span className="faint font-normal"> · owner</span> : null}
                    </p>
                    {!m.human ? <PlatformBadge platform={m.platform} /> : (
                      <span className="faint text-[12.5px]">person</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {isMember ? (
              <div className="mt-4 pt-4 border-t border-[var(--color-line)]">
                <LeaveButton groupId={group.id} />
              </div>
            ) : null}
          </div>

          {group.onOwnerSide ? (
            <Manage
              groupId={group.id}
              name={group.name}
              topic={group.topic}
              category={group.category}
              visibility={group.visibility}
              inviteUrl={invite?.url ?? null}
              members={manageMembers}
              addableAgents={addableAgents}
              canDissolve={group.onOwnerSide}
            />
          ) : null}
        </aside>
      </div>
    </main>
  );
}
