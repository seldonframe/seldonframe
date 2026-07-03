// Improve verb + trust rail (2026-07-02) — Task 7: patch proposer + pure guardrails.
//
// This is the FOURTH stage of the improve pipeline (see the design doc:
// docs/superpowers/specs/2026-07-02-improve-verb-trust-rail-design.md,
// "4. propose-patch.ts"): given a blueprint + the failure clusters T6
// produced + standing Brain lessons, propose a MINIMAL blueprint patch that
// might fix the failures — and, independently, a PURE guardrail any proposed
// patch (LLM-authored or not) must pass before it can even reach a shadow
// replay, let alone `applyImproveProposal`.
//
// Two independent pieces:
//
//   1. `validateProposedPatch` — PURE, FIELD-NAME-AGNOSTIC. It deliberately
//      does NOT hard-code a list of "allowed blueprint fields": the subset
//      rule (every top-level patch key must already exist as a key on
//      `currentBlueprint`) means a future blueprint field is automatically
//      patchable the moment it's added to the type, with zero edits here.
//      The only two keys ALWAYS denied — even though they legitimately exist
//      on `currentBlueprint` — are `connectors` (external tool bindings
//      carrying secret-keyed references; the improve loop must never
//      silently rewire what an agent can DO) and `trigger` (what fires the
//      agent at all; the improve loop only ever tunes behavior WITHIN a
//      trigger, never the trigger itself). `maxBytes` is ALWAYS caller-
//      supplied (the plan's Global Constraints put `SF_IMPROVE_PATCH_MAX_BYTES`
//      on the orchestrator, not here) — this module never reads env.
//
//   2. `makeLlmPatchProposer` — the LLM branch. MIRRORS makeLlmFailureClusterer
//      (cluster-failures.ts) / makeLlmEvalGrader (score-llm.ts) /
//      makeLlmScenarioGenerator (generate-scenarios.ts) byte-for-byte in DI
//      shape (`{ getClient }`, defaulting to getAnthropicClient) and model
//      resolution (ANTHROPIC_EVAL_MODEL || DEFAULT_EVAL_MODEL, read at CALL
//      time so a test/env set later still wins). Its fail-soft floor is
//      DELIBERATELY the plainest of the three: unlike the clusterer (which
//      can never simply drop a failure) or the scenario generator (which
//      falls back to a built-in default set), a patch proposal that can't be
//      trusted is safe to just not propose — the orchestrator's "nothing
//      changed" path is always a valid, safe outcome for improve. So ANY bad
//      path (no client, network throw, non-JSON text, wrong shape, a `patch`
//      that isn't a plain object) collapses to `null`. NEVER throws.
//
//      CHOSEN BEHAVIOR for an empty `clusters` list (documented per the
//      brief's "pick one behavior and test it"): the proposer is STILL
//      INVOKED. It is NOT short-circuited to `null` the way the clusterer
//      short-circuits an empty remainder to `[]` with no LLM call — an
//      operator's standing Brain `lessons` can motivate a worthwhile patch
//      even when this run produced zero failure clusters (e.g. a lesson
//      captured from a prior manual correction). Whatever the client
//      returns for an empty-clusters call is parsed exactly like any other
//      call; nothing here special-cases "clusters was empty" in the parse
//      path.
//
// NOTE ON THE GUARDRAIL RELATIONSHIP: `makeLlmPatchProposer` does NOT call
// `validateProposedPatch` itself. The two are independent, composable units
// per the brief's stated shape (validateProposedPatch takes `currentBlueprint`
// + `maxBytes`, which the proposer's signature doesn't carry) — the
// orchestrator (`improve-run.ts`, a later task) is expected to run
// `validateProposedPatch` on whatever the proposer returns before doing
// anything with it (a shadow replay, persistence, ...). This keeps the guardrail
// PURE and testable with zero LLM/DI surface, and keeps the proposer's own
// parse floor simple (shape-only: is this JSON `{ patch: object, rationale:
// string }`?) without duplicating the subset/connectors/trigger/size logic
// twice.
//
// NOT "use server": a plain module of a pure fn + an async factory the
// "use server" action injects (it also exports the MODEL constant + a
// factory, so it must stay a plain module per scripts/check-use-server.sh —
// same split score-llm.ts / cluster-failures.ts use). The factory performs
// I/O (the Anthropic call) but is DI-friendly: tests inject their own
// in-memory client and exercise the prompt + parse with NO network call.

import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "@/lib/ai/client";
import type { AgentBlueprint } from "@/db/schema/agents";
import type { FailureCluster } from "./cluster-failures";

