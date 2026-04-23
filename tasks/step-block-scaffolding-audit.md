# SLICE 2 — Block scaffolding from NL: audit

**Draft:** 2026-04-23
**Sprint:** Scope 3 rescope, SLICE 2 of 9 (primitive-completion)
**Status:** AUDIT ONLY. No code until every gate item in §8 resolves.
**Inputs:** Scope 3 rescope message (2026-04-22), `tasks/step-subscription-audit.md`, `tasks/lessons.md` L-15 through L-22 + L-17 addenda (arch / migration / test-LOC).

---

## 1. Problem statement

### 1.1 What this slice exists to ship

A builder in Claude Code says "build me a block that tracks client satisfaction scores" and gets a real, runnable, validated block scaffold — BLOCK.md with composition contract, `.tools.ts` with Zod schemas for each tool, optional `## Subscriptions` section + handler stubs, and the wiring that turns all of it into something `pnpm emit:blocks:check` and `pnpm test:unit` both accept.

The primitive this unlocks: **builder authorship parity with core blocks.** Today, all 7 core blocks (CRM, Cal.diy Booking, Email, SMS, Payments, Formbricks Intake, Landing Pages) were hand-authored by the platform team. 11 recipe-only blocks (`ai-video-hooks-optimizer`, `waitlist-form`, etc.) ship without composition contracts — they exist as marketing placeholders per the `<!-- No composition contract. Intentionally invisible... -->` convention (verified §1.3). This gap means builders can't self-serve a real block; they file issues and wait.

SLICE 2 closes that gap: a scaffold turns a builder's NL intent into a block that participates in the full platform primitives — tools are typed + emit-checked, events flow through `workflow_event_log`, subscriptions dispatch via PR 2's cron, produces/consumes declarations cross-validate.

### 1.2 Why "scaffold" and not "generate"

Scaffold = structural skeleton with identifiable edit points, landed in real files with real types. The builder then fills business logic.

Generate = end-to-end turnkey code. Out of scope here — too many judgment calls inside business logic to automate without running into the class of errors that SeldonFrame's thin-harness philosophy explicitly avoids.

This slice lands the skeleton. The builder owns the fat.

### 1.3 Ground-truth findings at HEAD (L-16 / L-20 verification)

Verified 2026-04-23 against `claude/fervent-hermann-84055b`:

**Block inventory (18 blocks, two categories):**

| Category | Count | Pattern |
|---|---|---|
| Core / contract blocks | 7 | `<slug>.block.md` + `<slug-ish>.tools.ts`, composition contract present, TOOLS markers, emit-checked |
| Recipe / invisible blocks | 11 | `<slug>.block.md` only, HTML-comment explicitly disables composition contract, no tools.ts |

The 7 core blocks: `crm`, `caldiy-booking`, `email`, `sms`, `payments`, `formbricks-intake`, `landing-pages`.

**File-naming inconsistency (verified pre-audit finding):**
- `formbricks-intake.block.md` → `intake.tools.ts` (slug-drop)
- `landing-pages.block.md` → `landing.tools.ts` (slug-drop)
- Other 5: `<slug>.block.md` ↔ `<slug>.tools.ts` (exact match)

This is a real inconsistency in the repo. The scaffold can choose one convention and enforce it — gate item G-3 below.

**Directory structure (post-SLICE 1 PR 2):**
```
packages/crm/src/blocks/
  <slug>.block.md            # core + recipe
  <slug>.tools.ts            # core only (tool Zod schemas)
  <slug>/                    # NEW — introduced in SLICE 1 PR 2
    subscriptions/
      <handlerName>.ts       # one file per handler; registers at module import
```

Only `crm/` has a subdirectory today (sole occupant: `logActivityOnBookingCreate.ts` from PR 2 C6+C7). The convention for where handler code lives is NEW and NOT YET extended by any other block. A scaffold's choice to extend this convention for a new block is a deliberate decision, not a retrofit. It makes sense per the subscription audit §3.3 "where handler code lives" section.

**BLOCK.md structural anatomy (from CRM at HEAD):**
```
---
frontmatter (id, scope, frameworks, status?)
---
# BLOCK: <Name>
**Description**, **Trigger Phrases**, **Behavior**, **Integration Points**, **Self Improve**
---
## Purpose
## Entities               # optional structured
## Events                  # prose of emissions
## Composition Contract
  produces: [...]
  consumes: [...]
  verbs: [...]
  compose_with: [...]
  <!-- TOOLS:START --> JSON array <!-- TOOLS:END -->
---
## Subscriptions           # NEW — SLICE 1 PR 2 introduced
  prose about handlers
  <!-- SUBSCRIPTIONS:START --> JSON array <!-- SUBSCRIPTIONS:END -->
---
## Notes for agent synthesis
## Navigation
```

Heterogeneity across the 7 core blocks is noteworthy: Booking has 12 sections; CRM has 8; Payments has 11. Not every block uses every section. A scaffold needs a MINIMAL required-sections set + optional-sections recommendations.

**Existing skill + MCP infrastructure (verified):**
- `.claude-plugin/plugin.json` — the SeldonFrame plugin manifest. Registers one MCP server (`seldonframe` → `skills/mcp-server/src/index.js`) exposing MCP tools for workspace operations.
- `skills/seldonframe/SKILL.md` (50 lines) — the top-level Claude Code skill instructions. Marketing + key-management posture. No scaffolding today.
- `skills/mcp-server/src/tools.js` — MCP tool definitions. `create_workspace`, `install_caldiy_booking`, etc. No block-scaffolding tool.

**No existing scaffolding infrastructure. SLICE 2 is greenfield.**

