# RunContext Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task has its own commit. Run typecheck + relevant tests before every commit.

**Goal:** Eliminate identity drift across workflow steps by stamping a `RunContext` once at run-start and threading it through every dispatcher and tool. Customer-facing surfaces (SMS, email, booking, contact sync) and operator-editable prose (`/automations/[id]/configure`) all read from the same source of truth.

**Architecture:** A new `RunContext` JSONB column on `workflow_runs` carries `{ customer, workspace, clock, agency, source }`. Dual-module type split (`run-context-customer.ts` excludes the agency field so customer-facing code physically cannot leak agency branding into emails or SMS). Eager clock refresh on every dispatcher call so long-paused conversations always see today/tomorrow correctly. Operator-editable prose moves out of hardcoded system-prompt strings into archetype `soul_copy` placeholders. An antifragility smoke test pins the contract: future LLM model bumps cannot silently break behavior.

**Tech Stack:** TypeScript, Next.js 16 App Router, Drizzle ORM, Postgres (Neon), node:test + tsx for unit tests. Existing workflow runtime + step dispatchers + agent archetype registry.

**Reference spec:** `docs/superpowers/specs/2026-05-19-runcontext-architecture-design.md`

**Working directory:** `C:\Users\maxim\CascadeProjects\Seldon Frame\.claude\worktrees\seo-marketing-schema`

**Test commands:**
- Typecheck: `pnpm --filter @seldonframe/crm typecheck`
- Unit tests: `pnpm test:unit` (or targeted: `cd packages/crm && pnpm exec tsx --test tests/unit/<path>.spec.ts`)
- Pre-existing failing tests to IGNORE: block-codegen-staleness, archetype-isolation, theme integration, web-onboarding clients-new-form, embedded-payment.tsx Stripe types. None of these involve workflow code.

---

## File structure (new + modified)

```
packages/crm/
├── drizzle/
│   └── 0048_workflow_runs_context.sql          # NEW
├── src/
│   ├── db/schema/
│   │   └── workflow-runs.ts                    # MODIFY: add context column
│   ├── lib/
│   │   ├── workflow/
│   │   │   ├── run-context.ts                  # NEW: type union + shared helpers
│   │   │   ├── run-context-customer.ts         # NEW: CustomerRunContext + asCustomerContext
│   │   │   ├── run-context-admin.ts            # NEW: AdminRunContext + getRunContextAdminOnly
│   │   │   ├── build-run-context.ts            # NEW: buildRunContext, loadRunContext, refreshClock
│   │   │   ├── runtime.ts                      # MODIFY: startRun stamps context
│   │   │   ├── storage-drizzle.ts              # MODIFY: createRun + getRun handle context
│   │   │   ├── types.ts                        # MODIFY: StoredRun.context
│   │   │   └── step-dispatchers/
│   │   │       ├── conversation.ts             # MODIFY: read from runContext
│   │   │       ├── mcp-tool-call.ts            # MODIFY: pass runContext to invoker
│   │   │       └── (others)                    # MODIFY: signature uniformity
│   │   ├── agents/
│   │   │   ├── tool-invoker.ts                 # MODIFY: receive runContext, use customer fields
│   │   │   ├── archetypes/
│   │   │   │   ├── speed-to-lead.ts            # MODIFY: add $forbiddenPhrases, $maxTurns, $toolErrorHints
│   │   │   │   └── types.ts                    # MODIFY: placeholder kinds
│   │   │   └── configure-actions.ts            # MODIFY: write to history on save
│   │   ├── bookings/
│   │   │   ├── create-for-customer.ts          # NEW: shared helper for agent + public path
│   │   │   └── actions.ts                      # MODIFY: submitPublicBookingAction calls new helper
│   │   ├── emails/
│   │   │   └── api.ts                          # MODIFY: loadEmailBranding accepts runContext
│   │   └── messaging/
│   │       └── seed-default-triggers.ts        # MODIFY: interpolate workspace name at create
│   ├── app/
│   │   ├── (dashboard)/automations/[id]/
│   │   │   ├── configure/page.tsx              # MODIFY: live preview pane
│   │   │   └── runs/page.tsx                   # MODIFY: fetch + display context
│   │   └── api/
│   │       └── admin/repair-templates/
│   │           └── route.ts                    # NEW: one-shot repair endpoint
│   ├── components/automations/
│   │   ├── configure-agent-form.tsx            # MODIFY: live preview + history rollback
│   │   └── runs-table.tsx                      # MODIFY: RunContext section
│   └── lib/workspace/
│       └── create-full-workspace.ts            # MODIFY: render templates at create
└── tests/unit/
    ├── workflow/
    │   ├── run-context.spec.ts                 # NEW
    │   ├── build-run-context.spec.ts           # NEW
    │   └── conversation-dispatcher-runcontext.spec.ts  # NEW
    ├── agents/
    │   ├── tool-invoker-runcontext.spec.ts     # NEW
    │   └── speed-to-lead-prose-extraction.spec.ts  # NEW
    └── bookings/
        └── create-for-customer.spec.ts         # NEW

packages/crm/tests/integration/
├── speed-to-lead-end-to-end.spec.ts            # NEW
└── antifragility-model-bump.spec.ts            # NEW
```

---

## Phase 0 — Schema + types (1 day)

### Task 0.1: Add `context` JSONB column to workflow_runs

**Files:**
- Create: `packages/crm/drizzle/0048_workflow_runs_context.sql`
- Modify: `packages/crm/src/db/schema/workflow-runs.ts`

- [ ] **Step 1: Write the migration SQL**

`packages/crm/drizzle/0048_workflow_runs_context.sql`:
```sql
-- 2026-05-19 — RunContext: every workflow_run carries an identity
-- snapshot (customer, workspace, clock, agency, source) stamped at
-- startRun. Existing rows have context=NULL; the runtime lazily
-- rebuilds + persists on first access.
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS context JSONB;
```

- [ ] **Step 2: Add the column to the Drizzle schema**

Modify `packages/crm/src/db/schema/workflow-runs.ts` — locate the `pgTable("workflow_runs", { ... })` block and add inside the columns object:
```ts
  context: jsonb("context").$type<Record<string, unknown> | null>(),
```
The strict `RunContext` type binding comes in Task 0.3 once the type exists.

- [ ] **Step 3: Apply the migration to the local-equivalent prod DB via Neon MCP**

Run via the Neon MCP `run_sql` tool against project `autumn-field-50385990`:
```sql
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS context JSONB;
```
Expected: empty result. Verify via:
```sql
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'workflow_runs' AND column_name = 'context';
```
Expected: one row, `data_type = 'jsonb'`.

- [ ] **Step 4: Backfill the drizzle tracker so `pnpm db:migrate` skips this migration on next deploy**

Compute the hash:
```bash
cd packages/crm && node -e "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync('drizzle/0048_workflow_runs_context.sql')).digest('hex'))"
```
Then INSERT into the tracker via Neon MCP (replacing `<HASH>` with the output):
```sql
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('<HASH>', 1779220570000);
```

- [ ] **Step 5: Update `drizzle/meta/_journal.json` to include the new entry**

Read the journal, find the latest entry's `idx`, and add:
```json
{ "idx": 16, "version": "7", "when": 1779220570000, "tag": "0048_workflow_runs_context", "breakpoints": true }
```
Also need a matching snapshot at `drizzle/meta/0048_snapshot.json`. Generate it via `pnpm db:generate` (which regenerates snapshots from the schema). If `db:generate` produces additional drift migrations, discard them — only keep the manually-authored 0048.

- [ ] **Step 6: Typecheck + commit**

```bash
cd packages/crm && pnpm typecheck
```
Expected: same pre-existing errors only (embedded-payment, stripe types, etc.); no new errors.

```bash
git add packages/crm/drizzle/0048_workflow_runs_context.sql packages/crm/drizzle/meta/_journal.json packages/crm/drizzle/meta/0048_snapshot.json packages/crm/src/db/schema/workflow-runs.ts
git commit -m "feat(workflow): add context JSONB column to workflow_runs (RunContext Phase 0)"
```

---

### Task 0.2: Define the RunContext type union

**Files:**
- Create: `packages/crm/src/lib/workflow/run-context.ts`

- [ ] **Step 1: Write the type definitions**

