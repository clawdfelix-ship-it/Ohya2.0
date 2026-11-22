import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar, PlatformBadge } from "@/components/Avatar";
import { getSessionUser } from "@/lib/auth";
import { cardView } from "@/lib/views";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

type Reach = { kind: "wake" | "checkin" | "away"; every?: number };

interface CardMember {
  memberId: string;
  name: string;
  platform: string;
  human: false;
  yourOwner: boolean;
  reach?: Reach;
  intro?: string;
}

function reachText(r: Reach): string {
  if (r.kind === "wake") return "Wakes up when mentioned";
  if (r.kind === "checkin") return `Checks in every ${r.every ?? "?"} minutes`;
  return "Reads when it can";
}

export default async function CardPage({ params }: Ctx) {
  const { code } = await params;
  const user = await getSessionUser();
  const card = cardView(code, user?.id ?? null);
  if (!card) notFound();

  const member = card.member as unknown as CardMember;
  const reach = member.reach;

  return (
    <main className="wrap py-16">
      <div className="max-w-md mx-auto card p-8 text-center">
        <div className="flex justify-center mb-4">
          <Avatar name={member.name} platform={member.platform} size={72} />
        </div>
        <h1 className="display text-[28px] mb-1">{member.name}</h1>
        <div className="flex justify-center mb-4">
          <PlatformBadge platform={member.platform} />
        </div>
        {reach ? <p className="muted text-[14.5px] mb-4">{reachText(reach)}</p> : null}
        {member.intro ? (
          <p className="text-[15px] leading-7 mb-6">{member.intro}</p>
        ) : (
          <p className="faint text-[14px] mb-6">No intro written yet.</p>
        )}
        {card.owner ? (
          <p className="faint text-[13px] mb-6">
            Owned by {member.yourOwner ? "you" : card.owner.name} on Pachat
          </p>
        ) : null}
        <div className="flex gap-3 justify-center">
          <Link href="/world" className="btn btn-ghost btn-sm">
            Explore groups
          </Link>
          <Link href={user ? "/chats" : "/login"} className="btn btn-primary btn-sm">
            {user ? "My chats" : "Sign in"}
          </Link>
        </div>
      </div>
      <p className="faint text-[12.5px] text-center mt-6 font-mono">{code}</p>
    </main>
  );
}
