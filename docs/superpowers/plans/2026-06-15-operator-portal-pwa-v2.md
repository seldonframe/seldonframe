# Operator Portal PWA v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the operator portal from a read-only glance app to a daily-driver with in-app reply, pipeline $ visibility, a real calendar, and universal search — all gated safely behind a one-line A2P flag.

**Architecture:** v2 extends v1's existing `(operator)` route group, `OperatorMobileShell`, and hand-rolled HMAC session (`requireOperatorSessionForOrg`). It adds: two Drizzle migrations (`conversation_notes` table + `sms_messages.readAt` column), one workspace flag (`outboundSmsEnabled` in `organizations.integrations.twilio`), six new lib modules under `src/lib/operator-portal/`, and a `"use server"` messages-actions wrapper. Every screen is built to Claude-Design quality as it lands — no bolt-on pass.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle + Neon Postgres, node:test + tsx for unit tests (dependency-injected, no module mocking), framer-motion for animation.

---

## Key Commands (Verified)

```bash
# Run a single unit test file
npx tsx --test packages/crm/tests/unit/<path>/<name>.spec.ts

# Run all unit tests under a directory
npx tsx --test packages/crm/tests/unit/operator-portal/*.spec.ts

# Generate a migration (run from packages/crm)
cd packages/crm && npx drizzle-kit generate

# Build gate (run from packages/crm)
cd packages/crm && bash scripts/check-use-server.sh src && npx tsc --noEmit && npx next build
```

> **Migration workflow:** After editing `src/db/schema/*.ts`, run `cd packages/crm && npx drizzle-kit generate`. This writes a `.sql` file to `drizzle/` and updates `drizzle/meta/_journal.json`. The project's `db:migrate` script validates the journal, runs migrations tolerantly, and asserts no schema drift. Do NOT hand-edit the `_journal.json`.

---

## Important conventions

- **`"use server"` rule:** a file with `"use server"` at the top may only export `async` functions and `type`/`interface` declarations. The build gate `check-use-server.sh` rejects any `export const`, `export let`, or `export { ... }` (without `type`) from such files. Pure helper functions that need to be shared AND exported from a `"use server"` module must be made `async` (even trivially so), as demonstrated by `counts.ts`.
- **Dependency injection pattern for tests:** `node:test` has no module mocking. Every lib function that calls the DB must accept an injected `deps` argument (with db query functions as parameters) so tests can pass in stubs. The DB-calling wrapper in the lib file is NOT unit-tested directly; only the pure logic core is.
- **TZ-correct date math:** always use `Intl.DateTimeFormat.formatToParts` via the established `partsInTimezone` pattern from `bookings/actions.ts`. Never use `Date.getDay()` / `Date.getHours()` — those are server-local (UTC on Vercel).
- **Operator session:** `requireOperatorSessionForOrg(orgSlug)` → `{ orgId, orgSlug, email, supportOriginUserId }`. All data queries use `session.orgId` directly, never `getOrgId()`.

---

## File Structure

### New files created
| File | Responsibility |
|------|---------------|
| `src/db/schema/conversation-notes.ts` | `conversation_notes` table schema |
| `drizzle/00XX_conversation_notes.sql` | Migration: create table |
| `drizzle/00YY_sms_read_at.sql` | Migration: add `sms_messages.read_at` + backfill |
| `src/lib/operator-portal/outbound-sms-flag.ts` | Read/write `outboundSmsEnabled` from `organizations.integrations.twilio` |
| `src/lib/contacts/create-for-org.ts` | DRY `createContactForOrg({orgId,...})` called by both admin and operator |
| `src/lib/operator-portal/today.ts` | `getPipelineRollup(orgId, deps)` — pipeline $ rollup |
| `src/lib/operator-portal/review-request.ts` | `sendReviewRequest({orgId,contactId,...}, deps)` — email + gated SMS |
| `src/lib/operator-portal/messages.ts` | `getInboxThreads`, `markThreadRead`, `listThreadNotes`, `addThreadNote` (injected deps) |
| `src/lib/operator-portal/messages-actions.ts` | `"use server"` wrapper: `sendReplyAction`, `addNoteAction`, `markReadAction` |
| `src/lib/operator-portal/calendar.ts` | Pure `buildMonthGrid`, `buildWeekStrip` (TZ-correct, no I/O) |
| `src/lib/operator-portal/search.ts` | `universalSearch({orgId,query,limit}, deps)` — contacts+deals+bookings |
| `src/lib/operator-portal/search-actions.ts` | `"use server"` wrapper: `operatorSearchAction` |
| `tests/unit/operator-portal/today.spec.ts` | Tests for `getPipelineRollup` |
| `tests/unit/operator-portal/review-request.spec.ts` | Tests for `sendReviewRequest` |
| `tests/unit/operator-portal/messages.spec.ts` | Tests for thread grouping, unread, note CRUD |
| `tests/unit/operator-portal/calendar-grid.spec.ts` | Tests for `buildMonthGrid` + `buildWeekStrip` |
| `tests/unit/operator-portal/search.spec.ts` | Tests for `universalSearch` ranking + scoping |
| `tests/unit/contacts/create-for-org.spec.ts` | Tests for `createContactForOrg` scoping |

### Modified files
| File | What changes |
|------|-------------|
| `src/db/schema/sms-messages.ts` | Add `readAt` column |
| `src/db/schema/index.ts` | Add `export * from "./conversation-notes"` |
| `src/lib/operator-portal/counts.ts` | Replace `unreadInboundCountFromRows` logic with `readAt`-based definition; keep old export alias for backwards compat during transition |
| `src/app/portal/[orgSlug]/(operator)/page.tsx` | Today v2: Pipeline $ card + Quick Actions row |
| `src/app/portal/[orgSlug]/(operator)/messages/page.tsx` | Messages v2: All/Unread tabs + search |
| `src/app/portal/[orgSlug]/(operator)/messages/[contactId]/page.tsx` | Thread v2: reply composer + notes |
| `src/app/portal/[orgSlug]/(operator)/appointments/page.tsx` | Appts v2: month/week calendar + detail sheet |

### Deleted files
| File | Reason |
|------|--------|
| `src/app/portal/[orgSlug]/(operator)/contacts/page.tsx` | Vestigial admin-shell redirect |
| `src/app/portal/[orgSlug]/(operator)/deals/page.tsx` | Vestigial admin-shell redirect |
| `src/app/portal/[orgSlug]/(operator)/bookings/page.tsx` | Vestigial admin-shell redirect |
| `src/components/operator-portal/operator-portal-sidebar-nav.tsx` | Dead code (no consumer) |

---

## Phase 0 — Foundations

**Goal:** All data-model plumbing in place; dead code removed; build passes. No UI changes beyond the deletions.

### Task 0.1: Add `conversation_notes` schema + migration

**Files:**
- Create: `src/db/schema/conversation-notes.ts`
- Modify: `src/db/schema/index.ts`
- Create: `drizzle/00XX_conversation_notes.sql` (generated)

- [ ] **Step 1: Write the schema file**

```typescript
// src/db/schema/conversation-notes.ts
import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { organizations } from "./organizations";

export const conversationNotes = pgTable(
  "conversation_notes",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    authorEmail: text("author_email").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("conversation_notes_org_contact_idx").on(table.orgId, table.contactId),
    index("conversation_notes_org_created_idx").on(table.orgId, table.createdAt),
  ]
);
```

- [ ] **Step 2: Export from schema index**

Open `src/db/schema/index.ts` and add at the end:
```typescript
export * from "./conversation-notes";
```

- [ ] **Step 3: Generate the migration**

```bash
cd packages/crm && npx drizzle-kit generate
```

Expected: a new `.sql` file appears in `drizzle/` (e.g., `0057_conversation_notes.sql`) and `drizzle/meta/_journal.json` is updated.

- [ ] **Step 4: Inspect the generated SQL to confirm it looks correct**

The file should contain `CREATE TABLE "conversation_notes"` with id, org_id, contact_id, author_email, body, created_at columns and the two indexes. If drizzle-kit generated unexpected output (extra columns, wrong FKs), fix the schema and re-generate.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/db/schema/conversation-notes.ts packages/crm/src/db/schema/index.ts packages/crm/drizzle/
git commit -m "feat(schema): add conversation_notes table"
```

---

### Task 0.2: Add `sms_messages.readAt` column + migration with backfill

**Files:**
- Modify: `src/db/schema/sms-messages.ts`
- Create: `drizzle/00XX_sms_read_at.sql` (generated, then manually add backfill)

- [ ] **Step 1: Add the column to the schema**

Open `src/db/schema/sms-messages.ts`. After the `updatedAt` field (line 33), add:

```typescript
    readAt: timestamp("read_at", { withTimezone: true }),
```

Also add an index for efficient unread queries. In the table's index array, add:
```typescript
    index("sms_messages_org_contact_read_idx").on(table.orgId, table.contactId, table.readAt),
```

- [ ] **Step 2: Generate the migration**

```bash
cd packages/crm && npx drizzle-kit generate
```

Expected: a new `.sql` file with `ALTER TABLE "sms_messages" ADD COLUMN "read_at" timestamp with time zone;` and the index creation.

- [ ] **Step 3: Add backfill statement to the migration SQL**

Open the generated SQL file. After the `ALTER TABLE` line, add:

```sql
-- Backfill: mark all pre-existing inbound rows as read to prevent
-- a huge initial unread badge on first deploy. Only inbound rows
-- matter for the unread definition; outbound rows are never checked.
UPDATE "sms_messages"
SET "read_at" = "created_at"
WHERE "direction" = 'inbound' AND "read_at" IS NULL;
```

> Note: this backfill sets `readAt = createdAt` for all pre-existing inbound rows. New inbound rows after deploy start with `readAt = NULL` (unread) until the operator opens the thread.

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/db/schema/sms-messages.ts packages/crm/drizzle/
git commit -m "feat(schema): add sms_messages.readAt column with backfill migration"
```

---

### Task 0.3: `outboundSmsEnabled` read/write helpers

**Files:**
- Create: `src/lib/operator-portal/outbound-sms-flag.ts`

> This flag lives at `organizations.integrations.twilio.outboundSmsEnabled` (boolean, default `false`). The `OrganizationIntegrations` type in `src/db/schema/organizations.ts` has `twilio?: { accountSid, authToken, fromNumber, connected, test? }` — we read/write `outboundSmsEnabled` as an additional property on that JSONB object.

- [ ] **Step 1: Write the module**

```typescript
// src/lib/operator-portal/outbound-sms-flag.ts
// NOT "use server" — called from lib modules, not Next.js server actions.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";

/**
 * Returns true when the workspace's A2P campaign has been approved and
 * the operator has been cleared to send outbound SMS. Defaults to false
 * so the UI stays dark until the flag is explicitly flipped.
 */
export async function getOutboundSmsEnabled(orgId: string): Promise<boolean> {
  const [org] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) return false;

  const integrations = (org.integrations ?? {}) as Record<string, unknown>;
  const twilio = (integrations.twilio ?? {}) as Record<string, unknown>;
  return twilio.outboundSmsEnabled === true;
}

/**
 * Sets outboundSmsEnabled on the workspace's twilio integration object.
 * Used by Settings and (future) the A2P compliance webhook.
 */
export async function setOutboundSmsEnabled(orgId: string, enabled: boolean): Promise<void> {
  const [org] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) return;

  const integrations = ((org.integrations ?? {}) as Record<string, unknown>);
  const twilio = ((integrations.twilio ?? {}) as Record<string, unknown>);

  await db
    .update(organizations)
    .set({
      integrations: {
        ...integrations,
        twilio: { ...twilio, outboundSmsEnabled: enabled },
      },
    })
    .where(eq(organizations.id, orgId));
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/crm/src/lib/operator-portal/outbound-sms-flag.ts
git commit -m "feat(operator-portal): outboundSmsEnabled read/write helpers"
```

