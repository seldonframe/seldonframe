// Task 10 of the win-ladder + SeldonChat plan (Phase B, step 4): the
// contextual starter-agent picker. Pure — no DB, no I/O, never throws.
//
// Maps the workspace's soul industry (organizations.soul.industry, see
// lib/soul/types.ts:69) to the two event-triggered starter agents shipped in
// the unified-agent-model P1 wave (lib/agents/skills/review-requester.ts +
// speed-to-lead.ts, fired via lib/agents/triggers/run-event-agent.ts). The
// ORDER varies by industry class — whichever starter is more valuable to that
// business leads the list — but the SET is always the same two ids; a third,
// static "flagship" voice-receptionist card is rendered by agent-picks.tsx
// alongside these two (no create action, just a link).

export type AgentPickId = "review-requester" | "speed-to-lead";

export type AgentPick = {
  id: AgentPickId;
  title: string;
  payoff: string;
};

const REVIEW_REQUESTER: AgentPick = {
  id: "review-requester",
  title: "Review Requester",
  payoff: "Turn happy customers into 5-star reviews on autopilot",
};

const SPEED_TO_LEAD: AgentPick = {
  id: "speed-to-lead",
  title: "Speed-to-Lead Responder",
  payoff: "Text new leads back in seconds — before your competitor does",
};

/** Health/beauty/wellness businesses lean on repeat, review-driven demand —
 *  the review ask leads. Case-insensitive substring match. */
const HEALTH_BEAUTY_KEYWORDS = [
  "health",
  "beauty",
  "medspa",
  "med spa",
  "spa",
  "dental",
  "dentist",
  "clinic",
  "salon",
  "wellness",
];

/** Trades businesses live and die on how fast they respond to a new lead —
 *  speed-to-lead leads. Case-insensitive substring match. */
const TRADES_KEYWORDS = [
  "plumb",
  "hvac",
  "roof",
  "electric",
  "contractor",
  "landscap",
];

function matchesAny(haystack: string, keywords: string[]): boolean {
  return keywords.some((kw) => haystack.includes(kw));
}

/**
 * Always returns exactly 2 picks (review-requester + speed-to-lead), ordered
 * by which is the better first recommendation for the given industry:
 *   - health/beauty/medspa/spa/dental/clinic → [review-requester, speed-to-lead]
 *   - trades (plumb/hvac/roof/electric/contractor/landscap) → [speed-to-lead, review-requester]
 *   - unknown/null/blank → [review-requester, speed-to-lead] (safe default)
 */
export function suggestAgentsForIndustry(industry: string | null | undefined): AgentPick[] {
  const normalized = typeof industry === "string" ? industry.trim().toLowerCase() : "";

  if (normalized && matchesAny(normalized, TRADES_KEYWORDS)) {
    return [SPEED_TO_LEAD, REVIEW_REQUESTER];
  }

  // Health/beauty gets its OWN explicit branch even though it currently
  // produces the same order as the unknown/blank fallback below. This is
  // deliberate, not dead code: it PROTECTS health/beauty ordering against
  // future changes to the default (e.g. if the fallback order ever flips to
  // lead with speed-to-lead, health/beauty must NOT silently follow it).
  if (normalized && matchesAny(normalized, HEALTH_BEAUTY_KEYWORDS)) {
    return [REVIEW_REQUESTER, SPEED_TO_LEAD];
  }

  // The unknown/blank fallback — kept as its own branch (rather than merging
  // into the health/beauty check above) so its intent stays explicit at the
  // call site.
  return [REVIEW_REQUESTER, SPEED_TO_LEAD];
}