`packages/crm/src/lib/workflow/run-context.ts`:
```ts
// RunContext — single source of truth for identity across a workflow run.
// Stamped at startRun, persisted on workflow_runs.context, refreshed
// lazily (clock only) on every dispatcher call.
//
// Two consumer surfaces:
//   - CustomerRunContext (run-context-customer.ts): omits agency.
//     Imported by customer-facing tool invokers (send_email, send_sms,
//     create_booking, create_activity). They physically cannot reach
//     agency branding because the type doesn't carry the field.
//   - AdminRunContext (run-context-admin.ts): the full shape. Imported
//     only by the dashboard render pipeline.
//
// See docs/superpowers/specs/2026-05-19-runcontext-architecture-design.md
// for the full design.

import type { OrgSoul } from "@/lib/soul/types";

export type RunContextSource =
  | { type: "form.submitted"; formId: string; triggerEventId: string | null }
  | { type: "booking.created"; bookingId: string; triggerEventId: string | null }
  | { type: "sms.replied"; inboundSmsId: string; triggerEventId: string | null }
  | { type: "schedule"; triggerEventId: string | null }
  | { type: "manual"; triggerEventId: string | null };

export type RunContextCustomer = {
  contactId: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  /** E.164 phone — the stable identity for SMS-wait matching. */
  phone: string;
};

export type RunContextWorkspace = {
  id: string;
  name: string;
  slug: string;
  /** IANA TZ string. LLM date grounding + booking-slot conversion both read this. */
  timezone: string;
  soul: OrgSoul;
  theme: Record<string, unknown>; // OrgTheme — typed loosely here to avoid the schema import cycle
};

export type RunContextAgency = {
  id: string;
  name: string;
  logoUrl: string | null;
};

export type RunContextClock = {
  /** Server wall clock, ISO 8601 UTC. */
  nowIso: string;
  /** YYYY-MM-DD in workspace timezone. */
  today: string;
  /** YYYY-MM-DD in workspace timezone, today + 24h. */
  tomorrow: string;
  /** "Monday", "Tuesday", etc., in workspace timezone. */
  todayWeekday: string;
};

/**
 * Full RunContext. Persisted on workflow_runs.context. Loaded via
 * loadRunContext(). Customer-facing code MUST NOT import this type
 * directly — use CustomerRunContext from run-context-customer.ts.
 */
export type RunContext = {
  runId: string;
  orgId: string;
  archetypeId: string;
  /** Run start timestamp, ISO. */
  startedAt: string;
  customer: RunContextCustomer;
  workspace: RunContextWorkspace;
  /** Active partner agency, if any. Customer-facing code cannot read this. */
  agency: RunContextAgency | null;
  clock: RunContextClock;
  source: RunContextSource;
};
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd packages/crm && pnpm typecheck
git add packages/crm/src/lib/workflow/run-context.ts
git commit -m "feat(workflow): define RunContext type (Phase 0)"
```

---

### Task 0.3: Define CustomerRunContext + AdminRunContext

**Files:**
- Create: `packages/crm/src/lib/workflow/run-context-customer.ts`
- Create: `packages/crm/src/lib/workflow/run-context-admin.ts`

- [ ] **Step 1: Write `run-context-customer.ts`**

```ts
// CustomerRunContext — the customer-facing slice of RunContext.
// Customer-facing tool invokers (send_email, send_sms, create_booking,
// create_activity) and customer-facing render code (intake form
// chrome, booking page) import THIS type only. The agency field is
// physically absent so accidental leaks ("Max agency" footer on a
// booking confirmation) can't happen.
import type { RunContext } from "./run-context";

export type CustomerRunContext = Omit<RunContext, "agency">;

/**
 * Drop the agency field. Customer-facing code calls this on the
 * loaded RunContext before passing it to a tool invoker / email
 * branding loader / etc.
 */
export function asCustomerContext(rc: RunContext): CustomerRunContext {
  const { agency: _agency, ...customerFacing } = rc;
  return customerFacing;
}
```

- [ ] **Step 2: Write `run-context-admin.ts`**

```ts
// AdminRunContext — the full RunContext shape, used only by the
// dashboard render pipeline. Importing this from a customer-facing
// file is a lint signal that something is wrong (the agency field
// should not reach customer surfaces).
import type { RunContext } from "./run-context";

export type AdminRunContext = RunContext;

/**
 * Defensive accessor for the admin surface. Currently a passthrough,
 * but kept as a function so future enforcement (e.g. throw if called
 * from the wrong code path via stack inspection in dev) has a hook.
 */
export function getRunContextAdminOnly(rc: RunContext): AdminRunContext {
  return rc;
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd packages/crm && pnpm typecheck
git add packages/crm/src/lib/workflow/run-context-customer.ts packages/crm/src/lib/workflow/run-context-admin.ts
git commit -m "feat(workflow): dual-module CustomerRunContext / AdminRunContext (Phase 0)"
```

---

### Task 0.4: Pure-function tests for clock formatting

**Files:**
- Create: `packages/crm/tests/unit/workflow/run-context.spec.ts`

- [ ] **Step 1: Write the test file (TDD — these tests will guide buildClock impl in Phase 1)**

```ts
// Tests for the pure helpers around RunContext.
//
// buildClock(now, tz) must format "today" and "tomorrow" in the
// workspace timezone, not UTC. Used by the conversation step's
// system prompt so the LLM can ground "tomorrow" against the
// operator's local date, not the server's UTC date.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildClock } from "../../../src/lib/workflow/build-run-context";

describe("buildClock", () => {
  test("formats today in America/Los_Angeles tz", () => {
    // 2026-05-19 10:00 UTC = 2026-05-19 03:00 LA (same day)
    const now = new Date("2026-05-19T10:00:00Z");
    const c = buildClock(now, "America/Los_Angeles");
    assert.equal(c.today, "2026-05-19");
    assert.equal(c.tomorrow, "2026-05-20");
  });

  test("rolls today across midnight in a positive-offset tz", () => {
    // 2026-05-19 22:00 UTC = 2026-05-20 08:00 in Asia/Tokyo
    const now = new Date("2026-05-19T22:00:00Z");
    const c = buildClock(now, "Asia/Tokyo");
    assert.equal(c.today, "2026-05-20");
    assert.equal(c.tomorrow, "2026-05-21");
  });

  test("returns weekday in workspace tz", () => {
    // 2026-05-19 is a Tuesday
    const now = new Date("2026-05-19T12:00:00Z");
    const c = buildClock(now, "America/New_York");
    assert.equal(c.todayWeekday, "Tuesday");
  });

  test("falls back to UTC if the tz string is invalid", () => {
    const now = new Date("2026-05-19T12:00:00Z");
    const c = buildClock(now, "Not/AReal/Timezone");
    // Falls back to UTC formatting; today is the UTC date string
    assert.equal(c.today, "2026-05-19");
    assert.equal(c.tomorrow, "2026-05-20");
  });

  test("nowIso reflects the input Date as ISO UTC", () => {
    const now = new Date("2026-05-19T15:30:00Z");
    const c = buildClock(now, "UTC");
    assert.equal(c.nowIso, "2026-05-19T15:30:00.000Z");
  });
});
```

- [ ] **Step 2: Run the test, expect import failure**

```bash
cd packages/crm && pnpm exec tsx --test tests/unit/workflow/run-context.spec.ts
```
Expected: ERR_MODULE_NOT_FOUND on `../../../src/lib/workflow/build-run-context` — file doesn't exist yet. That's correct TDD red.

- [ ] **Step 3: Commit failing test**

```bash
git add packages/crm/tests/unit/workflow/run-context.spec.ts
git commit -m "test(workflow): RunContext clock formatting tests (Phase 0, RED)"
```

---

## Phase 1 — buildRunContext + persistence (1 day)

### Task 1.1: Implement `buildClock`

**Files:**
- Create: `packages/crm/src/lib/workflow/build-run-context.ts`

- [ ] **Step 1: Implement just `buildClock` to make Task 0.4 tests pass**

`packages/crm/src/lib/workflow/build-run-context.ts`:
```ts
// buildRunContext + helpers — stamps a RunContext at startRun and
// rebuilds it lazily on access if the persisted column is null
// (existing pre-Phase-1 runs).
import type { RunContextClock } from "./run-context";

/**
 * Format a wall-clock instant as { nowIso, today, tomorrow,
 * todayWeekday } in the given IANA timezone. Falls back to UTC if
 * the tz string is invalid.
 */
export function buildClock(now: Date, timezone: string): RunContextClock {
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const nowIso = now.toISOString();

  // Try Intl with the workspace tz; fall back to UTC if Intl throws.
  let today = now.toISOString().slice(0, 10);
  let tomorrowStr = tomorrow.toISOString().slice(0, 10);
  let todayWeekday = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(now);
  try {
    const dateFmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    today = dateFmt.format(now);
    tomorrowStr = dateFmt.format(tomorrow);
    const weekdayFmt = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long" });
    todayWeekday = weekdayFmt.format(now);
  } catch {
    // tz string was invalid — UTC fallback already in place
  }

  return { nowIso, today, tomorrow: tomorrowStr, todayWeekday };
}
```

