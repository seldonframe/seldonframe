// Improve verb + trust rail (2026-07-02) — Task 4: real-conversation sourcing
// + stratified sampling.
//
// This is the FIRST stage of the improve pipeline (see the design doc:
// docs/superpowers/specs/2026-07-02-improve-verb-trust-rail-design.md,
// "1. source-conversations.ts"): pull the agent's own recent REAL
// conversations (never another org's, never a template's pooled traffic —
// "Explicitly NOT in v1: cross-deployment convo pooling") and decide which
// ones become eval scenarios downstream (convo-to-scenario.ts, not this
// file).
//
// ─── THE SAMPLING PRIORITY (binding — Research addendum) ──────────────────
//
// docs/superpowers/specs/2026-07-02-improve-verb-trust-rail-design.md's
// "Research addendum" section amends the brief's stratification to THREE
// tiers, in this exact order:
//
//   1. Conversations containing a failed CRITICAL validator turn — newest
//      first. Signal-driven sampling always beats random (LangSmith/Langfuse
//      guidance the addendum cites) and a critical validator failure (price
//      hallucination, PII leak, prompt-injection echo, claimed-but-didn't-
//      happen state change — see validators.ts) is the strongest possible
//      "this conversation went wrong" signal available.
//   2. Conversations with a negative `operatorQuality` mark — newest first,
//      EXCLUDING any conversation already selected in tier 1 (so a
//      conversation that is BOTH validator-failed AND operator-flagged-bad
//      counts once, not twice, and doesn't crowd out other negative-quality
//      conversations). `agentConversations.operatorQuality` is `text`
//      (schema comment: "Operator-marked quality after review: 'good' |
//      'bad' | null") — the only value with unambiguous negative semantics
//      today is the literal `'bad'`. We treat exactly that as negative; there
//      is no thumbs-down/numeric-score column in this schema to widen the
//      net to (documented here per the addendum's "document what you find"
//      instruction — if a future migration adds richer quality signals, this
//      is the one place to widen the check).
//   3. Round-robin across outcome buckets (booked / message / abandoned /
//      other) over the REMAINING candidates, to fill to `sampleSize`. This
//      is the brief's original stratification, demoted to the tie-breaker
//      tier once the two signal-driven tiers are exhausted.
//
// `planConversationSample` is PURE — it takes lightweight candidate summaries
// (not full transcripts) and returns the winning ids. "Newest first" within a
// tier is expressed via INPUT ARRAY ORDER: the function does no date parsing
// or comparison of its own (consistent with eval-runs-store.ts's precedent of
// pure functions carrying caller-supplied values through verbatim rather than
// re-deriving them) — `loadRealConversationsForAgent` is responsible for
// handing it candidates already ordered newest-first via its own
// `ORDER BY lastTurnAt DESC` query, exactly like the existing
// `tail_conversations` op.
//
// ─── PII posture ───────────────────────────────────────────────────────────
//
// `ConversationSample.turns` carries ONLY `{ role: 'user'|'assistant',
// content }` — no `toolCalls`/`toolResults` payloads ride along (a booking
// tool call can carry a customer's name/phone/address as tool `input`). Tool
// activity is read internally (to derive `outcome` and to run the validator
// cross-reference) but never copied into the persisted-shape output, mirroring
// eval-runs-store.ts's "no raw transcript" persistence boundary one stage
// upstream of where transcripts get consumed by an LLM at all.
//
// ─── DI / testability ──────────────────────────────────────────────────────
//
// Mirrors run-deployed-agent-evals.ts's split: `loadRealConversationsForAgent`
// is a PLAIN function (no "use server") whose actual Drizzle queries are
// behind an injectable `deps` parameter; `defaultSourceConversationsDeps()`
// lazily imports `@/db` + `@/db/schema` + `drizzle-orm` ONLY when called, so
// unit tests inject fakes and never open a Postgres connection. The two
// tricky, worth-unit-testing-in-isolation pieces of logic —
// `deriveConversationOutcome` and `criticalFailedValidatorNames` — are
// extracted as their own pure exports for exactly that reason.

