// The AI Recommendation Index — v1 (2026-07-09) data registry.
//
// A monthly-snapshot leaderboard of which software brands AI engines
// actually recommend for small-service-business buyer questions. This file
// is the single typed source of truth: the fixed prompt set, the raw
// per-question appearances (brand + rank), and the derived leaderboard
// (score = sum over appearances of (6 - rank), so a #1 mention is worth 5
// points and a #5 mention is worth 1). Both the page and its .md twin read
// from here — nothing is computed client-side beyond filtering/sorting.
//
// Methodology, in full:
//   - 10 fixed buyer questions (below), run through each engine.
//   - Claude column: `claude -p "<question>. Answer with a ranked list of up
//     to 5 specific products and one line why each." --model sonnet`, n=1
//     (one sample per question — answers vary run to run; this is a
//     snapshot, not a benchmark).
//   - Google AI Overviews column: attempted via the DataForSEO SERP API
//     (POST /v3/serp/google/organic/live/advanced) on the same date. Did
//     NOT ship in v1 — see docs/strategy/ai-reco-index/2026-07-09-raw.md for
//     why (Google did not render an AI Overview block for these queries at
//     request time, and the full batch run hit unreliable connectivity).
//     v1 is Claude-only. No column is fabricated.
//   - Brand names are normalized (e.g. "GoHighLevel" / "HighLevel" / "GHL"
//     all collapse to one brand) before scoring.
//   - Every scored brand has at least one question-appearance receipt (see
//     `appearances` below) — nothing is added to the leaderboard without a
//     citation back to a raw answer.
//   - Raw, verbatim engine outputs are archived at
//     docs/strategy/ai-reco-index/2026-07-09-raw.md so every scored point is
//     auditable against the source.
//
// This file is intentionally a typed const, not a database row — the
// monthly regeneration loop (scripts/ai-reco-snapshot.mjs) is meant to
// produce a new dated snapshot object here (or a follow-on file) rather than
// mutate history in place.

export type Engine = "claude";

export type Category = "crm" | "booking" | "voice-ai" | "all-in-one";

export type Question = {
  id: string;
  text: string;
  /** Which leaderboard categories this question's appearances roll into. */
  categories: Category[];
};

export type Appearance = {
  questionId: string;
  engine: Engine;
  /** 1 = top of the ranked list, 5 = last of up to 5. */
  rank: number;
};

export type Brand = {
  /** Canonical display name. */
  name: string;
  /** Alternate strings normalized to this brand when parsing raw answers. */
  aliases: string[];
  /** Every question this brand appeared in, with engine + rank — the
   *  per-point audit trail. Never empty for a brand on the leaderboard. */
  appearances: Appearance[];
};

export const SNAPSHOT_DATE = "2026-07-09";
export const SNAPSHOT_LABEL = "July 2026";

export const ENGINES_SHIPPED: Engine[] = ["claude"];

export const METHODOLOGY = {
  claudeModel: "claude-sonnet (claude CLI, --model sonnet)",
  claudeSampling: "n=1 per question — one sample, not averaged across runs",
  googleAiOverviewStatus:
    "Attempted via DataForSEO SERP API on 2026-07-09; not shipped in v1 " +
    "(Google did not render an AI Overview block for these queries at " +
    "request time; the full 10-question batch also hit unreliable network " +
    "connectivity mid-run). See docs/strategy/ai-reco-index/2026-07-09-raw.md " +
    "for the full attempt log. v1 ships Claude-only — no column is " +
    "fabricated to fill the gap.",
  rawOutputsPath: "docs/strategy/ai-reco-index/2026-07-09-raw.md",
  scoring: "score = sum over appearances of (6 - rank); rank 1 = 5 points, rank 5 = 1 point",
  caveat: "Answers vary run to run. This is a snapshot, not a benchmark.",
} as const;

export const QUESTIONS: Question[] = [
  { id: "q1", text: "best CRM for a small plumbing business", categories: ["crm"] },
  { id: "q2", text: "best CRM for a cleaning business", categories: ["crm"] },
  { id: "q3", text: "best appointment booking software for a small service business", categories: ["booking"] },
  { id: "q4", text: "best AI receptionist for a small business", categories: ["voice-ai"] },
  { id: "q5", text: "best GoHighLevel alternative", categories: ["all-in-one", "crm"] },
  { id: "q6", text: "best HubSpot alternative for a small business", categories: ["crm"] },
  { id: "q7", text: "best free CRM for a one-person business", categories: ["crm"] },
  { id: "q8", text: "best missed-call text-back software", categories: ["all-in-one"] },
  {
    id: "q9",
    text: "best all-in-one platform for a marketing agency serving local businesses",
    categories: ["all-in-one"],
  },
  { id: "q10", text: "best voice AI for answering business calls", categories: ["voice-ai"] },
];

