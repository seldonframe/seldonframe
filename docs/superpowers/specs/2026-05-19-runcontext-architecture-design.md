# RunContext Architecture — design

**Date:** 2026-05-19
**Author:** dogfood-driven iteration on the speed-to-lead pipeline
**Status:** APPROVED — ready for implementation plan

## Locked decisions (operator-approved 2026-05-19)

1. **Type split:** dual-module — `run-context-customer.ts` + `run-context-admin.ts`. Customer-facing tools physically cannot import the agency field.
2. **Clock refresh:** eager — every dispatcher call re-stamps `clock` so long-paused conversations always see accurate "today" / "tomorrow".
3. **Agency in RunContext:** yes, kept, enforced via types (only readable from `AdminRunContext`).
4. **Per-workspace template render:** eager at workspace create — pay once at create time, no surprises later.

Plus a fifth principle layered in at operator request:

5. **Thin harness + fat SKILL.md + antifragile to LLM upgrades.** The runtime is plumbing; the prose lives in archetype `soul_copy` placeholders + `systemPromptOverride`. Operators edit prose at `/automations/[id]/configure`. When Claude N+1 ships, the same prose gets better results — no code changes.

## Goal

Every step of a workflow run reads identity (customer, workspace, clock) from a SINGLE source of truth — a `RunContext` object stamped at run-start and persisted on the run row. Stop patching divergence symptoms. Make speed-to-lead and every future agent error-proof and easy to debug by removing the conditions that allow drift in the first place.

**Success criterion:** an agent-created booking is INDISTINGUISHABLE from a customer-clicked booking via `/book/<orgSlug>/<bookingSlug>` — same `bookings` row shape, same downstream events, same `contacts` row updates, same confirmation email content. Operator looks at `/contacts/<id>` and sees name, phone, email, address, job type, and the date of appointment — all populated, all consistent.

## Non-goals

- Re-architecting the workflow runtime itself (steps, dispatchers, the bus). Those stay.
- Building a generic config system. RunContext is a fixed shape for the v1 archetype library.
- Multi-language / i18n for date formatting. English + workspace IANA TZ only.
- Removing the conversation step's LLM tool-use loop. That's working — we're just feeding it better context.

## The single root cause we're killing

Trace every dogfood bug from the last 72 hours and >75% collapse onto: **each step looks up identity independently and they disagree**.

| Bug observed | Source A | Source B |
|---|---|---|
| "Hi Maxime" email when form said "THIERRY" | trigger payload | stale contact row |
| Booking landed on January 9 vs requested "tomorrow May 20" | LLM training-data default | real wall clock |
| Email footer "Max agency · Auburn, WA" instead of "Roofs by Shiloh" | effectiveBranding (agency-first) | org.name (SMB) |
| Conversation wait never resumed | form upsert (by email) → contact A | findContactByPhone → contact B |
| Two confirmation emails 4 seconds apart | booking-confirmation trigger | speed-to-lead's send_confirmation_email step |
| "Bright Smile Dental" in confirmation email | example template placeholder | actual business name |
| Rain Pros sent email to a Roofs by Shiloh customer | same email exists as contact across 7 workspaces | per-workspace contact silo |

The architectural fix is one shape change: introduce `RunContext`. Then drift becomes impossible because there's only one place to read.

## The RunContext shape

