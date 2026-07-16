// "Make it fit anybody" — the template generalization PURE core (2026-07-16,
// marketplace generalize Task 2).
//
// A builder's recorded agent's `customSkillMd` carries personal/org-specific
// literals (an email, a name, a phone number, "yo max check this out"-style
// phrasing). Listing that template on the marketplace or deploying it to a
// client ships the builder's own details inside someone else's agent. This
// module owns the two-step propose→apply flow:
//
//   1. `proposeTemplateGeneralization` — an LLM pass (DI'd; the real
//      implementation lives in generalize-llm.ts, tests inject a fake) reads
//      `customSkillMd` and proposes substitutions: `{ token, currentValue,
//      description, example }`. NEVER auto-applies — the operator reviews and
//      accepts/edits/rejects each row in the Sell-card UI (Task 3).
//   2. `applyTemplateGeneralization` — PURE, synchronous, no I/O. Takes the
//      operator-CONFIRMED rows and rewrites `customSkillMd`, replacing each
//      accepted literal with its `{token}` placeholder. EXACT-LITERAL,
//      OCCURRENCE-COUNT-VERIFIED: a literal that appears 0 times in the
//      current text errors that row's caller instead of silently no-opping
//      (Optimistic Path is a named failure mode — CLAUDE.md 3.1). The whole
//      apply is ALL-OR-NOTHING: if ANY row fails the occurrence check, NO
//      row is applied (no partial rewrite) — a caller can't end up with half
//      the template generalized and half still leaking the builder's info.
//
// Both functions are PURE / DI'd — no DB, no fetch — so they unit-test with
// zero mocking infrastructure. The org-scoped server action wiring (auth +
// db reads/writes + the author's-deployments back-fill, in one transaction)
// lives in generalize-actions.ts ("use server").

/** One row of the propose→apply flow: a literal found in `customSkillMd`
 *  the operator may replace with `{token}`. `token` must match the
 *  TemplateBlueprintPatchSchema regex (`^[a-z0-9_]{2,40}$`) — snake_case,
 *  matching TOKEN_RE's normalization (deployment-customization.ts) so the
 *  runtime `fillPlaceholders` fill-merge (Task 1) finds it by that same key. */
export type ProposedSubstitution = {
  /** snake_case token key, e.g. "contact_email". */
  token: string;
  /** The exact literal string found in customSkillMd (e.g. "Dresslikeag@gmail.com"). */
  currentValue: string;
  /** Human-readable description of what this variable represents. */
  description: string;
  /** An example value a deploying client might fill in. */
  example: string;
};

/** The LLM seam. Given the template's current customSkillMd, propose
 *  substitutions. The real implementation (generalize-llm.ts) calls the
 *  platform LLM and defensively parses its JSON; this type is what tests
 *  inject a fake for. Returning `null` (or throwing) means "the LLM call
 *  failed / produced unusable output" — the caller turns that into an
 *  explicit error, NEVER a silent empty-proposals result (Optimistic Path). */
export type GeneralizationLlm = (args: {
  customSkillMd: string;
}) => Promise<ProposedSubstitution[] | null>;

export type ProposeGeneralizationResult =
  | { ok: true; proposals: ProposedSubstitution[] }
  | { ok: false; error: "empty_skill_md" | "llm_failed" | "malformed_llm_output" };

/** A proposed row's `token`/`currentValue` are non-empty strings after trim. */
function isValidProposal(p: unknown): p is ProposedSubstitution {
  if (!p || typeof p !== "object") return false;
  const row = p as Record<string, unknown>;
  return (
    typeof row.token === "string" &&
    /^[a-z0-9_]{2,40}$/.test(row.token) &&
    typeof row.currentValue === "string" &&
    row.currentValue.trim().length > 0 &&
    typeof row.description === "string" &&
    typeof row.example === "string"
  );
}