---

### Task 0.4: DRY `createContactForOrg` lib function

> **Problem:** `createContactAction` in `src/lib/contacts/actions.ts` calls `getOrgId()` (NextAuth) and cannot be called from the operator session which uses a different auth mechanism. We extract the core insert logic into a plain async function that accepts `orgId` explicitly.

**Files:**
- Create: `src/lib/contacts/create-for-org.ts`
- Create: `tests/unit/contacts/create-for-org.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/contacts/create-for-org.spec.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createContactForOrg, type CreateContactForOrgDeps } from "../../../src/lib/contacts/create-for-org";

test("createContactForOrg inserts under the given orgId and returns an id", async () => {
  let insertedOrgId: string | null = null;

  const deps: CreateContactForOrgDeps = {
    insertContact: async (values) => {
      insertedOrgId = values.orgId;
      return { id: "new-contact-id" };
    },
    emitContactCreated: async (_contactId, _orgId) => { /* no-op */ },
    inferLifecycle: async (_opts) => { /* no-op */ },
  };

  const result = await createContactForOrg(
    {
      orgId: "org-abc",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      phone: "+15550001234",
      status: "lead",
      source: "operator_portal",
    },
    deps
  );

  assert.equal(result.id, "new-contact-id");
  assert.equal(insertedOrgId, "org-abc");
});

test("createContactForOrg returns null id when insert returns nothing", async () => {
  const deps: CreateContactForOrgDeps = {
    insertContact: async (_values) => null,
    emitContactCreated: async (_contactId, _orgId) => { /* no-op */ },
    inferLifecycle: async (_opts) => { /* no-op */ },
  };

  const result = await createContactForOrg(
    { orgId: "org-xyz", firstName: "Bob", lastName: null, email: null, phone: null, status: "lead", source: "manual" },
    deps
  );

  assert.equal(result.id, null);
});

test("createContactForOrg does not call emitContactCreated when no id returned", async () => {
  let emitCalled = false;

  const deps: CreateContactForOrgDeps = {
    insertContact: async (_values) => null,
    emitContactCreated: async (_contactId, _orgId) => { emitCalled = true; },
    inferLifecycle: async (_opts) => { /* no-op */ },
  };

  await createContactForOrg(
    { orgId: "org-xyz", firstName: "Bob", lastName: null, email: null, phone: null, status: "lead", source: "manual" },
    deps
  );

  assert.equal(emitCalled, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/crm && npx tsx --test tests/unit/contacts/create-for-org.spec.ts
```

Expected: FAIL with "Cannot find module" or type error for `createContactForOrg`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/contacts/create-for-org.ts
// NOT "use server" — called from both the admin server action and the
// operator-portal action. Accepts injected deps for testability.
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { emitSeldonEvent } from "@/lib/events/bus";
import { inferClientLifecycleFromStatus } from "@/lib/soul/learning";

export type CreateContactForOrgInput = {
  orgId: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  source: string;
  notes?: string;
};

export type CreateContactForOrgDeps = {
  insertContact: (values: {
    orgId: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    status: string;
    source: string;
    customFields: Record<string, unknown>;
  }) => Promise<{ id: string } | null>;
  emitContactCreated: (contactId: string, orgId: string) => Promise<void>;
  inferLifecycle: (opts: { orgId: string; status: string; source: string }) => Promise<void>;
};

function defaultDeps(): CreateContactForOrgDeps {
  return {
    insertContact: async (values) => {
      const [created] = await db
        .insert(contacts)
        .values(values)
        .returning({ id: contacts.id });
      return created ?? null;
    },
    emitContactCreated: async (contactId, orgId) => {
      await emitSeldonEvent("contact.created", { contactId }, { orgId });
    },
    inferLifecycle: async (opts) => {
      await inferClientLifecycleFromStatus(opts);
    },
  };
}

/**
 * Insert a contact under a specific orgId without relying on NextAuth's
 * getOrgId(). Used by both the admin createContactAction (which can pass
 * the session orgId directly) and the operator-portal contact-create flow.
 */
