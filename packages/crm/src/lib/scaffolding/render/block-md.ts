// BlockSpec → BLOCK.md text.
//
// Shipped in SLICE 2 PR 1 Commit 2 per audit §3.4. Deterministic
// template rendering — no LLM in the loop; the BlockSpec is already
// validated by spec.ts and this just produces the text form the
// parser (SLICE 1 PR 1) will read back.
//
// Round-trip invariant: every string this function emits must
// `parseBlockMd(out)` cleanly, with `__tools_malformed__` and
// `__subscriptions_malformed__` ABSENT from `mixedShapeFields`. Test
// coverage pins that invariant for populated + empty specs.
//
// Rendering strategy:
//   - Empty TOOLS markers always present — `pnpm emit:blocks` will
//     populate from the generated `.tools.ts` on first run, then
//     subsequent edits to the tools.ts re-emit cleanly.
//   - Subscriptions section rendered only when spec declares any.
//   - Per G-4 (default-with-TODO-commonly), sections the builder
//     is expected to fill (Purpose, Entities, Notes for agent
//     synthesis) get TODO placeholders so they're discoverable via
//     grep.

import type { BlockSpec, BlockSpecTool } from "../spec";

export function renderBlockMd(spec: BlockSpec): string {
  const sections: string[] = [];

  sections.push(renderFrontmatter(spec));
  sections.push(renderHeader(spec));
  sections.push("---\n");
  sections.push(renderPurpose(spec));
  sections.push("---\n");
  sections.push(renderEntities(spec));
  sections.push("---\n");
  sections.push(renderEvents(spec));
  sections.push("---\n");
  sections.push(renderCompositionContract(spec));

  if (spec.subscriptions.length > 0) {
    sections.push("---\n");
    sections.push(renderSubscriptions(spec));
  }

  sections.push("---\n");
  sections.push(renderNotesForSynthesis(spec));

  // Ensure a single trailing newline — matches other core blocks.
  return sections.join("\n").replace(/\n+$/, "\n");
}

// ---------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------

function renderFrontmatter(spec: BlockSpec): string {
  const frameworks = spec.frameworks.join(",") || "universal";
  return [
    "---",
    `id: ${spec.slug}`,
    "scope: universal",
    `frameworks: ${frameworks}`,
    "status: draft",
    "---",
    "",
  ].join("\n");
}

function renderHeader(spec: BlockSpec): string {
  const trigger = spec.triggerPhrases.length > 0
    ? spec.triggerPhrases.map((p) => `- "${p}"`).join("\n")
    : '- "TODO (scaffold-default): add at least one trigger phrase"';

  return [
    `# BLOCK: ${spec.title}`,
    "",
    "**Description**",
    spec.description,
    "",
    "**Trigger Phrases**",
    trigger,
    "",
    "**Behavior**",
    spec.description,
    "",
    "**Integration Points**",
    "- CRM",
    "",
    "**Self Improve**",
    "self_improve: true",
    "",
  ].join("\n");
}

function renderPurpose(spec: BlockSpec): string {
  return [
    "## Purpose",
    "",
    spec.description,
    "",
    "<!-- TODO (scaffold-default): expand this section with the 1-3 paragraphs explaining WHY this block exists, WHAT problem it solves, and WHO it's for. -->",
    "",
  ].join("\n");
}

function renderEntities(_spec: BlockSpec): string {
  return [
    "## Entities",
    "",
    "<!-- TODO (scaffold-default): describe the persistent objects this block owns (e.g., Note, Category, Tag). Omit if this block is a pure reactive/utility block with no own storage. -->",
    "",
  ].join("\n");
}

function renderEvents(spec: BlockSpec): string {
  const lines = ["## Events", ""];
  if (spec.produces.length === 0) {
    lines.push("_This block does not emit any events._");
  } else {
    lines.push("This block emits the following events:");
    lines.push("");
    for (const event of spec.produces) {
      const fieldList = event.fields.length > 0
        ? event.fields
            .map((f) => `${f.name}: ${f.type}${f.nullable ? " | null" : ""}`)
            .join(", ")
        : "(no additional payload fields)";
      lines.push(`- \`${event.name}\` — ${fieldList}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function renderCompositionContract(spec: BlockSpec): string {
  const producesJson = spec.produces.length > 0
    ? "[" + spec.produces.map((e) => `{"event":"${e.name}"}`).join(",") + "]"
    : "[]";

  const consumesJson = spec.consumes.length > 0
    ? JSON.stringify(
        spec.consumes.map((c) => {
          if (c.kind === "event") return { kind: "event", event: c.event };
          if (c.kind === "soul_field") return { kind: "soul_field", soul_field: c.soul_field, type: c.type };
          return { kind: "trigger_payload", trigger_payload: c.trigger_payload };
        }),
      )
    : "[]";

  const verbs = Array.from(new Set(spec.tools.map((t) => extractVerb(t.name))));
  const verbsLine = verbs.length > 0 ? `[${verbs.join(", ")}]` : "[]";

  // compose_with defaults to [crm] per G-4 tier 2 (default-with-TODO
  // commonly). Every block composes with CRM at minimum.
  const composeWith = "[crm]";

  return [
    "## Composition Contract",
    "",
    `produces: ${producesJson}`,
    `consumes: ${consumesJson}`,
    `verbs: ${verbsLine}`,
    `compose_with: ${composeWith}`,
    "",
    "<!-- TOOLS:START -->",
    "[]",
    "<!-- TOOLS:END -->",
    "",
  ].join("\n");
}

function renderSubscriptions(spec: BlockSpec): string {
  const entries = spec.subscriptions.map((s) => ({
    event: s.event,
    handler: s.handlerName,
    idempotency_key: s.idempotencyKey,
  }));
  return [
    "## Subscriptions",
    "",
    "Block-level reactive handlers. When these events fire in a workspace,",
    "the cron dispatcher invokes the named handler (see",
    `\`packages/crm/src/blocks/${spec.slug}/subscriptions/\` for implementations).`,
    "",
    "<!-- SUBSCRIPTIONS:START -->",
    JSON.stringify(entries),
    "<!-- SUBSCRIPTIONS:END -->",
    "",
  ].join("\n");
}

function renderNotesForSynthesis(_spec: BlockSpec): string {
  return [
    "## Notes for agent synthesis",
    "",
    "<!-- TODO (scaffold-default): add any block-specific hints Claude should know when composing an agent that uses this block. Examples: preferred tool ordering, state-persistence guidance, common mistakes to avoid. -->",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/** `create_note` → `create`; `list_notes` → `list`. First word only. */
function extractVerb(toolName: string): string {
  const underscore = toolName.indexOf("_");
  return underscore === -1 ? toolName : toolName.slice(0, underscore);
}

// exported for tests that need to align with the renderer's tool → verb mapping.
export { extractVerb as _extractVerbForTests };
