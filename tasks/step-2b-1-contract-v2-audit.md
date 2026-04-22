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

**Important runtime caveat.** The archetype README explicitly notes: *"The 7.e runtime (not yet shipped) will honor this; the validator accepts the field as-is."* (`packages/crm/src/lib/agents/archetypes/README.md` line 147.) There is **no agent runtime in the repo today** — archetype specs are authored + validated at synthesis time + exported, but nothing executes them yet. This means 2b.1's typed-I/O benefit is **synthesis-time only**: the agent-spec validator catches `{{coupon.code}}` vs `{{coupon.couponCode}}` drift and refuses the spec, but the runtime enforcer lands with 7.e. The audit's "no runtime changes" constraint (§4 Totals) is consistent with this — 2b.1 does not need runtime work to deliver value, because catching drift at synthesis time is the failure mode that matters for agent generation quality.

**What it fixes (at synthesis time).**
- A block that `consumes: [form.submitted]` and a block that `produces: [form.submitted]` validate end-to-end: the consumer's expected `formId: string` matches the producer's emitted `formId: string`.
- The 7.h-era "MCP tools that emit these events" prose-pointer becomes machine-checked.
- Win-Back's `capture: "coupon"` gains a type — validator rejects specs that reference `{{coupon.couponCode}}` when the tool declares `couponId` + `code` (the drift we'd otherwise only discover once 7.e executes).
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