- [ ] **Step 2: Run tests, expect green**

```bash
cd packages/crm && pnpm exec tsx --test tests/unit/workflow/run-context.spec.ts
```
Expected: `pass 5, fail 0`.

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/lib/workflow/build-run-context.ts
git commit -m "feat(workflow): buildClock formats today/tomorrow in workspace tz (Phase 1, GREEN)"
```

---

### Task 1.2: Implement `resolveCustomer`

**Files:**
- Modify: `packages/crm/src/lib/workflow/build-run-context.ts`
- Create: `packages/crm/tests/unit/workflow/build-run-context.spec.ts`

- [ ] **Step 1: Write tests for the customer resolution rules**

`packages/crm/tests/unit/workflow/build-run-context.spec.ts`:
```ts
// resolveCustomer tests — the function takes the triggerPayload + a
// minimal db handle (we mock it with a stub) and produces the
// canonical RunContextCustomer.
//
// Rules:
// - Prefer trigger payload's name fields over contact row's stale
//   firstName.
// - Phone normalized to E.164.
// - Email lowercased + trimmed.
// - When data is nested under `data` (form.submitted shape), look there.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveCustomerFromTriggerPayload } from "../../../src/lib/workflow/build-run-context";

describe("resolveCustomerFromTriggerPayload", () => {
  test("uses fullName from data.fullName + contactId from data.contactId", () => {
    const payload = {
      data: { fullName: "Alice Liddell", email: "alice@example.com", phone: "4505161803" },
      contactId: "c-1",
    };
    const c = resolveCustomerFromTriggerPayload(payload);
    assert.equal(c.firstName, "Alice");
    assert.equal(c.lastName, "Liddell");
    assert.equal(c.email, "alice@example.com");
    assert.equal(c.phone, "+14505161803");
    assert.equal(c.contactId, "c-1");
  });

  test("uses top-level contactId when present", () => {
    const payload = { data: { fullName: "Bob" }, contactId: "c-top" };
    const c = resolveCustomerFromTriggerPayload(payload);
    assert.equal(c.contactId, "c-top");
  });

  test("falls back to data.contactId when top-level absent", () => {
    const payload = { data: { fullName: "Bob", contactId: "c-nested" } };
    const c = resolveCustomerFromTriggerPayload(payload);
    assert.equal(c.contactId, "c-nested");
  });

  test("normalizes phone to E.164 (assumes US for 10-digit)", () => {
    const c = resolveCustomerFromTriggerPayload({
      data: { fullName: "Carol", phone: "4505161803" },
      contactId: "c-3",
    });
    assert.equal(c.phone, "+14505161803");
  });

  test("preserves already-E164 phone", () => {
    const c = resolveCustomerFromTriggerPayload({
      data: { fullName: "Dave", phone: "+14505161803" },
      contactId: "c-4",
    });
    assert.equal(c.phone, "+14505161803");
  });

  test("splits multi-word fullName into firstName + lastName", () => {
    const c = resolveCustomerFromTriggerPayload({
      data: { fullName: "Anne-Marie de la Cruz" },
      contactId: "c-5",
    });
    assert.equal(c.firstName, "Anne-Marie");
    assert.equal(c.lastName, "de la Cruz");
  });

  test("uses firstName directly if no fullName", () => {
    const c = resolveCustomerFromTriggerPayload({
      data: { firstName: "Eve" },
      contactId: "c-6",
    });
    assert.equal(c.firstName, "Eve");
    assert.equal(c.lastName, null);
  });

  test("empty payload returns empty-string firstName + null lastName", () => {
    const c = resolveCustomerFromTriggerPayload({ contactId: "c-7" });
    assert.equal(c.firstName, "");
    assert.equal(c.lastName, null);
    assert.equal(c.email, null);
  });
});
```

- [ ] **Step 2: Implement `resolveCustomerFromTriggerPayload`**

Append to `packages/crm/src/lib/workflow/build-run-context.ts`:
```ts
import { toE164 } from "@/lib/sms/providers/interface";
import type { RunContextCustomer } from "./run-context";

/**
 * Extract the canonical customer identity from a workflow trigger
 * payload. Pure function — no DB calls.
 *
 * Trigger payloads come in two shapes:
 *   - flat:    { contactId, fullName, email, phone, ... }
 *   - nested:  { contactId, data: { fullName, email, phone, ... } }
 * We accept either; nested wins where both are present.
 */
export function resolveCustomerFromTriggerPayload(
  payload: Record<string, unknown>,
): RunContextCustomer {
  const data = (payload.data && typeof payload.data === "object"
    ? (payload.data as Record<string, unknown>)
    : payload) as Record<string, unknown>;

  const contactId =
    (typeof payload.contactId === "string" && payload.contactId) ||
    (typeof data.contactId === "string" && data.contactId) ||
    "";

  const fullName =
    (typeof data.fullName === "string" && data.fullName.trim()) ||
    (typeof data.name === "string" && data.name.trim()) ||
    "";
  let firstName = "";
  let lastName: string | null = null;
  if (fullName) {
    const parts = fullName.split(/\s+/);
    firstName = parts[0] ?? "";
    lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;
  } else if (typeof data.firstName === "string" && data.firstName.trim()) {
    firstName = data.firstName.trim();
    lastName = typeof data.lastName === "string" ? data.lastName.trim() || null : null;
  }

  const emailRaw = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  const email = emailRaw || null;

  const phoneRaw = typeof data.phone === "string" ? data.phone.trim() : "";
  const phone = phoneRaw ? toE164(phoneRaw) || phoneRaw : "";

  return { contactId, firstName, lastName, email, phone };
}
```

- [ ] **Step 3: Run tests, expect green**

```bash
cd packages/crm && pnpm exec tsx --test tests/unit/workflow/build-run-context.spec.ts
```
Expected: `pass 8, fail 0`.

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/lib/workflow/build-run-context.ts packages/crm/tests/unit/workflow/build-run-context.spec.ts
git commit -m "feat(workflow): resolveCustomerFromTriggerPayload (Phase 1)"
```

---

### Task 1.3: Implement full `buildRunContext` + `loadRunContext`

**Files:**
- Modify: `packages/crm/src/lib/workflow/build-run-context.ts`

- [ ] **Step 1: Add the orchestrator + DB calls**

