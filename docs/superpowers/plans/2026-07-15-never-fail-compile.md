# Never-Fail Record Compile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every recorded workflow compiles to a deployable agent whose red/yellow steps become live drafts filed via a new `draft_for_approval` native tool into a new `/approvals` inbox, with an honest autonomy score on the recap and template.

**Architecture:** New org-scoped `agent_action_drafts` table (CAS resolution + pending-only unique partial index for idempotent filing) → new opt-in native tool (copilot-pattern append in `getToolsForCapabilities`, NEVER in `ALL_TOOLS`) → pure compile-time rendering changes in `lib/recordings/compile-agent.ts` behind `SF_DRAFT_APPROVALS` (flag-off output byte-identical) → `(dashboard)/approvals` page + nav entry + recap autonomy line.

**Tech Stack:** Next.js 16 App Router, Drizzle/Postgres, Zod, node:test via `node scripts/run-unit-tests.js`, hand-written SQL migrations.

**Spec:** `docs/superpowers/specs/2026-07-15-never-fail-compile-design.md` (read it first; it carries the ground-truth file refs and the two Max amendments: idempotency + cap).

## Global Constraints

- Flag: `SF_DRAFT_APPROVALS === "1"` strict (policy-fn pattern of `isRecordToAgentOn`, `lib/recordings/policy.ts:5-9`). Flag off ⇒ compile output BYTE-IDENTICAL to today (regression-tested).
- `draft_for_approval` NEVER enters `ALL_TOOLS` (tools.ts:1851) — empty-capabilities agents get the full list, so membership would leak it everywhere. Opt-in append only (copilot pattern, tools.ts:1980-1984). Spread into a NEW array.
- Migrations are HAND-WRITTEN, additive-only, idempotent (`CREATE ... IF NOT EXISTS`), never `drizzle-kit generate` (house rule in `0071_eval_run_jobs.sql` header). Next number: `0072`; journal appends `idx: 49`.
- Every query on the new table filters by `org_id` (security invariant #1).
- CAS resolution: `UPDATE ... WHERE id=$id AND org_id=$org AND status='pending' RETURNING *`; 0 rows → caller gets a conflict result, never a silent success.
- `MAX_DRAFTS_PER_CONVERSATION = 10`; at/over cap the tool returns `{ ok: false, error: ... }` — explicit honest failure (Optimistic Path rule).
- Tests: node:test specs under `packages/crm/tests/unit/<area>/*.spec.ts`; run `node scripts/run-unit-tests.js` from repo root (globs all unit specs). DB-bound failures are a known baseline — judge by DELTA vs a pre-change run (CRM harness memory).
- L-18: nothing imported by server routes may transitively import client-only React. New lib modules are pure `.ts`.
- L-19: no new emitted artifacts here, but keep new files LF (repo default handles it).
- Commit after every task (worktree `feat/never-fail-compile`, co-author trailer per repo convention).

## File Structure

```
packages/crm/src/db/schema/agent-action-drafts.ts        (new — table + types)
packages/crm/src/db/schema/index.ts                      (modify — add export)
packages/crm/drizzle/0072_agent_action_drafts.sql        (new — hand-written)
packages/crm/drizzle/meta/_journal.json                  (modify — append idx 49)
packages/crm/src/lib/agent-drafts/types.ts               (new — store contract + input/result types)
packages/crm/src/lib/agent-drafts/storage-memory.ts      (new — contract twin for tests)
packages/crm/src/lib/agent-drafts/storage-drizzle.ts     (new — prod store)
packages/crm/src/lib/agent-drafts/policy.ts              (new — isDraftApprovalsOn + cap constant)
packages/crm/src/lib/agents/tools.ts                     (modify — draftForApproval tool + opt-in append)
packages/crm/src/lib/agents/lifecycle/gate.ts            (modify — NON_ACTION_CAPABILITIES += draft_for_approval)
packages/crm/src/lib/recordings/compile-agent.ts         (modify — autonomy + draft sections + kind map)
packages/crm/src/lib/agent-templates/schema.ts           (modify — blueprint patch allows autonomy)
packages/crm/src/db/schema/agents.ts                     (modify — AgentBlueprint.autonomy?)
packages/crm/src/app/api/v1/recordings/compile-agent/route.ts (modify — thread flag + persist autonomy)
packages/crm/src/app/(dashboard)/approvals/page.tsx      (new — inbox)
packages/crm/src/app/(dashboard)/approvals/actions.ts    (new — "use server" approve/dismiss)
packages/crm/src/app/(dashboard)/approvals/draft-row.tsx (new — client row w/ copy button)
packages/crm/src/components/layout/nav-config.ts         (modify — flag-gated Approvals entry)
packages/crm/src/app/(public)/record/record-ui/recap-panel.tsx (modify — autonomy line)
packages/crm/src/app/(public)/record/record-ui/tiers.ts  (modify — flag-conditional red label)
tests: packages/crm/tests/unit/agent-drafts/*.spec.ts, additions to tests/unit/recordings/compile-agent.spec.ts + tests/unit/agents/* per task
```

---

### Task 1: Schema + migration 0072

**Files:**
- Create: `packages/crm/src/db/schema/agent-action-drafts.ts`
- Modify: `packages/crm/src/db/schema/index.ts` (append export line alongside `export * from "./workflow-approvals";`)
- Create: `packages/crm/drizzle/0072_agent_action_drafts.sql`
- Modify: `packages/crm/drizzle/meta/_journal.json` (append entry)

**Interfaces:**
- Produces: `agentActionDrafts` pgTable; types `AgentDraftStatus = "pending" | "approved" | "dismissed"`, `AgentDraftKind = "email" | "message" | "invoice" | "data_entry" | "other"`, `AgentDraftContent = { body: string; fields?: Record<string, string> }`.

- [ ] **Step 1: Write the schema file**

```ts
// packages/crm/src/db/schema/agent-action-drafts.ts
//
// agent_action_drafts — one row per draft_for_approval filing. The
// never-fail-compile slice (spec: docs/superpowers/specs/
// 2026-07-15-never-fail-compile-design.md): a compiled-from-recording agent
// PREPARES work it may not execute; a human approves from /approvals.
//
// Deliberately NOT workflow_approvals (G-10-9 precedent in that file's
// header): drafts have no run/step identity and their own lifecycle.
//
// Idempotency (Max amendment 2026-07-15): the pending-only unique partial
// index makes filing atomic per (org, conversation, step) — a model retry
// can never create a second pending draft for the same step. Pending-only on
// purpose: after approve/dismiss the same step may legitimately recur.
import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { organizations } from "./organizations";

export type AgentDraftStatus = "pending" | "approved" | "dismissed";
export type AgentDraftKind = "email" | "message" | "invoice" | "data_entry" | "other";
export type AgentDraftContent = { body: string; fields?: Record<string, string> };

export const agentActionDrafts = pgTable(
  "agent_action_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    agentId: text("agent_id").notNull(),
    conversationId: text("conversation_id").notNull(),
    stepAction: text("step_action").notNull(),
    kind: text("kind").$type<AgentDraftKind>().notNull(),
    title: text("title").notNull(),
    content: jsonb("content").$type<AgentDraftContent>().notNull(),
    tier: text("tier").$type<"yellow" | "red">().notNull(),
    status: text("status").$type<AgentDraftStatus>().notNull().default("pending"),
    resolvedByUserId: uuid("resolved_by_user_id"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("agent_action_drafts_org_status_created_idx").on(
      table.orgId,
      table.status,
      table.createdAt,
    ),
    index("agent_action_drafts_org_agent_idx").on(table.orgId, table.agentId),
    uniqueIndex("agent_action_drafts_pending_step_uniq")
      .on(table.orgId, table.conversationId, table.stepAction)
      .where(sql`status = 'pending'`),
  ],
);

export type AgentActionDraftRow = typeof agentActionDrafts.$inferSelect;
```

- [ ] **Step 2: Export from schema index**

In `packages/crm/src/db/schema/index.ts`, add (alphabetical near the workflow exports):

```ts
export * from "./agent-action-drafts";
```

- [ ] **Step 3: Write the migration**

```sql
-- packages/crm/drizzle/0072_agent_action_drafts.sql
-- Never-fail-compile slice — drafts filed by draft_for_approval, resolved
-- from /approvals. Spec: docs/superpowers/specs/
-- 2026-07-15-never-fail-compile-design.md.
--
-- HAND-WRITTEN (house rule: never drizzle-kit generate in this repo).
-- Additive only + idempotent (CREATE ... IF NOT EXISTS) so a re-run after an
-- out-of-band apply is a no-op.

CREATE TABLE IF NOT EXISTS "agent_action_drafts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "agent_id" text NOT NULL,
  "conversation_id" text NOT NULL,
  "step_action" text NOT NULL,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "content" jsonb NOT NULL,
  "tier" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "resolved_by_user_id" uuid,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "agent_action_drafts_org_status_created_idx"
  ON "agent_action_drafts" ("org_id", "status", "created_at");

CREATE INDEX IF NOT EXISTS "agent_action_drafts_org_agent_idx"
  ON "agent_action_drafts" ("org_id", "agent_id");

-- The atomic idempotency claim: one pending draft per (org, conversation,
-- step). Partial (pending-only) so resolved steps can re-file later.
CREATE UNIQUE INDEX IF NOT EXISTS "agent_action_drafts_pending_step_uniq"
  ON "agent_action_drafts" ("org_id", "conversation_id", "step_action")
  WHERE status = 'pending';
```

- [ ] **Step 4: Append the journal entry**

In `packages/crm/drizzle/meta/_journal.json`, after the `0071_eval_run_jobs` entry (idx 48, when 1783700000000), append:

```json
{
  "idx": 49,
  "version": "7",
  "when": 1783800000000,
  "tag": "0072_agent_action_drafts",
  "breakpoints": true
}
```

- [ ] **Step 5: Typecheck**

Run from `packages/crm`: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no NEW errors vs a pre-change baseline run (capture the baseline first; worktree-typecheck memory: judge by delta).

- [ ] **Step 6: Commit**

```bash
git add packages/crm/src/db/schema/agent-action-drafts.ts packages/crm/src/db/schema/index.ts packages/crm/drizzle/0072_agent_action_drafts.sql packages/crm/drizzle/meta/_journal.json
git commit -m "feat(agent-drafts): agent_action_drafts schema + migration 0072 (pending-only unique claim)"
```

---

### Task 2: Draft store — contract, memory twin, drizzle impl

Mirrors `lib/workflow/approvals/` exactly (types + storage-memory + storage-drizzle). The CONTRACT tests run against the memory twin; the drizzle impl carries the same semantics in SQL and is exercised by typecheck + live smoke.

**Files:**
- Create: `packages/crm/src/lib/agent-drafts/types.ts`
- Create: `packages/crm/src/lib/agent-drafts/policy.ts`
- Create: `packages/crm/src/lib/agent-drafts/storage-memory.ts`
- Create: `packages/crm/src/lib/agent-drafts/storage-drizzle.ts`
- Test: `packages/crm/tests/unit/agent-drafts/store-contract.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  type FileDraftInput = {
    orgId: string; agentId: string; conversationId: string;
    stepAction: string; kind: AgentDraftKind; title: string;
    content: AgentDraftContent; tier: "yellow" | "red";
  };
  type FileDraftResult =
    | { outcome: "filed"; draftId: string }
    | { outcome: "deduped"; draftId: string }
    | { outcome: "capped" };
  type ResolveDraftInput = { orgId: string; draftId: string; status: "approved" | "dismissed"; userId: string };
  interface AgentDraftStore {
    fileDraft(input: FileDraftInput): Promise<FileDraftResult>;
    resolveDraft(input: ResolveDraftInput): Promise<AgentActionDraftRow | null>; // null = CAS lost / not found / wrong org
    listDrafts(input: { orgId: string; status?: AgentDraftStatus }): Promise<AgentActionDraftRow[]>;
    countPending(orgId: string): Promise<number>;
  }
  ```
- `policy.ts` produces: `isDraftApprovalsOn(env: { SF_DRAFT_APPROVALS?: string | undefined }): boolean` (strict `=== "1"`), `MAX_DRAFTS_PER_CONVERSATION = 10`.
- Consumes: Task 1 schema/types.

- [ ] **Step 1: Write the contract test (failing)**

```ts
// packages/crm/tests/unit/agent-drafts/store-contract.spec.ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryDraftStore } from "../../../src/lib/agent-drafts/storage-memory";
import { MAX_DRAFTS_PER_CONVERSATION } from "../../../src/lib/agent-drafts/policy";
import type { FileDraftInput } from "../../../src/lib/agent-drafts/types";

const base: FileDraftInput = {
  orgId: "org-1", agentId: "agent-1", conversationId: "conv-1",
  stepAction: "Send the invoice", kind: "invoice", title: "Invoice for ACME",
  content: { body: "Invoice #12 — $450", fields: { amount: "$450" } }, tier: "red",
};

describe("agent-draft store contract", () => {
  test("files a draft and lists it pending", async () => {
    const store = createMemoryDraftStore();
    const r = await store.fileDraft(base);
    assert.equal(r.outcome, "filed");
    const rows = await store.listDrafts({ orgId: "org-1", status: "pending" });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.stepAction, "Send the invoice");
  });

  test("second filing for same (conversation, step) dedupes to the same id", async () => {
    const store = createMemoryDraftStore();
    const a = await store.fileDraft(base);
    const b = await store.fileDraft({ ...base, title: "different title, same step" });
    assert.equal(a.outcome, "filed");
    assert.equal(b.outcome, "deduped");
    assert.equal((b as { draftId: string }).draftId, (a as { draftId: string }).draftId);
    assert.equal((await store.listDrafts({ orgId: "org-1" })).length, 1);
  });

  test("refiling is allowed after the pending row resolves", async () => {
    const store = createMemoryDraftStore();
    const a = await store.fileDraft(base);
    await store.resolveDraft({ orgId: "org-1", draftId: (a as { draftId: string }).draftId, status: "approved", userId: "u1" });
    const b = await store.fileDraft(base);
    assert.equal(b.outcome, "filed");
    assert.equal((await store.listDrafts({ orgId: "org-1" })).length, 2);
  });

  test("resolve is CAS: second resolution returns null, row keeps first outcome", async () => {
    const store = createMemoryDraftStore();
    const a = await store.fileDraft(base);
    const id = (a as { draftId: string }).draftId;
    const first = await store.resolveDraft({ orgId: "org-1", draftId: id, status: "approved", userId: "u1" });
    const second = await store.resolveDraft({ orgId: "org-1", draftId: id, status: "dismissed", userId: "u2" });
    assert.ok(first);
    assert.equal(first!.status, "approved");
    assert.equal(second, null);
    const rows = await store.listDrafts({ orgId: "org-1", status: "approved" });
    assert.equal(rows.length, 1);
  });

  test("resolve is org-scoped: wrong org returns null and mutates nothing", async () => {
    const store = createMemoryDraftStore();
    const a = await store.fileDraft(base);
    const r = await store.resolveDraft({ orgId: "org-EVIL", draftId: (a as { draftId: string }).draftId, status: "approved", userId: "u1" });
    assert.equal(r, null);
    assert.equal((await store.listDrafts({ orgId: "org-1", status: "pending" })).length, 1);
  });

  test("cap: filing MAX+1 distinct steps in one conversation returns capped (cap counts all statuses)", async () => {
    const store = createMemoryDraftStore();
    for (let i = 0; i < MAX_DRAFTS_PER_CONVERSATION; i++) {
      const r = await store.fileDraft({ ...base, stepAction: `step ${i}` });
      assert.equal(r.outcome, "filed");
    }
    // resolve one — cap still counts it (all statuses)
    const rows = await store.listDrafts({ orgId: "org-1", status: "pending" });
    await store.resolveDraft({ orgId: "org-1", draftId: rows[0]!.id, status: "dismissed", userId: "u1" });
    const over = await store.fileDraft({ ...base, stepAction: "one more" });
    assert.equal(over.outcome, "capped");
  });

  test("listDrafts never crosses orgs", async () => {
    const store = createMemoryDraftStore();
    await store.fileDraft(base);
    await store.fileDraft({ ...base, orgId: "org-2", conversationId: "conv-9" });
    assert.equal((await store.listDrafts({ orgId: "org-1" })).length, 1);
    assert.equal((await store.listDrafts({ orgId: "org-2" })).length, 1);
  });

  test("countPending counts only pending for the org", async () => {
    const store = createMemoryDraftStore();
    const a = await store.fileDraft(base);
    await store.fileDraft({ ...base, stepAction: "second step" });
    await store.resolveDraft({ orgId: "org-1", draftId: (a as { draftId: string }).draftId, status: "approved", userId: "u1" });
    assert.equal(await store.countPending("org-1"), 1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node scripts/run-unit-tests.js` (from repo root)
Expected: FAIL — cannot find module `storage-memory`.

- [ ] **Step 3: Implement types.ts, policy.ts, storage-memory.ts**

```ts
// packages/crm/src/lib/agent-drafts/types.ts
// Store contract for agent_action_drafts. Two implementations mirror
// lib/workflow/approvals: storage-memory (contract tests) and
// storage-drizzle (prod). Semantics that MUST stay identical across the two:
// pending-only dedupe per (org, conversation, step), all-statuses cap,
// CAS resolve, org scoping on every read/write.
import type {
  AgentActionDraftRow,
  AgentDraftContent,
  AgentDraftKind,
  AgentDraftStatus,
} from "@/db/schema/agent-action-drafts";

export type FileDraftInput = {
  orgId: string;
  agentId: string;
  conversationId: string;
  stepAction: string;
  kind: AgentDraftKind;
  title: string;
  content: AgentDraftContent;
  tier: "yellow" | "red";
};

export type FileDraftResult =
  | { outcome: "filed"; draftId: string }
  | { outcome: "deduped"; draftId: string }
  | { outcome: "capped" };

export type ResolveDraftInput = {
  orgId: string;
  draftId: string;
  status: "approved" | "dismissed";
  userId: string;
};

export interface AgentDraftStore {
  fileDraft(input: FileDraftInput): Promise<FileDraftResult>;
  /** null = CAS lost, not found, or wrong org — caller surfaces a conflict. */
  resolveDraft(input: ResolveDraftInput): Promise<AgentActionDraftRow | null>;
  listDrafts(input: { orgId: string; status?: AgentDraftStatus }): Promise<AgentActionDraftRow[]>;
  countPending(orgId: string): Promise<number>;
}
```

```ts
// packages/crm/src/lib/agent-drafts/policy.ts
// Flag pattern mirrors isRecordToAgentOn (lib/recordings/policy.ts): strict
// "1" so a stray "true"/"yes" in Vercel can never accidentally open the surface.

export function isDraftApprovalsOn(env: {
  SF_DRAFT_APPROVALS?: string | undefined;
}): boolean {
  return env.SF_DRAFT_APPROVALS === "1";
}

/** Hard ceiling on drafts filed per conversation (all statuses — a resolved
 *  draft still counts, so a loop can't drain the inbox by re-filing). The
 *  uniqueness guarantee lives in the DB partial index; this cap is the
 *  belt-and-suspenders volume bound (Max amendment 2026-07-15). */
export const MAX_DRAFTS_PER_CONVERSATION = 10;
```

```ts
// packages/crm/src/lib/agent-drafts/storage-memory.ts
// In-memory AgentDraftStore — the contract twin (same pattern as
// lib/workflow/approvals/storage-memory.ts). Tests run against THIS; the
// drizzle impl must keep byte-equivalent semantics.
import type { AgentActionDraftRow } from "@/db/schema/agent-action-drafts";
import { MAX_DRAFTS_PER_CONVERSATION } from "./policy";
import type {
  AgentDraftStore,
  FileDraftInput,
  FileDraftResult,
  ResolveDraftInput,
} from "./types";

export function createMemoryDraftStore(): AgentDraftStore {
  const rows: AgentActionDraftRow[] = [];
  let seq = 0;

  return {
    async fileDraft(input: FileDraftInput): Promise<FileDraftResult> {
      const inConversation = rows.filter(
        (r) => r.orgId === input.orgId && r.conversationId === input.conversationId,
      );
      const pendingDupe = inConversation.find(
        (r) => r.stepAction === input.stepAction && r.status === "pending",
      );
      if (pendingDupe) return { outcome: "deduped", draftId: pendingDupe.id };
      if (inConversation.length >= MAX_DRAFTS_PER_CONVERSATION) {
        return { outcome: "capped" };
      }
      const row: AgentActionDraftRow = {
        id: `draft-${++seq}`,
        orgId: input.orgId,
        agentId: input.agentId,
        conversationId: input.conversationId,
        stepAction: input.stepAction,
        kind: input.kind,
        title: input.title,
        content: input.content,
        tier: input.tier,
        status: "pending",
        resolvedByUserId: null,
        resolvedAt: null,
        createdAt: new Date(),
      };
      rows.push(row);
      return { outcome: "filed", draftId: row.id };
    },

    async resolveDraft(input: ResolveDraftInput) {
      const row = rows.find(
        (r) => r.id === input.draftId && r.orgId === input.orgId && r.status === "pending",
      );
      if (!row) return null;
      row.status = input.status;
      row.resolvedByUserId = input.userId;
      row.resolvedAt = new Date();
      return row;
    },

    async listDrafts({ orgId, status }) {
      return rows
        .filter((r) => r.orgId === orgId && (status ? r.status === status : true))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    async countPending(orgId: string) {
      return rows.filter((r) => r.orgId === orgId && r.status === "pending").length;
    },
  };
}
```

- [ ] **Step 4: Run contract tests to verify pass**

Run: `node scripts/run-unit-tests.js`
Expected: all `store-contract` tests PASS; no new failures elsewhere.

- [ ] **Step 5: Implement storage-drizzle.ts**

```ts
// packages/crm/src/lib/agent-drafts/storage-drizzle.ts
// Prod AgentDraftStore. Idempotency truth lives in the DB:
//  - fileDraft: INSERT ... ON CONFLICT (the pending-only unique partial
//    index agent_action_drafts_pending_step_uniq) DO NOTHING; on conflict,
//    re-select the surviving pending row (idempotent-success, never an error).
//  - resolveDraft: single CAS UPDATE ... WHERE status='pending' RETURNING *.
// The cap check (count → insert) is not fully race-proof and that's accepted:
// turns within one conversation are effectively serialized; the hard
// guarantee (no duplicate pending draft) is the index's job, not the cap's.
import { and, count, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { agentActionDrafts } from "@/db/schema/agent-action-drafts";
import { MAX_DRAFTS_PER_CONVERSATION } from "./policy";
import type {
  AgentDraftStore,
  FileDraftInput,
  FileDraftResult,
  ResolveDraftInput,
} from "./types";

export function createDrizzleDraftStore(dbi: typeof db = db): AgentDraftStore {
  return {
    async fileDraft(input: FileDraftInput): Promise<FileDraftResult> {
      const [{ total }] = await dbi
        .select({ total: count() })
        .from(agentActionDrafts)
        .where(
          and(
            eq(agentActionDrafts.orgId, input.orgId),
            eq(agentActionDrafts.conversationId, input.conversationId),
          ),
        );
      if (Number(total) >= MAX_DRAFTS_PER_CONVERSATION) return { outcome: "capped" };

      const inserted = await dbi
        .insert(agentActionDrafts)
        .values({
          orgId: input.orgId,
          agentId: input.agentId,
          conversationId: input.conversationId,
          stepAction: input.stepAction,
          kind: input.kind,
          title: input.title,
          content: input.content,
          tier: input.tier,
        })
        .onConflictDoNothing({
          target: [
            agentActionDrafts.orgId,
            agentActionDrafts.conversationId,
            agentActionDrafts.stepAction,
          ],
          targetWhere: sql`status = 'pending'`,
        })
        .returning({ id: agentActionDrafts.id });

      if (inserted.length > 0) return { outcome: "filed", draftId: inserted[0]!.id };

      const [existing] = await dbi
        .select({ id: agentActionDrafts.id })
        .from(agentActionDrafts)
        .where(
          and(
            eq(agentActionDrafts.orgId, input.orgId),
            eq(agentActionDrafts.conversationId, input.conversationId),
            eq(agentActionDrafts.stepAction, input.stepAction),
            eq(agentActionDrafts.status, "pending"),
          ),
        )
        .limit(1);
      // Conflict fired but the pending row vanished between statements (it
      // resolved concurrently) — retry the insert once; if that still
      // conflicts, surface deduped-with-unknown-id as capped-safe fallback.
      if (!existing) {
        const retried = await dbi
          .insert(agentActionDrafts)
          .values({
            orgId: input.orgId,
            agentId: input.agentId,
            conversationId: input.conversationId,
            stepAction: input.stepAction,
            kind: input.kind,
            title: input.title,
            content: input.content,
            tier: input.tier,
          })
          .onConflictDoNothing({
            target: [
              agentActionDrafts.orgId,
              agentActionDrafts.conversationId,
              agentActionDrafts.stepAction,
            ],
            targetWhere: sql`status = 'pending'`,
          })
          .returning({ id: agentActionDrafts.id });
        if (retried.length > 0) return { outcome: "filed", draftId: retried[0]!.id };
        return { outcome: "capped" };
      }
      return { outcome: "deduped", draftId: existing.id };
    },

    async resolveDraft(input: ResolveDraftInput) {
      const updated = await dbi
        .update(agentActionDrafts)
        .set({
          status: input.status,
          resolvedByUserId: input.userId,
          resolvedAt: new Date(),
        })
        .where(
          and(
            eq(agentActionDrafts.id, input.draftId),
            eq(agentActionDrafts.orgId, input.orgId),
            eq(agentActionDrafts.status, "pending"),
          ),
        )
        .returning();
      return updated[0] ?? null;
    },

    async listDrafts({ orgId, status }) {
      const where = status
        ? and(eq(agentActionDrafts.orgId, orgId), eq(agentActionDrafts.status, status))
        : eq(agentActionDrafts.orgId, orgId);
      return dbi
        .select()
        .from(agentActionDrafts)
        .where(where)
        .orderBy(desc(agentActionDrafts.createdAt))
        .limit(200);
    },

    async countPending(orgId: string) {
      const [{ total }] = await dbi
        .select({ total: count() })
        .from(agentActionDrafts)
        .where(
          and(
            eq(agentActionDrafts.orgId, orgId),
            eq(agentActionDrafts.status, "pending"),
          ),
        );
      return Number(total);
    },
  };
}
```

Note for the implementer: if drizzle's installed version rejects `targetWhere` on `onConflictDoNothing`, fall back to `.onConflictDoNothing()` with no target (any conflict → dedupe re-select path). Do NOT install a new dependency (L-17 blocked-dep rule); check `node_modules/.pnpm` for the drizzle version and its API first.

- [ ] **Step 6: Typecheck + run tests**

Run: `pnpm exec tsc --noEmit -p packages/crm/tsconfig.json` and `node scripts/run-unit-tests.js`
Expected: no new tsc errors; contract suite green.

- [ ] **Step 7: Commit**

```bash
git add packages/crm/src/lib/agent-drafts packages/crm/tests/unit/agent-drafts
git commit -m "feat(agent-drafts): store contract + memory twin + drizzle impl (idempotent filing, CAS resolve, cap)"
```

---

### Task 3: `draft_for_approval` tool — opt-in registry append + gate + dispatch regression

**Files:**
- Modify: `packages/crm/src/lib/agents/tools.ts` (new tool near `escalateToHuman` ~L1170; opt-in append inside `getToolsForCapabilities` next to the copilot block ~L1980)
- Modify: `packages/crm/src/lib/agents/lifecycle/gate.ts` (NON_ACTION_CAPABILITIES set)
- Test: `packages/crm/tests/unit/agents/draft-for-approval-tool.spec.ts`

**Interfaces:**
- Consumes: `AgentDraftStore.fileDraft` (Task 2), `ToolExecuteContext` (tools.ts:36 — orgId, agentId, conversationId, testMode).
- Produces: exported `draftForApproval: AgentTool` with `name: "draft_for_approval"`; exported const `DRAFT_FOR_APPROVAL_CAPABILITY = "draft_for_approval"`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/crm/tests/unit/agents/draft-for-approval-tool.spec.ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_TOOLS,
  DRAFT_FOR_APPROVAL_CAPABILITY,
  draftForApproval,
  getToolsForCapabilities,
} from "../../../src/lib/agents/tools";

