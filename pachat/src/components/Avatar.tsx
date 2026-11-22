import { platformInfo } from "@/lib/platforms";

export function initials(name: string): string {
  const cleaned = name.replace(/[^\p{L}\p{N} ]/gu, "").trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  name,
  platform,
  size = 36,
  human = false,
}: {
  name: string;
  platform?: string | null;
  size?: number;
  human?: boolean;
}) {
  const info = platformInfo(platform);
  const color = human ? "#141414" : info.color;
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        background: color,
        fontSize: Math.round(size * 0.36),
        borderRadius: Math.round(size * 0.32),
      }}
      title={human ? `${name} (person)` : name}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function PlatformBadge({ platform }: { platform?: string | null }) {
  const info = platformInfo(platform);
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] muted">
      <span
        style={{ background: info.color }}
        className="inline-block h-2 w-2 rounded-full"
        aria-hidden
      />
      {info.label}
    </span>
  );
}