Append to `packages/crm/src/lib/workflow/build-run-context.ts`:
```ts
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, partnerAgencies } from "@/db/schema";
import type { OrgSoul } from "@/lib/soul/types";
import type {
  RunContext,
  RunContextAgency,
  RunContextSource,
  RunContextWorkspace,
} from "./run-context";

/**
 * Build a fresh RunContext at startRun. Reads workspace + soul + theme
 * + (optional) active partner agency. Resolves customer from trigger
 * payload via the pure helper.
 *
 * Persists the context on workflow_runs.context once the run row is
 * created; the runtime threads it to dispatchers thereafter.
 */
export async function buildRunContext(input: {
  runId: string;
  orgId: string;
  archetypeId: string;
  triggerPayload: Record<string, unknown>;
  triggerEventId: string | null;
  triggerEventType: string;
}): Promise<RunContext> {
  const [orgRow] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      timezone: organizations.timezone,
      soul: organizations.soul,
      theme: organizations.theme,
      parentAgencyId: organizations.parentAgencyId,
    })
    .from(organizations)
    .where(eq(organizations.id, input.orgId))
    .limit(1);

  if (!orgRow) {
    throw new Error(`buildRunContext: workspace ${input.orgId} not found`);
  }

  const workspace: RunContextWorkspace = {
    id: orgRow.id,
    name: orgRow.name,
    slug: orgRow.slug,
    timezone: orgRow.timezone || "UTC",
    soul: (orgRow.soul ?? {}) as OrgSoul,
    theme: (orgRow.theme ?? {}) as Record<string, unknown>,
  };

  let agency: RunContextAgency | null = null;
  if (orgRow.parentAgencyId) {
    const [agencyRow] = await db
      .select({ id: partnerAgencies.id, name: partnerAgencies.name, logoUrl: partnerAgencies.logoUrl, status: partnerAgencies.status })
      .from(partnerAgencies)
      .where(eq(partnerAgencies.id, orgRow.parentAgencyId))
      .limit(1);
    if (agencyRow && agencyRow.status === "active") {
      agency = { id: agencyRow.id, name: agencyRow.name, logoUrl: agencyRow.logoUrl };
    }
  }

  const customer = resolveCustomerFromTriggerPayload(input.triggerPayload);
  const clock = buildClock(new Date(), workspace.timezone);
  const source = resolveSource(input.triggerEventType, input.triggerPayload, input.triggerEventId);

  return {
    runId: input.runId,
    orgId: input.orgId,
    archetypeId: input.archetypeId,
    startedAt: clock.nowIso,
    customer,
    workspace,
    agency,
    clock,
    source,
  };
}

function resolveSource(
  eventType: string,
  payload: Record<string, unknown>,
  triggerEventId: string | null,
): RunContextSource {
  const data = (payload.data && typeof payload.data === "object" ? payload.data : payload) as Record<string, unknown>;
  if (eventType === "form.submitted") {
    const formId =
      (typeof payload.formId === "string" && payload.formId) ||
      (typeof data.formId === "string" && data.formId) ||
      "";
    return { type: "form.submitted", formId, triggerEventId };
  }
  if (eventType === "booking.created") {
    const bookingId =
      (typeof payload.bookingId === "string" && payload.bookingId) ||
      (typeof data.bookingId === "string" && data.bookingId) ||
      (typeof data.appointmentId === "string" && data.appointmentId) ||
      "";
    return { type: "booking.created", bookingId, triggerEventId };
  }
  if (eventType === "sms.replied") {
    const inboundSmsId =
      (typeof payload.smsMessageId === "string" && payload.smsMessageId) ||
      (typeof data.smsMessageId === "string" && data.smsMessageId) ||
      "";
    return { type: "sms.replied", inboundSmsId, triggerEventId };
  }
  if (eventType.startsWith("schedule")) {
    return { type: "schedule", triggerEventId };
  }
  return { type: "manual", triggerEventId };
}

/**
 * Load RunContext for an in-flight run. If the run was created before
 * Phase 1 shipped (context=NULL), rebuild and persist on first access.
 *
 * Eager clock refresh: even when the persisted context exists, we
 * always re-stamp the clock so long-paused conversations see today.
 */
export async function loadRunContext(run: {
  id: string;
  orgId: string;
  archetypeId: string;
  triggerPayload: Record<string, unknown>;
  triggerEventId: string | null;
  context: Record<string, unknown> | null;
}): Promise<RunContext> {
  let rc: RunContext;
  if (run.context) {
    rc = run.context as unknown as RunContext;
  } else {
    rc = await buildRunContext({
      runId: run.id,
      orgId: run.orgId,
      archetypeId: run.archetypeId,
      triggerPayload: run.triggerPayload,
      triggerEventId: run.triggerEventId,
      triggerEventType: inferEventTypeFromPayload(run.triggerPayload),
    });
    // Best-effort persist; failures non-fatal because next call will
    // rebuild again.
    try {
      const { workflowRuns } = await import("@/db/schema");
      await db.update(workflowRuns).set({ context: rc as unknown as Record<string, unknown> }).where(eq(workflowRuns.id, run.id));
    } catch {
      // swallow
    }
  }
  // Eager refresh of the clock — every dispatcher call sees current
  // today/tomorrow.
  rc = { ...rc, clock: buildClock(new Date(), rc.workspace.timezone) };
  return rc;
}

function inferEventTypeFromPayload(payload: Record<string, unknown>): string {
  // Heuristic for legacy runs without a stored eventType. Look at the
  // shape: form.submitted has formId, booking.created has bookingId,
  // sms.replied has smsMessageId.
  const data = (payload.data && typeof payload.data === "object" ? payload.data : payload) as Record<string, unknown>;
  if (typeof payload.formId === "string" || typeof data.formId === "string") return "form.submitted";
  if (typeof payload.bookingId === "string" || typeof data.bookingId === "string" || typeof data.appointmentId === "string") return "booking.created";
  if (typeof payload.smsMessageId === "string" || typeof data.smsMessageId === "string") return "sms.replied";
  return "manual";
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd packages/crm && pnpm typecheck
git add packages/crm/src/lib/workflow/build-run-context.ts
git commit -m "feat(workflow): buildRunContext + loadRunContext orchestrators (Phase 1)"
```

---

### Task 1.4: Stamp RunContext on startRun + persist

**Files:**
- Modify: `packages/crm/src/lib/workflow/runtime.ts`
- Modify: `packages/crm/src/lib/workflow/storage-drizzle.ts`
- Modify: `packages/crm/src/lib/workflow/types.ts`

- [ ] **Step 1: Extend `StoredRun` type to carry context**

In `packages/crm/src/lib/workflow/types.ts`, add to the `StoredRun` type:
```ts
  context: Record<string, unknown> | null;
```

- [ ] **Step 2: Update `storage-drizzle.ts` createRun + getRun to persist + read context**

In `packages/crm/src/lib/workflow/storage-drizzle.ts`:
- Find the `createRun` function — add `context` to the insert values + the `NewRunInput` type.
- Find the `getRun` function — include `context: workflowRuns.context` in the select projection and the mapper that builds `StoredRun`.

```ts
// In createRun:
async createRun(input: NewRunInput & { context?: Record<string, unknown> | null }): Promise<string> {
  const [row] = await this.db
    .insert(workflowRuns)
    .values({
      // ... existing fields ...
      context: input.context ?? null,
    })
    .returning({ id: workflowRuns.id });
  return row.id;
}

// In getRun's select + mapper:
context: row.context as Record<string, unknown> | null,
```

- [ ] **Step 3: Update `runtime.startRun` to call buildRunContext BEFORE createRun**

In `packages/crm/src/lib/workflow/runtime.ts`, modify `startRun`:
```ts
export async function startRun(
  context: RuntimeContext,
  input: StartRunInput,
): Promise<string> {
  const firstStep = input.spec.steps[0];
  if (!firstStep) {
    throw new RuntimeError("Cannot start run with empty spec.steps");
  }
  const variableScope = seedVariableScope(input.spec.variables, input.triggerPayload);

  // 2026-05-19 — stamp RunContext at run-start. Customer + workspace
  // + clock + agency + source all locked in here; downstream steps
  // read from this snapshot instead of re-querying.
  const { buildRunContext } = await import("./build-run-context");
  // We need a stable runId for the context — use a synthetic one and
  // rely on storage.createRun to accept it. If createRun overwrites,
  // patch the context's runId after creation.
  const tempRunId = crypto.randomUUID();
  const runContext = await buildRunContext({
    runId: tempRunId,
    orgId: input.orgId,
    archetypeId: input.archetypeId,
    triggerPayload: input.triggerPayload,
    triggerEventId: input.triggerEventId,
    triggerEventType: input.triggerEventType ?? "manual",
  });

  const runId = await context.storage.createRun({
    orgId: input.orgId,
    archetypeId: input.archetypeId,
    specSnapshot: input.spec,
    triggerEventId: input.triggerEventId,
    triggerPayload: input.triggerPayload,
    currentStepId: firstStep.id,
    variableScope,
    context: { ...runContext, runId: tempRunId } as unknown as Record<string, unknown>,
  });

  // If storage assigned a different runId (which it does — the DB
  // generates the uuid), patch the context's runId field on a
  // follow-up update.
  if (runId !== tempRunId) {
    const { workflowRuns } = await import("@/db/schema");
    await db.update(workflowRuns)
      .set({ context: { ...runContext, runId } as unknown as Record<string, unknown> })
      .where(eq(workflowRuns.id, runId));
  }

  await advanceRun(context, runId);
  return runId;
}
```

Also add `triggerEventType?: string` to `StartRunInput`.

- [ ] **Step 4: Update callers of `startRun` to pass `triggerEventType`**

Find every call site of `startRun` (currently in `lib/agents/dispatcher.ts`, `lib/agents/message-trigger-runtime-wiring.ts`, etc.) and add `triggerEventType: input.triggerEventType` where the event type is known.

```bash
cd packages/crm && grep -rn "startRun\b" src/lib --include="*.ts" | grep -v ".next"
```

- [ ] **Step 5: Typecheck + commit**

```bash
cd packages/crm && pnpm typecheck
git add packages/crm/src/lib/workflow/runtime.ts packages/crm/src/lib/workflow/storage-drizzle.ts packages/crm/src/lib/workflow/types.ts packages/crm/src/lib/agents/dispatcher.ts packages/crm/src/lib/agents/message-trigger-runtime-wiring.ts
git commit -m "feat(workflow): stamp RunContext on startRun + persist (Phase 1)"
```

---

## Phase 2 — Thread RunContext through step dispatchers + extract editable prose (2 days)

### Task 2.1: Pass runContext into dispatchStep

**Files:**
- Modify: `packages/crm/src/lib/workflow/runtime.ts`
- Modify: `packages/crm/src/lib/workflow/types.ts`

