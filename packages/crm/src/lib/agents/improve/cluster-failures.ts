// Improve verb + trust rail (2026-07-02) — Task 6: failure clustering.
//
// This is the THIRD stage of the improve pipeline (see the design doc:
// docs/superpowers/specs/2026-07-02-improve-verb-trust-rail-design.md,
// "3. cluster-failures.ts"): group a baseline/candidate eval replay's FAILED
// scenarios into failure modes a human can act on.
//
// Two stages, in order:
//
//   1. `bucketByValidator` — PURE, FREE (no LLM call). Two of the 6
//      validators in ALL_VALIDATORS (validators.ts:371) map DETERMINISTICALLY
//      to a failure mode because their name already tells us exactly what
//      went wrong — no need to ask an LLM to reverse-engineer that from a
//      failedChecks list:
//        - "quotes_only_from_soul_pricing" -> mode "pricing"
//        - "no_hallucinated_state_change"  -> mode "hallucinated_state"
//      Checked in that order (pricing first) per the design's listed order,
//      so a scenario failing BOTH lands in "pricing". Everything else — no
//      matching validator name (no_pii_leak / no_avoid_words /
//      response_length_under_cap / no_prompt_injection_echo / an
//      unrecognized/stale name), or an empty failedChecks array — falls
//      through untouched to `remainder`, for the LLM stage below to label.
//   2. `makeLlmFailureClusterer` — the LLM branch, labeling ONLY the
//      remainder into the 7-mode `FAILURE_MODES` taxonomy (the spec's
//      research addendum explicitly confirmed this taxonomy unchanged: "our
//      7 symptom/domain modes stay" — more patch-actionable for SMB agents
//      than finer-grained academic taxonomies at this scale). Mirrors
//      makeLlmEvalGrader (score-llm.ts) / makeLlmConvoScenarioConverter
//      (convo-to-scenario.ts) byte-for-byte in DI shape (`{ getClient }`,
//      defaults to getAnthropicClient) and model resolution
//      (ANTHROPIC_EVAL_MODEL || DEFAULT_EVAL_MODEL, read at call time — not
//      module load, so a test/env set later still wins).
//
// Fail-soft posture (DELIBERATELY different from the grader/converter's
// "return null/empty on any bad path"): a failure the human needs to see can
// never simply vanish. So `makeLlmFailureClusterer`'s floor on ANY bad
// path — no client, network throw, non-JSON response, non-array JSON, an
// out-of-taxonomy label surviving to output — is not "drop it" but "keep
// it, labeled 'other'": a parse failure (or any other error) collapses to
// ONE "other" cluster containing the WHOLE remainder (never lost, never
// silently downgraded to zero clusters); an out-of-taxonomy label the model
// invents anyway is coerced to "other" per scenario (merged with any other
// "other"-coerced scenarios into a single cluster, not one-per-invented-
// label). An empty remainder short-circuits to `[]` with NO LLM call — an
// agent with nothing left to label never pays for an empty cluster request.
//
// Evidence posture (binding, per the plan's Global Constraints — "no raw
// customer transcripts persisted... cluster evidence sentences <= 200 chars
// each"): every `evidence` string on every cluster, from EITHER stage, is
// truncated to at most 200 characters via `truncateEvidence`.

import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "@/lib/ai/client";

// ─── the 7-mode taxonomy ──────────────────────────────────────────────────

/**
 * Seed taxonomy, LOCKED by the spec's research addendum (2026-07-03): "our 7
 * symptom/domain modes stay (more patch-actionable for SMB agents than
 * MAST's 14 system modes or AgentErrorTaxonomy's 5 module modes — both noted
 * as v2 candidates once volume justifies finer granularity)". Kept as a
 * `const` array (not a hand-written union) so a future taxonomy change is a
 * one-line edit here, per the plan's binding note.
 */
export const FAILURE_MODES = [
  "booking_flow",
  "hallucinated_state",
  "pricing",
  "missing_knowledge",
  "tone",
  "tool_misuse",
  "other",
] as const;

