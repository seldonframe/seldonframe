# RunContext Architecture — design

**Date:** 2026-05-19
**Author:** dogfood-driven iteration on the speed-to-lead pipeline
**Status:** Draft for review

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

### Phase 2 — Thread RunContext through step dispatchers (~1.5 days)

- [ ] **Task 2.1:** Add `runContext: CustomerRunContext` to every step dispatcher signature. Default `dispatchStep` resolves it from `loadRunContext(run)` once per call.
- [ ] **Task 2.2:** Update conversation dispatcher:
  - `buildRunTimeVars` becomes a pure function over `runContext.customer` + `runContext.workspace`. Drops the `db.select(contacts)` + `db.select(organizations)` calls inside dispatch.
  - `buildSystemPrompt` reads `runContext.clock.today`, `runContext.clock.tomorrow`, `runContext.workspace.timezone` directly (no parsing).
  - `matchPredicate` uses `runContext.customer.phone` (already done in `7e9b874c` — confirm via tests).
- [ ] **Task 2.3:** Update mcp-tool-call dispatcher to pass runContext through to the invoker.
- [ ] **Task 2.4:** Update branch / read-state / write-state / await-event / approval dispatchers to accept (but not yet use) runContext, for signature uniformity.

**Files:**
- Modify: all `packages/crm/src/lib/workflow/step-dispatchers/*.ts`
- Tests: extend existing dispatcher spec files

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

### Phase 7 — Observability + verification (~0.5 day)

- [ ] **Task 7.1:** Add `runContext` snapshot to the `/automations/[id]/runs` expanded view — show the customer name, phone, email, timezone, and `today` at run-start so the operator can debug "what did the agent think the customer's name was?".
- [ ] **Task 7.2:** Add an integration test that runs the full speed-to-lead pipeline against a mocked workspace+contact+form and asserts:
  - One opener SMS sent with correct customer.firstName
  - Conversation resumes on phone match (different sibling contact rows shouldn't break it)
  - Date "tomorrow at 3pm" extracts to `<today+1>T15:00:00` in workspace TZ
  - Booking created with correct `contactId`, `startsAt`, `appointmentTypeId`
  - ONE confirmation email goes out (no duplicate)
  - `/contacts/<id>` row has updated firstName/phone matching the form submission
- [ ] **Task 7.3:** Re-run the existing predicate-eval tests + new run-context tests in CI.

**Files:**
- Modify: `packages/crm/src/components/automations/runs-table.tsx` (add RunContext section)
- Modify: `packages/crm/src/app/(dashboard)/automations/[id]/runs/page.tsx` (fetch context from run)
- Create: `packages/crm/tests/integration/speed-to-lead-end-to-end.spec.ts`

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

## Open questions for review

1. **Type-level admin/customer split:** is the dual-module pattern (`run-context-customer.ts` + `run-context-admin.ts`) heavy-handed? Alternative: a single module with eslint rule preventing `runContext.agency` from being read in `lib/agents/tool-invoker.ts` + `lib/emails/api.ts`. Pick one.

2. **Clock refresh policy:** lazy (refresh on demand by step code) vs eager (every dispatcher call re-stamps clock)? Lazy avoids unnecessary work but requires step authors to know to call `refreshClock`. Eager is foolproof but cheap. Lean eager.

3. **Should `agency` be in RunContext at all?** Argument for removal: customer-facing code never needs it, admin code reads it directly from `organizations` joined with `partner_agencies`. Argument for inclusion: convenience + single source of truth for the admin layout's render. Lean keep but enforce via types.

4. **Per-workspace template re-render — eager (at workspace create) or lazy (at first use)?** Eager is simpler operationally; lazy avoids work for workspaces that never send. Lean eager — the cost is one render per workspace, paid once.

## Sign-off

Once this plan is approved I'll create an implementation plan via `superpowers:writing-plans` and execute via `superpowers:subagent-driven-development` (one subagent per phase, two-stage review per task). Estimated 7 days end-to-end.