```ts
// lib/workflow/run-context.ts
export type RunContext = {
  // Stamped once at startRun, never refreshed mid-run except `clock` (lazy).
  runId: string;
  orgId: string;
  archetypeId: string;
  startedAt: string; // ISO

  customer: {
    /** The canonical contact for THIS workspace. Created or matched at
     *  run-start from the trigger payload. Downstream tools read from
     *  here; they NEVER re-query contacts by phone/email mid-run. */
    contactId: string;
    firstName: string;          // from trigger payload's fullName/firstName, NOT stale contact.firstName
    lastName: string | null;
    email: string | null;
    phone: string;               // E.164. Stable identity for SMS wait matching.
  };

  workspace: {
    id: string;
    name: string;                // The SMB's actual name. Customer-facing surfaces use ONLY this.
    slug: string;
    timezone: string;            // IANA TZ. LLM grounding + booking slot conversion both read this.
    soul: OrgSoul;
    theme: OrgTheme;             // logoUrl, primaryColor, etc.
  };

  /** Optional: the active partner agency, IF any. Customer-facing
   *  code MUST NOT reach into this. Enforced at the type level: this
   *  field is exposed via a separate getter `getRunContextAdminOnly`
   *  that throws unless the caller is in the admin chrome render
   *  pipeline. See "Type-level enforcement" below. */
  agency: {
    id: string;
    name: string;
    logoUrl: string | null;
  } | null;

  /** Lazy / refreshable. Steps that care about "today" call
   *  `refreshClock(runContext)` which mutates the clock fields with
   *  the current wall clock formatted in `workspace.timezone`.
   *  Long-paused conversations (next-day reply) get an accurate
   *  "today" + "tomorrow" without re-querying anything else. */
  clock: {
    nowIso: string;              // server wall clock
    today: string;               // YYYY-MM-DD in workspace TZ
    tomorrow: string;            // YYYY-MM-DD in workspace TZ
    todayWeekday: string;        // "Monday" etc.
  };

  /** When the run was triggered by a specific resource (form id,
   *  booking id, sms inbound id), pin it here. Useful for downstream
   *  tools to reference the source without re-parsing triggerPayload. */
  source: {
    type: "form.submitted" | "booking.created" | "sms.replied" | "schedule" | "manual";
    formId?: string;
    bookingId?: string;
    inboundSmsId?: string;
    triggerEventId: string | null;
  };
};
```

### Type-level enforcement: admin vs customer-facing context

To prevent accidental agency-leak into customer surfaces, split the import surface:

```ts
// lib/workflow/run-context-customer.ts — for SMS/email/booking/contact code
export type CustomerRunContext = Omit<RunContext, "agency">;
export function asCustomerContext(rc: RunContext): CustomerRunContext;

// lib/workflow/run-context-admin.ts — for dashboard render code only
export type AdminRunContext = RunContext;
```

Customer-facing tool invokers (send_email, send_sms, create_booking, create_activity) only accept `CustomerRunContext`. There's literally no way to write `runContext.agency` from inside `send_email` because the type doesn't have it. The admin layout reads `AdminRunContext` directly.

## Persistence

Add a `context` JSONB column to `workflow_runs`:

```sql
-- drizzle/0048_workflow_runs_context.sql
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS context JSONB;
```

Backward compat: existing rows have `context = NULL`. The runtime detects this and rebuilds RunContext on first access from `trigger_payload` + workspace lookup — same logic as `buildRunContext`, just called lazily. Once rebuilt, persist it so future accesses are reads.

## Data flow

