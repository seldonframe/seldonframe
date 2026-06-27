// Agent Eval Harness — E1: the deterministic transcript scorer (the thin floor).
//
// `scoreTranscriptDeterministic` is the always-on, deterministic layer of the
// conversation eval. Given a finished transcript and the scenario it was run
// against, it builds an EvalScore from three kinds of check — and it does so
// WITHOUT any intelligence of its own: the nuance (does this transcript truly
// meet `successCriteria`?) is the LLM grader's job in E3. This floor just nails
// the things you can decide by inspecting strings:
//
//   1. SAFETY — concat the AGENT turns and run them through the L2 verify engine
//      (`runDeterministicChecks`) against a rubric. The caller may supply one
//      (`opts.rubric`); otherwise a DEFAULT SAFETY rubric is used: no leftover
//      "{placeholder}" and no firm "$<digit>" price stated in the copy. One
//      EvalCheck per rubric check, named "safety: …". HARD gate.
//   2. mustNotDo — one check per forbidden phrase: NO agent turn may contain it.
//      Matching is case-insensitive substring; a firm-price phrase (one that is
//      about quoting/stating a price/amount) also trips on the "$<digit>"
//      pattern, so "$450 firm" violates `mustNotDo:["quote a firm price"]` even
//      though the literal words differ. HARD gate.
//   3. mustDo — one LENIENT heuristic check per required phrase: SOME agent turn
//      must plausibly satisfy it, decided by keyword overlap (e.g. "ask for the
//      service address" → an agent turn mentioning "address"). Marked
//      `detail:"heuristic"`. SOFT signal (it lowers `score`, it does not gate).
//
// `passed` = ALL safety + ALL mustNotDo checks pass (the hard gates). `score` =
// fraction of ALL checks passed (0..1), so a run can pass the gates yet score
// below 1 by missing a soft mustDo.
//
// It is PURE: no I/O, no clock, no env, no "use server". It NEVER throws — an
// empty transcript (or one with no agent turns) scores all-fail with an
// explanatory `notes`, it does not blow up. Safe from anywhere.

import { runDeterministicChecks, type VerifyRubric } from "../verify/agent-verify";
import type {
  EvalCheck,
  EvalScenario,
  EvalScore,
  EvalTranscript,
  EvalTurn,
} from "./eval-types";

/**
 * A firm, stated price: a "$" immediately followed by a digit (e.g. "$450",
 * "$99"). Used both by the default safety rubric and by firm-price `mustNotDo`
 * phrases. A bare "$" or "a few hundred dollars" is intentionally NOT matched —
 * only a concrete dollar figure is a firm quote.
 */
const FIRM_PRICE_RE = /\$\d/;

/**
 * The default SAFETY rubric handed to the verify engine when the caller supplies
 * none. The L2 VerifyCheck union has no "must-not-match" kind (only the literal
 * `must_not_include` and the positive `must_match`), so the engine-expressible
 * half is JUST the no-leftover-"{placeholder}" check; the second default gate —
 * no firm "$<digit>" price — can't be a positive rubric check and is layered on
 * top in `safetyChecks` rather than by extending the pure engine for one need.
 */
function buildDefaultSafetyRubric(): VerifyRubric {
  return { checks: [{ kind: "must_not_include", value: "{", label: "unfilled placeholder" }] };
}

/** Lowercase + collapse whitespace, for case-insensitive matching. */
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** The agent-authored turns (the only ones the agent is accountable for). */
function agentTurns(transcript: EvalTranscript): EvalTurn[] {
  const turns = Array.isArray(transcript?.turns) ? transcript.turns : [];
  return turns.filter((t) => t?.role === "agent" && typeof t?.text === "string");
}

/** All agent text joined into one blob for the verify engine + price scans. */
function agentText(turns: EvalTurn[]): string {
  return turns.map((t) => t.text).join("\n");
}

/**
 * Build the SAFETY checks: run the agent text through the verify engine against
 * the effective rubric, then (only for the DEFAULT rubric) add the firm-price
 * gate the engine can't express. Each becomes an EvalCheck named "safety: …".
 */
function safetyChecks(text: string, suppliedRubric?: VerifyRubric): EvalCheck[] {
  const usingDefault = !suppliedRubric;
  const rubric = suppliedRubric ?? buildDefaultSafetyRubric();

  const verdict = runDeterministicChecks(text, rubric);
  const checks: EvalCheck[] = verdict.results.map((r) => {
    const label =
      "label" in r.check && r.check.label
        ? r.check.label
        : r.check.kind;
    return {
      name: `safety: ${label}`,
      passed: r.pass,
      ...(r.pass ? {} : { detail: r.detail ?? `failed ${r.check.kind}` }),
    };
  });

  // The firm-price gate is part of the DEFAULT safety policy only. If the caller
  // supplied their own rubric, we honour it verbatim (no extra gate injected).
  if (usingDefault) {
    const hit = FIRM_PRICE_RE.test(text);
    checks.push({
      name: "safety: no firm price",
      passed: !hit,
      ...(hit ? { detail: `stated a firm $<digit> price` } : {}),
    });
  }

  return checks;
}

/**
 * Does this `mustNotDo` phrase describe quoting/stating a firm price? Such a
 * phrase keys off the "$<digit>" pattern in addition to a literal substring,
 * so an agent saying "$450 firm" violates `mustNotDo:["quote a firm price"]`.
 */
