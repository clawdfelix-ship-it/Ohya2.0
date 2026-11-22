// Agent platforms and group categories. Mirrors the platform/category lists
// published by pachat.ai at https://pachat.ai/api/v1.

export type Platform = {
  id: string;
  label: string;
  color: string; // brand accent used for the avatar tile
};

export const PLATFORMS: Platform[] = [
  { id: "muse", label: "Muse", color: "#6C5CE7" },
  { id: "chatgpt", label: "ChatGPT", color: "#10A37F" },
  { id: "claude", label: "Claude", color: "#D97757" },
  { id: "claude_code", label: "Claude Code", color: "#D97757" },
  { id: "codex", label: "Codex", color: "#141414" },
  { id: "grok", label: "Grok Bot", color: "#141414" },
  { id: "manus", label: "Manus", color: "#3F5F8A" },
  { id: "openclaw", label: "OpenClaw", color: "#E8261E" },
  { id: "hermes", label: "Hermes", color: "#B4502A" },
  { id: "instinct", label: "Instinct", color: "#34C759" },
  { id: "cursor", label: "Cursor", color: "#141414" },
  { id: "copilot", label: "Copilot", color: "#3F5F8A" },
  { id: "deepseek", label: "DeepSeek", color: "#3F5F8A" },
  { id: "gemini", label: "Gemini", color: "#3F5F8A" },
  { id: "workbuddy", label: "WorkBuddy", color: "#5B8DEF" },
  { id: "doubao", label: "Doubao", color: "#3F5F8A" },
  { id: "qwen", label: "Qwen", color: "#6C5CE7" },
  { id: "aily", label: "Aily", color: "#10A37F" },
  { id: "trae", label: "Trae", color: "#E8261E" },
  { id: "dumate", label: "Dumate", color: "#5F5F64" },
  { id: "lingguang", label: "Lingguang", color: "#F2A79C" },
  { id: "wabi", label: "Wabi", color: "#D3301F" },
  { id: "pi", label: "Pi", color: "#34C759" },
  { id: "zcode", label: "Zcode", color: "#141414" },
  { id: "kimi", label: "Kimi", color: "#6C5CE7" },
  { id: "qoder", label: "Qoder", color: "#3F5F8A" },
  { id: "antigravity", label: "Antigravity", color: "#141414" },
  { id: "opencode", label: "OpenCode", color: "#141414" },
  { id: "other", label: "Agent", color: "#5F5F64" },
];

const PLATFORM_MAP = new Map(PLATFORMS.map((p) => [p.id, p]));

export function platformInfo(id: string | null | undefined): Platform {
  if (id && PLATFORM_MAP.has(id)) return PLATFORM_MAP.get(id)!;
  return PLATFORM_MAP.get("other")!;
}

export type Category = { id: string; label: string; description: string };

export const CATEGORIES: Category[] = [
  { id: "investing", label: "Investing", description: "Stocks, earnings, startup deals, personal money, taxes" },
  { id: "business", label: "Business", description: "Business plans, pricing, fundraising, hiring, other big calls" },
  { id: "tech", label: "Tech", description: "Software and app projects, code and design reviews" },
  { id: "marketing", label: "Marketing", description: "Social posts, writing, video, campaigns, branding" },
  { id: "legal", label: "Legal", description: "Contracts, case and statute research, compliance" },
  { id: "research", label: "Research", description: "Market and topic research, sources, fact-checking" },
  { id: "health", label: "Health", description: "Health questions, test results, fitness, nutrition" },
  { id: "career", label: "Career", description: "Job moves, interviews, applications, study plans" },
  { id: "food", label: "Food", description: "Dinners, restaurants, food outings" },
  { id: "travel", label: "Travel", description: "Trips, hikes, travel plans" },
  { id: "sports", label: "Sports", description: "Runs, games, workouts" },
  { id: "games", label: "Games", description: "Board games, chess, video games" },
  { id: "learning", label: "Learning", description: "Book clubs, language exchange, study groups" },
  { id: "arts", label: "Arts", description: "Concerts, shows, creative meetups" },
  { id: "parents", label: "Parents", description: "Playdates, school runs, family outings" },
  { id: "neighbors", label: "Neighbors", description: "Local news, rides, recommendations" },
  { id: "free_stuff", label: "Free stuff", description: "Giving away and swapping things" },
  { id: "other", label: "Other", description: "Anything else" },
];

const CATEGORY_MAP = new Map(CATEGORIES.map((c) => [c.id, c]));

export function categoryLabel(id: string | null | undefined): string {
  if (id && CATEGORY_MAP.has(id)) return CATEGORY_MAP.get(id)!.label;
  return CATEGORY_MAP.get("other")!.label;
}

export function isCategory(id: string): boolean {
  return CATEGORY_MAP.has(id);
}

export type WakeKind = "grok" | "openclaw" | "claude_routine" | "webhook" | "email" | "listener";

export const WAKE_KINDS: WakeKind[] = [
  "grok",
  "openclaw",
  "claude_routine",
  "webhook",
  "email",
  "listener",
];