import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type {
  AgentToolCall,
  AgentToolResult,
  AgentValidatorResult,
} from "@/db/schema/agents";
import { ALL_VALIDATORS } from "@/lib/agents/validators";

// ─── types ──────────────────────────────────────────────────────────────

export type ConversationOutcome = "booked" | "message" | "abandoned" | "other";

export type ConversationSample = {
  conversationId: string;
  outcome: ConversationOutcome;
  hadCriticalValidatorFailure: boolean;
  failedValidatorNames: string[];
  turns: Array<{ role: "user" | "assistant"; content: string }>;
};

/** The lightweight candidate summary `planConversationSample` decides over.
 *  NOT full transcripts — just enough to stratify. Per the research
 *  addendum, candidates carry `hasNegativeOperatorQuality` alongside the
 *  brief's original two fields. */
export type ConversationSampleCandidate = Pick<
  ConversationSample,
  "conversationId" | "outcome" | "hadCriticalValidatorFailure"
> & {
  hasNegativeOperatorQuality: boolean;
};

const OUTCOME_BUCKETS: ConversationOutcome[] = [
  "booked",
  "message",
  "abandoned",
  "other",
];

// ─── planConversationSample (PURE) ──────────────────────────────────────

/**
 * PURE. Decide which candidate conversation ids make the sample, per the
 * 3-tier priority documented at the top of this file. `sampleSize` is a hard
 * cap on the output length; a shorter candidate list than `sampleSize`
 * returns ALL candidate ids (never throws, never pads). `sampleSize <= 0`
 * returns `[]`. Every id is returned at most once, even if a candidate would
 * qualify for multiple tiers.
 */
export function planConversationSample(args: {
  candidates: ConversationSampleCandidate[];
  sampleSize: number;
}): string[] {
  const { candidates, sampleSize } = args;
  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  if (!Number.isFinite(sampleSize) || sampleSize <= 0) return [];

  const selected: string[] = [];
  const selectedIds = new Set<string>();

  const take = (id: string) => {
    if (selectedIds.has(id)) return;
    selectedIds.add(id);
    selected.push(id);
  };

  // Tier 1: validator-failed, newest-first (input array order).
  for (const c of candidates) {
    if (selected.length >= sampleSize) break;
    if (c.hadCriticalValidatorFailure) take(c.conversationId);
  }

  // Tier 2: negative operatorQuality, newest-first, skipping anything tier 1
  // already claimed.
  if (selected.length < sampleSize) {
    for (const c of candidates) {
      if (selected.length >= sampleSize) break;
      if (c.hasNegativeOperatorQuality && !selectedIds.has(c.conversationId)) {
        take(c.conversationId);
      }
    }
  }

  // Tier 3: round-robin across outcome buckets over whatever remains.
  if (selected.length < sampleSize) {
    const remainingByBucket = new Map<ConversationOutcome, string[]>(
      OUTCOME_BUCKETS.map((bucket) => [bucket, []]),
    );
    for (const c of candidates) {
      if (selectedIds.has(c.conversationId)) continue;
      remainingByBucket.get(c.outcome)?.push(c.conversationId);
    }
    // Each bucket's array is already newest-first (input array order
    // preserved by the push loop above). Round-robin: repeatedly walk the
    // buckets in priority order, taking one id from each non-empty bucket,
    // until either every bucket is empty or sampleSize is reached.
    let madeProgress = true;
    while (selected.length < sampleSize && madeProgress) {
      madeProgress = false;
      for (const bucket of OUTCOME_BUCKETS) {
        if (selected.length >= sampleSize) break;
        const ids = remainingByBucket.get(bucket);
        if (!ids || ids.length === 0) continue;
        const nextId = ids.shift();
        if (nextId !== undefined) {
          take(nextId);
          madeProgress = true;
        }
      }
    }
  }

  return selected;
}

// ─── deriveConversationOutcome (PURE) ───────────────────────────────────

