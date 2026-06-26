// Primitive-Composition Agent Generator — P5.3: the Soul-grounded author context.
//
// The author (author-llm.ts) writes a GENERIC skill when it knows nothing about
// the business. Grounding it in the authoring workspace's Soul — who they are,
// what they do, their services, their brand voice — is the single biggest quality
// lever: it turns a generic playbook into one that speaks AS this specific
// business. This module fetches a COMPACT business summary for an org and renders
// it as a prompt block the author can inject.
//
// Two pure-ish pieces + one fail-soft fetch:
//   • `loadAuthorSoulContext(orgId, deps)` — the ONLY I/O: read the org's Soul via
//     an INJECTED `getSoul` (the real one lives in lib/soul/server.ts, a "use
//     server" module — the action layer at P5.4 passes it in; tests inject a
//     fake). Condenses the Soul to a hard-capped (~600 char) plain-text summary,
//     or "" when there's no usable context. NEVER throws (swallows store errors).
//   • `summarizeSoulForAuthor(soul)` — the PURE condenser: OrgSoul → the compact
//     string (or ""). Unit-testable with a literal Soul, no DB.
//   • `soulContextBlock(summary)` — the PURE prompt renderer: a non-empty summary
//     becomes the "The business you are authoring this agent for:" block with the
//     "speak/act as THIS business" instruction; "" → "" (the author stays generic,
//     today's behavior).
//
// NOT "use server": a plain module of pure fns + one DI-friendly async fetch, the
// same split author-llm.ts / classify-llm.ts use. It performs no I/O of its own —
// the only side-effect-capable dependency (getSoul) is dependency-injected — so
// this file stays deterministic and importable from anywhere (action, route,
// runtime, test). Never throws.

import type { OrgSoul } from "@/lib/soul/types";

// ─── budget ────────────────────────────────────────────────────────────────────

/**
 * Hard cap on the rendered business summary. The summary rides in EVERY author
 * system prompt, so it must stay compact — a paragraph, not a dossier. Long
 * enough for name + what-they-do + a few services + tone; short enough that it
 * never dominates the prompt or balloons cost. Truncation is a hard slice with an
 * ellipsis (see `clampSummary`).
 */
export const SOUL_SUMMARY_MAX_CHARS = 600;

/** How many services to name in the summary before we stop (keeps it a summary,
 *  not a full catalog — the playbook can elaborate). */
const MAX_SERVICES = 4;

// ─── the read seam ───────────────────────────────────────────────────────────

/**
 * The dependency `loadAuthorSoulContext` needs: a read of the org's Soul. The
 * real implementation is `getSoul` from `@/lib/soul/server` (a single
 * `SELECT soul FROM organizations WHERE id = $orgId`, itself already fail-soft to
 * null). It's a "use server" module, so the action layer (P5.4) injects it here
 * rather than this plain module importing it directly — which also makes the
 * summary unit-testable with an in-memory fake, no DB.
 */
export type AuthorSoulDeps = {
  /** Read the org's Soul, or null when there's none / on error. */
  getSoul: (orgId: string) => Promise<OrgSoul | null>;
};

// ─── the fetch (the only I/O; fail-soft) ─────────────────────────────────────

/**
 * Load a COMPACT plain-text business summary for `orgId` to ground the author, or
 * `""` when there's no usable context (a new/empty org, no Soul, a missing orgId,
 * or a store error).
 *
 * Cheap by construction: ONE read via the injected `getSoul`, then a pure
 * condense (`summarizeSoulForAuthor`) — no LLM call, no second query. FAIL-SOFT:
 * a missing orgId short-circuits to ""; a throwing/missing `getSoul` is swallowed
 * to "". NEVER throws — the author simply stays generic (today's behavior) when
 * there's nothing to ground it with.
 */
export async function loadAuthorSoulContext(
  orgId: string,
  deps: AuthorSoulDeps,
): Promise<string> {
  const id = typeof orgId === "string" ? orgId.trim() : "";
  if (!id) return "";
  if (typeof deps?.getSoul !== "function") return "";

  try {
    const soul = await deps.getSoul(id);
    return summarizeSoulForAuthor(soul);
  } catch {
    // Fail-soft: a Soul-read error must never break (or block) authoring.
    return "";
  }
}

// ─── the condenser (pure) ────────────────────────────────────────────────────