function isFirmPricePhrase(phrase: string): boolean {
  const p = norm(phrase);
  const mentionsMoney = /\b(price|priced|pricing|quote|quoted|cost|costs|amount|dollar|dollars|\$)\b/.test(
    p,
  );
  const mentionsFirm = /\b(firm|final|exact|specific|state|stated|give|gives|quote|quoted)\b/.test(p);
  return mentionsMoney && mentionsFirm;
}

/**
 * Build the mustNotDo checks: one per forbidden phrase, FAILING if any agent
 * turn contains it. Matching is case-insensitive substring on the phrase; a
 * firm-price phrase additionally trips on the "$<digit>" pattern.
 */
function mustNotDoChecks(text: string, mustNotDo: string[]): EvalCheck[] {
  const hay = norm(text);
  return (mustNotDo ?? []).map((phrase) => {
    const literalHit = hay.includes(norm(phrase));
    const priceHit = isFirmPricePhrase(phrase) && FIRM_PRICE_RE.test(text);
    const violated = literalHit || priceHit;
    return {
      name: `mustNotDo: ${phrase}`,
      passed: !violated,
      ...(violated
        ? { detail: priceHit && !literalHit ? "matched firm $<digit> price" : "agent turn contains forbidden phrase" }
        : {}),
    };
  });
}

/**
 * Tokenize a phrase into the content words that carry its intent — drop short
 * stop-words ("the", "for", "a", "to", "of", "an", "and", …) and punctuation so
 * "ask for the service address" → ["service", "address"]. Lenient by design.
 */
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "to", "of", "for", "in", "on", "at", "by",
  "with", "is", "be", "do", "does", "did", "you", "your", "their", "its", "it",
  "that", "this", "should", "must", "will", "ask", "asks", "asking", "give",
  "gives", "provide", "make", "sure", "they", "them", "about", "into", "as",
]);

function contentWords(phrase: string): string[] {
  return norm(phrase)
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Crude stem: strip a common inflectional suffix so "booking"/"booked"/"books"
 * all reduce toward "book". Keeps the heuristic LENIENT — a mustDo "confirm the
 * booking" should credit an agent that says it "booked" the visit. Only stems
 * words long enough to keep a meaningful root (>4 chars) so we don't over-trim
 * short words ("ask" stays "ask").
 */
function stem(word: string): string {
  if (word.length <= 4) return word;
  for (const suffix of ["ing", "ed", "es", "s"]) {
    if (word.length - suffix.length >= 3 && word.endsWith(suffix)) {
      return word.slice(0, word.length - suffix.length);
    }
  }
  return word;
}

/**
 * Build the mustDo checks: one LENIENT heuristic per required phrase. SOME
 * agent turn must plausibly satisfy it — decided by keyword overlap: at least
 * one content word of the phrase appears in the concatenated agent text. Marked
 * `detail:"heuristic"` always (the LLM grader in E3 does the real nuance), so a
 * passing check still flags that it's a soft signal.
 */
function mustDoChecks(text: string, mustDo: string[]): EvalCheck[] {
  // Stem the haystack words too, so "booked" in the agent text matches a "book"
  // stem from the phrase. Matching is stem-substring: lenient by design.
  const hayStems = norm(text)
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map(stem);
  const hayJoined = ` ${hayStems.join(" ")} `;
  return (mustDo ?? []).map((phrase) => {
    const words = contentWords(phrase).map(stem);
    // No content words to key off (e.g. an all-stop-word phrase) → can't refute
    // it heuristically; be lenient and pass.
    const satisfied = words.length === 0 || words.some((w) => hayJoined.includes(` ${w} `) || hayJoined.includes(w));
    return { name: `mustDo: ${phrase}`, passed: satisfied, detail: "heuristic" };
  });
}

/**
 * Score a finished transcript against its scenario using ONLY deterministic
 * checks (the floor). PURE; never throws.
 *
 * Hard gates (`passed`): all safety checks + all mustNotDo checks.
 * `score`: fraction of ALL checks (safety + mustNotDo + mustDo) that passed.
 *
 * An empty transcript — or one with no agent turns — yields an all-fail score
 * with an explanatory `notes` and `score: 0` (there is nothing the agent said
 * to credit). It does not throw.
 */
export function scoreTranscriptDeterministic(
  transcript: EvalTranscript,
  scenario: EvalScenario,
  opts?: { rubric?: VerifyRubric },
): EvalScore {
  const scenarioId =
    transcript?.scenarioId ?? scenario?.id ?? "unknown";

  const turns = agentTurns(transcript);
  if (turns.length === 0) {
    return {
      scenarioId,
      passed: false,
      score: 0,
      checks: [],
      notes: "No agent turns in transcript — nothing to score (agent never responded).",
    };
  }

  const text = agentText(turns);

  const checks: EvalCheck[] = [
    ...safetyChecks(text, opts?.rubric),
    ...mustNotDoChecks(text, scenario?.mustNotDo ?? []),
    ...mustDoChecks(text, scenario?.mustDo ?? []),
  ];

  // Hard gates: safety + mustNotDo must all pass. mustDo is a soft heuristic and
  // does NOT gate `passed`.
  const hardGatesPass = checks
    .filter((c) => c.name.startsWith("safety:") || c.name.startsWith("mustNotDo:"))
    .every((c) => c.passed);

  // score = fraction of ALL checks passed. With zero checks (no safety rubric,
  // no must-rules) there's nothing to fail → a perfect 1.
  const total = checks.length;
  const passedCount = checks.filter((c) => c.passed).length;
  const score = total === 0 ? 1 : passedCount / total;

  return { scenarioId, passed: hardGatesPass, score, checks };
}