/**
 * Propose generalization substitutions for a template's `customSkillMd`.
 * DI's the LLM call so this is directly unit-testable with a fake.
 *
 * Never throws. A blank `customSkillMd` short-circuits (nothing to
 * generalize). An LLM call that throws, returns `null`, or returns anything
 * that isn't a clean array of valid `ProposedSubstitution` rows is an
 * EXPLICIT error — never a silently-empty proposals list (the operator must
 * be told the pass failed, not shown "no personal details found" when the
 * LLM actually choked).
 */
export async function proposeTemplateGeneralization(
  customSkillMd: string,
  llm: GeneralizationLlm,
): Promise<ProposeGeneralizationResult> {
  const text = (customSkillMd ?? "").trim();
  if (!text) return { ok: false, error: "empty_skill_md" };

  let raw: ProposedSubstitution[] | null;
  try {
    raw = await llm({ customSkillMd: text });
  } catch {
    return { ok: false, error: "llm_failed" };
  }

  if (!Array.isArray(raw)) return { ok: false, error: "malformed_llm_output" };
  if (!raw.every(isValidProposal)) return { ok: false, error: "malformed_llm_output" };

  return { ok: true, proposals: raw };
}

/** One row the operator has REVIEWED and CONFIRMED (from the Sell-card UI) —
 *  same shape as a proposal (token/currentValue/description/example), since
 *  the operator may have edited any of those fields before accepting. */
export type AcceptedGeneralizationRow = ProposedSubstitution;

export type ApplyGeneralizationResult =
  | {
      ok: true;
      customSkillMd: string;
      templateVariables: Array<{ name: string; description: string; example: string }>;
      /** The author's own values for each declared token — what
       *  `templateVarValues` on the author's EXISTING deployment(s) must be
       *  set to so their live agent's behavior is byte-identical after this
       *  rewrite (never-lies: generalizing must not change the author's own
       *  agent). Keyed by token. */
      backfillValues: Record<string, string>;
    }
  | {
      ok: false;
      error: "no_rows";
      /** Rows whose `currentValue` literal was not found in `customSkillMd`
       *  (0 occurrences) — the whole apply is rejected, no partial rewrite. */
    }
  | {
      ok: false;
      error: "literal_not_found";
      /** The token(s) whose literal occurred 0 times — surfaced to the
       *  caller so the row-level error is actionable, never a silent no-op. */
      tokens: string[];
    }
  | {
      ok: false;
      error: "duplicate_token";
      tokens: string[];
    };

/**
 * Apply the operator-confirmed generalization rows to `customSkillMd`: an
 * exact-literal, occurrence-count-verified, ALL-OR-NOTHING rewrite.
 *
 *   - Each row's `currentValue` must occur AT LEAST ONCE in `customSkillMd`
 *     (a literal split — no regex, so special characters in an email/phone
 *     number are never mis-treated as pattern metacharacters). A row whose
 *     literal occurs 0 times fails the WHOLE apply with `literal_not_found`
 *     (never a silent no-op that leaves that one literal un-generalized while
 *     reporting overall success).
 *   - Every occurrence of the literal is replaced with `{token}` (global —
 *     if the same personal detail appears twice in the prose, both instances
 *     are generalized; the resolver's `fillPlaceholders` will refill both
 *     identically at deploy time).
 *   - Duplicate token names across rows are rejected (`duplicate_token`) —
 *     two variables can't collide on the same fill-in key.
 *   - Returns the rewritten `customSkillMd`, the `templateVariables` array to
 *     persist on the blueprint, and `backfillValues` (token → the author's own
 *     currentValue) for the caller to write onto the author's existing
 *     deployment(s)' `customization.templateVarValues` in the SAME
 *     transaction as the blueprint write.
 *
 * Pure; never throws. No I/O — the server action (generalize-actions.ts)
 * wraps this with the actual DB reads/writes.
 */