export const QUESTION_BY_ID: Record<string, Question> = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));

/**
 * The brand registry. Every appearance below is transcribed directly from
 * the verbatim raw outputs in docs/strategy/ai-reco-index/2026-07-09-raw.md
 * — normalize-then-score, no editorializing on rank.
 */
export const BRANDS: Brand[] = [
  {
    name: "HubSpot",
    aliases: ["HubSpot CRM", "HubSpot CRM (free tier)", "HubSpot CRM (Free/Starter)", "HubSpot Free CRM"],
    appearances: [
      { questionId: "q1", engine: "claude", rank: 4 },
      { questionId: "q2", engine: "claude", rank: 4 },
      { questionId: "q5", engine: "claude", rank: 1 },
      { questionId: "q7", engine: "claude", rank: 1 },
    ],
  },
  {
    name: "GoHighLevel",
    aliases: ["GHL", "HighLevel", "GoHighLevel (GHL)", "GoHighLevel (LeadConnector)"],
    appearances: [
      { questionId: "q1", engine: "claude", rank: 5 },
      { questionId: "q2", engine: "claude", rank: 5 },
      { questionId: "q8", engine: "claude", rank: 2 },
      { questionId: "q9", engine: "claude", rank: 1 },
    ],
  },
  {
    name: "Jobber",
    aliases: [],
    appearances: [
      { questionId: "q1", engine: "claude", rank: 1 },
      { questionId: "q2", engine: "claude", rank: 1 },
    ],
  },
  {
    name: "Housecall Pro",
    aliases: [],
    appearances: [
      { questionId: "q1", engine: "claude", rank: 2 },
      { questionId: "q2", engine: "claude", rank: 2 },
      { questionId: "q3", engine: "claude", rank: 4 },
    ],
  },
  {
    name: "ServiceTitan",
    aliases: [],
    appearances: [
      { questionId: "q1", engine: "claude", rank: 3 },
      { questionId: "q2", engine: "claude", rank: 3 },
    ],
  },
  {
    name: "Zoho CRM",
    aliases: ["Zoho", "Zoho CRM Free"],
    appearances: [
      { questionId: "q6", engine: "claude", rank: 1 },
      { questionId: "q7", engine: "claude", rank: 2 },
    ],
  },
  {
    name: "Podium",
    aliases: [],
    appearances: [
      { questionId: "q8", engine: "claude", rank: 1 },
      { questionId: "q9", engine: "claude", rank: 4 },
    ],
  },
  {
    name: "Vendasta",
    aliases: [],
    appearances: [
      { questionId: "q5", engine: "claude", rank: 3 },
      { questionId: "q9", engine: "claude", rank: 2 },
    ],
  },
  {
    name: "Air AI",
    aliases: ["Air.io", "Air AI (Aidbase/Air)"],
    appearances: [
      { questionId: "q4", engine: "claude", rank: 2 },
      { questionId: "q10", engine: "claude", rank: 3 },
    ],
  },
  {
    name: "ActiveCampaign",
    aliases: [],
    appearances: [
      { questionId: "q5", engine: "claude", rank: 2 },
      { questionId: "q6", engine: "claude", rank: 4 },
    ],
  },
  {
    name: "Goodcall",
    aliases: [],
    appearances: [
      { questionId: "q4", engine: "claude", rank: 4 },
      { questionId: "q10", engine: "claude", rank: 5 },
    ],
  },
  {
    name: "Birdeye",
    aliases: [],
    appearances: [
      { questionId: "q8", engine: "claude", rank: 4 },
      { questionId: "q9", engine: "claude", rank: 5 },
    ],
  },
  {
    name: "Freshsales",
    aliases: ["Freshsales (Freshworks)", "Freshsales (Freshworks CRM) Free"],
    appearances: [
      { questionId: "q6", engine: "claude", rank: 5 },
      { questionId: "q7", engine: "claude", rank: 4 },
    ],
  },
  {
    name: "Calendly",
    aliases: [],
    appearances: [{ questionId: "q3", engine: "claude", rank: 1 }],
  },
  {
    name: "Square Appointments",
    aliases: [],
    appearances: [{ questionId: "q3", engine: "claude", rank: 2 }],
  },
  {
    name: "Acuity Scheduling",
    aliases: [],
    appearances: [{ questionId: "q3", engine: "claude", rank: 3 }],
  },
  {
    name: "Setmore",
    aliases: [],
    appearances: [{ questionId: "q3", engine: "claude", rank: 5 }],
  },
  {
    name: "Smith.ai",
    aliases: [],
    appearances: [{ questionId: "q4", engine: "claude", rank: 1 }],
  },
  {
    name: "Dialpad",
    aliases: ["Dialpad Ai Voice", "Dialpad AI Receptionist"],
    appearances: [{ questionId: "q4", engine: "claude", rank: 3 }],
  },
  {
    name: "Ruby",
    aliases: ["Ruby (with AI features)", "Rosie AI Receptionist"],
    appearances: [{ questionId: "q4", engine: "claude", rank: 5 }],
  },
  {
    name: "Keap",
    aliases: [],
    appearances: [{ questionId: "q5", engine: "claude", rank: 4 }],
  },
  {
    name: "ClickFunnels",
    aliases: [],
    appearances: [{ questionId: "q5", engine: "claude", rank: 5 }],
  },
  {
    name: "Pipedrive",
    aliases: [],
    appearances: [{ questionId: "q6", engine: "claude", rank: 2 }],
  },
  {
    name: "Close",
    aliases: [],
    appearances: [{ questionId: "q6", engine: "claude", rank: 3 }],
  },
  {
    name: "Bitrix24",
    aliases: ["Bitrix24 Free"],
    appearances: [{ questionId: "q7", engine: "claude", rank: 3 }],
  },
  {
    name: "Capsule CRM",
    aliases: ["Capsule CRM Free"],
    appearances: [{ questionId: "q7", engine: "claude", rank: 5 }],
  },
  {
    name: "Weave",
    aliases: [],
    appearances: [{ questionId: "q8", engine: "claude", rank: 3 }],
  },
  {
    name: "OpenPhone",
    aliases: [],
    appearances: [{ questionId: "q8", engine: "claude", rank: 5 }],
  },
  {
    name: "Thryv",
    aliases: [],
    appearances: [{ questionId: "q9", engine: "claude", rank: 3 }],
  },
  {
    name: "Bland AI",
    aliases: [],
    appearances: [{ questionId: "q10", engine: "claude", rank: 1 }],
  },
  {
    name: "Synthflow",
    aliases: [],
    appearances: [{ questionId: "q10", engine: "claude", rank: 2 }],
  },
  {
    name: "Retell AI",
    aliases: [],
    appearances: [{ questionId: "q10", engine: "claude", rank: 4 }],
  },
];