// ─── validateProposedPatch (PURE guardrail) ───────────────────────────────

/** Result of validating a proposed patch. The happy path carries the patch
 *  back out typed `Partial<AgentBlueprint>` (the same reference passed in —
 *  this function never clones or mutates); the rejection path carries a
 *  short human-readable reason. */
export type PatchValidation =
  | { ok: true; patch: Partial<AgentBlueprint> }
  | { ok: false; reason: string };

/** Keys the improve loop may NEVER touch, no matter what `currentBlueprint`
 *  contains: `connectors` (external tool bindings keyed to secrets — the
 *  improve loop tunes BEHAVIOR, never rewires what an agent can DO) and
 *  `trigger` (what fires the agent at all — improve only tunes behavior
 *  WITHIN a trigger). Checked ahead of the subset rule so the rejection
 *  reason names the SPECIFIC denied key, not a generic "not a subset". */
const ALWAYS_DENIED_KEYS = new Set(["connectors", "trigger"]);

/** Is `v` a plain object — not an array, not `null`, not a primitive? The
 *  ONLY shape a patch may take. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * PURE, field-name-agnostic guardrail for a proposed blueprint patch.
 * Rejects (in this order, returning on the FIRST violation found so the
 * reason is always specific):
 *   1. a non-plain-object patch (array / null / string / number / boolean);
 *   2. any top-level key in `ALWAYS_DENIED_KEYS` (`connectors`, `trigger`),
 *      regardless of whether `currentBlueprint` has that key at all;
 *   3. any top-level key that is NOT already a key of `currentBlueprint`
 *      (the SUBSET rule — no new top-level keys, but nothing here hard-codes
 *      what those keys must be, so a future blueprint field just works);
 *   4. `JSON.stringify(patch).length > maxBytes` (caller-supplied cap; this
 *      module never reads env for a default).
 *
 * The happy path returns `{ ok: true, patch }` with `patch` passed through
 * BY REFERENCE (unchanged, uncloned) typed `Partial<AgentBlueprint>`.
 *
 * Never throws — any unexpected input (e.g. `JSON.stringify` throwing on a
 * circular structure) is itself impossible to produce from a plain object
 * built from JSON-parsed LLM output, but the key/shape checks above run
 * before stringify ever executes on anything that isn't a guaranteed-safe
 * plain object of primitives/arrays/objects.
 */
export function validateProposedPatch(args: {
  patch: unknown;
  currentBlueprint: AgentBlueprint;
  maxBytes: number;
}): PatchValidation {
  const { patch, currentBlueprint, maxBytes } = args;

  if (!isPlainObject(patch)) {
    return { ok: false, reason: "patch must be a plain object (not an array, null, or a primitive)" };
  }

  const patchKeys = Object.keys(patch);

  for (const key of patchKeys) {
    if (ALWAYS_DENIED_KEYS.has(key)) {
      return { ok: false, reason: `patch may not touch the "${key}" key — it is always denied` };
    }
  }

  const blueprintKeys = new Set(Object.keys(currentBlueprint ?? {}));
  for (const key of patchKeys) {
    if (!blueprintKeys.has(key)) {
      return {
        ok: false,
        reason: `patch introduces a top-level key "${key}" that does not exist on the current blueprint`,
      };
    }
  }

  const byteLength = JSON.stringify(patch).length;
  if (byteLength > maxBytes) {
    return {
      ok: false,
      reason: `patch is ${byteLength} bytes, exceeding the ${maxBytes}-byte cap`,
    };
  }

  return { ok: true, patch: patch as Partial<AgentBlueprint> };
}

// ─── makeLlmPatchProposer (LLM branch) ────────────────────────────────────

/**
 * Labeling clusters is small; PROPOSING a minimal patch is still a small,
 * strict JSON call — share the eval-tier knob with the rest of the improve
 * pipeline (ANTHROPIC_EVAL_MODEL) so "the eval/improve LLM" stays configured
 * in one place. Read at CALL time (mirrors score-llm.ts / cluster-failures.ts),
 * not module load, so a test/env set later still wins.
 */
export const DEFAULT_EVAL_MODEL = "claude-haiku-4-5";

/** A patch + a short rationale is small JSON — keep the budget tight so a
 *  runaway model can't turn proposing into an expensive generation. */
const PROPOSER_MAX_TOKENS = 1200;

