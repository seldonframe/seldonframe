# Step 2b.1 — Composition contract v2: schema design + CRM block migration

**Date:** 2026-04-21
**Scope:** Scope 3 Step 2b.1 per `tasks/v1-master-plan.md` §0.5. Sprint slice `7.i.1`.
**Gate:** this audit must be approved before any code ships. Max's direction: "expect 1–2 rounds of adjustment on the audit doc before we lock the schema design."
**Out of scope:** migrating the remaining 5 blocks (that's 2b.2), any runtime changes beyond parser + validator, new MCP tools, UI changes.

---

## 1. v1 baseline — the 4-field composition contract as it exists today

All 7 shipped blocks carry a `## Composition Contract` section following the v1 shape (4 lines, simple key + comma-separated string array). Extracted verbatim below from the current files (post-2a.3).

### 1.1 CRM (`packages/crm/src/blocks/crm.block.md`)

```
produces: [contact.created, contact.updated, deal.stage_changed]
consumes: [workspace.soul.business_type, workspace.soul.customer_fields, workspace.soul.pipeline_stages, contact.email]
verbs: [track, remember, save, store, record, contact, deal, pipeline, stage, move, assign, tag, lead, customer, crm]
compose_with: [caldiy-booking, formbricks-intake, email, sms, payments, landing-pages, automation, brain-v2]
```

### 1.2 Cal.diy Booking (`packages/crm/src/blocks/caldiy-booking.block.md`)

```
produces: [booking.created, booking.completed, booking.cancelled, booking.rescheduled, booking.no_show]
consumes: [workspace.soul.business_type, workspace.soul.availability_timezone, workspace.soul.team_members, contact.id]
verbs: [book, schedule, appointment, availability, meeting, calendar, consultation, discovery call, reschedule, cancel, move, fetch]
compose_with: [crm, formbricks-intake, email, sms, payments, automation, brain-v2]
```

### 1.3 Email (`packages/crm/src/blocks/email.block.md`)

```
produces: [email.sent, email.delivered, email.opened, email.clicked, email.bounced, email.replied, email.suppressed, conversation.turn.received, conversation.turn.sent]
consumes: [workspace.soul.business_type, workspace.soul.tone, workspace.soul.mission, workspace.soul.offer, contact.id, contact.email, contact.firstName]
verbs: [send, email, reply, notify, message, conversation, qualify, nurture, reach out, speed to lead, follow up, welcome]
compose_with: [crm, caldiy-booking, formbricks-intake, sms, automation, brain-v2, payments]
```

### 1.4 SMS (`packages/crm/src/blocks/sms.block.md`)

```
produces: [sms.sent, sms.delivered, sms.replied, sms.failed, sms.suppressed, conversation.turn.received, conversation.turn.sent]
consumes: [workspace.soul.business_type, workspace.soul.tone, workspace.soul.mission, workspace.soul.offer, contact.id, contact.phone, contact.firstName]
verbs: [text, sms, message, reply, chat, qualify, speed to lead, follow up, reminder, confirm, book via text]
compose_with: [crm, formbricks-intake, caldiy-booking, email, automation, brain-v2, payments]
```

### 1.5 Payments (`packages/crm/src/blocks/payments.block.md`)

```
produces: [payment.completed, payment.failed, payment.refunded, payment.disputed, invoice.created, invoice.sent, invoice.paid, invoice.past_due, invoice.voided, subscription.created, subscription.updated, subscription.renewed, subscription.cancelled, subscription.trial_will_end]
consumes: [workspace.soul.business_type, workspace.soul.default_currency, contact.id, contact.email, contact.firstName, booking.id, booking.amount]
verbs: [invoice, bill, charge, collect, payment, subscribe, subscription, recurring, refund, cancel, dunning, past due, failed payment]
compose_with: [crm, caldiy-booking, email, sms, automation, brain-v2]
```

### 1.6 Formbricks Intake (`packages/crm/src/blocks/formbricks-intake.block.md`)

```
produces: [form.submitted, contact.created]
consumes: [workspace.soul.business_type, workspace.soul.customer_fields, contact.id, contact.email]
verbs: [intake, capture, collect, qualify, survey, ask, onboard, nps, feedback]
compose_with: [crm, caldiy-booking, email, sms, automation, brain-v2]
```

### 1.7 Landing Pages (`packages/crm/src/blocks/landing-pages.block.md`)

```
produces: [landing.published, landing.unpublished, landing.updated, landing.visited, landing.converted]
consumes: [workspace.soul.business_type, workspace.soul.services, workspace.soul.tone, workspace.soul.mission, workspace.soul.offer, workspace.soul.entity_labels, workspace.soul.journey_stages, workspace.theme.primary_color, contact.id]
verbs: [page, landing, website, publish, generate page, copy, homepage, squeeze, hero, cta, funnel, optin]
compose_with: [formbricks-intake, crm, caldiy-booking, email, sms, payments, automation, brain-v2]
```

### 1.8 v1 baseline summary

- 4 fields × 7 blocks = 28 string arrays. **Zero type information** — a `produces: [contact.created]` entry tells synthesis the event name but says nothing about payload shape; a block that `consumes: [contact.email]` gets no help confirming that the value it receives will be a string-typed email.
- `verbs` and `compose_with` are pure routing hints; v2 should not change them.
- The typed additions land on `produces` + `consumes` and on a new section that names the tools and their argument/output shapes. Verbs + compose_with stay as-is.

---

## 2. The three type additions in scope for v2

### 2.a — Typed tool inputs

**Problem today.** `skills/mcp-server/src/tools.js` declares tool schemas as plain JS objects with string descriptions (`str("Required. ISO 8601 timestamp…")`). The MCP SDK enforces presence/type at the boundary, but synthesis has no machine-readable schema for what a tool expects. Result: Claude hallucinates alias field names like `start_time` instead of `starts_at`. We saw this exact drift post-7.h and added a defensive alias at the API boundary:

```ts
// packages/crm/src/app/api/v1/bookings/route.ts (POST)
// `start_time` is a defensive alias added 2026-04-21 after the 7.h
// post-ship probe showed Claude-synthesized specs sometimes using
// `start_time` instead of the documented `starts_at`. The
// V1.1 composition-contract-schema-v2 (typed tool inputs) will
// subsume this alias by giving the synthesis prompt canonical
// arg names; until then, tolerate the drift at the API boundary.
start_time?: unknown;
```

**Target v2 shape.** Each tool used by a block declares its inputs in a typed form. The block's composition contract gains a `tools:` section listing the canonical tool entries; each entry carries `args` with field-level schema (name, type, required, description, `enum` if applicable, `format: "iso8601"` / `"uuid"` / `"email"` where relevant).

Conceptually — quoting CRM's `create_contact` as an example, **not final syntax**:

```yaml
tools:
  - name: create_contact
    description: Create a new CRM contact.
    args:
      first_name:
        type: string
        required: true
        description: Contact's first name.
      last_name:
        type: string
        required: false
        description: Contact's last name.
      email:
        type: string
        format: email
        required: false
        description: Contact email.
      status:
        type: string
        enum: [lead, prospect, customer]
        required: false
        default: lead
      workspace_id:
        type: string
        format: uuid
        required: false
    returns:
      contact:
        type: Contact
    emits: [contact.created]
```

The `emits:` pointer is the bridge to typed I/O (2.c) — this single tool declaration tells synthesis both "what args to pass" and "what event will fire after a successful call". This structure is what the 7.h BLOCK.md "MCP tools that emit these events" prose-pointer was trying to encode informally; v2 makes it machine-readable.

**What it fixes.**
- `starts_at` vs `start_time` drift — synthesis prompt includes canonical arg names, Claude doesn't invent.
- Agent-spec validation can type-check `args:` against the declared schema before runtime ever sees a malformed call.
- Tool catalog documentation derives from a single source of truth (currently split between `tools.js` handlers and free-text BLOCK.md prose).

### 2.b — Typed conversation exits

**Problem today.** Conversations use a freeform exit-when string:

```ts
// packages/crm/src/lib/agents/archetypes/win-back.ts (excerpt)
{
  id: "qualify_conversation",
  type: "conversation",
  channel: "sms",
  initial_message: "$openingMessage",
  exit_when: "$qualificationCriteria",          // string placeholder
  on_exit: {
    extract: {                                   // untyped object
      preferred_start: "ISO-8601 datetime for the preferred appointment start…",
      insurance_status: "one of: yes | no | unsure | not_asked",
    },
    next: "book_consultation",
  },
}
```

No `ConversationExit` TypeScript type exists anywhere in the repo (confirmed via grep — see Section 4). `exit_when` resolves at synthesis time to NL text Claude writes; the runtime decides when the exit fires by prompting a second Claude call with that NL text. `extract:` field descriptions are plain strings — nothing type-checks that `preferred_start` ends up as an ISO string or that `insurance_status` stays within its enum.

**Target v2 shape.** `ConversationExit` is a tagged union, each variant carrying structured predicate data:

```ts
type ConversationExit =
  | { type: "predicate"; predicate: ExitPredicate; extract: Record<string, ExtractField>; next: string | null }
  | { type: "timeout"; after: Duration; extract?: Record<string, ExtractField>; next: string | null };

type ExitPredicate =
  | { kind: "field_equals"; field: string; value: string | number | boolean }
  | { kind: "field_contains"; field: string; substring: string }
  | { kind: "field_exists"; field: string }
  | { kind: "event_emitted"; eventType: string }   // e.g. "booking.created" fires during conversation
  | { kind: "all"; of: ExitPredicate[] }
  | { kind: "any"; of: ExitPredicate[] };

type ExtractField = {
  type: "string" | "number" | "boolean" | "enum" | "iso8601";
  enum_values?: string[];          // for type=enum
  required: boolean;
  description: string;             // the NL hint Claude uses when extracting
};
```

**Scope-cut against 2e.** `external_state` — e.g., "has `review.submitted` fired for this contact in the last 48h?" — is explicitly **not** an exit predicate. It's a branch condition and it belongs to 2e (conditional-on-external-state branching). See Section 9 for the boundary.

**What it fixes.**
- Review Requester upgrade path (listed in Scope 3 Step 3a as "UPGRADE to use `external_state` branch") becomes cleanly expressible — but through a `branch` step owned by 2e, not through a conversation exit owned by 2b.1.
- Validator can reject `exit_when` predicates that reference fields not present in `extract:` (today that's silent drift).
- `extract:` fields become typed sources for downstream `{{interpolation}}`, so downstream tool-call arg type-checks (2.a) can verify shape consistency end-to-end.

### 2.c — Typed block I/O

**Problem today.** `produces: [contact.created]` gives synthesis an event name. When another block `consumes: [contact.created]`, synthesis has no way to verify that the producer actually emits what the consumer expects. The `SeldonEvent` union in `packages/core/src/events/index.ts` DOES define payload shapes, but the composition contract doesn't reference it:

```ts
// packages/core/src/events/index.ts
| { type: "contact.created"; data: { contactId: string } }
| { type: "booking.rescheduled"; data: {
    appointmentId: string;
    contactId: string | null;
    previousStartsAt: string;
    newStartsAt: string;
  } }
```

The union is the source of truth but the contract doesn't reach across.

**Target v2 shape.** `produces` + `consumes` entries gain type pointers. Events reference the `SeldonEvent` union by name; non-event inputs (soul fields, trigger payloads) reference named shape types:

```yaml
produces:
  - event: contact.created
    # Type is resolved from packages/core/src/events/index.ts SeldonEvent union;
    # validator checks this name exists there.

consumes:
  - event: form.submitted
    # Runtime subscribes to this event when this block acts as a downstream.
  - soul_field: workspace.soul.business_type
    type: string
  - soul_field: workspace.soul.customer_fields
    type: "Array<{ key: string; label: string; type: 'text' | 'number' | 'enum' }>"
  - trigger_payload:
      contactId: { type: string, format: uuid }
      firstName: { type: string, required: false }
```

Plus **typed tool-call captures** — the Win-Back `capture: "coupon"` binding (`packages/crm/src/lib/agents/archetypes/types.ts` line 25–32) that lets downstream steps reference `{{coupon.code}}` needs a typed output schema on the tool declaration (2.a's `returns:` field). Without it, `{{coupon.couponCode}}` (wrong field name) compiles today but fails at runtime.

**What it fixes.**
- A block that `consumes: [form.submitted]` and a block that `produces: [form.submitted]` validate end-to-end: the consumer's expected `formId: string` matches the producer's emitted `formId: string`.
- The 7.h-era "MCP tools that emit these events" prose-pointer becomes machine-checked.
- Win-Back's `capture: "coupon"` gains a type — validator catches `{{coupon.code}}` vs `{{coupon.couponCode}}` drift at synthesis time.
- Agent-spec validator can propagate types through: trigger payload → conversation extract → tool-call arg → tool output capture → downstream tool-call arg, refusing any step where the type chain breaks.

---

## 3. Migration strategy — backward-compatible extension

**Recommendation: backward-compatible extension.** v1 contracts keep parsing; v2 fields are additive and optional. A block with only v1 fields still parses; the validator reports "legacy_contract" as an informational warning (not an error) and synthesis runs with the existing string-only logic. A block with v2 fields gets the stricter type-checked synthesis path.

**Tradeoff analysis:**

| Option | Pros | Cons |
|---|---|---|
| **Backward-compatible (recommended)** | 7 blocks migrate independently in 2b.2 without coordinating a cut-over. If 2b.1 surfaces a schema problem, in-flight blocks aren't stranded. Third-party blocks (V1.1 GTM) keep working on legacy. | Parser complexity temporarily doubles (two code paths). Must remove the v1 fallback in a post-launch cleanup (we'll carry a TODO marker). |
| **Breaking cut-over** | Simpler parser — one code path. | 7 simultaneous block edits; any parse/validator bug stalls the whole sprint. Regression blast radius is max. Forces 2b.2 to land in one commit; Scope 3 discipline expects "one block at a time with regression tests between each". |

Backward-compat is the right call because the sprint plan already commits to "migrate Booking, Email, SMS, Payments, Intake, Landing one at a time with regression tests between each" (master plan §0.5 Step 2b.2). Breaking cut-over is incompatible with that cadence. The parser-complexity cost is bounded: the v1 path is small (~60 LOC today) and stays small.

**Compatibility rules the parser must enforce:**
1. Bare `produces: [name, name]` — parse as v1 string array.
2. List-of-maps `produces: - event: name` — parse as v2 typed entries.
3. Mixed within a single `produces:` field is rejected at parse time (forces a clean per-block migration).
4. Other v1 fields (`consumes`, `verbs`, `compose_with`) follow the same rules.
5. A v2-shaped block without a `tools:` section still parses (tools may come in a follow-up slice).

---

## 4. Parser + validator changes — file-by-file

### 4.1 Parser — `packages/crm/src/lib/blocks/block-md.ts`

- **Current state:** 913 LOC. Parser is one file; composition-contract parsing is ~60 LOC (`parseCompositionLine` lines 683–706, `parseCompositionContract` lines 708–745). Type definition `BlockMdCompositionContract` at lines 75–91.
- **v2 additions:**
  - Extend `BlockMdCompositionContract` with optional v2-shaped fields (`producesTyped?`, `consumesTyped?`, `tools?`). Keep `produces: string[]` etc. populated even when the v2 form is present, so downstream code that only needs names keeps working without a branching read.
  - Add a YAML/nested-list detector inside `parseCompositionContract`: if a field starts with a `-` nested bullet shape, dispatch to a v2 sub-parser rather than `splitCommaList`.
  - Add a `tools:` section parser — new function `parseToolsSection` matching the shape in §2.a.
  - Reject mixed v1/v2 within one field (rule #3 above).
- **Estimated LOC:** +180 LOC parsing logic + ~40 LOC type definitions = ~220 LOC net to `block-md.ts`, bringing it to ~1,130 LOC. Borderline; consider splitting v2-specific logic into `block-md-v2.ts` if the file crosses 1,200.

### 4.2 Composition-contract validator — `packages/crm/src/lib/blocks/block-md.ts` (`validateCompositionContract`, lines 772–836, ~65 LOC today)

- **Current state:** checks event-name format, verb length, block-slug references, empty-contract warning.
- **v2 additions:**
  - Validate `producesTyped[i].event` exists in the `SeldonEvent` union (requires a registry lookup or a build-time generated list; see open decision #3).
  - Validate `consumesTyped[i]` shapes resolve (soul fields match known soul schema, trigger-payload types are well-formed).
  - Validate `tools[*].emits` references point at events listed in this block's `produces`.
  - Validate `tools[*].args[*]` schemas are well-formed (no duplicate arg names, enum entries are strings, required fields don't carry defaults).
  - Emit a new `legacy_contract` warning when a block has v1-only fields (informational, not blocking).
- **Estimated LOC:** +120 LOC = ~185 LOC total for the validator.

### 4.3 Agent-spec validator — new file `packages/crm/src/lib/agents/validator.ts`

- **Current state:** **does not exist.** `validateAgentSpec` is not yet defined; `ArchetypeSpecTemplate = Record<string, unknown>` in `packages/crm/src/lib/agents/archetypes/types.ts` line 62. Synthesis today relies on the runtime to catch malformed specs; there is no synthesis-time type check.
- **v2 additions (scope for this slice):**
  - Parse the filled AgentSpec JSON into typed step representations (`ConversationStep`, `McpToolCallStep`, `BranchStep`, `AwaitEventStep` placeholders).
  - For each `McpToolCallStep`, look up the tool's v2 arg schema in the block registry and verify `args:` conforms (required fields present, types match, enum values valid, `{{interpolation}}` sources resolve).
  - For each `ConversationStep`, validate `on_exit.extract` fields against the typed-exit shape (§2.b).
  - For `capture:` bindings, validate that downstream `{{<name>.<field>}}` references resolve against the tool's typed `returns:` shape (§2.a).
  - Return a list of violations with step id + path + message. Zero violations = spec is type-clean.
- **Estimated LOC:** ~200 LOC for the first cut. Intentionally narrow: only checks 2b.1's three type additions. Doesn't type-check `branch.condition.type: "external_state"` (that's 2e) or `await_event` (2c). Doesn't validate schedules (2d).

### 4.4 Totals

- Parser + composition validator: +~340 LOC inside `block-md.ts` (or split, see 4.1).
- New agent-spec validator: +~200 LOC in a new file.
- No runtime changes. No new MCP tools. No UI changes.
- **Net estimate: ~540 LOC code + ~250 LOC test + docs for the slice.**

---

## 5. CRM migration plan — why CRM is the pattern validator

CRM is the simplest shipped block (fewest entities, fewest events, no external integrations) AND it's the only block that appears in every other block's `compose_with`:

- Booking `compose_with: [crm, …]`
- Email `compose_with: [crm, …]`
- SMS `compose_with: [crm, …]`
- Payments `compose_with: [crm, …]`
- Intake `compose_with: [crm, …]`
- Landing `compose_with: [crm, …]`

If v2 can express CRM cleanly, the shape holds for the 6 downstream migrations in 2b.2. If it can't, we catch the schema problem at slice-1 rather than 5 slices deep with a half-migrated codebase.

**What the CRM v2 migration includes:**
1. Rewrite `crm.block.md` `## Composition Contract` to v2 shape — typed `produces` referencing the `SeldonEvent` union, typed `consumes` for soul fields and contact shape, and a `tools:` section for the 12 CRM MCP tools (list_contacts, create_contact, update_contact, delete_contact, get_contact, add_tag, remove_tag, merge_contacts, list_deals, create_deal, update_deal, move_deal_stage).
2. Keep v1 fields populated (per backward-compat rule above) so any legacy consumer keeps working during the sprint.
3. Run the new composition-contract validator — CRM block should report zero errors, zero warnings.
4. Run the new agent-spec validator against Speed-to-Lead / Win-Back / Review Requester — each of these archetypes references `create_contact` / `create_deal` / `create_activity` indirectly, and the validator should confirm the arg shapes line up.

**Gate:** CRM migration proves the pattern holds. If a v2-specific shape issue surfaces (e.g., the typed `consumes: [contact.email]` doesn't cleanly express that some consumers want the email string and others want the full contact record), **stop and fix the schema before advancing to 2b.2.**

---

## 6. Regression surface

### 6.1 Shipped archetypes that reference CRM

All three shipped archetypes (`packages/crm/src/lib/agents/archetypes/{speed-to-lead,win-back,review-requester}.ts`) reference CRM in composition, either explicitly through tools (`create_activity`, `list_deals`) or implicitly through contact-trigger payloads. They're the regression surface that must re-synthesize clean under v2.

| Archetype | Direct CRM tools used | CRM-shaped data referenced |
|---|---|---|
| **Speed-to-Lead** | `create_activity` (log booking) | `contact.id`, `contact.email`, `contact.firstName` via trigger payload |
| **Win-Back** | `create_activity` | `contact.id`, `contact.email`, `contact.phone` via trigger payload |
| **Review Requester** | `create_activity` | `contact.id`, `contact.firstName`, `contact.email`, `contact.phone` via trigger payload |

### 6.2 Synthesis probes

`scripts/phase-7-spike/probe-archetype.mjs` + `run-live.mjs` run each archetype 3× (determinism check) and 5× (grounding check). Probe fixtures live in `tasks/phase-7-archetype-probes/` (`.prompt.txt`, `.raw.txt`, `.filled.json`, `.report.md` per archetype).

### 6.3 The "pass 3x with no degradation" criterion (from §0.5 ship criteria)

After CRM v2 migration, all three archetypes must re-probe **3× PASS each** with:
- Same or better grounding (100% is the bar; degradation is a fail).
- Same or better determinism (step-sequence hash stable across runs).
- Cost ≤ current baseline + 15% (typed prompts are longer; some increase is expected — >15% means we overran the typed-schema prompt budget and need to compress).
- Latency ≤ current baseline + 20%.

If any archetype degrades, that signals the v2 schema creates more synthesis confusion than it resolves, and we iterate on the schema design before touching the other 5 blocks.

### 6.4 Typecheck baseline

`packages/crm` currently surfaces 4 pre-existing type errors (`public-booking-form.tsx` × 2, `sonner.tsx` × 1, `payments/actions.ts` × 1). These are unrelated to this slice but they're the baseline — 2b.1 must not add new errors. Same discipline as 2a.

### 6.5 Files likely to need updating beyond `block-md.ts`

- `packages/crm/src/lib/agents/archetypes/types.ts` — `ArchetypeSpecTemplate` replaced with typed `AgentSpec` (or kept alongside and deprecated).
- `packages/crm/src/lib/soul-compiler/blocks.ts` — block-registration path may need to surface v2 fields for synthesis prompt context.
- `scripts/phase-7-spike/synthesis.mjs` — synthesis prompt probably gains v2 schema context (tools + events referenced by contract).

Each touched file is an amendment, not a rewrite. No migrations drop or rename anything.

---

## 7. Open decisions to gate before code ships

### 7.1 Zod vs JSON Schema vs TypeScript-string DSL

Three plausible shapes for typed tool inputs / block I/O:

| Approach | Shape | Pros | Cons |
|---|---|---|---|
| **Zod** | `z.object({ first_name: z.string(), email: z.string().email().optional() })` | Single source of truth — same schema validates at synthesis AND runtime. Excellent TypeScript inference. Battle-tested in the project (already used in `packages/crm/src/lib/utils/validators.ts`). | Zod is JS — the BLOCK.md has to reference schemas by name, not embed them. Means schemas live in code, not in the block's markdown. |
| **JSON Schema** | `{ "type": "object", "properties": { "first_name": {"type": "string"} }, "required": ["first_name"] }` | Embeds in the BLOCK.md directly (YAML/JSON block). Language-agnostic — third-party tooling can consume. | Verbose. No TypeScript inference. Need a separate compiler to Zod for runtime enforcement. |
| **TypeScript-string DSL** | `first_name: string, email?: email` in BLOCK.md; parser translates to Zod at load time | Most readable in BLOCK.md. Compact. | Another parser to build + maintain. Non-standard — third parties can't consume without our parser. |

**Recommendation:** JSON Schema in BLOCK.md, with a small compiler that emits Zod at load time. Rationale: BLOCK.md must be self-contained for third-party block authoring (V1.1 GTM), which rules out Zod-in-code. DSL would be cleaner to read but another parser is unjustified scope for 2b.1. Once we have Zod at runtime, agent-spec validator + composition-contract validator share the same type machinery.

**Gate item:** Max to confirm JSON Schema approach, or overrule with a different choice. The other two sections of this audit assume JSON Schema; a different choice pushes ~60 LOC of diff.

### 7.2 Where do typed conversation exit predicates live?

Two reasonable homes:

- **In `packages/core/src/agents/`** — alongside a future `AgentSpec` type definition. Mirrors how `SeldonEvent` sits in `packages/core/src/events/`. The shape is a primitive that multiple blocks might reference.
- **In `packages/crm/src/lib/agents/`** — colocated with archetypes + validator. Simpler for 2b.1; `packages/core` doesn't yet have an `agents/` subdirectory.

**Recommendation:** `packages/crm/src/lib/agents/types.ts` for 2b.1. Promote to `packages/core/src/agents/` when (and if) a second consumer shows up (likely 2c when `await_event` needs the same predicate primitives — see §9). Don't pre-promote.

**Gate item:** confirm lazy promotion vs eager promotion. If Max wants it in core upfront, add a day to move files.

### 7.3 How does the validator resolve event payload types?

Today `SeldonEvent` is a TypeScript union. The validator needs a runtime-queryable version. Three options:

- **Build-time codegen:** emit `event-registry.json` from `SeldonEvent` on build. Validator reads the JSON. Clean at runtime but adds a build step.
- **TypeScript compiler API:** validator invokes `ts.Program` and introspects the union type. Zero codegen but slow, and adds `typescript` as a runtime dep.
- **Hand-maintained parallel JSON registry:** add `packages/core/src/events/event-registry.json` with the same shapes, guard drift with a test that imports both and diffs. Simple but fragile.

**Recommendation:** codegen option. 5 min of work inside `pnpm build` to emit the registry; validator stays fast; TS union remains the source of truth.

**Gate item:** confirm codegen.

### 7.4 Migration sequencing inside 2b.1 — one PR or multiple?

Two paths:

- **Single PR:** parser → composition validator → agent validator → CRM migration → regression pass, all in one diff. One review, atomic rollback.
- **Multiple PRs (sequential):** (a) parser + composition validator, (b) agent validator, (c) CRM migration + regression. Three reviews, three merge moments, easier to bisect if something breaks.

**Recommendation:** multiple PRs. Sprint discipline from §0.5: "If 2b.1 surfaces schema problems, they get fixed before 5 more blocks migrate." Splitting the PR means (a) lands and runs in production-ish shape before (c) — if (a) breaks existing v1-only synthesis, we catch it with the Speed-to-Lead probe before the CRM migration even starts. Atomicity of a single PR has no business-continuity benefit because 2b.1 doesn't change the user-facing surface.

**Gate item:** confirm the 3-PR split. If Max wants one PR, shrink the regression suite (still non-negotiable at the slice end).

---

## 8. Success criteria for 2b.1

1. **CRM block parses cleanly under v2.** `parseBlockMd('crm.block.md')` returns a populated `BlockMdCompositionContract` with both v1 fields and v2-typed fields filled. No warnings.
2. **Parser handles v1 and v2 without regression.** The 6 other blocks (still on v1 shape until 2b.2 migrates them) parse unchanged. Each reports exactly one `legacy_contract` informational warning; no errors.
3. **Composition-contract validator surfaces clean errors.** Seeded-bad CRM BLOCK.md test cases (malformed event name, unknown event in the `SeldonEvent` union, `tools[*].emits` referencing an event missing from `produces`) produce targeted messages with line-level context.
4. **Agent-spec validator works end-to-end.** Filled AgentSpec JSON from Speed-to-Lead / Win-Back / Review Requester validates clean. A seeded bad spec (wrong arg name, wrong enum value, unresolved interpolation) fails with a specific message.
5. **Synthesis probes pass 3× each, no degradation.** Re-probed Speed-to-Lead, Win-Back, Review Requester pass determinism + grounding bars (§6.3). Cost + latency within +15% / +20% of baseline.
6. **Typecheck baseline holds.** Exactly 4 pre-existing errors on `packages/crm`. Zero new errors attributable to this slice.
7. **Backward-compat guarantee documented.** A `legacy_contract` warning catalog entry describes the v1→v2 migration path for block authors. BLOCK_MD_SPEC.md updated with v2 grammar.
8. **2b.2 kick-off is unblocked.** The v2 schema, parser, and validator are stable enough that the Booking / Email / SMS / Payments / Intake / Landing migrations in 2b.2 are pattern-application work, not schema-design work.

---

## 9. Boundary with 2e — typed conversation exits vs external-state branching

2b.1's typed conversation exits (§2.b) overlap in spirit with 2e's external-state branching (§0.5 master plan: `branch.condition.type: "external_state"` with safe query shapes). Max asked us to explicitly call the boundary, and if ambiguous, propose a split.

### 9.1 The two use cases that look similar

- **Case A (belongs to 2b.1):** Speed-to-Lead's qualify_conversation — "exit when the contact has answered `preferred_start` AND `insurance_status`". The conversation step itself decides when to end based on **what was extracted inside the conversation**.
- **Case B (belongs to 2e):** Review Requester upgrade — "before sending the SMS reminder, check whether `review.submitted` already fired for this contact in the last 48h; skip the SMS if so." The decision is based on **state outside the current conversation** (the event-bus history / a DB query).

### 9.2 The proposed split

- **2b.1 scope:** typed exit predicates that operate on **in-conversation state** — extracted fields (`field_equals`, `field_contains`, `field_exists`), events that fire during the conversation (`event_emitted` limited to events flagged as "conversational" — `booking.created`, `form.submitted` — that naturally resolve a qualify flow), timeouts, and composite `all`/`any` of the above. No external DB/history queries.
- **2e scope:** `branch.condition.type: "external_state"` — **post-conversation** decision logic that queries external state via a safe, restricted query shape (no arbitrary SQL, no arbitrary field reads). Branch steps are distinct from conversation steps; they run between other steps, not as a termination of a conversation.

This split mirrors the step-type distinction already in AgentSpec (`type: "conversation"` vs `type: "branch"`). 2b.1 types the `conversation` step's exit. 2e types the `branch` step's condition.

### 9.3 The shared primitive

`ExitPredicate` (§2.b) and the 2e branch condition will share most of the same variants (`field_equals`, `field_contains`, `all`, `any`). The implementation plan for 2b.1 should:

1. Define `Predicate` as the shared primitive (no "Exit" prefix in the type name).
2. Export `ConversationExit` as `{ type: "predicate"; predicate: Predicate; ... }` — the conversation-step wrapper.
3. Leave the 2e branch step to consume the same `Predicate` when it ships.
4. Add **one** variant that's explicitly 2b.1-only: `event_emitted` with a "conversational event" allowlist (`booking.created`, `form.submitted`, others TBD). 2e's `external_state` is a different variant that doesn't exist yet.

This keeps 2b.1's typed-exits work self-contained while leaving 2e's scope clear — 2e adds `external_state` + restricted query shapes on top of the already-typed `Predicate`, rather than designing branching from scratch.

### 9.4 Ambiguity flag

**One edge case to resolve before code ships:** Review Requester's current "suppress SMS when review.submitted fires" pattern. Is this:

- (a) A conversation-exit-shaped thing — the "reminder conversation" exits early if the event fires? **No** — Review Requester is a trigger-driven automation, not a conversation. It runs: trigger (`booking.completed`) → send_email → wait → send_sms. The question "did they already review?" is injected BEFORE send_sms, not inside a conversation.
- (b) A branch-step condition — that's where the check belongs. `branch { condition: { type: "external_state", event: "review.submitted", window: "48h" }, true_next: "stop", false_next: "send_review_sms" }`. **Yes** — this is 2e territory.

So Review Requester's upgrade waits on 2e, not 2b.1. 2b.1 ships the typed exits for conversation steps (Speed-to-Lead and future Appointment Confirmer are the main users). Review Requester's remaining limitation stays limitation-flagged until 2e lands.

---

## 10. Implementation plan (post-approval)

After audit approval:

- **PR 1 — Schema + parser + composition validator** (`7.i.1.a`): v2 type definitions, extended `parseCompositionContract`, extended `validateCompositionContract`, JSON Schema → Zod compiler. No BLOCK.md changes. Green: all 7 blocks parse clean with a single `legacy_contract` warning each; seeded-bad test fixtures produce targeted validator errors.

- **PR 2 — Agent-spec validator** (`7.i.1.b`): new `packages/crm/src/lib/agents/validator.ts`, typed AgentSpec / ConversationExit / Predicate primitives in `agents/types.ts`, Predicate as the shared primitive exported for 2e. Green: seeded-good AgentSpec fixtures from all 3 shipped archetypes validate clean; seeded-bad fixtures fail with specific messages.

- **PR 3 — CRM migration + regression pass** (`7.i.1.c`): rewrite `crm.block.md` Composition Contract + add `tools:` section. Re-run probe-archetype for Speed-to-Lead / Win-Back / Review Requester 3× each. Green: zero degradation on all metrics; ship criteria §8 all satisfied.

Stop after PR 3 lands + all probes green. Await Max's approval of 2b.1 results before starting 2b.2 (remaining 5 blocks).

---

## 11. Stop-gate

This audit is the gate. **No code until approved.** Expected flow:

1. Max reviews this document.
2. Revision rounds (Max estimated 1–2) adjust the schema shape, open-decision answers, or section boundaries.
3. On approval, PR 1 of Section 10's plan starts. Not before.

Questions surfaced above that explicitly need Max input:
- §7.1 — JSON Schema vs Zod vs DSL
- §7.2 — Predicate primitive location (packages/core vs packages/crm)
- §7.3 — Event-registry resolution approach (codegen)
- §7.4 — Single PR vs 3 PRs
- §9.4 — Confirmation that Review Requester's SMS-suppression upgrade waits on 2e, not 2b.1

All other decisions in this audit are my defaults; Max can overrule any before implementation starts.