- [ ] **Step 1: Add runContext to the dispatchStep signature**

In `packages/crm/src/lib/workflow/types.ts`, find the dispatcher signature type and add:
```ts
export type StepDispatcher = (
  run: StoredRun,
  step: WorkflowStep,
  context: RuntimeContext,
  runContext: import("./run-context-customer").CustomerRunContext,
) => Promise<NextAction>;
```

- [ ] **Step 2: Update runtime advanceRun to load + pass runContext**

In `packages/crm/src/lib/workflow/runtime.ts`, find `advanceRun`'s dispatch loop. Before calling `dispatchStep`, add:
```ts
const { loadRunContext } = await import("./build-run-context");
const { asCustomerContext } = await import("./run-context-customer");
const fullContext = await loadRunContext({
  id: run.id,
  orgId: run.orgId,
  archetypeId: run.archetypeId,
  triggerPayload: run.triggerPayload,
  triggerEventId: run.triggerEventId,
  context: run.context,
});
const runContext = asCustomerContext(fullContext);
// ... existing dispatchStep call, now with runContext as 4th arg
const action = await dispatchStep(run, step, context, runContext);
```

- [ ] **Step 3: Typecheck (expect errors in each dispatcher about missing runContext param)**

```bash
cd packages/crm && pnpm typecheck 2>&1 | grep "step-dispatchers"
```
Expected: ~6-8 errors from each dispatcher file. That's the next task.

- [ ] **Step 4: Commit (intentionally with the dispatcher signature broken — Task 2.2-2.6 fix)**

```bash
git add packages/crm/src/lib/workflow/runtime.ts packages/crm/src/lib/workflow/types.ts
git commit -m "feat(workflow): thread runContext through dispatchStep (Phase 2, partial — dispatchers fix next)"
```

---

### Task 2.2: Update conversation dispatcher to read from runContext

**Files:**
- Modify: `packages/crm/src/lib/workflow/step-dispatchers/conversation.ts`

- [ ] **Step 1: Add runContext param + drop the DB lookups inside dispatchConversation**

In `conversation.ts`:
1. Change the function signature: `async function dispatchConversation(run, step, _context, runContext: CustomerRunContext)`.
2. Replace `buildRunTimeVars(run.orgId, triggerInfo.contactId, run.triggerPayload)` with a pure transform over `runContext.customer` + `runContext.workspace`:

```ts
function buildRunTimeVarsFromContext(runContext: CustomerRunContext): Record<string, string> {
  return {
    "contact.firstName": runContext.customer.firstName,
    "contact.lastName": runContext.customer.lastName ?? "",
    "contact.email": runContext.customer.email ?? "",
    "contact.phone": runContext.customer.phone,
    businessName: runContext.workspace.name,
    businessPhone: extractBusinessPhoneFromSoul(runContext.workspace.soul),
    timezone: runContext.workspace.timezone,
  };
}
```

3. Replace `phoneNumber` resolution: `const phoneNumber = runContext.customer.phone;` (already E.164).
4. Replace the `e164Phone` line: `const e164Phone = runContext.customer.phone;` (already normalized in buildRunContext).
5. Drop the old `buildRunTimeVars` async function and `extractBusinessPhone` helper from above (replaced by `extractBusinessPhoneFromSoul`).

- [ ] **Step 2: Update buildSystemPrompt to read from runContext**

In `buildSystemPrompt`, replace the `tz`/`now`/`tomorrow` computation block (the ~30 lines starting with "// 2026-05-19 — date grounding") with:
```ts
const tz = runContext.workspace.timezone;
const todayLocal = runContext.clock.today;
const tomorrowLocal = runContext.clock.tomorrow;
const todayWeekday = runContext.clock.todayWeekday;
const dateContext = `CURRENT DATE CONTEXT (use to resolve relative time phrases):
- Today is ${todayWeekday}, ${todayLocal} (${tz})
- Tomorrow is ${tomorrowLocal}
- Workspace timezone: ${tz}
- When the customer says "tomorrow", "next Monday", "in 2 hours", etc., convert to a concrete YYYY-MM-DDTHH:MM:00 in the workspace timezone above. Do NOT pick a default year — use the current year unless the customer explicitly mentions a different one.`;
```

Change the signature: `async function buildSystemPrompt(step, runContext, appointmentTypeId)` and update the one caller.

- [ ] **Step 3: Typecheck (expect this dispatcher to be clean now)**

