// /build landing content — the pure copy + snippet layer (spec 1ff09dcb).
//
// The developer landing at /build is the human-browsable front door to the
// builder marketplace — the Monid-clean twin of /SKILL.md. This module owns the
// LOAD-BEARING strings that page renders: the hero command, the
// discover→inspect→run story, the three rentable types, the realistic IDE chat
// snippet, the pricing facts, and the `claude mcp add` connect snippet. Keeping
// them here (pure: no React, no I/O, no "use server") lets the funnel content be
// pinned with plain string assertions and reused verbatim by the page + tests —
// the same discipline as skill-md.ts and developer-key.ts.
//
// The two cross-surface invariants this guarantees: the hero command, the MCP
// origin, and the key/wallet paths MATCH SKILL.md (one funnel, two surfaces),
// and the builder split is stated honestly (keep 95%, SF takes 5%, errors free).

import { SKILL_MD_MCP_URL, SKILL_MD_KEYS_PATH } from "@/lib/build/skill-md";
import { buildMcpConnectSnippet } from "@/lib/build/developer-key";

// ─── the one-command hero funnel ─────────────────────────────────────────────

/** The headline command a dev pastes into their IDE agent — the single entry
 *  point, identical to the one SKILL.md documents. Copyable in the hero. */
export const BUILD_SETUP_COMMAND = "set up https://seldonframe.com/SKILL.md";

/** Where a dev mints the `wst_` workspace bearer (reused from SKILL.md). */
export const BUILD_KEYS_PATH = SKILL_MD_KEYS_PATH;

/** The prepaid-wallet surface (balance + top-up). */
export const BUILD_WALLET_PATH = "/build/wallet";

/** The MCP origin the IDE connector points at (reused from SKILL.md). */
export const BUILD_MCP_URL = SKILL_MD_MCP_URL;

/** The builder's revenue share — they keep this much of every paid run. */
export const BUILDER_KEEP_PCT = 95;

/** SeldonFrame's clean take on usage (the only fee, on real runs). */
export const SELDONFRAME_FEE_PCT = 100 - BUILDER_KEEP_PCT; // 5

// ─── the discover → inspect → run story (section 2) ──────────────────────────

export type FlowStep = {
  key: "discover" | "inspect" | "run";
  icon: "search" | "file" | "play";
  title: string;
  body: string;
};

/** The three-verb consumption story, each a card. Mirrors the SKILL.md flow so
 *  the landing and the doc tell the same story. */
export const FLOW_STEPS: FlowStep[] = [
  {
    key: "discover",
    icon: "search",
    title: "discover",
    body: "Search the catalog in natural language. Each result comes back ranked, with its price attached.",
  },
  {
    key: "inspect",
    icon: "file",
    title: "inspect",
    body: "Get the input schema, pricing, and docs for any entry — so your agent knows exactly how to call it.",
  },
  {
    key: "run",
    icon: "play",
    title: "run",
    body: "Execute with structured input and get the result inline. One balance pays for it; errors are never charged.",
  },
];

// ─── the three rentable types (section 2) ────────────────────────────────────

export type RentableType = {
  icon: "package" | "sparkles" | "users";
  name: string;
  count: string;
  body: string;
};

/** The three things every workspace key can rent through one flow, one balance.
 *  "1000+" tools is the Composio surface; Skills + Agents are the SF catalog. */
export const RENTABLE_TYPES: RentableType[] = [
  {
    icon: "package",
    name: "Tools",
    count: "1000+ Composio actions",
    body: "Send an email, create a calendar event, update a CRM — call a single connected action and pay per call.",
  },
  {
    icon: "sparkles",
    name: "Skills",
    count: "Composable capabilities",
    body: "Drop a packaged skill into your own agent — qualify a lead, draft a quote, summarize a thread.",
  },
  {
    icon: "users",
    name: "Agents",
    count: "Whole workers",
    body: "Rent a complete agent — a 24/7 receptionist, a review chaser — and call it over MCP like a teammate.",
  },
];

// ─── the realistic IDE chat snippet (section 3) ──────────────────────────────

export type ChatTurn = { role: "you" | "agent"; text: string };

/** The natural-language ask a builder types, and the tool chain their IDE agent
 *  runs in response. The realistic "build me a receptionist and list it" moment
 *  from the spec — shown as an IDE chat transcript. */
export const IDE_CHAT: ChatTurn[] = [
  {
    role: "you",
    text: "build me a 24/7 receptionist that answers calls, qualifies the lead, and books the job — then list it for $0.10/call.",
  },
  {
    role: "agent",
    text: "On it. Generating the blueprint, running its evals, then publishing with a per-call price.",
  },
];

/** The MCP tool chain the agent runs for that ask — rendered as a compact,
 *  monospaced "running…" trace under the chat. The real tool names, in order. */
export const IDE_TOOL_CHAIN: string[] = [
  "create_agent",
  "run_agent_evals",
  "publish_agent",
  "set_usage_price",
];

// ─── the connect snippet (section 5) ─────────────────────────────────────────

/** The placeholder a dev swaps for the `wst_` key they mint at /build/keys. */
export const KEY_PLACEHOLDER = "wst_your_key";

/**
 * The copyable `claude mcp add seldonframe …` command for the Connect section.
 * Reuses buildMcpConnectSnippet (the SAME generator the /settings/api reveal
 * panel and SKILL.md use) with a visible placeholder key, so the three surfaces
 * never drift. Pure — same output every call.
 */
export function buildLandingConnectSnippet(): string {
  return buildMcpConnectSnippet(KEY_PLACEHOLDER, BUILD_MCP_URL);
}

// ─── pricing facts (section 4) ───────────────────────────────────────────────

export type PricingPoint = { icon: "check" | "dollar" | "shield" | "trending"; text: string };

/** The four honest pricing facts, each a checked line. No subscription; list
 *  free; keep 95%; prepaid wallet; errors never charged. */
export const PRICING_POINTS: PricingPoint[] = [
  { icon: "dollar", text: "Listing is free. No subscription, no seat fee, no upfront cost." },
  { icon: "trending", text: `You earn per call. Set per-call or per-outcome pricing from your IDE.` },
  { icon: "check", text: `You keep ${BUILDER_KEEP_PCT}%. SeldonFrame takes a clean ${SELDONFRAME_FEE_PCT}% on real usage — nothing else.` },
  { icon: "shield", text: "Prepaid wallet draws down per run, and errored runs are never charged." },
];
