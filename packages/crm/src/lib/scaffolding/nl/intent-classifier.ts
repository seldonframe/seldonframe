// Deterministic pre-classifier for NL intents — sorts into the G-4
// three-tier clarifying-question policy.
//
// Shipped in SLICE 2 PR 2 C3 per audit §7 G-4 resolution.
//
// Contract:
//   - Pure function: same NL → same classification.
//   - Runs BEFORE the full LLM translation. Claude consults the
//     result to decide: clarify, proceed with defaults, or refuse.
//   - Heuristics ONLY. Not a full LLM replacement — false negatives
//     are acceptable at tier 2 (the LLM's downstream judgment
//     catches them); false positives at tier 3 are preferable to
//     false negatives at tier 3 (refuse dangerous work loudly).

const RESERVED_SLUGS = [
  "crm",
  "caldiy-booking",
  "email",
  "sms",
  "payments",
  "formbricks-intake",
  "landing-pages",
];

const DESTRUCTIVE_PATTERNS: RegExp[] = [
  // "delete all X" / "remove every Y" / "drop the Z" shape.
  /\b(delete|remove|destroy|drop|wipe|clear|truncate|purge|erase)s?\s+(all|every|the)\b/i,
  // "wipe/drop/truncate contacts|deals|...|data|table" shape.
  /\b(drop|wipe|truncate|purge|erase)s?\s+(contacts?|deals?|activities|data|table|customer|rows?)\b/i,
  // "removes <qualifier>" — catches "removes deal restrictions" etc.
  /\bremoves?\s+(deal|contact|payment|restrictions?|limits?)\b/i,
  /\bmass(-|\s)?(delete|remove|destroy|drop)\b/i,
  /\bhard(-|\s)?delete\b/i,
];

const CORE_BLOCK_MODIFY_PATTERNS: RegExp[] = RESERVED_SLUGS.map(
  (slug) => new RegExp(`\\b(add|modify|update|change|extend|patch)\\b.*\\b${slug.replace("-", "[-\\s]")}\\b.*\\bblock\\b`, "i"),
);

export type IntentClassification = {
  /** 1 = ask once; 2 = defaults + TODO markers; 3 = dangerous, refuse or require confirmation. */
  tier: 1 | 2 | 3;
  /** Specific issues detected (diagnostic, surfaces to the builder). */
  issues: string[];
  /** Short recommendation Claude relays to the builder. */
  suggestedAction: string;
};

export function classifyIntent(nlIntent: string): IntentClassification {
  const text = nlIntent.trim();

  // Tier 3: dangerous operations — check first (override tier 1/2).
  const dangerousIssues: string[] = [];

  for (const pattern of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(text)) {
      dangerousIssues.push(
        "destructive / mass-delete language detected — scaffold refuses to generate tools that delete data without explicit confirmation",
      );
      break;
    }
  }

  for (const pattern of CORE_BLOCK_MODIFY_PATTERNS) {
    if (pattern.test(text)) {
      dangerousIssues.push(
        "intent modifies an existing core block — scaffold creates NEW blocks only; edit existing blocks directly",
      );
      break;
    }
  }

  if (dangerousIssues.length > 0) {
    return {
      tier: 3,
      issues: dangerousIssues,
      suggestedAction:
        "Refuse to scaffold without explicit builder confirmation. If this is truly intended (e.g. an admin-only tool with safeguards), respond with the specific risk and ask for confirmation before generating.",
    };
  }

  // Tier 1: ambiguous / contradictory.
  const tier1Issues: string[] = [];

  if (text.length === 0) {
    tier1Issues.push("empty intent — no content to translate");
  } else if (text.length < 15) {
    // Near-empty ("a block", "block", "notes") — catches short
    // intents without enough detail to scaffold.
    tier1Issues.push(`intent too short (${text.length} chars) — describe what the block should do`);
  }

  // Contradictory type declarations: simplistic detector — "X is a
  // string and also a number" pattern.
  const contradictionPattern = /\b(string|number|integer|boolean)\b.*\b(also\s+a\s+|but\s+also\s+a\s+)(string|number|integer|boolean)\b/i;
  if (contradictionPattern.test(text)) {
    tier1Issues.push("contradictory type declaration — the same field can't be two different primitive types");
  }

  // "Does nothing AND does X" pattern — less rigorous but catches
  // obvious self-contradictions.
  if (
    /\bdoesn'?t\s+do\s+anything\b/i.test(text) &&
    /(creat|delet|updat|modif|read|writ|fetch|list)/i.test(text)
  ) {
    tier1Issues.push("self-contradictory intent — block is described as doing nothing AND performing operations");
  }

  if (tier1Issues.length > 0) {
    return {
      tier: 1,
      issues: tier1Issues,
      suggestedAction:
        "Ask ONE focused clarifying question that unblocks generation. Don't ask multiple at once — keep it conversational.",
    };
  }

  // Tier 2: default path. Claude proceeds with TODO markers for
  // anything under-specified.
  return {
    tier: 2,
    issues: [],
    suggestedAction:
      "Proceed with scaffolding. Fill reasonable defaults for any field the intent doesn't pin down; mark each default with a TODO (scaffold-default) comment the builder can grep.",
  };
}
