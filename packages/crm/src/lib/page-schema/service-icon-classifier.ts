// ============================================================================
// service-icon-classifier — map a free-text service name to an icon name.
// ============================================================================
//
// May 2, 2026 — issue #2 of the Personality-Driven Content Layer spec. The
// atomic-workspace pipeline lands `soul.offerings = [{ name: "AC Repair" }]`
// with no icon hints, which made every services-grid card render with the
// generic _default circle SVG. This classifier maps the service name to a
// Lucide-style icon name from the renderer's allowlist so each card gets a
// topic-appropriate glyph out of the box.
//
// Pure function, deterministic. Same input → same output. Substring match,
// case-insensitive, order-sensitive (specific keywords first, fallback last).
//
// Output names are resolved by the renderer's `iconForContentItem()`:
//   1. `hasLucideIcon(name)` against packages/crm/src/lib/blueprint/renderers/lucide-icons.ts
//   2. `ICON_MAP[name.toLowerCase()]` against packages/crm/src/lib/blueprint/renderers/general-service-v1.ts
// Every name returned by this classifier MUST resolve via one of those.

interface IconRule {
  icon: string;
  keywords: string[];
}

// Order matters: more specific wins. "Emergency Dental Care" must hit
// the siren rule before the dental sparkles rule, so urgency keywords
// run first. Domain-vertical keywords (HVAC, dental) run before generic
// install/repair so "AC Install" is wrench-from-AC, not wrench-from-install
// — same icon, but the more specific path is auditable from the rule list.
const RULES: IconRule[] = [
  { icon: "siren", keywords: ["emergency", "urgent", "24/7", "24-hour"] },
  { icon: "wrench", keywords: ["ac ", "a/c", "air conditioning", "cooling"] },
  { icon: "flame", keywords: ["heating", "furnace", "boiler"] },
  { icon: "smile", keywords: ["implant", "invisalign", "orthodont"] },
  { icon: "sparkles", keywords: ["cleaning", "dental", "dentist", "tooth", "teeth", "smile", "whitening"] },
  { icon: "message-circle", keywords: ["consultation", "consult", "advice"] },
  { icon: "dollar-sign", keywords: ["estimate", "quote", "pricing"] },
  { icon: "clipboard-check", keywords: ["inspection", "audit", "assessment"] },
  { icon: "wrench", keywords: ["install", "repair"] },
];

const DEFAULT_ICON = "sparkles";

/**
 * Classify a service name to an icon name from the renderer's allowlist.
 *
 * - Empty / whitespace-only / non-string → fallback "sparkles".
 * - Case-insensitive substring match against the keyword list.
 * - First matching rule wins (rules are ordered specific → generic).
 * - Fallback "sparkles" when no rule matches.
 *
 * @param name service name (e.g. "AC Repair", "Teeth Whitening")
 * @returns icon name resolvable by the renderer (e.g. "wrench", "sparkles")
 */
export function classifyServiceIcon(name: string | null | undefined): string {
  if (typeof name !== "string") return DEFAULT_ICON;
  const haystack = name.toLowerCase().trim();
  if (!haystack) return DEFAULT_ICON;

  for (const rule of RULES) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword))) {
      return rule.icon;
    }
  }
  return DEFAULT_ICON;
}