export type FailureMode = (typeof FAILURE_MODES)[number];

/** One group of failed scenarios sharing a failure mode. `evidence` entries
 *  are derived text only (per the plan's no-raw-transcripts rule) and each
 *  truncated to <= 200 chars. */
export type FailureCluster = {
  mode: FailureMode;
  count: number;
  exampleScenarioIds: string[];
  evidence: string[];
};

const EVIDENCE_MAX_CHARS = 200;

/** Truncate one evidence string to the binding 200-char cap. Pure; never
 *  throws; a non-string input becomes an empty string defensively (callers
 *  only ever pass derived text, but this keeps the helper safe if that ever
 *  slips). */
function truncateEvidence(text: string): string {
  if (typeof text !== "string") return "";
  return text.length > EVIDENCE_MAX_CHARS ? text.slice(0, EVIDENCE_MAX_CHARS) : text;
}

function isFailureMode(value: unknown): value is FailureMode {
  return typeof value === "string" && (FAILURE_MODES as readonly string[]).includes(value);
}

// ─── bucketByValidator (PURE, deterministic first pass) ───────────────────

/** The fixed validator-name -> mode map, checked in THIS order (pricing
 *  before hallucinated_state) so a scenario failing both known checks lands
 *  in "pricing" — matching the design doc's listed order exactly. */
const VALIDATOR_MODE_RULES: Array<{ validatorName: string; mode: FailureMode }> = [
  { validatorName: "quotes_only_from_soul_pricing", mode: "pricing" },
  { validatorName: "no_hallucinated_state_change", mode: "hallucinated_state" },
];

/** Find the first mapped mode among a scenario's failedChecks, per the fixed
 *  rule order above. `undefined` when none of its failedChecks match a
 *  mapped validator name (including an empty/missing array) — the
 *  scenario belongs in `remainder`. Pure; never throws. */
function firstMappedMode(failedChecks: string[]): FailureMode | undefined {
  for (const rule of VALIDATOR_MODE_RULES) {
    if (failedChecks.includes(rule.validatorName)) return rule.mode;
  }
  return undefined;
}

/**
 * PURE first pass over a baseline/candidate replay's FAILED scenarios.
 * Scenarios whose failedChecks name one of the two deterministically-mapped
 * validators (see VALIDATOR_MODE_RULES above) are grouped into ONE
 * `FailureCluster` per mode present (aggregated: count = number of
 * scenarios, exampleScenarioIds in input order, evidence = one truncated
 * sentence per scenario naming the matched validator). Every other scenario
 * (unmapped validator name, an unrecognized/stale name, or an empty
 * failedChecks array) is passed through untouched as its scenarioId in
 * `remainder`, for `makeLlmFailureClusterer` to label. Never mutates the
 * input; never throws.
 */
export function bucketByValidator(
  failed: Array<{ scenarioId: string; failedChecks: string[] }>,
): { bucketed: FailureCluster[]; remainder: string[] } {
  const byMode = new Map<FailureMode, { scenarioIds: string[]; evidence: string[] }>();
  const remainder: string[] = [];

  for (const scenario of failed) {
    const checks = Array.isArray(scenario?.failedChecks) ? scenario.failedChecks : [];
    const mode = firstMappedMode(checks);

    if (!mode) {
      remainder.push(scenario.scenarioId);
      continue;
    }

    const matchedValidator = VALIDATOR_MODE_RULES.find((r) => r.mode === mode)!.validatorName;
    const entry = byMode.get(mode) ?? { scenarioIds: [], evidence: [] };
    entry.scenarioIds.push(scenario.scenarioId);
    entry.evidence.push(
      truncateEvidence(`Scenario ${scenario.scenarioId} failed "${matchedValidator}".`),
    );
    byMode.set(mode, entry);
  }

  // Preserve VALIDATOR_MODE_RULES order in the output (pricing before
  // hallucinated_state) so callers see a stable, deterministic cluster order.
  const bucketed: FailureCluster[] = [];
  for (const rule of VALIDATOR_MODE_RULES) {
    const entry = byMode.get(rule.mode);
    if (!entry) continue;
    bucketed.push({
      mode: rule.mode,
      count: entry.scenarioIds.length,
      exampleScenarioIds: entry.scenarioIds,
      evidence: entry.evidence,
    });
  }

  return { bucketed, remainder };
}