**Scripts directory (`scripts/`):**
- `emit-block-tools.{js,impl.ts}` — the tools.ts → BLOCK.md emit pipeline.
- `emit-event-registry.{js,impl.ts}` — SeldonEvent union → JSON registry.
- `phase-7-spike/` — archetype probe scripts.
- No `scaffold-*.ts` — consistent with the greenfield finding above.

### 1.4 Why Claude Code skill vs MCP tool vs CLI script

Three candidate shapes, each with tradeoffs.

| Shape | NL ergonomics | Deterministic tests | Discoverability | Maintenance burden |
|---|---|---|---|---|
| Claude Code SKILL.md instructions | Natural (the skill IS NL) | Weak (LLM generates files) | Strong (one `/` away) | Medium (keep SKILL.md aligned with conventions) |
| MCP tool (`scaffold_block` in tools.js) | Indirect (agent translates NL → structured call) | Strong (deterministic generator) | Medium | Low (add a tool + test it) |
| CLI script (`pnpm scaffold:block`) | Poor (requires typed args) | Strong | Weak | Low |

**Audit recommendation (for G-1):** Hybrid — an MCP tool `scaffold_block(intent, options)` as the deterministic generator, plus a thin Claude Code SKILL.md section that instructs the agent to call it when the builder says "build me a block that …". This keeps the generator under deterministic test coverage while giving the builder the NL experience Max's rescope message specified.

---

## 2. Atomic decomposition

What SLICE 2 actually ships, in the smallest units:

| Unit | Description | Owner file(s) |
|---|---|---|
| Intent parser | NL → structured `BlockSpec` (slug, title, events, tools, subscriptions) | `packages/crm/src/lib/scaffolding/intent.ts` |
| Block spec schema | Zod schema for `BlockSpec` — a known-shape intermediate form | `packages/crm/src/lib/scaffolding/spec.ts` |
| Template engine | Renders `BlockSpec` → file contents (BLOCK.md + tools.ts + subscriptions/*.ts) | `packages/crm/src/lib/scaffolding/templates/*.ts` |
| Writer | Writes templated files to the blocks dir | `packages/crm/src/lib/scaffolding/writer.ts` |
| Validator | Runs typecheck + emit:blocks:check on the generated block | `packages/crm/src/lib/scaffolding/validate.ts` |
| MCP tool | `scaffold_block` in the MCP server, calls the above | `skills/mcp-server/src/tools.js` |
| SKILL.md section | Instructions for Claude Code to invoke the MCP tool on NL | `skills/seldonframe/SKILL.md` |
| Tests | Per module + integration (scaffold a realistic block end-to-end) | `packages/crm/tests/unit/scaffolding/*.spec.ts` |

### 2.1 What reuses from SLICE 1

- `ToolDefinition` + `ToolEntrySchema` from `lib/blocks/contract-v2.ts` — the scaffold's tools.ts output conforms to this shape.
- `SubscriptionEntrySchema` — the scaffold's `## Subscriptions` section output conforms to this.
- `parseBlockMd` + `validateSubscriptions` — the scaffold can run the parser on its own output as one validation layer.
- `emit-block-tools` pipeline — the scaffold's tools.ts, when included in the TARGETS list, round-trips through emit.

### 2.2 What's new

- NL-to-structured parsing. No precedent in the codebase.
- File-template rendering. No precedent (closest: `emitToolEntries` in `lib/blocks/emit-tools.ts`, but that's JSON-Schema rendering, not file authoring).
- A Claude-Code-triggered file-write flow. The MCP server today writes workspace data; it has never authored source files in the repo. This is a new class of operation and needs explicit containment.

---

## 3. Scaffolding design

### 3.1 Invocation surface

The user types (in Claude Code, with the SeldonFrame skill loaded):
```
Build me a block that tracks client satisfaction scores after each project.
```

Claude Code:
1. Recognizes the intent (the SKILL.md instructs to look for "build me a block" / "scaffold a block" patterns).
2. Calls `scaffold_block({ intent: "…" })` on the MCP server.
3. The MCP tool handles clarifying questions (G-4), generation, validation, and returns a structured result.
4. Claude Code relays the result to the user: files created, validation status, next-step suggestions.

### 3.2 BlockSpec intermediate form

NL → BlockSpec → files. The intermediate form is what the tests exercise — the LLM → BlockSpec step is inherently non-deterministic, but BlockSpec → files MUST be deterministic.

```ts
type BlockSpec = {
  slug: string;               // "satisfaction-scores" — kebab-case
  title: string;              // "Client Satisfaction Scores"
  description: string;        // one-line builder-facing description
  triggerPhrases: string[];   // 3-5 NL phrases that activate this block
  frameworks: string[];       // "universal" or specific frameworks
  events: {
    produces: Array<{ name: string; fields: Array<{name: string; type: string; nullable: boolean}> }>;
    consumes: Array<{ kind: "event" | "soul_field" | "trigger_payload"; ... }>;
  };
  tools: Array<{
    name: string;             // "create_score"
    description: string;
    args: ZodSchemaSpec;      // structured; renderable as Zod source
    returns: ZodSchemaSpec;
    emits: string[];          // events from produces
  }>;
  subscriptions: Array<{
    event: string;            // "<source-block>:<event-name>"
    handlerName: string;
    description: string;      // what the handler should do (for stub)
    idempotencyKey: string;
  }>;
};
```

The intent parser's job is LLM-shaped NL-to-spec. The template engine's job is deterministic spec-to-files. The two are unit-tested independently.

### 3.3 Generated file tree (example: "client satisfaction scores")

```
packages/crm/src/blocks/
  satisfaction-scores.block.md                 # NEW — full skeleton
  satisfaction-scores.tools.ts                 # NEW — Zod schemas per tool
  satisfaction-scores/                         # NEW — subdir (SLICE 1 PR 2 convention)
    subscriptions/
      logScoreOnProjectComplete.ts             # NEW — handler stub (if subscription declared)
packages/crm/tests/unit/blocks/
  satisfaction-scores.spec.ts                  # NEW — one smoke test per tool
scripts/emit-block-tools.impl.ts               # MODIFIED — add to TARGETS registry
packages/core/src/events/index.ts              # MODIFIED — add new event types to SeldonEvent union
```

The `SeldonEvent` union edit is the thorniest part. G-2 addresses it.

### 3.4 BLOCK.md template contents

```markdown
---
id: {{slug}}
scope: universal                    # MVP default; G-1 gate may add framework selection
frameworks: {{frameworks or empty}}
status: {{status or "draft"}}
---
# BLOCK: {{title}}

**Description**
{{description}}

**Trigger Phrases**
{{triggerPhrases bulleted}}

**Behavior**
{{one paragraph — generated from NL intent, rendered as prose}}

**Integration Points**
{{composition-contract compose_with list, prose-ized}}

**Self Improve**
self_improve: true

---

## Purpose
{{generated from intent — 1-3 paragraphs}}

---

## Entities
{{optional — scaffold leaves this section as a stub with "_TODO: describe your entities here_" when the intent doesn't name them}}

---

## Events
{{prose from the produces list}}

---

## Composition Contract

produces: {{produces JSON}}
consumes: {{consumes JSON}}
verbs: {{verbs inferred from tool names}}
compose_with: {{inferred from consumed events' source blocks}}

<!-- TOOLS:START -->
{{empty array initially — emit:blocks will populate from .tools.ts}}
[]
<!-- TOOLS:END -->

---

## Subscriptions
{{only rendered if subscriptions declared}}

{{prose explaining subscription intent}}

<!-- SUBSCRIPTIONS:START -->
{{subscriptions JSON array}}
<!-- SUBSCRIPTIONS:END -->

---

## Notes for agent synthesis
{{TODO stub — scaffold leaves placeholder for builder to fill}}
```

### 3.5 tools.ts template contents

```typescript
// {{Block Title}} — tool schemas (scaffolded {{date}} by block-scaffold skill).

import { z } from "zod";
import type { ToolDefinition } from "../lib/blocks/contract-v2";

// ---------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------
// {{scaffold leaves a commented stub if no shared types are obvious}}

// ---------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------

export const {{SlugConst}}_TOOLS: ReadonlyArray<ToolDefinition> = [
  {
    name: "{{tool.name}}",
    description: "{{tool.description}}",
    args: z.object({
      {{rendered from tool.args spec}}
    }),
    returns: z.object({
      {{rendered from tool.returns spec}}
    }),
    emits: [{{tool.emits joined}}],
  },
  // ... one per tool
] as const;
```

### 3.6 subscriptions handler stub

```typescript
// {{handlerName}} — subscription handler scaffolded {{date}}.
//
// TODO: implement the handler logic. The scaffold generated this stub
// based on the intent "{{subscription.description}}" — replace the
// TODO-body with the real side-effect. The runtime (cron dispatcher,
// lib/subscriptions/dispatcher.ts) invokes this with:
//   - event: SubscriptionEvent — { type, data, orgId, eventLogId, emittedAt }
//   - ctx: SubscriptionHandlerContext — { orgId, log }
// Return void (sync) or Promise<void> (async). Throw on failure to
// trigger retry (audit §4.7 for retry semantics).

import type { SubscriptionEvent, SubscriptionHandler, SubscriptionHandlerContext } from "@/lib/subscriptions/dispatcher";
import { registerSubscriptionHandler } from "@/lib/subscriptions/handler-registry";

export const {{handlerName}}: SubscriptionHandler = async (
  event: SubscriptionEvent,
  ctx: SubscriptionHandlerContext,
): Promise<void> => {
  // TODO: implement
  ctx.log("{{handlerName}} invoked", { eventLogId: event.eventLogId });
};

registerSubscriptionHandler("{{handlerName}}", {{handlerName}});
```

### 3.7 SeldonEvent union edit

The scaffold MUST add any newly-produced event types to the `SeldonEvent` union in `packages/core/src/events/index.ts`. Without this:
- `pnpm emit:event-registry:check` fails (drift).
- `ToolDefinition.emits` Zod-validation fails at synthesis time (events not in registry).
- Subscriptions referencing the new events fail the M3 validator.

This edit is load-bearing for the scaffold to produce a "real, runnable" block.

**Design:** the scaffold reads the file, inserts a new variant in alphabetical-or-append order, writes back. Not a code-mod via AST — a text-splice on the discriminated union variant list (the same kind of append the existing emit-registry script handles). Gate item G-2.

---

## 4. Runtime path enumeration (L-17 multiplier calculation)

Per L-17 addendum (test-LOC 2.0x multiplier for multi-path PRs, shipped this morning), count distinct paths:

| Path | What it does | Independent test surface? |
|---|---|---|
| 1. Intent parsing (LLM) | NL → BlockSpec. Non-deterministic. | Mock-based contract tests. |
| 2. BlockSpec validation | Zod-parse of BlockSpec. | Pure function — schema tests. |
| 3. BLOCK.md rendering | Spec → markdown text. | Pure function — snapshot tests. |
| 4. tools.ts rendering | Spec → TypeScript source. | Pure function — snapshot + compile-test. |
| 5. Subscription stub rendering | Spec → handler file. | Pure function — snapshot tests. |
| 6. File writing | Side-effect — fs.writeFileSync or dry-run. | Integration test (temp dir). |
| 7. SeldonEvent union edit | Text splice on core/events/index.ts. | Unit test on the splice logic. |
| 8. Post-gen validation | typecheck + emit-check the new block. | Integration test (spawns tsc, emit CLI). |
| 9. MCP tool wiring | `scaffold_block` tool dispatcher. | Integration test against the MCP server. |
| 10. Error recovery / rollback | If validation fails, undo writes. | Integration test. |

**Count of distinct paths: 10.**

That's well over the 3+ threshold. By the L-17 default, **2.0x** applies. But the per-path TEST COST depends on what kind of interaction the paths have.

**Interaction-level spectrum (L-17 calibration refinement):**

| Path-interaction level | Multiplier | Example |
|---|---|---|
| Single-path / two-path | **1.3x** | One-shot primitive with minimal surface; pre-L-17 default |
| Sequential pipeline (3+ paths chained, one-at-a-time coverage) | **1.6x** | This slice. Each path is tested in isolation; integration tests walk the pipeline end-to-end once, not combinatorially |
| Concurrent multipath (3+ paths with runtime interaction) | **2.0x** | SLICE 1 PR 2 (emit + cron + install + handler). Pair-integration coverage explodes LOC |

**Rationale for 1.6x on SLICE 2:** sequential pipeline tests one path at a time, not combinations. The integration test walks the pipeline end-to-end, but each intermediate state is well-defined; there's no "path A racing path B" surface area. This is genuinely cheaper to cover than SLICE 1 PR 2's concurrent runtime.

**Applied multiplier: 1.6x** on the test-LOC portion of the PR 1 + PR 2 estimates below. Production LOC retains the 1.3x architectural multiplier (per L-17 original rule — production code scales linearly).

**L-17 calibration feedback hook:** after SLICE 2 closes, compare actual test-LOC against 1.6x-predicted. Three possible outcomes:
- Actual ≤ 1.5x: 1.6x was conservative; pipeline-shaped slices can use 1.4-1.5x.
- Actual ≈ 1.6x: prediction held; adopt 1.6x as the "sequential pipeline" standard.
- Actual ≥ 1.8x: underestimated the coverage burden; revisit whether "sequential pipeline" was the right classification.

This three-level spectrum (1.3x / 1.6x / 2.0x) becomes the L-17 calibration standard if SLICE 2 validates it.

---

## 5. Validation strategy

Post-generation, the scaffold runs:

1. **Parser round-trip (fast):** `parseBlockMd(generatedContent)` — confirms the BLOCK.md is well-formed. Catches most template-level errors without spawning a compiler.
2. **TypeScript compile:** `tsc --noEmit` on the generated `.tools.ts` — confirms the Zod-schema source is syntactically valid TypeScript. Catches template misrendering of nested objects, union types.
3. **Emit round-trip:** `pnpm emit:blocks` — confirms the tools.ts → BLOCK.md TOOLS-block emission works with the generated shape. The scaffold adds the new block to `TARGETS` in `scripts/emit-block-tools.impl.ts`.
4. **Event registry check:** `pnpm emit:event-registry:check` — confirms the SeldonEvent union edits produced a clean registry.
5. **Subscription validator:** `validateSubscriptions(parsed.composition.subscriptions, { eventRegistry, handlerExports })` — confirms the new subscription block + handler names resolve.

On failure at any step, the scaffold ROLLS BACK all file writes. Gate G-5 formalizes "what counts as failure."

---

## 6. Composition with SLICE 1

Newly-scaffolded blocks include `## Subscriptions` scaffolding per Max's reminder:

- **When the intent doesn't mention reactive behavior:** generate an empty Subscriptions section (markers present, empty JSON array) with a prose comment: "Add handlers here when this block needs to react to events."
- **When the intent implies reactive behavior** ("when a contact is created, send them a welcome email"): generate a populated Subscriptions entry + the handler stub file.

The G-4 auto-flip path (dormant subs when producer block uninstalled) is inherited automatically — the install-time `reconcileBlockSubscriptions` (SLICE 1 PR 2 C4) handles the new block's subscriptions the same way it handles any other block's.

### 6.1 Install-time path for scaffolded blocks

Scaffold output goes into `packages/crm/src/blocks/`. At build time, the block is loadable by `seedInitialBlocks` (SLICE 1 PR 2 C4's host). When installed in a workspace, subscriptions auto-register, and dormant ones flip when producer blocks arrive. Nothing new to wire — the primitive from SLICE 1 is the integration surface.

### 6.2 What the scaffold does NOT do

Per Max's rescope reminders:
- No UI generation (SLICE 4).
- No customer-facing pages.
- No business logic in tool implementations (handler stubs + TODO markers only).
- No database schema generation — if the block needs persistence, the builder hand-authors Drizzle schemas (out-of-slice).

---

## 7. Gate items — all APPROVED 2026-04-23

### G-1 — APPROVED: SKILL-only at `skills/block-creation/SKILL.md`

Three options (from §1.4 table):

**Resolution:** new top-level `skills/block-creation/SKILL.md` houses the scaffold instructions and the TypeScript utilities that render templates + write files + validate. The builder types "build me a block that …" in Claude Code; the SeldonFrame plugin surfaces the skill; the skill's instructions drive the generation.

**Why not the MCP-tool hybrid:** block scaffolding is a **code-authoring workflow**, not workspace-configuration. It operates on the repo tree the builder's working in, not on a live workspace's data. Coupling a repo-ops action into the workspace-ops MCP server was a category error in the audit draft. MCP server stays focused on workspace ops.

**Why not CLI-only:** redundant with the SKILL. Builders already talk to Claude Code in natural language for the rest of their session — a separate CLI shell invocation adds friction without added safety. The SKILL's deterministic utilities run the same generator logic a CLI would have invoked.

**Implementation shape:** skill markdown instructs Claude Code on the workflow; backing logic lives in `packages/crm/src/lib/scaffolding/*.ts`; the skill invokes the logic via the Bash tool calling a thin orchestrator script (or directly via the Write/Edit tools if the orchestrator is a simple enough file-dispatch step). **Exact mechanism is a PR 1 implementation detail** once the skill is live and we can validate the actual Claude Code call shape.

### G-2 — APPROVED: AST-based with text-splice fallback only on parse failure

**Resolution:** `ts-morph` AST manipulation is the primary path. Text-splice fallback is permitted ONLY on explicit AST parse exception (e.g., the file contains syntactically invalid TypeScript that ts-morph refuses to load). "Looks hard" is NOT a fallback trigger; the scaffold must emit a clear error and halt if ts-morph cannot load the source.

**Why not manual-patch:** defeats the scaffold promise — the whole point is the builder says "build me X" and gets a runnable X. Emitting a patch for the builder to copy-paste is a half-done scaffold.

**Why not text-splice-primary:** the SeldonEvent union has rich formatting (trailing-comment lines, multi-line variants with nested shapes). A regex-based splice that works today can silently corrupt the file when someone lands a comment or reorders variants. AST-primary locks in correctness as the union evolves.

**Fallback semantics:** on ts-morph parse failure, the scaffold logs `"AST parse failed for <file>: <error>. Attempting text-splice fallback — verify the output manually."` — explicit, loud, unmissable in console output. The fallback writes the variant append at the end of the union body; builder reviews via `git diff`.

### G-3 — APPROVED: Enforce clean naming for NEW blocks only

**Resolution:** the scaffold enforces exact match (`<slug>.tools.ts`) for every NEW block it produces. Existing inconsistencies are NOT migrated by this slice — the pre-existing `intake.tools.ts` and `landing.tools.ts` stay put.

**Why not also clean up:** out-of-slice. Rename + reference-update is a cross-file ripple that demands its own reviewed commit, not a silent side effect of landing the scaffold. The cleanup is captured as `tasks/follow-up-tools-naming-cleanup.md` with the 2 known offenders, ~1 hr estimate, nice-to-have priority.

**Convention going forward:** new blocks authored by the scaffold MUST use `<slug>.tools.ts`. Hand-authored new blocks SHOULD use the same convention. The inconsistency is grandfathered but not endorsed.

### G-4 — APPROVED: Three-tier policy (ask rarely / default commonly / fail never unless dangerous)

**Resolution:** three tiers, applied per ambiguity class.

**Tier 1 — Ask clarifying questions (rare):** only when generation would produce genuinely meaningless output. Examples:
- No description at all ("build me a block" with zero further text).
- Conflicting type declarations (e.g., the same event's fields typed two contradictory ways in the same intent).
The skill asks ONE focused question, waits for a reply, proceeds.

**Tier 2 — Sensible defaults + TODO markers (common case):** for everything that's "under-specified but not contradictory." Examples:
- Intent says "tracks satisfaction scores" but doesn't name tools → scaffold generates `create_score` + `list_scores` + `get_score` as defaults, each with `// TODO (scaffold-default): customize or remove` at the top of the tool definition.
- No explicit frameworks → default to `universal`.
- No explicit `compose_with` → default to `[crm]` (every block composes with CRM at minimum).
The builder grep `TODO (scaffold-default):` in the generated tree to find the review points.

**Tier 3 — Fail on dangerous output (never, unless):** the only time the scaffold refuses to produce output is when the request would generate something destructive AND the builder hasn't confirmed. Examples:
- Intent mentions "delete all contacts when …" — scaffold refuses to scaffold a destructive tool without explicit confirmation.
- Intent implies mutating an existing core block (e.g., "add a tool to CRM that …") — scaffold refuses; existing blocks are out of scope.

**Summary:** ask-rarely (tier 1), default-with-TODO-commonly (tier 2), fail-never-unless-dangerous (tier 3). The three tiers keep the common path fast while guardrails protect the edge cases.

### G-5 — APPROVED: Parser + emit validation only

**Resolution:** `parseBlockMd` round-trip + TypeScript compile + `pnpm emit:blocks:check` + `pnpm emit:event-registry:check`. No test runs in scaffold validation.

**Why not also run tests:** tests against empty implementations are meaningless. The scaffold ships handler stubs with TODO markers (per G-6); running a test against a handler whose body is `// TODO: implement` is a pretend-pass that costs ~30s of demo-moment wait time. The builder runs tests after filling stubs, not during scaffold.

**Validation gate order:**
1. `parseBlockMd(generatedBlockMd)` — catches template-level markdown errors (fast, in-process).
2. `tsc --noEmit` on the generated `.tools.ts` — catches Zod-schema source misrendering.
3. `pnpm emit:blocks` — catches TOOLS-block round-trip drift (does the `.tools.ts` emit cleanly into `.block.md`?).
4. `pnpm emit:event-registry:check` — catches SeldonEvent union edit drift (PR 2 territory; PR 1 skips this step since PR 1 doesn't edit the union).

On failure at any step, invoke the rollback path (§10).

### G-6 — APPROVED: Empty test stubs with TODO markers + descriptive naming

**Resolution:** scaffold generates one test stub per tool with descriptive naming (`<tool-name> accepts a valid args shape and returns the expected returns shape`) and a TODO body pointing to an existing-block test for the pattern. Not blank files, not pretend tests.

**Template shape for each generated test:**
```typescript
import { describe, test } from "node:test";
import assert from "node:assert/strict";

// import { {{SlugConst}}_TOOLS } from "@/blocks/{{slug}}.tools";

describe("{{slug}} — {{tool.name}}", () => {
  test.todo(
    "{{tool.name}} accepts a valid args shape and returns the expected returns shape — " +
      "TODO: fill using the pattern in packages/crm/tests/unit/crm-tools.spec.ts",
  );
});
```

`test.todo(...)` is Node's built-in — it lists the test in the run output as "todo" without failing. The builder sees "6 todos" and knows where to fill. Once filled, the builder swaps `test.todo` for `test`.

**Why not blank files:** blank files are abandonable. `test.todo` stubs create a visible checklist in `pnpm test:unit` output that keeps the debt visible.

**Why not pretend tests:** passing tests that don't test anything are worse than no tests. A handler stub with `return;` passing a "smoke test" gives false confidence.

---

## 8. Proposed PR split

### PR 1 — Scaffold core (deterministic backend scaffolding)

Scope:
- `skills/block-creation/SKILL.md` — skill instructions (G-1 resolution).
- BlockSpec schema + Zod validation (`packages/crm/src/lib/scaffolding/spec.ts`).
- Template engine for BLOCK.md + tools.ts + subscriptions handler stub + test stubs (G-6 resolution).
- File writer with orphan detection on failure (not transactional — see §10).
- Validation gate: `parseBlockMd` + `tsc --noEmit` + `pnpm emit:blocks:check` (G-5 resolution). PR 1 skips the SeldonEvent registry check because PR 1 does not mutate the union.
- Skill wiring: SKILL.md instructs Claude Code on the workflow; backing logic in `packages/crm/src/lib/scaffolding/*.ts` invoked via Bash tool or direct file writes (exact shape is an implementation detail, per G-1).
- Unit tests per module + one integration test ("scaffold a realistic BlockSpec → all validation passes").
- **Smoke-test block shipping with PR 1 (addition #5):** one minimal scaffolded block — e.g., a `notes` block with one tool (`create_note`) and one event (`note.created`) — committed as part of PR 1's close-out. ~50-100 LOC of scaffolded output. Proves the pipeline end-to-end + serves as the first real artifact other blocks can pattern against.

**Out of PR 1 (PR 2 scope):**
- NL intent parser (LLM-driven `intent: string` → `BlockSpec`).
- SeldonEvent union AST editing (ts-morph primary per G-2).
- Text-splice fallback logic for ts-morph parse failure.
- Workspace install-time wiring beyond what SLICE 1 PR 2 C4 already handles.

### PR 2 — NL intent parser + SeldonEvent union edit

Scope:
- LLM prompt template for "NL intent → BlockSpec".
- Clarifying-question flow per G-4 three-tier policy.
- SeldonEvent union editor via ts-morph (primary) with text-splice fallback on parse failure (G-2).
- End-to-end integration test ("a realistic NL intent produces a valid block").
- Smoke-test block #2 (end-to-end from NL, demonstrates PR 2's adds).

**Split rationale:** PR 1 is deterministic + testable without the LLM surface. Ships with a concrete scaffolded artifact (the smoke-test block) proving the pipeline works. PR 2 layers the LLM surface on top. This lets PR 1 ship with high confidence (no LLM flakiness in test runs) and PR 2 iterate the NL quality separately.

---

## 9. Framing — block scaffolding is a code-authoring workflow

Block scaffolding is **NOT** workspace-configuration. It operates on the builder's repo tree, not on a live workspace's data.

**Implications (load-bearing for G-1 resolution and the rollback story in §10):**

- **Files land in the builder's working tree.** The scaffold writes to `packages/crm/src/blocks/<slug>.block.md` + sibling files on disk. It does NOT commit. It does NOT push. It does NOT install the block in any running workspace. Those actions are the builder's — via normal `git add` / `git commit` / `git push`, then `pnpm install-block` or the existing install flow for workspace deployment.

- **Claude Code is a code-gen assistant, not a platform admin.** The skill runs inside the builder's Claude Code session with access to the file system. When it writes `blocks/notes.block.md`, it's authoring code — the builder reviews + commits like they would for any PR.

- **No workspace side effects.** The scaffold doesn't hit `organizations.settings`, doesn't call `seedInitialBlocks`, doesn't touch any running workspace. A builder scaffolding a `notes` block sees the files appear in their repo; installing that block into a workspace is a separate, subsequent action.

- **Git is the transactional envelope.** If the builder doesn't like the scaffold output, they `git checkout -- <paths>` or `git stash` — the same recovery path they'd use for any bad code-gen. The scaffold itself doesn't implement undo; it relies on the builder's existing git discipline.

**What this framing rules out:**
- No "scaffold a block and install it live" as a single atomic action. Two separate steps.
- No database migrations triggered by scaffolding. Builder runs `pnpm db:generate` if their block needs persistence.
- No auto-commit. The builder owns the commit message + review + push.

**Why this framing matters for PR 1 design:** the file writer's failure path (§10) doesn't need to be transactional. Orphan files from a partial scaffold are recoverable via normal git. The scaffold just needs to be loud about what it wrote so the builder can clean up cleanly.

---

## 10. Rollback story — orphan detection, not transactional

On scaffold partial-failure (validation fails mid-pipeline):

**The scaffold leaves files in the working tree.** It does NOT attempt to delete partially-written files. Instead, it emits a clear error:

```
[scaffold] FAILED at step: {validation-step-name}
Error: {detailed error message}

Files created by this run (orphans if validation failed):
  packages/crm/src/blocks/notes.block.md
  packages/crm/src/blocks/notes.tools.ts
  packages/crm/src/blocks/notes/subscriptions/<handlerName>.ts
  packages/crm/tests/unit/blocks/notes.spec.ts

Recovery options:
  1. Fix the issue and re-run the scaffold (it will overwrite the orphan files).
  2. Remove the orphans: `git clean -fd packages/crm/src/blocks/notes* packages/crm/tests/unit/blocks/notes.spec.ts`
  3. Review manually and hand-fix (diff shows what landed).
```

**Why orphan detection, not transactional rollback:**

- **Builder owns recovery.** Per §9, scaffold is code-authoring. Git is the transactional envelope. A scaffold-level transaction would be a second (redundant) envelope.
- **Partial output is educational.** A builder who sees "my tools.ts scaffolded fine but my BLOCK.md failed the parser check" can read the half-generated output and understand what went wrong. Auto-deletion hides the failure detail.
- **Filesystem-level atomicity is expensive.** Real transactional rollback requires either (a) write-to-temp-dir + atomic-rename (adds complexity, can still fail halfway), or (b) journaling every file-write intent before doing it. Both are out of proportion for a code-authoring workflow where git is already the undo surface.

**What the scaffold DOES guarantee:**
- Every file write is reported in the error output so no silent orphans.
- Every file write is append-only against a specific path — the scaffold never appends to an existing file it didn't create in the same run. If a file with the target path already exists (e.g., `notes.block.md` already in the tree), the scaffold refuses to run and tells the builder to pick a different slug or remove the existing file first. (Gate implicit in G-4 tier 3 "dangerous output" — overwriting existing code without confirmation is dangerous.)

**What the scaffold does NOT guarantee:**
- No undo stack. If the builder doesn't want the files, they remove them.
- No "scaffold wrote X, then crashed before writing Y" state is automatically rolled back. The error output lists X as an orphan; the builder removes X.

**Implementation sketch:**
```ts
const createdFiles: string[] = [];
try {
  for (const file of filesToWrite) {
    if (existsSync(file.path)) {
      throw new Error(`${file.path} already exists — refusing to overwrite`);
    }
    writeFileSync(file.path, file.content);
    createdFiles.push(file.path);
  }
  await runValidationGate(createdFiles);
} catch (err) {
  emitOrphanReport(createdFiles, err);
  throw err;
}
```

---

## 11. LOC estimate with L-17 citation

**Runtime-path count:** 10 (§4).
**Interaction level:** sequential pipeline (§4 refinement).
**Multiplier applied:** 1.6x on test-LOC. Production LOC uses 1.3x (original L-17 architectural default).

### PR 1 — deterministic scaffold core

| Component | Production LOC | Test LOC (1.6x) |
|---|---|---|
| BlockSpec Zod schema + helpers | 150 | 200 |
| Template engine (BLOCK.md + tools.ts + subscriptions stub + test stubs) | 350 | 450 |
| File writer + orphan detection | 150 | 200 |
| Validation gate (parseBlockMd + tsc + emit:blocks:check) | 200 | 350 |
| SKILL.md at `skills/block-creation/` | 100 | 0 |
| Minimal scaffolded block — the `notes` smoke-test artifact | 80 | 50 |
| Integration test (scaffold + validate a realistic spec) | 0 | 250 |
| **Subtotal** | **1,030** | **1,500** |
| **PR 1 total** | | **~2,530** |

### PR 2 — NL intent parser + SeldonEvent union edit

| Component | Production LOC | Test LOC (1.6x) |
|---|---|---|
| LLM intent-to-BlockSpec prompt template + call wiring | 200 | 300 |
| Clarifying-question three-tier flow (G-4) | 200 | 300 |
| SeldonEvent union editor (ts-morph primary) | 200 | 300 |
| Text-splice fallback + error handling (G-2) | 100 | 150 |
| End-to-end NL → scaffolded block integration | 0 | 350 |
| Smoke-test block #2 (NL-driven artifact) | 80 | 50 |
| **Subtotal** | **780** | **1,450** |
| **PR 2 total** | | **~2,230** |

**Slice total:** ~4,760 LOC. Inside Max's revised 3,200-4,100 range + overflow allowance; PR 1 alone is 2,530 (inside the 2,000-2,500 target with 30 LOC overflow).

**Stop-and-reassess triggers:**
- **PR 1 trigger:** ~3,250 LOC (30% over the 2,500 upper target).
- **Slice trigger (if PR 2 runs long):** ~5,330 LOC (Max's approved number).

**L-17 calibration feedback hook:** after PR 1 closes, compare actual PR 1 LOC against the 2,530 prediction.
- ≤ 2,300 → 1.6x was conservative; pipeline slices can use 1.4-1.5x.
- ≈ 2,530 → 1.6x validated; adopt as sequential-pipeline standard.
- ≥ 2,800 → 1.6x was too low; revisit whether the pipeline classification was right.

### Containment expectations

- Zero changes to `lib/agents/types.ts`, `lib/blocks/contract-v2.ts`, `lib/subscriptions/*`.
- Zero changes to existing 7 core blocks (scaffold operates on NEW blocks only).
- One targeted edit to `scripts/emit-block-tools.impl.ts` TARGETS registry per scaffold run (expected).
- PR 1: **zero** changes to `packages/core/src/events/index.ts` (SeldonEvent union edits ship in PR 2).
- PR 2: targeted edits to `packages/core/src/events/index.ts` per scaffold run (expected, via ts-morph).
- No new DB tables. No new runtime paths through the event bus.

### Foundation-reach note

PR 1 establishes scaffolding infrastructure — file generation templates, future-proof file writer, SKILL.md patterns for code-authoring workflows. **SLICE 4 (UI composition layer) may extend this infrastructure** to emit page scaffolds + Puck/Grapes component templates. This is an awareness note, NOT scope expansion for SLICE 2: PR 1's design choices should anticipate that the template engine will gain new renderers (for `.tsx` pages, Puck JSON configs, etc.) without structural refactor. Specifically:

- Keep the template engine's input shape (`BlockSpec`) extensible — add fields, don't restructure.
- Keep the file writer agnostic to file type — no BLOCK.md-specific paths in the writer.
- Keep validation-gate steps pluggable — SLICE 4 adds a page-render check without rewriting the gate orchestration.

These are free with good design. The note just makes the reach explicit so PR 1's code reviewer can push back on any choice that would paint SLICE 4 into a corner.

---

## 12. Out of scope

- **UI scaffolding.** Pages, Puck/Grapes blocks, form components — all SLICE 4.
- **Customer-facing page generation.** Landing pages, portal tiles — SLICE 4.
- **Business logic in tools.** Tool implementations are stubs with TODO markers.
- **Database schema generation.** Builders hand-author Drizzle schemas when persistence is needed.
- **Block installation UI.** Existing block-installer handles installation; the scaffold produces the source-level block, not the install wizard.
- **Cross-block integration synthesis.** Builders hand-wire consume relationships; the scaffold doesn't auto-discover interactions with other installed blocks.
- **Scaffold-from-existing-block ("clone this block"):** file as a polish follow-up once scaffold-from-NL is stable.
- **Marketplace publishing.** The scaffold produces a local block; marketplace publishing is out-of-slice.

---

## 13. Reference

### 13.1 Builds on SLICE 1

- `SubscriptionEntrySchema` → scaffold's `## Subscriptions` section output
- `reconcileBlockSubscriptions` → scaffolded blocks auto-install into workspaces
- `lib/subscriptions/handler-registry.ts` → scaffolded handler stubs register at import time

### 13.2 Distinct from SLICE 4 (UI composition)

SLICE 2 stops at backend. A scaffolded block has no pages, no UI components. SLICE 4 will extend the scaffold's template engine (per §11 foundation-reach note) with page renderers. Scaffold ↔ UI integration is a follow-up audit.

### 13.3 Informs SLICE 5 (workspace test mode)

If SLICE 5 ships a dry-run / sandbox mode for newly installed blocks, the scaffold's validation gate can hook into it: "scaffolded block → install in test mode → run smoke test → promote or rollback." Out of scope for SLICE 2.

### 13.4 Deferred work

- `tasks/follow-up-tools-naming-cleanup.md` — rename `intake.tools.ts` → `formbricks-intake.tools.ts` + `landing.tools.ts` → `landing-pages.tools.ts` and update references. ~1hr, nice-to-have.

---

## 14. Stop-gate

**APPROVED 2026-04-23.** All six gates resolved (§7). PR 1 scope (§8) + LOC target (§11) + discipline reminders acknowledged.

**PR 1 begins immediately after audit revision commits + pushes.** Expected 6-8 mini-commits:
1. BlockSpec schema + Zod validation
2. Template engine (BLOCK.md + tools.ts)
3. Template engine extensions (subscriptions stub + test stubs)
4. File writer + orphan detection
5. Validation gate orchestration
6. SKILL.md + skill-to-logic wiring
7. Scaffolded smoke-test block (`notes`) committed as part of close-out
8. Close-out (regression report + green bar + push)

**Stop after PR 1 green bar + push. Await Max approval for PR 2.**

---

## 15. Self-review changelog

**2026-04-23, post-draft (pre-gate-resolution):**
- §4 runtime-path enumeration explicitly distinguishes sequential pipeline from concurrent multipath; applies 1.6x as compromise multiplier with rationale documented. Future audits can re-use this framing for similar "pipeline-shaped" slices (migrations, generators, cron sweeps).
- §1.3 ground-truth captures the pre-existing `intake.tools.ts` / `landing.tools.ts` slug-drop inconsistency as G-3 gate, rather than silently picking a convention.
- §3.7 SeldonEvent union edit surfaced as G-2 because it's the single most load-bearing side effect and lands in a file outside `packages/crm/` — cross-package edits deserve explicit approval.
- §5 validation strategy enumerates 5 layers; G-5 picks which layers the MVP ships. Layering lets each additional check move up from polish-follow-up to MVP as builders report gaps.
- §8 PR split: PR 1 = deterministic core, PR 2 = LLM surface. This lets the LOC-heavy pipeline land before the judgment-heavy NL work.

**2026-04-23, post-gate-resolution:**
- §7 resolves all six gates with Max's approved decisions. G-1 shifts to SKILL-only (rejecting the audit's MCP-hybrid recommendation) — framing rationale in new §9 ("code-authoring workflow, not workspace-configuration").
- §4 multiplier rationale refined to a three-level interaction spectrum (1.3x / 1.6x / 2.0x) with explicit calibration feedback hook. Becomes the L-17 calibration standard if SLICE 2 validates it.
- New §9 framing section surfaces the code-authoring vs workspace-admin distinction that drives both G-1 and the rollback story.
- New §10 rollback story — explicit "orphan detection, not transactional rollback" design, rationale grounded in §9's git-is-the-envelope framing.
- §11 LOC revised to Max's approved numbers (PR 1 ~2,530 target, slice 4,760 total, triggers at 3,250 PR-level / 5,330 slice-level). Foundation-reach note anchors SLICE 4 extensibility.
- §13.4 adds pointer to `tasks/follow-up-tools-naming-cleanup.md` per G-3 resolution.