```
┌──────────────────────────────────────────────────────────────────┐
│ runtime.startRun(orgId, spec, triggerPayload)                    │
│   1. buildRunContext(orgId, triggerPayload)                      │
│      ├─ resolveCustomer(orgId, triggerPayload)                   │
│      │   ├─ Find OR create contact (by email primary, phone fb)  │
│      │   ├─ UPDATE contact.firstName/lastName/phone if changed   │
│      │   └─ Return { contactId, firstName, lastName, email, ... }│
│      ├─ loadWorkspace(orgId)                                     │
│      │   └─ { id, name, slug, timezone, soul, theme }            │
│      ├─ loadAgencyIfActive(orgId)                                │
│      │   └─ { id, name, logoUrl } | null                         │
│      ├─ buildClock(workspace.timezone)                           │
│      └─ buildSource(triggerPayload)                              │
│   2. storage.createRun({ ..., context: runContext })             │
│   3. advanceRun → step dispatchers receive runContext            │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ Step dispatcher signature                                        │
│   dispatchXxx(run, step, runContext: CustomerRunContext)         │
│   - conversation: prompt uses runContext.clock.today,            │
│                   matchPredicate uses runContext.customer.phone  │
│   - mcp_tool_call: tool invoker receives runContext              │
│   - send_email/send_sms/create_booking/create_activity:          │
│       use runContext.customer.* as primary source                │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ Tool invoker signature                                           │
│   invokeTool(orgId, args, runContext: CustomerRunContext)        │
│   - send_email: to = args.to || runContext.customer.email        │
│       The `to` arg is OPTIONAL now — if absent, customer.email   │
│       is the source of truth.                                    │
│   - send_sms: to = args.to_number || runContext.customer.phone   │
│   - create_booking: contactId = runContext.customer.contactId    │
│       (ignores args.contact_id — single source)                  │
│   - create_activity: same                                        │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ Twilio webhook (inbound SMS)                                     │
│   - resolveOrgByFromNumber → orgId                               │
│   - findContactByPhone → contactId (any match)                   │
│   - emitSeldonEvent("sms.replied", { phone, contactId, ... })    │
│   - bus.findUnresolvedWaitsForEvent + evaluatePredicate          │
│       matches on { phone: E164 } (stable identity, regardless of │
│       which sibling contact row findContactByPhone returned)     │
│   - resumeWait → runtime.advanceRun → dispatchConversation       │
│       receives runContext (loaded from run.context column)       │
└──────────────────────────────────────────────────────────────────┘
```

## Booking parity guarantee

The plan's success criterion: an agent-created booking is structurally identical to a public-page-clicked booking.

Method: extract the public-booking happy path from `submitPublicBookingAction` into a shared helper `createBookingForCustomer(orgId, runContext, args)`. BOTH the public booking route AND `create_booking` tool call this helper. Same row insert, same `booking.created` emit, same contact sync, same `intake_submissions` link.

```ts
// lib/bookings/create-for-customer.ts
export async function createBookingForCustomer(
  orgId: string,
  customer: CustomerRunContext["customer"] | PublicSubmissionCustomer,
  args: {
    appointmentTypeId: string;
    startsAt: Date;
    notes: string | null;
    intakeAnswers?: Record<string, unknown>;
  },
): Promise<{ bookingId: string }> {
  // ... single canonical implementation
}
```

Then visually comparing rows in the DB after agent-created vs public-created bookings should show identical shape (only `notes` text differs).

## Implementation phases

### Phase 0 — Schema + types (~1 day)

- [ ] **Task 0.1:** Create migration `0048_workflow_runs_context.sql` adding `context JSONB` column to `workflow_runs`.
- [ ] **Task 0.2:** Create `lib/workflow/run-context.ts` exporting the `RunContext` type, the `CustomerRunContext` subset type, and stubs for `buildRunContext`, `loadRunContext`, `refreshClock`, `asCustomerContext`.
- [ ] **Task 0.3:** Update `workflowRuns` Drizzle schema to include `context: jsonb("context").$type<RunContext | null>()`.
- [ ] **Task 0.4:** Unit tests for the pure functions: clock formatting, customer normalization, source resolution.

**Files:**
- Create: `packages/crm/drizzle/0048_workflow_runs_context.sql`
- Create: `packages/crm/src/lib/workflow/run-context.ts`
- Modify: `packages/crm/src/db/schema/workflow-runs.ts`
- Create: `packages/crm/tests/unit/workflow/run-context.spec.ts`

### Phase 1 — buildRunContext + persistence (~1 day)

- [ ] **Task 1.1:** Implement `buildRunContext(orgId, triggerPayload)` — pulls workspace, soul, theme, agency (only metadata, never used for customer paths), clock; resolves customer from triggerPayload with the existing form-upsert logic (email match → optional refresh, fallback to phone match, fallback to new contact).
- [ ] **Task 1.2:** Implement `loadRunContext(run)` — reads `run.context`; if null, calls `buildRunContext(run.orgId, run.triggerPayload)` and persists.
- [ ] **Task 1.3:** Wire `runtime.startRun` to call `buildRunContext` BEFORE `storage.createRun`, pass it through. Persist on the new column.
- [ ] **Task 1.4:** Migration backfill: existing in-flight runs without context get rebuilt lazily on next access (no eager backfill needed; risky to touch persisted runs without testing each).