/**
 * Condense an `OrgSoul` into a COMPACT (~{@link SOUL_SUMMARY_MAX_CHARS}-char)
 * plain-text business summary the author can ground on: the business name + what
 * it does (industry / offering / description), its key services, and its brand
 * voice tone. Returns `""` when there's nothing usable (null soul, or a soul with
 * no name and no descriptive content).
 *
 * PURE — no I/O, no env, no clock. Never throws. Never mutates `soul`. Reads only
 * the well-typed camelCase OrgSoul fields (mirrors the "About this business" /
 * "Voice" / "Services" framing prompt.ts already uses for the runtime system
 * prompt, kept terse for the author budget).
 */
export function summarizeSoulForAuthor(soul: OrgSoul | null | undefined): string {
  if (!soul || typeof soul !== "object") return "";

  const name = cleanText(soul.businessName);
  const industry = cleanText(soul.industry);
  const offer = cleanText(soul.offerType);
  const description = cleanText(soul.businessDescription);

  const lines: string[] = [];

  // Line 1 — identity: "<name> is a <industry> business." (each part optional).
  const identityParts: string[] = [];
  if (name) identityParts.push(name);
  if (industry) {
    identityParts.push(name ? `is a ${industry} business` : `A ${industry} business`);
  }
  const identity = identityParts.join(" ");
  if (identity) lines.push(`${identity}.`);

  // What they do — prefer the description; fall back to the offer type.
  const whatTheyDo = description || offer;
  if (whatTheyDo) lines.push(whatTheyDo.endsWith(".") ? whatTheyDo : `${whatTheyDo}.`);

  // Services — a few names (the playbook can elaborate; this is a summary).
  const services = summarizeServices(soul.services);
  if (services) lines.push(`Services: ${services}.`);

  // Brand voice — the tone the agent must speak in.
  const tone = cleanText(soul.voice?.style);
  if (tone) lines.push(`Brand voice: ${tone}.`);

  const summary = lines.join(" ").trim();
  if (!summary) return "";
  return clampSummary(summary);
}

// ─── the prompt block (pure) ─────────────────────────────────────────────────

/**
 * Render a business summary as the author's grounding block, or `""`.
 *
 * A non-empty summary becomes a labeled block instructing the author to write the
 * agent AS this business — using its real services and voice, never generic
 * placeholders. An empty/blank summary → `""`, so the author's system prompt is
 * byte-for-byte unchanged and the agent stays generic (today's behavior; correct
 * for a generic marketplace template with no Soul).
 *
 * PURE — never throws, never does I/O. The leading "\n\n" lets a caller append it
 * to an existing prompt without managing spacing.
 */
export function soulContextBlock(summary: string | null | undefined): string {
  const text = typeof summary === "string" ? summary.trim() : "";
  if (!text) return "";
  return (
    "\n\nThe business you are authoring this agent for:\n" +
    text +
    "\nMake the agent speak and act as THIS business — use their real services/voice, never generic placeholders."
  );
}

// ─── helpers (pure) ──────────────────────────────────────────────────────────

/** Trim + collapse internal whitespace runs; "" for a non-string/blank value. */
function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Join up to {@link MAX_SERVICES} service NAMES into a comma list (e.g.
 * "Drain cleaning, Water heater install"). Drops blank/non-string names,
 * dedupes (case-insensitively), and appends "…" when more services exist than we
 * named. "" when there are no usable service names. Pure; never throws.
 */
function summarizeServices(services: OrgSoul["services"]): string {
  if (!Array.isArray(services) || services.length === 0) return "";
  const names: string[] = [];
  const seen = new Set<string>();
  let totalUsable = 0;
  for (const svc of services) {
    const nm = cleanText(svc?.name);
    if (!nm) continue;
    const key = nm.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    totalUsable += 1;
    if (names.length < MAX_SERVICES) names.push(nm);
  }
  if (names.length === 0) return "";
  const joined = names.join(", ");
  return totalUsable > names.length ? `${joined}, …` : joined;
}

/**
 * Hard-cap a summary at {@link SOUL_SUMMARY_MAX_CHARS}. Trims trailing whitespace
 * at the cut and appends a single "…" so the truncation is visible. The result is
 * GUARANTEED ≤ SOUL_SUMMARY_MAX_CHARS (the ellipsis fits inside the budget — we
 * slice to `MAX - 1` before appending it). Pure.
 */
function clampSummary(summary: string): string {
  if (summary.length <= SOUL_SUMMARY_MAX_CHARS) return summary;
  const sliced = summary.slice(0, SOUL_SUMMARY_MAX_CHARS - 1).trimEnd();
  return `${sliced}…`;
}
