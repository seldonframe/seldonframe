// The AI Front Office Chart — data registry.
//
// This is Maxime Houle's personal, subjective belief-map of where every
// trend in local-business AI sits on its adoption curve, levels.io
// the-everything-chart style. NOTHING here is research or a market study —
// it is one founder's judgment, updated as his beliefs change. Max edits
// THIS FILE ONLY to update his takes; the page/component/route just render
// whatever is here.
//
// `points` are 0-100 subjective "attention / adoption" values plotted
// against year. Years beyond the current year are projections — the chart
// component renders those segments dashed and labels them
// "projection (opinion)". `annotations` are pinned ONLY to real, publicly
// verifiable events (ship dates, enforcement waves) — if the year isn't
// certain, leave the annotation out rather than guess.

export type TrendStatus = "rising" | "peaking" | "declining" | "reborn";

export type TrendPoint = { year: number; value: number };

export type TrendAnnotation = { year: number; text: string };

export type Trend = {
  key: string;
  label: string;
  color: string;
  points: TrendPoint[];
  annotations: TrendAnnotation[];
  /** Max's one-paragraph belief. Opinion only — never a fabricated statistic. */
  take: string;
  status: TrendStatus;
};

const CURRENT_YEAR = 2026;

/** A point in a year beyond CURRENT_YEAR is a projection, not a claim. */
export function isProjection(point: TrendPoint): boolean {
  return point.year > CURRENT_YEAR;
}

export const TREND_CHART_LAST_UPDATED = "July 2026";