const PROPOSER_SYSTEM = [
  "You propose a MINIMAL patch to an AI customer-service agent's configuration, to fix the failure patterns it has been exhibiting.",
  'Return ONLY a JSON object of the shape: {"patch": object, "rationale": string}.',
  "`patch` is a shallow-merge partial update to the agent's blueprint — include ONLY the fields you are actually changing, and change as FEW fields as possible. Do not restate fields you are not changing.",
  "NEVER include a `connectors` or `trigger` field in `patch` under any circumstances — those are off-limits regardless of what the failures suggest.",
  "Prefer small, targeted edits (e.g. a clarified greeting, an added FAQ entry, a tightened pricing fact) over a rewrite of the whole configuration.",
  "`rationale` is a short (1-3 sentence) plain-English explanation of why this patch should help, referencing the failure clusters and/or lessons you were given.",
  "Do not include any prose, explanation, or markdown fences outside the JSON. Output the JSON object only.",
].join("\n");

/** Strip a leading/trailing ```json … ``` (or ``` … ```) fence if the model
 *  wrapped its JSON despite the instruction not to. Mirrors score-llm.ts /
 *  cluster-failures.ts. */
function stripFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Parse the model's text into `{ patch, rationale }`, failing soft to `null`
 * on ANY bad path: non-JSON text, a non-object parsed value, a missing/non-
 * object `patch`, or a missing/non-string `rationale`. Never throws.
 *
 * Deliberately does NOT run the subset/connectors/trigger/size guardrail
 * here — `validateProposedPatch` is the separate, PURE gate the orchestrator
 * applies afterward (it needs `currentBlueprint` + `maxBytes`, neither of
 * which this shape-only parse has visibility into). This keeps the two units
 * independently testable and avoids duplicating the guardrail logic.
 */
export function parseProposerResponse(raw: string): { patch: Record<string, unknown>; rationale: string } | null {
  if (typeof raw !== "string") return null;
  const stripped = stripFences(raw);
  if (!stripped) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return null;
  }
  if (!isObject(parsed)) return null;

  const patch = parsed.patch;
  if (!isObject(patch)) return null;

  const rationale = parsed.rationale;
  if (typeof rationale !== "string" || rationale.length === 0) return null;

  return { patch, rationale };
}

/**
 * Build the LLM branch: given a blueprint + the failure clusters T6 produced
 * + standing Brain lessons, propose a minimal JSON patch + a short rationale
 * via a small, strict Anthropic call.
 *
 * Fail-soft floor (deliberately the plainest of the improve-pipeline LLM
 * branches — a patch proposal that can't be trusted is safe to simply not
 * propose): no client configured, a network/parse error, or any other
 * thrown error all collapse to `null`. NEVER throws.
 *
 * `getClient` is the DI seam — defaults to `getAnthropicClient` (the
 * platform Anthropic client, or `null` when `ANTHROPIC_API_KEY` is unset).
 * Tests inject a fake client returning canned JSON to exercise the prompt +
 * parse with no network call.
 *
 * CHOSEN BEHAVIOR for an empty `clusters` array: the proposer is STILL
 * INVOKED (not short-circuited) — see the module-header note. A caller
 * wanting to skip proposing entirely on zero clusters should check that
 * BEFORE calling this factory's returned function.
 */
export function makeLlmPatchProposer(
  deps: { getClient?: () => Anthropic | null } = {},
): (args: {
  blueprint: AgentBlueprint;
  clusters: FailureCluster[];
  lessons: string[];
}) => Promise<{ patch: Partial<AgentBlueprint>; rationale: string } | null> {
  return async ({ blueprint, clusters, lessons }) => {
    try {
      const getClient = deps.getClient ?? getAnthropicClient;
      const client = getClient();
      if (!client) return null;

      const model = process.env.ANTHROPIC_EVAL_MODEL?.trim() || DEFAULT_EVAL_MODEL;

      const userContent = [
        `Current blueprint: ${JSON.stringify(blueprint ?? {})}`,
        `Failure clusters: ${JSON.stringify(Array.isArray(clusters) ? clusters : [])}`,
        `Standing Brain lessons: ${JSON.stringify(Array.isArray(lessons) ? lessons : [])}`,
      ].join("\n");

      const resp = await client.messages.create({
        model,
        max_tokens: PROPOSER_MAX_TOKENS,
        system: PROPOSER_SYSTEM,
        messages: [{ role: "user", content: userContent }],
      });

      const out = resp.content
        .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      const result = parseProposerResponse(out);
      if (!result) return null;

      return { patch: result.patch as Partial<AgentBlueprint>, rationale: result.rationale };
    } catch {
      // Fail SOFT: any LLM/network/DI/parse error -> null. Unlike the
      // clusterer, a patch proposal that can't be trusted is safe to simply
      // not propose.
      return null;
    }
  };
}