/**
 * PURE. Derive the outcome tag for one conversation from its aggregated tool
 * activity + turn count:
 *   - any `book_appointment` tool call that has a matching `toolResults`
 *     entry with `ok: true` -> "booked" (checked first — booking is the
 *     strongest positive signal, so it wins even if `take_message` ALSO
 *     succeeded in the same conversation, e.g. a message taken before a
 *     later booking closed the loop).
 *   - else any successful `take_message` tool call -> "message".
 *   - else `turnCount <= 2` -> "abandoned" (the customer left before the
 *     agent could do anything meaningful).
 *   - else -> "other".
 * A tool call with no matching `toolResults` entry (or a `false`/`error`
 * result) is NOT successful — never counts toward "booked"/"message".
 */
export function deriveConversationOutcome(args: {
  turnCount: number;
  toolCalls: AgentToolCall[];
  toolResults: AgentToolResult[];
}): ConversationOutcome {
  const { turnCount, toolCalls, toolResults } = args;

  const succeeded = (toolName: string): boolean =>
    toolCalls.some((call) => {
      if (call.name !== toolName) return false;
      const result = toolResults.find((r) => r.toolCallId === call.id);
      return result?.ok === true;
    });

  if (succeeded("book_appointment")) return "booked";
  if (succeeded("take_message")) return "message";
  if (turnCount <= 2) return "abandoned";
  return "other";
}

// ─── criticalFailedValidatorNames (PURE) ────────────────────────────────

/** The set of validator names whose `severity` is `"critical"`, sourced from
 *  the single existing registry (validators.ts) rather than a second,
 *  hand-maintained list — if a validator's severity ever changes, this stays
 *  correct with zero edits here. */
const CRITICAL_VALIDATOR_NAMES = new Set(
  ALL_VALIDATORS.filter((v) => v.severity === "critical").map((v) => v.name),
);

/**
 * PURE. Given every turn's `validatorsPassed` array (in any turn order),
 * return the distinct names of validators that (a) FAILED (`passed: false`)
 * on at least one turn AND (b) are registered as `severity: "critical"` in
 * `ALL_VALIDATORS`. Warning-severity failures are excluded — only a critical
 * failure should ever route a conversation into sampling tier 1. An unknown
 * validator name (not present in `ALL_VALIDATORS` — e.g. a stale name from a
 * retired validator) is silently ignored rather than throwing. Never throws;
 * empty/missing input returns `[]`.
 */
export function criticalFailedValidatorNames(
  turnsValidatorsPassed: AgentValidatorResult[][],
): string[] {
  if (!Array.isArray(turnsValidatorsPassed)) return [];
  const found = new Set<string>();
  for (const turnResults of turnsValidatorsPassed) {
    if (!Array.isArray(turnResults)) continue;
    for (const result of turnResults) {
      if (!result || result.passed !== false) continue;
      if (CRITICAL_VALIDATOR_NAMES.has(result.name)) {
        found.add(result.name);
      }
    }
  }
  return Array.from(found);
}

// ─── loadRealConversationsForAgent (DI, real I/O) ───────────────────────

/** One raw conversation row + its ordered turns, exactly the shape the db
 *  loader needs to build a `ConversationSampleCandidate` + (for selected
 *  ids) a full `ConversationSample`. */
type RawConversationWithTurns = {
  conversationId: string;
  turnCount: number;
  turns: Array<{
    role: string;
    content: string | null;
    toolCalls: AgentToolCall[] | null;
    toolResults: AgentToolResult[] | null;
    validatorsPassed: AgentValidatorResult[];
  }>;
};

export type SourceConversationsDeps = {
  /**
   * Newest-first (by `lastTurnAt DESC`) REAL conversations for one agent,
   * already excluding: `status = 'test'`, `channelMeta->>'eval_run' =
   * 'true'`, and any conversation carrying a `channelMeta->>'replay_of'`
   * (a replay-created throwaway) — copied VERBATIM from the
   * `tail_conversations` op (src/app/api/v1/agents/route.ts) plus the
   * brief's additional replay/test exclusions. Each row's `turns` array is
   * ordered oldest-first (by `turnIndex`) — the natural conversation reading
   * order — with `operatorQuality` folded onto the row for tier-2 sampling.
   */
  listConversationsWithTurns: (args: {
    agentId: string;
    orgId: string;
    limit: number;
  }) => Promise<Array<RawConversationWithTurns & { operatorQuality: string | null }>>;
};