// ─── makeLlmFailureClusterer (LLM branch, labels the remainder) ───────────

/**
 * Labeling a handful of failed scenarios into a 7-way taxonomy is a small,
 * strict JSON call — share the eval-tier knob with the rest of the eval
 * harness (ANTHROPIC_EVAL_MODEL) so "the eval LLM" stays configured in one
 * place. Read at CALL time (mirrors score-llm.ts / convo-to-scenario.ts),
 * not module load, so a test/env set later still wins.
 */
export const DEFAULT_EVAL_MODEL = "claude-haiku-4-5";

/** A cluster list is small JSON — keep the budget tight so a runaway model
 *  can't turn labeling into an expensive generation. */
const CLUSTERER_MAX_TOKENS = 1000;

const CLUSTERER_SYSTEM = [
  "You group a list of FAILED test scenarios for an automated customer-service agent into failure-mode clusters.",
  `Every cluster's "mode" MUST be exactly one of this fixed list: ${FAILURE_MODES.join(", ")}. Never invent a new mode name — if none of the listed modes fit, use "other".`,
  'Return ONLY a JSON array of objects of the shape: {"mode": string, "scenarioIds": string[], "evidence": string[]}.',
  "Group scenarios that failed for the SAME underlying reason into the SAME cluster — do not create a separate cluster per scenario unless they truly differ.",
  "`scenarioIds` MUST be drawn only from the scenario ids you were given — never invent an id.",
  "`evidence` is a short list of one-sentence, concrete observations (derived from the scenario titles/failed checks you were given) explaining why scenarios in this cluster failed. Keep each sentence short — do not write paragraphs.",
  "Do not include any prose, explanation, or markdown fences outside the JSON. Output the JSON array only.",
].join("\n");

/** Strip a leading/trailing ```json … ``` (or ``` … ```) fence if the model
 *  wrapped its JSON despite the instruction not to. Mirrors score-llm.ts /
 *  convo-to-scenario.ts. */
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

/** One remainder item the clusterer is asked to label. */
type RemainderItem = { scenarioId: string; title: string; failedChecks: string[] };

/**
 * Build the single fail-soft floor: ONE "other" cluster containing every
 * scenarioId from the given remainder, in input order, with a short
 * truncated evidence sentence per scenario naming its failed checks. Used
 * on every bad path (parse failure, non-array JSON, client throw, no
 * client) — a failure the human needs to see is never simply dropped, only
 * ever mislabeled as "other". Pure; never throws.
 */
function fallbackOtherCluster(remainder: RemainderItem[]): FailureCluster[] {
  if (remainder.length === 0) return [];
  return [
    {
      mode: "other",
      count: remainder.length,
      exampleScenarioIds: remainder.map((r) => r.scenarioId),
      evidence: remainder.map((r) =>
        truncateEvidence(
          `Scenario ${r.scenarioId} failed: ${(Array.isArray(r.failedChecks) ? r.failedChecks : []).join(", ") || "unspecified check"}.`,
        ),
      ),
    },
  ];
}

/**
 * Parse the model's text into `FailureCluster[]`, coercing any out-of-
 * taxonomy "mode" to "other" (merging every "other"-coerced scenario into
 * ONE cluster, not one per invented label) and dropping any `scenarioId` the
 * model references that isn't in `knownIds` (a hallucinated id). Returns
 * `null` on ANY bad path (non-JSON, non-array parsed value) so the caller
 * falls back to `fallbackOtherCluster`. Never throws.
 */
