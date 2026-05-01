// ============================================================================
// Lucide icons — inline SVG paths for content cards.
// ============================================================================
//
// May 1, 2026 — renderer quality upgrade. The legacy renderer ships a small
// chrome icon set (phone, star, locator) but content cards (services /
// features / stats) had only a generic placeholder circle. This module
// provides 20 of the most commonly-used Lucide icons inline so:
//
//   1. Content cards get topic-appropriate iconography out of the box.
//   2. No external dependency / network fetch — paths are part of the
//      rendered HTML.
//   3. Deterministic — same item title produces the same icon, every run.
//
// Path data taken verbatim from lucide-react v0.460+ (MIT licensed).
// All icons share the canonical Lucide attributes:
//   viewBox="0 0 24 24"  fill="none"  stroke-width="2"
//   stroke-linecap="round"  stroke-linejoin="round"
//
// Add an entry here, the renderIcon() helper picks it up automatically.
// `iconForItem()` walks the title against a keyword map for auto-assignment.

export type IconName =
  | "zap"
  | "shield"
  | "users"
  | "bot"
  | "calendar"
  | "file_text"
  | "bar_chart"
  | "globe"
  | "mail"
  | "phone"
  | "star"
  | "check_circle"
  | "arrow_right"
  | "play"
  | "sparkles"
  | "layout"
  | "code"
  | "lock"
  | "clock"
  | "trending_up";

const ICON_PATHS: Record<IconName, string> = {
  zap:
    '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  shield:
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  bot:
    '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  calendar:
    '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  file_text:
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  bar_chart:
    '<line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/>',
  globe:
    '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  mail:
    '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  phone:
    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  star:
    '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  check_circle:
    '<path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/>',
  arrow_right:
    '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  play:
    '<polygon points="6 3 20 12 6 21 6 3"/>',
  sparkles:
    '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
  layout:
    '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>',
  code:
    '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  lock:
    '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  clock:
    '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  trending_up:
    '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
};

/**
 * Render a Lucide icon as inline SVG. Returns empty string for unknown
 * names — caller should fall back to a default icon (sparkles is a good
 * neutral choice).
 */
export function renderIcon(
  name: IconName | string,
  options: { size?: number; color?: string; strokeWidth?: number } = {}
): string {
  const { size = 24, color = "currentColor", strokeWidth = 2 } = options;
  const path = ICON_PATHS[name as IconName];
  if (!path) return "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

/** True if the given name maps to a known icon. */
export function hasIcon(name: string | null | undefined): boolean {
  if (!name) return false;
  return name in ICON_PATHS;
}

// ─── Keyword-based auto-assignment ───────────────────────────────────────────
//
// When a SectionItem doesn't carry an `icon` field, infer one from the
// item's title. Order-sensitive: more specific keywords come first
// ("MCP" before "code", "agent" before "AI"). Fallback: "sparkles".

interface IconRule {
  icon: IconName;
  keywords: string[];
}

// Keywords are matched as substrings against the lowercased title. Avoid
// short tokens that produce false positives (e.g. "ai" matches "em**ai**l";
// "page" matches everything ending in "page" including booking/intake
// pages). Specific multi-word patterns + distinctive nouns only.
const RULES: IconRule[] = [
  // Domain-specific (most specific first)
  { icon: "globe", keywords: ["landing", "website", "domain", "homepage"] },
  { icon: "calendar", keywords: ["booking", "calendar", "appointment", "scheduling", "demo"] },
  { icon: "file_text", keywords: ["intake", "form", "questionnaire", "submission"] },
  { icon: "users", keywords: ["crm", "contact", "client", "customer", "audience"] },
  { icon: "bar_chart", keywords: ["pipeline", "kanban", "deal", "analytic", "report", "dashboard"] },
  { icon: "bot", keywords: ["agent", "automation", "workflow", "archetype", "chatbot", " bot "] },
  { icon: "mail", keywords: ["email", "newsletter", "campaign", "outreach"] },
  { icon: "phone", keywords: ["sms", "call", "phone", "twilio"] },
  { icon: "code", keywords: ["mcp", "api", "developer", "sdk", "code", "open source"] },
  { icon: "shield", keywords: ["secure", "security", "permission", "approval"] },
  { icon: "lock", keywords: ["lock", "private", "encrypted", "vault", "secret"] },
  { icon: "trending_up", keywords: ["growth", "scale", "revenue", "conversion"] },
  { icon: "zap", keywords: ["fast", "instant", "speed", "performance", "lightning"] },
  { icon: "sparkles", keywords: ["seldon", "magic", "ai-powered", "smart"] },
  { icon: "star", keywords: ["review", "rating", "testimonial", "5-star"] },
  { icon: "check_circle", keywords: ["check", "verified", "complete", "done", "trust"] },
  { icon: "clock", keywords: ["time", "speed", "minute", "hour", "deadline"] },
  { icon: "play", keywords: ["video", "demo", "watch", "play"] },
  { icon: "layout", keywords: ["layout", "section", "block", "template"] },
  // Tier names — important for the SaaS feature grid
  { icon: "zap", keywords: ["free"] },
  { icon: "trending_up", keywords: ["growth"] },
  { icon: "sparkles", keywords: ["scale"] },
  { icon: "code", keywords: ["self-host", "self host", "open-source"] },
];

/**
 * Pick an icon name from a free-text title. Falls back to "sparkles" so
 * the renderer always has something to draw — better than a blank slot.
 */
export function iconForTitle(title: string | null | undefined): IconName {
  if (!title) return "sparkles";
  const haystack = title.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword))) {
      return rule.icon;
    }
  }
  return "sparkles";
}

/**
 * Resolve the icon for a SectionItem. Honors the explicit `icon` field
 * if it's a known icon name; otherwise infers from the title.
 */
export function iconForItem(item: {
  icon?: string;
  title?: string;
}): IconName {
  if (item.icon && hasIcon(item.icon)) return item.icon as IconName;
  return iconForTitle(item.title);
}