**Files:**
- Modify: `packages/crm/src/lib/workflow/runtime.ts` (startRun + dispatch loop)
- Modify: `packages/crm/src/lib/workflow/storage-drizzle.ts` (createRun signature includes context)
- Modify: `packages/crm/src/lib/workflow/types.ts` (StoredRun.context)
- Create: `packages/crm/tests/unit/workflow/build-run-context.spec.ts`

### Phase 2 — Thread RunContext through step dispatchers + extract editable prose (~2 days)

- [ ] **Task 2.1:** Add `runContext: CustomerRunContext` to every step dispatcher signature. `dispatchStep` resolves it from `loadRunContext(run)` once per call. Clock is eager-refreshed in `loadRunContext` itself so every dispatcher call sees a fresh `today` / `tomorrow`.
- [ ] **Task 2.2:** Update conversation dispatcher:
  - `buildRunTimeVars` becomes a pure function over `runContext.customer` + `runContext.workspace`. Drops the `db.select(contacts)` + `db.select(organizations)` calls inside dispatch.
  - `buildSystemPrompt` reads `runContext.clock.today`, `runContext.clock.tomorrow`, `runContext.workspace.timezone` directly (no parsing).
  - `matchPredicate` uses `runContext.customer.phone` (already done in `7e9b874c` — confirm via tests).
- [ ] **Task 2.3:** **Skill extraction** (thin-harness work): move operator-editable prose out of `buildSystemPrompt` into archetype placeholders:
  - Add `$forbiddenPhrases` placeholder (soul_copy) — example: `"we couldn't find your appointment, please call us, this is broken"`. Harness reads it, injects into system prompt as: `Never say: ${forbiddenPhrases}.`
  - Add `$maxTurns` placeholder (user_input, default 6). Replaces hardcoded `MAX_TURNS` constant.
  - Add `$toolErrorHints` placeholder group (soul_copy) — per-error-key hint strings. Tool invoker reads these instead of returning hardcoded hints.
  - Keep STRUCTURAL pieces in code: exit-block JSON format spec, date context block, tool list. These never change per operator and breaking them breaks the harness.
- [ ] **Task 2.4:** Update mcp-tool-call dispatcher to pass runContext through to the invoker.
- [ ] **Task 2.5:** Update branch / read-state / write-state / await-event / approval dispatchers to accept (but not yet use) runContext, for signature uniformity.

**Files:**
- Modify: all `packages/crm/src/lib/workflow/step-dispatchers/*.ts`
- Modify: `packages/crm/src/lib/agents/archetypes/speed-to-lead.ts` (add new placeholders + remove the hardcoded mirror in conversation.ts)
- Modify: `packages/crm/src/lib/agents/archetypes/types.ts` if needed for new placeholder kinds
- Tests: extend existing dispatcher spec files; add `tests/unit/agents/speed-to-lead-prose-extraction.spec.ts`

### Phase 3 — Tool invoker rewrites (~1.5 days)

- [ ] **Task 3.1:** Update `lib/agents/tool-invoker.ts` ToolInvoker signature to receive `runContext: CustomerRunContext` alongside `orgId` + `args`.
- [ ] **Task 3.2:** **send_email:** `to = args.to || runContext.customer.email`. Subject + body still come from args (template-rendered upstream). Strip the contact-lookup-by-id fallback (not needed — context has it).
- [ ] **Task 3.3:** **send_sms:** `to = args.to_number || runContext.customer.phone`. Same simplification.
- [ ] **Task 3.4:** **create_booking:** `contactId = runContext.customer.contactId` (always), `appointmentTypeId = args.appointment_type_id`, `startsAt = parseLLMDateInTimezone(args.starts_at, runContext.workspace.timezone)`. **Extract the implementation into `createBookingForCustomer` (see "Booking parity guarantee" above) and call it.**
- [ ] **Task 3.5:** **create_activity:** `contactId = runContext.customer.contactId`, `userId = resolveAgentActorUserId(runContext.orgId)`.
- [ ] **Task 3.6:** **check_availability:** Unchanged — already pure over orgId + args. The runContext.workspace.timezone hint goes to the LLM, not this tool.