/**
 * Default `SourceConversationsDeps`: lazily imports `@/db` + `@/db/schema` +
 * `drizzle-orm` ONLY when called, so unit tests injecting fakes for
 * `listConversationsWithTurns` never open a Postgres connection (mirrors
 * `defaultDeployedEvalDeps` in run-deployed-agent-evals.ts).
 */
export async function defaultSourceConversationsDeps(): Promise<SourceConversationsDeps> {
  const [{ db }, schema] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
  ]);
  const { agentConversations, agentTurns } = schema;

  return {
    listConversationsWithTurns: async ({ agentId, orgId, limit }) => {
      // The `channelMeta->>'eval_run'` exclusion is copied VERBATIM (same
      // jsonb predicate text) from the tail_conversations op
      // (src/app/api/v1/agents/route.ts:437) — that op only applies it
      // conditionally (toggled by the caller's `include_eval_runs`); this
      // loader ALWAYS wants real conversations, so it's unconditional here.
      // `status != 'test'` (via `ne()`, Drizzle's idiomatic inequality
      // operator — no literal `!= 'test'` SQL string exists elsewhere in the
      // codebase to copy verbatim) and `channelMeta->>'replay_of' IS NULL`
      // are the two additional exclusions this task's brief calls for, so
      // that a replay-created throwaway conversation (see the
      // `replay_conversation` op, same route.ts file, which stamps
      // `channelMeta: { replay_of: <original id>, replay_run: true }` on a
      // `status: "test"` row) can never be double-excluded-yet-still-counted
      // nor sourced as if it were a real customer conversation.
      const conds = [
        eq(agentConversations.agentId, agentId),
        eq(agentConversations.orgId, orgId),
        ne(agentConversations.status, "test"),
        sql`(${agentConversations.channelMeta} ->> 'eval_run') IS DISTINCT FROM 'true'`,
        sql`(${agentConversations.channelMeta} ->> 'replay_of') IS NULL`,
      ];

      const rows = await db
        .select({
          id: agentConversations.id,
          turnCount: agentConversations.turnCount,
          operatorQuality: agentConversations.operatorQuality,
        })
        .from(agentConversations)
        .where(and(...conds))
        .orderBy(desc(agentConversations.lastTurnAt))
        .limit(limit);

      if (rows.length === 0) return [];

      const ids = rows.map((r) => r.id);
      const turnRows = await db
        .select({
          conversationId: agentTurns.conversationId,
          role: agentTurns.role,
          content: agentTurns.content,
          toolCalls: agentTurns.toolCalls,
          toolResults: agentTurns.toolResults,
          validatorsPassed: agentTurns.validatorsPassed,
          turnIndex: agentTurns.turnIndex,
        })
        .from(agentTurns)
        .where(inArray(agentTurns.conversationId, ids))
        .orderBy(agentTurns.turnIndex);

      const turnsByConversation = new Map<string, typeof turnRows>();
      for (const t of turnRows) {
        const list = turnsByConversation.get(t.conversationId) ?? [];
        list.push(t);
        turnsByConversation.set(t.conversationId, list);
      }

      return rows.map((row) => ({
        conversationId: row.id,
        turnCount: row.turnCount,
        operatorQuality: row.operatorQuality,
        turns: (turnsByConversation.get(row.id) ?? []).map((t) => ({
          role: t.role,
          content: t.content,
          toolCalls: t.toolCalls,
          toolResults: t.toolResults,
          validatorsPassed: t.validatorsPassed,
        })),
      }));
    },
  };
}

const DEFAULT_SAMPLE_SIZE = 50;