/** Normalize a raw brand-name string to its canonical form via the alias
 *  table. Falls back to the input unchanged (trimmed) when unrecognized. */
export function normalizeBrandName(raw: string): string {
  const trimmed = raw.trim();
  for (const brand of BRANDS) {
    if (brand.name === trimmed) return brand.name;
    if (brand.aliases.some((a) => a.toLowerCase() === trimmed.toLowerCase())) return brand.name;
  }
  return trimmed;
}

/** Points awarded for a given rank (1..5): rank 1 = 5 points, rank 5 = 1. */
export function pointsForRank(rank: number): number {
  return Math.max(0, 6 - rank);
}

export type LeaderboardRow = {
  brand: string;
  score: number;
  appearances: Appearance[];
  questionCount: number;
};

/** Sum a brand's appearances into its total score. Pure. */
export function scoreBrand(brand: Brand): number {
  return brand.appearances.reduce((sum, a) => sum + pointsForRank(a.rank), 0);
}

/** The overall leaderboard: every brand with >=1 appearance, scored and
 *  sorted descending (ties broken alphabetically for stability). */
export function buildLeaderboard(category?: Category): LeaderboardRow[] {
  const rows: LeaderboardRow[] = BRANDS.filter((b) => b.appearances.length > 0)
    .map((b) => {
      const appearances = category
        ? b.appearances.filter((a) => QUESTION_BY_ID[a.questionId]?.categories.includes(category))
        : b.appearances;
      return { brand: b.name, appearances, questionCount: appearances.length };
    })
    .filter((r) => r.questionCount > 0)
    .map((r) => ({ ...r, score: r.appearances.reduce((sum, a) => sum + pointsForRank(a.rank), 0) }));

  return rows.sort((a, b) => b.score - a.score || a.brand.localeCompare(b.brand));
}

export const CATEGORY_LABELS: Record<Category, string> = {
  crm: "CRM",
  booking: "Booking",
  "voice-ai": "Voice AI",
  "all-in-one": "All-in-one",
};