- **Current state:** 913 LOC. Parser is one file; composition-contract parsing is ~60 LOC (`parseCompositionLine` lines 686–706, `parseCompositionContract` lines 708–745). Type definition `BlockMdCompositionContract` at lines 75–91.
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
- **Estimated LOC:** ~300–400 LOC for the first cut (revised up from an initial ~200 estimate after factoring in interpolation resolution). **Re-corrected 2026-04-22 after PR 2 shipped:** the resolver alone is ~200+ LOC — validated by PR 2's implementation (walkSchemaPath with Zod wrapper unwrapping ~55 LOC, resolveOneInterpolation across 4 source kinds ~70 LOC, walkObjectStrings for nested args ~20 LOC, plus supporting scope/dispatch ~55 LOC = ~200 LOC on resolver alone). The original "~100 LOC on its own" estimate under-sized Zod's ceremony (ZodOptional/ZodNullable unwrapping, .shape introspection, 4 resolver cases with tailored error messages). Validator scope is still intentionally narrow: only checks 2b.1's three type additions. Doesn't type-check `branch.condition.type: "external_state"` (that's 2e) or `await_event` (2c). Doesn't validate schedules (2d).

### 4.4 Totals

**Corrected 2026-04-21 to align with §10.** Original draft allocated CRM Zod to PR 3; §10's per-PR scope is authoritative and puts CRM's `crm.tools.ts` in PR 1 (so the emit step has real input to operate on for tests). This table now matches §10.

**Per-PR breakdown:**

- **PR 1** (`7.i.1.a`): parser extension + Zod primitives + CRM Zod + emit step
  - Parser + composition validator extensions: +~340 LOC inside `block-md.ts`.
  - Zod primitive types (Predicate, ConversationExit, ExtractField, typed I/O primitives): ~80 LOC in new files.
  - CRM Zod schemas (13 tools × args + returns): ~50–80 LOC in new `crm.tools.ts`.
  - BLOCK.md emit step + drift-detector CI test: +~80 LOC.
  - **PR 1 net: ~640–820 LOC code + ~300 LOC tests.**
- **PR 2** (`7.i.1.b`): agent-spec validator
  - New `packages/crm/src/lib/agents/validator.ts`: +~300–400 LOC (interpolation resolver + step-type validators).
  - **PR 2 net: ~300–400 LOC code + ~150 LOC tests.**
- **PR 3** (`7.i.1.c`): CRM BLOCK.md migration + probe regression
  - Rewrite `crm.block.md` `## Composition Contract` to v2 shape (uses the Zod schemas authored in PR 1; no new Zod code).
  - Update synthesis prompt to surface v2 schemas for CRM.
  - **PR 3 net: ~100 LOC BLOCK.md + synthesis prompt + probe fixtures.**
- **Across 2b.1 total: ~1,000–1,300 LOC code + ~500 LOC tests.** No runtime changes. No new MCP tools. No UI changes.
- **2b.2 (out of scope — see correction below for updated LOC):** authors `.tools.ts` for the other 6 core blocks + migrates their BLOCK.md contracts.

### Post-PR 1 correction (2026-04-21, after PR 1 shipped as `625ec168`)

PR 1 actual: 1,484 LOC vs estimate 690–820. Primary miss: per-tool Zod LOC estimated at ~6 LOC (thin schemas) vs actual ~26 LOC (full schemas with args + returns + describes + refines). For 2b.2 scope planning, use **~25–30 LOC per MCP tool** as the baseline. 2b.2 LOC estimate corrected from ~300–500 LOC to **~1,600–2,400 LOC for Zod work alone** across 6 remaining blocks. Stop-and-reassess trigger recalibrated accordingly.

The stop-and-reassess discipline worked as intended: the trigger fired on C8 verification, I traced the overrun to line-items (primary miss = crm.tools.ts at 344 LOC), confirmed each component was the work §10 asked for (no scope drift), and surfaced the findings for approval before pushing. Max approved Option A (accept the overrun) because the miss was audit-estimation, not schema-design complexity. See L-17 in `tasks/lessons.md` for the durable takeaway.

**Stop-and-reassess trigger (approved 2026-04-21, baseline refreshed for PR 1):** PR 1's ceiling is **~690–820 LOC of code** (code only, tests excluded per the 30% rule being about design-complexity signal, not test verbosity). If PR 1 implementation exceeds that ceiling by >30% (i.e., >1,065 LOC of non-test code), **stop and surface for review before continuing.** A >30% overrun means the schema design has an unseen complexity we didn't catch at audit time, and shipping through it creates a bigger problem for 2b.2's six downstream block migrations. The right action is to pause, write a brief diagnosis, and either adjust scope or iterate the schema before continuing — not to push through and discover the issue mid-2b.2.

### Post-PR 2 correction (2026-04-22, after PR 2 shipped as `3a11186d`)

**PR 2 (`7.i.1.b`) actual: `validator.ts` at 600 LOC vs 300–400 estimate.** Primary miss: the Zod-shape walker (`walkSchemaPath` + `unwrapZodWrapper`) was under-sized. Audit said "~100 LOC on its own" for interpolation resolution; actual breakdown:

- `walkSchemaPath` + Zod wrapper unwrapping: ~55 LOC (ZodOptional / ZodNullable require explicit unwrap at every step; Zod v4 doesn't expose a single-shot helper).
- `resolveOneInterpolation` across 4 source kinds: ~70 LOC (each branch has a tailored error message because the audit named message quality as the validator's user-facing value).
- `walkObjectStrings` for nested args: ~20 LOC (Win-Back's `args.metadata.couponId` requires deep traversal).
- Scope-building + dispatch infrastructure: ~55 LOC.
- **Resolver layer total: ~200 LOC** (vs ~100 LOC audit estimate).

Additional miss: inline documentation (~140 LOC) was not budgeted but is load-bearing for future contributors reading the scope-builder ordering and data-unwrap conventions. Not padding — documentation of non-obvious invariants that prevent regression.

Stop-and-reassess trigger fired at 600 LOC (15% past the 520 threshold). Max approved Option A (accept the overrun) after line-item trace confirmed every component mapped to audit §2.a/§2.b/§2.c scope. Same pattern as PR 1: audit-estimation miss, not design complexity.

For 2b.2 scope planning, use as baselines:
- **~25–30 LOC per MCP tool** for Zod schemas (from PR 1).
- **~200+ LOC for interpolation / path resolvers** in validators (from PR 2).
- **~100+ LOC of inline documentation** for non-obvious invariants (scope ordering, data-unwrap conventions, reserved namespaces).

Validated against two PRs now rather than one. See L-17 in `tasks/lessons.md` for the extended lesson (two-PR confirmation).

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
1. Rewrite `crm.block.md` `## Composition Contract` to v2 shape — typed `produces` referencing the `SeldonEvent` union, typed `consumes` for soul fields and contact shape, and a `tools:` section for the **13 CRM MCP tools** (enumerated directly from `skills/mcp-server/src/tools.js`): 5 contact tools (`list_contacts`, `get_contact`, `create_contact`, `update_contact`, `delete_contact`), 6 deal tools (`list_deals`, `get_deal`, `create_deal`, `update_deal`, `move_deal_stage`, `delete_deal`), 2 activity tools (`list_activities`, `create_activity`).
2. Keep v1 fields populated (per backward-compat rule above) so any legacy consumer keeps working during the sprint.
3. Run the new composition-contract validator — CRM block should report zero errors, zero warnings.
4. Run the new agent-spec validator against Speed-to-Lead / Win-Back / Review Requester — each of these archetypes uses `create_activity` directly and references `contact.*` fields indirectly via trigger payloads. The validator should confirm the arg shapes line up.

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

### 7.1 Schema approach — LOCKED: Zod-authored, JSON-Schema-emitted

**Status: approved 2026-04-21.** This is the canonical approach. The three alternatives surveyed during audit drafting are preserved as decision lineage in Appendix A below.

**Canonical shape.** Author Zod schemas for each tool's args + returns in a TypeScript source file per block (e.g., `packages/crm/src/blocks/crm.tools.ts`). A build step calls `z.toJSONSchema()` and emits JSON-Schema blocks into the corresponding `<block>.block.md` under the `## Composition Contract` section. Runtime + validator consume the Zod source directly. BLOCK.md shows the JSON-Schema rendering for third-party readers.

**Approved reasoning (capture from approval message, 2026-04-21):**

1. **Single source of truth.** Zod schemas in TypeScript compile-check at build time, preventing BLOCK.md ↔ runtime drift. If the TS code refactors a field name, both the schema and the emitted BLOCK.md update atomically on next build.
2. **Bidirectional emission via `z.toJSONSchema()`** preserves third-party consumption — external agent authors read the emitted JSON-Schema in BLOCK.md without needing Zod as a dep.
3. **Runtime validation for free when 7.e ships.** The same Zod object the synthesis-time validator parses becomes the runtime enforcer once the agent runtime lands. No duplicate schema to maintain.
4. **Matches the existing Zod-heavy stack.** Zod already has 6 consumers in the repo (`packages/crm/src/lib/utils/validators.ts`, `lib/soul-compiler/schema.ts`, `lib/soul-compiler/anthropic.ts`, `lib/ai/soul-conversation.ts`, `lib/auth/actions.ts`, `app/(auth)/signup/actions.ts`). Adding this pattern reuses known idioms.
5. **Better error messages for non-technical users.** Zod's `z.string().email()` produces "Invalid email" by default and is customizable with `.describe()` / `.message()`; JSON-Schema error messages are more verbose and structural. The builder-facing UX matters because synthesis surfaces validator errors to block authors.

**Tradeoff accepted (from approval message):** BLOCK.md is not fully self-contained for third-party block authors — they need the TS source to edit a schema, only the rendered JSON-Schema to read one. Mitigated by the emission step: the BLOCK.md carries a complete, human-readable JSON-Schema artifact so third-party readers can inspect exactly what a tool expects without ever opening the TS file.

**Implementation implications (locked for PR 1):**

- Each of the 7 core blocks gets a `<block>.tools.ts` companion file that exports one Zod schema per tool + its output shape. CRM is the pattern validator per §5.
- A build step runs `z.toJSONSchema()` on each exported schema and writes the result into the BLOCK.md's `## Composition Contract` section between `<!-- TOOLS:START -->` / `<!-- TOOLS:END -->` markers.
- A CI test runs the emit and diffs the working tree against committed BLOCK.md — drift fails CI. (Build-time guarantee, not a runtime risk.)
- Net LOC vs. the original load-time-compiler recommendation: −50 to −100 LOC (we don't write a JSON-Schema-→-Zod compiler because `z.toJSONSchema()` is provided by the library).

**Implications rejected:** options requiring schema parsers we'd write ourselves (load-time JSON-Schema-to-Zod compiler; TypeScript-string DSL parser). Never write a parser upstream already provides.

---

**Appendix A — decision lineage for §7.1 (alternatives considered, archived).**

During audit drafting the following three paths were evaluated and rejected:

| Approach (archived) | Rejected because |
|---|---|
| **JSON Schema authored directly in BLOCK.md** (no Zod source). | No compile-time check that schemas match the TS types the runtime uses. Drift risk. No inference. |
| **TypeScript types authored in BLOCK.md via a custom string DSL** (`first_name: string, email?: email`). | Requires writing and maintaining a custom parser. Non-standard — third parties can't consume without our parser. Scope creep. |
| **JSON Schema authored in BLOCK.md with a separate load-time Zod compiler.** | Forces us to write a JSON-Schema-→-Zod compiler. `z.toJSONSchema()` from the Zod library inverts this direction and is strictly less work. Was the initial audit recommendation; self-review replaced it. |

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

### 7.5 The 11 non-core BLOCK.md files — LOCKED: invisible for v1, stamped with explicit markers

**Status: approved 2026-04-21.** The 7 core blocks migrate to v2; the 11 legacy blocks stay invisible to synthesis. Each of the 11 non-contract `.block.md` files is stamped with an explicit HTML-comment marker so future contributors don't silently add bad contracts.

**Required marker format (from approval message, verbatim):**

```html
<!-- 
  No composition contract. Intentionally invisible to agent 
  synthesis. Adding a contract here requires real semantic 
  work — see tasks/step-2b-1-contract-v2-audit.md §7.5.
-->
```

The marker is added to each of the 11 files in the same commit as this audit approval (below the frontmatter, above the first heading). This prevents a future contributor from assuming the 11 blocks need contracts and silently adding bad ones.

Beyond the 7 core blocks (§1), `packages/crm/src/blocks/` contains 11 additional `.block.md` files that **do not carry a `## Composition Contract` section**:

- `ai-video-hooks-optimizer.block.md`
- `bulk-video-generation-performance-tracker.block.md`
- `client-dashboard-progress-analytics.block.md`
- `client-intake-onboarding-portal.block.md`
- `membership-tiered-service-portal.block.md`
- `multi-product-analytics-dashboard.block.md`
- `og-image-generator.block.md`
- `product-launch-os.block.md`
- `safety-first-intake-recipe.block.md`
- `simple-membership-community-site.block.md`
- `waitlist-form.block.md`

These are "recipe" blocks — small (30–33 LOC each) skill files that describe vertical-specific compositions. Today they're invisible to agent synthesis because `parseCompositionContract` returns empty arrays when the section is absent (parser treats them as "no known composition", synthesis won't auto-use them — this is the existing behavior documented at `block-md.ts:73`).

**Three paths under v2:**

- **(a) Stay invisible forever.** Recipe blocks are documentation / starter-content, not synthesis-eligible blocks. v2 migration applies only to the 7 core blocks. Pro: smallest scope. Con: builders who install a recipe block can't have agents auto-route to it.
- **(b) Add minimal v1 contracts in 2b.2.** Extend the per-block migration work in 2b.2 to include adding a minimal `## Composition Contract` (just verbs + compose_with, leave produces/consumes empty) to each of the 11 recipes. Pro: recipes become synthesis-discoverable. Con: +11 migration slices beyond the 6 already planned.
- **(c) Add a "recipe" block type.** Schema-level distinction — `type: recipe` in frontmatter — so the parser knows to skip them without a warning and synthesis treats them differently (e.g., "you can install a recipe, but I won't auto-generate an agent that uses one"). Pro: cleanest semantic. Con: new frontmatter field, new synthesis-path discrimination.

**Approved path: (a).** v2 migration applies only to the 7 core blocks for v1. Recipe blocks stay invisible and get the explicit HTML-comment marker above. Paths (b) and (c) are archived decision lineage; they remain viable for a later sprint if synthesis discoverability of recipes becomes a user-facing ask.

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

### 9.5 Implication for v1 ship criterion

The master plan §0.5 ship criterion reads: *"7 archetypes shipped, **zero V1.1 footnotes** anywhere in their docs."* Review Requester currently ships with a loud "SMS fires unconditionally" limitation (the exact thing 2e's `external_state` branch removes). Given §9.4 above, the v1 ship criterion is **load-bearing on 2e actually landing** — if 2e slips, Review Requester's V1.1 footnote stays, which fails the zero-footnote bar. This isn't a 2b.1 issue per se, but the audit should note the dependency so 2e isn't treated as optional or deferrable later in the sprint.

---

## 10. Implementation plan — APPROVED 3-PR sequence

**Status: approved 2026-04-21.** Each PR ships to `main` with live probes passing before the next PR starts. The archetype library's probe discipline applies: 3× runs with same inputs, deterministic output confirmed, and no regressions on the 3 shipped archetypes (Speed-to-Lead, Win-Back, Review Requester) when CRM migrates.

- **PR 1 — Zod schemas + BLOCK.md parser extension + JSON-Schema emission** (`7.i.1.a`):
  - `packages/crm/src/blocks/crm.tools.ts` — Zod authored schemas for the 13 CRM MCP tool args + returns.
  - Extend `packages/crm/src/lib/blocks/block-md.ts` — v2-shaped `BlockMdCompositionContract`, v2 parser branch, extended `validateCompositionContract`. v1 blocks continue to parse; each reports one `legacy_contract` informational warning.
  - Build step: `pnpm build` (or equivalent hook) runs `z.toJSONSchema()` on each `<block>.tools.ts` export and writes the result between `<!-- TOOLS:START -->` / `<!-- TOOLS:END -->` markers in the corresponding `<block>.block.md`.
  - CI drift-detector test: run the emit in a tmpdir, diff against committed BLOCK.md, fail on drift.
  - **Green bar:** all 7 core blocks parse clean under v2 parser; 11 recipe blocks parse unchanged (markers present, no `## Composition Contract` expected); drift-detector reports zero diffs; seeded-bad test fixtures (malformed event name, unknown-event reference, tools-emit-missing-from-produces) produce targeted validator errors; `typecheck_errors == 4` baseline.
  - **Live probe:** Speed-to-Lead / Win-Back / Review Requester run 3× each and pass with no degradation on cost / latency / determinism (their v1 contracts drive synthesis unchanged at this point because CRM's BLOCK.md `## Composition Contract` hasn't been rewritten yet — Zod schemas are authored but not yet *consumed* by synthesis).

- **PR 2 — Agent-spec validator** (`7.i.1.b`):
  - New `packages/crm/src/lib/agents/validator.ts` — 300–400 LOC as revised in §4.3.
  - New `packages/crm/src/lib/agents/types.ts` — typed `AgentSpec`, `ConversationExit`, `Predicate` primitives. `Predicate` is exported as the shared primitive 2e's `external_state` branch condition will extend later (per §9.3).
  - **Green bar:** each of the 3 shipped archetype spec templates validates clean under the new validator; seeded-bad fixtures (wrong arg name, wrong enum value, unresolved `{{interpolation}}`) fail with step-id + path-level error messages; `typecheck_errors == 4` baseline.
  - **Live probe:** same 3× determinism + grounding run per archetype. Validator runs before each synthesis to confirm the filled spec passes its own type check.

- **PR 3 — CRM block migration + regression probes** (`7.i.1.c`):
  - Rewrite `packages/crm/src/blocks/crm.block.md` `## Composition Contract` section to v2 shape (typed `produces` / `consumes` referencing `SeldonEvent` union + typed soul/trigger-payload shapes; `<!-- TOOLS:START -->…<!-- TOOLS:END -->` block populated by the PR-1 emit step).
  - Update synthesis prompt (`scripts/phase-7-spike/synthesis.mjs`) to surface v2 schemas for blocks that have them — CRM in this PR, the remaining 6 core blocks come in 2b.2.
  - **Green bar:** ship criteria §8 all satisfied. CRM parses clean with zero warnings (`legacy_contract` cleared). The 6 remaining core blocks still on v1 each report exactly one `legacy_contract` warning. Drift-detector remains green. `typecheck_errors == 4` baseline.
  - **Live probe — this is the load-bearing regression gate:** Speed-to-Lead / Win-Back / Review Requester run 3× each and pass with no degradation on any of (cost +15% ceiling, latency +20% ceiling, determinism — step-sequence hash stable, grounding — 100% bar held). If any archetype degrades, stop, diagnose (§4.4 stop-and-reassess trigger applies), and iterate the v2 schema before 2b.2 kicks off.

After PR 3 lands + all probes green, 2b.1 is complete. Await Max's approval of 2b.1 results before starting 2b.2 (remaining 5 core blocks + Appointment Confirmer archetype path to full scope).

---

## 11. Stop-gate — audit approved 2026-04-21

**This audit is approved.** The final gate before PR 1 kicks off is this approved version landing in `main`. After that, the 3-PR sequence in §10 starts.

Gate items — resolution status:

| Item | Status | Resolution |
|---|---|---|
| §7.1 — schema approach | ✅ APPROVED | Zod-authored, JSON-Schema-emitted via `z.toJSONSchema()`. 3 alternatives archived in Appendix A. |
| §7.2 — Predicate primitive location | ⚪ Default stands | `packages/crm/src/lib/agents/types.ts` for 2b.1; promote to `packages/core` lazily if 2c needs it. Max did not overrule the default; proceeding on this. |
| §7.3 — event-registry resolution | ⚪ Default stands | Build-time codegen emits `event-registry.json` from the `SeldonEvent` union. Max did not overrule; proceeding on this. |
| §7.4 — PR split | ✅ APPROVED | 3 PRs as detailed in §10; each ships to `main` with live probes before the next starts. |
| §7.5 — scope of v2 migration | ✅ APPROVED | 7 core blocks only. 11 recipe blocks stamped with the explicit `<!-- No composition contract. Intentionally invisible… -->` marker. |
| §9.4 — Review Requester waits on 2e | ✅ CONFIRMED | SMS-suppression upgrade is a branch-step concern, not a conversation-exit concern. 2b.1 ships typed exits for conversations; Review Requester's V1.1 footnote clears when 2e lands. |
| §9.5 — 2e critical-path for ship criterion | ✅ ACKNOWLEDGED | Propagated to `tasks/v1-master-plan.md` §0.5 (Scope 3 amendment header) in the same commit as this audit approval. |

No open gate items remain.

---

## 12. Self-review changelog (2026-04-21, post-draft)

Critical self-review after initial draft found four factual errors and three substantive gaps. All fixed in-place:

1. **§5 — CRM tool count corrected: 12 → 13.** Original list invented `add_tag`, `remove_tag`, `merge_contacts` (don't exist) and missed `delete_deal`, `list_activities`, `create_activity`. Enumerated directly from `skills/mcp-server/src/tools.js`.
2. **§4.1 — parseCompositionLine line number corrected: 683 → 686.**
3. **§2.c — runtime caveat added.** The `capture` mechanism has no agent runtime yet (README line 147: "7.e runtime not yet shipped"). 2b.1's typed-I/O benefit is synthesis-time only. The audit's "no runtime changes" constraint is consistent with this, but needed explicit acknowledgement.
4. **§4.3 — LOC estimate bumped: ~200 → ~300–400.** Original estimate didn't factor in the interpolation-resolver logic (`{{var.path}}` parsing, resolution, walking). Total slice estimate revised from 540+250 LOC to 640–740+300 LOC.
5. **§7.1 — new recommended option: Zod-authored with JSON-Schema emitted.** Original recommendation (JSON-Schema-in-BLOCK.md + load-time compiler to Zod) requires writing a compiler we don't need. Zod v4's `z.toJSONSchema()` emits JSON-Schema bidirectionally; single source of truth stays in code, BLOCK.md shows the rendering. Cleaner architecture, less LOC.
6. **§7.5 — new open decision: what to do with the 11 non-contract BLOCK.md files.** 18 `.block.md` files exist; only 7 carry composition contracts. Recipe blocks (`waitlist-form`, `og-image-generator`, etc.) are currently invisible to synthesis. Recommendation: stay invisible for v1. Max confirms.
7. **§9.5 — new implication: v1 ship criterion is load-bearing on 2e.** Review Requester's V1.1 footnote only clears when 2e ships; "zero V1.1 footnotes" ship bar requires 2e actually landing, not just being planned.

Result: audit is more honest about scope/cost, catches the architectural flip on schema approach before Max reads it, and surfaces the 2e dependency before it becomes a late-sprint surprise.

---

## 13. Post-approval changelog (2026-04-21, Max-approved)

Max reviewed the self-reviewed audit and approved it with the following explicit resolutions. All fixed in-place above:

1. **§7.1 locked — Zod-authored / JSON-Schema-emitted** is the canonical schema approach. Max's approved reasoning captured verbatim: single source of truth with compile-time type-checking, bidirectional emission via `z.toJSONSchema()`, runtime validation for free when 7.e ships, matches existing Zod-heavy stack, better user-facing error messages. Tradeoff accepted: BLOCK.md not fully self-contained for third-party authors (mitigated by the JSON-Schema artifact emission). Three alternative paths archived in Appendix A as decision lineage.
2. **§7.5 locked — 7 core blocks migrate; 11 recipe blocks stamped.** Each non-contract BLOCK.md file gets the explicit HTML-comment marker specified verbatim in the approval message. Marker stamping ships in the same commit as this audit approval.
3. **§4.4 LOC ceiling bumped and committed.** Net estimate: ~1,000 LOC for 2b.1 (640–740 validator/parser + ~80 emit + ~80 CRM Zod + ~300 tests). Stop-and-reassess trigger: if implementation exceeds this, pause and diagnose before continuing. A >30% overrun means unseen schema complexity that must not propagate into 2b.2.
4. **§2.c runtime caveat preserved.** 2b.1's benefit is framed as synthesis-time only; runtime benefits compound once 7.e ships post-launch. This framing stays.
5. **§9.5 acknowledged + propagated.** Master plan §0.5 (Scope 3 amendment) gains an explicit flag: "2e is critical path for v1 ship criteria. If 2e gets deferred, Review Requester's V1.1 footnote returns, violating the zero-footnote commitment." Changed in the same commit as this audit approval.
6. **§10 3-PR sequence approved.** Each PR ships to `main` with live probes passing before the next starts. Archetype probe discipline applies: 3× same-input runs, deterministic step-sequence hash, zero regression on Speed-to-Lead / Win-Back / Review Requester when CRM migrates in PR 3.
7. **L-16 discipline confirmed.** The "direct-verify load-bearing facts before paraphrasing subagent output into shipped docs" rule from `tasks/lessons.md` stays in force for all future audit/plan work.