**Files:**
- Modify: `packages/crm/src/lib/agents/tool-invoker.ts`
- Create: `packages/crm/src/lib/bookings/create-for-customer.ts`
- Modify: `packages/crm/src/lib/bookings/actions.ts` (submitPublicBookingAction calls the new helper)
- Tests: `packages/crm/tests/unit/agents/tool-invoker-runcontext.spec.ts`

### Phase 4 — Customer-facing surfaces read from RunContext (~1 day)

- [ ] **Task 4.1:** **Email branding:** `lib/emails/api.ts loadEmailBranding(orgId, runContext?)` — when called from a step (with runContext), reads workspace identity from there. When called from a fire-and-forget event (no run), reads from organizations. **In NEITHER case does it consult effectiveBranding.is_white_label** — that's already been stripped in `b3a08968`, the change here is making the data source explicit per-call.
- [ ] **Task 4.2:** **Twilio webhook precedence check:** when looking up an active conversation wait, match on phone first (the stable identity); fall back to contactId for legacy waits. Already done in `7e9b874c`.
- [ ] **Task 4.3:** **`sms.replied` event payload:** include both `phone` (E.164) and `contactId`. Already done.

**Files:**
- Modify: `packages/crm/src/lib/emails/api.ts`
- Confirm: `packages/crm/src/app/api/webhooks/twilio/sms/route.ts` (no further changes needed beyond `7e9b874c`)

### Phase 5 — Per-workspace template regeneration (~0.5 day)

Fixes the "Bright Smile Dental in confirmation email" bug.

- [ ] **Task 5.1:** Audit where appointment-type confirmation message templates are seeded at workspace creation. Find which template still contains literal "Bright Smile Dental" / "{{businessName}}" placeholders not yet substituted.
- [ ] **Task 5.2:** Add a post-creation hook to `createFullWorkspace` (or equivalent) that interpolates {{businessName}}, {{timezone}}, etc. into every skill template's `customSkillMd` field BEFORE it's first used.
- [ ] **Task 5.3:** One-shot backfill for existing workspaces: a Vercel cron-triggered repair endpoint (or admin button) that re-renders templates for workspaces created before this fix.

**Files:**
- Modify: `packages/crm/src/lib/messaging/seed-default-triggers.ts` (or wherever the template seeds live)
- Modify: workspace creation flow (`createFullWorkspace` etc.)
- Create: `packages/crm/src/app/api/admin/repair-templates/route.ts` (one-shot, admin-token-gated)

### Phase 6 — Cross-workspace contact audit (the Rain Pros leak) (~0.5 day)

**Diagnosis from this session:** `maximehoule100@gmail.com` exists as a contact in SEVEN different workspaces (Max agency, Rain Pros, Roofs by Shiloh, SeldonFrame, Sunset Plumbing Co., Texas MAGA Roofing, Vesper Aesthetic Co.). Confirmed via Neon query.

**The Rain Pros email is NOT a cross-workspace leak in code** — Rain Pros independently has the contact as a row in its workspace. When Rain Pros' speed-to-lead agent or intake-auto-reply trigger fires on its own contact, it correctly emails that contact. The customer (the dev) experiences this as "weird, why is Rain Pros emailing me?" but architecturally each send is workspace-scoped.

The fix has two parts:

- [ ] **Task 6.1:** Workspace-creation guard: when scaffolding a new workspace, do NOT seed the creator's email as a contact. Seed data should be empty by default. The current behavior seems to seed test contacts from soul.customerExamples — switch those to clearly-fake emails (e.g. `customer-1@example.com`).
- [ ] **Task 6.2:** Cleanup of existing leakage: delete the dev's email from non-active test workspaces. One-shot SQL (run manually via Neon MCP).
- [ ] **Task 6.3:** Operator-portal heuristic: when an agency operator creates a NEW client workspace, surface a warning if any seed-data row contains the operator's own email. Easy to undo, prevents future surprises.

**Files:**
- Modify: workspace seeding code (TBD — need to find which file injects the default contacts)
- One-shot SQL via Neon MCP for the cleanup

### Phase 7 — Observability + verification + antifragility (~1 day)

- [ ] **Task 7.1:** Add `runContext` snapshot to the `/automations/[id]/runs` expanded view — show the customer name, phone, email, timezone, and `today` at run-start so the operator can debug "what did the agent think the customer's name was?". This is the operator's debugging surface.
- [ ] **Task 7.2:** Add a **live preview** to `/automations/[id]/configure`: render the resolved system prompt with sample RunContext values (operator's own first name + workspace name + today's date) substituted so the operator sees exactly what the LLM will read after their edits.
- [ ] **Task 7.3:** Add **config-history rollback**: every save to `agentConfig` writes a row to `agentConfig.history[]` (or a sibling table). Operator can revert to a previous config with one click. Defends against "I broke the prompt and now nothing works".
- [ ] **Task 7.4:** Integration test for the full speed-to-lead pipeline against a mocked workspace+contact+form. Asserts:
  - One opener SMS sent with correct `customer.firstName`
  - Conversation resumes on phone match (different sibling contact rows shouldn't break it)
  - Date "tomorrow at 3pm" extracts to `<today+1>T15:00:00` in workspace TZ
  - Booking created with correct `contactId`, `startsAt`, `appointmentTypeId`
  - ONE confirmation email goes out (no duplicate)
  - `/contacts/<id>` row has updated firstName/phone matching the form submission
  - Booking row is structurally identical to one created via the public booking page (validates the `createBookingForCustomer` shared helper)
- [ ] **Task 7.5:** **Antifragility smoke test** — pin the speed-to-lead spec + a sample conversation transcript ("Hi", "Tomorrow at 3pm", "John Doe at 123 main") in a test fixture. Run it against `claude-sonnet-4` AND the latest available model (currently `claude-sonnet-4-5`). Assert the agent reaches the exit block + extracts `preferred_start` to the correct ISO + service field is populated. **This locks the contract: future model bumps must not break behavior.** When the LLM model env var changes, this test catches regressions.
- [ ] **Task 7.6:** Re-run all unit tests (predicate-eval, run-context, dispatcher tests).

**Files:**
- Modify: `packages/crm/src/components/automations/runs-table.tsx` (add RunContext section)
- Modify: `packages/crm/src/app/(dashboard)/automations/[id]/runs/page.tsx` (fetch context from run)
- Modify: `packages/crm/src/components/automations/configure-agent-form.tsx` (live preview pane)
- Modify: `packages/crm/src/lib/agents/configure-actions.ts` (write to history on save)
- Create: `packages/crm/tests/integration/speed-to-lead-end-to-end.spec.ts`
- Create: `packages/crm/tests/integration/antifragility-model-bump.spec.ts`

### Phase 8 — Rollout (~0.5 day)

- [ ] **Task 8.1:** Cancel all currently-paused in-flight workflow_runs for the Roofs by Shiloh workspace so the next dogfood test starts clean.
- [ ] **Task 8.2:** Deploy. Vercel auto-runs `pnpm db:migrate` (wired in `224e286a`), so migration `0048` applies on deploy.
- [ ] **Task 8.3:** Smoke test on app.seldonframe.com: submit form as "Alice" with phone +1 4505161803, reply "tomorrow at 3pm", verify:
  - ONE opener SMS to Alice
  - LLM extracts `2026-05-20T15:00:00` (not January 9 or any other hallucinated date)
  - Conversation resumes on Alice's reply
  - ONE confirmation email signed by Roofs by Shiloh (not Max agency, not Bright Smile Dental)
  - `/contacts/<id>` shows firstName="Alice", phone updated, address from form, service from form, booking linked
- [ ] **Task 8.4:** Document the architecture in `docs/architecture/run-context.md` so future archetypes follow the convention.

## Migration risk + rollback

| Risk | Likelihood | Mitigation |
|---|---|---|
| Migration 0048 fails on prod | Low | `ADD COLUMN IF NOT EXISTS` is idempotent; rolling back is a `DROP COLUMN` |
| Existing in-flight runs break | Low | Lazy rebuild on first access; tested via unit tests |
| New `buildRunContext` query overhead per startRun | Low | Single workspace+contact+theme query (already happens piecemeal); net should be neutral or faster |
| Tool invoker signature change breaks callers we don't know about | Medium | Type system catches all callers at compile time; pnpm typecheck before merge |
| Email branding strips agency for actual agency-tier emails | Low | Agency chrome was only ever intended for ADMIN; this confirms that intent |
| Booking parity helper miscounts a downstream event | Medium | Side-by-side test: create one booking via public page, one via agent, diff the resulting rows + events |

Rollback path: revert the merge commit. Migration 0048 stays (adding a NULL column is safe to leave). Lazy rebuild keeps working for any runs that had context populated before the revert.

## Estimated timeline

7 phases × ~1 day = ~7 days of focused work. Phases 0-3 (schema + core flow) gate everything else. Phases 4-7 can parallelize after Phase 3 lands. Phase 8 is the final 4-hour smoke + ship.

If the goal is "ship by end of week": Phases 0-3 in 4 days, Phase 4 + 5 + 7 + 8 in 1 day. Phase 6 (cross-workspace audit) deferred to a separate cleanup PR.

## What this plan deliberately does NOT do

- **trace_id propagation across events/runs/messages.** Worth doing but separate. RunContext gives us 80% of the observability win.
- **Shared Redis idempotency store.** The current Postgres-based content dedup in `7e9b874c` is good enough for the scale we operate at.
- **Standardize event payload shape across the bus.** Touched in Phase 4.2 but only for `sms.replied`. Other events stay as-is for now.
- **Refactor the conversation engine's tool-use loop.** It's working — `b3a08968` graceful-error fix handles the worst case.

## Thin harness + fat SKILL.md + antifragility — the Karpathy frame

RunContext is the HARNESS. Code that handles plumbing — load workspace, resolve customer, stamp clock, route to step dispatcher, invoke tool. The harness must NOT carry behavior that depends on LLM cleverness; that lives in prose.

**The PROSE that gets smarter as LLMs get smarter — and that operators edit at `/automations/[id]/configure`:**

| Surface | Today's source | After this refactor |
|---|---|---|
| Conversation opener | `archetype.placeholders.$openingMessage.example` → `agentConfig.placeholders.$openingMessage` | Same, but resolves `{{customer.firstName}}` etc. from RunContext |
| Qualification criteria | `archetype.placeholders.$qualificationCriteria.example` → `agentConfig.placeholders.$qualificationCriteria` | Same |
| Tool error hints (the new "soft_error.hint" returned from check_availability) | Hardcoded strings in `tool-invoker.ts` | Move to `archetype.placeholders.$toolErrorHints.<errorKey>` so the agency operator can override per-workspace ("our practice handles this differently") |
| System prompt "never say" rules | Hardcoded in `buildSystemPrompt` | Move to `archetype.placeholders.$forbiddenPhrases` (default list, operator can extend) |
| Hard-limit turn count | Hardcoded `MAX_TURNS = 6` | Move to `archetype.placeholders.$maxTurns` (user_input, default 6) |
| Exit-block JSON format | Hardcoded in `buildSystemPrompt` | **Stays in harness — structural, not prose-y. Operators don't touch this.** |
| Date grounding (CURRENT DATE CONTEXT) | Code-built from `runContext.clock` | **Stays in harness — correctness-critical** |
| Tool list (`check_availability` etc.) | Code-defined `AGENT_TOOLS` | **Stays in harness — bound to tool implementations** |

**The boundary rule:**
- **In the harness (code, immutable):** anything whose correctness depends on the runtime contract — RunContext resolution, predicate eval, tool signatures, exit-block parsing, persistence, idempotency.
- **In SKILL.md prose (placeholders, operator-editable):** anything whose quality depends on LLM judgment — opener tone, qualification criteria, fallback phrasing, brand voice.

**Antifragility test:** the harness must be self-sufficient enough that swapping the LLM model (`claude-sonnet-4` → `claude-sonnet-5` → some future model) requires ZERO code changes. The same SKILL.md prose produces better results because the LLM is better. We commit to this by:

1. **Not over-prescribing the LLM's process in code.** The system prompt should describe goals + constraints, not step-by-step procedures. If we find ourselves adding "first do X, then Y, then Z" to `buildSystemPrompt`, that's a smell — should be in prose, or the LLM should figure it out from the goal.

2. **Tool surfaces stay declarative.** `check_availability` returns slots; `create_booking` creates a booking. The LLM decides WHEN to call them. We don't hard-code call ordering.

3. **Graceful tool errors return prose hints, not control flow.** `{ ok: false, hint: "..." }` lets the LLM decide what to say. We never branch in code based on which tool errored.

4. **A model-upgrade smoke test** (Phase 7): pin the speed-to-lead spec + a sample conversation transcript. Run against `claude-sonnet-4` AND `claude-sonnet-4-5` (or future). Assert the agent reaches the exit block + extracts the correct vars in both. Lock this as a regression test — when we bump the default model, this test catches behavior breakage.

## Operator editability surface

The agent-configure page at `/automations/[id]/configure` is the operator's primary leverage point. After this refactor:

**Editable per workspace (under `agentConfig.placeholders` JSONB):**
- `$openingMessage` — soul_copy, prose textarea
- `$qualificationCriteria` — soul_copy, prose textarea
- `$forbiddenPhrases` — soul_copy, comma-list ("we couldn't find your appointment, please call us, this is broken")
- `$toolErrorHints.appointmentTypeNotFound` — soul_copy, prose textarea
- `$toolErrorHints.noSlotsInWindow` — soul_copy, prose textarea
- `$maxTurns` — user_input, integer (default 6)
- `$formId`, `$appointmentTypeId`, `$waitSeconds` — user_input (existing)
- `systemPromptOverride` — power-user textarea that replaces the entire generated prompt (existing, but unfocused — most operators won't need this)

**Live preview** (Phase 7 nice-to-have): render the resolved system prompt with `{{customer.firstName}}` etc. substituted with sample values, so the operator sees exactly what the LLM will read.

**Rollback** (Phase 7): every save creates a `agentConfig.history[]` entry. Operator can revert to a previous version with one click. Defends against "I edited the prompt and now nothing works" panic.

**Why this matters for antifragility:** when Claude N+1 ships and the operator notices "actually now the model is sharp enough to skip the qualification step entirely", they edit the `$qualificationCriteria` prose to be shorter. No code change. No PR. No deploy. The operator's intuition compounds.

## Locked decisions (replaces the open-questions section)

The 4 questions in the prior version are answered above in the header. No further design changes needed before implementation.

## Sign-off

Plan is locked. Next step: convert this spec into a step-by-step implementation plan via `superpowers:writing-plans` and execute via `superpowers:subagent-driven-development` (one subagent per phase, two-stage review per task — spec compliance + code quality).

Estimated 7 days end-to-end. Phases 0-4 (core RunContext + customer-surface alignment + skill extraction) deliver the booking-parity + identity-drift fixes in 5 days. Phases 5-7 (template re-render + cross-workspace audit + observability + antifragility smoke test) in another 2 days.
