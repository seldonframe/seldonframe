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
  | "trending_up"
  // v1.1.5 — industry-specific icons for service cards.
  | "smile"
  | "baby"
  | "heart"
  | "stethoscope"
  | "wrench"
  | "flame"
  | "snowflake"
  | "droplets"
  | "home"
  | "scale"
  | "briefcase"
  | "gavel"
  | "siren"
  | "message_circle"
  | "dollar_sign"
  | "car"
  | "truck"
  | "scissors"
  | "camera"
  | "palette"
  | "megaphone"
  | "leaf"
  | "dumbbell";

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
  // v1.1.5 — industry icons. Paths copied from lucide-react v0.460+ (MIT).
  smile:
    '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/>',
  baby:
    '<path d="M9 12h.01"/><path d="M15 12h.01"/><path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5"/><path d="M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1"/>',
  heart:
    '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  stethoscope:
    '<path d="M11 2v2"/><path d="M5 2v2"/><path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1"/><path d="M8 15a6 6 0 0 0 12 0v-3"/><circle cx="20" cy="10" r="2"/>',
  wrench:
    '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  flame:
    '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  snowflake:
    '<line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/><path d="m20 16-4-4 4-4"/><path d="m4 8 4 4-4 4"/><path d="m16 4-4 4-4-4"/><path d="m8 20 4-4 4 4"/>',
  droplets:
    '<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>',
  home:
    '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  scale:
    '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
  briefcase:
    '<rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  gavel:
    '<path d="m14 13-7.5 7.5c-.83.83-2.17.83-3 0 0 0 0 0 0 0a2.12 2.12 0 0 1 0-3L11 10"/><path d="m16 16 6-6"/><path d="m8 8 6-6"/><path d="m9 7 8 8"/><path d="m21 11-8-8"/>',
  siren:
    '<path d="M7 18v-6a5 5 0 1 1 10 0v6"/><path d="M5 21a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1z"/><path d="M21 12h1"/><path d="M18.5 4.5 18 5"/><path d="M2 12h1"/><path d="M12 2v1"/><path d="m4.929 4.929.707.707"/><path d="M12 12v6"/>',
  message_circle:
    '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  dollar_sign:
    '<line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  car:
    '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  truck:
    '<path d="M5 18H3c-.6 0-1-.4-1-1V7c0-.6.4-1 1-1h10c.6 0 1 .4 1 1v11"/><path d="M14 9h4l4 4v4c0 .6-.4 1-1 1h-2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  scissors:
    '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
  camera:
    '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  palette:
    '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
  megaphone:
    '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  leaf:
    '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/>',
  dumbbell:
    '<path d="M14.4 14.4 9.6 9.6"/><path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z"/><path d="m21.5 21.5-1.4-1.4"/><path d="M3.9 3.9 2.5 2.5"/><path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z"/>',
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
//
// Order is important — first match wins. List industry/service keywords
// BEFORE generic keywords (e.g. "emergency dental" → siren must beat the
// generic "dental"→smile pattern).
const RULES: IconRule[] = [
  // ─── v1.1.5 — Industry-specific (most specific first) ───────────────
  // Emergency / urgency → siren (beats dental/medical/etc when "emergency" present)
  { icon: "siren", keywords: ["emergency", "urgent", "24/7", "24 hour", "after hours"] },
  // Dental
  { icon: "baby", keywords: ["pediatric", "children", "kids dent"] },
  { icon: "smile", keywords: ["dental", "dentist", "tooth", "teeth", "whitening", "implant", "invisalign", "orthodont", "braces", "crown", "veneer", "filling", "smile"] },
  // v1.1.7 — Med spa / aesthetics treatments
  { icon: "sparkles", keywords: ["botox", "dysport", "filler", "microneedling", "hydrafacial", "facial", "chemical peel", "anti-aging", "anti aging", "rejuvenation", "skincare"] },
  { icon: "zap", keywords: ["laser", "ipl", "coolsculpting", "emsculpt", "body contouring", "sculpting"] },
  { icon: "droplets", keywords: ["iv therapy", "iv drip", "iv hydration", "hydration"] },
  // Medical / health (general — must come AFTER dental so "dental" doesn't
  // fall through to the broader stethoscope match)
  { icon: "stethoscope", keywords: ["medical", "doctor", "physician", "clinic", "exam", "checkup", "diagnos", "consult"] },
  { icon: "heart", keywords: ["cardio", "heart", "wellness", "therapy", "counsel", "mental health"] },
  // HVAC / heating / cooling / plumbing / electrical
  { icon: "snowflake", keywords: ["ac ", "a/c", "air condition", "cooling", "freon", "chiller"] },
  { icon: "flame", keywords: ["heat", "furnace", "boiler", "burner", "ignit", "gas line"] },
  { icon: "wrench", keywords: ["repair", "install", "fix", "maintenance", "tune-up", "tune up", "service call"] },
  // "pipe" alone matches "pipeline" — keep specific terms only.
  { icon: "droplets", keywords: ["plumb", "leak", "drain", "faucet", "sewer", "water heater", "water line", "indoor air"] },
  { icon: "home", keywords: ["residential", "home service", "house ", "property", "homeown"] },
  // Legal
  { icon: "scale", keywords: ["family law", "estate", "personal injury", "litigation", "criminal", "immigration", "contract law"] },
  { icon: "gavel", keywords: ["litigation", "lawsuit", "trial", "court", "judg", "verdict"] },
  { icon: "briefcase", keywords: ["business law", "corporate", "compliance", "advisory"] },
  // Auto
  { icon: "car", keywords: ["auto", "automotive", "vehicle", "tire", "brake", "engine", "oil change", "transmission"] },
  { icon: "truck", keywords: ["truck", "fleet", "moving", "delivery", "haul"] },
  // Salon / beauty / personal services
  { icon: "scissors", keywords: ["salon", "haircut", "stylist", "barber", "cut & color", "color treatment", "blowout"] },
  // Photography / creative
  { icon: "camera", keywords: ["photo", "photogr", "headshot", "portrait", "wedding shoot"] },
  { icon: "palette", keywords: ["design", "branding", "logo", "creative", "art direction", "ux/ui"] },
  // Marketing
  { icon: "megaphone", keywords: ["marketing", "campaign", "ads", "advertising", "growth marketing", "seo", "content"] },
  // Landscaping / outdoor
  { icon: "leaf", keywords: ["landscap", "lawn", "garden", "tree", "yard"] },
  // Fitness / coaching
  { icon: "dumbbell", keywords: ["fitness", "workout", "training", "personal trainer", "gym", "strength"] },
  // Quotes / estimates / billing
  { icon: "dollar_sign", keywords: ["quote", "estimate", "pricing", "billing", "invoice", "tax", "bookkeep"] },
  // Consultations
  { icon: "message_circle", keywords: ["consultation", "discovery call", "intro call", "free consult"] },

  // ─── Existing SaaS / agency / generic rules ─────────────────────────
  { icon: "globe", keywords: ["landing", "website", "domain", "homepage"] },
  { icon: "calendar", keywords: ["booking", "calendar", "appointment", "scheduling", "demo"] },
  { icon: "file_text", keywords: ["intake", "form", "questionnaire", "submission"] },
  { icon: "users", keywords: ["crm", "contact", "client", "audience"] },
  { icon: "bar_chart", keywords: ["pipeline", "kanban", "deal", "analytic", "report", "dashboard"] },
  { icon: "bot", keywords: ["agent", "automation", "workflow", "archetype", "chatbot", " bot "] },
  { icon: "mail", keywords: ["email", "newsletter", "outreach"] },
  { icon: "phone", keywords: ["sms", "phone", "twilio"] },
  { icon: "code", keywords: ["mcp", "api", "developer", "sdk", "open source"] },
  { icon: "shield", keywords: ["secure", "security", "permission", "approval", "licensed", "insured", "bonded"] },
  { icon: "lock", keywords: ["private", "encrypted", "vault", "confidential"] },
  { icon: "trending_up", keywords: ["scale", "revenue", "conversion"] },
  { icon: "zap", keywords: ["fast", "instant", "speed", "performance", "lightning", "same-day", "same day"] },
  { icon: "sparkles", keywords: ["seldon", "magic", "ai-powered", "smart"] },
  { icon: "star", keywords: ["review", "rating", "testimonial", "5-star"] },
  { icon: "check_circle", keywords: ["check", "verified", "complete", "done", "trust"] },
  { icon: "clock", keywords: ["time", "minute", "hour", "deadline"] },
  { icon: "play", keywords: ["video", "watch"] },
  { icon: "layout", keywords: ["layout", "section", "block", "template"] },
  // Tier names — important for the SaaS feature grid
  { icon: "zap", keywords: ["free"] },
  { icon: "trending_up", keywords: ["growth"] },
  { icon: "code", keywords: ["self-host", "self host", "open-source"] },
];

