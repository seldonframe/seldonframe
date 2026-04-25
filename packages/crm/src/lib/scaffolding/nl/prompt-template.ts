// Prompt template — renders the full prompt Claude consults when
// translating NL intent → BlockSpec JSON.
//
// Shipped in SLICE 2 PR 2 C2. The renderer is deterministic (pure
// function of its input); it produces the string the block-creation
// skill hands to the model. The model's non-determinism is bounded
// by the schema + examples the prompt carries.
//
// Structure of the rendered prompt:
//   1. Task framing + role hint.
//   2. Target NL intent (the builder's request, verbatim).
//   3. BlockSpec schema hints — the constraints Claude must honor.
//      Lists reserved slugs, naming rules, field shapes.
//   4. Reference patterns — composition-contract excerpts from
//      existing blocks so Claude sees real anatomy.
//   5. NL → BlockSpec example pairs — concrete translation lessons.
//   6. Output format directive — "respond with a single JSON
//      object matching BlockSpec; no prose outside the code fence".

import type { BlockAnatomyExcerpt } from "./reference-patterns";
import type { NLExample } from "./example-specs";

export type RenderNLPromptInput = {
  nlIntent: string;
  referencePatterns: BlockAnatomyExcerpt[];
  examples: NLExample[];
};

const RESERVED_SLUGS = [
  "crm",
  "caldiy-booking",
  "email",
  "sms",
  "payments",
  "formbricks-intake",
  "landing-pages",
];

export function renderNLPrompt(input: RenderNLPromptInput): string {
  const parts: string[] = [];

  parts.push(renderTaskFraming());
  parts.push(renderTargetIntent(input.nlIntent));
  parts.push(renderSchemaHints());
  if (input.referencePatterns.length > 0) {
    parts.push(renderReferencePatterns(input.referencePatterns));
  }
  if (input.examples.length > 0) {
    parts.push(renderExamples(input.examples));
  }
  parts.push(renderOutputDirective());

  return parts.join("\n\n---\n\n");
}

// ---------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------

function renderTaskFraming(): string {
  return [
    "## Task",
    "",
    "Translate a builder's natural-language block description into a",
    "validated BlockSpec JSON object. The BlockSpec is the structured",
    "intermediate form the scaffold pipeline consumes to generate:",
    "",
    "- `packages/crm/src/blocks/<slug>.block.md` — the block manifest.",
    "- `packages/crm/src/blocks/<slug>.tools.ts` — Zod-authored tool schemas.",
    "- `packages/crm/src/blocks/<slug>/subscriptions/*.ts` — handler stubs",
    "  (when reactive).",
    "- `packages/crm/tests/unit/blocks/<slug>.spec.ts` — test.todo stubs.",
    "",
    "Your role: consume NL + reference patterns + examples, produce a",
    "valid BlockSpec that the scaffold CLI will accept.",
  ].join("\n");
}

function renderTargetIntent(nlIntent: string): string {
  return ["## Builder intent", "", "```text", nlIntent.trim(), "```"].join("\n");
}

function renderSchemaHints(): string {
  return [
    "## BlockSpec schema hints",
    "",
    "Identifier rules:",
    "- `slug`: kebab-case lowercase (e.g. `notes`, `client-satisfaction`).",
    `- Reserved (NEVER use): ${RESERVED_SLUGS.join(", ")}.`,
    "- `title`: human-readable (e.g. `Notes`, `Client Satisfaction`).",
    "- Tool names: lowercase snake_case (`create_note`, `list_scores`).",
    "- Handler names: lowerCamelCase (`logActivityOnBookingCreate`).",
    "- Event names: `namespace.verb[.subverb]` lowercase (`note.created`, `conversation.turn.received`).",
    "- Subscription events: fully-qualified `<source-block>:<event.name>` (`caldiy-booking:booking.created`).",
    "",
    "Shape rules:",
    "- Every tool's `emits` must reference an event declared in the",
    "  spec's own `produces` list. If a tool emits `note.created`, add",
    "  `{name: \"note.created\", fields: [...]}` to `produces`.",
    "- Every subscription's `handlerName` must be unique within the spec.",
    "- Field types: `string`, `number`, `integer`, `boolean` primitives.",
    "- Nullable + optional are independent: `nullable: true` → `T | null`;",
    "  `required: false` → TypeScript optional argument.",
    "",
    "G-4 three-tier policy (from audit §7):",
    "- **Ask once** only when generation would produce meaningless output",
    "  (zero description, contradictory types).",
    "- **Default with TODO markers** for everything under-specified but",
    "  not contradictory. The scaffold inserts `TODO (scaffold-default)`",
    "  comments the builder can grep.",
    "- **Fail on dangerous output** — destructive tools, modifications",
    "  to existing core blocks.",
  ].join("\n");
}

function renderReferencePatterns(patterns: BlockAnatomyExcerpt[]): string {
  const body = patterns
    .map((p) => {
      const subsBlock = p.subscriptionsSection
        ? `\n\nSubscriptions section:\n\n${p.subscriptionsSection}`
        : "";
      return [
        `### ${p.slug}: ${p.title}`,
        "",
        p.description,
        "",
        "Composition contract:",
        "",
        p.compositionContract,
        subsBlock,
      ].join("\n");
    })
    .join("\n\n");

  return ["## Reference patterns", "", body].join("\n");
}

function renderExamples(examples: NLExample[]): string {
  const body = examples
    .map((ex, i) => {
      return [
        `## Example: NL intent → BlockSpec (${i + 1})`,
        "",
        "NL intent:",
        "",
        "```text",
        ex.nlIntent,
        "```",
        "",
        "BlockSpec:",
        "",
        "```json",
        JSON.stringify(ex.blockSpec, null, 2),
        "```",
      ].join("\n");
    })
    .join("\n\n---\n\n");

  return body;
}

function renderOutputDirective(): string {
  return [
    "## Output",
    "",
    "Respond with a single JSON object that is a valid BlockSpec.",
    "Place it inside a ```json fenced code block. Do not include any",
    "prose outside the code fence. Do not include comments inside the",
    "JSON. The scaffold CLI parses your response via JSON.parse and",
    "validates via BlockSpecSchema.",
    "",
    "If the NL intent is genuinely ambiguous (zero content, or",
    "contradictory) ask ONE focused clarifying question instead —",
    "respond with just the question, no JSON.",
  ].join("\n");
}