const ctx = {
  orgId: "org-1", orgSlug: "acme", agentId: "agent-1",
  conversationId: "conv-1", testMode: true,
} as Parameters<typeof draftForApproval.execute>[1];

describe("draft_for_approval tool", () => {
  test("is NOT in ALL_TOOLS (opt-in only — empty capabilities must never see it)", () => {
    assert.equal(ALL_TOOLS.some((t) => t.name === "draft_for_approval"), false);
  });

  test("no-capabilities agents get the untouched ALL_TOOLS reference (regression invariant)", async () => {
    const tools = await getToolsForCapabilities(undefined);
    assert.equal(tools.length, ALL_TOOLS.length);
    tools.forEach((t, i) => assert.equal(t, ALL_TOOLS[i]));
  });

  test("capability opt-in appends the tool after natives", async () => {
    const tools = await getToolsForCapabilities([DRAFT_FOR_APPROVAL_CAPABILITY, "escalate_to_human"]);
    const names = tools.map((t) => t.name);
    assert.ok(names.includes("draft_for_approval"));
    assert.ok(names.includes("escalate_to_human"));
  });

  test("testMode short-circuits with a synthetic draft id and no DB import", async () => {
    const out = await draftForApproval.execute(
      { stepAction: "Send invoice", kind: "invoice", title: "Inv", body: "Invoice #1" },
      ctx,
    );
    assert.equal(out.ok, true);
    assert.match(out.draftId ?? "", /^test-draft-/);
  });

  test("zod schema rejects an empty body", () => {
    const parsed = draftForApproval.inputSchema.safeParse({
      stepAction: "Send invoice", kind: "invoice", title: "Inv", body: "",
    });
    assert.equal(parsed.success, false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node scripts/run-unit-tests.js`
Expected: FAIL — `DRAFT_FOR_APPROVAL_CAPABILITY` / `draftForApproval` not exported.

- [ ] **Step 3: Implement the tool in tools.ts**

Insert after the `escalateToHuman` definition (keep file conventions — zod schema + hand-mirrored jsonSchema + lazy imports inside execute):

```ts
// ─── draft_for_approval ────────────────────────────────────────────────────
// Never-fail-compile slice: the honest floor for red/yellow recorded steps.
// The agent PREPARES the complete work product and files it for a human to
// approve from /approvals. Filing is NOT doing — the tool description and
// the compiled skill-md both say so, and the never-lies fallback regex
// treats an unapproved claim of completion as a violation.

export const DRAFT_FOR_APPROVAL_CAPABILITY = "draft_for_approval";

const draftForApprovalInput = z.object({
  stepAction: z.string().min(3),
  kind: z.enum(["email", "message", "invoice", "data_entry", "other"]),
  title: z.string().min(3),
  body: z.string().min(1),
  fields: z.record(z.string(), z.string()).optional(),
});

export const draftForApproval: AgentTool<
  z.infer<typeof draftForApprovalInput>,
  { ok: boolean; draftId?: string; deduped?: boolean; error?: string }
> = {
  name: "draft_for_approval",
  description:
    "File a prepared piece of work for human approval. Use for any workflow step you are NOT allowed to execute yourself. Put the COMPLETE work product in body — ready to send/paste as-is (the full email text, the full invoice lines, the exact data to enter). Filing a draft is NOT doing the action: afterwards, tell the user it has been prepared and sent for approval — never that it is done.",
  inputSchema: draftForApprovalInput,
  jsonSchema: {
    type: "object",
    properties: {
      stepAction: {
        type: "string",
        description: "The workflow step this draft fulfills, e.g. 'Send the invoice'",
      },
      kind: {
        type: "string",
        enum: ["email", "message", "invoice", "data_entry", "other"],
      },
      title: { type: "string", description: "Short inbox line, e.g. 'Invoice for ACME — $450'" },
      body: {
        type: "string",
        description: "The COMPLETE work product, ready to use as-is",
      },
      fields: {
        type: "object",
        additionalProperties: { type: "string" },
        description: "Structured values (amount, recipient, due date, ...)",
      },
    },
    required: ["stepAction", "kind", "title", "body"],
  },
  execute: async (input, ctx) => {
    if (ctx.testMode) {
      return { ok: true, draftId: `test-draft-${Date.now()}` };
    }
    const { createDrizzleDraftStore } = await import("@/lib/agent-drafts/storage-drizzle");
    const store = createDrizzleDraftStore();
    const result = await store.fileDraft({
      orgId: ctx.orgId,
      agentId: ctx.agentId,
      conversationId: ctx.conversationId,
      stepAction: input.stepAction,
      kind: input.kind,
      title: input.title,
      content: { body: input.body, fields: input.fields },
      // Tier is informational on the row; the tool can't see coverage at run
      // time, so file as "red" (the conservative bucket) — the inbox renders
      // both identically in v1.
      tier: "red",
    });
    if (result.outcome === "capped") {
      return {
        ok: false,
        error:
          "draft cap reached for this conversation — use escalate_to_human instead",
      };
    }
    return { ok: true, draftId: result.draftId, deduped: result.outcome === "deduped" };
  },
};
```

Then, inside `getToolsForCapabilities`, directly below the copilot block (~L1980), add:

```ts
  // Never-fail-compile: draft_for_approval is opt-in only — it is NOT in
  // ALL_TOOLS, so empty-capabilities agents (which get the full native list)
  // never see it. Same pattern + same spread-into-new-array reason as the
  // copilot block above.
  if (capabilities?.includes(DRAFT_FOR_APPROVAL_CAPABILITY)) {
    native = [...native, draftForApproval as AgentTool];
  }
```

- [ ] **Step 4: Add to NON_ACTION_CAPABILITIES in gate.ts**

In `packages/crm/src/lib/agents/lifecycle/gate.ts`, extend the set (filing a draft never itself takes a real-world action — same class as escalate_to_human):

```ts
const NON_ACTION_CAPABILITIES = new Set<string>([
  "escalate_to_human",
  "provide_faq_answer",
  "get_quote_range",
  "draft_for_approval",
]);
```

- [ ] **Step 5: Check the eval runners need no change**

Read `packages/crm/src/lib/agents/evals/run-agent-evals.ts` and `run-deployed-agent-evals.ts`: confirm their synthetic short-circuit rides `ctx.testMode` (our execute handles it) OR a per-tool name map. If a per-tool name map exists, add `draft_for_approval → { ok: true, draftId: "test-…" }` beside `escalate_to_human`. Do whichever the code actually requires — do not add both.

- [ ] **Step 6: Verify the dispatch loop resolves appended tools (L-30)**

Read the tool-dispatch site in `packages/crm/src/lib/agents/runtime.ts` AND `packages/crm/src/lib/agents/stateless-turn.ts`: confirm both resolve the called tool from the per-call merged list returned by `getToolsForCapabilities` (`tools.find(t => t.name === name)`), NOT via the module-global `findTool` (tools.ts:2053, ALL_TOOLS-only — which can never see the appended tool). The copilot tools prove this works today; if either loop uses `findTool`, STOP and flag it in the task report rather than patching the loop.

- [ ] **Step 7: Run tests**

Run: `node scripts/run-unit-tests.js`
Expected: new suite green; `wrap-tool.spec.ts` (the reference-equality regression) still green.

- [ ] **Step 8: Commit**

```bash
git add packages/crm/src/lib/agents/tools.ts packages/crm/src/lib/agents/lifecycle/gate.ts packages/crm/tests/unit/agents/draft-for-approval-tool.spec.ts
git commit -m "feat(agents): draft_for_approval opt-in native tool (files to agent_action_drafts; non-action class)"
```

---

### Task 4: Compile changes — autonomy score, draft sections, flag threading

**Files:**
- Modify: `packages/crm/src/lib/recordings/compile-agent.ts`
- Modify: `packages/crm/src/lib/agent-templates/schema.ts` (blueprint patch allow-list)
- Modify: `packages/crm/src/db/schema/agents.ts` (AgentBlueprint type — add optional `autonomy`)
- Modify: `packages/crm/src/app/api/v1/recordings/compile-agent/route.ts` (thread flag; persist autonomy)
- Test: extend `packages/crm/tests/unit/recordings/compile-agent.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export type AutonomyScore = { green: number; yellow: number; red: number; total: number; autonomousPct: number };
  export function autonomyForModel(model: FlowModel): AutonomyScore;
  export function inferDraftKind(step: WorkflowStep): "email" | "message" | "invoice" | "data_entry" | "other";
  // flowModelToSkillMd(model, opts?: { draftApprovals?: boolean })
  // flowModelToBundle({ model, recordings, draftApprovals?: boolean })
  // deriveEvalScenarios(recordings, opts?: { draftApprovals?: boolean })
  ```
- `AgentBlueprint` (db/schema/agents.ts, near `customSkillMd?` at L67) gains `autonomy?: AutonomyScore;` (type-only — blueprint is jsonb, no migration).
- Consumes: `DRAFT_FOR_APPROVAL_CAPABILITY` (Task 3), existing `FlowModel`/`CoverageEntry`.

- [ ] **Step 1: Write the failing tests** (append to `tests/unit/recordings/compile-agent.spec.ts`, matching its existing fixture style — read the file's helpers first and reuse its FlowModel fixture builder if one exists)

```ts
describe("autonomyForModel", () => {
  test("mixed coverage counts and pct", () => {
    const model = fixtureModel(); // 2 green, 1 yellow, 1 red (build with the file's existing fixture helper)
    const a = autonomyForModel(model);
    assert.deepEqual(a, { green: 2, yellow: 1, red: 1, total: 4, autonomousPct: 50 });
  });
  test("missing coverage entries count as red", () => {
    const model = { ...fixtureModel(), coverage: [] };
    const a = autonomyForModel(model);
    assert.equal(a.green, 0);
    assert.equal(a.red, a.total);
    assert.equal(a.autonomousPct, 0);
  });
});

describe("flowModelToSkillMd — draft approvals flag", () => {
  test("flag OFF: output byte-identical to the un-optioned call", () => {
    const model = fixtureModel();
    assert.equal(flowModelToSkillMd(model), flowModelToSkillMd(model, { draftApprovals: false }));
  });
  test("flag ON: red/yellow steps render in 'What you draft for approval' with kind + done-only-when-approved", () => {
    const md = flowModelToSkillMd(fixtureModel(), { draftApprovals: true });
    assert.ok(md.includes("## What you draft for approval"));
    assert.ok(md.includes("draft_for_approval"));
    assert.ok(md.includes("DONE only when a human approves"));
  });
  test("flag ON: may-NOT-do keeps the filing≠doing floor", () => {
    const md = flowModelToSkillMd(fixtureModel(), { draftApprovals: true });
    assert.ok(md.includes("## What you may NOT do"));
    assert.ok(md.includes("Never execute or claim to have executed a drafted step"));
  });
});

describe("flowModelToBundle — draft approvals flag", () => {
  test("flag ON grants the capability; flag OFF does not", () => {
    const recordings = [{ label: null, trace: fixtureTrace() }];
    const on = flowModelToBundle({ model: fixtureModel(), recordings, draftApprovals: true });
    const off = flowModelToBundle({ model: fixtureModel(), recordings });
    assert.ok(on.bundle.blueprint.capabilities?.includes("draft_for_approval"));
    assert.equal(off.bundle.blueprint.capabilities?.includes("draft_for_approval"), false);
  });
  test("flag ON persists the autonomy score on the blueprint", () => {
    const on = flowModelToBundle({ model: fixtureModel(), recordings: [], draftApprovals: true });
    assert.equal(on.bundle.blueprint.autonomy?.total, 4);
  });
  test("flag OFF: bundle deep-equal to today's output (byte-parity regression)", () => {
    const recordings = [{ label: null, trace: fixtureTrace() }];
    const a = flowModelToBundle({ model: fixtureModel(), recordings });
    const b = flowModelToBundle({ model: fixtureModel(), recordings, draftApprovals: false });
    assert.deepEqual(a, b);
  });
});

describe("deriveEvalScenarios — draft approvals flag", () => {
  test("flag ON: red step yields mustDo file-a-draft + mustNotDo claim-executed", () => {
    const scenarios = deriveEvalScenarios([{ label: null, trace: fixtureTrace() }], { draftApprovals: true });
    const s = scenarios[0]!;
    assert.ok(s.mustDo.some((l) => l.startsWith("file a draft for:")));
    assert.ok(s.mustNotDo.some((l) => l.startsWith("claim executed:")));
  });
  test("flag OFF: legacy 'attempt:' shape preserved", () => {
    const scenarios = deriveEvalScenarios([{ label: null, trace: fixtureTrace() }]);
    assert.ok(scenarios[0]!.mustNotDo.some((l) => l.startsWith("attempt:")));
  });
});

describe("inferDraftKind", () => {
  test("maps by keywords with 'other' fallback", () => {
    assert.equal(inferDraftKind({ ...stepFixture(), app: "Gmail", action: "Send the follow-up email" }), "email");
    assert.equal(inferDraftKind({ ...stepFixture(), action: "Send the invoice" }), "invoice");
    assert.equal(inferDraftKind({ ...stepFixture(), action: "Text the customer" }), "message");
    assert.equal(inferDraftKind({ ...stepFixture(), app: "QuickBooks Desktop", action: "Enter the job record" }), "data_entry");
    assert.equal(inferDraftKind({ ...stepFixture(), action: "Review the photos" }), "other");
  });
});
```

(`fixtureModel` / `fixtureTrace` / `stepFixture`: reuse the spec file's existing builders; if none exist, add small local builders producing a 4-step model with coverage [green, green, yellow, red] — steps: "Open the job in Jobber"(green), "Look up availability"(green), "Post the update"(yellow), "Enter the job record" in "QuickBooks Desktop"(red).)

- [ ] **Step 2: Run to verify failures** — `node scripts/run-unit-tests.js`, expect the new blocks to FAIL (missing exports / sections).

- [ ] **Step 3: Implement in compile-agent.ts**

Add exports:

```ts
export type AutonomyScore = {
  green: number;
  yellow: number;
  red: number;
  total: number;
  autonomousPct: number;
};

/** Honest autonomy math straight from coverage: green runs itself, yellow +
 *  red arrive as drafts. Missing coverage entries count as red (same default
 *  as tierForStep). Pure. */
export function autonomyForModel(model: FlowModel): AutonomyScore {
  let green = 0;
  let yellow = 0;
  let red = 0;
  for (const step of model.steps) {
    const tier = tierForStep(model.coverage, step.index);
    if (tier === "green") green++;
    else if (tier === "yellow") yellow++;
    else red++;
  }
  const total = model.steps.length;
  return {
    green,
    yellow,
    red,
    total,
    autonomousPct: total === 0 ? 0 : Math.round((green / total) * 100),
  };
}

const DRAFT_KIND_KEYWORDS: Array<{ kind: "email" | "message" | "invoice" | "data_entry"; keywords: string[] }> = [
  { kind: "invoice", keywords: ["invoice", "quote", "estimate", "bill"] },
  { kind: "email", keywords: ["email", "gmail", "outlook", "reply"] },
  { kind: "message", keywords: ["sms", "text", "message", "whatsapp", "dm"] },
  { kind: "data_entry", keywords: ["enter", "log", "record", "desktop", "quickbooks", "type into"] },
];

/** Kind for a drafted step — keyword map over "<app> <action>", first match
 *  wins, "other" fallback. Order matters: invoice before email so "email the
 *  invoice" drafts as an invoice. Pure. */
export function inferDraftKind(step: WorkflowStep): "email" | "message" | "invoice" | "data_entry" | "other" {
  const haystack = `${step.app} ${step.action}`.toLowerCase();
  for (const { kind, keywords } of DRAFT_KIND_KEYWORDS) {
    if (keywords.some((k) => haystack.includes(k))) return kind;
  }
  return "other";
}
```

Add the flag-on sections (new functions beside `mayNotDoSection`; do NOT edit the legacy function — flag-off must stay byte-identical):

```ts
function draftForApprovalSection(model: FlowModel): string {
  const lines: string[] = [];
  for (const step of model.steps) {
    const tier = tierForStep(model.coverage, step.index);
    if (tier === "green") continue;
    lines.push(
      `- ${step.action} (${step.app}): prepare the complete work product and file it with draft_for_approval (kind: ${inferDraftKind(step)}). It is DONE only when a human approves it.`,
    );
  }
  if (lines.length === 0) {
    lines.push("- Nothing — every step is bound to a tool.");
  }
  return `## What you draft for approval\n${lines.join("\n")}`;
}

function mayNotDoSectionWithDrafts(): string {
  return [
    "## What you may NOT do",
    "- Never execute or claim to have executed a drafted step. Filing a draft ≠ doing the action.",
    "- Never invent a value not present in the workflow or the conversation.",
  ].join("\n");
}
```

Change `flowModelToSkillMd(model: FlowModel, opts?: { draftApprovals?: boolean })`: when `opts?.draftApprovals` is true, the required group becomes `[header, workflow, rules, draftForApprovalSection(model), mayNotDoSectionWithDrafts()]`; otherwise the existing `[header, workflow, rules, mayNotDo]` — same cap/drop ladder either way (both new sections are in the never-dropped required group).

Change `deriveEvalScenarios(recordings, opts?: { draftApprovals?: boolean })`: in the mustDo/mustNotDo builders, when flag on, non-green steps contribute `mustDo: \`file a draft for: ${s.action}\`` and `mustNotDo: \`claim executed: ${s.action}\``; when off, keep the exact current lines. (`flowModelToSkillMd`'s internal `deriveEvalScenarios` call threads the same flag.)

Change `flowModelToBundle(params: { model; recordings; draftApprovals?: boolean })`: when flag on — `bundle.blueprint.customSkillMd = flowModelToSkillMd(model, { draftApprovals: true })`; after `filterCapabilitiesForModel`, append `"draft_for_approval"` to capabilities (dedupe via Set); set `bundle.blueprint.autonomy = autonomyForModel(model)`; red-step warnings become `\`"${step.action}" (${step.app}) has no tool binding — the agent will draft it for your approval.\``. Flag off — zero behavioral change (deep-equal regression test enforces it).

- [ ] **Step 4: Blueprint type + patch schema**

`packages/crm/src/db/schema/agents.ts` — below `customSkillMd?: string;` (L67):

```ts
  /** Never-fail-compile: honest autonomy math from the recording's coverage
   *  (green runs itself; yellow+red arrive as drafts). Absent on non-recording
   *  templates. */
  autonomy?: {
    green: number;
    yellow: number;
    red: number;
    total: number;
    autonomousPct: number;
  };
```

`packages/crm/src/lib/agent-templates/schema.ts` — in `TemplateBlueprintPatchSchema` beside `capabilities` (L37):

```ts
    autonomy: z
      .object({
        green: z.number().int().min(0),
        yellow: z.number().int().min(0),
        red: z.number().int().min(0),
        total: z.number().int().min(0),
        autonomousPct: z.number().int().min(0).max(100),
      })
      .optional(),
```

- [ ] **Step 5: Thread the flag through the compile route**

In `app/api/v1/recordings/compile-agent/route.ts` (flowModelToBundle call at ~L131):

```ts
import { isDraftApprovalsOn } from "@/lib/agent-drafts/policy";
// ...
const { bundle, scenarios, warnings } = flowModelToBundle({
  model: flowModel,
  recordings,
  draftApprovals: isDraftApprovalsOn(process.env),
});
```

`createAgentTemplate` persists the blueprint as-is, so `autonomy` rides along — verify by reading the call at ~L141 and confirm no field allow-list strips it (if `TemplateBlueprintPatchSchema` gates that path, Step 4's addition covers it).

- [ ] **Step 6: Run tests** — `node scripts/run-unit-tests.js`. Expected: all new blocks green; existing `compile-agent.spec.ts`, `coverage.spec.ts` untouched-green.

- [ ] **Step 7: Commit**

```bash
git add packages/crm/src/lib/recordings/compile-agent.ts packages/crm/src/lib/agent-templates/schema.ts packages/crm/src/db/schema/agents.ts "packages/crm/src/app/api/v1/recordings/compile-agent/route.ts" packages/crm/tests/unit/recordings/compile-agent.spec.ts
git commit -m "feat(recordings): never-fail compile — draft sections + autonomy score behind SF_DRAFT_APPROVALS (flag-off byte-identical)"
```

---

### Task 5: /approvals inbox + nav entry + recap autonomy line

**Files:**
- Create: `packages/crm/src/app/(dashboard)/approvals/page.tsx`
- Create: `packages/crm/src/app/(dashboard)/approvals/actions.ts`
- Create: `packages/crm/src/app/(dashboard)/approvals/draft-row.tsx`
- Modify: `packages/crm/src/components/layout/nav-config.ts` (flag-gated entry in the group holding Contacts/Deals/Bookings, ~L199)
- Modify: `packages/crm/src/app/(public)/record/record-ui/recap-panel.tsx` (autonomy line above the step list, near `summarizeCoverage` at L71)
- Modify: `packages/crm/src/app/(public)/record/record-ui/tiers.ts` (red label; see Step 5)
- Test: `packages/crm/tests/unit/agent-drafts/approvals-actions.spec.ts` (actions logic via DI store), render assertions appended to `tests/unit/recordings/record-ui-v3.spec.ts` if the recap panel has render tests there (read it first; if it renders recap-panel, extend; otherwise skip render test — vision gate covers it).

**Interfaces:**
- Consumes: `createDrizzleDraftStore` / `AgentDraftStore` (Task 2), `isDraftApprovalsOn` (Task 2), `autonomyForModel` (Task 4), `auth()` from `@/auth`, `session.user.orgId` (typed in `types/next-auth.d.ts`).
- Produces: server actions `approveDraftAction(draftId: string)`, `dismissDraftAction(draftId: string)` — both return `{ ok: boolean; conflict?: boolean }`.

- [ ] **Step 1: Write the failing actions test**

```ts
// packages/crm/tests/unit/agent-drafts/approvals-actions.spec.ts
// Tests the pure resolution logic the server actions delegate to (the
// actions themselves are thin auth wrappers — auth is exercised by the
// route-authz pattern, not unit tests).
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryDraftStore } from "../../../src/lib/agent-drafts/storage-memory";
import { resolveDraftForOperator } from "../../../src/lib/agent-drafts/resolve";

describe("resolveDraftForOperator", () => {
  test("approves a pending draft", async () => {
    const store = createMemoryDraftStore();
    const filed = await store.fileDraft({
      orgId: "org-1", agentId: "a", conversationId: "c", stepAction: "s",
      kind: "other", title: "t", content: { body: "b" }, tier: "red",
    });
    const out = await resolveDraftForOperator(store, {
      orgId: "org-1", draftId: (filed as { draftId: string }).draftId,
      status: "approved", userId: "u1",
    });
    assert.deepEqual(out, { ok: true });
  });

  test("second resolution reports conflict, not success", async () => {
    const store = createMemoryDraftStore();
    const filed = await store.fileDraft({
      orgId: "org-1", agentId: "a", conversationId: "c", stepAction: "s",
      kind: "other", title: "t", content: { body: "b" }, tier: "red",
    });
    const id = (filed as { draftId: string }).draftId;
    await resolveDraftForOperator(store, { orgId: "org-1", draftId: id, status: "approved", userId: "u1" });
    const out = await resolveDraftForOperator(store, { orgId: "org-1", draftId: id, status: "dismissed", userId: "u2" });
    assert.deepEqual(out, { ok: false, conflict: true });
  });
});
```

- [ ] **Step 2: Run to verify failure** — `node scripts/run-unit-tests.js`, expect missing-module failure for `resolve`.

- [ ] **Step 3: Implement `lib/agent-drafts/resolve.ts` + the actions + page + row**

```ts
// packages/crm/src/lib/agent-drafts/resolve.ts
// Thin, store-agnostic resolution used by the /approvals server actions —
// kept out of actions.ts so it's unit-testable against the memory twin.
import type { AgentDraftStore, ResolveDraftInput } from "./types";

export async function resolveDraftForOperator(
  store: AgentDraftStore,
  input: ResolveDraftInput,
): Promise<{ ok: boolean; conflict?: boolean }> {
  const row = await store.resolveDraft(input);
  if (!row) return { ok: false, conflict: true };
  return { ok: true };
}
```

```ts
// packages/crm/src/app/(dashboard)/approvals/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isDraftApprovalsOn } from "@/lib/agent-drafts/policy";
import { resolveDraftForOperator } from "@/lib/agent-drafts/resolve";
import { createDrizzleDraftStore } from "@/lib/agent-drafts/storage-drizzle";

async function resolveWith(status: "approved" | "dismissed", draftId: string) {
  if (!isDraftApprovalsOn(process.env)) return { ok: false as const };
  const session = await auth();
  const orgId = session?.user?.orgId;
  if (!session?.user?.id || !orgId) redirect("/login");
  const out = await resolveDraftForOperator(createDrizzleDraftStore(), {
    orgId,
    draftId,
    status,
    userId: session.user.id,
  });
  revalidatePath("/approvals");
  return out;
}

export async function approveDraftAction(draftId: string) {
  return resolveWith("approved", draftId);
}

export async function dismissDraftAction(draftId: string) {
  return resolveWith("dismissed", draftId);
}
```

```tsx
// packages/crm/src/app/(dashboard)/approvals/page.tsx
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { isDraftApprovalsOn } from "@/lib/agent-drafts/policy";
import { createDrizzleDraftStore } from "@/lib/agent-drafts/storage-drizzle";
import { DraftRow } from "./draft-row";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  if (!isDraftApprovalsOn(process.env)) notFound();
  const session = await auth();
  const orgId = session?.user?.orgId;
  if (!session?.user?.id || !orgId) redirect("/login");

  const store = createDrizzleDraftStore();
  const [pending, resolved] = await Promise.all([
    store.listDrafts({ orgId, status: "pending" }),
    store.listDrafts({ orgId }).then((all) => all.filter((d) => d.status !== "pending").slice(0, 25)),
  ]);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-xl font-semibold">Approvals</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Work your agents prepared and are waiting on you to approve.
      </p>

      {pending.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nothing waiting on you — your agents will file drafts here when a step
          needs your approval.
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {pending.map((d) => (
            <DraftRow key={d.id} draft={d} />
          ))}
        </ul>
      )}

      {resolved.length > 0 ? (
        <details className="mt-10">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Recently resolved ({resolved.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {resolved.map((d) => (
              <li key={d.id} className="rounded-md border p-3 text-sm opacity-70">
                <span className="font-medium">{d.title}</span>{" "}
                <span className="text-xs uppercase">{d.status}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
```

```tsx
// packages/crm/src/app/(dashboard)/approvals/draft-row.tsx
"use client";

import { useState, useTransition } from "react";
import type { AgentActionDraftRow } from "@/db/schema/agent-action-drafts";
import { approveDraftAction, dismissDraftAction } from "./actions";

export function DraftRow({ draft }: { draft: AgentActionDraftRow }) {
  const [pendingAction, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [conflict, setConflict] = useState(false);

  const act = (fn: (id: string) => Promise<{ ok: boolean; conflict?: boolean }>) =>
    startTransition(async () => {
      const out = await fn(draft.id);
      if (!out.ok && out.conflict) setConflict(true);
    });

  return (
    <li className="rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium">{draft.title}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {draft.stepAction} · {draft.kind} · agent {draft.agentId}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm"
            disabled={pendingAction}
            onClick={() => act(dismissDraftAction)}
          >
            Dismiss
          </button>
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
            disabled={pendingAction}
            onClick={() => act(approveDraftAction)}
          >
            Approve
          </button>
        </div>
      </div>
      <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
        {draft.content.body}
      </pre>
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          className="text-xs underline"
          onClick={async () => {
            await navigator.clipboard.writeText(draft.content.body);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy draft"}
        </button>
        {conflict ? (
          <span className="text-xs text-amber-600">
            Already resolved elsewhere — refresh to see the latest state.
          </span>
        ) : null}
      </div>
    </li>
  );
}
```

Styling note: match the dashboard's existing classes — read one sibling page (e.g. `(dashboard)/clients/page.tsx`) and reuse its container/heading/card conventions rather than the placeholder Tailwind above if they differ.

- [ ] **Step 4: Nav entry (flag-gated)**

In `nav-config.ts`, `buildNavGroups` runs where env is readable (confirm — it's imported by the server `sidebar.tsx`). Add to the group containing Contacts/Deals/Bookings (~L199):

```ts
          ...(process.env.SF_DRAFT_APPROVALS === "1"
            ? [{ href: "/approvals", label: "Approvals", icon: "CheckSquare" }]
            : []),
```

If `buildNavGroups` takes a params object instead of reading env (read the callers at sidebar.tsx first), thread `draftApprovalsOn: boolean` from the layout the same way existing conditional entries (e.g. the super-admin entry at ~L182) receive their conditions. Use whichever mechanism the file already uses for conditional entries — do not invent a new one. Count badge: SKIPPED in v1 if no badge mechanism exists in nav items (none found in recon); note it in the task report as a conscious cut — do NOT build badge plumbing.

- [ ] **Step 5: Recap autonomy line + tier label**

`recap-panel.tsx` receives `flowModel` + `coverage` (props at L44-45) and computes `summarizeCoverage(coverage)` (L71). Add above the step list, only when a flowModel exists AND a new `draftApprovals?: boolean` prop is true (threaded from the /record page server component via `isDraftApprovalsOn(process.env)` — recap-panel is a client component, so it must arrive as a prop, L-18):

```tsx
{draftApprovals && flowModel ? (
  <p className="text-[13px] text-white/80">
    <span className="font-semibold">
      {summary.green} of {flowModel.steps.length} steps run autonomously.
    </span>{" "}
    {flowModel.steps.length - summary.green > 0
      ? `${flowModel.steps.length - summary.green} arrive as drafts for your approval.`
      : "Fully autonomous."}
  </p>
) : null}
```

(`summarizeCoverage` already exists at L71 — read its return shape first and use its green count field; if it doesn't expose one, compute `coverage.filter(c => c.tier === "green").length` inline.)

`tiers.ts`: change is CONDITIONAL COPY, so keep the module static and add a second label map instead of mutating the existing one (the legacy map keeps flag-off surfaces byte-stable):

```ts
/** Flag-on copy: red steps aren't "stays with you" anymore — the agent
 *  drafts them. Same keys/colors; recap picks the map by its draftApprovals
 *  prop. */
export const TIER_LABEL_DRAFTS: Record<CoverageTier, string> = {
  green: "Automatable",
  yellow: "Needs approval",
  red: "Drafted for you",
};
```

In recap-panel.tsx, badge label becomes `{(draftApprovals ? TIER_LABEL_DRAFTS : TIER_LABEL)[tier]}`.

Thread the prop: find where `<RecapPanel` is rendered (`record-client.tsx` or `page.tsx` under `(public)/record`) and pass `draftApprovals` from the server boundary (`page.tsx` reads `isDraftApprovalsOn(process.env)` and threads it down through the existing prop chain — record-client is a client component, so the boolean must originate in page.tsx).

- [ ] **Step 6: Run tests + typecheck** — `node scripts/run-unit-tests.js` + `pnpm exec tsc --noEmit -p packages/crm/tsconfig.json`. Expected: new suites green, no new tsc errors, `record-ui-v3.spec.ts` still green.

- [ ] **Step 7: Commit**

```bash
git add "packages/crm/src/app/(dashboard)/approvals" packages/crm/src/lib/agent-drafts/resolve.ts packages/crm/src/components/layout/nav-config.ts "packages/crm/src/app/(public)/record/record-ui/recap-panel.tsx" "packages/crm/src/app/(public)/record/record-ui/tiers.ts" packages/crm/tests/unit/agent-drafts/approvals-actions.spec.ts
git commit -m "feat(approvals): /approvals inbox + flag-gated nav entry + recap autonomy line"
```

(Include whichever record page/client file carried the prop threading in the same commit.)

---

### Task 6: Full-suite regression + build check

**Files:** none new.

- [ ] **Step 1:** `node scripts/run-unit-tests.js` from repo root — record pass/fail counts and DIFF against the baseline captured before Task 1 (DB-bound failures are pre-existing; the delta must be zero-or-better).
- [ ] **Step 2:** `pnpm exec tsc --noEmit -p packages/crm/tsconfig.json` — zero NEW errors vs baseline.
- [ ] **Step 3:** grep gates the verifier will run — pre-check them yourself: every file under `app/(dashboard)/approvals` with actions has `"use server"` as the FIRST statement of actions.ts; migration file + journal idx are consistent; no `sql.raw` with interpolation anywhere in the new code (L-04).
- [ ] **Step 4: Commit** any fixes as `fix:` commits; report final commit list.

## Self-Review (done at plan time)

- Spec coverage: §4→Task 1, §5→Tasks 2+3, §6→Task 4, §7→Task 5, §8 flag→Tasks 2/4/5, §9 tests→each task + Task 6. Vision-gate + smoke (§9 last two bullets) happen at controller level post-build (ship-feature Verify step), not in this plan.
- Nav badge (§7.2): recon found NO badge mechanism on nav items; plan consciously cuts the count badge (entry only) and reports it — spec's badge line is downgraded to follow-up rather than inventing badge plumbing mid-slice (Minimal Impact).
- Type consistency: `AutonomyScore`, `FileDraftResult` outcomes (`filed|deduped|capped`), `DRAFT_FOR_APPROVAL_CAPABILITY` used consistently across Tasks 2-5.
