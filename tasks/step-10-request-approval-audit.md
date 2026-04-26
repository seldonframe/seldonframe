# SLICE 10 Audit — `request_approval` primitive

**Date:** 2026-04-25
**Predecessor:** Scope 3 closed at main HEAD `0c0edc9d` (PR #1 merged
+ Vercel-verified per L-27); 28-streak holds.
**Drafted by:** Claude Opus 4.7 against worktree branch
`claude/slice-10-approval-primitive` at `0c0edc9d`.

**Shape note:** SLICE 10 is the first slice of Scope 4. Its scope is
narrower than SLICE 9 (one new step type + persistence + dispatcher +
admin surface), but its strategic weight is higher than the LOC count
suggests — without an approval primitive, the SeldonFrame ICP (SMB
agency operators deploying agents on clients' behalf) cannot put any
agent into production trust. This audit treats it as ICP-essential
table stakes, not a feature.

---

## §1 Problem statement + strategic context

### 1.1 Why approval is ICP-essential, not optional

SeldonFrame's ICP is **SMB agency operators** deploying SeldonFrame
agents to act on their clients' behalf. The first month of production
for any agency-deployed agent looks like this:

- Operator stages an agent in the workspace
- Operator runs the agent in test mode (SLICE 8) until they trust
  the structural shape of its outputs
- Operator flips test mode off
- **And then?**

Without `request_approval`, the answer is "the agent runs fully
autonomously against real customers." For agency operators with
fiduciary duty to their clients, that's not a launch path — it's a
liability. Real conversations with prospective agency users:

> "I trust your platform. I do not trust an agent texting 800 of my
> client's customers without me eyeballing the draft first. What's the
> escape valve?"
>
> "If the agent prepares a refund over $200, my client wants to see
> the payload before it lands. Is that a workflow you can build?"
>
> "We've been burned by AI-drafted social posts going out at 2am and
> the client waking up to PR damage. I need a human gate."

Every one of these requirements maps to the same primitive: pause the
workflow, surface a pending action to a designated approver, resume on
their decision. **Approval gates are operational table stakes for the
ICP, not a competitive feature.** SeldonFrame ships without them and
the ICP can't deploy.

### 1.2 Worked examples (the three canonical shapes)

These three examples cover ~90% of the approval scenarios SeldonFrame's
ICP will ask for. The schema must support all three cleanly:

**A. Pre-send review (high-fan-out outreach)**
- Agent drafts an SMS body + recipient list (e.g., 800 customers in
  the heat-advisory cohort)
- Workflow pauses on `request_approval` with the draft + recipient
  count + sample of personalization
- Operator reviews on `/agents/approvals` admin page → approves or
  rejects
- Approved → workflow advances to send; rejected → log + branch to
  cleanup

**B. Threshold-triggered approval (financial / risk-bearing actions)**
- Agent prepares a refund of $X for a customer
- Workflow has a `branch` step on `amount > $200`
- Above threshold → `request_approval` with refund details
- Below threshold → straight to refund (no approval)
- Approver: workspace owner or designated finance role
- This is approval *composed* with branch — the audit must verify
  composition works cleanly

**C. Client-account action (delegated-access posture)**
- Agency-managed workspace; agent generated a reply to a client's
  social post
- Workflow pauses on `request_approval` with the generated reply +
  the original post for context
- Approver type: `client_owner` (not the agency operator who
  deployed the agent — the *client* whose account is being acted on)
- Notification reaches the client via email/SMS
- Approved → reply posts; rejected → drafted reply logged for
  manual handling

### 1.3 Relationship to `await_event` (sibling, not duplicate)

`await_event` and `request_approval` share the **pause-and-resume**
runtime shape but differ in **trigger source**:

| Dimension | `await_event` | `request_approval` |
|---|---|---|
| Trigger source | System event arrives | Human action (approve/reject) |
| Resume cause | `event_match` predicate satisfied | Approver clicks button or replies |
| Identity | Anonymous (any matching event) | Bound to specific approver |
| Surfacing | Admin can see pending wait | Approver receives notification + dedicated UI |
| Timeout semantics | `on_timeout.next` (system continuation) | Configurable: abort, auto-approve, indefinite |
| Approver authorization | N/A | Workspace-scoped permission check required |

The runtime mechanics are similar enough that we should reuse
workflow_waits + the resume path (G-10 decision in §9), but the
schema, dispatcher, notification, and admin surface are distinct
enough that they warrant a new step type rather than extending
`await_event` with optional approval fields.

### 1.4 Relationship to test mode (SLICE 8)

Test mode and approval are **orthogonal concerns serving different
operator needs**:

- **Test mode** lets operators **iterate safely** during workflow
  authoring — outbound SMS/email routes to sandbox; inbound triggers
  fire normally; operator sees full-fidelity workflow behavior
  without real-customer reach.
- **Approval** lets operators **supervise production** — workflows
  run against real customers but pause at builder-designated gates
  for human verification before destructive/visible actions.

Both will likely be active simultaneously during the early-production
period (operator is in test mode for new automations, in production
with approval gates for trusted ones). The dispatcher must handle the
combination cleanly:
- Test mode + approval = approval still surfaces; resolution still
  advances the workflow; the eventual SMS routes through the test
  config (sandbox)
- Production + approval = approval surfaces; resolution advances; SMS
  routes through live config

No coupling needed; the existing test-mode resolver is downstream of
the approval gate.

---

## §2 Ground-truth findings at HEAD

Verified by direct inspection at main HEAD `0c0edc9d`. Twelve
dimensions covered.

### §2.1 Workflow runtime pause/resume patterns

`packages/crm/src/lib/workflow/step-dispatchers/await-event.ts`
implements the only existing pause-and-resume primitive.

`dispatchAwaitEvent()` (lines 86-107) returns a `pause_event`
NextAction with eventType, resolved matchPredicate, timeoutAt,
on_resume.next, and on_timeout.next.

`applyAction()` in `packages/crm/src/lib/workflow/runtime.ts` lines
399-408 applies the pause:

```typescript
case "pause_event": {
  await context.storage.createWait({
    runId: run.id,
    stepId: run.currentStepId ?? "unknown",
    eventType: action.eventType,
    matchPredicate: action.matchPredicate as Record<string, unknown> | null,
    timeoutAt: action.timeoutAt,
  });
  await context.storage.updateRun(run.id, { status: "waiting" });
  return true;
}
```

Resume flows through `packages/crm/src/lib/events/bus.ts`'s
`resumePendingWaitsForEventInContext()` (lines 149-168): loads
unresolved waits for the event type, evaluates predicates, calls
`resumeWait()` to claim + advance.

**For SLICE 10:** the runtime has a clean pause-and-resume shape we
can reuse. The semantic generalization is "wait for some external
condition → resume on satisfaction." `request_approval` fits that
shape exactly; the new wait type is "human action" instead of
"event arrival."

### §2.2 `workflow_waits` table schema

`packages/crm/src/db/schema/workflow-waits.ts` (lines 33-80):

```typescript
export const workflowWaits = pgTable("workflow_waits", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  runId: uuid("run_id").notNull().references(() => workflowRuns.id, { onDelete: "cascade" }),
  stepId: text("step_id").notNull(),
  eventType: text("event_type").notNull(),         // ← TODAY: notNull, event-only
  matchPredicate: jsonb("match_predicate").$type<Record<string, unknown>>(),
  timeoutAt: timestamp("timeout_at", { withTimezone: true }).notNull(),
  resumedAt: timestamp("resumed_at", { withTimezone: true }),
  resumedBy: uuid("resumed_by"),
  resumedReason: text("resumed_reason"),           // event_match | timeout | manual | cancelled
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, ...);
```

Three partial indexes: event-arrival scan, timeout cron sweep, run-id
admin lookup. Status is implicit via `resumedAt IS NULL`.

**Critical finding:** `eventType` is `notNull()`. Approval waits don't
have an event type. **The audit must decide between two paths (G-10-9
below)**:
- **Path A** (extend workflow_waits): add a `waitType` discriminator
  + make `eventType` nullable; reuse the wait+resume infrastructure.
- **Path B** (parallel table): add a new `workflow_approvals` table
  next to `workflow_waits`; dispatcher pauses by inserting into
  approvals table; admin queries union both tables.

Path A is closer to the SLICE 6/7 pattern of "extend the existing
abstraction." Path B is closer to the SLICE 9 PR 2 pattern of
"new concern → new aggregate." Strong recommendation in §9 G-10-9.

### §2.3 `workflow_runs` status states

`packages/crm/src/db/schema/workflow-runs.ts` line 46:
`status: text("status").notNull().default("running")` (text, not enum
— allows additive states).

Five values currently set by the runtime:
- `running` — default; active execution
- `waiting` — paused on await_event or wait timer
- `completed` — terminal (next=null reached)
- `failed` — terminal (markRunFailed)
- `cancelled` — declared in audit, **not yet implemented in runtime
  code** (would land with admin cancel API)

**Critical finding:** No `waiting_approval` state exists. Per the
G-10-9 decision below, the recommendation is to keep `waiting` as
the unified pause state and discriminate at the wait-row level
(approver_type / waitType field), not at the run-status level. This
preserves runtime simplicity (one resume code path; one admin filter
for "anything paused").

### §2.4 Step type registry (current count: 8)

`packages/crm/src/lib/agents/validator.ts` lines 485-496:

```typescript
const KnownStepSchema = z.discriminatedUnion("type", [
  WaitStepSchema,          // "wait"
  McpToolCallStepSchema,   // "mcp_tool_call"
  ConversationStepSchema,  // "conversation"
  AwaitEventStepSchema,    // "await_event"
  ReadStateStepSchema,     // "read_state"
  WriteStateStepSchema,    // "write_state"
  EmitEventStepSchema,     // "emit_event"
  BranchStepSchema,        // "branch"
]);
```

8 known step types confirmed (matches Max's claim). SLICE 10 adds
the **9th**: `RequestApprovalStepSchema` with `type: z.literal("request_approval")`.

Cross-ref validator pattern lives at `validator.ts` lines 588+
(`validateAgentSpec()`): walks step list, builds `stepIds` set,
then per-step calls `validateStep()` which checks `next` references
exist. SLICE 10 cross-refs include:
- `next_on_approve` step exists
- `next_on_reject` step exists
- approver enum value is well-formed
- timeout_action enum value is well-formed
- timeout_seconds present iff timeout_action != "wait_indefinitely"

### §2.5 Admin `/agents/runs` surface

File inventory (`packages/crm/src/app/(dashboard)/agents/runs/`):
- `page.tsx` — server, loads workflowRuns + workflowWaits +
  workflowStepResults; serializes for client
- `runs-client.tsx` — client, polling refresh, table + drawer
- `schedules-section.tsx` — schedules subsection
- `subscriptions-section.tsx` — subscriptions subsection

Existing "pending event" pattern in the drawer
(`runs-client.tsx` lines 221-258):
- Shows event type + timeout + match predicate
- "Resume manually" button → `POST /api/v1/workflow-runs/[runId]/resume`
- "Cancel run" button → `POST /api/v1/workflow-runs/[runId]/cancel`

**For SLICE 10:** the audit should add an analogous block in the
drawer for pending approvals (approver name + context summary +
approve/reject buttons), AND a dedicated `/agents/approvals` page or
section that lists pending approvals across all runs in the workspace
(approver-first view, not run-first view). G-10-4 below.

### §2.6 Notification infrastructure

SMS dispatch: `packages/crm/src/lib/sms/api.ts` `sendSmsFromApi()`
(lines 64-100). Email dispatch:
`packages/crm/src/lib/emails/api.ts` `sendEmailFromApi()` (lines
56-100). Both honor SLICE 8 test-mode routing automatically via
`resolveTwilioConfig` / `resolveResendConfig`.

`to` field formats:
- SMS: E.164 phone number (`toNumber`)
- Email: standard email address (`toEmail`)

**For SLICE 10:** approver notifications reuse these primitives.
The dispatcher resolves the approver record (user.id /
organizations.ownerId / a passed user_id), reads their phone +
email, and invokes the SMS/email API with a templated body that
includes a deep link to the approval surface.

### §2.7 User / identity model

Three tables relevant to approver resolution:

**`users`** (`packages/crm/src/db/schema/users.ts`): id, orgId, name,
email, role, avatarUrl, etc. Email is unique across all users.

**`orgMembers`** (`packages/crm/src/db/schema/org-members.ts`):
id, orgId, userId, role. Unique (orgId, userId). Indexes on userId,
orgId.

**`organizations`** (`packages/crm/src/db/schema/organizations.ts`):
- `ownerId` (uuid) — primary owner; the workspace owner concept the
  ICP would call "operator" for the deploying agency
- `parentUserId` (uuid) — secondary admin

**Approver resolution map (audit recommendation, G-10-1):**
- `approver: "operator"` → `organizations.ownerId` of the workspace
  the run belongs to
- `approver: "client_owner"` → a user record marked as the client
  contact (need a Soul attribute or a `client_contact_user_id` org
  column; SLICE 10 may add this)
- `approver: { user_id: "..." }` → specific user (must be a member
  of the workspace per orgMembers; runtime enforces)

Current user resolution: `packages/crm/src/lib/auth/helpers.ts`
`getCurrentUser()` + `getOrgId()` (lines 8-48). The approval API
endpoints will use `getCurrentUser()` to verify the actor + check
they match the approver bound to the approval record.

### §2.8 Cost observability hooks (SLICE 9 PR 2 C4-C5)

`recordLlmUsage()` at `packages/crm/src/lib/ai/workflow-cost-recorder.ts`
operates on `runId` + invokes a SQL `+= ` increment on workflow_runs
columns. **Critical for §15:** the recorder doesn't care about run
status — it just increments. So a `request_approval` pause does NOT
break cost capture. After resume, post-approval LLM calls land in the
same `runId`'s aggregate columns and the `/agents/runs` admin
surface shows them correctly.

The audit should add an explicit integration test verifying:
"workflow with request_approval mid-flow correctly aggregates LLM
costs from steps before AND after approval."

### §2.9 Approval-like patterns in the codebase (negative search)

Grep results: zero pre-existing workflow approval infrastructure.
Hits exist in `app/(dashboard)/admin/blocks/review/` and
`marketplace/` — those are marketplace-block approvals (admin
moderation), unrelated to the workflow runtime. Confirmed: SLICE 10
is greenfield for workflow approvals.

### §2.10 Migration numbering convention

Latest: `packages/crm/drizzle/0026_workflow_runs_cost_observability.sql`.
Pattern: `{4-digit-number}_{adjective}_{noun}.sql`.

SLICE 10 will use **`0027_workflow_approval_infrastructure.sql`**
(if Path B / new table) or **`0027_workflow_waits_approval_extension.sql`**
(if Path A / extend workflow_waits). Both single-migration; the dual
case (one for table, one for extending workflow_runs status comment)
would split into 0027 + 0028 if needed.

### §2.11 Workspace-scoped vs global archetype registries

Global registry: `packages/crm/src/lib/agents/archetypes/index.ts`
(6 archetypes; locked for synthesis baseline; 28-streak depends on
no changes).

Workspace-scoped: `packages/crm/src/lib/hvac/archetypes/index.ts`
(4 HVAC archetypes; ship via vertical pack).

**For SLICE 10:** any new archetype demonstrating `request_approval`
(per §11 end-to-end flow continuity) MUST live in the workspace-scoped
registry — likely as additions to `lib/hvac/archetypes/` showing
approval-gated heat advisory (G-10-7 / G-10-8) — to preserve the
28-streak baseline. The global archetypes do NOT change; SLICE 10
itself does NOT add a global archetype.

Per §10, the integration archetype additions are out of scope for
the SLICE 10 PR scope (deferred to a follow-up "SLICE 10 archetype
integration examples" mini-commit OR rolled into a SLICE 10 close-out
demo) — the audit recommends keeping the SLICE 10 PR focused on the
primitive itself + admin UI + dispatcher, with archetype examples
documented but not committed inside the SLICE 10 scope.

### §2.12 Test harness conventions

`pnpm test:unit` runs `packages/crm/tests/unit/**/*.spec.ts` via
`node:test` + tsx. In-memory storage fakes for db avoid Postgres boot
in unit tests; integration-style tests (slice-X-integration.spec.ts)
exercise the runtime end-to-end against in-memory storage.

For SLICE 10:
- `tests/unit/request-approval-step.spec.ts` — schema validation +
  cross-ref edges
- `tests/unit/workflow-approval-storage.spec.ts` — persistence layer
- `tests/unit/dispatch-request-approval.spec.ts` — dispatcher +
  pause/resume
- `tests/unit/approval-resolution-api.spec.ts` — approve/reject API
  shape + idempotency
- `tests/unit/slice-10-integration.spec.ts` — full pause→approve→
  resume flow
- `tests/unit/approval-cost-attribution.spec.ts` — cost capture
  across approval pause boundary (dedicated test for §2.8 invariant)

---

## §3 Schema extension — `request_approval` step

### 3.1 New step type

```typescript
const RequestApprovalStepSchema = z.object({
  id: z.string().min(1),
  type: z.literal("request_approval"),

  // WHO must approve.
  approver: z.discriminatedUnion("type", [
    z.object({ type: z.literal("operator") }),
    z.object({ type: z.literal("client_owner") }),
    z.object({ type: z.literal("user_id"), userId: z.string().uuid() }),
  ]),

  // WHAT they're approving — surfaced in the admin UI + notification.
  context: z.object({
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(600),
    preview: z.string().max(4000).optional(),  // e.g., the SMS body draft
    metadata: z.record(z.unknown()).optional(), // e.g., {recipientCount: 800, ...}
  }),

  // Timeout behavior.
  timeout: z.discriminatedUnion("action", [
    z.object({
      action: z.literal("abort"),
      seconds: z.number().int().positive().max(2_592_000), // 30d cap
    }),
    z.object({
      action: z.literal("auto_approve"),
      seconds: z.number().int().positive().max(2_592_000),
    }),
    z.object({
      action: z.literal("wait_indefinitely"),
      // No seconds field; .strict() rejects extras.
    }).strict(),
  ]),

  // Routing on resolution.
  next_on_approve: z.string().nullable(),  // null = terminate
  next_on_reject: z.string().nullable(),   // null = terminate
}).strict();
```

**Five design decisions encoded:**

1. **Discriminated approver union** — three approver types as a typed
   union, not a free-form string. Mirrors the SLICE 6 `Predicate`
   union pattern. Cross-ref validator can verify each variant.
2. **`context` is structured** — title (admin row label), summary (1-line),
   preview (multi-line draft), metadata (arbitrary JSON for archetypal
   data). Caps prevent runaway specs.
3. **`timeout` is a discriminated union, not separate fields** —
   prevents the invalid combination "action=wait_indefinitely + seconds=N";
   each variant only carries the fields it needs. Mirrors the
   `await_event.timeout` shape from SLICE 6 with cleaner action semantics.
4. **`next_on_approve` + `next_on_reject` are required** — not
   optional. Author must explicitly route both outcomes (parallel to
   `branch.on_match_next` + `on_no_match_next`). `null` = terminate
   (parallel to step.next).
5. **`.strict()` at the top** — extra fields rejected at parse time.
   Mirrors SLICE 6 strict-object discipline.

### 3.2 Cross-ref validator edges

Five new edges to add to `validateStep()`:

| # | Edge | Code | Severity |
|---|---|---|---|
| 1 | `next_on_approve` references known step (or null) | `unknown_step_next` | error |
| 2 | `next_on_reject` references known step (or null) | `unknown_step_next` | error |
| 3 | `approver.type === "user_id"` → userId is a valid uuid (Zod-enforced) | (parse-level) | error |
| 4 | `timeout.action !== "wait_indefinitely"` → seconds present (Zod-enforced via discriminated union) | (parse-level) | error |
| 5 | Step type "request_approval" exists exactly once if the approver is `client_owner` AND the workspace has no client_contact_user_id set → warning (not error; resolution surfaces at runtime) | `client_owner_unresolved` | warning |

Edges 1-4 are mostly Zod-enforced or trivial. **Edge 5 is the
gate-breadth riser** (one cross-ref check requiring workspace-state
introspection at validation time). Per L-17 SLICE 7 hypothesis,
gate breadth scales test LOC linearly; estimate validator test count
~5-7 new tests covering each edge. Total cross-ref validator delta:
~80-120 prod LOC + ~150-220 test LOC.

### 3.3 L-17 cross-ref Zod prediction

Schema additions: ~80 prod LOC (the new step type + edges).

Cross-ref validator additions: ~50 prod LOC (5 edges, each ~10 lines).

Test breadth: 5 cross-ref edges × ~3 tests each (positive + negative
+ boundary) = 15 tests, plus shape-level Zod tests (~10 tests
covering happy-path + each `.strict()` rejection + each discriminator
branch). Estimate ~25-30 test cases × ~10 LOC each = **~250-300 LOC
test**, **~150 LOC prod**.

This is comparable to the SLICE 7 (5-edge MessageTrigger schema)
data point: 247 test LOC actual / 230 predicted = 1.07x. SLICE 10
is in-band; if actual lands materially above ~350 LOC test, that's
a third L-17 outlier worth investigating.

### 3.4 Schema interaction surface check (L-22 structural enforcement)

The audit explicitly verifies via the schema:

- An approval step CANNOT bypass approval at parse time (no
  `auto_approve_if_*` schema escape — auto-approve is timeout-only,
  not condition-only).
- An approval step CANNOT silently advance on no-resolution (timeout
  must be specified; no default-30-days fallback in the dispatcher;
  the schema requires the `timeout` discriminator).
- An approval step's approver CANNOT be a free-form string (tightens
  the SQL query for "who can approve this").

These are L-22 structural enforcement guarantees: the spec parser
rejects malformed approval flows before they ever reach the runtime,
not the runtime catching them at execution.

---

## §4 Approval persistence

Per the G-10-9 decision recommendation (Path B — parallel table), the
schema addition:

```typescript
// packages/crm/src/db/schema/workflow-approvals.ts
export const workflowApprovals = pgTable("workflow_approvals", {
  id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
  runId: uuid("run_id").notNull().references(() => workflowRuns.id, { onDelete: "cascade" }),
  stepId: text("step_id").notNull(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),

  // Approver binding (snapshotted at creation; resolution re-checks).
  approverType: text("approver_type").notNull(),  // "operator" | "client_owner" | "user_id"
  approverUserId: uuid("approver_user_id"),       // resolved user; null until resolved at runtime

  // Status state machine.
  status: text("status").notNull().default("pending"),
  // values: "pending" | "approved" | "rejected" | "timed_out" | "cancelled"

  // Context payload (snapshot at request time — immutable).
  contextTitle: text("context_title").notNull(),
  contextSummary: text("context_summary").notNull(),
  contextPreview: text("context_preview"),
  contextMetadata: jsonb("context_metadata").$type<Record<string, unknown>>(),

  // Timeout (denormalized from spec for cron sweep efficiency).
  timeoutAction: text("timeout_action").notNull(),  // "abort" | "auto_approve" | "wait_indefinitely"
  timeoutAt: timestamp("timeout_at", { withTimezone: true }),  // null iff action="wait_indefinitely"

  // Resolution audit trail.
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedByUserId: uuid("resolved_by_user_id"),
  resolutionComment: text("resolution_comment"),
  resolutionReason: text("resolution_reason"),  // "approved" | "rejected" | "timed_out_abort" | "timed_out_auto_approve" | "cancelled_with_run"

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Pending-approvals lookup per workspace (admin /agents/approvals).
  index("workflow_approvals_org_pending_idx")
    .on(table.orgId)
    .where(sql`status = 'pending'`),
  // Per-user pending approvals (notification follow-up + portal).
  index("workflow_approvals_user_pending_idx")
    .on(table.approverUserId)
    .where(sql`status = 'pending' AND approver_user_id IS NOT NULL`),
  // Timeout cron sweep.
  index("workflow_approvals_timeout_pending_idx")
    .on(table.timeoutAt)
    .where(sql`status = 'pending' AND timeout_at IS NOT NULL`),
  // Per-run lookup (admin drawer + cascading cancel).
  index("workflow_approvals_run_idx").on(table.runId),
]);
```

### 4.1 Status state machine

```
                  pending
                  /  |  \
             approve reject timeout
                /    |     |
          approved rejected  ┌───────────┐
                             ▼           ▼
                      timed_out_abort  timed_out_auto_approve
```

Plus `cancelled_with_run` for the case where a run is cancelled while
an approval is pending (DB cascade deletes via runId FK; or status
update if we want to preserve the audit trail — recommendation:
status='cancelled' + keep the row for forensics).

### 4.2 Idempotency considerations

Concurrent approve/reject from two browser tabs is the realistic
concurrency case. Two enforcement layers:

1. **Optimistic lock at API:** `UPDATE workflow_approvals SET status='approved', resolved_by_user_id=$X, resolved_at=NOW() WHERE id=$Y AND status='pending' RETURNING ...`. If row count = 0, return 409 Conflict (someone else won).
2. **Status state machine in code:** the resolution path checks
   `status === 'pending'` before dispatching the resume — defense in
   depth in case the optimistic lock is bypassed.

The dispatcher subscribes to "approval resolved" via a direct call
from the API route (no event-loop indirection), guaranteeing the
race is contained.

### 4.3 Indexes justified

Each index has a specific query pattern in mind:
- `org_pending_idx` — `/agents/approvals` lists pending approvals
  for the workspace (frequent; partial index keeps it tiny — only
  pending rows indexed)
- `user_pending_idx` — "your pending approvals" notification
  follow-ups + the future client portal
- `timeout_pending_idx` — cron sweep for timeout resolution (per the
  await_event timeout-pending-idx pattern from SLICE 6)
- `run_idx` — admin drawer at `/agents/runs/[runId]` + cascade
  cleanup

---

## §5 Runtime implementation

### 5.1 `dispatchRequestApproval`

New file: `packages/crm/src/lib/workflow/step-dispatchers/request-approval.ts`.

```typescript
export type DispatchRequestApprovalContext = {
  resolveApprover: ApproverResolver;  // closure over (orgId, db)
  notifyApprover: ApproverNotifier;   // closure over SMS+email APIs
  now: () => Date;
};

export async function dispatchRequestApproval(
  run: StoredRun,
  step: RequestApprovalStep,
  ctx: DispatchRequestApprovalContext,
): Promise<NextAction> {
  // Resolve approver to user record (operator → org.ownerId,
  // client_owner → org.clientContactUserId, user_id → direct lookup).
  const approver = await ctx.resolveApprover(run.orgId, step.approver);
  if (!approver) {
    return { kind: "fail", reason: `request_approval: approver "${step.approver.type}" could not be resolved for org ${run.orgId}` };
  }

  // Compute timeoutAt per the discriminated union.
  const timeoutAt = step.timeout.action === "wait_indefinitely"
    ? null
    : new Date(ctx.now().getTime() + step.timeout.seconds * 1000);

  // Resolve interpolations in context fields (title/summary/preview).
  const resolvedContext = {
    title: resolveInterpolations(step.context.title, run),
    summary: resolveInterpolations(step.context.summary, run),
    preview: step.context.preview ? resolveInterpolations(step.context.preview, run) : null,
    metadata: step.context.metadata ?? {},
  };

  return {
    kind: "pause_approval",
    approverUserId: approver.userId,
    approverType: step.approver.type,
    contextTitle: resolvedContext.title,
    contextSummary: resolvedContext.summary,
    contextPreview: resolvedContext.preview,
    contextMetadata: resolvedContext.metadata,
    timeoutAction: step.timeout.action,
    timeoutAt,
    onApproveNext: step.next_on_approve,
    onRejectNext: step.next_on_reject,
  };
}
```

### 5.2 New NextAction variant: `pause_approval`

In `packages/crm/src/lib/workflow/types.ts`:

```typescript
export type NextAction =
  | { kind: "advance"; next: string | null }
  | { kind: "pause_event"; eventType: string; matchPredicate: ...; timeoutAt: Date }
  | { kind: "pause_timer"; ... }
  | { kind: "pause_approval"; approverUserId: string; approverType: ApproverType; contextTitle: string; contextSummary: string; contextPreview: string | null; contextMetadata: Record<string, unknown>; timeoutAction: TimeoutAction; timeoutAt: Date | null; onApproveNext: string | null; onRejectNext: string | null }
  | { kind: "fail"; reason: string };
```

`applyAction()` in `runtime.ts` adds a new case:

```typescript
case "pause_approval": {
  await context.storage.createApproval({
    runId: run.id,
    stepId: run.currentStepId ?? "unknown",
    orgId: run.orgId,
    approverType: action.approverType,
    approverUserId: action.approverUserId,
    contextTitle: action.contextTitle,
    contextSummary: action.contextSummary,
    contextPreview: action.contextPreview,
    contextMetadata: action.contextMetadata,
    timeoutAction: action.timeoutAction,
    timeoutAt: action.timeoutAt,
  });
  await context.storage.updateRun(run.id, { status: "waiting" });
  // Best-effort notification — failure logged, NOT blocking (per
  // L-22-style discipline; the approval row exists either way).
  context.notifyApprover?.(action).catch((err) => {
    console.warn("[approval-notify] failed", { runId: run.id, error: ... });
  });
  return true;
}
```

### 5.3 Resume path

New entry point: `resumeApproval(context, approval, resolution, resolverUserId, comment?)`.

```typescript
export async function resumeApproval(
  context: RuntimeContext,
  approval: WorkflowApproval,
  resolution: "approved" | "rejected" | "timed_out_abort" | "timed_out_auto_approve",
  resolverUserId: string | null,
  comment?: string,
): Promise<void> {
  // Optimistic lock at the storage layer.
  const claimed = await context.storage.claimApproval({
    approvalId: approval.id,
    resolverUserId,
    resolution,
    comment,
    now: context.now(),
  });
  if (!claimed) return;  // someone else won

  // Load run + step spec.
  const run = await context.storage.loadRun(approval.runId);
  if (!run || run.status !== "waiting") return;  // run advanced or was cancelled

  const step = findStep(run.specSnapshot, approval.stepId) as RequestApprovalStep;
  const nextStepId = (resolution === "approved" || resolution === "timed_out_auto_approve")
    ? step.next_on_approve
    : step.next_on_reject;

  await advanceTo(context, run, nextStepId);
}
```

### 5.4 Race conditions

| Race | Mitigation |
|---|---|
| Two browser tabs both approve | Optimistic lock (`UPDATE ... WHERE status='pending' RETURNING`) returns 0 for the loser; API returns 409 |
| Approve then immediately reject | Same optimistic lock — second resolution returns 409 |
| Approve while timeout cron is sweeping | Same optimistic lock — whoever lands first wins; the other no-ops |
| Cancel run while approval pending | Cascade FK on runId deletes approval rows OR status='cancelled_with_run' (decision: keep the row for audit trail; mark cancelled) |
| Resolve approval after run is already terminal | `loadRun()` returns terminal status; resume early-returns without effect; approval row's resolution still recorded for audit |
| Approval row exists but the step type changed in the spec snapshot | Spec snapshot is immutable per run (locked at startRun); this can't happen for an existing run — guaranteed by spec snapshotting (validated at SLICE 5+ design) |

### 5.5 L-17 dispatcher orthogonal interleaving prediction

This is the **fourth data point** for the dispatcher orthogonal
interleaving multiplier (L-17 sub-rule from SLICE 7).

Prior data points:
- SLICE 6 branch dispatcher: 1.5x predicted, ~1.5x actual
- SLICE 7 message-trigger dispatcher: 2.0x predicted, ~1.9x actual
- SLICE 8 test-mode dispatcher integration: 1.6x predicted, ~1.7x actual

For SLICE 10:
- New dispatcher `dispatchRequestApproval` is orthogonal to existing
  step dispatchers (no shared mutable state; pause action is
  symmetric to existing pause_event)
- Resume path `resumeApproval` reuses `advanceTo` infrastructure
- Storage layer adds `createApproval` + `claimApproval` + `loadApproval`
  (parallel to wait equivalents)

**Prediction:** ~1.7-1.9x test/prod multiplier on the dispatcher
specifically. Estimate ~150 prod LOC dispatcher → ~270-285 LOC test;
parallel to SLICE 7. If actual lands above ~330 LOC test (>2.2x),
that's a fourth-point outlier worth flagging.

---

## §6 Approver notification

### 6.1 Notification mechanism

Reuse `sendSmsFromApi` + `sendEmailFromApi` from §2.6.

Per G-10-3, recommended default: **email-first**, with SMS as a
configurable opt-in per workspace. Email is more universally available
(no phone number required for many users), supports the longer
context preview (which would truncate badly in SMS), and includes
the approval link as a clickable URL.

The notification dispatcher:

```typescript
// packages/crm/src/lib/workflow/approval-notifier.ts
export async function notifyApprover(
  approval: PendingApproval,
  approver: ResolvedApprover,
  ctx: NotifyContext,
): Promise<void> {
  const link = `${ctx.appBaseUrl}/agents/approvals/${approval.id}`;
  const subject = `Action needed: ${approval.contextTitle}`;
  const body = `
Hi ${approver.name},

${approval.contextSummary}

Review and respond: ${link}

${approval.timeoutAt ? `This request expires at ${approval.timeoutAt.toLocaleString()}.` : ''}
  `.trim();

  await sendEmailFromApi({
    orgId: approval.orgId,
    userId: approver.userId,
    contactId: null,
    toEmail: approver.email,
    subject,
    body,
  });
}
```

Failure handling: per L-22-style discipline, notification failure is
logged (`console.warn` + `workflow_event_log` entry) but does NOT
block the approval — the row exists, the admin UI shows it, the user
can still find it via dashboard polling. This is consistent with the
recordLlmUsage swallow-and-log pattern from SLICE 9 PR 2 C4.

### 6.2 Configurable notification preferences

Per G-10-3, the v1 ships with:
- Email always (operator + client_owner + user_id all default to
  email)
- SMS deferred to post-launch (requires phone number on user record;
  may not exist for many invited users)

Per-workspace SMS opt-in is a follow-up; the dispatcher signature
accommodates the future expansion (`notifyApprover` already supports
both channels via the existing API primitives).

### 6.3 Test mode interaction

When workspace test mode is on, approval notifications route through
the test-mode resolvers automatically (SLICE 8 G-8-7). Operator
testing the approval flow gets sandbox emails (e.g., to a
controlled test inbox), so they can verify the full approval flow
without spamming real recipients.

This is "free" — no SLICE 10 code needed; the SMS/email APIs already
handle the routing.

---

## §7 Admin UI surface for pending approvals

### 7.1 Two surfaces, one composition

**Surface A: dedicated `/agents/approvals` page** — workspace-wide
list of pending approvals. Approver-first view. The "morning standup"
view for the operator: "what's waiting for me?"

**Surface B: drawer block in `/agents/runs`** — when viewing a
specific run that has a pending approval, see the approval inline in
the run drawer. Run-first view. The "I'm investigating this run"
context.

Both surfaces are necessary; a single surface fragments the workflow
(operator can't get to the approval from the run view, OR operator
can't see "what needs my attention right now" without knowing which
runs to check).

### 7.2 `/agents/approvals` page composition

Reuses existing primitives:

- `PageShell` — header + content wrapper (SLICE 4 PR 1)
- `EntityTable` — list view (SLICE 4 PR 1)
- `Sheet` (drawer) for the approval detail (already used in
  `/agents/runs`)
- `Button` + `Textarea` for approve/reject + comment

Server page: loads pending approvals for `getOrgId()`, joins
workflow_runs for archetype name, serializes for the client component.

Client: same polling pattern as `/agents/runs` (2s refresh,
visibility-change handler). Approve/reject API calls via fetch
matching the existing resume/cancel pattern.

### 7.3 Drawer block in `/agents/runs`

New section in `runs-client.tsx` drawer (parallel to the existing
"Waiting for event" block at lines 221-258):

```tsx
{selectedPendingApproval ? (
  <section className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
    <h3 className="font-medium">Waiting for approval</h3>
    <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
      <dt className="text-muted-foreground">Approver</dt>
      <dd>{selectedPendingApproval.approverName} ({selectedPendingApproval.approverType})</dd>
      <dt className="text-muted-foreground">Asked</dt>
      <dd className="font-medium">{selectedPendingApproval.contextTitle}</dd>
      <dt className="text-muted-foreground">Summary</dt>
      <dd>{selectedPendingApproval.contextSummary}</dd>
      {selectedPendingApproval.contextPreview ? (
        <>
          <dt className="text-muted-foreground">Preview</dt>
          <dd><pre className="font-mono text-[11px] bg-background border border-border rounded p-2 overflow-x-auto whitespace-pre-wrap">{selectedPendingApproval.contextPreview}</pre></dd>
        </>
      ) : null}
      <dt className="text-muted-foreground">Timeout</dt>
      <dd>{selectedPendingApproval.timeoutAt ? new Date(selectedPendingApproval.timeoutAt).toLocaleString() : "no timeout"}</dd>
    </dl>
    {currentUserCanApprove ? (
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="default" onClick={() => handleApprove(...)}>Approve</Button>
        <Button size="sm" variant="outline" onClick={() => handleReject(...)}>Reject</Button>
      </div>
    ) : (
      <p className="text-xs text-muted-foreground">Pending {selectedPendingApproval.approverName}'s decision.</p>
    )}
  </section>
) : null}
```

### 7.4 L-17 UI composition multiplier

Per the L-17 0.94x baseline (SLICE 4a empirical), UI composition that
reuses primitives lands at ~0.94x test/prod ratio.

Estimate:
- `/agents/approvals` page (server): ~80 prod LOC (mostly query + serialization)
- `/agents/approvals` client (table + drawer + handlers): ~180 prod LOC
- Drawer block in runs-client.tsx: ~50 prod LOC (parallel to existing
  pending-event block)

Total UI prod: ~310 LOC.

Predicted UI test LOC at 0.94x: ~290.
Predicted dedicated UI tests: ~5-7 (formatter / visibility / authz
gating). Most coverage piggy-backs on the integration tests in §5.

If UI test LOC lands above ~400 (>1.3x), that's a fourth UI
composition data point worth investigating against the 0.94x baseline.

### 7.5 L-22 structural enforcement on the surface

Two enforcement points:

1. **API authz:** `/api/v1/workflow-approvals/[id]/resolve` checks
   `getCurrentUser()` + verifies the user is the bound `approverUserId`
   (or has org-owner override). 403 if not.
2. **UI display:** the approve/reject buttons render only if the current
   user matches the approver. Otherwise the section reads "Pending
   {approver.name}'s decision." Defense in depth — the API is the
   true gate; the UI just doesn't tempt unauthorized actions.

---

## §8 Customer-facing implications

### 8.1 The `client_owner` approver shape

When `approver.type === "client_owner"` and the workspace's client
owner is a user (not just an email/phone), the existing `/agents/approvals`
admin surface works for them too — they log in to their assigned
workspace and resolve approvals from the dashboard. No new UI
needed for the "client is also a SeldonFrame user" case.

### 8.2 The `client_owner` who is NOT a user (most common case)

The realistic shape: agency operator deploys a workspace for their
client; the client doesn't have a SeldonFrame account; the client
gets emailed approval requests directly.

**Recommended v1 path (per G-10-8):**
- Email contains a magic-link token (signed JWT or short-lived
  random + DB lookup) that grants single-use approve/reject access
  to a lightweight customer-facing approval surface
- Surface is a single-page route: `/approvals/[token]` — shows the
  approval context + Approve / Reject buttons
- No login required (token IS the auth)
- Token expiry: 7 days OR until resolved (whichever first)
- Surface is stripped-down: SeldonFrame brand, the approval ask, two
  buttons. Mobile-first.

**Out of scope for v1:**
- Self-serve account creation for client owners (defer to post-launch)
- Client portal with approval history (defer; current ask is just
  resolve-and-go)
- SMS-reply-based approvals ("reply YES to approve") — covered in
  G-10-8 as a post-launch option

### 8.3 Security posture

Magic-link tokens carry approval authority; security implications:

- Tokens MUST be single-use (status='pending' → resolution invalidates
  the token via the same optimistic lock as the admin surface)
- Tokens MUST expire (7 days OR resolution; whichever first)
- Email must be sent to the right address (verified via the
  `client_contact_user_id` column or, if the org doesn't have one
  set, the dispatcher returns `pause_approval` with `approverUserId=null`
  and the surface displays "client owner not configured for this
  workspace" — operator must resolve via fallback)
- No token in URL fragments — token in path so it doesn't get sent
  to analytics

---

## §9 Gate items

Eight substantive decisions requiring Max's resolution before any
code lands. Default recommendations are noted for each.

### G-10-1: Approver model — operator-only vs client_owner vs user_id vs all three

**Recommendation: all three** (operator | client_owner | user_id).

**Rationale:** the three §1.2 worked examples each map to a different
approver type. operator covers (A) and (B); client_owner covers (C);
user_id covers role-based delegation (e.g., "approval goes to the
finance team member, not the workspace owner"). Two-of-three would
exclude a worked example. All-three adds ~50 LOC vs single-approver
(the discriminated union + resolver branches) and is forward-compatible
with delegation patterns (G-10-7).

**Tradeoff:** wider surface area for V1 = more validator tests +
more resolver code + more notification paths. Mitigated by sharing
the resolver indirection (one `resolveApprover` function with three
internal cases).

### G-10-2: Timeout behavior — abort vs auto_approve vs configurable required

**Recommendation: configurable required** (the discriminated union in
§3.1; no default — author MUST specify).

**Rationale:** "default to abort" silently fails workflows; "default
to auto_approve" silently bypasses the gate (worst possible default
— defeats the entire feature's purpose); "default to wait_indefinitely"
fills `workflow_runs` with zombies. Forcing the author to specify
keeps the choice visible at spec-write time.

**Tradeoff:** longer specs (every approval step has a timeout block).
Acceptable — the alternative is silent footguns.

### G-10-3: Notification mechanism — SMS, email, both, configurable per workspace

**Recommendation: email-first in v1** (§6.2), with SMS via per-workspace
opt-in deferred to post-launch.

**Rationale:** email is universal (every user has one; phone numbers
aren't always populated); supports longer context previews (SMS
160-char limit is a poor fit for "here's the SMS draft, click to
approve"); test mode integration "for free" via SLICE 8 routing.

**Tradeoff:** email latency + spam-filter risk vs SMS immediacy. For
the launch ICP (agency operators reviewing during business hours),
email latency is acceptable; for genuinely time-sensitive approvals
the operator will want SMS — defer to post-launch when phone-number
storage is more universally adopted.

### G-10-4: Approval surface location — dedicated page vs inline only vs both

**Recommendation: both** (dedicated `/agents/approvals` page +
inline drawer block in `/agents/runs`).

**Rationale:** §7.1 — dedicated page is the "what needs my attention"
view; drawer is the "I'm investigating this run" view. Both serve
distinct workflows; either alone fragments operator attention.

**Tradeoff:** ~80 LOC + 1 server route added vs single surface. Cost
is small; UX gain is real.

### G-10-5: Bulk approval — single only vs batch approval for related items

**Recommendation: single-only in v1.**

**Rationale:** batch approval is a power-user feature that becomes
valuable after operators have measurable approval volume. Premature
to ship before usage signals show what "related items" means in
practice. v1 ships with cleanly-modeled single approvals; batch is
a follow-up that doesn't require schema migration (UI groups
multiple `workflow_approvals` rows into one resolution call; status
update is per-row inside a transaction).

**Tradeoff:** operators with high approval volume will feel friction
in the early weeks. Mitigated by surface design (sortable / filterable
list).

### G-10-6: Audit trail — visibility default

**Recommendation: visible always** (resolved_by, resolved_at,
resolution_reason, comment all displayed in the admin UI for resolved
approvals).

**Rationale:** audit trail is the primary forensic surface when an
approval goes wrong ("who approved this and why?"). Hiding it by
default is anti-pattern for an enterprise / agency context where
disputes happen. The schema captures it; the UI shows it; no toggle
needed.

**Tradeoff:** wider UI for resolved approvals (extra rows in the dl).
Acceptable.

### G-10-7: Approval permissions — workspace-owner only vs role-based vs delegation

**Recommendation: approver-bound (no separate permission concept) in v1.**

**Rationale:** the approver is named in the spec (operator |
client_owner | user_id). At resolution time, the API checks the
current user matches the bound approver. No additional role-based
permission system; no delegation. v1's mental model: "the spec says
who approves this; only that person approves it."

This is intentionally narrower than RBAC — wider scope opens design
surface (delegation chains, approval pools, escalation rules) that
v1 doesn't have evidence the ICP needs. Post-launch expansion
candidates: approval pools (any-of N approvers), delegation
("Maria is OOO, route to Marcus this week"), escalation ("if the
operator doesn't respond in 4h, route to the workspace owner").

**Tradeoff:** workspaces with team members but a single named
approver will feel friction ("I should be able to approve this for
Maria"). Mitigated by org-owner override (workspace owner can always
resolve — defense in depth + escape valve when the named approver
is unavailable).

### G-10-8: Client approval surface — magic-link vs SMS-reply vs portal vs none

**Recommendation: magic-link email in v1** (§8.2).

**Rationale:** magic-link is the lowest-friction path that reaches
non-SeldonFrame-user clients with adequate security; SMS-reply
requires sophisticated message-trigger reasoning that doesn't yet
exist; portal requires account creation flow that adds adoption
friction. Magic-link is the standard pattern across approval/sign
products (DocuSign, Stripe Express, etc.) and clients recognize it.

**Tradeoff:** email-only for v1 means agency operators with clients
who don't check email regularly will feel friction. SMS-reply is a
clean post-launch addition (extends the existing SLICE 7 message-trigger
infrastructure with an "approval-reply" pattern type).

### G-10-9: Persistence model — extend workflow_waits vs new workflow_approvals table

**Recommendation: new workflow_approvals table (Path B).**

**Rationale:** the two concerns differ enough to warrant separation:
- workflow_waits is event-arrival semantics (eventType, matchPredicate)
- workflow_approvals is human-action semantics (approverUserId,
  contextTitle, resolutionComment)

Forcing both into one table requires nullable columns on both sides
(eventType nullable for approval; approverUserId nullable for events)
and a discriminator that runtime code constantly switches on. Two
clean tables with focused indexes are easier to reason about + easier
to extend (e.g., adding `approval_pool` semantics post-launch doesn't
touch workflow_waits).

The runtime cost of "two tables" is one extra cron job (timeout sweep
for approvals parallel to the existing workflow_waits sweep) and one
extra admin query path (UNION not needed; the two surfaces query
different tables). Net: cleaner separation pays for itself.

**Tradeoff:** schema breadth (a third workflow-state table — runs,
waits, approvals). Justified by the semantic distinction.

---

## §10 LOC projection (calibration applied)

Applying L-17 calibration framework + SLICE 1-9 actuals:

| Component | Prod LOC | Test LOC | Notes |
|---|---|---|---|
| Schema + cross-ref validator | ~150 | ~280 | 5 cross-ref edges; L-17 SLICE 7 hypothesis applied (gate-breadth scaling) |
| workflow_approvals table + storage | ~180 | ~150 | Drizzle table + adapter + in-memory fake |
| Migration 0027 | ~25 | n/a | Additive ALTER TABLE + CREATE TABLE |
| Runtime dispatcher (`dispatchRequestApproval`) | ~120 | ~220 | L-17 dispatcher orthogonal interleaving (4th data point); ~1.8x predicted |
| Runtime resume path (`resumeApproval`) | ~80 | ~150 | Parallel to `resumeWait` |
| Approver resolver | ~70 | ~100 | 3 cases × 2-3 tests each |
| Notification dispatcher | ~80 | ~120 | Reuses sendEmailFromApi; thin wrapper |
| API routes (resolve / list / cancel) | ~150 | ~180 | 3 endpoints + authz tests |
| `/agents/approvals` server page | ~80 | ~30 | Server query + serialization (low test surface; integration coverage) |
| `/agents/approvals` client | ~180 | ~80 | Table + drawer + handlers; 0.94x mostly via integration |
| Drawer block in `/agents/runs` | ~50 | ~30 | Parallel to pending-event block |
| Magic-link route + token | ~120 | ~150 | Token sign/verify + single-use enforcement |
| Customer-facing `/approvals/[token]` page | ~100 | ~50 | Stripped-down server + minimal client |
| Integration tests (slice-10-integration.spec.ts) | n/a | ~250 | Full pause→approve→resume + reject + timeout |
| Cost-attribution integration test | n/a | ~80 | §15 invariant |
| **Subtotal — code + tests** | **~1,385** | **~2,070** | |
| Audit (this doc) | n/a | n/a | Artifact (~600 LOC equivalent in markdown) |
| Close-out + regression | n/a | n/a | ~250 LOC artifacts (probes + close-out) |

**Total prod LOC: ~1,385**
**Total test LOC: ~2,070**
**Combined code: ~3,455 LOC**
**Doc artifacts: ~850 LOC**

**Per Max's spec budget guidance:**
- Stated range: 1,200-1,800 LOC code + ~400 LOC artifacts
- Stop trigger: 30% over upper = ~2,340 code

**Audit-time flag:** the test LOC alone (~2,070) brushes the audit's
flag threshold (audit asks to flag if projection exceeds 2,000). The
prod LOC is in-band (1,385 within 1,200-1,800). The combined code
(3,455) materially exceeds the upper bound (1,800) once tests are
counted.

**Recommendation:** the budget framing in the spec appears to count
prod LOC only (matching the SLICE 9 PR 2 actuals: 1,690 prod /
~3,800 doc — tests not enumerated separately). If the budget is
prod-only, the projection lands well within range (1,385 / 1,800 =
77% of upper). If the budget is prod + test combined, this audit
flags the projection as **15-20% over** and recommends the 2-PR split
in §11 below.

**Calibration confidence:** L-17 multipliers have empirically held
±20% across SLICEs 4a, 6, 7, 8, 9. SLICE 10's projection is built
from those same multipliers + ground-truth file inventories; high
confidence in the prod LOC range, ±15% confidence in the test LOC
range (the magic-link token + customer surface are the most
estimation-uncertain components, since they touch new infra).

---

## §11 Proposed PR structure

### 11.1 Single PR (recommended if prod LOC budget holds)

If §10's prod-only projection (1,385 LOC) holds, ship as a single
PR with mini-commits:

| # | Scope | Est. prod | Est. test |
|---|---|---|---|
| C0 | Audit (this doc) | n/a | n/a |
| C1 | Schema (`RequestApprovalStepSchema`) + cross-ref validator | 150 | 280 |
| C2 | Migration 0027 + workflow_approvals table + storage | 205 | 150 |
| C3 | Dispatcher + resume + approver resolver + notifier | 350 | 590 |
| C4 | API routes (resolve / list / cancel) | 150 | 180 |
| C5 | Admin UI — `/agents/approvals` page + drawer block | 310 | 140 |
| C6 | Magic-link customer surface (token + page) | 220 | 200 |
| C7 | Integration tests + cost-attribution invariant | n/a | 330 |
| C8 | 18-probe regression + SLICE 10 close-out | n/a | n/a |
| **Total** | | **~1,385** | **~2,070** |

### 11.2 Two-PR split (if scope expands)

Natural seam: **PR 1 = primitive + persistence + dispatcher + API**
(no UI, no customer surface); **PR 2 = admin UI + customer surface +
integration tests + close-out.**

PR 1 (~750 prod / ~1,200 test): C1-C4 above. Closes when
the dispatcher works end-to-end via API calls. No human-facing
surface; the resume path is verifiable by integration tests calling
the API directly.

PR 2 (~635 prod / ~870 test): C5-C8. Closes when an operator can
end-to-end open an approval, see it in the dashboard, click approve,
and see the workflow resume. Vercel preview verifiable.

The split is clean — PR 1 has zero UI surface (only API + dispatcher
+ schema), PR 2 layers UI on top. Risk: PR 2 discovers a schema gap
that requires PR 1 amendments. Mitigation: §10's gate decisions are
all settled before PR 1 begins, minimizing PR 2 schema discoveries.

### 11.3 Recommendation

**Single PR** unless gate decisions add scope (e.g., G-10-3 going to
"both SMS + email" or G-10-7 going to "RBAC + delegation"). The
split is a fallback if mid-implementation surprises push prod LOC
over ~1,700.

---

## §12 Dependencies

SLICE 10 depends on:
- Workflow runtime (SLICE 2c) — pause/resume infrastructure
- workflow_waits + timeout handling (SLICE 2c, SLICE 6 timeout cron)
  — pattern parallel to the new approval timeout cron
- SLICE 4a admin composition patterns (PageShell, EntityTable,
  drawer pattern from `/agents/runs`)
- Cost observability shipping points (SLICE 9 PR 2 C4-C5) — verified
  in §2.8 to work transparently across approval pause boundary
- User identity model (users + orgMembers + organizations) — for
  approver resolution

SLICE 10 is **independent** of:
- SLICE 5 (schedule triggers) — orthogonal
- SLICE 6 (branch primitive) — orthogonal; approval composes with
  branch (e.g., "branch on amount; if > $X, request_approval; else
  send")
- SLICE 7 (message triggers) — orthogonal; future SMS-reply approval
  would use this infra (post-launch)
- SLICE 8 (test mode) — orthogonal; test mode routes notifications
  through sandbox automatically (§6.3)
- SLICE 9 HVAC archetypes — workspace-scoped; integration examples
  optional and out of SLICE 10 PR scope

---

## §13 Out of scope (explicit)

- **Multi-step approval workflows** (chained approvers — "Maria
  approves, then Marcus approves") — builders chain multiple
  request_approval steps if they need this
- **Approval delegation to other users** ("Maria is OOO, route to
  Marcus this week") — fixed approver per step in v1
- **Conditional approval rules** ("auto-approve under $X, require
  approval above") — author handles this with explicit branch +
  request_approval composition
- **Approval analytics dashboard** ("approval rate per archetype",
  "median resolution time") — defer to post-launch observability
- **SLA tracking** ("approval breached 4h SLA") — post-launch
- **Mobile app for approvals** — web-only in v1 (mobile-responsive
  customer-facing surface; no native app)
- **Approval pools** ("any of these 3 people can approve") —
  post-launch
- **Escalation rules** ("if no response in 4h, route to backup
  approver") — post-launch
- **SMS-reply-based approvals** — post-launch (extends SLICE 7
  message-trigger infrastructure)
- **Bulk approval** (G-10-5 deferred) — post-launch
- **Approval history page** for clients — post-launch

---

## §14 End-to-end flow continuity

### 14.1 HVAC archetype integration examples (documentation only)

Two SLICE 9 archetypes have natural approval insertion points. These
examples DEMONSTRATE the primitive's value but the archetype edits
themselves are NOT in SLICE 10 PR scope (per §11; archetype edits
land in a follow-up "approval integration" mini-PR or in operator-
authored customizations).

**Example 1: hvac-heat-advisory-outreach + approval gate**

Currently the heat-advisory archetype (SLICE 9 PR 2 C2) fires:
schedule → external_state weather → load_vulnerable_customers →
send_advisory (SMS to all matched customers) → log_outreach.

With approval gate inserted:
```
schedule → external_state → load_vulnerable_customers →
  request_approval (operator reviews recipient list + body draft) →
  on_approve: send_advisory → log_outreach
  on_reject: log_rejected_advisory (emit_event for dashboard)
```

The approval surface shows: "Heat Advisory: 6 vulnerable customers
matched. Sample message: 'Heads up — 110°+ tomorrow. Want a free AC
check before it hits? Reply YES.' Approve to send, reject to skip
today's run."

This integration converts the 5-step archetype to a 7-step
archetype; primitive count rises by 1 (request_approval); workflow
runtime cost stays at zero LLM calls. The change is value-positive
for any operator who hasn't yet built full trust in the heat
advisory copy.

**Example 2: hvac-post-service-followup + threshold approval**

Currently post-service-followup (SLICE 9 PR 2 C3) fires:
payment.completed → wait 24h → send satisfaction SMS → await reply →
branch on rating → high → request_review / low → log_escalation.

With threshold approval on the review request (G-10-7 use case):
```
... → branch on rating → high →
  request_approval (operator reviews the review-request SMS before
    it goes to a customer who paid > $X) →
  on_approve: request_review
  on_reject: log_skipped_review
```

This adds a quality gate on review requests for high-value customers
where a poorly-timed review ask could damage the relationship.
Operator can quickly approve from dashboard; gate doesn't fire for
small-payment customers (the branch step gates on amount).

### 14.2 Test cases derived from the integrations

Both integrations become integration tests in
`tests/unit/slice-10-integration.spec.ts`:
- Heat advisory pauses on approval; approving advances to send;
  rejecting branches to log
- Post-service threshold approval fires only above amount threshold;
  approval routing matches expected next steps

Neither test ships as an actual archetype change in SLICE 10 — they
exercise the primitive in realistic compositions for confidence.

### 14.3 Launch content implications

The approval flow is the missing piece that makes the ICP narrative
("agency deploys agents on clients' behalf") credible in launch
content. Post-launch content rewrite (per Max's directive — deferred
until after MCP rewrite) should foreground:
- "The approval gate that lets your client see what we're about to
  do, before we do it"
- The Heat Advisory + approval composition as the visual demo (the
  drawer screenshot showing the SMS draft + approve/reject buttons
  is the moneyshot)

---

## §15 Risk register

| Risk | Mitigation |
|---|---|
| **Approval bottleneck** — operator OOO; approvals pile up | Configurable timeout_action (G-10-2). For workflows where stale-but-acted-on is worse than no-action, author chooses `abort`. For workflows where the action is reversible / low-stakes, author chooses `auto_approve`. For human-in-the-loop critical paths, author chooses `wait_indefinitely` and accepts the queue. |
| **Notification delivery failure** — operator never sees the request | (a) Visible `/agents/approvals` dashboard — operator can find pending approvals without notification. (b) Notification failure logged + visible in `workflow_event_log`. (c) Post-launch: re-notify reminder cron (24h, 72h). |
| **Race conditions on concurrent approve/reject** | Optimistic lock at storage (§4.2); 409 returned to losing party. Status state machine in code is defense in depth. |
| **Approval surface security (unauthorized users approving)** | API authz checks current user matches bound approver (§7.5). Magic-link tokens are single-use and time-limited (§8.3). UI doesn't render approve buttons for unauthorized users. |
| **Cost attribution gap** — long-running approval pause causes long workflow_run; cost calculation must continue after resume | §2.8 verified: `recordLlmUsage()` operates on runId, status-agnostic; cost capture continues across pause boundary. Dedicated integration test in §10 (`approval-cost-attribution.spec.ts`) verifies invariant. |
| **Approval payload bloat** — operators stuff massive metadata into context.preview/metadata, blowing up storage | Schema caps: `preview` max 4000 chars; `metadata` is JSONB with no hard cap but the admin UI truncates display at 8KB. Storage cost is negligible per row; per-org row count is the real scaling concern (see next risk). |
| **Approval table growth** — workspaces accumulate thousands of resolved approvals over time | v1: keep all resolved approvals indefinitely (audit value). Post-launch: introduce 90-day archival (move resolved rows to `workflow_approvals_archive` table) once row counts approach 100k+ per workspace. |
| **Magic-link token leakage** — client owner forwards approval email to a colleague | Tokens are single-use; first-clicker resolves. The colleague can't double-resolve. Audit trail captures `resolved_by_user_id`-equivalent (token-resolved approvals record `resolution_reason: "magic_link"` + the magic-link's hashed identifier). Out-of-band concern: if client owners regularly forward, the agency conversation is "you're inviting governance ambiguity into your own workflow" — product can't enforce intent here. |
| **Approval surface goes down** — `/agents/approvals` 500s; operator can't resolve | Vercel preview verification per L-27 catches this pre-merge. Production monitoring (post-launch concern) covers ongoing. The dispatcher itself is decoupled — pending approvals persist in the DB; an outage delays resolution but doesn't lose state. |

---

## §16 Vercel preview verification (per L-27)

Standard discipline applies:
- Every PR close: Vercel preview observed green by Max at the
  feature branch HEAD before SLICE 10 PR is opened.
- Post-merge: Vercel preview observed green by Max at main HEAD
  after merge.
- Both observations are external (screenshot or structured input);
  no inference accepted.
- L-27 applies regardless of slice — no exception for "small"
  PRs; the discipline IS the guardrail.

---

## §17 Test fixtures (per L-28 + retroactive addendum)

L-28 discipline applies:
- No format-matching test fixtures (no `sk_live_*`, no
  `AC[0-9a-f]{32}`, no `AKIA[A-Z0-9]{16}`, etc.)
- All credential-shaped fixture values use `FAKE_TEST_*` /
  `_NOT_REAL_KEY` / `ACFAKEnotARealTestSID` patterns
- Inline comment near each fixture block citing L-28

L-28 addendum (retroactive scope):
- Pre-PR self-review grep at every merge boundary
- Format-pattern grep across the whole codebase, not just the diff
- Any fixture violation found is fixed in the same PR before merge

For SLICE 10 specifically:
- Magic-link tokens in test fixtures use deliberately format-broken
  values (e.g., `magic_link_test_token_NOT_REAL`); real tokens
  are signed JWT or random bytes with high entropy
- Approver test fixtures use real-looking but clearly-fake user IDs
  (e.g., `00000000-0000-0000-0000-000000000001` is acceptable; uuid
  format but obviously sequential test data)
- API token fixtures (if any are introduced for the magic-link
  signing key) follow L-28 fully

---

## §18 Calibration framework status

Applied throughout this audit:

- **L-17 multipliers** — cross-ref Zod with gate breadth (§3.3),
  dispatcher orthogonal interleaving as 4th data point (§5.5), UI
  composition 0.94x (§7.4)
- **L-22 structural enforcement** — approval permissions at API
  layer + approver-step binding at parse time (§3.4, §7.5)
- **L-23** — N/A; no new global archetypes (SLICE 10 may add
  workspace-scoped archetype examples per §14.1, which preserves the
  28-streak baseline)
- **L-26** — canonical structural-hash for any regression report
  (will run at SLICE 10 close with the same 6-archetype baseline)
- **L-27** — Vercel preview verification mandatory (§16)
- **L-28 + retroactive addendum** — format-breaking test fixtures
  throughout (§17)

---

## §19 Stopping point

This audit is the C0 commit. Per L-21:
- No code commits until Max resolves G-10-1 through G-10-9
- Expect 1-2 revision rounds on this audit before code begins
- Audit lives at `tasks/step-10-request-approval-audit.md` (this file)

After Max's gate resolutions land, the audit is updated with the
chosen options + the implementation begins at C1 (schema). Each PR
boundary triggers L-27 verification; the SLICE 10 close-out triggers
the 18-probe regression to verify the 28-streak still holds.