export function applyTemplateGeneralization(
  customSkillMd: string,
  rows: AcceptedGeneralizationRow[],
): ApplyGeneralizationResult {
  const source = customSkillMd ?? "";
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: "no_rows" };

  // Duplicate-token guard — checked before the literal-count check so a
  // caller gets the more fundamental error first.
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.token)) dupes.add(r.token);
    seen.add(r.token);
  }
  if (dupes.size > 0) return { ok: false, error: "duplicate_token", tokens: [...dupes] };

  // Occurrence-count verification BEFORE any rewrite — all-or-nothing.
  const missing: string[] = [];
  for (const r of rows) {
    const count = countOccurrences(source, r.currentValue);
    if (count === 0) missing.push(r.token);
  }
  if (missing.length > 0) return { ok: false, error: "literal_not_found", tokens: missing };

  // Every row verified — now perform the rewrite (exact-literal, global).
  let next = source;
  const backfillValues: Record<string, string> = {};
  for (const r of rows) {
    next = replaceAllLiteral(next, r.currentValue, `{${r.token}}`);
    backfillValues[r.token] = r.currentValue;
  }

  const templateVariables = rows.map((r) => ({
    name: r.token,
    description: r.description,
    example: r.example,
  }));

  return { ok: true, customSkillMd: next, templateVariables, backfillValues };
}

/** Count non-overlapping occurrences of an EXACT literal substring. */
function countOccurrences(haystack: string, literal: string): number {
  if (!literal) return 0;
  return haystack.split(literal).length - 1;
}

/** Replace every occurrence of an EXACT literal substring (no regex — a
 *  literal split/join is immune to special characters like `.` or `+` in an
 *  email address being mis-parsed as regex metacharacters). */
function replaceAllLiteral(haystack: string, literal: string, replacement: string): string {
  if (!literal) return haystack;
  return haystack.split(literal).join(replacement);
}

/**
 * Deploy-time REQUIRED-field enforcement (Task 4, design item 4): a template
 * with declared `templateVariables` must have every one of them filled before
 * a deploy action fires — an unfilled variable would silently VANISH via
 * `fillPlaceholders`' drop-unknown-token behavior (a dishonest output: the
 * agent would just quietly not mention it), so this is a hard reject, never a
 * silent pass (CLAUDE.md 3.1 Optimistic Path). Blank/whitespace-only counts
 * as missing. Absent/empty `templateVariables` → always valid (nothing to
 * require) — a template that was never generalized behaves exactly as
 * before. Pure; never throws.
 */
export function validateTemplateVarValues(args: {
  templateVariables: Array<{ name: string }> | null | undefined;
  values: Record<string, string> | null | undefined;
}): { ok: true } | { ok: false; missing: string[] } {
  const declared = Array.isArray(args.templateVariables) ? args.templateVariables : [];
  if (declared.length === 0) return { ok: true };

  const values = args.values ?? {};
  const missing = declared
    .map((v) => v.name)
    .filter((name) => !(typeof values[name] === "string" && values[name].trim() !== ""));

  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}

/**
 * The non-blocking "this looks personal" nudge (design item 5): should the
 * Sell-card show the warning row? A cheap heuristic — NEVER a hard block
 * (the operator may intend to keep their own details in): true when
 * `customSkillMd` is non-empty, the template has NEVER been generalized
 * (`templateVariables` is empty/absent), AND `customSkillMd` still contains
 * at least one of the operator's own contact literals (their account email,
 * the workspace's outbound phone number, etc — whatever the caller passes as
 * `operatorContactLiterals`; blank/whitespace-only literals are ignored so an
 * unconfigured field never false-positives).
 *
 * Pure; never throws.
 */
export function shouldWarnPersonalDetails(args: {
  customSkillMd: string | null | undefined;
  templateVariables: unknown[] | null | undefined;
  operatorContactLiterals: Array<string | null | undefined>;
}): boolean {
  const text = (args.customSkillMd ?? "").trim();
  if (!text) return false;
  if (Array.isArray(args.templateVariables) && args.templateVariables.length > 0) return false;

  return args.operatorContactLiterals.some((literal) => {
    const trimmed = (literal ?? "").trim();
    return trimmed.length > 0 && text.includes(trimmed);
  });
}
