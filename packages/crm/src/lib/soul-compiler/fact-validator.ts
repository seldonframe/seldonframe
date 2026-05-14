/**
 * Fact validator — strips number-shaped substrings from soul output
 * that don't appear in the source markdown. Defense against
 * hallucinated license numbers, review counts, certification IDs.
 *
 * Heuristic: only targets 3+ digit numbers (license/phone/review-count
 * scale). Single and two-digit numbers (days of week, age, single-digit
 * service counts) are left alone — stripping them would be too noisy.
 *
 * Strips at the PARENTHETICAL or CLAUSE level, not just the digit, so
 * "Licensed (RMP 45127), bonded" becomes "Licensed, bonded" instead of
 * "Licensed (RMP ), bonded".
 *
 * Source check is case-insensitive: source "rmp 45127" matches soul
 * "RMP 45127".
 */

const NUMBER_RE = /\d{3,}/g;
const PAREN_WITH_NUMBER_RE = /\s*\([^)]*\d{3,}[^)]*\)\s*/g;
const CLAUSE_WITH_NUMBER_RE = /[^.,]*\d{3,}[^.,]*[.,]?\s*/g;

export type FactValidatorInput = {
  tagline: string;
  soulDescription: string;
  sourceMarkdown: string;
};

export type FactValidatorOutput = {
  tagline: string;
  soulDescription: string;
};

function findUnsourcedNumbers(text: string, sourceLower: string): string[] {
  const matches = [...text.matchAll(NUMBER_RE)].map((m) => m[0]);
  return matches.filter((n) => !sourceLower.includes(n));
}

function scrubField(field: string, sourceLower: string): string {
  if (!field) return field;
  const unsourced = findUnsourcedNumbers(field, sourceLower);
  if (unsourced.length === 0) return field;

  let scrubbed = field;

  // Pass 1 — strip parentheticals containing any unsourced number
  scrubbed = scrubbed.replace(PAREN_WITH_NUMBER_RE, (match) => {
    return findUnsourcedNumbers(match, sourceLower).length > 0 ? "" : match;
  });

  // Pass 2 — strip remaining clauses containing ONLY unsourced numbers
  // (if a clause has both sourced and unsourced, keep it to avoid false positives)
  scrubbed = scrubbed.replace(CLAUSE_WITH_NUMBER_RE, (match) => {
    const clauseNumbers = findUnsourcedNumbers(match, sourceLower);
    const allNumbers = [...match.matchAll(NUMBER_RE)].map((m) => m[0]);
    // Only strip if ALL numbers in this clause are unsourced
    return clauseNumbers.length > 0 && clauseNumbers.length === allNumbers.length ? "" : match;
  });

  // Final cleanup
  return scrubbed
    .replace(/,\s*,/g, ",")
    .replace(/\.\s*\./g, ".")
    .replace(/^[,.\s]+/, "")
    .replace(/[,\s]+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function stripUnsourcedFacts(input: FactValidatorInput): FactValidatorOutput {
  const sourceLower = input.sourceMarkdown.toLowerCase();

  return {
    tagline: scrubField(input.tagline, sourceLower),
    soulDescription: scrubField(input.soulDescription, sourceLower),
  };
}