export const TRENDS: Trend[] = [
  {
    key: "voice-ai-smb",
    label: "Voice AI for SMBs",
    color: "#059669",
    points: [
      { year: 2019, value: 4 },
      { year: 2021, value: 8 },
      { year: 2023, value: 22 },
      { year: 2024, value: 45 },
      { year: 2025, value: 68 },
      { year: 2026, value: 80 },
      { year: 2028, value: 90 },
      { year: 2031, value: 94 },
    ],
    annotations: [{ year: 2023, text: "GPT moment — realtime voice models go from demo to usable" }],
    take: "This is the one I'd bet the company on, and I have. Two years ago 'AI phone agent' was a party trick; now it's the single highest-intent search term in this whole space. I think voice keeps climbing through 2028 before it plateaus into 'boring infrastructure,' the same way chat widgets did.",
    status: "rising",
  },
  {
    key: "ai-receptionist-vs-human-answering",
    label: "AI receptionists vs human answering services",
    color: "#B8860B",
    points: [
      { year: 2018, value: 30 },
      { year: 2022, value: 35 },
      { year: 2024, value: 42 },
      { year: 2025, value: 58 },
      { year: 2026, value: 66 },
      { year: 2028, value: 78 },
    ],
    annotations: [],
    take: "Human answering services aren't dying, they're getting squeezed from the bottom. Every SMB that would've paid $300-600/mo for a call center now tries an AI receptionist first, and for straightforward booking/FAQ calls it wins. Complex triage still goes human for a while longer — I don't think that line moves as fast as voice-AI hype suggests.",
    status: "rising",
  },
  {
    key: "mcp-agents-as-integrations",
    label: "MCP / agents-as-integrations",
    color: "#5B8DEF",
    points: [
      { year: 2023, value: 2 },
      { year: 2024, value: 10 },
      { year: 2025, value: 38 },
      { year: 2026, value: 62 },
      { year: 2028, value: 85 },
      { year: 2031, value: 92 },
    ],
    annotations: [{ year: 2024, text: "Anthropic ships MCP" }],
    take: "MCP is the biggest structural shift I've seen since the API economy itself, and most SMB software companies still don't know it's happening. In three years 'does it have an MCP server' will be as standard a question as 'does it have an API' is today. We built our whole integration layer on this bet.",
    status: "rising",
  },
  {
    key: "one-person-company",
    label: "The one-person company",
    color: "#8E44AD",
    points: [
      { year: 2020, value: 8 },
      { year: 2022, value: 14 },
      { year: 2024, value: 28 },
      { year: 2025, value: 44 },
      { year: 2026, value: 55 },
      { year: 2028, value: 70 },
    ],
    annotations: [],
    take: "Still early relative to the discourse about it. Plenty of solo founders are running seven-figure businesses on AI tooling, but the median 'one-person company' is still a side hustle, not a real replacement for a team. I think this becomes mainstream-credible (not just Twitter-credible) by 2028.",
    status: "rising",
  },
  {
    key: "diy-agent-stacks",
    label: "DIY agent stacks (n8n / Make tinkering)",
    color: "#D68910",
    points: [
      { year: 2022, value: 15 },
      { year: 2023, value: 35 },
      { year: 2024, value: 62 },
      { year: 2025, value: 70 },
      { year: 2026, value: 66 },
      { year: 2028, value: 48 },
    ],
    annotations: [],
    take: "This is peaking right now and I think it starts declining within the next year or two, not because the tools are bad but because most SMB owners never wanted to be workflow engineers — they wanted the outcome. The DIY stack was a bridge technology while nobody sold the finished product yet. That bridge is getting shorter.",
    status: "peaking",
  },
  {
    key: "ghl-all-in-one",
    label: "GHL-style all-in-one agency platforms",
    color: "#C0392B",
    points: [
      { year: 2019, value: 10 },
      { year: 2021, value: 35 },
      { year: 2023, value: 70 },
      { year: 2024, value: 82 },
      { year: 2025, value: 80 },
      { year: 2026, value: 72 },
      { year: 2028, value: 58 },
    ],
    annotations: [],
    take: "I think this category peaked and is now in slow fatigue. Agencies I talk to love what it unlocked but are tired of the per-seat sprawl and the Zapier-shaped duct tape holding it together. It's not going away — it's a real business with real customers — but the growth story is behind it, and AI-native platforms are the thing eating its edges.",
    status: "declining",
  },
  {
    key: "per-seat-saas-pricing",
    label: "Per-seat SaaS pricing",
    color: "#A93226",
    points: [
      { year: 2010, value: 55 },
      { year: 2015, value: 75 },
      { year: 2020, value: 82 },
      { year: 2023, value: 78 },
      { year: 2024, value: 68 },
      { year: 2025, value: 55 },
      { year: 2026, value: 46 },
      { year: 2028, value: 30 },
    ],
    annotations: [],
    take: "Per-seat pricing made sense when software needed a human in every seat to run it. Once agents do the seat's job, charging per human stops making sense — you're pricing against the thing you're trying to replace. I believe this model keeps losing ground every year AI agents get more capable, and I'm structurally betting against it with our own pricing.",
    status: "declining",
  },
  {
    key: "flat-usage-pricing",
    label: "Flat / usage pricing",
    color: "#00A896",
    points: [
      { year: 2018, value: 20 },
      { year: 2021, value: 28 },
      { year: 2023, value: 35 },
      { year: 2024, value: 42 },
      { year: 2025, value: 55 },
      { year: 2026, value: 62 },
      { year: 2028, value: 75 },
    ],
    annotations: [],
    take: "The mirror image of the last one. As BYOK and cheap inference make COGS close to zero, flat pricing stops being a sacrifice and becomes the honest way to charge. I expect the SMB software buyer to increasingly treat metered/seat pricing as a red flag rather than a feature by 2028.",
    status: "rising",
  },
  {
    key: "ai-search-aeo",
    label: "AI search / AEO replacing blue links",
    color: "#2E86C1",
    points: [
      { year: 2022, value: 5 },
      { year: 2023, value: 18 },
      { year: 2024, value: 38 },
      { year: 2025, value: 58 },
      { year: 2026, value: 70 },
      { year: 2028, value: 84 },
    ],
    annotations: [{ year: 2023, text: "GPT moment kicks off the AI-answer habit" }],
    take: "This is moving faster than most local-business owners have noticed yet. 'Best plumber near me' is quietly becoming a question you ask an assistant, not a search you scroll. I think the businesses that treat this like the next SEO — structured facts, consistent citations, real reviews — win disproportionately over the next few years.",
    status: "rising",
  },
  {
    key: "sms-a2p-regulated",
    label: "SMS / A2P as a regulated channel",
    color: "#7D3C98",
    points: [
      { year: 2019, value: 15 },
      { year: 2021, value: 30 },
      { year: 2022, value: 50 },
      { year: 2023, value: 68 },
      { year: 2024, value: 80 },
      { year: 2025, value: 85 },
      { year: 2026, value: 86 },
    ],
    annotations: [{ year: 2023, text: "carrier A2P 10DLC enforcement waves tighten registration" }],
    take: "SMS is still one of the highest-converting channels for SMBs, but it's fully a compliance product now — carriers, registration, suppression lists, the works. I don't think this deregulates; if anything the enforcement gets stricter. Anyone building on SMS without treating it as regulated infrastructure is going to get burned.",
    status: "peaking",
  },
  {
    key: "conversational-intake",
    label: "Web forms → conversational intake",
    color: "#16A085",
    points: [
      { year: 2021, value: 10 },
      { year: 2023, value: 22 },
      { year: 2024, value: 38 },
      { year: 2025, value: 52 },
      { year: 2026, value: 60 },
      { year: 2028, value: 74 },
    ],
    annotations: [],
    take: "The static intake form is a relic of a world with no better option. A chat that asks one question at a time, adapts to the answer, and books the appointment converts better every time I've tested it against a form. I think this fully replaces the multi-field form for local-service businesses within a few years, with the form surviving mainly as a fallback.",
    status: "rising",
  },
  {
    key: "zapier-middleware",
    label: "Zapier-style middleware",
    color: "#E67E22",
    points: [
      { year: 2015, value: 30 },
      { year: 2019, value: 65 },
      { year: 2022, value: 80 },
      { year: 2024, value: 78 },
      { year: 2025, value: 68 },
      { year: 2026, value: 58 },
      { year: 2028, value: 38 },
    ],
    annotations: [{ year: 2024, text: "Anthropic ships MCP — the direct-integration alternative to middleware" }],
    take: "Zapier-style glue existed because nothing talked to anything else directly. MCP gives agents a native way to call tools without a middleman translating triggers into actions. I'm not calling Zapier dead — plenty of non-AI automation still needs it — but I think its role in AI agent workflows specifically declines fast as MCP adoption climbs.",
    status: "declining",
  },
  {
    key: "missed-call-text-back",
    label: "Missed-call-text-back as a category",
    color: "#27AE60",
    points: [
      { year: 2020, value: 5 },
      { year: 2022, value: 20 },
      { year: 2023, value: 40 },
      { year: 2024, value: 60 },
      { year: 2025, value: 68 },
      { year: 2026, value: 66 },
      { year: 2028, value: 55 },
    ],
    annotations: [],
    take: "This was a genuinely great wedge feature and I think it already peaked as a standalone category. It's becoming table stakes — something every AI receptionist and CRM just does — rather than a product you'd pay for on its own. Good problem to have solved; bad place to still be a single-feature company.",
    status: "peaking",
  },
  {
    key: "whitelabel-ai-agencies",
    label: "Whitelabel AI agencies",
    color: "#CA6F1E",
    points: [
      { year: 2020, value: 20 },
      { year: 2022, value: 32 },
      { year: 2024, value: 48 },
      { year: 2025, value: 60 },
      { year: 2026, value: 68 },
      { year: 2028, value: 80 },
    ],
    annotations: [],
    take: "The agency model isn't going anywhere — local businesses still want a human relationship and someone accountable, not a self-serve dashboard. What's changing is what the agency is reselling: it used to be ad spend and a website, now it's an AI front office. I think whitelabel-agency-operated AI stacks are the dominant go-to-market for this whole category, more than direct-to-SMB self-serve.",
    status: "rising",
  },
];

/** Look up a trend by key; throws if missing (a bad key is a bug, not a
 *  recoverable state — surfacing it loudly beats silently rendering blank). */
export function getTrend(key: string): Trend {
  const t = TRENDS.find((trend) => trend.key === key);
  if (!t) throw new Error(`Unknown trend key: ${key}`);
  return t;
}

export const DEFAULT_VISIBLE_KEYS = [
  "voice-ai-smb",
  "mcp-agents-as-integrations",
  "flat-usage-pricing",
  "ai-search-aeo",
  "ghl-all-in-one",
];