export function parseClustererResponse(
  raw: string,
  knownIds: Set<string>,
): FailureCluster[] | null {
  if (typeof raw !== "string") return null;
  const stripped = stripFences(raw);
  if (!stripped) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  // Aggregate by FINAL mode (post out-of-taxonomy coercion) so multiple
  // invented labels merge into one "other" cluster rather than producing
  // one cluster per invented label.
  const byMode = new Map<FailureMode, { scenarioIds: string[]; evidence: string[] }>();

  for (const item of parsed) {
    if (!isObject(item)) continue;
    const mode: FailureMode = isFailureMode(item.mode) ? item.mode : "other";

    const rawIds = Array.isArray(item.scenarioIds) ? item.scenarioIds : [];
    const scenarioIds = rawIds.filter(
      (id): id is string => typeof id === "string" && knownIds.has(id),
    );
    if (scenarioIds.length === 0) continue;

    const rawEvidence = Array.isArray(item.evidence) ? item.evidence : [];
    const evidence = rawEvidence
      .filter((e): e is string => typeof e === "string" && e.length > 0)
      .map(truncateEvidence);

    const entry = byMode.get(mode) ?? { scenarioIds: [], evidence: [] };
    entry.scenarioIds.push(...scenarioIds);
    entry.evidence.push(...evidence);
    byMode.set(mode, entry);
  }

  const clusters: FailureCluster[] = [];
  for (const mode of FAILURE_MODES) {
    const entry = byMode.get(mode);
    if (!entry) continue;
    clusters.push({
      mode,
      count: entry.scenarioIds.length,
      exampleScenarioIds: entry.scenarioIds,
      evidence: entry.evidence,
    });
  }

  return clusters;
}

/**
 * Build the LLM branch: given the REMAINDER of failed scenarios
 * `bucketByValidator` couldn't map deterministically, label each into the
 * 7-mode `FAILURE_MODES` taxonomy via a small, strict Anthropic call.
 *
 * Fail-soft floor (deliberately NOT "return []/null" like the grader/
 * converter — a failure a human needs to see must never vanish): no client
 * configured, a network/parse error, a non-array response, or any other
 * thrown error all collapse to ONE "other" cluster wrapping the WHOLE
 * remainder via `fallbackOtherCluster`. NEVER throws.
 *
 * `getClient` is the DI seam — defaults to `getAnthropicClient` (the
 * platform Anthropic client, or `null` when `ANTHROPIC_API_KEY` is unset).
 * Tests inject a fake client returning canned JSON to exercise the prompt +
 * parse with no network call.
 *
 * An EMPTY remainder short-circuits to `[]` with NO LLM call — nothing left
 * to label means nothing to pay for.
 */
export function makeLlmFailureClusterer(
  deps: { getClient?: () => Anthropic | null } = {},
): (args: { failed: RemainderItem[] }) => Promise<FailureCluster[]> {
  return async ({ failed }): Promise<FailureCluster[]> => {
    const remainder = Array.isArray(failed) ? failed : [];
    if (remainder.length === 0) return [];

    const knownIds = new Set(remainder.map((r) => r.scenarioId));

    try {
      const getClient = deps.getClient ?? getAnthropicClient;
      const client = getClient();
      if (!client) return fallbackOtherCluster(remainder);

      const model = process.env.ANTHROPIC_EVAL_MODEL?.trim() || DEFAULT_EVAL_MODEL;

      const userContent = [
        "Scenarios to cluster:",
        JSON.stringify(
          remainder.map((r) => ({
            scenarioId: r.scenarioId,
            title: r.title,
            failedChecks: r.failedChecks,
          })),
        ),
      ].join("\n");

      const resp = await client.messages.create({
        model,
        max_tokens: CLUSTERER_MAX_TOKENS,
        system: CLUSTERER_SYSTEM,
        messages: [{ role: "user", content: userContent }],
      });

      const out = resp.content
        .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      const clusters = parseClustererResponse(out, knownIds);
      return clusters ?? fallbackOtherCluster(remainder);
    } catch {
      // Fail SOFT: any LLM/network/DI/parse error -> the whole remainder as
      // ONE "other" cluster. A failure the human needs to see is never
      // simply dropped.
      return fallbackOtherCluster(remainder);
    }
  };
}
