// packages/crm/src/lib/marketplace/taste/taste-policy.ts
//
// Taste mode — pure policy: constants, clamps, flagship parse, doors copy.
// Everything here is env-free-by-parameter (env objects are passed in) so it
// unit-tests with no process.env mutation. Design:
// docs/superpowers/specs/2026-07-03-agent-taste-mode-design.md §3, §4.

import { createHash } from "node:crypto";
import type { ListingSellerPreferences } from "@/db/schema/marketplace";

/** Cheap tier — the literal value of DEFAULT_TERTIARY_MODEL
 *  (lib/blocks/personality-generator.ts). Taste never escalates models. */
export const TASTE_MODEL = "claude-3-5-haiku-20241022";
/** Per-turn output ceiling (seller-spend protection). */
export const TASTE_MAX_TOKENS = 400;
/** Grounding extraction output ceiling + input truncation. */
export const TASTE_EXTRACT_MAX_TOKENS = 1200;
export const TASTE_EXTRACT_INPUT_CHARS = 20_000;
/** Session TTL — token expiry AND row expires_at agree on this. */
export const TASTE_SESSION_TTL_MS = 3_600_000; // 1h
/** Serialized grounding blob hard cap. */
export const TASTE_GROUNDING_MAX_BYTES = 8192;
export const DAY_MS = 86_400_000;

/** Platform hard ceilings the seller's budget clamps into. */
export const DEFAULT_TASTE_CALLS_PER_VISITOR = 3;
export const HARD_MAX_TASTE_CALLS_PER_VISITOR = 10;
export const DEFAULT_TASTE_DAILY_CAP = 50;
export const HARD_MAX_TASTE_DAILY_CAP = 500;

/** Capabilities the taste turn may hand the agent loop (creator-workspace
 *  readers and all side-effect tools are excluded; testMode:true is the second
 *  fence). */
export const TASTE_CAPABILITY_ALLOWLIST = ["provide_faq_answer", "get_quote_range"] as const;

export const GROUND_TOOL_NAME = "ground_on_my_business";

/** The anonymous tools/call allowlist (wire names). */
export const TASTE_TOOL_ALLOWLIST: ReadonlySet<string> = new Set([
  "get_quote_range",
  "provide_faq_answer",
  "ask",
  GROUND_TOOL_NAME,
]);

type EnvLike = Record<string, string | undefined>;

export function isTasteFlagOn(env: EnvLike): boolean {
  return env.SF_AGENT_TASTE_MODE?.trim() === "1";
}

/** SF-owned orgs where platform-key taste is intended (the flagship bench). */
export function parseFlagshipOrgIds(env: EnvLike): Set<string> {
  return new Set(
    (env.SF_FLAGSHIP_ORG_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}

export type TasteBudget = { visitorLimit: number; dailyCap: number; optedOut: boolean };

function clampInt(raw: unknown, fallback: number, max: number): number {
  // NaN is garbage => fallback. +Infinity/-Infinity are numeric and clamp
  // cleanly via Math.min/Math.max below, so only NaN needs the fallback path
  // (Number.isFinite(Infinity) is false, which would otherwise mis-route it).
  if (typeof raw !== "number" || Number.isNaN(raw)) return fallback;
  const n = Number.isFinite(raw) ? Math.floor(raw) : raw;
  return Math.min(Math.max(n, 0), max);
}

/** Seller budget within platform ceilings. visitorLimit 0 = seller opt-out. */
export function resolveTasteBudget(prefs: ListingSellerPreferences | null | undefined): TasteBudget {
  const visitorLimit = clampInt(
    prefs?.tasteCallsPerVisitor, DEFAULT_TASTE_CALLS_PER_VISITOR, HARD_MAX_TASTE_CALLS_PER_VISITOR,
  );
  const dailyCap = clampInt(prefs?.tasteDailyCap, DEFAULT_TASTE_DAILY_CAP, HARD_MAX_TASTE_DAILY_CAP);
  return { visitorLimit, dailyCap, optedOut: visitorLimit === 0 };
}

/** sha256(ip|secret) truncated — raw IPs never stored or logged. */
export function hashTasteIp(ip: string, secret: string): string {
  return createHash("sha256").update(`${ip}|${secret}`).digest("hex").slice(0, 32);
}

/** Mirrors route.ts resourceUrl()'s base resolution. */
export function appBaseUrl(env: EnvLike): string {
  return (env.NEXT_PUBLIC_APP_URL || "https://app.seldonframe.com").replace(/\/$/, "");
}

export type TasteDoorsReason = "visitor_cap" | "daily_cap" | "locked_tool" | "no_taste_key";

/** The three-door conversion response. Warm, structured, REAL urls, never a
 *  bare error. Returned as a successful MCP text result so renter LLMs relay
 *  it instead of retrying. */
export function buildTasteDoorsText(input: {
  agentName: string;
  slug: string;
  visitorLimit: number;
  reason: TasteDoorsReason;
  env: EnvLike;
}): string {
  const fork = `${appBaseUrl(input.env)}/marketplace/${input.slug}`;
  const opener =
    input.reason === "locked_tool"
      ? `That tool needs a real rental key — it does live work in a real workspace.`
      : input.reason === "no_taste_key"
        ? `Free tasting isn't available for ${input.agentName} right now.`
        : `You've used your ${input.visitorLimit} free taste calls with ${input.agentName} — thanks for kicking the tires!`;
  return [
    opener,
    ``,
    `Three doors from here:`,
    ``,
    `1. KEEP TALKING — get your own free workspace + API key (first workspace free forever): https://seldonframe.com/build`,
    `2. FORK THIS AGENT — make it yours in one click, free, no signup: ${fork}`,
    `3. SELL AGENTS LIKE THIS — build and sell your own on SeldonFrame: https://seldonframe.com/build`,
    ``,
    `(Relay these links to the human you're working for.)`,
  ].join("\n");
}

/** initialize.instructions when taste is active (absent otherwise —
 *  byte-identical flag-off). */
export function buildTasteInstructions(input: {
  agentName: string;
  capabilities: string[];
  visitorLimit: number;
}): string {
  return (
    `${input.agentName} is a rentable SeldonFrame agent. ` +
    `You have ${input.visitorLimit} free taste calls (no key needed). ` +
    `Start with ${GROUND_TOOL_NAME} and your website URL — the agent will demo grounded on YOUR business. ` +
    `Then use ask / get_quote_range / provide_faq_answer. ` +
    `Pass the returned taste_session value on later calls to stay grounded.`
  );
}