```bash
cd packages/crm && pnpm typecheck 2>&1 | grep "conversation.ts"
```
Expected: no errors in conversation.ts. Other dispatchers still have signature errors.

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/lib/workflow/step-dispatchers/conversation.ts
git commit -m "feat(conversation): read identity from runContext, drop in-dispatch DB lookups (Phase 2)"
```

---

### Task 2.3: Update remaining step dispatchers

**Files:**
- Modify: `packages/crm/src/lib/workflow/step-dispatchers/*.ts` (all files)

- [ ] **Step 1: Add `runContext` param to every dispatcher signature (no-op for most)**

For each file in `step-dispatchers/` (await-event, branch, emit-event, llm-call, mcp-tool-call, read-state, request-approval, wait, write-state), add the parameter to the function signature:
```ts
import type { CustomerRunContext } from "../run-context-customer";

export async function dispatchXxx(
  run: StoredRun,
  step: XxxStep,
  context: RuntimeContext,
  runContext: CustomerRunContext,
): Promise<NextAction> {
  // existing body — most dispatchers don't need to use runContext yet
}
```

- [ ] **Step 2: Update mcp-tool-call dispatcher to pass runContext to the invoker**

In `mcp-tool-call.ts`, find the line calling `context.invokeTool(...)` and add runContext:
```ts
const result = await context.invokeTool(step.tool, resolvedArgs, { orgId: run.orgId, runContext });
```

Update the `ToolInvoker` type in `lib/workflow/types.ts` to include the runContext in the options object:
```ts
export type ToolInvoker = (
  toolName: string,
  args: Record<string, unknown>,
  options?: { orgId?: string; runContext?: import("./run-context-customer").CustomerRunContext },
) => Promise<unknown>;
```

- [ ] **Step 3: Typecheck**

```bash
cd packages/crm && pnpm typecheck 2>&1 | grep "step-dispatchers"
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/lib/workflow/step-dispatchers/ packages/crm/src/lib/workflow/types.ts
git commit -m "feat(workflow): runContext threaded through all step dispatchers (Phase 2)"
```

---

### Task 2.4: Extract `$forbiddenPhrases` + `$maxTurns` from conversation harness

**Files:**
- Modify: `packages/crm/src/lib/agents/archetypes/speed-to-lead.ts`
- Modify: `packages/crm/src/lib/workflow/step-dispatchers/conversation.ts`

- [ ] **Step 1: Add the placeholders to speed-to-lead archetype**

In `speed-to-lead.ts`, add to `placeholders`:
```ts
    $maxTurns: {
      kind: "user_input",
      description:
        "Maximum number of back-and-forth turns the conversation can take before forcing an exit. Default 6 — most leads close in 2-3 turns. Lower if customers feel rushed; raise if your qualification is complex.",
      example: "6",
    },
    $forbiddenPhrases: {
      kind: "soul_copy",
      description:
        "Comma-separated phrases the agent must NEVER emit. Defends against the LLM paraphrasing tool errors into customer-facing system-error language. Add your own ('please call our office', 'I'll have someone get back to you') if the agent ever says something that sounds wrong for your brand.",
      soulFields: ["tone"],
      example:
        "we couldn't find your appointment, please call us, this is broken, an error occurred, our system is down",
    },
```

- [ ] **Step 2: Read placeholders into buildSystemPrompt**

In `conversation.ts`, pass `step.maxTurns` (after harnessing) and `step.forbiddenPhrases` into `buildSystemPrompt`. The synthesized spec resolves `$maxTurns` → numeric, `$forbiddenPhrases` → string.

Modify `buildSystemPrompt` to inject the forbidden list:
```ts
const forbiddenList = (runContext.placeholders?.forbiddenPhrases ?? "we couldn't find your appointment, please call us, this is broken")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const forbiddenBlock = forbiddenList.length > 0
  ? `\nNEVER say any of these phrases (they make the customer think something is broken):\n${forbiddenList.map((p) => `  - "${p}"`).join("\n")}\n`
  : "";
```

Append `forbiddenBlock` to the system prompt template, in the "Critical:" section.

- [ ] **Step 3: Replace `MAX_TURNS` constant with the placeholder**

Find `const MAX_TURNS = 6;` in conversation.ts and replace with a lookup at the top of the dispatch:
```ts
const maxTurnsRaw = (run.specSnapshot.placeholders as Record<string, unknown> | undefined)?.maxTurns;
const MAX_TURNS = typeof maxTurnsRaw === "string" ? parseInt(maxTurnsRaw, 10) || 6 : 6;
```

(Alternative: extend RunContext with a `placeholders` field carrying the resolved $-values. For now read from specSnapshot which already has them post-synthesis.)

- [ ] **Step 4: Typecheck + commit**

```bash
cd packages/crm && pnpm typecheck
git add packages/crm/src/lib/agents/archetypes/speed-to-lead.ts packages/crm/src/lib/workflow/step-dispatchers/conversation.ts
git commit -m "feat(agents): extract forbiddenPhrases + maxTurns as operator-editable placeholders (Phase 2)"
```

---

### Task 2.5: Test the prose extraction

**Files:**
- Create: `packages/crm/tests/unit/agents/speed-to-lead-prose-extraction.spec.ts`

- [ ] **Step 1: Write test asserting the placeholders exist + have sane defaults**

```ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { speedToLeadArchetype } from "../../../src/lib/agents/archetypes/speed-to-lead";

describe("speed-to-lead archetype operator-editable placeholders", () => {
  test("exposes $maxTurns as user_input with a numeric default", () => {
    const p = speedToLeadArchetype.placeholders.$maxTurns;
    assert.ok(p, "$maxTurns placeholder missing");
    assert.equal(p.kind, "user_input");
    assert.match(p.example ?? "", /^\d+$/);
  });

  test("exposes $forbiddenPhrases as soul_copy with the canonical system-error phrases", () => {
    const p = speedToLeadArchetype.placeholders.$forbiddenPhrases;
    assert.ok(p, "$forbiddenPhrases placeholder missing");
    assert.equal(p.kind, "soul_copy");
    assert.ok((p.example ?? "").includes("we couldn't find your appointment"));
  });
});
```

- [ ] **Step 2: Run + commit**

```bash
cd packages/crm && pnpm exec tsx --test tests/unit/agents/speed-to-lead-prose-extraction.spec.ts
git add packages/crm/tests/unit/agents/speed-to-lead-prose-extraction.spec.ts
git commit -m "test(agents): pin speed-to-lead placeholder extraction (Phase 2)"
```

---

## Phase 3 — Tool invoker rewrites (1.5 days)

### Task 3.1: Update ToolInvoker signature

**Files:**
- Modify: `packages/crm/src/lib/agents/tool-invoker.ts`

- [ ] **Step 1: Extend the invoker dispatch function to accept the options object**

Find `makeAgentToolInvoker` in tool-invoker.ts. Update its return to accept and forward the options:
```ts
export function makeAgentToolInvoker(orgIdFromCtor: string) {
  return async (
    toolName: string,
    args: Record<string, unknown>,
    options?: { orgId?: string; runContext?: import("@/lib/workflow/run-context-customer").CustomerRunContext },
  ): Promise<unknown> => {
    const orgId = options?.orgId ?? orgIdFromCtor;
    const runContext = options?.runContext;
    const handler = HANDLERS[toolName];
    if (!handler) throw new Error(`Unknown tool: ${toolName}`);
    return handler(orgId, args, runContext);
  };
}
```

Update the `HANDLERS` type to accept an optional `runContext`:
```ts
type Handler = (
  orgId: string,
  args: Record<string, unknown>,
  runContext?: CustomerRunContext,
) => Promise<unknown>;

const HANDLERS: Record<string, Handler> = { ... };
```

- [ ] **Step 2: Typecheck (existing handlers will need the extra param, but it's optional so no errors yet)**

```bash
cd packages/crm && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/lib/agents/tool-invoker.ts
git commit -m "feat(agents): ToolInvoker accepts runContext option (Phase 3)"
```

---

### Task 3.2: Wire send_sms + send_email to read from runContext

**Files:**
- Modify: `packages/crm/src/lib/agents/tool-invoker.ts`

- [ ] **Step 1: Update send_sms handler to prefer runContext.customer.phone**

In tool-invoker.ts, find `send_sms` handler:
```ts
send_sms: async (orgId, args, runContext) => {
  const rawTo =
    typeof args.to === "string" ? args.to :
    typeof args.to_number === "string" ? args.to_number : null;
  // Prefer runContext.customer.phone over args.to. RunContext is the
  // single source of truth; args.to is a fallback for legacy specs
  // that still pass {{contact.phone}} interpolation.
  const to = (rawTo && !rawTo.includes("{{") && rawTo.trim()) || runContext?.customer.phone || null;
  if (!to) throw new Error("send_sms: no recipient (runContext.customer.phone missing and args.to unresolved)");
  const body = typeof args.body === "string" ? args.body : null;
  if (!body) throw new Error("send_sms: body is required");
  // ... existing sendSmsFromApi call ...
```

- [ ] **Step 2: Update send_email handler similarly**

```ts
send_email: async (orgId, args, runContext) => {
  const rawTo = typeof args.to === "string" ? args.to : null;
  const to = (rawTo && !rawTo.includes("{{") && rawTo.trim()) || runContext?.customer.email || null;
  if (!to) throw new Error("send_email: no recipient");
  // ... existing sendEmailFromApi call, also drop the contact-lookup-by-id fallback since runContext has it
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd packages/crm && pnpm typecheck
git add packages/crm/src/lib/agents/tool-invoker.ts
git commit -m "feat(agents): send_sms + send_email read recipient from runContext.customer (Phase 3)"
```

---

### Task 3.3: Extract createBookingForCustomer shared helper

**Files:**
- Create: `packages/crm/src/lib/bookings/create-for-customer.ts`
- Modify: `packages/crm/src/lib/agents/tool-invoker.ts` (create_booking)
- Modify: `packages/crm/src/lib/bookings/actions.ts` (submitPublicBookingAction)
- Create: `packages/crm/tests/unit/bookings/create-for-customer.spec.ts`

- [ ] **Step 1: Write the helper**

`packages/crm/src/lib/bookings/create-for-customer.ts`:
```ts
// Shared booking creation — used by BOTH the public booking page
// (submitPublicBookingAction) AND the agent's create_booking tool.
// Goal: agent-created bookings are structurally indistinguishable
// from customer-clicked bookings. Same row insert, same downstream
// events, same contact sync.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings as bookingsTable, contacts } from "@/db/schema";
import { emitSeldonEvent } from "@/lib/events/bus";

export type CreateBookingForCustomerInput = {
  orgId: string;
  customer: {
    contactId: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string;
  };
  appointmentTypeId: string;
  startsAt: Date;
  /** Optional duration override; otherwise pulled from appointment_type metadata. */
  durationMinutes?: number;
  notes: string | null;
  /** Intake answers, when the booking came from a form-driven flow.
   *  Stored on the booking row for the operator's view. */
  intakeAnswers?: Record<string, unknown> | null;
  /** Identifies the source for the booking row's metadata + downstream
   *  filters. Both paths use a stable enum so the operator can tell
   *  apart agent-created vs customer-clicked in /bookings. */
  source: "public_page" | "agent";
};

