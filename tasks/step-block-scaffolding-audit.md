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

That's well over the 3+ threshold. **L-17 calibration: apply 2.0x multiplier to test-LOC portion.**

Caveat: these paths are SEQUENTIAL (pipeline stages), not CONCURRENT (like emit + cron + install in SLICE 1 PR 2). Combinatorial coverage ISN'T as heavy — a pipeline only needs edge-case coverage at each seam, not cross-path interaction tests.

**Audit judgment:** apply 1.6x test-LOC multiplier for SLICE 2 — between the 1.3x single-path and 2.0x concurrent-multipath defaults. Documented here so the first LOC surprise has a clear record. If the first PR ships and actuals diverge from 1.6x, calibrate L-17 further.

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

## 7. Gate items (open decisions)

### G-1 — Invocation shape

Three options (from §1.4 table):

**Option A (recommended):** Hybrid — MCP tool `scaffold_block` is the deterministic generator; SKILL.md instructs Claude Code to invoke it on NL. Best test coverage + natural UX.

**Option B:** SKILL.md-only. Claude Code's LLM generates the files directly per instructions. No deterministic layer. Fastest to ship, weakest to test.

**Option C:** CLI-only (`pnpm scaffold:block "…"`). Good deterministic test coverage, poor UX — builders don't think in shell arguments.

**Decision needed:** which option ships in PR 1?

### G-2 — SeldonEvent union edits

The scaffold MUST mutate `packages/core/src/events/index.ts`. Two approaches:

**Option A:** Text-splice at the end of the union (before the terminating `;`). Deterministic, simple, requires regex-based insertion point detection.

**Option B:** AST edit via `ts-morph` or `@babel/parser`. Safer (handles comments and formatting) but adds a dependency + complexity budget.

**Option C:** Emit a warning + print the patch, ask the builder to apply manually. Safest, worst UX.

**Decision needed:** A vs B vs C.

### G-3 — File-naming convention for tools.ts

Repo inconsistency at HEAD: `formbricks-intake.block.md` → `intake.tools.ts`; `landing-pages.block.md` → `landing.tools.ts` (slug-drop); other 5 match exactly.

**Option A:** Scaffold enforces exact match (`<slug>.tools.ts`). Inconsistent with 2 of 7 existing blocks but simpler + more predictable.

**Option B:** Scaffold uses the existing heuristic (strip prefix word if compound). Matches the existing shorthand but harder to explain.

**Option C:** Scaffold enforces exact match AND ships a repo-cleanup commit renaming intake.tools.ts → formbricks-intake.tools.ts + landing.tools.ts → landing-pages.tools.ts. Out-of-slice cleanup; could be its own follow-up ticket.

**Decision needed:** A, B, or A+C.

### G-4 — Clarifying-question policy

When NL intent is ambiguous (e.g., "build me a satisfaction scores block" — what events? what tools? does it subscribe to anything?), the scaffold can:

**Option A:** Ask clarifying questions up-front. Conversational, slow, requires tight LLM-agent interaction design.

**Option B:** Generate sensible defaults and flag them as `// TODO` in the scaffold. Fast, builder edits after.

**Option C:** Fail on under-specified intent with a helpful "please provide …" message. Predictable, worst UX.

**Audit recommendation:** Option B for MVP, with the scaffold marking every default with `// TODO (scaffold-default):` so the builder can grep for them. Option A is a natural polish follow-up.

**Decision needed:** confirm B, or choose otherwise.

### G-5 — Validation gate depth

What counts as "scaffold succeeded"?

**Option A (narrow):** Parser round-trip + TypeScript compile. Fast (<5s). Catches most shape errors. Misses runtime wiring problems.

**Option B (medium):** A + `pnpm emit:blocks` + event-registry check. ~20s. Catches all static-shape errors including TOOLS-block round-trip + SeldonEvent drift.

**Option C (wide):** B + `pnpm test:unit --run=blocks/<slug>`. ~40s. Catches smoke-test failures too.

**Audit recommendation:** Option B for MVP. Option C is a polish follow-up.

**Decision needed:** confirm B, or choose otherwise.

### G-6 — Scaffolded tests content

Per Max's rescope reminder ("Validation bar: compile? typecheck? smoke test?"):

Does the scaffold also generate a test file? Options:

**Option A:** Yes — one smoke test per tool ("create_score accepts valid args"). Enforced coverage floor.

**Option B:** No — leave test-authoring to the builder. Lower scaffold LOC; relies on builder discipline.

**Option C:** Yes, but only a single sanity test per block ("tools register; types compile"). Middle ground.

**Audit recommendation:** Option C. One block-level smoke test lets the scaffold claim "it compiles AND there's a passing test" without over-specifying what to test (business-specific tests belong to the builder).

**Decision needed:** A, B, or C.

---

## 8. Proposed PR split

### PR 1 — Scaffold core (MVP backend scaffolding)

Scope:
- BlockSpec schema + Zod validation.
- Template engine for BLOCK.md + tools.ts + subscription stub.
- File writer with rollback-on-failure.
- Validation gate (whatever G-5 resolves to).
- MCP tool `scaffold_block` calling the above (assuming G-1 = Option A).
- SKILL.md section instructing Claude Code to invoke it.
- Tests: unit per module + one integration ("scaffold a realistic block → all validation passes").

**Out of PR 1 (PR 2):**
- SeldonEvent union editing (if G-2 = B, AST work is a whole separate unit).
- Intent parsing (LLM → BlockSpec) — ships in PR 2 as the first real user-facing surface.
- Workspace install-time wiring beyond what SLICE 1 C4 already handles.