// v1.1.5 — vertical-aware fallback. When the global keyword pass doesn't
// match, fall back to a per-vertical default so e.g. ambiguous single-
// word services like "Cleanings" / "Whitening" / "Tune-up" don't all
// collapse to "sparkles". Picked separately from RULES because the
// vertical fallback shouldn't dominate cross-vertical patterns
// ("emergency" → siren must beat "dental" → smile).
const VERTICAL_DEFAULTS: Record<string, IconName> = {
  hvac: "wrench",
  dental: "smile",
  legal: "scale",
  agency: "palette",
  coaching: "message_circle",
  // v1.1.7 — med-spa fallback. Sparkles fits the aesthetics/luxury feel
  // when an individual treatment name doesn't keyword-match.
  medspa: "sparkles",
};

/**
 * Pick an icon name from a free-text title. Falls back to a per-vertical
 * default when no keyword matches (so dental services without obvious
 * keywords like "Cleanings" still render with a smile icon, not a generic
 * sparkles). Falls back to "sparkles" when no vertical hint is provided
 * — better than a blank slot.
 */
export function iconForTitle(
  title: string | null | undefined,
  verticalHint?: string | null
): IconName {
  if (!title) {
    return verticalHint ? VERTICAL_DEFAULTS[verticalHint] ?? "sparkles" : "sparkles";
  }
  const haystack = title.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword))) {
      return rule.icon;
    }
  }
  if (verticalHint && VERTICAL_DEFAULTS[verticalHint]) {
    return VERTICAL_DEFAULTS[verticalHint];
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
}, verticalHint?: string | null): IconName {
  if (item.icon && hasIcon(item.icon)) return item.icon as IconName;
  return iconForTitle(item.title, verticalHint);
}