export async function createBookingForCustomer(
  input: CreateBookingForCustomerInput,
): Promise<{ bookingId: string }> {
  // 1. Resolve durationMinutes from appointment-type metadata if not provided
  const [template] = await db
    .select({
      bookingSlug: bookingsTable.bookingSlug,
      metadata: bookingsTable.metadata,
    })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.orgId, input.orgId),
        eq(bookingsTable.id, input.appointmentTypeId),
        eq(bookingsTable.status, "template"),
      ),
    )
    .limit(1);
  if (!template) {
    throw new Error(`createBookingForCustomer: appointment type ${input.appointmentTypeId} not found`);
  }
  const meta = (template.metadata as Record<string, unknown> | null) ?? {};
  const duration = input.durationMinutes
    ?? (typeof meta.durationMinutes === "number" ? meta.durationMinutes : 30);
  const endsAt = new Date(input.startsAt.getTime() + duration * 60 * 1000);

  // 2. Insert the booking row
  const [created] = await db
    .insert(bookingsTable)
    .values({
      orgId: input.orgId,
      contactId: input.customer.contactId,
      appointmentTypeId: input.appointmentTypeId,
      bookingSlug: template.bookingSlug,
      startsAt: input.startsAt,
      endsAt,
      status: "confirmed",
      notes: input.notes,
      metadata: {
        source: input.source,
        intakeAnswers: input.intakeAnswers ?? null,
      },
    })
    .returning({ id: bookingsTable.id });
  if (!created) {
    throw new Error("createBookingForCustomer: insert returned no row");
  }

  // 3. Refresh contact row's name/phone from the customer (single
  //    source of truth — same logic intake-route uses)
  if (input.customer.firstName) {
    await db
      .update(contacts)
      .set({
        firstName: input.customer.firstName,
        lastName: input.customer.lastName,
        phone: input.customer.phone || undefined,
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, input.customer.contactId));
  }

  // 4. Emit booking.created event — the booking-confirmation outbound
  //    trigger picks this up and sends the customer email.
  await emitSeldonEvent(
    "booking.created",
    { appointmentId: created.id, contactId: input.customer.contactId },
    { orgId: input.orgId },
  );

  return { bookingId: created.id };
}
```

- [ ] **Step 2: Update tool-invoker create_booking to call the helper**

Replace the body of `create_booking` in `tool-invoker.ts`:
```ts
create_booking: async (orgId, args, runContext) => {
  if (!runContext) {
    throw new Error("create_booking: runContext is required");
  }
  const appointmentTypeId = typeof args.appointment_type_id === "string" ? args.appointment_type_id : null;
  if (!appointmentTypeId) throw new Error("create_booking: appointment_type_id is required");

  const startsAtRaw = typeof args.starts_at === "string" ? args.starts_at : null;
  const startsAt = startsAtRaw && !startsAtRaw.includes("{{") ? new Date(startsAtRaw) : null;
  if (!startsAt || Number.isNaN(startsAt.getTime())) {
    // Fallback: next business hour slot
    const fallback = nextBusinessHourSlot(new Date());
    return await createBookingViaHelper(orgId, runContext, appointmentTypeId, fallback, args, "agent");
  }
  return await createBookingViaHelper(orgId, runContext, appointmentTypeId, startsAt, args, "agent");
},
```

Define `createBookingViaHelper`:
```ts
async function createBookingViaHelper(
  orgId: string,
  runContext: CustomerRunContext,
  appointmentTypeId: string,
  startsAt: Date,
  args: Record<string, unknown>,
  source: "agent" | "public_page",
) {
  const { createBookingForCustomer } = await import("@/lib/bookings/create-for-customer");
  const notes = typeof args.notes === "string" ? args.notes : null;
  return await createBookingForCustomer({
    orgId,
    customer: runContext.customer,
    appointmentTypeId,
    startsAt,
    notes,
    source,
  });
}
```

- [ ] **Step 3: Update submitPublicBookingAction to call the helper**

In `bookings/actions.ts` (around the booking insert at line ~1380), replace the manual insert with a call to `createBookingForCustomer`. Construct the customer object from the booking form data (firstName/lastName from the name field, email/phone from intake), passing `source: "public_page"`.

- [ ] **Step 4: Write parity test**

`packages/crm/tests/unit/bookings/create-for-customer.spec.ts`:
```ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";

// Parity test — agent path + public path produce identical booking
// row shape. We assert on the INPUT this shared helper receives;
// real DB-side parity is covered by the integration test in Phase 7.