### PR 2 — Intent parsing + NL surface

Scope:
- LLM prompt template for "NL intent → BlockSpec".
- Clarifying-question policy (G-4's choice).
- SeldonEvent union edit (G-2's choice).
- End-to-end smoke test ("a realistic NL intent produces a valid block").

**Split rationale:** PR 1 is deterministic + testable without the LLM surface; PR 2 adds the LLM layer on top. This lets PR 1 ship with high confidence and PR 2 iterate the NL quality separately.

---

## 9. LOC estimate with L-17 citation

**Runtime-path count:** 10 (§4). Multi-path.
**Multiplier applied:** 1.6x test-LOC (sequential pipeline, not concurrent multi-path; between 1.3x and 2.0x per §4 judgment).

**PR 1 (scaffold core):**

| Component | Production LOC | Test LOC (1.6x adjusted) |
|---|---|---|
| BlockSpec schema | 150 | 150 |
| Template engine (3 templates) | 300 | 400 |
| File writer + rollback | 150 | 200 |
| Validation gate | 200 | 300 |
| MCP tool wiring | 100 | 100 |
| SKILL.md section | 50 | 0 |
| Integration test | 0 | 250 |
| **Subtotal** | **950** | **1,400** |
| **PR 1 total** | | **~2,350** |

**PR 2 (NL + union edit):**

| Component | Production LOC | Test LOC (1.6x adjusted) |
|---|---|---|
| LLM intent parser | 200 | 300 |
| SeldonEvent union editor (assume G-2 = A, text-splice) | 150 | 250 |
| Clarifying-question flow | 200 | 200 |
| End-to-end integration | 0 | 300 |
| **PR 2 total** | | **~1,400** |

**Slice total:** ~3,750 LOC.

**Stop-and-reassess trigger:** 30% over = ~4,875 LOC.

**Containment expectations:**
- Zero changes to `lib/agents/types.ts`, `lib/blocks/contract-v2.ts`, `lib/subscriptions/*`.
- One targeted edit to `packages/core/src/events/index.ts` per scaffold run (expected, not an overrun).
- One targeted edit to `scripts/emit-block-tools.impl.ts` TARGETS registry per scaffold run.
- No new DB tables. No new runtime paths through the event bus.

**L-17 calibration note for future audits:** if PR 1 actuals diverge from the 1.6x multiplier prediction, update the L-17 addendum with the calibration data (underestimate or overestimate, and by how much).

---

## 10. Out of scope

- **UI scaffolding.** Pages, Puck/Grapes blocks, form components — all SLICE 4.
- **Customer-facing page generation.** Landing pages, portal tiles — SLICE 4.
- **Business logic in tools.** Tool implementations are stubs with TODO markers.
- **Database schema generation.** Builders hand-author Drizzle schemas when persistence is needed.
- **Block installation UI.** Existing block-installer handles installation; the scaffold produces the source-level block, not the install wizard.
- **Cross-block integration synthesis.** Builders hand-wire consume relationships; the scaffold doesn't auto-discover interactions with other installed blocks.
- **Scaffold-from-existing-block ("clone this block"):** file as a polish follow-up once scaffold-from-NL is stable.
- **Marketplace publishing.** The scaffold produces a local block; marketplace publishing is out-of-slice.

---

## 11. Reference

### 11.1 Builds on SLICE 1

- `SubscriptionEntrySchema` → scaffold's `## Subscriptions` section output
- `reconcileBlockSubscriptions` → scaffolded blocks auto-install into workspaces
- `lib/subscriptions/handler-registry.ts` → scaffolded handler stubs register at import time

### 11.2 Distinct from SLICE 4 (UI composition)

SLICE 2 stops at backend. A scaffolded block has no pages, no UI components. SLICE 4 will extend the scaffold to emit Puck page templates + React components. Scaffold ↔ UI integration is a follow-up audit.

### 11.3 Informs SLICE 5 (workspace test mode)

If SLICE 5 ships a dry-run / sandbox mode for newly installed blocks, the scaffold's validation gate can hook into it: "scaffolded block → install in test mode → run smoke test → promote or rollback." Out of scope for SLICE 2.

---

## 12. Stop-gate

**AUDIT ONLY.** No code until:
- G-1 through G-6 resolve (§7).
- Max confirms LOC estimate + L-17 multiplier choice (§9).
- Ground-truth findings in §1.3 are acknowledged (especially the `.tools.ts` naming inconsistency — G-3 resolution affects scaffold output).

Expected revision rounds: 1-2. First round likely clarifies G-1 and G-2 (the two highest-leverage decisions).

---

## 13. Self-review changelog (2026-04-23, post-draft)

- §4 runtime-path enumeration explicitly distinguishes sequential pipeline from concurrent multipath; applies 1.6x as compromise multiplier with rationale documented. Future audits can re-use this framing for similar "pipeline-shaped" slices (migrations, generators, cron sweeps).
- §1.3 ground-truth captures the pre-existing `intake.tools.ts` / `landing.tools.ts` slug-drop inconsistency as G-3 gate, rather than silently picking a convention.
- §3.7 SeldonEvent union edit surfaced as G-2 because it's the single most load-bearing side effect and lands in a file outside `packages/crm/` — cross-package edits deserve explicit approval.
- §5 validation strategy enumerates 5 layers; G-5 picks which layers the MVP ships. Layering lets each additional check move up from polish-follow-up to MVP as builders report gaps.
- §8 PR split: PR 1 = deterministic core, PR 2 = LLM surface. This lets the LOC-heavy pipeline land before the judgment-heavy NL work.