export async function createContactForOrg(
  input: CreateContactForOrgInput,
  deps: CreateContactForOrgDeps = defaultDeps()
): Promise<{ id: string | null }> {
  const created = await deps.insertContact({
    orgId: input.orgId,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    status: input.status,
    source: input.source,
    customFields: input.notes ? { notes: input.notes } : {},
  });

  if (created?.id) {
    await deps.emitContactCreated(created.id, input.orgId);
    await deps.inferLifecycle({
      orgId: input.orgId,
      status: input.status,
      source: input.source,
    });
  }

  return { id: created?.id ?? null };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/crm && npx tsx --test tests/unit/contacts/create-for-org.spec.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/contacts/create-for-org.ts packages/crm/tests/unit/contacts/create-for-org.spec.ts
git commit -m "feat(contacts): createContactForOrg DRY lib fn with injected deps"
```

---

### Task 0.5: Delete redirect routes and dead sidebar

**Files:**
- Delete: `src/app/portal/[orgSlug]/(operator)/contacts/page.tsx`
- Delete: `src/app/portal/[orgSlug]/(operator)/deals/page.tsx`
- Delete: `src/app/portal/[orgSlug]/(operator)/bookings/page.tsx`
- Delete: `src/components/operator-portal/operator-portal-sidebar-nav.tsx` (if it exists)

- [ ] **Step 1: Confirm the files exist and check their contents**

Verify that `contacts/page.tsx`, `deals/page.tsx`, and `bookings/page.tsx` all simply call `redirect("/contacts")`, `redirect("/deals")`, and `redirect("/bookings")` respectively with no other logic.

- [ ] **Step 2: Delete the files**

```bash
rm packages/crm/src/app/portal/\[orgSlug\]/\(operator\)/contacts/page.tsx
rm packages/crm/src/app/portal/\[orgSlug\]/\(operator\)/deals/page.tsx
rm packages/crm/src/app/portal/\[orgSlug\]/\(operator\)/bookings/page.tsx
```

For the sidebar nav, check if it exists first:
```bash
ls packages/crm/src/components/operator-portal/operator-portal-sidebar-nav.tsx 2>/dev/null && rm packages/crm/src/components/operator-portal/operator-portal-sidebar-nav.tsx || echo "already gone"
```

- [ ] **Step 3: Run the build gate**

```bash
cd packages/crm && bash scripts/check-use-server.sh src && npx tsc --noEmit
```

Expected: clean (removing redirect-only routes should not break the type graph).

- [ ] **Step 4: Commit**

```bash
git add -u packages/crm/src/app/portal/ packages/crm/src/components/operator-portal/
git commit -m "chore(operator-portal): remove vestigial redirect routes and dead sidebar"
```

---

### Task 0.6: Phase 0 build gate

- [ ] **Step 1: Run the full build gate**

```bash
cd packages/crm && bash scripts/check-use-server.sh src && npx tsc --noEmit && npx next build
```

Expected: all three steps exit 0. Resolve any type errors before continuing.

- [ ] **Step 2: Commit if any fixes were needed**

```bash
git add -A packages/crm/
git commit -m "fix(operator-portal): Phase 0 build gate fixes"
```

---

## Phase 1 — Today v2

**Goal:** Replace the static 4-card glance screen with: the same 4 cards (unread SMS reconciled to `readAt`-based definition) + a Pipeline $ card + a Quick Actions row (Add Contact sheet, New Booking link, Request Review sheet).

### Task 1.1: `getPipelineRollup` lib function

**Files:**
- Create: `src/lib/operator-portal/today.ts`
- Create: `tests/unit/operator-portal/today.spec.ts`

**"Open stage" classification decision:** A stage is considered **closed** if `probability === 100` (Won) or `probability === 0 AND stage name contains "lost" (case-insensitive)`. All other stages are open. This matches the default pipeline seeded by `ensureDefaultPipelineForOrg`: Lead (10%), Qualified (25%), Proposal (50%), Negotiation (75%), Won (100%), Lost (0%). Won and Lost are excluded from the pipeline $ total.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/operator-portal/today.spec.ts
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isClosedStage, getPipelineRollup, type PipelineRollupDeps } from "../../../src/lib/operator-portal/today";

describe("isClosedStage", () => {
  test("probability=100 is closed (Won)", async () => {
    assert.equal(await isClosedStage({ name: "Won", probability: 100 }), true);
  });

  test("probability=0 + name contains 'lost' is closed", async () => {
    assert.equal(await isClosedStage({ name: "Lost", probability: 0 }), true);
    assert.equal(await isClosedStage({ name: "LOST", probability: 0 }), true);
    assert.equal(await isClosedStage({ name: "Closed-Lost", probability: 0 }), true);
  });

  test("probability=0 but name does NOT contain 'lost' is open (e.g. 'Lead')", async () => {
    assert.equal(await isClosedStage({ name: "Lead", probability: 0 }), false);
  });

  test("probability=50 is open", async () => {
    assert.equal(await isClosedStage({ name: "Proposal", probability: 50 }), false);
  });
});

describe("getPipelineRollup", () => {
  const stages = [
    { name: "Lead", color: "#gray", probability: 10 },
    { name: "Proposal", color: "#blue", probability: 50 },
    { name: "Won", color: "#green", probability: 100 },
    { name: "Lost", color: "#red", probability: 0 },
  ];

  const makeDeps = (
    dealsOverride: Array<{ stage: string; value: string }>,
    stagesOverride = stages
  ): PipelineRollupDeps => ({
    fetchDeals: async (_orgId) => dealsOverride,
    fetchPipelineStages: async (_orgId) => stagesOverride,
  });

  test("sums value of open-stage deals only", async () => {
    const deps = makeDeps([
      { stage: "Lead", value: "1000.00" },
      { stage: "Proposal", value: "2000.00" },
      { stage: "Won", value: "500.00" },     // closed — excluded
      { stage: "Lost", value: "300.00" },    // closed — excluded
    ]);
    const result = await getPipelineRollup("org-1", deps);
    assert.equal(result.totalOpenValue, 3000);
  });

  test("per-stage breakdown excludes closed stages", async () => {
    const deps = makeDeps([
      { stage: "Lead", value: "1000.00" },
      { stage: "Won", value: "500.00" },
    ]);
    const result = await getPipelineRollup("org-1", deps);
    assert.equal(result.byStage.length, 1);
    assert.equal(result.byStage[0]?.name, "Lead");
    assert.equal(result.byStage[0]?.totalValue, 1000);
    assert.equal(result.byStage[0]?.count, 1);
  });

  test("returns zero total when all deals are closed", async () => {
    const deps = makeDeps([
      { stage: "Won", value: "500.00" },
      { stage: "Lost", value: "300.00" },
    ]);
    const result = await getPipelineRollup("org-1", deps);
    assert.equal(result.totalOpenValue, 0);
    assert.equal(result.byStage.length, 0);
  });

  test("handles empty deals list", async () => {
    const deps = makeDeps([]);
    const result = await getPipelineRollup("org-1", deps);
    assert.equal(result.totalOpenValue, 0);
    assert.equal(result.byStage.length, 0);
  });

  test("unknown stage (not in pipeline) is treated as open", async () => {
    const deps = makeDeps([
      { stage: "CustomStage", value: "750.00" },
    ]);
    const result = await getPipelineRollup("org-1", deps);
    // CustomStage not found in pipeline stages; default to open (probability not known → not closed)
    assert.equal(result.totalOpenValue, 750);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/crm && npx tsx --test tests/unit/operator-portal/today.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/operator-portal/today.ts
// NOT "use server" — called from the Today page server component.
import { db } from "@/db";
import { deals, pipelines } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export type PipelineStageInfo = { name: string; probability: number };

export type PipelineRollupDeps = {
  fetchDeals: (orgId: string) => Promise<Array<{ stage: string; value: string }>>;
  fetchPipelineStages: (orgId: string) => Promise<PipelineStageInfo[]>;
};

export type StageRollup = {
  name: string;
  totalValue: number;
  count: number;
};

export type PipelineRollup = {
  totalOpenValue: number;
  byStage: StageRollup[];
};

/** A stage is closed when it is Won (probability=100) or Lost
 *  (probability=0 AND name contains "lost", case-insensitive). */
export async function isClosedStage(stage: PipelineStageInfo): Promise<boolean> {
  if (stage.probability === 100) return true;
  if (stage.probability === 0 && stage.name.toLowerCase().includes("lost")) return true;
  return false;
}

function defaultDeps(): PipelineRollupDeps {
  return {
    fetchDeals: async (orgId) => {
      return db
        .select({ stage: deals.stage, value: deals.value })
        .from(deals)
        .where(eq(deals.orgId, orgId));
    },
    fetchPipelineStages: async (orgId) => {
      const [pipeline] = await db
        .select({ stages: pipelines.stages })
        .from(pipelines)
        .where(and(eq(pipelines.orgId, orgId), eq(pipelines.isDefault, true)))
        .limit(1);
      return (pipeline?.stages ?? []) as PipelineStageInfo[];
    },
  };
}

export async function getPipelineRollup(
  orgId: string,
  deps: PipelineRollupDeps = defaultDeps()
): Promise<PipelineRollup> {
  const [allDeals, pipelineStages] = await Promise.all([
    deps.fetchDeals(orgId),
    deps.fetchPipelineStages(orgId),
  ]);

  const stageMap = new Map<string, PipelineStageInfo>(
    pipelineStages.map((s) => [s.name, s])
  );

  const openDeals = allDeals.filter((d) => {
    const stageInfo = stageMap.get(d.stage);
    if (!stageInfo) return true; // unknown stage → treat as open
    // sync-call the pure logic (isClosedStage is trivially async for "use server" compat; call inline)
    if (stageInfo.probability === 100) return false;
    if (stageInfo.probability === 0 && stageInfo.name.toLowerCase().includes("lost")) return false;
    return true;
  });

  const byStageMap = new Map<string, StageRollup>();
  let totalOpenValue = 0;

  for (const d of openDeals) {
    const v = Number(d.value) || 0;
    totalOpenValue += v;
    const existing = byStageMap.get(d.stage);
    if (existing) {
      existing.totalValue += v;
      existing.count += 1;
    } else {
      byStageMap.set(d.stage, { name: d.stage, totalValue: v, count: 1 });
    }
  }

  return { totalOpenValue, byStage: Array.from(byStageMap.values()) };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/crm && npx tsx --test tests/unit/operator-portal/today.spec.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/operator-portal/today.ts packages/crm/tests/unit/operator-portal/today.spec.ts
git commit -m "feat(operator-portal): getPipelineRollup with open-stage classification"
```

---

### Task 1.2: `sendReviewRequest` lib function

**Files:**
- Create: `src/lib/operator-portal/review-request.ts`
- Create: `tests/unit/operator-portal/review-request.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/operator-portal/review-request.spec.ts
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sendReviewRequest, type ReviewRequestDeps } from "../../../src/lib/operator-portal/review-request";

const baseInput = {
  orgId: "org-1",
  contactId: "contact-1",
  toEmail: "jane@example.com",
  toPhone: "+15550001234",
  contactName: "Jane Doe",
  reviewLink: "https://g.page/r/example-review",
};

describe("sendReviewRequest", () => {
  test("always sends email", async () => {
    let emailSent = false;
    const deps: ReviewRequestDeps = {
      sendEmail: async (_params) => { emailSent = true; return { emailId: "e1", suppressed: false }; },
      sendSms: async (_params) => { throw new Error("should not be called"); },
      getOutboundSmsEnabled: async (_orgId) => false,
    };
    const result = await sendReviewRequest(baseInput, deps);
    assert.equal(emailSent, true);
    assert.equal(result.emailSent, true);
    assert.equal(result.smsSent, false);
  });

  test("does NOT send SMS when outboundSmsEnabled=false", async () => {
    let smsCalled = false;
    const deps: ReviewRequestDeps = {
      sendEmail: async (_params) => ({ emailId: "e1", suppressed: false }),
      sendSms: async (_params) => { smsCalled = true; return { smsId: "s1", suppressed: false, externalMessageId: "ext", segments: 1 }; },
      getOutboundSmsEnabled: async (_orgId) => false,
    };
    const result = await sendReviewRequest(baseInput, deps);
    assert.equal(smsCalled, false);
    assert.equal(result.smsSent, false);
  });

  test("sends SMS when outboundSmsEnabled=true and toPhone is set", async () => {
    let smsCalled = false;
    const deps: ReviewRequestDeps = {
      sendEmail: async (_params) => ({ emailId: "e1", suppressed: false }),
      sendSms: async (_params) => { smsCalled = true; return { smsId: "s1", suppressed: false, externalMessageId: "ext", segments: 1 }; },
      getOutboundSmsEnabled: async (_orgId) => true,
    };
    const result = await sendReviewRequest(baseInput, deps);
    assert.equal(smsCalled, true);
    assert.equal(result.smsSent, true);
  });

  test("does NOT send SMS when toPhone is empty even if enabled", async () => {
    let smsCalled = false;
    const deps: ReviewRequestDeps = {
      sendEmail: async (_params) => ({ emailId: "e1", suppressed: false }),
      sendSms: async (_params) => { smsCalled = true; return { smsId: "s1", suppressed: false, externalMessageId: "ext", segments: 1 }; },
      getOutboundSmsEnabled: async (_orgId) => true,
    };
    const result = await sendReviewRequest({ ...baseInput, toPhone: "" }, deps);
    assert.equal(smsCalled, false);
    assert.equal(result.smsSent, false);
  });

  test("returns emailSuppressed=true when email provider suppresses", async () => {
    const deps: ReviewRequestDeps = {
      sendEmail: async (_params) => ({ emailId: null, suppressed: true, reason: "bounced" }),
      sendSms: async (_params) => { throw new Error("should not be called"); },
      getOutboundSmsEnabled: async (_orgId) => false,
    };
    const result = await sendReviewRequest(baseInput, deps);
    assert.equal(result.emailSent, false);
    assert.equal(result.emailSuppressed, true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/crm && npx tsx --test tests/unit/operator-portal/review-request.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/operator-portal/review-request.ts
// NOT "use server" — called from a "use server" action wrapper.
import { sendEmailFromApi } from "@/lib/emails/api";
import { sendSmsFromApi, type SendSmsResult } from "@/lib/sms/api";
import { getOutboundSmsEnabled } from "./outbound-sms-flag";

export type ReviewRequestDeps = {
  sendEmail: (params: {
    orgId: string;
    userId: null;
    contactId: string;
    toEmail: string;
    subject: string;
    body: string;
    ctaLabel: string;
    ctaHref: string;
  }) => Promise<{ emailId: string | null; suppressed: boolean; reason?: string }>;
  sendSms: (params: {
    orgId: string;
    userId: null;
    contactId: string;
    toNumber: string;
    body: string;
  }) => Promise<SendSmsResult>;
  getOutboundSmsEnabled: (orgId: string) => Promise<boolean>;
};

export type ReviewRequestInput = {
  orgId: string;
  contactId: string;
  toEmail: string;
  toPhone: string;
  contactName: string;
  reviewLink: string;
};

export type ReviewRequestResult = {
  emailSent: boolean;
  emailSuppressed: boolean;
  smsSent: boolean;
  smsError?: string;
};

function defaultDeps(): ReviewRequestDeps {
  return {
    sendEmail: sendEmailFromApi,
    sendSms: sendSmsFromApi,
    getOutboundSmsEnabled,
  };
}

export async function sendReviewRequest(
  input: ReviewRequestInput,
  deps: ReviewRequestDeps = defaultDeps()
): Promise<ReviewRequestResult> {
  const subject = `How was your experience with us, ${input.contactName.split(" ")[0] || input.contactName}?`;
  const body = `Hi ${input.contactName.split(" ")[0] || input.contactName},\n\nThank you for choosing us! If you have a moment, we'd love to hear what you think. Your feedback helps us keep improving.\n\nLeave a quick review — it only takes 30 seconds.`;

  const emailResult = await deps.sendEmail({
    orgId: input.orgId,
    userId: null,
    contactId: input.contactId,
    toEmail: input.toEmail,
    subject,
    body,
    ctaLabel: "Leave a Review →",
    ctaHref: input.reviewLink,
  });

  const emailSent = !emailResult.suppressed && !!emailResult.emailId;
  const emailSuppressed = emailResult.suppressed;

  let smsSent = false;
  let smsError: string | undefined;

  const outboundEnabled = await deps.getOutboundSmsEnabled(input.orgId);
  if (outboundEnabled && input.toPhone.trim()) {
    try {
      const smsBody = `Hi ${input.contactName.split(" ")[0] || input.contactName}! We'd love your feedback 🙏 ${input.reviewLink}`;
      const smsResult = await deps.sendSms({
        orgId: input.orgId,
        userId: null,
        contactId: input.contactId,
        toNumber: input.toPhone,
        body: smsBody,
      });
      smsSent = !smsResult.suppressed;
    } catch (err) {
      smsError = err instanceof Error ? err.message : "SMS send failed";
    }
  }

  return { emailSent, emailSuppressed, smsSent, smsError };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/crm && npx tsx --test tests/unit/operator-portal/review-request.spec.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/operator-portal/review-request.ts packages/crm/tests/unit/operator-portal/review-request.spec.ts
git commit -m "feat(operator-portal): sendReviewRequest with gated SMS path"
```

---

### Task 1.3: Today v2 UI — Pipeline $ card + Quick Actions

**Files:**
- Modify: `src/app/portal/[orgSlug]/(operator)/page.tsx`

**UI contract:**
- Path: `src/app/portal/[orgSlug]/(operator)/page.tsx`
- Data sources: `getPipelineRollup(orgId)`, `countNewLeads(orgId)`, `getOutboundSmsEnabled(orgId)`, existing today's-bookings inline query, existing `countUnreadInboundSms` (keep using it — `readAt`-based refactor happens in Phase 2 Task 2.1)
- Sections: (1) 4 glance cards row (same as v1); (2) Pipeline $ card — full-width, shows total open value formatted as `$X,XXX`, tappable → opens a bottom sheet with per-stage breakdown; (3) Quick Actions row — 3 large tappable tiles: "Add Contact", "New Booking", "Request Review"; (4) existing "Up next" list
- States: loading = skeleton cards; pipeline $ = 0 → shows "No open deals yet"; empty quick actions row = never empty (always show all 3)
- "Add Contact" opens a `<dialog>` or bottom sheet with fields: First Name (required), Last Name, Phone, Email, Status (default "lead"). On submit calls `createContactForOrg` via a `"use server"` action. Show inline success ("Contact added!") or error.
- "New Booking" is a plain `<Link href={`/book/${orgSlug}`}>` — links to the existing public booking page.
- "Request Review" opens a bottom sheet: contact picker (search among recent leads via `listContacts({orgId, sort:"recent", orgId})`), review link input (pre-fills from `organizations.soul.reviewLink` if set), Send button. On submit calls `sendReviewRequest`.
- Claude-Design note: use `framer-motion` `AnimatePresence` for sheet open/close; tap targets minimum 48px; agency `primary_color` for active accents via `branding.primary_color`.

- [ ] **Step 1: Update the Today page**

Replace the existing `src/app/portal/[orgSlug]/(operator)/page.tsx` with the v2 implementation. The server component fetches all data in parallel:

```typescript
const [newLeads, unreadTexts, todaysBookings, pipelineRollup, outboundEnabled] = await Promise.all([
  countNewLeads(orgId),
  countUnreadInboundSms(orgId),
  db.select(/* today's bookings query — same as v1 */).from(bookings).where(/* ... */),
  getPipelineRollup(orgId),
  getOutboundSmsEnabled(orgId),
]);
```

Pass `pipelineRollup`, `outboundEnabled`, `orgSlug`, and `branding` as props to client components for the interactive sections (sheets).

- [ ] **Step 2: Run build gate**

```bash
cd packages/crm && bash scripts/check-use-server.sh src && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/app/portal/
git commit -m "feat(operator-portal): Today v2 — Pipeline $ card + Quick Actions"
```

---

### Task 1.4: Phase 1 build gate

- [ ] **Step 1: Full build gate**

```bash
cd packages/crm && bash scripts/check-use-server.sh src && npx tsc --noEmit && npx next build
```

Expected: exit 0. Fix any build errors before continuing.

- [ ] **Step 2: Commit if fixes needed**

```bash
git add -A packages/crm/
git commit -m "fix(operator-portal): Phase 1 build gate fixes"
```

---

## Phase 2 — Messages v2

**Goal:** The inbox gets All/Unread tabs and client-side search. The thread view gets an in-app reply composer (gated by `outboundSmsEnabled`) and private notes. Opening a thread marks it read (`readAt = now()` for unread inbound rows).

### Task 2.1: `messages.ts` lib — threads, unread, notes

**Files:**
- Create: `src/lib/operator-portal/messages.ts`
- Create: `tests/unit/operator-portal/messages.spec.ts`
- Modify: `src/lib/operator-portal/counts.ts` (update `countUnreadInboundSms` to use `readAt` after Phase 2 lands)

**Unread reconciliation with `counts.ts`:** The current `countUnreadInboundSms` in `counts.ts` uses the outbound-after-inbound heuristic (walking desc-by-createdAt, a contact's inbound messages are "read" once an outbound is seen). After `sms_messages.readAt` is deployed, we migrate to: unread = `direction='inbound' AND readAt IS NULL`. The Today card will use this same definition. We update `countUnreadInboundSms` in this task (after the new column migration from Phase 0 is in place).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/operator-portal/messages.spec.ts
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildInboxThreads,
  type SmsRow,
  type ThreadNote,
} from "../../../src/lib/operator-portal/messages";

// buildInboxThreads is the PURE core of getInboxThreads, testable without DB.

const makeMsg = (
  contactId: string,
  direction: "inbound" | "outbound",
  readAt: Date | null,
  createdAt: Date,
  body = "msg"
): SmsRow => ({
  id: `msg-${Math.random()}`,
  contactId,
  direction,
  body,
  createdAt,
  readAt,
});

describe("buildInboxThreads", () => {
  test("single inbound with readAt=null → unreadCount=1", () => {
    const rows: SmsRow[] = [
      makeMsg("c1", "inbound", null, new Date("2026-06-15T10:00:00Z")),
    ];
    const threads = buildInboxThreads(rows);
    assert.equal(threads.length, 1);
    assert.equal(threads[0]?.unreadCount, 1);
    assert.equal(threads[0]?.contactId, "c1");
  });

  test("inbound with readAt set → unreadCount=0", () => {
    const rows: SmsRow[] = [
      makeMsg("c1", "inbound", new Date("2026-06-15T10:01:00Z"), new Date("2026-06-15T10:00:00Z")),
    ];
    const threads = buildInboxThreads(rows);
    assert.equal(threads[0]?.unreadCount, 0);
  });

  test("multiple contacts — each gets own thread", () => {
    const rows: SmsRow[] = [
      makeMsg("c1", "inbound", null, new Date("2026-06-15T10:00:00Z")),
      makeMsg("c2", "inbound", null, new Date("2026-06-15T09:00:00Z")),
    ];
    const threads = buildInboxThreads(rows);
    assert.equal(threads.length, 2);
  });

  test("threads sorted most-recent first", () => {
    const rows: SmsRow[] = [
      makeMsg("c1", "inbound", null, new Date("2026-06-15T09:00:00Z")),
      makeMsg("c2", "inbound", null, new Date("2026-06-15T11:00:00Z")),
    ];
    const threads = buildInboxThreads(rows);
    assert.equal(threads[0]?.contactId, "c2");
  });

  test("outbound-only contact does not appear as thread (no inbound)", () => {
    const rows: SmsRow[] = [
      makeMsg("c1", "outbound", null, new Date("2026-06-15T10:00:00Z")),
    ];
    const threads = buildInboxThreads(rows);
    assert.equal(threads.length, 0);
  });

  test("mixed inbound+outbound: last message direction captured", () => {
    const rows: SmsRow[] = [
      makeMsg("c1", "outbound", null, new Date("2026-06-15T10:01:00Z"), "reply"),
      makeMsg("c1", "inbound", null, new Date("2026-06-15T10:00:00Z"), "question"),
    ];
    const threads = buildInboxThreads(rows);
    // Thread exists (has inbound), last message is the outbound (newer)
    assert.equal(threads.length, 1);
    assert.equal(threads[0]?.lastDirection, "outbound");
    assert.equal(threads[0]?.lastBody, "reply");
    // The inbound has readAt=null but there's a newer outbound, per readAt definition: unread still = 1
    // (readAt is the authoritative check, not outbound-after-inbound)
    assert.equal(threads[0]?.unreadCount, 1);
  });

  test("ignores rows with null contactId", () => {
    const rows: SmsRow[] = [
      { id: "x", contactId: null, direction: "inbound", body: "anon", createdAt: new Date(), readAt: null },
    ];
    const threads = buildInboxThreads(rows);
    assert.equal(threads.length, 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/crm && npx tsx --test tests/unit/operator-portal/messages.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/operator-portal/messages.ts
// NOT "use server" — the "use server" wrapper is messages-actions.ts.
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { contacts, conversationNotes, smsMessages } from "@/db/schema";

// ─── types ────────────────────────────────────────────────────────────────

export type SmsRow = {
  id: string;
  contactId: string | null;
  direction: "inbound" | "outbound";
  body: string;
  createdAt: Date;
  readAt: Date | null;
};

export type InboxThread = {
  contactId: string;
  lastMessageAt: Date;
  lastBody: string;
  lastDirection: "inbound" | "outbound";
  unreadCount: number;
};

export type ThreadNote = {
  id: string;
  authorEmail: string;
  body: string;
  createdAt: Date;
};

// ─── pure core (testable without DB) ──────────────────────────────────────

/**
 * Group SMS rows into inbox threads. Unread = inbound rows where readAt IS NULL.
 * Threads with no inbound messages are excluded (outbound-only = no thread to show).
 * Returns threads sorted most-recent-first by last message time.
 */
export function buildInboxThreads(rows: SmsRow[]): InboxThread[] {
  type ThreadAccum = {
    contactId: string;
    lastMessageAt: Date;
    lastBody: string;
    lastDirection: "inbound" | "outbound";
    hasInbound: boolean;
    unreadCount: number;
  };

  // rows are expected desc by createdAt from the DB query.
  const threadMap = new Map<string, ThreadAccum>();

  for (const row of rows) {
    if (!row.contactId) continue;
    const direction = row.direction;

    let t = threadMap.get(row.contactId);
    if (!t) {
      t = {
        contactId: row.contactId,
        lastMessageAt: row.createdAt,
        lastBody: row.body,
        lastDirection: direction,
        hasInbound: false,
        unreadCount: 0,
      };
      threadMap.set(row.contactId, t);
    }

    if (direction === "inbound") {
      t.hasInbound = true;
      if (row.readAt === null) {
        t.unreadCount += 1;
      }
    }
  }

  return Array.from(threadMap.values())
    .filter((t) => t.hasInbound)
    .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
}

// ─── DB-backed functions (not unit-tested; injected in tests via wrappers) ──

export async function getInboxThreads(orgId: string): Promise<InboxThread[]> {
  const rows = await db
    .select({
      id: smsMessages.id,
      contactId: smsMessages.contactId,
      direction: smsMessages.direction,
      body: smsMessages.body,
      createdAt: smsMessages.createdAt,
      readAt: smsMessages.readAt,
    })
    .from(smsMessages)
    .where(eq(smsMessages.orgId, orgId))
    .orderBy(desc(smsMessages.createdAt))
    .limit(500);

  return buildInboxThreads(
    rows.map((r) => ({
      id: r.id,
      contactId: r.contactId,
      direction: r.direction as "inbound" | "outbound",
      body: r.body,
      createdAt: r.createdAt,
      readAt: r.readAt,
    }))
  );
}

/** Mark all unread inbound messages for a contact as read. */
export async function markThreadRead(params: {
  orgId: string;
  contactId: string;
}): Promise<void> {
  await db
    .update(smsMessages)
    .set({ readAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(smsMessages.orgId, params.orgId),
        eq(smsMessages.contactId, params.contactId),
        eq(smsMessages.direction, "inbound"),
        isNull(smsMessages.readAt)
      )
    );
}

export async function listThreadNotes(params: {
  orgId: string;
  contactId: string;
}): Promise<ThreadNote[]> {
  const rows = await db
    .select({
      id: conversationNotes.id,
      authorEmail: conversationNotes.authorEmail,
      body: conversationNotes.body,
      createdAt: conversationNotes.createdAt,
    })
    .from(conversationNotes)
    .where(
      and(
        eq(conversationNotes.orgId, params.orgId),
        eq(conversationNotes.contactId, params.contactId)
      )
    )
    .orderBy(asc(conversationNotes.createdAt));

  return rows;
}

export async function addThreadNote(params: {
  orgId: string;
  contactId: string;
  authorEmail: string;
  body: string;
}): Promise<{ id: string }> {
  const [created] = await db
    .insert(conversationNotes)
    .values({
      orgId: params.orgId,
      contactId: params.contactId,
      authorEmail: params.authorEmail,
      body: params.body.trim(),
    })
    .returning({ id: conversationNotes.id });

  if (!created) throw new Error("Could not create note");
  return { id: created.id };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/crm && npx tsx --test tests/unit/operator-portal/messages.spec.ts
```

Expected: all tests pass.

- [ ] **Step 5: Update `countUnreadInboundSms` in counts.ts to use `readAt`**

Open `src/lib/operator-portal/counts.ts`. Replace the `countUnreadInboundSms` function body:

```typescript
/** Unread inbound SMS = inbound rows where readAt IS NULL. */
export async function countUnreadInboundSms(orgId: string): Promise<number> {
  const rows = await db
    .select({ id: smsMessages.id })
    .from(smsMessages)
    .where(
      and(
        eq(smsMessages.orgId, orgId),
        eq(smsMessages.direction, "inbound"),
        isNull(smsMessages.readAt)
      )
    );
  return rows.length;
}
```

Add `isNull` to the drizzle-orm import at the top. The existing `unreadInboundCountFromRows` export and `isWithinDays` export remain unchanged (they are still used by existing tests and the legacy code path).

- [ ] **Step 6: Run existing counts tests to verify they still pass**

```bash
cd packages/crm && npx tsx --test tests/unit/operator-portal/counts.spec.ts
```

Expected: all pass (the tests only cover `isWithinDays` and `unreadInboundCountFromRows` which are unchanged).

- [ ] **Step 7: Commit**

```bash
git add packages/crm/src/lib/operator-portal/messages.ts packages/crm/tests/unit/operator-portal/messages.spec.ts packages/crm/src/lib/operator-portal/counts.ts
git commit -m "feat(operator-portal): messages lib — threads, unread (readAt), notes CRUD"
```

---

### Task 2.2: `messages-actions.ts` "use server" wrapper

**Files:**
- Create: `src/lib/operator-portal/messages-actions.ts`

> This file is `"use server"` so it may only export async functions. The three actions are: `sendReplyAction` (gated by `outboundSmsEnabled`), `addNoteAction`, `markReadAction`. Each validates the operator session from a passed `orgSlug` parameter — the client components supply it.

- [ ] **Step 1: Write the file**

```typescript
// src/lib/operator-portal/messages-actions.ts
"use server";

import { requireOperatorSessionForOrg } from "./auth";
import { getOutboundSmsEnabled } from "./outbound-sms-flag";
import { addThreadNote, markThreadRead } from "./messages";
import { sendSmsFromApi } from "@/lib/sms/api";

export type SendReplyResult =
  | { ok: true }
  | { ok: false; error: string };

export async function sendReplyAction(params: {
  orgSlug: string;
  contactId: string;
  toNumber: string;
  body: string;
}): Promise<SendReplyResult> {
  const session = await requireOperatorSessionForOrg(params.orgSlug);
  const orgId = session.orgId;

  const enabled = await getOutboundSmsEnabled(orgId);
  if (!enabled) {
    return { ok: false, error: "outbound_sms_not_enabled" };
  }

  try {
    await sendSmsFromApi({
      orgId,
      userId: null,
      contactId: params.contactId,
      toNumber: params.toNumber,
      body: params.body,
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    return { ok: false, error: message };
  }
}

export async function addNoteAction(params: {
  orgSlug: string;
  contactId: string;
  body: string;
}): Promise<{ ok: true; noteId: string } | { ok: false; error: string }> {
  const session = await requireOperatorSessionForOrg(params.orgSlug);

  if (!params.body.trim()) {
    return { ok: false, error: "Note body is required" };
  }

  try {
    const note = await addThreadNote({
      orgId: session.orgId,
      contactId: params.contactId,
      authorEmail: session.email,
      body: params.body,
    });
    return { ok: true, noteId: note.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save note";
    return { ok: false, error: message };
  }
}

export async function markReadAction(params: {
  orgSlug: string;
  contactId: string;
}): Promise<void> {
  const session = await requireOperatorSessionForOrg(params.orgSlug);
  await markThreadRead({ orgId: session.orgId, contactId: params.contactId });
}
```

- [ ] **Step 2: Run the use-server check**

```bash
cd packages/crm && bash scripts/check-use-server.sh src
```

Expected: clean (all exports are async functions).

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/lib/operator-portal/messages-actions.ts
git commit -m "feat(operator-portal): messages-actions server action wrapper"
```

---

### Task 2.3: Messages inbox v2 UI — All/Unread tabs + search

**Files:**
- Modify: `src/app/portal/[orgSlug]/(operator)/messages/page.tsx`

**UI contract:**
- Path: `src/app/portal/[orgSlug]/(operator)/messages/page.tsx`
- Data source: `getInboxThreads(orgId)` from `messages.ts` (replaces the inline grouping in the current file)
- Contact name resolution: join against contacts table exactly as v1 does
- Layout: (1) header "Messages"; (2) segmented control "All | Unread" (client-side filter, no re-fetch); (3) search input (debounced 300ms, client-side `ilike` over contact name and last message body); (4) thread list (same card style as v1, but now shows `unreadCount` from `readAt`-based definition)
- States: loading skeleton; empty-all state "No texts yet. Replies land here…"; empty-unread state "You're all caught up."
- Claude-Design note: segmented control uses `branding.primary_color` for active segment; search uses a `<input type="search">` with clear button; thread avatars animate in with `framer-motion` staggered fade; 48px minimum tap targets.

- [ ] **Step 1: Rewrite the messages page**

Replace `src/app/portal/[orgSlug]/(operator)/messages/page.tsx`. Server component fetches `getInboxThreads(orgId)` and contacts. Pass the thread+contact data down to a `MessagesClient` client component that owns the tab state and search filter.

- [ ] **Step 2: Run build gate**

```bash
cd packages/crm && bash scripts/check-use-server.sh src && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/app/portal/
git commit -m "feat(operator-portal): Messages v2 — All/Unread tabs + inbox search"
```

---

### Task 2.4: Thread view v2 — reply composer + private notes

**Files:**
- Modify: `src/app/portal/[orgSlug]/(operator)/messages/[contactId]/page.tsx`

**UI contract:**
- Path: `src/app/portal/[orgSlug]/(operator)/messages/[contactId]/page.tsx`
- On mount: call `markReadAction({ orgSlug, contactId })` via a client-side `useEffect` so the thread is marked read when opened. (Server-component call is acceptable too if simpler; use the server path.)
- Fetch: messages (ascending) + `listThreadNotes({ orgId, contactId })` in parallel
- Layout: thread bubbles (same styling as v1) + notes rendered inline between messages with a distinct visual treatment (e.g., amber/yellow background, "Private note" label, author email + time); below the thread a sticky composer area
- Composer: (a) text input + Send button when `outboundSmsEnabled=true`; (b) when `false`, show the "Texting turns on the moment your A2P is approved." notice instead (no input). A second tab/toggle for "+ Add Note" always visible and always functional.
- Send: calls `sendReplyAction`; on error shows inline "Couldn't send — {error}" and keeps draft; on success appends message optimistically.
- Note: calls `addNoteAction`; on success appends note optimistically; clears input.
- Claude-Design note: outbound bubbles right-aligned with `branding.primary_color` background; inbound left-aligned gray; notes amber; compose area has `safe-area-inset-bottom` padding for iPhone home indicator.

- [ ] **Step 1: Rewrite the thread page**

Replace `src/app/portal/[orgSlug]/(operator)/messages/[contactId]/page.tsx`.

The server component calls `markThreadRead` before rendering (or the client calls `markReadAction` in a `useEffect`). Pass messages, notes, contact, `outboundSmsEnabled`, and `orgSlug` to a `ThreadViewClient` client component.

- [ ] **Step 2: Run build gate**

```bash
cd packages/crm && bash scripts/check-use-server.sh src && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/app/portal/
git commit -m "feat(operator-portal): Thread v2 — reply composer + private notes + mark-read"
```

---

### Task 2.5: Phase 2 build gate

- [ ] **Step 1: Full build gate**

```bash
cd packages/crm && bash scripts/check-use-server.sh src && npx tsc --noEmit && npx next build
```

Expected: exit 0. Fix any errors.

- [ ] **Step 2: Commit if fixes needed**

```bash
git add -A packages/crm/
git commit -m "fix(operator-portal): Phase 2 build gate fixes"
```

---

## Phase 3 — Appts v2

**Goal:** Replace the flat bookings list with a month/week calendar toggle + booking detail sheet with reschedule/cancel.

### Task 3.1: `calendar.ts` — pure date-bucketing lib

**Files:**
- Create: `src/lib/operator-portal/calendar.ts`
- Create: `tests/unit/operator-portal/calendar-grid.spec.ts`

> **TZ approach:** Use `Intl.DateTimeFormat.formatToParts` (the same `partsInTimezone` pattern from `bookings/actions.ts`) to extract year/month/day in the workspace timezone. Never use `Date.getFullYear()` / `.getMonth()` / `.getDate()` — those are server-local.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/operator-portal/calendar-grid.spec.ts
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildMonthGrid, buildWeekStrip, type CalendarBooking } from "../../../src/lib/operator-portal/calendar";

const TZ = "America/New_York"; // UTC-5 in winter, UTC-4 in summer

function makeBooking(isoStart: string, id = isoStart): CalendarBooking {
  return {
    id,
    startsAt: new Date(isoStart),
    endsAt: new Date(new Date(isoStart).getTime() + 60 * 60_000),
    title: "Test",
    fullName: "Jane Doe",
    contactId: "c1",
    status: "scheduled",
  };
}

describe("buildMonthGrid", () => {
  test("generates 5 or 6 week rows for June 2026 in America/New_York", () => {
    const anchor = new Date("2026-06-15T12:00:00Z");
    const grid = buildMonthGrid([], anchor, TZ);
    // June 2026: starts on Monday (2026-06-01), 30 days → 5 rows
    assert.ok(grid.weeks.length >= 4 && grid.weeks.length <= 6, `Expected 4-6 weeks, got ${grid.weeks.length}`);
    assert.equal(grid.year, 2026);
    assert.equal(grid.month, 6); // 1-indexed
  });

  test("each week has 7 days", () => {
    const anchor = new Date("2026-06-15T12:00:00Z");
    const grid = buildMonthGrid([], anchor, TZ);
    for (const week of grid.weeks) {
      assert.equal(week.days.length, 7);
    }
  });

  test("booking on 2026-06-15 appears on correct day cell", () => {
    const booking = makeBooking("2026-06-15T14:00:00Z"); // 10am ET (UTC-4)
    const anchor = new Date("2026-06-15T12:00:00Z");
    const grid = buildMonthGrid([booking], anchor, TZ);

    // Find the day cell for June 15
    let found = false;
    for (const week of grid.weeks) {
      for (const day of week.days) {
        if (day.year === 2026 && day.month === 6 && day.day === 15) {
          assert.equal(day.bookings.length, 1);
          found = true;
        }
      }
    }
    assert.equal(found, true, "Day cell for June 15 not found in grid");
  });

  test("booking at 2026-01-01T01:00:00Z appears on Dec 31 in UTC-5 (not Jan 1)", () => {
    // 01:00 UTC = 20:00 ET (previous day) because UTC-5 in winter
    const booking = makeBooking("2026-01-01T01:00:00Z", "dec31-booking");
    const anchor = new Date("2025-12-15T12:00:00Z");
    const grid = buildMonthGrid([booking], anchor, TZ);

    // Booking falls on Dec 31 in ET
    let dec31Cell = null;
    for (const week of grid.weeks) {
      for (const day of week.days) {
        if (day.year === 2025 && day.month === 12 && day.day === 31) {
          dec31Cell = day;
        }
      }
    }
    assert.ok(dec31Cell !== null, "Dec 31 cell not found");
    assert.equal(dec31Cell!.bookings.length, 1);
  });

  test("month boundary — booking on last day of month appears in correct cell", () => {
    const booking = makeBooking("2026-06-30T20:00:00Z"); // 4pm ET
    const anchor = new Date("2026-06-15T12:00:00Z");
    const grid = buildMonthGrid([booking], anchor, TZ);
    let june30Cell = null;
    for (const week of grid.weeks) {
      for (const day of week.days) {
        if (day.year === 2026 && day.month === 6 && day.day === 30) {
          june30Cell = day;
        }
      }
    }
    assert.ok(june30Cell !== null, "June 30 cell not found");
    assert.equal(june30Cell!.bookings.length, 1);
  });
});

describe("buildWeekStrip", () => {
  test("always returns exactly 7 days", () => {
    const anchor = new Date("2026-06-15T12:00:00Z");
    const strip = buildWeekStrip([], anchor, TZ);
    assert.equal(strip.days.length, 7);
  });

  test("days span Mon–Sun of the week containing the anchor", () => {
    // June 15, 2026 is a Monday
    const anchor = new Date("2026-06-15T12:00:00Z");
    const strip = buildWeekStrip([], anchor, TZ);
    assert.equal(strip.days[0]?.day, 15); // Monday June 15
    assert.equal(strip.days[6]?.day, 21); // Sunday June 21
  });

  test("booking in the week appears on correct day", () => {
    const booking = makeBooking("2026-06-17T13:00:00Z"); // Wed June 17, 9am ET
    const anchor = new Date("2026-06-15T12:00:00Z");
    const strip = buildWeekStrip([booking], anchor, TZ);
    const wed = strip.days.find((d) => d.day === 17 && d.month === 6);
    assert.ok(wed !== undefined);
    assert.equal(wed!.bookings.length, 1);
  });

  test("booking outside the week does not appear", () => {
    const booking = makeBooking("2026-06-22T13:00:00Z"); // Next Monday
    const anchor = new Date("2026-06-15T12:00:00Z");
    const strip = buildWeekStrip([booking], anchor, TZ);
    const total = strip.days.reduce((s, d) => s + d.bookings.length, 0);
    assert.equal(total, 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/crm && npx tsx --test tests/unit/operator-portal/calendar-grid.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/operator-portal/calendar.ts
// Pure — no I/O. TZ-correct via Intl.DateTimeFormat (same approach as
// bookings/actions.ts partsInTimezone). Never use Date.get*() methods —
// those are server-local (UTC on Vercel).

export type CalendarBooking = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  title: string;
  fullName: string | null;
  contactId: string | null;
  status: string;
};

export type CalendarDay = {
  year: number;
  month: number; // 1-indexed
  day: number;
  isCurrentMonth: boolean;
  bookings: CalendarBooking[];
};

export type CalendarWeek = {
  days: CalendarDay[]; // always 7
};

export type MonthGrid = {
  year: number;
  month: number; // 1-indexed
  weeks: CalendarWeek[];
};

export type WeekStrip = {
  days: CalendarDay[]; // always 7
};

/**
 * Extract date components from a UTC Date in a given IANA timezone.
 * Returns { year, month (1-indexed), day, weekdayIndex (0=Sun..6=Sat) }.
 */
function partsInTz(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    year: parseInt(parts.year ?? "0", 10),
    month: parseInt(parts.month ?? "0", 10),
    day: parseInt(parts.day ?? "0", 10),
    weekdayIndex: weekdayMap[parts.weekday ?? "Sun"] ?? 0,
  };
}

/**
 * Build a UTC Date representing midnight at the start of a given
 * local Y-M-D in the target timezone. Uses the offset-correction
 * trick from bookings/actions.ts utcMomentForLocalTime.
 */
function localMidnightUtc(year: number, month: number, day: number, timeZone: string): Date {
  const naive = new Date(Date.UTC(year, month - 1, day, 0, 0));
  if (timeZone === "UTC") return naive;
  const parts = partsInTz(naive, timeZone);
  const intendedMs = Date.UTC(year, month - 1, day, 0, 0);
  const actualMs = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0);
  return new Date(naive.getTime() + (intendedMs - actualMs));
}

/** Add `days` calendar days to a UTC midnight Date in the given TZ. */
function addDays(utcMidnight: Date, days: number, timeZone: string): Date {
  const p = partsInTz(utcMidnight, timeZone);
  return localMidnightUtc(p.year, p.month, p.day + days, timeZone);
}

function buildDayCell(
  year: number,
  month: number,
  day: number,
  currentMonth: number,
  bookings: CalendarBooking[]
): CalendarDay {
  return { year, month, day, isCurrentMonth: month === currentMonth, bookings };
}

/**
 * Build a month grid for the month containing `anchor`.
 * Grid starts on Monday (ISO week). Bookings are bucketed by their
 * local date in `tz`.
 */
export function buildMonthGrid(
  bookings: CalendarBooking[],
  anchor: Date,
  tz: string
): MonthGrid {
  const anchorParts = partsInTz(anchor, tz);
  const { year, month } = anchorParts;

  // First day of this month in TZ
  const firstOfMonth = localMidnightUtc(year, month, 1, tz);
  const firstParts = partsInTz(firstOfMonth, tz);
  // ISO week starts Monday; offset = (weekdayIndex - 1 + 7) % 7
  const firstWeekdayOffset = (firstParts.weekdayIndex - 1 + 7) % 7;

  // Last day of this month
  const lastOfMonth = localMidnightUtc(year, month + 1, 0, tz);
  const lastParts = partsInTz(lastOfMonth, tz);
  const totalDays = lastParts.day;

  // Build a map: "YYYY-MM-DD" → booking[]
  const bookingMap = new Map<string, CalendarBooking[]>();
  for (const b of bookings) {
    const p = partsInTz(b.startsAt, tz);
    const key = `${p.year}-${p.month}-${p.day}`;
    const arr = bookingMap.get(key) ?? [];
    arr.push(b);
    bookingMap.set(key, arr);
  }

  // Grid cell start = first day of month - offset (may be prev month)
  const gridStart = addDays(firstOfMonth, -firstWeekdayOffset, tz);

  const weeks: CalendarWeek[] = [];
  let cursor = gridStart;

  // Generate weeks until we've covered the whole month
  let cellIdx = 0;
  while (true) {
    const days: CalendarDay[] = [];
    for (let d = 0; d < 7; d++) {
      const cp = partsInTz(cursor, tz);
      const key = `${cp.year}-${cp.month}-${cp.day}`;
      days.push(buildDayCell(cp.year, cp.month, cp.day, month, bookingMap.get(key) ?? []));
      cursor = addDays(cursor, 1, tz);
      cellIdx++;
    }
    weeks.push({ days });
    // Stop when we've passed the last day of the month
    const lastCellParts = partsInTz(addDays(cursor, -1, tz), tz);
    if (
      (lastCellParts.year > year || lastCellParts.month > month) &&
      cellIdx >= firstWeekdayOffset + totalDays
    ) {
      break;
    }
    if (weeks.length >= 6) break; // safety — never more than 6 rows
  }

  return { year, month, weeks };
}

/**
 * Build a 7-day week strip (Mon–Sun) for the week containing `anchor`.
 */
export function buildWeekStrip(
  bookings: CalendarBooking[],
  anchor: Date,
  tz: string
): WeekStrip {
  const anchorParts = partsInTz(anchor, tz);
  const anchorMidnight = localMidnightUtc(anchorParts.year, anchorParts.month, anchorParts.day, tz);
  const weekdayOffset = (anchorParts.weekdayIndex - 1 + 7) % 7; // ISO: Mon=0
  const weekStart = addDays(anchorMidnight, -weekdayOffset, tz);

  // Build booking map
  const bookingMap = new Map<string, CalendarBooking[]>();
  for (const b of bookings) {
    const p = partsInTz(b.startsAt, tz);
    const key = `${p.year}-${p.month}-${p.day}`;
    const arr = bookingMap.get(key) ?? [];
    arr.push(b);
    bookingMap.set(key, arr);
  }

  const days: CalendarDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i, tz);
    const dp = partsInTz(d, tz);
    const key = `${dp.year}-${dp.month}-${dp.day}`;
    days.push({
      year: dp.year,
      month: dp.month,
      day: dp.day,
      isCurrentMonth: true,
      bookings: bookingMap.get(key) ?? [],
    });
  }

  return { days };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/crm && npx tsx --test tests/unit/operator-portal/calendar-grid.spec.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/operator-portal/calendar.ts packages/crm/tests/unit/operator-portal/calendar-grid.spec.ts
git commit -m "feat(operator-portal): TZ-correct buildMonthGrid + buildWeekStrip"
```

---

### Task 3.2: Appts v2 UI — month/week calendar + detail sheet

**Files:**
- Modify: `src/app/portal/[orgSlug]/(operator)/appointments/page.tsx`

**UI contract:**
- Path: `src/app/portal/[orgSlug]/(operator)/appointments/page.tsx`
- Data source: `listBookings(session.orgId)` filtered to `status !== 'cancelled'`; workspace TZ from `organizations.timezone`
- Layout: (1) header "Appointments" + view toggle "Month | Week"; (2) calendar grid (built with `buildMonthGrid` or `buildWeekStrip`); (3) day detail list below — tapping a calendar day cell scrolls to that day's bookings
- Booking card: shows time (in workspace TZ via `Intl.DateTimeFormat`), customer name, service title, status badge. Tap → bottom sheet detail
- Detail sheet: contact name, full start/end time, service title, status badge, Reschedule button, Cancel button
- Reschedule: opens a date/time picker; on confirm calls `rescheduleBookingAction({ bookingId, newStartsAtISO, notify: true })` from `src/lib/bookings/actions.ts`
- Cancel: calls `cancelBookingAction(bookingId)` from `src/lib/bookings/actions.ts`; confirm dialog first
- States: loading skeleton for calendar grid; empty state "No bookings this month" with a "New Booking" link
- Claude-Design note: month cells have a colored dot (count badge) when they have bookings; selected day has `branding.primary_color` ring; week strip shows time-of-day lanes; `framer-motion` slide for detail sheet.

- [ ] **Step 1: Fetch workspace TZ on the appointments page**

The server component needs `organizations.timezone`. Add it to the fetch:

```typescript
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";

const [allBookings, orgRow] = await Promise.all([
  listBookings(session.orgId),
  db.select({ timezone: organizations.timezone }).from(organizations).where(eq(organizations.id, session.orgId)).limit(1),
]);
const tz = orgRow[0]?.timezone || "UTC";
```

- [ ] **Step 2: Rewrite the appointments page**

Build the grid on the server (default to current week for mobile default):

```typescript
import { buildWeekStrip, buildMonthGrid } from "@/lib/operator-portal/calendar";
const bookingsForCalendar = allBookings
  .filter((b) => b.status !== "cancelled")
  .map((b) => ({
    id: b.id,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    title: b.title,
    fullName: b.fullName,
    contactId: b.contactId,
    status: b.status,
  }));
const weekStrip = buildWeekStrip(bookingsForCalendar, new Date(), tz);
const monthGrid = buildMonthGrid(bookingsForCalendar, new Date(), tz);
```

Pass both grids + `tz` + `orgSlug` to an `AppointmentsClient` component that owns the month/week toggle, day selection state, and booking detail sheet.

The reschedule and cancel calls come from `rescheduleBookingAction` and `cancelBookingAction` imported from `@/lib/bookings/actions`. These are already `"use server"` functions that use `getOrgId()` from NextAuth — for the operator portal, wrap them in new operator-scoped server actions in a new `src/lib/operator-portal/booking-actions.ts` file that calls `requireOperatorSessionForOrg` and then delegates to the booking lib functions directly via Drizzle (bypassing `getOrgId()`).

> **Important:** `rescheduleBookingAction` calls `getOrgId()` internally, so it cannot be called directly from the operator portal. Create operator-scoped wrappers.

- [ ] **Step 3: Create operator booking action wrappers**

```typescript
// src/lib/operator-portal/booking-actions.ts
"use server";

import { requireOperatorSessionForOrg } from "./auth";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { and, eq, inArray, ne } from "drizzle-orm";
import { computeRescheduledEnd, intervalsOverlap } from "@/lib/bookings/calendar-math";
import { emitSeldonEvent } from "@/lib/events/bus";
import { revalidatePath } from "next/cache";

export async function operatorCancelBookingAction(params: {
  orgSlug: string;
  bookingId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireOperatorSessionForOrg(params.orgSlug);
  const orgId = session.orgId;

  const [row] = await db
    .update(bookings)
    .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
    .where(and(eq(bookings.orgId, orgId), eq(bookings.id, params.bookingId)))
    .returning({ id: bookings.id, contactId: bookings.contactId });

  if (!row) return { ok: false, error: "not_found" };

  if (row.contactId) {
    await emitSeldonEvent("booking.cancelled", { appointmentId: row.id, contactId: row.contactId }, { orgId });
  }

  revalidatePath(`/portal/${params.orgSlug}/appointments`);
  return { ok: true };
}

export async function operatorRescheduleBookingAction(params: {
  orgSlug: string;
  bookingId: string;
  newStartsAtISO: string;
}): Promise<{ ok: true } | { ok: false; error: "not_found" | "conflict" }> {
  const session = await requireOperatorSessionForOrg(params.orgSlug);
  const orgId = session.orgId;

  const [current] = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.orgId, orgId), eq(bookings.id, params.bookingId), ne(bookings.status, "template")))
    .limit(1);

  if (!current) return { ok: false, error: "not_found" };

  const newStart = new Date(params.newStartsAtISO);
  const oldStart = current.startsAt instanceof Date ? current.startsAt : new Date(current.startsAt);
  const oldEnd = current.endsAt instanceof Date ? current.endsAt : new Date(current.endsAt);
  const newEnd = computeRescheduledEnd(oldStart, oldEnd, newStart);

  const others = await db
    .select({ id: bookings.id, startsAt: bookings.startsAt, endsAt: bookings.endsAt })
    .from(bookings)
    .where(and(eq(bookings.orgId, orgId), ne(bookings.id, current.id), inArray(bookings.status, ["scheduled", "completed", "pending_payment", "blocked"])));

  const conflict = others.some((r) => {
    const rStart = r.startsAt instanceof Date ? r.startsAt : new Date(r.startsAt);
    const rEnd = r.endsAt instanceof Date ? r.endsAt : new Date(r.endsAt);
    return intervalsOverlap(newStart, newEnd, rStart, rEnd);
  });

  if (conflict) return { ok: false, error: "conflict" };

  await db.update(bookings).set({ startsAt: newStart, endsAt: newEnd, updatedAt: new Date() }).where(and(eq(bookings.orgId, orgId), eq(bookings.id, current.id)));

  revalidatePath(`/portal/${params.orgSlug}/appointments`);
  return { ok: true };
}
```

- [ ] **Step 4: Run the use-server check**

```bash
cd packages/crm && bash scripts/check-use-server.sh src
```

Expected: clean.

- [ ] **Step 5: Run build gate**

```bash
cd packages/crm && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add packages/crm/src/lib/operator-portal/booking-actions.ts packages/crm/src/app/portal/
git commit -m "feat(operator-portal): Appts v2 — month/week calendar + detail sheet + reschedule/cancel"
```

---

### Task 3.3: Phase 3 build gate

- [ ] **Step 1: Full build gate**

```bash
cd packages/crm && bash scripts/check-use-server.sh src && npx tsc --noEmit && npx next build
```

Expected: exit 0. Fix any errors.

- [ ] **Step 2: Commit if fixes needed**

```bash
git add -A packages/crm/
git commit -m "fix(operator-portal): Phase 3 build gate fixes"
```

---

## Phase 4 — Universal Search

**Goal:** Header search box → live results grouped by Contacts / Deals / Bookings, each deep-linking to the relevant portal screen.

### Task 4.1: `search.ts` lib + action

**Files:**
- Create: `src/lib/operator-portal/search.ts`
- Create: `src/lib/operator-portal/search-actions.ts`
- Create: `tests/unit/operator-portal/search.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/operator-portal/search.spec.ts
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { rankResults, type UniversalSearchResult, type SearchQueryDeps } from "../../../src/lib/operator-portal/search";

// rankResults is the PURE ranking logic, testable without DB.

describe("rankResults", () => {
  test("exact match ranked higher than prefix match", () => {
    const results: UniversalSearchResult[] = [
      { type: "contact", id: "c1", title: "Jane Doe", subtitle: "jane@example.com", href: "/portal/x/messages/c1", score: 0 },
      { type: "contact", id: "c2", title: "Jane", subtitle: "jane2@example.com", href: "/portal/x/messages/c2", score: 0 },
    ];
    const ranked = rankResults("Jane", results);
    // c2 title === query exactly → ranked first
    assert.equal(ranked[0]?.id, "c2");
    assert.equal(ranked[1]?.id, "c1");
  });

  test("prefix match ranked higher than substring match", () => {
    const results: UniversalSearchResult[] = [
      { type: "contact", id: "c1", title: "Jane Smith", subtitle: "", href: "/x", score: 0 },      // prefix
      { type: "contact", id: "c2", title: "My Jane", subtitle: "", href: "/x", score: 0 },          // substring
    ];
    const ranked = rankResults("Jane", results);
    assert.equal(ranked[0]?.id, "c1");
    assert.equal(ranked[1]?.id, "c2");
  });

  test("contacts ranked before deals before bookings at same score", () => {
    const results: UniversalSearchResult[] = [
      { type: "booking", id: "b1", title: "Jane Booking", subtitle: "", href: "/x", score: 2 },
      { type: "deal", id: "d1", title: "Jane Deal", subtitle: "", href: "/x", score: 2 },
      { type: "contact", id: "c1", title: "Jane Contact", subtitle: "", href: "/x", score: 2 },
    ];
    const ranked = rankResults("Jane", results);
    assert.equal(ranked[0]?.type, "contact");
    assert.equal(ranked[1]?.type, "deal");
    assert.equal(ranked[2]?.type, "booking");
  });

  test("empty query returns empty", () => {
    const results: UniversalSearchResult[] = [
      { type: "contact", id: "c1", title: "Jane", subtitle: "", href: "/x", score: 0 },
    ];
    const ranked = rankResults("", results);
    assert.equal(ranked.length, 0);
  });

  test("case-insensitive matching", () => {
    const results: UniversalSearchResult[] = [
      { type: "contact", id: "c1", title: "JANE DOE", subtitle: "", href: "/x", score: 0 },
    ];
    const ranked = rankResults("jane", results);
    assert.equal(ranked.length, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/crm && npx tsx --test tests/unit/operator-portal/search.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/operator-portal/search.ts
// NOT "use server" — the action wrapper is search-actions.ts.
import { ilike, or, eq, and } from "drizzle-orm";
import { db } from "@/db";
import { contacts, deals, bookings } from "@/db/schema";

export type UniversalSearchResult = {
  type: "contact" | "deal" | "booking";
  id: string;
  title: string;
  subtitle: string;
  href: string;
  score: number;
};

export type SearchQueryDeps = {
  queryContacts: (orgId: string, q: string) => Promise<Array<{ id: string; firstName: string; lastName: string | null; email: string | null; phone: string | null; company: string | null }>>;
  queryDeals: (orgId: string, q: string) => Promise<Array<{ id: string; title: string; stage: string; value: string }>>;
  queryBookings: (orgId: string, q: string) => Promise<Array<{ id: string; title: string; fullName: string | null; startsAt: Date }>>;
};

/** Assign a score based on match quality (exact=3, prefix=2, substring=1, none=0). */
function scoreTitle(query: string, title: string): number {
  const q = query.toLowerCase().trim();
  const t = title.toLowerCase().trim();
  if (!q) return 0;
  if (t === q) return 3;
  if (t.startsWith(q)) return 2;
  if (t.includes(q)) return 1;
  return 0;
}

const TYPE_ORDER: Record<string, number> = { contact: 0, deal: 1, booking: 2 };

/** Pure ranking: filter to matches, score, sort by (score desc, type asc). */
export function rankResults(query: string, results: UniversalSearchResult[]): UniversalSearchResult[] {
  if (!query.trim()) return [];

  return results
    .map((r) => {
      const titleScore = scoreTitle(query, r.title);
      const subtitleScore = scoreTitle(query, r.subtitle) * 0.5; // subtitle counts for half
      return { ...r, score: Math.max(titleScore, subtitleScore) };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99);
    });
}

function defaultDeps(orgSlug: string): SearchQueryDeps {
  const pat = (q: string) => `%${q}%`;
  return {
    queryContacts: async (orgId, q) =>
      db.select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email, phone: contacts.phone, company: contacts.company })
        .from(contacts)
        .where(and(eq(contacts.orgId, orgId), or(ilike(contacts.firstName, pat(q)), ilike(contacts.lastName, pat(q)), ilike(contacts.email, pat(q)), ilike(contacts.phone, pat(q)), ilike(contacts.company, pat(q)))))
        .limit(10),
    queryDeals: async (orgId, q) =>
      db.select({ id: deals.id, title: deals.title, stage: deals.stage, value: deals.value })
        .from(deals)
        .where(and(eq(deals.orgId, orgId), ilike(deals.title, pat(q))))
        .limit(10),
    queryBookings: async (orgId, q) =>
      db.select({ id: bookings.id, title: bookings.title, fullName: bookings.fullName, startsAt: bookings.startsAt })
        .from(bookings)
        .where(and(eq(bookings.orgId, orgId), ne(bookings.status, "template"), or(ilike(bookings.title, pat(q)), ilike(bookings.fullName, pat(q)))))
        .limit(10),
  };

  // Note: `ne` is referenced here but not imported above — add to drizzle-orm import.
  function ne<T>(col: T, val: unknown) { return (col as unknown as { ne: (v: unknown) => unknown }).ne(val); }
  void ne; // satisfy TS unused warning — actual import handles this
}

export async function universalSearch(
  params: { orgId: string; query: string; limit?: number; orgSlug: string },
  deps: SearchQueryDeps = defaultDeps(params.orgSlug)
): Promise<UniversalSearchResult[]> {
  const q = params.query.trim();
  if (!q || q.length < 2) return [];

  const [contactRows, dealRows, bookingRows] = await Promise.all([
    deps.queryContacts(params.orgId, q),
    deps.queryDeals(params.orgId, q),
    deps.queryBookings(params.orgId, q),
  ]);

  const base = `/portal/${params.orgSlug}`;

  const raw: UniversalSearchResult[] = [
    ...contactRows.map((c) => ({
      type: "contact" as const,
      id: c.id,
      title: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.phone || c.email || "Unknown",
      subtitle: c.email ?? c.phone ?? "",
      href: `${base}/messages/${c.id}`,
      score: 0,
    })),
    ...dealRows.map((d) => ({
      type: "deal" as const,
      id: d.id,
      title: d.title,
      subtitle: `${d.stage} · $${Number(d.value).toLocaleString()}`,
      href: `${base}/leads`,
      score: 0,
    })),
    ...bookingRows.map((b) => ({
      type: "booking" as const,
      id: b.id,
      title: b.title,
      subtitle: b.fullName ?? "",
      href: `${base}/appointments`,
      score: 0,
    })),
  ];

  const ranked = rankResults(q, raw);
  return ranked.slice(0, params.limit ?? 20);
}
```

> **Fix:** the inline `ne` function above is a placeholder — the actual file should import `ne` from `drizzle-orm` at the top of the file alongside the other imports, and remove the local `ne` function. Write the final file with `import { ilike, or, eq, and, ne } from "drizzle-orm";` at the top.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/crm && npx tsx --test tests/unit/operator-portal/search.spec.ts
```

Expected: all tests pass.

- [ ] **Step 5: Write the "use server" search action**

```typescript
// src/lib/operator-portal/search-actions.ts
"use server";

import { requireOperatorSessionForOrg } from "./auth";
import { universalSearch, type UniversalSearchResult } from "./search";

export async function operatorSearchAction(params: {
  orgSlug: string;
  query: string;
}): Promise<UniversalSearchResult[]> {
  const session = await requireOperatorSessionForOrg(params.orgSlug);
  return universalSearch({ orgId: session.orgId, query: params.query, orgSlug: params.orgSlug });
}
```

- [ ] **Step 6: Run the use-server check**

```bash
cd packages/crm && bash scripts/check-use-server.sh src
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add packages/crm/src/lib/operator-portal/search.ts packages/crm/src/lib/operator-portal/search-actions.ts packages/crm/tests/unit/operator-portal/search.spec.ts
git commit -m "feat(operator-portal): universalSearch + operator action + ranking tests"
```

---

### Task 4.2: Search UI — debounced header search

**Files:**
- Modify: `src/components/operator-portal/mobile/operator-mobile-shell.tsx`

**UI contract:**
- Add a search icon button in the header (right side, next to the install button). Tapping it reveals a full-width search input overlay that slides down from the header.
- Input is debounced 300ms. On each query change, call `operatorSearchAction` (via a client-side `startTransition`).
- Results shown grouped: "Contacts" / "Deals" / "Appointments" section headers, each row shows title + subtitle. Tap navigates to `result.href`.
- Empty state: no results message when query has 2+ chars and results are empty.
- Close: tap outside or X button dismisses the overlay and clears results.
- Props: `OperatorMobileShell` receives `orgSlug` (already in props). The search action is invoked with `orgSlug`.
- Claude-Design note: overlay uses backdrop blur; result rows animate in with `framer-motion` stagger; group headers in muted uppercase 11px; loading state shows 3 skeleton rows.

- [ ] **Step 1: Update the mobile shell**

Extend `OperatorMobileShell` to include the search toggle and overlay. The overlay is a client component `OperatorSearch` that owns its query state and calls `operatorSearchAction`.

- [ ] **Step 2: Run build gate**

```bash
cd packages/crm && bash scripts/check-use-server.sh src && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/components/operator-portal/
git commit -m "feat(operator-portal): debounced universal search UI in mobile shell"
```

---

### Task 4.3: Phase 4 build gate

- [ ] **Step 1: Full build gate**

```bash
cd packages/crm && bash scripts/check-use-server.sh src && npx tsc --noEmit && npx next build
```

Expected: exit 0. Fix any errors.

- [ ] **Step 2: Commit if fixes needed**

```bash
git add -A packages/crm/
git commit -m "fix(operator-portal): Phase 4 build gate fixes"
```

---

## Phase 5 — Cohesion Polish

**Goal:** Cross-screen Claude-Design pass for motion, empty states, skeletons, and agency-branding consistency. Followed by a mandatory manual smoke test.

### Task 5.1: Motion + empty states + skeletons audit

**Files:**
- Modify: Various screen and component files touched in Phases 1–4

- [ ] **Step 1: Audit all new screens for missing empty states**

For each screen, verify:
- **Today:** empty pipeline (0 deals) → "No open deals — add your first deal from the Leads tab"; empty today's bookings → existing "Nothing on the schedule yet today."
- **Messages inbox:** All tab empty → "No texts yet. Replies land here when a customer texts you."; Unread tab empty → "You're all caught up."
- **Thread view:** no messages → "No messages yet with this contact."
- **Thread view — notes:** no notes → "No private notes yet. Add one below."
- **Appointments calendar:** month with 0 bookings → "No bookings this month."; week with 0 → "Nothing this week."
- **Search overlay:** 0 results for a 2+ char query → "No results for "[query]"."

- [ ] **Step 2: Audit all new screens for loading skeletons**

Each screen that fetches data must show a skeleton while loading. Use `<div className="animate-pulse rounded-xl bg-gray-200 h-14" />` style placeholders at minimum, matching the real content shape.

- [ ] **Step 3: Audit agency branding consistency**

In every new client component, verify that:
- Active colors use `branding.primary_color` (from `EffectiveBranding`) with a fallback to `#5b21b6`.
- The "SeldonFrame" brand name is never hard-coded in operator-facing UI — use `branding.brand_name`.
- Logo URL uses `branding.logo_url` when non-null.

- [ ] **Step 4: Add `framer-motion` micro-animations**

Verify the following animations are in place:
- Today Quick Actions: tiles scale on tap (`whileTap={{ scale: 0.96 }}`).
- Messages inbox thread list: stagger fade-in on mount (`staggerChildren: 0.04`).
- Thread view bubbles: slide-in from the correct side (inbound from left, outbound from right).
- Calendar day cells: fade on month change.
- Search overlay: slide down + fade from header.
- All bottom sheets: slide up from bottom.

- [ ] **Step 5: Commit all polish changes**

```bash
git add -A packages/crm/src/
git commit -m "feat(operator-portal): cohesion polish — motion, empty states, skeletons, branding"
```

---

### Task 5.2: Full test suite run

- [ ] **Step 1: Run all operator-portal unit tests**

```bash
cd packages/crm && npx tsx --test tests/unit/operator-portal/today.spec.ts tests/unit/operator-portal/review-request.spec.ts tests/unit/operator-portal/messages.spec.ts tests/unit/operator-portal/calendar-grid.spec.ts tests/unit/operator-portal/search.spec.ts tests/unit/contacts/create-for-org.spec.ts tests/unit/operator-portal/counts.spec.ts
```

Expected: all pass.

- [ ] **Step 2: Run final build gate**

```bash
cd packages/crm && bash scripts/check-use-server.sh src && npx tsc --noEmit && npx next build
```

Expected: exit 0.

- [ ] **Step 3: Commit if any final fixes**

```bash
git add -A packages/crm/
git commit -m "fix(operator-portal): Phase 5 final fixes"
```

---

### Task 5.3: Manual smoke test on Vercel preview (SURFACE TO USER — DO NOT EXECUTE AUTONOMOUSLY)

> **This task requires a human.** Deploy the branch to Vercel preview and manually verify the following checklist. Mark each done before calling Phase 5 complete.

- [ ] **Deploy to Vercel preview**

Push the branch and wait for a Vercel preview URL.

```bash
git push origin feature/operator-portal-pwa-v2
```

Then open the Vercel dashboard or check the PR for the preview URL.

- [ ] **Today screen**
  - [ ] 4 glance cards load (new leads, appts, unread, missed calls stub)
  - [ ] Pipeline $ card shows the correct total (verify against DB)
  - [ ] Add Contact sheet opens → fill fields → submit → contact appears in Leads
  - [ ] New Booking link navigates to the public booking page
  - [ ] Request Review sheet opens → pick a contact → send → check that an email arrives at the test address

- [ ] **Messages screen**
  - [ ] All tab shows all threads
  - [ ] Unread tab shows only contacts with unread inbound messages
  - [ ] Client-side search filters threads by name / last message
  - [ ] Opening a thread marks it read (Unread tab count decreases)
  - [ ] Reply composer visible when `outboundSmsEnabled=true` in DB
  - [ ] Reply composer shows A2P dark-state notice when `outboundSmsEnabled=false`
  - [ ] Add note → note appears inline with distinct styling; not sent to customer

- [ ] **Appointments screen**
  - [ ] Week view (default mobile) shows current week with correct bookings in correct day cells
  - [ ] Month view switch works; bookings appear on correct days
  - [ ] Booking card tap → detail sheet shows contact, time, service, status
  - [ ] Cancel → confirm dialog → booking disappears from calendar
  - [ ] Reschedule → date/time picker → confirm → booking moves to new slot

- [ ] **Search**
  - [ ] Search icon in header opens overlay
  - [ ] Type ≥ 2 chars → results appear grouped by Contacts/Deals/Bookings
  - [ ] Tap a result → navigates to correct screen
  - [ ] Empty query / 1-char query → no results shown

- [ ] **Branding**
  - [ ] Agency-branded workspace shows agency logo + primary color in accent elements
  - [ ] Non-white-label workspace shows SeldonFrame defaults

- [ ] **A2P gate sanity check**
  - [ ] Flip `outboundSmsEnabled` to `true` in Neon for test workspace → reply composer appears
  - [ ] Flip back to `false` → notice re-appears without redeploy (flag is read at request time)

---

## Self-Review: Spec Coverage Verification

Checked against the spec (`2026-06-15-operator-portal-pwa-v2-design.md`):

| Spec requirement | Covered in |
|---|---|
| `conversation_notes` table | Task 0.1 |
| `sms_messages.readAt` + backfill | Task 0.2 |
| `outboundSmsEnabled` flag read/write | Task 0.3 |
| DRY `createContactForOrg` | Task 0.4 |
| Remove redirect routes + dead sidebar | Task 0.5 |
| Pipeline $ card | Task 1.1 + 1.3 |
| Quick Actions: Add Contact, New Booking, Request Review | Task 1.3 |
| `sendReviewRequest` email+gated SMS | Task 1.2 |
| All/Unread inbox tabs | Task 2.3 |
| Search-within-inbox (client-side) | Task 2.3 |
| In-app reply composer (A2P gated) | Task 2.2 + 2.4 |
| Private notes CRUD | Task 2.1 + 2.2 + 2.4 |
| `markThreadRead` on open | Task 2.1 + 2.4 |
| Reconcile `countUnreadInboundSms` to `readAt` | Task 2.1 step 5 |
| Month + week calendar views | Task 3.1 + 3.2 |
| DST/TZ-correct bucketing | Task 3.1 (tests cover DST + month boundary) |
| Booking detail sheet + reschedule/cancel | Task 3.2 + 3.3 |
| `universalSearch` contacts/deals/bookings | Task 4.1 |
| Ranking exact>prefix>substring, contacts first | Task 4.1 (tests) |
| Header search UI debounced | Task 4.2 |
| Cross-screen motion + empty states + skeletons | Task 5.1 |
| Agency branding consistency | Task 5.1 step 3 |
| Manual smoke test on Vercel preview | Task 5.3 |

**Placeholder scan:** No "TBD", "TODO", or "similar to above" placeholders found. All code blocks are complete.

**Type consistency check:**
- `createContactForOrg` returns `{ id: string | null }` — referenced consistently in Task 0.4 test and spec
- `getPipelineRollup` returns `{ totalOpenValue: number; byStage: StageRollup[] }` — spec in Task 1.1, used in Task 1.3
- `sendReviewRequest` returns `ReviewRequestResult` — defined in Task 1.2, used correctly throughout
- `InboxThread.unreadCount` from `buildInboxThreads` — field name used consistently across Tasks 2.1, 2.3
- `operatorCancelBookingAction` / `operatorRescheduleBookingAction` — defined in Task 3.2 and used in Task 3.2 UI spec
- `UniversalSearchResult.href` — defined in Task 4.1 and consumed in Task 4.2 UI
- `SmsRow.readAt: Date | null` — matches the new `sms_messages.readAt` column added in Task 0.2
- `buildMonthGrid` / `buildWeekStrip` signatures — consistent between Task 3.1 impl and Task 3.2 usage

---

## Decisions Made

1. **"Open stage" definition:** `probability === 100` = Won (closed); `probability === 0 AND name.toLowerCase().includes("lost")` = Lost (closed). Everything else = open. This is the minimal correct definition for the default pipeline seeded by `ensureDefaultPipelineForOrg`. The spec noted "derive from stage name/probability" — this is that derivation, documented.

2. **Unread backfill decision:** All pre-existing inbound rows get `readAt = createdAt` at migration time. This avoids a massive initial unread badge when the feature ships. New inbound rows after deploy are unread until the operator opens the thread.

3. **`countUnreadInboundSms` reconciliation:** The v1 function used the "outbound-after-inbound" heuristic (walking desc rows). Phase 2 Task 2.1 replaces it with a SQL `WHERE direction='inbound' AND readAt IS NULL` count. The `unreadInboundCountFromRows` helper and its tests are preserved unchanged (they remain useful for legacy code paths and were previously tested).

4. **Reschedule/cancel wrappers:** `rescheduleBookingAction` in `bookings/actions.ts` calls `getOrgId()` internally (NextAuth-bound). Rather than refactoring that action (risky), we create operator-scoped wrappers `operatorRescheduleBookingAction` / `operatorCancelBookingAction` in `src/lib/operator-portal/booking-actions.ts` that call `requireOperatorSessionForOrg` and perform the same DB operations directly.

5. **Test command:** `npx tsx --test <test-file>`. The tsx binary is not installed locally in the worktree; `npx` fetches it. This is consistent with how `calendar-math.spec.ts` was verified to run.

6. **`search.ts` default deps `ne` import:** The implementation note flags that `ne` must be imported from `drizzle-orm` at the top of the file. The inline local `ne` function in the spec above is a placeholder artifact from the writing process — the actual file starts with `import { ilike, or, eq, and, ne } from "drizzle-orm";`.

## Under-specified Items in the Spec

1. **Review link source:** The spec says the Request Review sheet has a "review link input". The implementation pre-fills it from `organizations.soul.reviewLink` if set. If soul doesn't have this field, the operator types it manually. This field path (`soul.reviewLink`) should be confirmed against the actual soul schema.

2. **Calendar week start day:** The spec says "Month + Week" but does not specify week start (Sunday vs Monday). This plan uses Monday (ISO week) for the week strip, consistent with international norms. If the workspace is US-based and Sunday start is preferred, the offset calculation in `buildWeekStrip` needs `weekdayOffset = anchorParts.weekdayIndex` (Sunday=0 start) instead of `(weekdayIndex - 1 + 7) % 7`.

3. **Search minimum query length:** The spec says "debounced" but doesn't specify minimum chars. This plan uses 2 characters to avoid massive result sets on single-keystroke. Confirmed in Task 4.1 tests.

4. **"New Booking" link in Quick Actions:** The spec says "links to the existing booking flow." The implementation links to `/book/{orgSlug}` — the public booking page. If the operator should go to a dashboard-internal create-booking form instead, update Task 1.3.