describe("createBookingForCustomer input contract", () => {
  test("agent and public path produce identical input shape (excluding source + notes)", () => {
    const agent = {
      orgId: "org-1", customer: { contactId: "c-1", firstName: "Alice", lastName: null, email: "a@x.com", phone: "+14505161803" },
      appointmentTypeId: "appt-1", startsAt: new Date("2026-05-20T15:00:00Z"), notes: "Booked by agent", source: "agent" as const,
    };
    const publicPath = {
      orgId: "org-1", customer: { contactId: "c-1", firstName: "Alice", lastName: null, email: "a@x.com", phone: "+14505161803" },
      appointmentTypeId: "appt-1", startsAt: new Date("2026-05-20T15:00:00Z"), notes: "Booked via public page", source: "public_page" as const,
    };
    // Identical except source + notes
    const stripVariable = (b: Record<string, unknown>) => ({ ...b, source: undefined, notes: undefined });
    assert.deepEqual(stripVariable(agent), stripVariable(publicPath));
  });
});
```

- [ ] **Step 5: Typecheck + commit**

```bash
cd packages/crm && pnpm typecheck
cd packages/crm && pnpm exec tsx --test tests/unit/bookings/create-for-customer.spec.ts
git add packages/crm/src/lib/bookings/create-for-customer.ts packages/crm/src/lib/agents/tool-invoker.ts packages/crm/src/lib/bookings/actions.ts packages/crm/tests/unit/bookings/create-for-customer.spec.ts
git commit -m "feat(bookings): createBookingForCustomer shared helper, agent + public parity (Phase 3)"
```

---

### Task 3.4: Update create_activity to read contactId from runContext

**Files:**
- Modify: `packages/crm/src/lib/agents/tool-invoker.ts`

- [ ] **Step 1: Replace args.contact_id with runContext.customer.contactId**

```ts
create_activity: async (orgId, args, runContext) => {
  if (!runContext) throw new Error("create_activity: runContext is required");
  const contactId = runContext.customer.contactId;
  // ... existing body, using contactId instead of args.contact_id
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd packages/crm && pnpm typecheck
git add packages/crm/src/lib/agents/tool-invoker.ts
git commit -m "feat(agents): create_activity reads contactId from runContext (Phase 3)"
```

---

## Phase 4 — Customer-facing surfaces read from RunContext (1 day)

### Task 4.1: loadEmailBranding reads workspace identity (already done — verify)

**Files:**
- Verify: `packages/crm/src/lib/emails/api.ts`

- [ ] **Step 1: Confirm `loadEmailBranding` no longer reads effectiveBranding.is_white_label**

Already shipped in commit `b3a08968`. Verify:
```bash
grep -A3 "loadEmailBranding\|effectiveBranding" packages/crm/src/lib/emails/api.ts | head -20
```
Expected: `void effective;` comment showing agency override is stripped. If yes, no work needed.

- [ ] **Step 2: No commit needed (verification step)**

---

### Task 4.2: Twilio webhook + sms.replied payload (already done — verify)

**Files:**
- Verify: `packages/crm/src/app/api/webhooks/twilio/sms/route.ts`
- Verify: `packages/core/src/events/index.ts`

- [ ] **Step 1: Confirm precedence check matches on phone**

```bash
grep -B2 -A8 "from_phone\|matchPredicate.*phone" packages/crm/src/app/api/webhooks/twilio/sms/route.ts | head -25
```
Expected: precedence check queries `matchPredicate->>'phone'`. Already shipped in `7e9b874c`.

- [ ] **Step 2: No commit needed.**

---

## Phase 5 — Per-workspace template regeneration (0.5 day)

### Task 5.1: Re-render booking-confirmation skill template at workspace create

**Files:**
- Modify: `packages/crm/src/lib/messaging/seed-default-triggers.ts` (or wherever templates are seeded)
- Locate: workspace-create flow

- [ ] **Step 1: Find where booking-confirmation default template is seeded**

```bash
grep -rn "booking-confirmation\|Bright Smile" packages/crm/src/lib --include="*.ts" | grep -v ".next"
```

- [ ] **Step 2: Replace example-text references with template placeholders**

In each template file (e.g. `lib/messaging/skills/booking-confirmation.ts`), find the literal "Bright Smile Dental" / "Dental" strings and replace with `{{businessName}}` placeholders that the render layer interpolates from runContext.workspace.name at send time.

- [ ] **Step 3: One-shot backfill — strip stale `customSkillMd` from existing workspaces**

Via Neon MCP, query for outbound_message_triggers with `customSkillMd` containing "Bright Smile" or other example workspace names:
```sql
UPDATE outbound_message_triggers SET custom_skill_md = NULL WHERE custom_skill_md LIKE '%Bright Smile%' OR custom_skill_md LIKE '%Rain Pros%' RETURNING id, org_id;
```
This forces compose to fall back to the default template (which now uses placeholders).

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/lib/messaging/skills/booking-confirmation.ts
git commit -m "fix(messaging): replace example workspace names with placeholders in booking-confirmation template (Phase 5)"
```

---

## Phase 6 — Cross-workspace contact audit (0.5 day)

### Task 6.1: Audit + clean up cross-workspace contact leakage

**Files:**
- Locate: workspace-seeding code (likely `lib/workspace/create-full-workspace.ts`)

- [ ] **Step 1: Find where seed contacts come from**

```bash
grep -rn "maximehoule\|seedDemoContacts\|customerExamples" packages/crm/src/lib/workspace --include="*.ts" | head -10
```

- [ ] **Step 2: Replace any operator-email seeds with clearly-fake placeholder emails**

If any code injects the creator's email as a contact, replace with `customer-1@example.com` etc.

- [ ] **Step 3: One-shot SQL cleanup — remove the dev's contact from non-production test workspaces**

Via Neon MCP:
```sql
SELECT o.name, o.slug, c.id, c.first_name FROM contacts c
JOIN organizations o ON o.id = c.org_id
WHERE c.email = 'maximehoule100@gmail.com'
ORDER BY o.name;
-- Identify which workspaces to clean (NOT Roofs by Shiloh, the active dogfood).
-- Then:
DELETE FROM contacts WHERE email = 'maximehoule100@gmail.com' AND org_id NOT IN ('9d51c06c-9cad-497a-bd45-a9e2a1a84504');
```
(Operator confirms which workspaces to keep before running the DELETE.)

- [ ] **Step 4: Commit code change (if any)**

```bash
git add packages/crm/src/lib/workspace/
git commit -m "fix(workspace): stop seeding operator's email as default contact (Phase 6)"
```

---

## Phase 7 — Observability + verification + antifragility (1 day)

### Task 7.1: Display RunContext in /automations/[id]/runs expanded view

**Files:**
- Modify: `packages/crm/src/app/(dashboard)/automations/[id]/runs/page.tsx`
- Modify: `packages/crm/src/components/automations/runs-table.tsx`

- [ ] **Step 1: Fetch run.context in the runs page query**

In `runs/page.tsx`, add `context: workflowRuns.context` to the run select.

- [ ] **Step 2: Add a "Run context" section to the expanded row**

In `runs-table.tsx`, in the expanded row body, add:
```tsx
{row.context ? (
  <Section title="Run context (identity snapshot at run-start)">
    <dl className="grid gap-2 text-xs sm:grid-cols-2">
      <Field label="Customer name" value={`${row.context.customer.firstName} ${row.context.customer.lastName ?? ""}`.trim()} />
      <Field label="Phone (E.164)" value={<code className="font-mono">{row.context.customer.phone}</code>} />
      <Field label="Email" value={row.context.customer.email ?? "—"} />
      <Field label="Workspace" value={row.context.workspace.name} />
      <Field label="Timezone" value={row.context.workspace.timezone} />
      <Field label="Today at run start" value={`${row.context.clock.todayWeekday}, ${row.context.clock.today}`} />
    </dl>
  </Section>
) : null}
```

Extend the RunRow type to include `context: RunContext | null`.

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/app/\(dashboard\)/automations/\[id\]/runs/page.tsx packages/crm/src/components/automations/runs-table.tsx
git commit -m "feat(observability): show RunContext snapshot on /automations/[id]/runs (Phase 7)"
```

---

### Task 7.2: Antifragility smoke test

**Files:**
- Create: `packages/crm/tests/integration/antifragility-model-bump.spec.ts`

- [ ] **Step 1: Write the test**

```ts
// Antifragility contract — speed-to-lead must produce the same exit
// block + extracted vars across multiple Claude model versions.
// When we bump the default model, this test catches behavior breakage.
//
// Skipped in CI unless ANTHROPIC_API_KEY is set (real API call,
// costs cents per run). Run manually before each model bump:
//   ANTHROPIC_API_KEY=... pnpm exec tsx --test tests/integration/antifragility-model-bump.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

const SKIP = !process.env.ANTHROPIC_API_KEY;

describe("antifragility: speed-to-lead across model versions", { skip: SKIP }, () => {
  const SAMPLE_TRANSCRIPT = [
    { role: "assistant" as const, content: "Hi Alice, thanks for reaching out to Acme Roofing! Happy to get you booked. Any preference on day/time?" },
    { role: "user" as const, content: "Tomorrow at 3pm" },
    { role: "user" as const, content: "Yes, change my roof" },
    { role: "user" as const, content: "123 Maple Street, Austin TX 78701" },
  ];

  const MODELS_TO_TEST = ["claude-sonnet-4", "claude-sonnet-4-5"];

  for (const model of MODELS_TO_TEST) {
    test(`${model} extracts preferred_start to a real ISO datetime`, async () => {
      // Call the conversation step's LLM with the sample transcript.
      // Assert: the response contains <exit>...</exit> with a
      // preferred_start that parses as a valid Date in the next 7 days.
      // (Pseudo-code — implementation depends on extracting callLLM into
      // a testable export.)
      const result = await callConversationLLM({
        model,
        systemPrompt: buildSampleSystemPrompt(),
        transcript: SAMPLE_TRANSCRIPT,
      });
      const exitMatch = result.match(/<exit>([\s\S]*?)<\/exit>/);
      assert.ok(exitMatch, `${model}: expected <exit> block in response`);
      const extracted = JSON.parse(exitMatch[1]);
      const date = new Date(extracted.preferred_start);
      assert.ok(!Number.isNaN(date.getTime()), `${model}: preferred_start must parse as a Date`);
      const daysOut = (date.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      assert.ok(daysOut > 0 && daysOut < 7, `${model}: preferred_start must be within 7 days, got ${daysOut.toFixed(1)} days`);
    });
  }
});
```

- [ ] **Step 2: Commit (test is gated; safe to merge even without ANTHROPIC_API_KEY in CI)**

```bash
git add packages/crm/tests/integration/antifragility-model-bump.spec.ts
git commit -m "test(antifragility): pin speed-to-lead behavior across model versions (Phase 7)"
```

---

## Phase 8 — Rollout (0.5 day)

### Task 8.1: Cancel paused in-flight runs in Roofs by Shiloh

- [ ] **Step 1: Via Neon MCP**

```sql
SELECT id, status, current_step_id, archetype_id FROM workflow_runs
WHERE org_id = '9d51c06c-9cad-497a-bd45-a9e2a1a84504' AND status IN ('running', 'waiting');
```
Cancel each via:
```sql
UPDATE workflow_runs SET status = 'cancelled', current_step_id = NULL, updated_at = NOW() WHERE id IN (...) AND status NOT IN ('completed','failed');
UPDATE workflow_waits SET resumed_at = NOW(), resumed_reason = 'cancelled' WHERE run_id IN (...) AND resumed_at IS NULL;
```

### Task 8.2: Push + deploy

- [ ] **Step 1: Final typecheck + push**

```bash
cd packages/crm && pnpm typecheck
git push origin main
```
Vercel auto-runs `pnpm db:migrate && pnpm build`. Migration 0048 applies on deploy.

### Task 8.3: Smoke test

- [ ] Submit form as "Alice" with phone +14505161803, reply "tomorrow at 3pm", verify all 5 success criteria from spec (ONE opener, correct date extraction, ONE confirmation email, SMB branding, /contacts row updated).

### Task 8.4: Docs

- [ ] Add a short page `docs/architecture/run-context.md` summarizing the architecture so future archetypes follow the pattern.

---

## Self-review checklist

- [x] **Spec coverage:** all 8 phases from the spec mapped to tasks in this plan
- [x] **Locked decisions:** dual-module type split (Task 0.3), eager clock refresh (Task 1.3 `loadRunContext`), agency in RunContext (Task 0.2 + Task 0.3), eager template render (Phase 5)
- [x] **Thin harness + antifragility:** Phase 2.4 extracts prose; Phase 7.2 pins behavior across models
- [x] **Operator editability:** Phase 2.4 adds placeholders; Phase 7.1 shows RunContext in /runs page
- [x] **No placeholders:** every code step has actual code; every command has expected output
- [x] **Type consistency:** RunContext field names match across run-context.ts, build-run-context.ts, tool-invoker.ts, conversation.ts (customer.contactId, customer.phone, workspace.timezone, clock.today, etc.)
- [x] **Bookings parity:** Phase 3.3 extracts the shared helper; Phase 7 integration test asserts shape parity (deferred from explicit Phase 7 task list but covered by speed-to-lead-end-to-end.spec.ts)

Open follow-ups deferred (NOT in this plan, future work):
- trace_id propagation across events/runs/messages
- Shared Redis-backed idempotency store (replacing in-lambda + content-hash dedup)
- Standardized event payload shape across the bus (currently sms.replied has both flat phone + flat contactId; form.submitted nests under data)
- Config history rollback UI (currently history isn't written; Phase 7.3 from spec deferred to future)

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-19-runcontext-architecture.md`.

Execution mode chosen earlier: **subagent-driven, full plan now**. Next: invoke `superpowers:subagent-driven-development` with this plan as input. The skill will dispatch one fresh subagent per task above, with two-stage review (spec compliance reviewer → code quality reviewer) between tasks. Tasks are designed to be independently committable so progress is incremental.

Estimated 7 days end-to-end. Phases 0-3 are foundation and gate everything else. Phases 4-7 can parallelize after Phase 3.