/** Read `SF_IMPROVE_SAMPLE_SIZE` at call time (matches the repo's
 *  `process.env.X?.trim() || DEFAULT` convention — e.g. score-llm.ts's
 *  `ANTHROPIC_EVAL_MODEL` resolution). Falls back to `DEFAULT_SAMPLE_SIZE`
 *  when unset, blank, or not a positive integer. */
function resolveDefaultSampleSize(): number {
  const raw = process.env.SF_IMPROVE_SAMPLE_SIZE?.trim();
  if (!raw) return DEFAULT_SAMPLE_SIZE;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SAMPLE_SIZE;
  return Math.floor(parsed);
}

/** "bad" is the only value in this schema with unambiguous negative
 *  semantics — see the file-header note. */
function isNegativeOperatorQuality(operatorQuality: string | null): boolean {
  return operatorQuality === "bad";
}

/**
 * Load, stratify, and shape one agent's real conversations into
 * `ConversationSample[]`, org-scoped. Never throws: an empty/failed
 * underlying read yields `[]` rather than propagating (an improve run must
 * be able to proceed — with zero real-conversation scenarios, falling back
 * to generated ones — rather than fail outright because conversation
 * sourcing hiccuped; matches the design doc's "every stage fail-soft with a
 * reason" orchestrator contract one level up).
 *
 * `args.limit` is the candidate pool size handed to the db query (how many
 * newest real conversations to consider) — NOT the final sample size, which
 * is `resolveDefaultSampleSize()` (env `SF_IMPROVE_SAMPLE_SIZE`, default 50)
 * applied via `planConversationSample`. Passing a `limit` smaller than the
 * resolved sample size simply means the candidate pool IS the sample
 * (short-supply case).
 */
export async function loadRealConversationsForAgent(
  args: { agentId: string; orgId: string; limit: number },
  deps?: SourceConversationsDeps,
): Promise<ConversationSample[]> {
  try {
    const resolvedDeps = deps ?? (await defaultSourceConversationsDeps());
    const rows = await resolvedDeps.listConversationsWithTurns(args);
    if (rows.length === 0) return [];

    const bySample = new Map<string, ConversationSample>();
    const candidates: ConversationSampleCandidate[] = [];

    for (const row of rows) {
      const toolCalls = row.turns.flatMap((t) => t.toolCalls ?? []);
      const toolResults = row.turns.flatMap((t) => t.toolResults ?? []);
      const outcome = deriveConversationOutcome({
        turnCount: row.turnCount,
        toolCalls,
        toolResults,
      });
      const failedValidatorNames = criticalFailedValidatorNames(
        row.turns.map((t) => t.validatorsPassed ?? []),
      );
      const hadCriticalValidatorFailure = failedValidatorNames.length > 0;

      candidates.push({
        conversationId: row.conversationId,
        outcome,
        hadCriticalValidatorFailure,
        hasNegativeOperatorQuality: isNegativeOperatorQuality(row.operatorQuality),
      });

      bySample.set(row.conversationId, {
        conversationId: row.conversationId,
        outcome,
        hadCriticalValidatorFailure,
        failedValidatorNames,
        // PII posture: role + content ONLY — no toolCalls/toolResults. Also
        // drop any turn whose role isn't user/assistant (tool/system turns
        // aren't part of the customer-facing transcript an LLM should read
        // to write a scenario) and any turn with no text content.
        turns: row.turns
          .filter(
            (t): t is typeof t & { role: "user" | "assistant"; content: string } =>
              (t.role === "user" || t.role === "assistant") &&
              typeof t.content === "string" &&
              t.content.length > 0,
          )
          .map((t) => ({ role: t.role, content: t.content })),
      });
    }

    const selectedIds = planConversationSample({
      candidates,
      sampleSize: resolveDefaultSampleSize(),
    });

    return selectedIds
      .map((id) => bySample.get(id))
      .filter((s): s is ConversationSample => s !== undefined);
  } catch (error) {
    console.warn("[improve/source-conversations] load_real_conversations_failed", {
      agentId: args.agentId,
      orgId: args.orgId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
