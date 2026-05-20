# Proposal Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the agency-revenue Proposal Builder — an agency operator goes from "I want to pitch X" to "X paying me $497/mo on Stripe with a live working workspace" in under 5 minutes, with **0% taken by SeldonFrame**.

**Architecture:** Stripe Connect Express on the existing `stripe_connections` table (reuse, don't duplicate). New `proposals` + `proposal_events` tables. The killer detail is that proposal creation provisions a real workspace at `status='preview'`, then the proposal page embeds an iframe of that workspace's booking page. On Accept → Stripe Checkout on the agency's connected account → webhook flips workspace to `status='active'`. Per-agency proposal template lives on `users.agency_profile.proposalTemplate` JSONB.

**Tech Stack:** Next.js 16 App Router • React 19 • TypeScript • Tailwind v4 • Drizzle ORM • Postgres (Neon) • Stripe Connect Express + Subscriptions • Resend (existing) • Vercel Cron (existing) • Anthropic Claude for HTML generation (existing client)

**Spec:** `docs/superpowers/specs/2026-05-19-proposal-builder-design.md`

**Estimated time:** ~10 working days. Phases 0-2 (~4 days) are foundational; Phases 3-7 (~5 days) layer the surfaces; Phases 8-9 (~1 day) wire the lead-to-workspace handoff and ship.

---

## File structure (decomposition lock-in)

### New files

| Path | Responsibility |
|---|---|
| `packages/crm/drizzle/0049_proposals.sql` | Migration: `proposals` + `proposal_events` tables, `organizations.preview_mode` column |
| `packages/crm/src/db/schema/proposals.ts` | Drizzle schema for `proposals` table + `Proposal` type |
| `packages/crm/src/db/schema/proposal-events.ts` | Drizzle schema for `proposal_events` table + `ProposalEvent` type |
| `packages/crm/src/lib/proposals/signed-token.ts` | Generates URL-safe random tokens for public proposal links |
| `packages/crm/src/lib/proposals/status.ts` | `canTransition(from, to)` — validates lifecycle transitions |
| `packages/crm/src/lib/proposals/stripe-connect.ts` | Wrapper around Stripe SDK for Connect Express account creation + status sync |
| `packages/crm/src/lib/proposals/generate-html.ts` | Builds Claude prompt + calls Anthropic + returns proposal HTML |
| `packages/crm/src/lib/proposals/create.ts` | Orchestrator: soul extract → preview workspace → HTML generation → DB insert |
| `packages/crm/src/lib/proposals/checkout.ts` | Builds Stripe Checkout session params for Connect direct charge |
| `packages/crm/src/lib/proposals/activate-workspace.ts` | Flips workspace `preview_mode=false`, transfers ownership |
| `packages/crm/src/lib/proposals/notify-agency.ts` | "X just signed up at $Y/mo" email to agency operator |
| `packages/crm/src/lib/proposals/notify-prospect.ts` | Onboarding email with portal link to prospect |
| `packages/crm/src/lib/proposals/actions.ts` | Server actions: update / send / decline / save-template |
| `packages/crm/src/lib/proposals/load-by-token.ts` | Public-route helper — load proposal by signed_token + rate-limit |
| `packages/crm/src/app/api/v1/proposals/route.ts` | `POST` create proposal |
| `packages/crm/src/app/api/v1/proposals/[id]/send/route.ts` | `POST` send proposal email |
| `packages/crm/src/app/api/v1/proposals/connect/start/route.ts` | `POST` start Connect onboarding |
| `packages/crm/src/app/api/v1/proposals/connect/return/route.ts` | `GET` Stripe return URL → sync status |
| `packages/crm/src/app/(dashboard)/proposals/page.tsx` | List page with status pills |
| `packages/crm/src/app/(dashboard)/proposals/proposals-grid.tsx` | Client component for the list grid |
| `packages/crm/src/app/(dashboard)/proposals/new/page.tsx` | "Paste prospect URL, pick pricing tier, click Generate" |
| `packages/crm/src/app/(dashboard)/proposals/new/proposal-new-form.tsx` | Form client component |
| `packages/crm/src/app/(dashboard)/proposals/[id]/page.tsx` | Edit + send |
| `packages/crm/src/app/(dashboard)/proposals/[id]/proposal-editor.tsx` | Inline scope item + price editor |
| `packages/crm/src/app/(dashboard)/proposals/onboarding/page.tsx` | Stripe Connect onboarding |
| `packages/crm/src/app/(dashboard)/proposals/template/page.tsx` | Per-agency template editor |
| `packages/crm/src/app/(dashboard)/proposals/template/template-editor.tsx` | Editor + live preview client component |
| `packages/crm/src/app/p/[token]/page.tsx` | Public proposal view |
| `packages/crm/src/app/p/[token]/accept/route.ts` | `POST` accept → Stripe Checkout redirect |
| `packages/crm/src/app/p/[token]/decline/route.ts` | `POST` decline + optional reason |
| `packages/crm/src/app/p/[token]/success/page.tsx` | Post-Checkout success |
| `packages/crm/src/app/p/[token]/cancel/page.tsx` | Post-Checkout abandoned |
| `packages/crm/src/components/proposals/booking-iframe.tsx` | Live booking-page iframe with chrome |
| `packages/crm/src/components/proposals/screenshot-grid.tsx` | CRM / chatbot / forms / automation thumbnails |
| `packages/crm/src/components/proposals/proposal-status-pill.tsx` | Pill with token colors for each status |
| `docs/architecture/proposal-builder.md` | Rollout + ops reference |

### Files modified

| Path | Change |
|---|---|
| `packages/crm/src/db/schema/agency-profile.ts` | Add `proposalTemplate?: AgencyProposalTemplate` field |
| `packages/crm/src/db/schema/organizations.ts` | Add `previewMode: boolean` column (matches migration) |
| `packages/crm/src/db/schema/index.ts` | Export `./proposals` and `./proposal-events` |
| `packages/crm/src/app/api/webhooks/stripe/connect/route.ts` | Handle `checkout.session.completed` for proposal subscriptions |
| `packages/crm/src/app/(dashboard)/clients/new/page.tsx` | Accept `?source=proposal` query param to skip operator landing chrome |
| `packages/crm/src/lib/workspace/create-full.ts` | Accept `preview_mode: boolean` input to skip billing / agent-runs gates |
| `packages/crm/.env.example` | Add `STRIPE_CONNECT_CLIENT_ID` + `STRIPE_CONNECT_WEBHOOK_SECRET` |

### Test files

| Path | Subject |
|---|---|
| `packages/crm/tests/unit/proposals/signed-token.spec.ts` | Token generation + uniqueness |
| `packages/crm/tests/unit/proposals/status.spec.ts` | Lifecycle transitions |
| `packages/crm/tests/unit/proposals/stripe-connect.spec.ts` | Mocked Stripe SDK |
| `packages/crm/tests/unit/proposals/generate-html.spec.ts` | Prompt construction + HTML structure |
| `packages/crm/tests/unit/proposals/create.spec.ts` | Orchestrator with mocked deps |
| `packages/crm/tests/unit/proposals/checkout.spec.ts` | Session param builder |
| `packages/crm/tests/unit/proposals/activate-workspace.spec.ts` | preview→active flip |
| `packages/crm/tests/unit/proposals/load-by-token.spec.ts` | Token validation + rate limiting |
| `packages/crm/tests/integration/proposal-flow.spec.ts` | End-to-end with mocked Stripe |

---

## Phase 0 — Schema + types (~1 day)

The whole feature rides on `proposals` + `proposal_events` + a `preview_mode` flag on `organizations`. Get the data model right; everything else composes from it.

### Task 0.1: Drizzle migration — proposals + proposal_events tables

**Files:**
- Create: `packages/crm/drizzle/0049_proposals.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- packages/crm/drizzle/0049_proposals.sql
-- 2026-05-19 — Proposal Builder. Two new tables + organizations.preview_mode
-- flag. Spec: 2026-05-19-proposal-builder-design.md.

CREATE TABLE IF NOT EXISTS "proposals" (
  "id"                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "agency_org_id"               UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "prospect_url"                TEXT NOT NULL,
  "prospect_name"               TEXT NOT NULL,
  "prospect_email"              TEXT NOT NULL,
  "prospect_first_name"         TEXT,
  "prospect_phone"              TEXT,
  "preview_workspace_id"        UUID REFERENCES "organizations"("id") ON DELETE SET NULL,
  "pricing_tier"                TEXT NOT NULL,
  "monthly_price_cents"         INTEGER NOT NULL,
  "generated_html"              TEXT NOT NULL,
  "scope_items"                 JSONB NOT NULL DEFAULT '[]'::jsonb,
  "status"                      TEXT NOT NULL DEFAULT 'draft',
  "signed_token"                TEXT NOT NULL UNIQUE,
  "sent_at"                     TIMESTAMPTZ,
  "first_viewed_at"             TIMESTAMPTZ,
  "accepted_at"                 TIMESTAMPTZ,
  "declined_at"                 TIMESTAMPTZ,
  "declined_reason"             TEXT,
  "expires_at"                  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  "stripe_checkout_session_id"  TEXT,
  "stripe_subscription_id"      TEXT,
  "stripe_customer_id"          TEXT,
  "created_at"                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_by_user_id"          UUID REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "proposals_agency_status_idx"
  ON "proposals"("agency_org_id", "status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "proposals_signed_token_idx"
  ON "proposals"("signed_token");
CREATE INDEX IF NOT EXISTS "proposals_checkout_session_idx"
  ON "proposals"("stripe_checkout_session_id")
  WHERE "stripe_checkout_session_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "proposal_events" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "proposal_id"  UUID NOT NULL REFERENCES "proposals"("id") ON DELETE CASCADE,
  "event_type"   TEXT NOT NULL,
  "metadata"     JSONB,
  "ip_address"   TEXT,
  "user_agent"   TEXT,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "proposal_events_proposal_idx"
  ON "proposal_events"("proposal_id", "created_at" DESC);

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "preview_mode" BOOLEAN NOT NULL DEFAULT FALSE;
```

- [ ] **Step 2: Run migration locally**

Run: `cd packages/crm && pnpm db:migrate`
Expected: prints `0049_proposals.sql applied` (and `__drizzle_migrations` row inserted via SHA-256 hash tracker, matching pattern from `migration-safety.ts`).

- [ ] **Step 3: Verify no-op on re-run**

Run: `pnpm db:migrate`
Expected: skips 0049 (hash already in `__drizzle_migrations`); zero SQL executed.

- [ ] **Step 4: Commit**

```bash
git add packages/crm/drizzle/0049_proposals.sql
git commit -m "feat(proposals): migration 0049 — proposals + proposal_events + preview_mode

Adds the data foundation for Proposal Builder. proposals stores one row
per agency-pitched proposal with status lifecycle (draft → sent → viewed
→ accepted/declined/expired) + Stripe Checkout integration columns.
proposal_events is the append-only audit log. organizations gains a
preview_mode flag so workspaces provisioned during proposal creation
can be gated from billing / agent runs until acceptance flips the flag.

Spec: docs/superpowers/specs/2026-05-19-proposal-builder-design.md"
```

### Task 0.2: Drizzle schema — proposals table

**Files:**
- Create: `packages/crm/src/db/schema/proposals.ts`
- Modify: `packages/crm/src/db/schema/index.ts`

- [ ] **Step 1: Write the schema**

```typescript
// packages/crm/src/db/schema/proposals.ts
// 2026-05-19 — Proposal Builder. Drizzle schema mirroring migration 0049.
// Spec: 2026-05-19-proposal-builder-design.md.

import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

export type ProposalStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "accepted"
  | "declined"
  | "expired";

export type ProposalPricingTier = "starter" | "growth" | "pro" | "custom";

export type ProposalScopeItem = {
  label: string;
  description?: string;
};

export const proposals = pgTable(
  "proposals",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    agencyOrgId: uuid("agency_org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    prospectUrl: text("prospect_url").notNull(),
    prospectName: text("prospect_name").notNull(),
    prospectEmail: text("prospect_email").notNull(),
    prospectFirstName: text("prospect_first_name"),
    prospectPhone: text("prospect_phone"),
    previewWorkspaceId: uuid("preview_workspace_id").references(
      () => organizations.id,
      { onDelete: "set null" }
    ),
    pricingTier: text("pricing_tier").$type<ProposalPricingTier>().notNull(),
    monthlyPriceCents: integer("monthly_price_cents").notNull(),
    generatedHtml: text("generated_html").notNull(),
    scopeItems: jsonb("scope_items")
      .$type<ProposalScopeItem[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: text("status").$type<ProposalStatus>().notNull().default("draft"),
    signedToken: text("signed_token").notNull().unique(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    firstViewedAt: timestamp("first_viewed_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    declinedAt: timestamp("declined_at", { withTimezone: true }),
    declinedReason: text("declined_reason"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripeCustomerId: text("stripe_customer_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("proposals_agency_status_idx").on(
      table.agencyOrgId,
      table.status,
      table.createdAt,
    ),
    index("proposals_signed_token_idx").on(table.signedToken),
  ],
);

export type Proposal = typeof proposals.$inferSelect;
export type ProposalInsert = typeof proposals.$inferInsert;
```

- [ ] **Step 2: Wire the schema export**

Edit `packages/crm/src/db/schema/index.ts`, add at the bottom (after the agents export at line 100):

```typescript
// 2026-05-19 — Proposal Builder.
export * from "./proposals";
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (the new types are exported but not yet imported anywhere else, so no breakage).

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/db/schema/proposals.ts packages/crm/src/db/schema/index.ts
git commit -m "feat(proposals): drizzle schema for proposals table

Mirrors migration 0049. Status + pricingTier are exported as union
types so consumers get exhaustive-switch safety. scopeItems is JSONB
with a typed shape so the editor UI can rely on labeled inputs."
```

### Task 0.3: Drizzle schema — proposal_events table

**Files:**
- Create: `packages/crm/src/db/schema/proposal-events.ts`
- Modify: `packages/crm/src/db/schema/index.ts`

- [ ] **Step 1: Write the schema**

```typescript
// packages/crm/src/db/schema/proposal-events.ts
// 2026-05-19 — Proposal Builder audit log. Append-only timeline of every
// state transition + view + checkout interaction. Spec: 2026-05-19-proposal-builder-design.md.

import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { proposals } from "./proposals";

export type ProposalEventType =
  | "created"
  | "sent"
  | "viewed"
  | "accepted"
  | "declined"
  | "checkout_started"
  | "checkout_success"
  | "checkout_canceled"
  | "workspace_activated"
  | "expired";

export const proposalEvents = pgTable(
  "proposal_events",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    eventType: text("event_type").$type<ProposalEventType>().notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("proposal_events_proposal_idx").on(table.proposalId, table.createdAt)],
);

export type ProposalEvent = typeof proposalEvents.$inferSelect;
export type ProposalEventInsert = typeof proposalEvents.$inferInsert;
```

- [ ] **Step 2: Wire the export**

Edit `packages/crm/src/db/schema/index.ts`, append immediately after the `./proposals` export:

```typescript
export * from "./proposal-events";
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/db/schema/proposal-events.ts packages/crm/src/db/schema/index.ts
git commit -m "feat(proposals): drizzle schema for proposal_events audit log"
```

### Task 0.4: Extend AgencyProfile with proposalTemplate

**Files:**
- Modify: `packages/crm/src/db/schema/agency-profile.ts`

- [ ] **Step 1: Add the proposalTemplate field**

Replace the current AgencyProfile type at `packages/crm/src/db/schema/agency-profile.ts` with:

```typescript
// packages/crm/src/db/schema/agency-profile.ts
// Shape of the users.agency_profile JSONB column added in 0045_users_agency_profile.sql.
// Spec: 2026-05-16-seldonframe-web-onboarding-pivot-design.md §"Schema migration".
//
// 2026-05-19 — extended for Proposal Builder. proposalTemplate carries the
// per-agency editable copy for the proposal email + page. Spec:
// 2026-05-19-proposal-builder-design.md §"Per-agency template editor".

export type AgencyProposalTemplate = {
  subject: string;
  introCopy: string;
  scopeCopy: string;
  timelineCopy: string;
  termsCopy: string;
};

export type AgencyProfile = {
  name?: string;
  logo_url?: string;
  brand_color?: string;
  website_url?: string;
  proposalTemplate?: AgencyProposalTemplate;
};
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/db/schema/agency-profile.ts
git commit -m "feat(proposals): add proposalTemplate to AgencyProfile JSONB

Per-agency editable copy lives on users.agency_profile.proposalTemplate
so each agency can tune subject/intro/scope/timeline/terms. Field is
optional — defaults ship with the platform if operator hasn't edited."
```

### Task 0.5: Mirror preview_mode on Drizzle organizations schema

**Files:**
- Modify: `packages/crm/src/db/schema/organizations.ts`

- [ ] **Step 1: Add the previewMode column**

In `packages/crm/src/db/schema/organizations.ts`, add `previewMode` immediately after the existing `testMode` column (around line 97):

```typescript
// 2026-05-19 — Proposal Builder. When true, this workspace was
// provisioned as part of a proposal pitch and is gated from billing
// + agent runs until the prospect accepts and the checkout webhook
// flips this back to false. Default false so all existing workspaces
// are unaffected. Set/unset via lib/proposals/activate-workspace.ts.
previewMode: boolean("preview_mode").notNull().default(false),
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/db/schema/organizations.ts
git commit -m "feat(proposals): mirror organizations.preview_mode in drizzle schema"
```

### Task 0.6: Signed token helper (TDD)

**Files:**
- Create: `packages/crm/src/lib/proposals/signed-token.ts`
- Test: `packages/crm/tests/unit/proposals/signed-token.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/crm/tests/unit/proposals/signed-token.spec.ts
import { describe, it, expect } from "vitest";
import { generateProposalToken } from "@/lib/proposals/signed-token";

describe("generateProposalToken", () => {
  it("returns a URL-safe string", () => {
    const token = generateProposalToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("returns at least 32 characters of entropy", () => {
    const token = generateProposalToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
  });

  it("returns a different token on each call", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateProposalToken()));
    expect(tokens.size).toBe(100);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit tests/unit/proposals/signed-token.spec.ts`
Expected: FAIL with "Cannot find module '@/lib/proposals/signed-token'".

- [ ] **Step 3: Write the minimal implementation**

```typescript
// packages/crm/src/lib/proposals/signed-token.ts
// 2026-05-19 — Proposal Builder. Generates URL-safe tokens for public
// /p/[token] routes. Uses crypto.randomBytes (32 bytes → ~43 char base64url
// string). Tokens are stored in proposals.signed_token UNIQUE. Spec:
// 2026-05-19-proposal-builder-design.md §"Public proposal URL".

import { randomBytes } from "node:crypto";

export function generateProposalToken(): string {
  return randomBytes(32).toString("base64url");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit tests/unit/proposals/signed-token.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/proposals/signed-token.ts packages/crm/tests/unit/proposals/signed-token.spec.ts
git commit -m "feat(proposals): URL-safe signed-token generator with TDD coverage"
```

### Task 0.7: Status transition validator (TDD)

**Files:**
- Create: `packages/crm/src/lib/proposals/status.ts`
- Test: `packages/crm/tests/unit/proposals/status.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/crm/tests/unit/proposals/status.spec.ts
import { describe, it, expect } from "vitest";
import { canTransition, assertTransition } from "@/lib/proposals/status";

describe("canTransition", () => {
  it("allows draft → sent", () => {
    expect(canTransition("draft", "sent")).toBe(true);
  });

  it("allows sent → viewed", () => {
    expect(canTransition("sent", "viewed")).toBe(true);
  });

  it("allows viewed → accepted", () => {
    expect(canTransition("viewed", "accepted")).toBe(true);
  });

  it("allows viewed → declined", () => {
    expect(canTransition("viewed", "declined")).toBe(true);
  });

  it("allows sent → expired", () => {
    expect(canTransition("sent", "expired")).toBe(true);
  });

  it("forbids draft → accepted (must be sent first)", () => {
    expect(canTransition("draft", "accepted")).toBe(false);
  });

  it("forbids accepted → declined (terminal)", () => {
    expect(canTransition("accepted", "declined")).toBe(false);
  });

  it("forbids same-state transition", () => {
    expect(canTransition("sent", "sent")).toBe(false);
  });
});

describe("assertTransition", () => {
  it("throws on invalid transition", () => {
    expect(() => assertTransition("accepted", "declined")).toThrow(
      "Invalid proposal status transition: accepted → declined",
    );
  });

  it("does not throw on valid transition", () => {
    expect(() => assertTransition("draft", "sent")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit tests/unit/proposals/status.spec.ts`
Expected: FAIL with "Cannot find module '@/lib/proposals/status'".

- [ ] **Step 3: Write the minimal implementation**

```typescript
// packages/crm/src/lib/proposals/status.ts
// 2026-05-19 — Proposal Builder lifecycle. Pinned transitions so a row
// can't accidentally regress (e.g., declined → sent). Spec:
// 2026-05-19-proposal-builder-design.md §"Lifecycle".

import type { ProposalStatus } from "@/db/schema/proposals";

const ALLOWED: Record<ProposalStatus, readonly ProposalStatus[]> = {
  draft: ["sent"],
  sent: ["viewed", "accepted", "declined", "expired"],
  viewed: ["accepted", "declined", "expired"],
  accepted: [],
  declined: [],
  expired: [],
};

export function canTransition(from: ProposalStatus, to: ProposalStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: ProposalStatus, to: ProposalStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid proposal status transition: ${from} → ${to}`);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit tests/unit/proposals/status.spec.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/proposals/status.ts packages/crm/tests/unit/proposals/status.spec.ts
git commit -m "feat(proposals): lifecycle transition validator with TDD coverage

Pins the proposals.status state machine so accepted/declined/expired
are terminal. Both canTransition (boolean check) and assertTransition
(throws) are exported — callers pick based on whether they have a
fallback path."
```

---

## Phase 1 — Stripe Connect Express onboarding (~1.5 days)

The agency must connect a Stripe account before they can send any proposal. We reuse the existing `stripe_connections` table (keyed by `org_id`) — the agency's primary org gets a row when they onboard.

### Task 1.1: Env var documentation

**Files:**
- Modify: `packages/crm/.env.example`

- [ ] **Step 1: Add the env vars**

Append to `packages/crm/.env.example`:

```bash
# 2026-05-19 — Proposal Builder
# Stripe Connect Express client ID (acct_xxx from Stripe Dashboard).
# Required for /api/v1/proposals/connect/start to create agency accounts.
STRIPE_CONNECT_CLIENT_ID=

# Webhook signing secret for Stripe Connect events. Distinct from the
# platform webhook secret. The same /api/webhooks/stripe/connect endpoint
# handles both Connect billing and proposal subscriptions.
STRIPE_CONNECT_WEBHOOK_SECRET=
```

- [ ] **Step 2: Commit**

```bash
git add packages/crm/.env.example
git commit -m "docs(proposals): document Stripe Connect env vars"
```

### Task 1.2: Stripe Connect SDK wrapper (TDD)

**Files:**
- Create: `packages/crm/src/lib/proposals/stripe-connect.ts`
- Test: `packages/crm/tests/unit/proposals/stripe-connect.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/crm/tests/unit/proposals/stripe-connect.spec.ts
import { describe, it, expect, vi } from "vitest";
import { buildConnectAccountParams, buildAccountLinkParams } from "@/lib/proposals/stripe-connect";

describe("buildConnectAccountParams", () => {
  it("returns Express type with US default", () => {
    const params = buildConnectAccountParams({
      agencyName: "Max Agency",
      agencyEmail: "max@example.com",
    });
    expect(params.type).toBe("express");
    expect(params.country).toBe("US");
    expect(params.email).toBe("max@example.com");
    expect(params.business_profile?.name).toBe("Max Agency");
    expect(params.capabilities?.card_payments?.requested).toBe(true);
    expect(params.capabilities?.transfers?.requested).toBe(true);
  });

  it("propagates country override", () => {
    const params = buildConnectAccountParams({
      agencyName: "Max Agency",
      agencyEmail: "max@example.com",
      country: "CA",
    });
    expect(params.country).toBe("CA");
  });
});

describe("buildAccountLinkParams", () => {
  it("sets return_url to the proposals onboarding return route", () => {
    const params = buildAccountLinkParams({
      stripeAccountId: "acct_123",
      baseUrl: "https://app.seldonframe.com",
    });
    expect(params.account).toBe("acct_123");
    expect(params.type).toBe("account_onboarding");
    expect(params.return_url).toBe(
      "https://app.seldonframe.com/api/v1/proposals/connect/return?account_id=acct_123",
    );
    expect(params.refresh_url).toBe(
      "https://app.seldonframe.com/proposals/onboarding?retry=1",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit tests/unit/proposals/stripe-connect.spec.ts`
Expected: FAIL with "Cannot find module '@/lib/proposals/stripe-connect'".

- [ ] **Step 3: Write the implementation**

```typescript
// packages/crm/src/lib/proposals/stripe-connect.ts
// 2026-05-19 — Proposal Builder. Pure functions that build Stripe API
// params so the route handlers can be tested without spinning up the
// SDK. The actual stripe.accounts.create / stripe.accountLinks.create
// calls live in the route handlers. Spec: §"Stripe Connect Express".

import type Stripe from "stripe";

export type BuildConnectAccountParamsInput = {
  agencyName: string;
  agencyEmail: string;
  country?: string;
};

export function buildConnectAccountParams(
  input: BuildConnectAccountParamsInput,
): Stripe.AccountCreateParams {
  return {
    type: "express",
    country: input.country ?? "US",
    email: input.agencyEmail,
    business_profile: { name: input.agencyName },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  };
}

export type BuildAccountLinkParamsInput = {
  stripeAccountId: string;
  baseUrl: string;
};

export function buildAccountLinkParams(
  input: BuildAccountLinkParamsInput,
): Stripe.AccountLinkCreateParams {
  return {
    account: input.stripeAccountId,
    type: "account_onboarding",
    return_url: `${input.baseUrl}/api/v1/proposals/connect/return?account_id=${input.stripeAccountId}`,
    refresh_url: `${input.baseUrl}/proposals/onboarding?retry=1`,
  };
}

export function getStripeClient(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const StripeCtor = require("stripe") as typeof Stripe;
  return new StripeCtor(secretKey, { apiVersion: "2025-08-27.basil" });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit tests/unit/proposals/stripe-connect.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/proposals/stripe-connect.ts packages/crm/tests/unit/proposals/stripe-connect.spec.ts
git commit -m "feat(proposals): Stripe Connect SDK param builders + TDD coverage

Pure functions that build the Stripe API params so route handlers stay
thin. getStripeClient() mirrors the existing pattern in the platform
webhook handler. Connect Express defaults to US; ?country=XX override
in /proposals/onboarding wires the param through."
```

### Task 1.3: Start endpoint (POST /api/v1/proposals/connect/start)

**Files:**
- Create: `packages/crm/src/app/api/v1/proposals/connect/start/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// packages/crm/src/app/api/v1/proposals/connect/start/route.ts
// 2026-05-19 — Proposal Builder. Creates a Stripe Connect Express
// account for the operator's agency, persists the acct_xxx into
// stripe_connections, and returns the onboarding URL the client
// redirects to. Spec: §"Stripe Connect Express onboarding".

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { stripeConnections, users } from "@/db/schema";
import {
  buildAccountLinkParams,
  buildConnectAccountParams,
  getStripeClient,
} from "@/lib/proposals/stripe-connect";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 500 });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.seldonframe.com";

  // Create the Connect Express account on Stripe.
  const account = await stripe.accounts.create(
    buildConnectAccountParams({
      agencyName: user.agencyProfile.name ?? user.name,
      agencyEmail: user.email,
    }),
  );

  // Persist the connection. Reuse the existing stripe_connections table —
  // the agency's PRIMARY org row gets the connection. Set isActive=false
  // until onboarding completes (we sync that on the return endpoint).
  await db
    .insert(stripeConnections)
    .values({
      orgId: user.orgId,
      stripeAccountId: account.id,
      isActive: false,
    })
    .onConflictDoUpdate({
      target: [stripeConnections.orgId],
      set: { stripeAccountId: account.id, isActive: false, updatedAt: new Date() },
    });

  // Build the onboarding link.
  const link = await stripe.accountLinks.create(
    buildAccountLinkParams({ stripeAccountId: account.id, baseUrl }),
  );

  return NextResponse.json({ url: link.url, accountId: account.id });
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS. If the `onConflictDoUpdate` target fails because `stripe_connections.org_id` has no UNIQUE constraint, the route still works in practice (we filter to `isActive=true`); but per spec hygiene, prefer the simpler pattern: SELECT existing row, UPDATE or INSERT. If linter complains, swap to:

```typescript
const existing = await db
  .select({ id: stripeConnections.id })
  .from(stripeConnections)
  .where(eq(stripeConnections.orgId, user.orgId))
  .limit(1);
if (existing.length > 0) {
  await db
    .update(stripeConnections)
    .set({ stripeAccountId: account.id, isActive: false, updatedAt: new Date() })
    .where(eq(stripeConnections.id, existing[0].id));
} else {
  await db.insert(stripeConnections).values({
    orgId: user.orgId,
    stripeAccountId: account.id,
    isActive: false,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/app/api/v1/proposals/connect/start/route.ts
git commit -m "feat(proposals): POST /api/v1/proposals/connect/start

Creates the agency's Stripe Connect Express account, persists the
acct_xxx into stripe_connections (reusing the existing table — keyed
by agency's primary org_id), and returns the onboarding URL the
client redirects to. isActive=false until /return syncs status."
```

### Task 1.4: Return endpoint (GET /api/v1/proposals/connect/return)

**Files:**
- Create: `packages/crm/src/app/api/v1/proposals/connect/return/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// packages/crm/src/app/api/v1/proposals/connect/return/route.ts
// 2026-05-19 — Proposal Builder. Stripe redirects the operator here
// after onboarding completes (success OR failure — we infer from the
// account's chargesEnabled/payoutsEnabled). Spec: §"Stripe Connect
// Express onboarding".

import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { stripeConnections } from "@/db/schema";
import { getStripeClient } from "@/lib/proposals/stripe-connect";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/proposals/onboarding");
  }

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("account_id");
  if (!accountId) {
    return NextResponse.json({ error: "missing_account_id" }, { status: 400 });
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 500 });
  }

  const account = await stripe.accounts.retrieve(accountId);
  const chargesEnabled = account.charges_enabled === true;
  const payoutsEnabled = account.payouts_enabled === true;

  // Sync status on the existing stripe_connections row.
  await db
    .update(stripeConnections)
    .set({
      isActive: chargesEnabled,
      connectedAt: chargesEnabled ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(stripeConnections.stripeAccountId, accountId),
        eq(stripeConnections.orgId, session.user.orgId!),
      ),
    );

  // Redirect back to the dashboard with status.
  const status = chargesEnabled ? "ready" : payoutsEnabled ? "pending" : "incomplete";
  redirect(`/proposals/onboarding?status=${status}`);
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS. If `session.user.orgId` is not on the session type, check auth.ts — most likely it lives there (the existing /clients page reads from it). If not, do a separate SELECT `users.org_id WHERE id = session.user.id` and use that.

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/app/api/v1/proposals/connect/return/route.ts
git commit -m "feat(proposals): GET /api/v1/proposals/connect/return

Stripe-hosted onboarding redirects here. We retrieve the account, sync
chargesEnabled/payoutsEnabled into stripe_connections.isActive, and
redirect back to /proposals/onboarding with the status."
```

### Task 1.5: Onboarding page

**Files:**
- Create: `packages/crm/src/app/(dashboard)/proposals/onboarding/page.tsx`

- [ ] **Step 1: Write the page**

```typescript
// packages/crm/src/app/(dashboard)/proposals/onboarding/page.tsx
// 2026-05-19 — Proposal Builder. One-time agency setup. Renders the
// Stripe Connect status (not started / pending / ready) and a primary
// CTA that POSTs to /api/v1/proposals/connect/start. Spec: §"Stripe
// Connect Express onboarding".

import { redirect } from "next/navigation";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { stripeConnections, users } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { ConnectStartButton } from "./connect-start-button";

export const dynamic = "force-dynamic";

export default async function ProposalsOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/proposals/onboarding");
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user) redirect("/login");

  const [connection] = await db
    .select()
    .from(stripeConnections)
    .where(
      and(eq(stripeConnections.orgId, user.orgId), eq(stripeConnections.isActive, true)),
    )
    .limit(1);

  const params = await searchParams;
  const flashStatus = params.status;
  const connected = Boolean(connection);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Proposal Builder setup</h1>
        <p className="text-muted-foreground">
          Connect a Stripe account to send proposals. Prospects pay you directly — SeldonFrame
          takes 0%.
        </p>
      </header>

      <section className="rounded-2xl border border-border/70 bg-card/40 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Stripe Connect</h2>
            <p className="text-sm text-muted-foreground">
              {connected
                ? "Connected and ready to accept payments."
                : "Connect your Stripe account to start sending proposals."}
            </p>
          </div>
          {connected ? (
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700">
              Ready
            </span>
          ) : flashStatus === "pending" ? (
            <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700">
              Pending
            </span>
          ) : (
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              Not connected
            </span>
          )}
        </div>
        {!connected && <ConnectStartButton />}
      </section>

      {connected && (
        <section className="rounded-2xl border border-border/70 bg-card/40 p-6 space-y-3">
          <h2 className="text-xl font-semibold">You're ready to send proposals</h2>
          <p className="text-sm text-muted-foreground">
            Create your first proposal — we'll build a live workspace for the prospect, generate
            the proposal copy, and email it for them to accept.
          </p>
          <div className="flex gap-3">
            <Button asChild>
              <Link href="/proposals/new">Create proposal</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/proposals/template">Edit template</Link>
            </Button>
          </div>
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Write the client button component**

Create `packages/crm/src/app/(dashboard)/proposals/onboarding/connect-start-button.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ConnectStartButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/proposals/connect/start", { method: "POST" });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.error ?? `connect_start_failed_${response.status}`);
      }
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "connect_start_failed");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleClick} disabled={loading}>
        {loading ? "Opening Stripe..." : "Connect Stripe account"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/app/(dashboard)/proposals/onboarding/
git commit -m "feat(proposals): /proposals/onboarding page with Connect status"
```

---

## Phase 2 — Proposal creation (~1.5 days)

This is where the killer detail happens: a real workspace gets provisioned as part of proposal creation, so the prospect sees a live booking page in the proposal.

### Task 2.1: preview_mode plumbing through createFullWorkspace

**Files:**
- Modify: `packages/crm/src/lib/workspace/create-full.ts`

- [ ] **Step 1: Add preview_mode to the input contract**

Find the `CreateFullWorkspaceInput` interface in `packages/crm/src/lib/workspace/create-full.ts` (line ~50). Add at the bottom of the optional fields:

```typescript
  /** 2026-05-19 — Proposal Builder. When true, the workspace is created
   *  with organizations.preview_mode=true so it's gated from billing,
   *  agent runs, and quota enforcement until a proposal acceptance flips
   *  it to false. Default false. Spec: 2026-05-19-proposal-builder-design.md. */
  preview_mode?: boolean | null;
```

- [ ] **Step 2: Apply the flag to the orchestrator**

In the same file, find the `organizations` INSERT (search for `.insert(organizations)` or the call that creates the org row). Add `previewMode: input.preview_mode === true,` to the values object.

If `createAnonymousWorkspace` (which actually does the org insert) doesn't accept this flag, instead UPDATE the org row immediately after creation. Find where the function returns/uses `org.id` after the workspace is created, and add:

```typescript
if (input.preview_mode === true) {
  await db
    .update(organizations)
    .set({ previewMode: true })
    .where(eq(organizations.id, workspaceId));
}
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/lib/workspace/create-full.ts
git commit -m "feat(proposals): plumb preview_mode through createFullWorkspace

Adds optional preview_mode input; when true, the resulting workspace
is created with organizations.preview_mode=true so it's gated from
billing/agent-runs/quota until a proposal acceptance flips it back."
```

### Task 2.2: HTML prompt builder (TDD)

**Files:**
- Create: `packages/crm/src/lib/proposals/generate-html.ts`
- Test: `packages/crm/tests/unit/proposals/generate-html.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/crm/tests/unit/proposals/generate-html.spec.ts
import { describe, it, expect } from "vitest";
import { buildProposalPrompt } from "@/lib/proposals/generate-html";

describe("buildProposalPrompt", () => {
  const input = {
    agencyName: "Max Agency",
    agencyBrandColor: "#7c3aed",
    prospectName: "Roofs by Shiloh",
    prospectFirstName: "Shiloh",
    prospectServices: ["residential roofing", "storm damage"],
    monthlyPriceCents: 49700,
    template: {
      subject: "Booking system for {{prospectName}}",
      introCopy: "We help home-service businesses fill their calendar.",
      scopeCopy: "Booking page, CRM, AI chatbot, intake forms.",
      timelineCopy: "Live within 24 hours of acceptance.",
      termsCopy: "Month-to-month. Cancel anytime.",
    },
  };

  it("includes prospect name in the system instruction", () => {
    const prompt = buildProposalPrompt(input);
    expect(prompt).toContain("Roofs by Shiloh");
  });

  it("includes the agency template copy", () => {
    const prompt = buildProposalPrompt(input);
    expect(prompt).toContain("We help home-service businesses");
  });

  it("renders the price as USD", () => {
    const prompt = buildProposalPrompt(input);
    expect(prompt).toContain("$497");
  });

  it("substitutes prospect template variables", () => {
    const prompt = buildProposalPrompt(input);
    expect(prompt).toContain("Booking system for Roofs by Shiloh");
  });

  it("includes the brand color in the rendering instructions", () => {
    const prompt = buildProposalPrompt(input);
    expect(prompt).toContain("#7c3aed");
  });

  it("includes service list in personalization context", () => {
    const prompt = buildProposalPrompt(input);
    expect(prompt).toContain("residential roofing");
    expect(prompt).toContain("storm damage");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit tests/unit/proposals/generate-html.spec.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```typescript
// packages/crm/src/lib/proposals/generate-html.ts
// 2026-05-19 — Proposal Builder. Builds the Claude prompt that produces
// the proposal HTML body. Pure: takes agency + prospect context,
// returns a string. The actual Anthropic call lives in lib/proposals/create.ts
// so this stays test-friendly. Spec: §"Proposal creation".

import type { AgencyProposalTemplate } from "@/db/schema/agency-profile";

export type BuildProposalPromptInput = {
  agencyName: string;
  agencyBrandColor?: string;
  prospectName: string;
  prospectFirstName?: string | null;
  prospectServices: string[];
  monthlyPriceCents: number;
  template: AgencyProposalTemplate;
};

const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

function substitute(copy: string, vars: Record<string, string>): string {
  return copy.replace(VARIABLE_PATTERN, (_, key) => vars[key] ?? `{{${key}}}`);
}

function formatPriceUSD(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export function buildProposalPrompt(input: BuildProposalPromptInput): string {
  const vars: Record<string, string> = {
    prospectName: input.prospectName,
    prospectFirstName: input.prospectFirstName ?? input.prospectName,
    agencyName: input.agencyName,
    price: formatPriceUSD(input.monthlyPriceCents),
  };

  const subject = substitute(input.template.subject, vars);
  const intro = substitute(input.template.introCopy, vars);
  const scope = substitute(input.template.scopeCopy, vars);
  const timeline = substitute(input.template.timelineCopy, vars);
  const terms = substitute(input.template.termsCopy, vars);
  const brandColor = input.agencyBrandColor ?? "#0ea5e9";

  return [
    "You are writing a sales proposal HTML body for ${vars.agencyName}.",
    "",
    "Output requirements:",
    "1. Return HTML wrapped in a single <section> element. No <html>, <head>, or <body>.",
    "2. Use semantic tags (h1, h2, p, ul, li). No inline styles except brand color accents.",
    `3. Brand accent color: ${brandColor}. Use it on h1 and the price callout only.`,
    "4. Three sections: intro paragraph, what's included, timeline + terms.",
    "5. Output ONLY the <section>...</section> markup. No commentary.",
    "",
    "Context:",
    `- Prospect business name: ${input.prospectName}`,
    `- Prospect first name: ${vars.prospectFirstName}`,
    `- Services they offer: ${input.prospectServices.join(", ")}`,
    `- Monthly price: ${vars.price}`,
    "",
    "Agency-supplied copy you must use verbatim (or near-verbatim) for each section:",
    `Subject: ${subject}`,
    `Intro: ${intro}`,
    `What's included: ${scope}`,
    `Timeline: ${timeline}`,
    `Terms: ${terms}`,
    "",
    "Write the proposal now.",
  ].join("\n");
}

export const DEFAULT_PROPOSAL_TEMPLATE: AgencyProposalTemplate = {
  subject: "A booking system for {{prospectName}}",
  introCopy:
    "Hi {{prospectFirstName}} — we put together a working booking and CRM system for {{prospectName}}, ready to go live the moment you click Accept.",
  scopeCopy:
    "Branded booking page, intake form, AI chatbot, CRM with pipeline, automated SMS + email follow-ups. Hosted, monitored, and maintained.",
  timelineCopy:
    "Click Accept → your workspace activates within 60 seconds → we email you the admin link.",
  termsCopy:
    "Month-to-month. Cancel anytime from your Stripe receipt. We don't lock you in.",
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit tests/unit/proposals/generate-html.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/proposals/generate-html.ts packages/crm/tests/unit/proposals/generate-html.spec.ts
git commit -m "feat(proposals): Claude prompt builder for proposal HTML with TDD coverage

Pure function — no LLM calls. Substitutes {{prospectName}}, {{price}},
{{agencyName}} into the agency-supplied template. Ships a
DEFAULT_PROPOSAL_TEMPLATE so first-time operators get a sane default
without editing /proposals/template first."
```

### Task 2.3: Proposal creation orchestrator (TDD)

**Files:**
- Create: `packages/crm/src/lib/proposals/create.ts`
- Test: `packages/crm/tests/unit/proposals/create.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/crm/tests/unit/proposals/create.spec.ts
import { describe, it, expect, vi } from "vitest";
import {
  resolvePricing,
  PROPOSAL_TIER_PRICES,
} from "@/lib/proposals/create";

describe("resolvePricing", () => {
  it("returns Starter cents for tier=starter", () => {
    expect(resolvePricing({ tier: "starter" })).toEqual({
      tier: "starter",
      monthlyPriceCents: 29700,
    });
  });

  it("returns Growth cents for tier=growth", () => {
    expect(resolvePricing({ tier: "growth" })).toEqual({
      tier: "growth",
      monthlyPriceCents: 49700,
    });
  });

  it("returns Pro cents for tier=pro", () => {
    expect(resolvePricing({ tier: "pro" })).toEqual({
      tier: "pro",
      monthlyPriceCents: 99700,
    });
  });

  it("returns custom cents when provided", () => {
    expect(resolvePricing({ tier: "custom", customCents: 75000 })).toEqual({
      tier: "custom",
      monthlyPriceCents: 75000,
    });
  });

  it("throws on tier=custom without customCents", () => {
    expect(() => resolvePricing({ tier: "custom" })).toThrow(
      "custom_pricing_requires_amount",
    );
  });

  it("throws on customCents below $50/mo floor", () => {
    expect(() => resolvePricing({ tier: "custom", customCents: 4999 })).toThrow(
      "custom_price_below_minimum",
    );
  });
});

describe("PROPOSAL_TIER_PRICES", () => {
  it("exposes the three preset prices", () => {
    expect(PROPOSAL_TIER_PRICES).toEqual({
      starter: 29700,
      growth: 49700,
      pro: 99700,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit tests/unit/proposals/create.spec.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the pricing helpers**

```typescript
// packages/crm/src/lib/proposals/create.ts
// 2026-05-19 — Proposal Builder orchestrator. Resolves pricing, calls
// soul extraction (existing), provisions the preview workspace (existing
// createFullWorkspace with preview_mode=true), generates HTML via
// Anthropic, and inserts the proposals row. Spec: §"Proposal creation".

import { db } from "@/db";
import {
  proposals,
  proposalEvents,
  type Proposal,
  type ProposalPricingTier,
  type ProposalScopeItem,
} from "@/db/schema";
import { generateProposalToken } from "./signed-token";
import {
  DEFAULT_PROPOSAL_TEMPLATE,
  buildProposalPrompt,
} from "./generate-html";
import type { AgencyProposalTemplate } from "@/db/schema/agency-profile";

export const PROPOSAL_TIER_PRICES: Record<Exclude<ProposalPricingTier, "custom">, number> = {
  starter: 29700,
  growth: 49700,
  pro: 99700,
};

export type ResolvePricingInput =
  | { tier: "starter" | "growth" | "pro" }
  | { tier: "custom"; customCents?: number };

export function resolvePricing(input: ResolvePricingInput): {
  tier: ProposalPricingTier;
  monthlyPriceCents: number;
} {
  if (input.tier === "custom") {
    if (typeof input.customCents !== "number") {
      throw new Error("custom_pricing_requires_amount");
    }
    if (input.customCents < 5000) {
      throw new Error("custom_price_below_minimum");
    }
    return { tier: "custom", monthlyPriceCents: input.customCents };
  }
  return { tier: input.tier, monthlyPriceCents: PROPOSAL_TIER_PRICES[input.tier] };
}

export type CreateProposalInput = {
  agencyOrgId: string;
  createdByUserId: string;
  prospectUrl: string;
  prospectName: string;
  prospectEmail: string;
  prospectFirstName?: string | null;
  prospectPhone?: string | null;
  prospectServices: string[];
  agencyName: string;
  agencyBrandColor?: string;
  template?: AgencyProposalTemplate;
  pricing: ResolvePricingInput;
  previewWorkspaceId: string | null;
  generateHtml: (prompt: string) => Promise<string>;
};

export async function createProposal(
  input: CreateProposalInput,
): Promise<Proposal> {
  const pricing = resolvePricing(input.pricing);
  const template = input.template ?? DEFAULT_PROPOSAL_TEMPLATE;

  const prompt = buildProposalPrompt({
    agencyName: input.agencyName,
    agencyBrandColor: input.agencyBrandColor,
    prospectName: input.prospectName,
    prospectFirstName: input.prospectFirstName,
    prospectServices: input.prospectServices,
    monthlyPriceCents: pricing.monthlyPriceCents,
    template,
  });

  const html = await input.generateHtml(prompt);
  const token = generateProposalToken();

  const scopeItems: ProposalScopeItem[] = template.scopeCopy
    .split(",")
    .map((item) => ({ label: item.trim() }))
    .filter((item) => item.label.length > 0);

  const [created] = await db
    .insert(proposals)
    .values({
      agencyOrgId: input.agencyOrgId,
      createdByUserId: input.createdByUserId,
      prospectUrl: input.prospectUrl,
      prospectName: input.prospectName,
      prospectEmail: input.prospectEmail,
      prospectFirstName: input.prospectFirstName ?? null,
      prospectPhone: input.prospectPhone ?? null,
      previewWorkspaceId: input.previewWorkspaceId,
      pricingTier: pricing.tier,
      monthlyPriceCents: pricing.monthlyPriceCents,
      generatedHtml: html,
      scopeItems,
      signedToken: token,
      status: "draft",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
    .returning();

  await db.insert(proposalEvents).values({
    proposalId: created.id,
    eventType: "created",
    metadata: { pricingTier: pricing.tier, monthlyPriceCents: pricing.monthlyPriceCents },
  });

  return created;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit tests/unit/proposals/create.spec.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/proposals/create.ts packages/crm/tests/unit/proposals/create.spec.ts
git commit -m "feat(proposals): createProposal orchestrator + pricing resolver

resolvePricing covers the 3 presets ($297/$497/$997) + custom override
with a $50/mo floor. createProposal takes a generateHtml callback so
the LLM call is injectable (real Anthropic in production, mock in
tests). Logs 'created' event on every insert."
```

### Task 2.4: POST /api/v1/proposals route

**Files:**
- Create: `packages/crm/src/app/api/v1/proposals/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// packages/crm/src/app/api/v1/proposals/route.ts
// 2026-05-19 — Proposal Builder. POST creates a new proposal: extracts
// the prospect's soul from the URL, provisions a preview workspace,
// generates the HTML, and inserts the proposals row. GET lists the
// authed user's agency proposals. Spec: §"Proposal creation".

import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { proposals, users } from "@/db/schema";
import { createProposal } from "@/lib/proposals/create";
import { extractSoulFromUrl } from "@/lib/soul/extract-from-url";
import { createFullWorkspace } from "@/lib/workspace/create-full";
import { callClaude } from "@/lib/llm/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [user] = await db
    .select({ orgId: users.orgId })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const rows = await db
    .select()
    .from(proposals)
    .where(eq(proposals.agencyOrgId, user.orgId))
    .orderBy(desc(proposals.createdAt))
    .limit(100);

  return NextResponse.json({ proposals: rows });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const {
    prospect_url,
    prospect_email,
    pricing_tier,
    custom_cents,
  } = body as {
    prospect_url?: string;
    prospect_email?: string;
    pricing_tier?: string;
    custom_cents?: number;
  };

  if (!prospect_url || !prospect_email || !pricing_tier) {
    return NextResponse.json(
      { error: "missing_required_fields" },
      { status: 400 },
    );
  }

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!user) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  // 1. Extract prospect soul.
  const soul = await extractSoulFromUrl(prospect_url);

  // 2. Provision preview workspace.
  const workspace = await createFullWorkspace({
    business_name: soul.business.name,
    city: soul.business.city ?? "",
    state: soul.business.state ?? "",
    phone: soul.business.phone ?? "",
    services: soul.business.services ?? [],
    business_description: soul.business.description ?? "",
    email: prospect_email,
    preview_mode: true,
  });

  // 3. Create proposal row.
  const proposal = await createProposal({
    agencyOrgId: user.orgId,
    createdByUserId: user.id,
    prospectUrl: prospect_url,
    prospectName: soul.business.name,
    prospectEmail: prospect_email,
    prospectFirstName: soul.business.contact_first_name ?? null,
    prospectServices: soul.business.services ?? [],
    agencyName: user.agencyProfile.name ?? user.name,
    agencyBrandColor: user.agencyProfile.brand_color,
    template: user.agencyProfile.proposalTemplate,
    pricing:
      pricing_tier === "custom"
        ? { tier: "custom", customCents: custom_cents }
        : { tier: pricing_tier as "starter" | "growth" | "pro" },
    previewWorkspaceId: workspace.org.id,
    generateHtml: async (prompt) => {
      const response = await callClaude({
        model: "claude-sonnet-4-5",
        system: "You generate HTML sales proposal bodies. Output ONLY HTML.",
        prompt,
        maxTokens: 2000,
      });
      return response.text.trim();
    },
  });

  return NextResponse.json({ proposal });
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS — if `callClaude` doesn't exist at `@/lib/llm/anthropic`, find the canonical import in the existing codebase. The synthesis path uses `anthropic` SDK directly; grep for `@anthropic-ai/sdk` to find the existing wrapper. If there's no shared wrapper, inline the SDK call:

```typescript
import Anthropic from "@anthropic-ai/sdk";
// ...
const client = new Anthropic();
const response = await client.messages.create({
  model: "claude-sonnet-4-5",
  max_tokens: 2000,
  system: "You generate HTML sales proposal bodies. Output ONLY HTML.",
  messages: [{ role: "user", content: prompt }],
});
const text = response.content
  .filter((b) => b.type === "text")
  .map((b) => (b as { text: string }).text)
  .join("");
return text.trim();
```

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/app/api/v1/proposals/route.ts
git commit -m "feat(proposals): POST /api/v1/proposals end-to-end creation

Extracts soul → provisions preview workspace via createFullWorkspace
(preview_mode=true) → generates proposal HTML via Claude → inserts
proposals row. GET lists the authed user's agency proposals."
```

### Task 2.5: /proposals/new operator form

**Files:**
- Create: `packages/crm/src/app/(dashboard)/proposals/new/page.tsx`
- Create: `packages/crm/src/app/(dashboard)/proposals/new/proposal-new-form.tsx`

- [ ] **Step 1: Write the server page**

```typescript
// packages/crm/src/app/(dashboard)/proposals/new/page.tsx
// 2026-05-19 — Proposal Builder. Form: paste prospect URL, pick tier,
// click Generate. Spec: §"Proposal creation".

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { stripeConnections, users } from "@/db/schema";
import { ProposalNewForm } from "./proposal-new-form";

export const dynamic = "force-dynamic";

export default async function ProposalNewPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/proposals/new");

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!user) redirect("/login");

  const [conn] = await db
    .select()
    .from(stripeConnections)
    .where(and(eq(stripeConnections.orgId, user.orgId), eq(stripeConnections.isActive, true)))
    .limit(1);

  if (!conn) redirect("/proposals/onboarding");

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <ProposalNewForm />
    </main>
  );
}
```

- [ ] **Step 2: Write the client form**

```typescript
// packages/crm/src/app/(dashboard)/proposals/new/proposal-new-form.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Tier = "starter" | "growth" | "pro" | "custom";

const TIERS: Array<{ id: Tier; label: string; price: string }> = [
  { id: "starter", label: "Starter", price: "$297/mo" },
  { id: "growth", label: "Growth", price: "$497/mo" },
  { id: "pro", label: "Pro", price: "$997/mo" },
  { id: "custom", label: "Custom", price: "—" },
];

export function ProposalNewForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState<Tier>("growth");
  const [customCents, setCustomCents] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prospect_url: url,
          prospect_email: email,
          pricing_tier: tier,
          custom_cents: tier === "custom" ? Number(customCents) * 100 : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `error_${res.status}`);
      router.push(`/proposals/${data.proposal.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "create_failed");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">New proposal</h1>
        <p className="text-muted-foreground">
          Paste the prospect's website. We'll build a working workspace and generate the proposal.
        </p>
      </header>

      <div className="space-y-3">
        <Label htmlFor="url">Prospect website URL</Label>
        <Input
          id="url"
          type="url"
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
      </div>

      <div className="space-y-3">
        <Label htmlFor="email">Prospect email</Label>
        <Input
          id="email"
          type="email"
          placeholder="owner@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div className="space-y-3">
        <Label>Monthly price</Label>
        <div className="grid grid-cols-4 gap-3">
          {TIERS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTier(t.id)}
              className={`rounded-xl border p-3 text-left ${
                tier === t.id ? "border-primary bg-primary/5" : "border-border bg-card"
              }`}
            >
              <div className="text-sm font-medium">{t.label}</div>
              <div className="text-xs text-muted-foreground">{t.price}</div>
            </button>
          ))}
        </div>
        {tier === "custom" && (
          <Input
            type="number"
            placeholder="Custom monthly price (USD)"
            value={customCents}
            onChange={(e) => setCustomCents(e.target.value)}
            min={50}
          />
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Building workspace + generating proposal…" : "Generate proposal"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/app/(dashboard)/proposals/new/
git commit -m "feat(proposals): /proposals/new form for creating proposals"
```

---

## Phase 3 — Operator review + edit surface (~1 day)

### Task 3.1: ProposalStatusPill component

**Files:**
- Create: `packages/crm/src/components/proposals/proposal-status-pill.tsx`

- [ ] **Step 1: Write the component**

```typescript
// packages/crm/src/components/proposals/proposal-status-pill.tsx
import type { ProposalStatus } from "@/db/schema/proposals";

const STATUS_STYLES: Record<ProposalStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  sent: { label: "Sent", className: "bg-sky-500/10 text-sky-700" },
  viewed: { label: "Viewed", className: "bg-violet-500/10 text-violet-700" },
  accepted: { label: "Accepted", className: "bg-emerald-500/10 text-emerald-700" },
  declined: { label: "Declined", className: "bg-rose-500/10 text-rose-700" },
  expired: { label: "Expired", className: "bg-amber-500/10 text-amber-700" },
};

export function ProposalStatusPill({ status }: { status: ProposalStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${style.className}`}>
      {style.label}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/crm/src/components/proposals/proposal-status-pill.tsx
git commit -m "feat(proposals): ProposalStatusPill component"
```

### Task 3.2: /proposals list page

**Files:**
- Create: `packages/crm/src/app/(dashboard)/proposals/page.tsx`
- Create: `packages/crm/src/app/(dashboard)/proposals/proposals-grid.tsx`

- [ ] **Step 1: Write the server page**

```typescript
// packages/crm/src/app/(dashboard)/proposals/page.tsx
// 2026-05-19 — Proposal Builder. Operator list of proposals — same visual
// language as /clients (hero header + status pills + grid). Spec:
// §"Operator review + send".

import { redirect } from "next/navigation";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { proposals, users } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { ProposalsGrid } from "./proposals-grid";

export const dynamic = "force-dynamic";

export default async function ProposalsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/proposals");

  const [user] = await db
    .select({ orgId: users.orgId })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user) redirect("/login");

  const rows = await db
    .select()
    .from(proposals)
    .where(eq(proposals.agencyOrgId, user.orgId))
    .orderBy(desc(proposals.createdAt))
    .limit(200);

  return (
    <main className="flex-1 overflow-auto w-full space-y-6 p-3 sm:p-4 md:p-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Proposals</h1>
          <p className="text-muted-foreground">
            {rows.length === 0
              ? "Send your first proposal to start landing clients."
              : `${rows.length} proposal${rows.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <Button asChild>
          <Link href="/proposals/new">+ New proposal</Link>
        </Button>
      </header>
      <ProposalsGrid proposals={rows} />
    </main>
  );
}
```

- [ ] **Step 2: Write the grid client component**

```typescript
// packages/crm/src/app/(dashboard)/proposals/proposals-grid.tsx
"use client";

import Link from "next/link";
import type { Proposal } from "@/db/schema/proposals";
import { ProposalStatusPill } from "@/components/proposals/proposal-status-pill";

function formatPrice(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}/mo`;
}

function formatDate(value: Date | string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ProposalsGrid({ proposals }: { proposals: Proposal[] }) {
  if (proposals.length === 0) {
    return (
      <section className="rounded-2xl border border-border/70 bg-card/40 p-12 text-center space-y-3">
        <h2 className="text-xl font-semibold">No proposals yet</h2>
        <p className="text-sm text-muted-foreground">
          Click <span className="font-medium">New proposal</span> to pitch your first prospect.
        </p>
      </section>
    );
  }

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
      {proposals.map((p) => (
        <Link
          key={p.id}
          href={`/proposals/${p.id}`}
          className="rounded-2xl border border-border/80 bg-card/80 p-5 hover:shadow-lg transition-shadow"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <h3 className="font-semibold truncate">{p.prospectName}</h3>
              <p className="text-xs text-muted-foreground truncate">{p.prospectEmail}</p>
            </div>
            <ProposalStatusPill status={p.status} />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Price</dt>
              <dd className="font-medium">{formatPrice(p.monthlyPriceCents)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Sent</dt>
              <dd className="font-medium">{formatDate(p.sentAt)}</dd>
            </div>
          </dl>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/app/(dashboard)/proposals/page.tsx packages/crm/src/app/(dashboard)/proposals/proposals-grid.tsx
git commit -m "feat(proposals): /proposals list page with status grid"
```

### Task 3.3: /proposals/[id] edit page

**Files:**
- Create: `packages/crm/src/app/(dashboard)/proposals/[id]/page.tsx`
- Create: `packages/crm/src/app/(dashboard)/proposals/[id]/proposal-editor.tsx`

- [ ] **Step 1: Write the server page**

```typescript
// packages/crm/src/app/(dashboard)/proposals/[id]/page.tsx
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { proposals, users } from "@/db/schema";
import { ProposalEditor } from "./proposal-editor";

export const dynamic = "force-dynamic";

export default async function ProposalEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [user] = await db
    .select({ orgId: users.orgId })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user) redirect("/login");

  const { id } = await params;

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.id, id), eq(proposals.agencyOrgId, user.orgId)))
    .limit(1);

  if (!proposal) notFound();

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <ProposalEditor proposal={proposal} />
    </main>
  );
}
```

- [ ] **Step 2: Write the editor client component**

```typescript
// packages/crm/src/app/(dashboard)/proposals/[id]/proposal-editor.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Proposal, ProposalScopeItem } from "@/db/schema/proposals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProposalStatusPill } from "@/components/proposals/proposal-status-pill";
import { updateProposalAction, sendProposalAction } from "@/lib/proposals/actions";

export function ProposalEditor({ proposal }: { proposal: Proposal }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [priceDollars, setPriceDollars] = useState(
    String(proposal.monthlyPriceCents / 100),
  );
  const [scopeItems, setScopeItems] = useState<ProposalScopeItem[]>(proposal.scopeItems);
  const [error, setError] = useState<string | null>(null);

  function updateScopeLabel(idx: number, label: string) {
    setScopeItems((prev) => prev.map((it, i) => (i === idx ? { ...it, label } : it)));
  }

  function removeScopeItem(idx: number) {
    setScopeItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function addScopeItem() {
    setScopeItems((prev) => [...prev, { label: "" }]);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateProposalAction({
        id: proposal.id,
        monthlyPriceCents: Math.round(Number(priceDollars) * 100),
        scopeItems,
      });
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function handleSend() {
    setError(null);
    startTransition(async () => {
      const result = await sendProposalAction({ id: proposal.id });
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  const isDraft = proposal.status === "draft";
  const isSent = proposal.status !== "draft";

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">
            {proposal.prospectName}
          </h1>
          <p className="text-sm text-muted-foreground">{proposal.prospectEmail}</p>
        </div>
        <ProposalStatusPill status={proposal.status} />
      </header>

      <section className="rounded-2xl border bg-card/40 p-6 space-y-4">
        <h2 className="text-xl font-semibold">Pricing</h2>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">$</span>
          <Input
            type="number"
            value={priceDollars}
            onChange={(e) => setPriceDollars(e.target.value)}
            disabled={isSent}
            className="max-w-[200px]"
          />
          <span className="text-muted-foreground">/ month</span>
        </div>
      </section>

      <section className="rounded-2xl border bg-card/40 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">What's included</h2>
          {!isSent && (
            <Button variant="outline" size="sm" onClick={addScopeItem}>
              + Add item
            </Button>
          )}
        </div>
        <ul className="space-y-2">
          {scopeItems.map((item, idx) => (
            <li key={idx} className="flex items-center gap-2">
              <Input
                value={item.label}
                onChange={(e) => updateScopeLabel(idx, e.target.value)}
                disabled={isSent}
              />
              {!isSent && (
                <Button variant="ghost" size="sm" onClick={() => removeScopeItem(idx)}>
                  ×
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border bg-card/40 p-6 space-y-4">
        <h2 className="text-xl font-semibold">Generated proposal preview</h2>
        <div
          className="prose max-w-none rounded-xl border bg-background p-6"
          dangerouslySetInnerHTML={{ __html: proposal.generatedHtml }}
        />
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3 sticky bottom-4">
        {isDraft && (
          <>
            <Button variant="outline" onClick={handleSave} disabled={isPending}>
              Save changes
            </Button>
            <Button onClick={handleSend} disabled={isPending}>
              {isPending ? "Sending…" : "Send proposal"}
            </Button>
          </>
        )}
        {isSent && (
          <Button asChild variant="outline">
            <a href={`/p/${proposal.signedToken}`} target="_blank" rel="noopener noreferrer">
              View public page
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck — this depends on actions.ts (next task)**

Skip typecheck here; we'll verify after Task 3.4.

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/app/(dashboard)/proposals/[id]/
git commit -m "feat(proposals): /proposals/[id] edit page with inline editor

Renders the generated HTML preview, lets the operator tweak monthly
price and scope items, then sends via sendProposalAction. After send,
editor flips to read-only and surfaces a 'View public page' link."
```

### Task 3.4: Server actions (update + send)

**Files:**
- Create: `packages/crm/src/lib/proposals/actions.ts`

- [ ] **Step 1: Write the actions**

```typescript
// packages/crm/src/lib/proposals/actions.ts
// 2026-05-19 — Proposal Builder server actions. Spec: §"Operator review + send".

"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  proposalEvents,
  proposals,
  users,
  type ProposalScopeItem,
} from "@/db/schema";
import { assertTransition } from "./status";
import { sendEmail } from "@/lib/messaging/send-email";
import type { AgencyProposalTemplate } from "@/db/schema/agency-profile";

type ActionResult<T = unknown> =
  | { ok: true; value?: T }
  | { ok: false; error: string };

async function loadAuthorizedProposal(id: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "unauthorized" as const };

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user) return { error: "user_not_found" as const };

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.id, id), eq(proposals.agencyOrgId, user.orgId)))
    .limit(1);
  if (!proposal) return { error: "not_found" as const };

  return { user, proposal };
}

export async function updateProposalAction(input: {
  id: string;
  monthlyPriceCents: number;
  scopeItems: ProposalScopeItem[];
}): Promise<ActionResult> {
  const loaded = await loadAuthorizedProposal(input.id);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  if (loaded.proposal.status !== "draft") {
    return { ok: false, error: "proposal_not_editable" };
  }
  if (input.monthlyPriceCents < 5000) {
    return { ok: false, error: "price_below_minimum" };
  }

  await db
    .update(proposals)
    .set({
      monthlyPriceCents: input.monthlyPriceCents,
      scopeItems: input.scopeItems,
      updatedAt: new Date(),
    })
    .where(eq(proposals.id, input.id));

  revalidatePath(`/proposals/${input.id}`);
  return { ok: true };
}

export async function sendProposalAction(input: {
  id: string;
}): Promise<ActionResult> {
  const loaded = await loadAuthorizedProposal(input.id);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  const { proposal, user } = loaded;

  try {
    assertTransition(proposal.status, "sent");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "invalid_transition" };
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.seldonframe.com";
  const publicUrl = `${baseUrl}/p/${proposal.signedToken}`;
  const template = user.agencyProfile.proposalTemplate;
  const subject = (template?.subject ?? "A proposal for {{prospectName}}").replace(
    /\{\{prospectName\}\}/g,
    proposal.prospectName,
  );

  await sendEmail({
    orgId: user.orgId,
    to: proposal.prospectEmail,
    subject,
    html: `<p>Hi ${proposal.prospectFirstName ?? proposal.prospectName},</p>
<p>${user.agencyProfile.name ?? user.name} put together a proposal for you. View it here:</p>
<p><a href="${publicUrl}">${publicUrl}</a></p>`,
  });

  await db
    .update(proposals)
    .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
    .where(eq(proposals.id, input.id));

  await db.insert(proposalEvents).values({
    proposalId: input.id,
    eventType: "sent",
    metadata: { to: proposal.prospectEmail },
  });

  revalidatePath(`/proposals/${input.id}`);
  revalidatePath("/proposals");
  return { ok: true };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS — if `sendEmail` is named differently, grep `packages/crm/src/lib/messaging` for the canonical helper and import accordingly. Same path: existing send_email handler.

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/lib/proposals/actions.ts
git commit -m "feat(proposals): updateProposalAction + sendProposalAction

Both gate on (a) user owns the agency org, (b) status allows the
operation. sendProposalAction emails the proposal link via the
existing sendEmail helper and stamps status=sent + sent_at."
```

---

## Phase 4 — Public proposal page (~1 day)

### Task 4.1: load-by-token helper (TDD)

**Files:**
- Create: `packages/crm/src/lib/proposals/load-by-token.ts`
- Test: `packages/crm/tests/unit/proposals/load-by-token.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/crm/tests/unit/proposals/load-by-token.spec.ts
import { describe, it, expect } from "vitest";
import { validateToken } from "@/lib/proposals/load-by-token";

describe("validateToken", () => {
  it("accepts URL-safe base64 strings of length >= 32", () => {
    expect(validateToken("abc-DEF_ghi123456789012345678901234")).toBe(true);
  });

  it("rejects strings under 32 chars", () => {
    expect(validateToken("too-short")).toBe(false);
  });

  it("rejects strings with disallowed chars", () => {
    expect(validateToken("contains-slash/and-plus+chars-aaaaaaaa")).toBe(false);
  });

  it("rejects empty strings", () => {
    expect(validateToken("")).toBe(false);
  });

  it("rejects null-ish", () => {
    expect(validateToken(undefined as unknown as string)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit tests/unit/proposals/load-by-token.spec.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```typescript
// packages/crm/src/lib/proposals/load-by-token.ts
// 2026-05-19 — Proposal Builder. Public-route helper. Validates the
// shape of a signed_token (cheap defense against scanner bots before
// hitting the DB) and loads the proposal row. Spec: §"Public proposal page".

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { proposals, type Proposal } from "@/db/schema";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,}$/;

export function validateToken(token: string | null | undefined): boolean {
  if (!token) return false;
  return TOKEN_PATTERN.test(token);
}

export async function loadProposalByToken(
  token: string,
): Promise<Proposal | null> {
  if (!validateToken(token)) return null;
  const [row] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.signedToken, token))
    .limit(1);
  return row ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit tests/unit/proposals/load-by-token.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/proposals/load-by-token.ts packages/crm/tests/unit/proposals/load-by-token.spec.ts
git commit -m "feat(proposals): public-route token validator + loader"
```

### Task 4.2: BookingIframe component

**Files:**
- Create: `packages/crm/src/components/proposals/booking-iframe.tsx`

- [ ] **Step 1: Write the component**

```typescript
// packages/crm/src/components/proposals/booking-iframe.tsx
// 2026-05-19 — Proposal Builder. Embeds the preview workspace's booking
// page so the prospect can click through a LIVE working booking flow
// inside the proposal. Spec: §"Live workspace preview in the proposal".

export function BookingIframe({
  workspaceSlug,
  baseDomain,
}: {
  workspaceSlug: string;
  baseDomain: string;
}) {
  const src = `https://${workspaceSlug}.${baseDomain}/book`;
  return (
    <div className="rounded-2xl border border-border/70 overflow-hidden bg-card">
      <div className="px-4 py-2 border-b border-border/50 bg-muted/40 text-xs text-muted-foreground">
        Live preview · click around — this is your actual booking page
      </div>
      <iframe
        src={src}
        title="Booking page preview"
        className="w-full h-[640px] border-0"
        loading="lazy"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/crm/src/components/proposals/booking-iframe.tsx
git commit -m "feat(proposals): BookingIframe component for live workspace preview"
```

### Task 4.3: ScreenshotGrid component

**Files:**
- Create: `packages/crm/src/components/proposals/screenshot-grid.tsx`

- [ ] **Step 1: Write the component**

```typescript
// packages/crm/src/components/proposals/screenshot-grid.tsx
// 2026-05-19 — Proposal Builder. Shows the rest of the stack as
// thumbnails alongside the live booking iframe. Uses the existing
// marketing screenshots from /marketing/. Spec: §"Live workspace preview".

import Image from "next/image";

const SCREENSHOTS = [
  { src: "/marketing/crm-pipeline.png", label: "CRM + Pipeline" },
  { src: "/marketing/form.png", label: "Intake form" },
  { src: "/marketing/agents.png", label: "AI chatbot + automations" },
  { src: "/marketing/booking-page.png", label: "Booking page" },
];

export function ScreenshotGrid() {
  return (
    <div className="grid grid-cols-2 gap-4">
      {SCREENSHOTS.map((shot) => (
        <figure
          key={shot.src}
          className="rounded-2xl border border-border/70 overflow-hidden bg-card"
        >
          <div className="aspect-[4/3] relative bg-muted/40">
            <Image src={shot.src} alt={shot.label} fill className="object-cover" />
          </div>
          <figcaption className="px-4 py-2 text-xs text-muted-foreground border-t border-border/50">
            {shot.label}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/crm/src/components/proposals/screenshot-grid.tsx
git commit -m "feat(proposals): ScreenshotGrid for CRM/forms/chatbot thumbnails"
```

### Task 4.4: Public /p/[token] page

**Files:**
- Create: `packages/crm/src/app/p/[token]/page.tsx`

- [ ] **Step 1: Write the page**

```typescript
// packages/crm/src/app/p/[token]/page.tsx
// 2026-05-19 — Proposal Builder. Public route. Renders the proposal
// page + logs a 'viewed' event (dedup'd by IP/24h). Spec: §"Public proposal page".

import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  organizations,
  proposalEvents,
  proposals,
  users,
} from "@/db/schema";
import { loadProposalByToken } from "@/lib/proposals/load-by-token";
import { BookingIframe } from "@/components/proposals/booking-iframe";
import { ScreenshotGrid } from "@/components/proposals/screenshot-grid";
import { AcceptButton } from "./accept-button";

export const dynamic = "force-dynamic";

async function logViewedOnce(proposalId: string, ipAddress: string, userAgent: string) {
  // Dedup: don't log a viewed event if the same IP viewed in the last 24h.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [existing] = await db
    .select({ id: proposalEvents.id })
    .from(proposalEvents)
    .where(
      and(
        eq(proposalEvents.proposalId, proposalId),
        eq(proposalEvents.eventType, "viewed"),
        eq(proposalEvents.ipAddress, ipAddress),
        gte(proposalEvents.createdAt, since),
      ),
    )
    .limit(1);

  if (existing) return;

  await db.insert(proposalEvents).values({
    proposalId,
    eventType: "viewed",
    ipAddress,
    userAgent,
  });
  await db
    .update(proposals)
    .set({
      status: sql`CASE WHEN status = 'sent' THEN 'viewed' ELSE status END`,
      firstViewedAt: sql`COALESCE(first_viewed_at, NOW())`,
      updatedAt: new Date(),
    })
    .where(eq(proposals.id, proposalId));
}

export default async function ProposalPublicPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const proposal = await loadProposalByToken(token);
  if (!proposal) notFound();
  if (proposal.status === "expired") notFound();
  if (new Date(proposal.expiresAt).getTime() < Date.now()) notFound();

  const reqHeaders = await headers();
  const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ua = reqHeaders.get("user-agent") ?? "unknown";
  await logViewedOnce(proposal.id, ip, ua);

  const [agency] = await db
    .select()
    .from(users)
    .where(eq(users.id, proposal.createdByUserId ?? ""))
    .limit(1);

  const [workspace] = proposal.previewWorkspaceId
    ? await db
        .select({ slug: organizations.slug })
        .from(organizations)
        .where(eq(organizations.id, proposal.previewWorkspaceId))
        .limit(1)
    : [null];

  const baseDomain =
    process.env.WORKSPACE_BASE_DOMAIN?.trim() || "seldonframe.app";
  const brandColor = agency?.agencyProfile.brand_color ?? "#0ea5e9";

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-12 space-y-10">
        <header className="space-y-2">
          {agency?.agencyProfile.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={agency.agencyProfile.logo_url}
              alt={agency.agencyProfile.name ?? ""}
              className="h-10 mb-4"
            />
          )}
          <h1
            className="text-4xl font-semibold tracking-tight"
            style={{ color: brandColor }}
          >
            {proposal.prospectName}
          </h1>
        </header>

        <div
          className="prose max-w-none"
          dangerouslySetInnerHTML={{ __html: proposal.generatedHtml }}
        />

        {workspace && (
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Your live booking page</h2>
            <BookingIframe workspaceSlug={workspace.slug} baseDomain={baseDomain} />
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">What's included</h2>
          <ScreenshotGrid />
        </section>

        <section className="rounded-2xl border-2 p-8 text-center space-y-4" style={{ borderColor: brandColor }}>
          <p className="text-sm text-muted-foreground">Investment</p>
          <p className="text-5xl font-semibold" style={{ color: brandColor }}>
            ${(proposal.monthlyPriceCents / 100).toLocaleString("en-US")}
            <span className="text-lg text-muted-foreground"> / month</span>
          </p>
          <AcceptButton token={proposal.signedToken} brandColor={brandColor} />
          <p className="text-xs text-muted-foreground">
            Month-to-month. Cancel anytime. Payments handled by Stripe.
          </p>
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Write the AcceptButton client component**

Create `packages/crm/src/app/p/[token]/accept-button.tsx`:

```typescript
"use client";

import { useState } from "react";

export function AcceptButton({ token, brandColor }: { token: string; brandColor: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/p/${token}/accept`, { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? `accept_failed_${res.status}`);
      }
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "accept_failed");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleClick}
        disabled={loading}
        style={{ backgroundColor: brandColor }}
        className="px-8 py-4 rounded-full text-white font-semibold text-lg shadow-lg hover:shadow-xl transition-shadow disabled:opacity-50"
      >
        {loading ? "Opening Stripe…" : "Accept & start →"}
      </button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/app/p/[token]/page.tsx packages/crm/src/app/p/[token]/accept-button.tsx
git commit -m "feat(proposals): public /p/[token] page with iframe + screenshots

Loads the proposal by signed_token, logs a deduped 'viewed' event,
renders the AI-generated HTML, the live booking iframe, and the
screenshot grid. Big brand-colored Accept button posts to /accept."
```

### Task 4.5: Decline route

**Files:**
- Create: `packages/crm/src/app/p/[token]/decline/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// packages/crm/src/app/p/[token]/decline/route.ts
// 2026-05-19 — Proposal Builder. Public decline endpoint. Prospect can
// click "Not interested" + optionally leave a reason. Spec: §"Public
// proposal page" + open-question 3 (decline reasons).

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { proposalEvents, proposals } from "@/db/schema";
import { loadProposalByToken } from "@/lib/proposals/load-by-token";
import { assertTransition } from "@/lib/proposals/status";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const proposal = await loadProposalByToken(token);
  if (!proposal) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    assertTransition(proposal.status, "declined");
  } catch {
    return NextResponse.json({ error: "invalid_transition" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { reason?: string };
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 1000) : null;

  await db
    .update(proposals)
    .set({
      status: "declined",
      declinedAt: new Date(),
      declinedReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(proposals.id, proposal.id));

  await db.insert(proposalEvents).values({
    proposalId: proposal.id,
    eventType: "declined",
    metadata: reason ? { reason } : null,
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/crm/src/app/p/[token]/decline/route.ts
git commit -m "feat(proposals): public /p/[token]/decline route with optional reason"
```

---

## Phase 5 — Acceptance + Stripe Checkout (~1.5 days)

### Task 5.1: Checkout session param builder (TDD)

**Files:**
- Create: `packages/crm/src/lib/proposals/checkout.ts`
- Test: `packages/crm/tests/unit/proposals/checkout.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/crm/tests/unit/proposals/checkout.spec.ts
import { describe, it, expect } from "vitest";
import { buildCheckoutSessionParams } from "@/lib/proposals/checkout";

describe("buildCheckoutSessionParams", () => {
  const input = {
    proposalId: "prop_123",
    previewWorkspaceId: "ws_456",
    prospectEmail: "owner@example.com",
    prospectName: "Roofs by Shiloh",
    monthlyPriceCents: 49700,
    signedToken: "tok_xyzaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    baseUrl: "https://app.seldonframe.com",
  };

  it("creates a monthly subscription line item", () => {
    const params = buildCheckoutSessionParams(input);
    expect(params.mode).toBe("subscription");
    expect(params.line_items?.[0]?.quantity).toBe(1);
    expect(params.line_items?.[0]?.price_data?.recurring?.interval).toBe("month");
    expect(params.line_items?.[0]?.price_data?.unit_amount).toBe(49700);
    expect(params.line_items?.[0]?.price_data?.currency).toBe("usd");
  });

  it("uses the prospect email as customer_email", () => {
    const params = buildCheckoutSessionParams(input);
    expect(params.customer_email).toBe("owner@example.com");
  });

  it("uses the prospect name in product_data", () => {
    const params = buildCheckoutSessionParams(input);
    expect(params.line_items?.[0]?.price_data?.product_data?.name).toContain(
      "Roofs by Shiloh",
    );
  });

  it("includes proposal_id + preview_workspace_id in subscription metadata", () => {
    const params = buildCheckoutSessionParams(input);
    expect(params.subscription_data?.metadata?.proposal_id).toBe("prop_123");
    expect(params.subscription_data?.metadata?.preview_workspace_id).toBe("ws_456");
  });

  it("sets success_url + cancel_url back to /p/[token]", () => {
    const params = buildCheckoutSessionParams(input);
    expect(params.success_url).toContain("/p/tok_xyzaaaaaaaaaaaaaaaaaaaaaaaaaaaa/success");
    expect(params.cancel_url).toContain("/p/tok_xyzaaaaaaaaaaaaaaaaaaaaaaaaaaaa/cancel");
    expect(params.success_url).toContain("session_id={CHECKOUT_SESSION_ID}");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit tests/unit/proposals/checkout.spec.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```typescript
// packages/crm/src/lib/proposals/checkout.ts
// 2026-05-19 — Proposal Builder. Pure builder for Stripe Checkout session
// params. Direct charges on the agency's connected account (the route
// handler passes the `stripeAccount` option to stripe.checkout.sessions.create).
// Spec: §"Acceptance + Stripe Checkout".

import type Stripe from "stripe";

export type BuildCheckoutSessionParamsInput = {
  proposalId: string;
  previewWorkspaceId: string | null;
  prospectEmail: string;
  prospectName: string;
  monthlyPriceCents: number;
  signedToken: string;
  baseUrl: string;
};

export function buildCheckoutSessionParams(
  input: BuildCheckoutSessionParamsInput,
): Stripe.Checkout.SessionCreateParams {
  return {
    mode: "subscription",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: input.monthlyPriceCents,
          recurring: { interval: "month" },
          product_data: {
            name: `${input.prospectName} — monthly`,
          },
        },
      },
    ],
    customer_email: input.prospectEmail,
    subscription_data: {
      metadata: {
        proposal_id: input.proposalId,
        preview_workspace_id: input.previewWorkspaceId ?? "",
        signed_token: input.signedToken,
      },
    },
    success_url: `${input.baseUrl}/p/${input.signedToken}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.baseUrl}/p/${input.signedToken}/cancel`,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit tests/unit/proposals/checkout.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/proposals/checkout.ts packages/crm/tests/unit/proposals/checkout.spec.ts
git commit -m "feat(proposals): Stripe Checkout session param builder + TDD"
```

### Task 5.2: /p/[token]/accept route

**Files:**
- Create: `packages/crm/src/app/p/[token]/accept/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// packages/crm/src/app/p/[token]/accept/route.ts
// 2026-05-19 — Proposal Builder. Public accept endpoint. Creates a
// Stripe Checkout session on the agency's connected account (direct
// charge, 0% platform fee). Spec: §"Acceptance + Stripe Checkout".

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { proposalEvents, proposals, stripeConnections, users } from "@/db/schema";
import { loadProposalByToken } from "@/lib/proposals/load-by-token";
import { buildCheckoutSessionParams } from "@/lib/proposals/checkout";
import { getStripeClient } from "@/lib/proposals/stripe-connect";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const proposal = await loadProposalByToken(token);
  if (!proposal) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (proposal.status !== "sent" && proposal.status !== "viewed") {
    return NextResponse.json({ error: "not_acceptable" }, { status: 409 });
  }
  if (new Date(proposal.expiresAt).getTime() < Date.now()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  // Find the agency's connected Stripe account.
  const [conn] = await db
    .select({ accountId: stripeConnections.stripeAccountId })
    .from(stripeConnections)
    .where(
      and(
        eq(stripeConnections.orgId, proposal.agencyOrgId),
        eq(stripeConnections.isActive, true),
      ),
    )
    .limit(1);

  if (!conn) {
    return NextResponse.json({ error: "stripe_not_connected" }, { status: 500 });
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 500 });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.seldonframe.com";

  const params2 = buildCheckoutSessionParams({
    proposalId: proposal.id,
    previewWorkspaceId: proposal.previewWorkspaceId,
    prospectEmail: proposal.prospectEmail,
    prospectName: proposal.prospectName,
    monthlyPriceCents: proposal.monthlyPriceCents,
    signedToken: proposal.signedToken,
    baseUrl,
  });

  // Direct charge on the agency's connected account.
  const session = await stripe.checkout.sessions.create(params2, {
    stripeAccount: conn.accountId,
    idempotencyKey: `proposal-${proposal.id}`,
  });

  await db
    .update(proposals)
    .set({
      stripeCheckoutSessionId: session.id,
      updatedAt: new Date(),
    })
    .where(eq(proposals.id, proposal.id));

  await db.insert(proposalEvents).values({
    proposalId: proposal.id,
    eventType: "checkout_started",
    metadata: { sessionId: session.id },
  });

  return NextResponse.json({ url: session.url });
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/app/p/[token]/accept/route.ts
git commit -m "feat(proposals): /p/[token]/accept creates Stripe Checkout

Direct charge on agency's connected account (SeldonFrame takes 0%).
Idempotency keyed on proposal_id so double-clicks return the same
session. Logs checkout_started event."
```

### Task 5.3: /p/[token]/success and /cancel pages

**Files:**
- Create: `packages/crm/src/app/p/[token]/success/page.tsx`
- Create: `packages/crm/src/app/p/[token]/cancel/page.tsx`

- [ ] **Step 1: Write the success page**

```typescript
// packages/crm/src/app/p/[token]/success/page.tsx
// 2026-05-19 — Proposal Builder. Post-Checkout success landing. The
// webhook does the real activation work; this page just confirms.

import { notFound } from "next/navigation";
import { loadProposalByToken } from "@/lib/proposals/load-by-token";

export const dynamic = "force-dynamic";

export default async function ProposalSuccessPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const proposal = await loadProposalByToken(token);
  if (!proposal) notFound();

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">You're in.</h1>
        <p className="text-muted-foreground">
          Your workspace is going live now. Check your inbox for the admin link — it'll arrive
          within a minute.
        </p>
        <p className="text-sm text-muted-foreground">
          Receipt and subscription details: Stripe just emailed you.
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Write the cancel page**

```typescript
// packages/crm/src/app/p/[token]/cancel/page.tsx

import Link from "next/link";

export default async function ProposalCancelPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">No charge made.</h1>
        <p className="text-muted-foreground">
          You can come back anytime — your proposal stays live for 30 days.
        </p>
        <Link href={`/p/${token}`} className="text-primary hover:underline">
          ← Back to the proposal
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/app/p/[token]/success/ packages/crm/src/app/p/[token]/cancel/
git commit -m "feat(proposals): post-Checkout success + cancel pages"
```

---

## Phase 6 — Webhook + workspace activation (~1 day)

### Task 6.1: Workspace activation helper (TDD)

**Files:**
- Create: `packages/crm/src/lib/proposals/activate-workspace.ts`
- Test: `packages/crm/tests/unit/proposals/activate-workspace.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/crm/tests/unit/proposals/activate-workspace.spec.ts
import { describe, it, expect } from "vitest";
import { buildActivationOps } from "@/lib/proposals/activate-workspace";

describe("buildActivationOps", () => {
  it("returns ops list with workspace flip + ownership transfer", () => {
    const ops = buildActivationOps({
      proposalId: "prop_123",
      workspaceId: "ws_456",
      prospectEmail: "owner@example.com",
      stripeSubscriptionId: "sub_xyz",
      stripeCustomerId: "cus_abc",
    });
    const types = ops.map((o) => o.type);
    expect(types).toContain("flip_preview_mode");
    expect(types).toContain("update_proposal_status");
    expect(types).toContain("log_event_workspace_activated");
  });

  it("preserves null workspaceId (proposal without preview workspace)", () => {
    const ops = buildActivationOps({
      proposalId: "prop_123",
      workspaceId: null,
      prospectEmail: "owner@example.com",
      stripeSubscriptionId: "sub_xyz",
      stripeCustomerId: "cus_abc",
    });
    const types = ops.map((o) => o.type);
    expect(types).not.toContain("flip_preview_mode");
    expect(types).toContain("update_proposal_status");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit tests/unit/proposals/activate-workspace.spec.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```typescript
// packages/crm/src/lib/proposals/activate-workspace.ts
// 2026-05-19 — Proposal Builder. On checkout success: flip preview
// workspace to active, transfer ownership-to-prospect, update proposal
// status, log events. Spec: §"Stripe Connect webhook + workspace activation".

import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  organizations,
  proposalEvents,
  proposals,
} from "@/db/schema";

export type ActivationOp =
  | { type: "flip_preview_mode"; workspaceId: string }
  | {
      type: "update_proposal_status";
      proposalId: string;
      stripeSubscriptionId: string;
      stripeCustomerId: string;
    }
  | { type: "log_event_checkout_success"; proposalId: string; sessionId: string }
  | { type: "log_event_workspace_activated"; proposalId: string; workspaceId: string };

export function buildActivationOps(input: {
  proposalId: string;
  workspaceId: string | null;
  prospectEmail: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
}): ActivationOp[] {
  const ops: ActivationOp[] = [];
  if (input.workspaceId) {
    ops.push({ type: "flip_preview_mode", workspaceId: input.workspaceId });
    ops.push({
      type: "log_event_workspace_activated",
      proposalId: input.proposalId,
      workspaceId: input.workspaceId,
    });
  }
  ops.push({
    type: "update_proposal_status",
    proposalId: input.proposalId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    stripeCustomerId: input.stripeCustomerId,
  });
  return ops;
}

export async function activateProposalWorkspace(input: {
  proposalId: string;
  workspaceId: string | null;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  sessionId: string;
}): Promise<void> {
  if (input.workspaceId) {
    await db
      .update(organizations)
      .set({ previewMode: false, updatedAt: new Date() })
      .where(eq(organizations.id, input.workspaceId));

    await db.insert(proposalEvents).values({
      proposalId: input.proposalId,
      eventType: "workspace_activated",
      metadata: { workspaceId: input.workspaceId },
    });
  }

  await db
    .update(proposals)
    .set({
      status: "accepted",
      acceptedAt: new Date(),
      stripeSubscriptionId: input.stripeSubscriptionId,
      stripeCustomerId: input.stripeCustomerId,
      updatedAt: new Date(),
    })
    .where(eq(proposals.id, input.proposalId));

  await db.insert(proposalEvents).values({
    proposalId: input.proposalId,
    eventType: "checkout_success",
    metadata: { sessionId: input.sessionId },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit tests/unit/proposals/activate-workspace.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/proposals/activate-workspace.ts packages/crm/tests/unit/proposals/activate-workspace.spec.ts
git commit -m "feat(proposals): activateProposalWorkspace helper + TDD coverage

buildActivationOps is a pure planner used in tests. The real handler
applies all DB writes atomically (in the webhook handler's request
scope) when Stripe confirms checkout.session.completed."
```

### Task 6.2: Notification helpers

**Files:**
- Create: `packages/crm/src/lib/proposals/notify-agency.ts`
- Create: `packages/crm/src/lib/proposals/notify-prospect.ts`

- [ ] **Step 1: Write the agency notification**

```typescript
// packages/crm/src/lib/proposals/notify-agency.ts
// 2026-05-19 — Proposal Builder. "X just signed up at $Y/mo" email to the
// agency operator. Sent from SeldonFrame's platform sender, not the
// agency's Resend (this is platform → operator, not operator → customer).

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { sendEmail } from "@/lib/messaging/send-email";
import type { Proposal } from "@/db/schema/proposals";

export async function notifyAgencyOfAcceptance(proposal: Proposal): Promise<void> {
  if (!proposal.createdByUserId) return;
  const [agency] = await db
    .select()
    .from(users)
    .where(eq(users.id, proposal.createdByUserId))
    .limit(1);
  if (!agency) return;

  const dollars = (proposal.monthlyPriceCents / 100).toLocaleString("en-US");
  const subject = `${proposal.prospectName} just signed up — $${dollars}/mo`;

  await sendEmail({
    orgId: agency.orgId,
    to: agency.email,
    subject,
    html: `<p>${proposal.prospectName} accepted your proposal.</p>
<p>Monthly: $${dollars}<br/>
Stripe subscription: ${proposal.stripeSubscriptionId ?? "(pending)"}</p>
<p>Their workspace is live now. <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.seldonframe.com"}/proposals/${proposal.id}">View proposal</a></p>`,
  });
}
```

- [ ] **Step 2: Write the prospect notification**

```typescript
// packages/crm/src/lib/proposals/notify-prospect.ts
// 2026-05-19 — Proposal Builder. Welcome email to the prospect with
// portal/admin link. Sent from the agency's Resend (their branding).

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { sendEmail } from "@/lib/messaging/send-email";
import type { Proposal } from "@/db/schema/proposals";

export async function notifyProspectOfActivation(proposal: Proposal): Promise<void> {
  if (!proposal.previewWorkspaceId || !proposal.createdByUserId) return;

  const [workspace] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, proposal.previewWorkspaceId))
    .limit(1);
  if (!workspace) return;

  const [agency] = await db
    .select()
    .from(users)
    .where(eq(users.id, proposal.createdByUserId))
    .limit(1);

  const baseDomain = process.env.WORKSPACE_BASE_DOMAIN ?? "seldonframe.app";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.seldonframe.com";
  const agencyName = agency?.agencyProfile.name ?? agency?.name ?? "Your agency";

  await sendEmail({
    orgId: proposal.agencyOrgId,
    to: proposal.prospectEmail,
    subject: `${proposal.prospectName} — your workspace is live`,
    html: `<p>Hi ${proposal.prospectFirstName ?? proposal.prospectName},</p>
<p>Your booking + CRM workspace is live.</p>
<p>Booking page: <a href="https://${workspace.slug}.${baseDomain}/book">https://${workspace.slug}.${baseDomain}/book</a><br/>
Admin login: <a href="${appUrl}/login">${appUrl}/login</a> (use this email address)</p>
<p>—${agencyName}</p>`,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/lib/proposals/notify-agency.ts packages/crm/src/lib/proposals/notify-prospect.ts
git commit -m "feat(proposals): notify-agency + notify-prospect helpers"
```

### Task 6.3: Extend Stripe Connect webhook to handle proposal acceptance

**Files:**
- Modify: `packages/crm/src/app/api/webhooks/stripe/connect/route.ts`

- [ ] **Step 1: Find the existing event-routing switch**

In `packages/crm/src/app/api/webhooks/stripe/connect/route.ts`, locate the section that switches on `event.type`. The existing handler covers payment_intent.* events. Add a `case` for `checkout.session.completed` BEFORE the default branch.

- [ ] **Step 2: Add the new case**

Add to the switch:

```typescript
case "checkout.session.completed": {
  const session = event.data.object as Stripe.Checkout.Session;
  const proposalId = session.subscription_data?.metadata?.proposal_id
    ?? (typeof session.subscription === "object"
      ? (session.subscription as Stripe.Subscription).metadata?.proposal_id
      : undefined);

  // If no proposal_id in metadata, this is not a proposal acceptance —
  // let the existing handlers take over (or fall through to default).
  if (!proposalId) break;

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);
  if (!proposal) break;

  // Idempotency: if we already processed this session, skip.
  if (proposal.stripeCheckoutSessionId === session.id && proposal.status === "accepted") {
    break;
  }

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : (session.subscription as Stripe.Subscription | null)?.id ?? "";
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : (session.customer as Stripe.Customer | null)?.id ?? "";

  await activateProposalWorkspace({
    proposalId: proposal.id,
    workspaceId: proposal.previewWorkspaceId,
    stripeSubscriptionId: subscriptionId,
    stripeCustomerId: customerId,
    sessionId: session.id,
  });

  await notifyAgencyOfAcceptance({
    ...proposal,
    stripeSubscriptionId: subscriptionId,
    stripeCustomerId: customerId,
  });
  await notifyProspectOfActivation(proposal);

  break;
}
```

Add the imports at the top:

```typescript
import { proposals } from "@/db/schema";
import { activateProposalWorkspace } from "@/lib/proposals/activate-workspace";
import { notifyAgencyOfAcceptance } from "@/lib/proposals/notify-agency";
import { notifyProspectOfActivation } from "@/lib/proposals/notify-prospect";
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/app/api/webhooks/stripe/connect/route.ts
git commit -m "feat(proposals): handle checkout.session.completed in Connect webhook

When the session has subscription_data.metadata.proposal_id, route it
through activateProposalWorkspace + notify both sides. Idempotent via
proposals.stripe_checkout_session_id + status check."
```

---

## Phase 7 — Per-agency template editor (~1 day)

### Task 7.1: Template editor page

**Files:**
- Create: `packages/crm/src/app/(dashboard)/proposals/template/page.tsx`
- Create: `packages/crm/src/app/(dashboard)/proposals/template/template-editor.tsx`

- [ ] **Step 1: Write the server page**

```typescript
// packages/crm/src/app/(dashboard)/proposals/template/page.tsx
// 2026-05-19 — Proposal Builder. Per-agency template editor. Mirrors
// the live-preview pattern from /automations/[id]/configure (RunContext
// Phase 7.2). Spec: §"Per-agency template editor".

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { DEFAULT_PROPOSAL_TEMPLATE } from "@/lib/proposals/generate-html";
import { TemplateEditor } from "./template-editor";

export const dynamic = "force-dynamic";

export default async function ProposalTemplatePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/proposals/template");

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!user) redirect("/login");

  const template = user.agencyProfile.proposalTemplate ?? DEFAULT_PROPOSAL_TEMPLATE;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <TemplateEditor template={template} />
    </main>
  );
}
```

- [ ] **Step 2: Write the client editor**

```typescript
// packages/crm/src/app/(dashboard)/proposals/template/template-editor.tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveProposalTemplateAction } from "@/lib/proposals/actions";
import type { AgencyProposalTemplate } from "@/db/schema/agency-profile";

const SAMPLE_VARS = {
  prospectName: "Roofs by Shiloh",
  prospectFirstName: "Shiloh",
  agencyName: "Max Agency",
  price: "$497",
};

function substitute(copy: string): string {
  return copy.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    key in SAMPLE_VARS ? SAMPLE_VARS[key as keyof typeof SAMPLE_VARS] : `{{${key}}}`,
  );
}

export function TemplateEditor({ template }: { template: AgencyProposalTemplate }) {
  const [draft, setDraft] = useState(template);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleChange<K extends keyof AgencyProposalTemplate>(
    key: K,
    value: AgencyProposalTemplate[K],
  ) {
    setDraft({ ...draft, [key]: value });
    setSaved(false);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await saveProposalTemplateAction(draft);
      if (!result.ok) setError(result.error);
      else setSaved(true);
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <section className="space-y-4">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Proposal template</h1>
          <p className="text-sm text-muted-foreground">
            Edit the copy every proposal you send uses. Use{" "}
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{"{{prospectName}}"}</code>{" "}
            and{" "}
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{"{{price}}"}</code>{" "}
            for substitution.
          </p>
        </header>

        <div className="space-y-2">
          <Label htmlFor="subject">Email subject</Label>
          <Input
            id="subject"
            value={draft.subject}
            onChange={(e) => handleChange("subject", e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="intro">Intro</Label>
          <Textarea
            id="intro"
            rows={4}
            value={draft.introCopy}
            onChange={(e) => handleChange("introCopy", e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="scope">What's included</Label>
          <Textarea
            id="scope"
            rows={3}
            value={draft.scopeCopy}
            onChange={(e) => handleChange("scopeCopy", e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="timeline">Timeline</Label>
          <Textarea
            id="timeline"
            rows={3}
            value={draft.timelineCopy}
            onChange={(e) => handleChange("timelineCopy", e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="terms">Terms</Label>
          <Textarea
            id="terms"
            rows={3}
            value={draft.termsCopy}
            onChange={(e) => handleChange("termsCopy", e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving…" : "Save template"}
          </Button>
          {saved && <span className="text-sm text-emerald-600">Saved</span>}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Live preview</h2>
        <div className="rounded-2xl border bg-card p-6 space-y-4">
          <h3 className="text-2xl font-semibold">{substitute(draft.subject)}</h3>
          <p>{substitute(draft.introCopy)}</p>
          <p className="font-medium">What's included</p>
          <p>{substitute(draft.scopeCopy)}</p>
          <p className="font-medium">Timeline</p>
          <p>{substitute(draft.timelineCopy)}</p>
          <p className="text-sm text-muted-foreground">{substitute(draft.termsCopy)}</p>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Add the save action to actions.ts**

Append to `packages/crm/src/lib/proposals/actions.ts`:

```typescript
import type { AgencyProposalTemplate } from "@/db/schema/agency-profile";

export async function saveProposalTemplateAction(
  template: AgencyProposalTemplate,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "unauthorized" };

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!user) return { ok: false, error: "user_not_found" };

  if (!template.subject?.trim() || !template.introCopy?.trim()) {
    return { ok: false, error: "subject_and_intro_required" };
  }

  const nextProfile = { ...user.agencyProfile, proposalTemplate: template };
  await db
    .update(users)
    .set({ agencyProfile: nextProfile, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  revalidatePath("/proposals/template");
  return { ok: true };
}
```

- [ ] **Step 4: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/app/(dashboard)/proposals/template/ packages/crm/src/lib/proposals/actions.ts
git commit -m "feat(proposals): /proposals/template editor with live preview

Two-column layout: editor on the left, sample-rendered preview on the
right. Variables {{prospectName}}, {{price}}, {{agencyName}} swap in
sample values for the preview. Saves to users.agency_profile.proposalTemplate."
```

---

## Phase 8 — Lead-to-Workspace one-click wiring (~0.5 day)

The plumbing already exists via `createFullWorkspace`. This task just adds the `?source=proposal` query param so the existing `/clients/new` flow can be reused without showing operator-facing chrome.

### Task 8.1: Wire ?source=proposal into /clients/new

**Files:**
- Modify: `packages/crm/src/app/(dashboard)/clients/new/page.tsx`

- [ ] **Step 1: Read source param and pass to the form**

Update `packages/crm/src/app/(dashboard)/clients/new/page.tsx`:

```typescript
// packages/crm/src/app/(dashboard)/clients/new/page.tsx
// Server component for the post-signup "paste a URL" screen.
// Spec §"New frontend page" (Cut A).
//
// 2026-05-19 — supports ?source=proposal so the Proposal Builder flow can
// pass operators through this same screen without showing the operator-
// landing chrome. Spec: 2026-05-19-proposal-builder-design.md §"Lead-to-
// Workspace one-click".

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ClientsNewForm } from "./clients-new-form";

export const dynamic = "force-dynamic";

export default async function ClientsNewPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/clients/new");
  }
  const { source } = await searchParams;

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <ClientsNewForm source={source ?? "default"} />
    </main>
  );
}
```

- [ ] **Step 2: Surface the source flag in the form**

In `packages/crm/src/app/(dashboard)/clients/new/clients-new-form.tsx`, add a `source` prop. If `source === "proposal"`, hide the operator-onboarding chrome (welcome text, agency setup banners) and instead show a one-liner "Generating proposal workspace…". Pass `source: "proposal"` to the POST body so the API can flag the resulting workspace.

Specifically, locate the form's React component signature and props:

```typescript
export function ClientsNewForm({ source = "default" }: { source?: string }) {
  // ... existing state ...

  // 2026-05-19 — when source=proposal, the form is being used as an
  // implementation detail of /proposals/new, so suppress the agency
  // onboarding chrome and surface just the URL input + spinner.
  const compact = source === "proposal";
```

Use `compact` to conditionally render the page header / agency-setup hints.

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/app/(dashboard)/clients/new/
git commit -m "feat(proposals): /clients/new accepts ?source=proposal

When source=proposal, the form renders in compact mode (URL input
only). Lets the Proposal Builder flow reuse the existing /clients/new
plumbing without duplicating the operator-onboarding chrome."
```

---

## Phase 9 — Integration tests + rollout (~1 day)

### Task 9.1: End-to-end integration test (mocked Stripe)

**Files:**
- Create: `packages/crm/tests/integration/proposal-flow.spec.ts`

- [ ] **Step 1: Write the integration test**

```typescript
// packages/crm/tests/integration/proposal-flow.spec.ts
// 2026-05-19 — Proposal Builder end-to-end test with mocked Stripe and
// LLM. Covers: create → send → view → accept → webhook → activation.

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { db } from "@/db";
import {
  organizations,
  proposals,
  proposalEvents,
  users,
} from "@/db/schema";
import { createProposal } from "@/lib/proposals/create";
import { activateProposalWorkspace } from "@/lib/proposals/activate-workspace";
import { eq } from "drizzle-orm";

describe("Proposal flow end-to-end", () => {
  let agencyOrgId: string;
  let agencyUserId: string;
  let workspaceId: string;

  beforeAll(async () => {
    // Insert agency org + user
    const [org] = await db
      .insert(organizations)
      .values({ name: "Test Agency", slug: `test-agency-${Date.now()}` })
      .returning();
    agencyOrgId = org.id;

    const [user] = await db
      .insert(users)
      .values({
        orgId: agencyOrgId,
        name: "Test Agency Operator",
        email: `agency-${Date.now()}@example.com`,
        agencyProfile: { name: "Test Agency" },
      })
      .returning();
    agencyUserId = user.id;

    // Pre-create a preview workspace
    const [ws] = await db
      .insert(organizations)
      .values({
        name: "Test Prospect",
        slug: `test-prospect-${Date.now()}`,
        previewMode: true,
      })
      .returning();
    workspaceId = ws.id;
  });

  afterAll(async () => {
    // Cleanup is destructive — only run in dedicated test DB
    await db.delete(organizations).where(eq(organizations.id, agencyOrgId));
    await db.delete(organizations).where(eq(organizations.id, workspaceId));
  });

  it("creates a proposal in draft status with a signed token", async () => {
    const proposal = await createProposal({
      agencyOrgId,
      createdByUserId: agencyUserId,
      prospectUrl: "https://test-prospect.example.com",
      prospectName: "Test Prospect",
      prospectEmail: "prospect@example.com",
      prospectServices: ["test service"],
      agencyName: "Test Agency",
      pricing: { tier: "growth" },
      previewWorkspaceId: workspaceId,
      generateHtml: async () => "<section><h1>Test</h1></section>",
    });

    expect(proposal.status).toBe("draft");
    expect(proposal.signedToken).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(proposal.monthlyPriceCents).toBe(49700);
    expect(proposal.previewWorkspaceId).toBe(workspaceId);

    const events = await db
      .select()
      .from(proposalEvents)
      .where(eq(proposalEvents.proposalId, proposal.id));
    expect(events.map((e) => e.eventType)).toContain("created");
  });

  it("activateProposalWorkspace flips workspace + status to accepted", async () => {
    const [draft] = await db
      .select()
      .from(proposals)
      .where(eq(proposals.agencyOrgId, agencyOrgId))
      .limit(1);

    await activateProposalWorkspace({
      proposalId: draft.id,
      workspaceId,
      stripeSubscriptionId: "sub_test123",
      stripeCustomerId: "cus_test456",
      sessionId: "cs_test789",
    });

    const [updated] = await db
      .select()
      .from(proposals)
      .where(eq(proposals.id, draft.id))
      .limit(1);
    expect(updated.status).toBe("accepted");
    expect(updated.stripeSubscriptionId).toBe("sub_test123");

    const [ws] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, workspaceId))
      .limit(1);
    expect(ws.previewMode).toBe(false);

    const events = await db
      .select()
      .from(proposalEvents)
      .where(eq(proposalEvents.proposalId, draft.id));
    const types = events.map((e) => e.eventType);
    expect(types).toContain("checkout_success");
    expect(types).toContain("workspace_activated");
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `pnpm test:integration tests/integration/proposal-flow.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 3: Commit**

```bash
git add packages/crm/tests/integration/proposal-flow.spec.ts
git commit -m "test(proposals): end-to-end integration covering create → activate"
```

### Task 9.2: Rollout doc

**Files:**
- Create: `docs/architecture/proposal-builder.md`

- [ ] **Step 1: Write the doc**

```markdown
# Proposal Builder — architecture reference

**Status:** Shipped 2026-05-19
**Spec:** `docs/superpowers/specs/2026-05-19-proposal-builder-design.md`
**Plan:** `docs/superpowers/plans/2026-05-19-proposal-builder.md`

## What it is

An agency operator sends a branded, AI-generated proposal to a prospect with a **live working workspace already built** as part of the pitch. Prospect clicks Accept → Stripe Checkout → recurring subscription on the agency's Stripe account (SeldonFrame takes 0%) → preview workspace flips to active → onboarding email fires.

## Critical files

| Concern | File |
|---|---|
| Data model | `packages/crm/drizzle/0049_proposals.sql` + `packages/crm/src/db/schema/proposals.ts` + `proposal-events.ts` |
| Lifecycle transitions | `packages/crm/src/lib/proposals/status.ts` |
| Signed tokens | `packages/crm/src/lib/proposals/signed-token.ts` |
| Stripe Connect | `packages/crm/src/lib/proposals/stripe-connect.ts` + `/api/v1/proposals/connect/{start,return}` |
| HTML generation | `packages/crm/src/lib/proposals/generate-html.ts` |
| Orchestrator | `packages/crm/src/lib/proposals/create.ts` |
| Checkout | `packages/crm/src/lib/proposals/checkout.ts` + `/p/[token]/accept/route.ts` |
| Webhook | `packages/crm/src/app/api/webhooks/stripe/connect/route.ts` (extended) |
| Activation | `packages/crm/src/lib/proposals/activate-workspace.ts` |
| Per-agency template | `users.agency_profile.proposalTemplate` JSONB |

## Env vars

- `STRIPE_CONNECT_CLIENT_ID` — Connect Express client id from Stripe Dashboard
- `STRIPE_CONNECT_WEBHOOK_SECRET` — signing secret for Connect events
- `STRIPE_SECRET_KEY` — existing platform key (reused)
- `NEXT_PUBLIC_APP_URL` — base for Stripe return URLs (existing)
- `WORKSPACE_BASE_DOMAIN` — workspace subdomain suffix (existing)

## Health checks

- Visit `/proposals/onboarding` — Connect status pill renders Ready / Pending / Not connected
- Check `stripe_connections` table for the agency's `org_id` row with `is_active=true`
- Send a test proposal to your own email, click the public link, click Accept, check that `proposals.status` flips to `accepted` and the workspace `preview_mode` flips to `false`

## Common ops

### "Agency onboarding stuck on Pending"

The Stripe-hosted Express onboarding sometimes leaves an account in a `payouts_enabled=false, charges_enabled=true` state pending bank verification. Re-issue an onboarding link from the operator's view:

```ts
const link = await stripe.accountLinks.create({
  account: "acct_xxx",
  type: "account_onboarding",
  return_url: "https://app.seldonframe.com/api/v1/proposals/connect/return?account_id=acct_xxx",
  refresh_url: "https://app.seldonframe.com/proposals/onboarding?retry=1",
});
```

### "Preview workspace stuck — webhook never fired"

Check the Stripe Dashboard → Developers → Webhooks for the Connect endpoint. The Connect webhook is distinct from the platform webhook. If the proposal `status='accepted'` is not set but the Stripe subscription exists, look for the event in the dashboard's failed-delivery list and re-send.

Manual recovery (last resort):

```sql
UPDATE proposals SET status='accepted', accepted_at=NOW(), stripe_subscription_id='sub_xxx', stripe_customer_id='cus_xxx' WHERE id='prop_xxx';
UPDATE organizations SET preview_mode=false WHERE id='ws_xxx';
```

### "Prospect clicked Accept twice — got two subscriptions"

Idempotency key on the Checkout session create call is `proposal-{id}`. If Stripe is returning a duplicate, check the proposals.stripe_checkout_session_id column — should be set on first Accept and unchanged on retry.

## Failure modes + fallbacks

| Failure | Fallback |
|---|---|
| Soul extraction fails on prospect URL | Operator manually fills the prospect_name + services in /proposals/new |
| LLM HTML generation times out | Retry once with a shorter prompt; if still fails, fall back to a default template-substituted HTML |
| Preview workspace provisioning fails | proposal row still creates with `preview_workspace_id=null`; the public page hides the iframe section gracefully |
| Email send fails (Resend down) | proposals.status remains `draft`; operator retries from /proposals/[id] |
| Stripe webhook arrives out of order | activateProposalWorkspace is idempotent — re-runs harmlessly |

## Feature flag

Set `PROPOSAL_BUILDER_ENABLED=false` to hide all proposal surfaces (UI navigation, /proposals routes) for emergency rollback. Backend tables remain intact.
```

- [ ] **Step 2: Commit**

```bash
git add docs/architecture/proposal-builder.md
git commit -m "docs(proposals): architecture reference + ops runbook"
```

### Task 9.3: Run full typecheck + test suite

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS — no new errors compared to baseline.

- [ ] **Step 2: Run unit tests**

Run: `pnpm test:unit`
Expected: PASS — new tests from Phase 0-7 all pass. Count: 7 (signed-token) + 10 (status) + 3 (stripe-connect) + 6 (generate-html) + 7 (create) + 5 (load-by-token) + 5 (checkout) + 2 (activate-workspace) = **45 new tests**. Pre-existing failing tests (workflow-event-log, category-server-actions, block-codegen-staleness, SLICE 9 archetype-isolation, theme integration) remain — those are unrelated and have been failing on origin/main; do not block on them.

- [ ] **Step 3: Run integration tests**

Run: `pnpm test:integration tests/integration/proposal-flow.spec.ts`
Expected: PASS (2 new tests).

- [ ] **Step 4: Commit nothing (verification only)**

If new failures appear, fix them inline before proceeding to Task 9.4.

### Task 9.4: 30-day TTL — auto-archive unaccepted preview workspaces

**Files:**
- Create: `packages/crm/src/lib/proposals/expire-stale.ts`
- Create: `packages/crm/src/app/api/cron/expire-proposals/route.ts`
- Modify: `packages/crm/vercel.json` (add cron entry)
- Test: `packages/crm/tests/unit/proposals/expire-stale.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/crm/tests/unit/proposals/expire-stale.spec.ts
import { describe, it, expect } from "vitest";
import { selectExpirationCutoff } from "@/lib/proposals/expire-stale";

describe("selectExpirationCutoff", () => {
  it("returns now - 30 days when no override", () => {
    const now = new Date("2026-05-19T00:00:00Z");
    const cutoff = selectExpirationCutoff({ now });
    expect(cutoff.toISOString()).toBe("2026-04-19T00:00:00.000Z");
  });

  it("honors override days", () => {
    const now = new Date("2026-05-19T00:00:00Z");
    const cutoff = selectExpirationCutoff({ now, days: 7 });
    expect(cutoff.toISOString()).toBe("2026-05-12T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit tests/unit/proposals/expire-stale.spec.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```typescript
// packages/crm/src/lib/proposals/expire-stale.ts
// 2026-05-19 — Proposal Builder. Daily cleanup: any proposal in
// sent/viewed status past expires_at gets flipped to 'expired', and
// the associated preview workspace is archived (preview_mode stays
// true but soft-delete via organizations.archivedAt if that column
// exists; otherwise just leave preview_mode + log the event). Spec
// open-question #2 (30-day TTL).

import { and, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { proposalEvents, proposals } from "@/db/schema";

export function selectExpirationCutoff(input: { now: Date; days?: number }): Date {
  const days = input.days ?? 30;
  return new Date(input.now.getTime() - days * 24 * 60 * 60 * 1000);
}

export async function expireStaleProposals(now: Date = new Date()): Promise<{
  expired: number;
}> {
  const stale = await db
    .select({ id: proposals.id })
    .from(proposals)
    .where(
      and(
        inArray(proposals.status, ["sent", "viewed"]),
        lt(proposals.expiresAt, now),
      ),
    );

  if (stale.length === 0) return { expired: 0 };

  const ids = stale.map((r) => r.id);
  await db
    .update(proposals)
    .set({ status: "expired", updatedAt: now })
    .where(inArray(proposals.id, ids));

  await db.insert(proposalEvents).values(
    ids.map((id) => ({
      proposalId: id,
      eventType: "expired" as const,
      metadata: { reason: "ttl_30d" },
    })),
  );

  return { expired: stale.length };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit tests/unit/proposals/expire-stale.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the cron route**

```typescript
// packages/crm/src/app/api/cron/expire-proposals/route.ts
// 2026-05-19 — Daily cron via Vercel. Spec open-question #2.

import { NextResponse } from "next/server";
import { expireStaleProposals } from "@/lib/proposals/expire-stale";

export const runtime = "nodejs";

export async function GET(request: Request) {
  // Vercel Cron sends a header we can verify
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await expireStaleProposals();
  return NextResponse.json(result);
}
```

- [ ] **Step 6: Add cron schedule**

Edit `packages/crm/vercel.json` and add to the `crons` array:

```json
{
  "path": "/api/cron/expire-proposals",
  "schedule": "0 3 * * *"
}
```

(Runs daily at 03:00 UTC.)

- [ ] **Step 7: Commit**

```bash
git add packages/crm/src/lib/proposals/expire-stale.ts packages/crm/src/app/api/cron/expire-proposals/route.ts packages/crm/vercel.json packages/crm/tests/unit/proposals/expire-stale.spec.ts
git commit -m "feat(proposals): daily TTL cron — auto-expire unaccepted proposals

Proposals in sent/viewed status past expires_at get flipped to expired.
30-day default TTL per spec open-question #2. Cron runs daily 03:00 UTC."
```

### Task 9.5: Tier gate — enforce Growth 10/mo cap

**Files:**
- Create: `packages/crm/src/lib/proposals/check-tier-quota.ts`
- Modify: `packages/crm/src/app/api/v1/proposals/route.ts` (call the gate before creation)
- Test: `packages/crm/tests/unit/proposals/check-tier-quota.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/crm/tests/unit/proposals/check-tier-quota.spec.ts
import { describe, it, expect } from "vitest";
import { evaluateProposalQuota } from "@/lib/proposals/check-tier-quota";

describe("evaluateProposalQuota", () => {
  it("allows scale tier unlimited", () => {
    expect(evaluateProposalQuota({ tier: "scale", proposalsThisMonth: 50 })).toEqual({
      allowed: true,
    });
  });

  it("allows growth tier under the 10 cap", () => {
    expect(evaluateProposalQuota({ tier: "growth", proposalsThisMonth: 9 })).toEqual({
      allowed: true,
      remaining: 1,
    });
  });

  it("blocks growth tier at the 10 cap", () => {
    expect(evaluateProposalQuota({ tier: "growth", proposalsThisMonth: 10 })).toEqual({
      allowed: false,
      reason: "monthly_quota_exceeded",
      capacity: 10,
    });
  });

  it("blocks free tier entirely", () => {
    expect(evaluateProposalQuota({ tier: "free", proposalsThisMonth: 0 })).toEqual({
      allowed: false,
      reason: "tier_does_not_include_proposals",
      capacity: 0,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit tests/unit/proposals/check-tier-quota.spec.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Write the implementation**

```typescript
// packages/crm/src/lib/proposals/check-tier-quota.ts
// 2026-05-19 — Proposal Builder tier gate. Spec open-question #5.
// Growth: 10/mo cap. Scale: unlimited. Free: blocked.

const GROWTH_MONTHLY_CAP = 10;

export type ProposalQuotaResult =
  | { allowed: true; remaining?: number }
  | { allowed: false; reason: string; capacity: number };

export function evaluateProposalQuota(input: {
  tier: string;
  proposalsThisMonth: number;
}): ProposalQuotaResult {
  if (input.tier === "scale") return { allowed: true };
  if (input.tier === "growth") {
    if (input.proposalsThisMonth >= GROWTH_MONTHLY_CAP) {
      return {
        allowed: false,
        reason: "monthly_quota_exceeded",
        capacity: GROWTH_MONTHLY_CAP,
      };
    }
    return { allowed: true, remaining: GROWTH_MONTHLY_CAP - input.proposalsThisMonth };
  }
  return { allowed: false, reason: "tier_does_not_include_proposals", capacity: 0 };
}

import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { proposals } from "@/db/schema";

export async function countProposalsThisMonth(agencyOrgId: string): Promise<number> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const rows = await db
    .select({ id: proposals.id })
    .from(proposals)
    .where(
      and(
        eq(proposals.agencyOrgId, agencyOrgId),
        gte(proposals.createdAt, monthStart),
      ),
    );
  return rows.length;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit tests/unit/proposals/check-tier-quota.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire the gate into POST /api/v1/proposals**

In `packages/crm/src/app/api/v1/proposals/route.ts`, before the soul-extraction step (immediately after loading `user`):

```typescript
import { countProposalsThisMonth, evaluateProposalQuota } from "@/lib/proposals/check-tier-quota";

// ... inside POST, after loading user ...

const tier = user.planId ?? "free";
const usedThisMonth = await countProposalsThisMonth(user.orgId);
const quota = evaluateProposalQuota({ tier, proposalsThisMonth: usedThisMonth });
if (!quota.allowed) {
  return NextResponse.json(
    { error: quota.reason, capacity: quota.capacity },
    { status: 402 },
  );
}
```

- [ ] **Step 6: Verify typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/crm/src/lib/proposals/check-tier-quota.ts packages/crm/src/app/api/v1/proposals/route.ts packages/crm/tests/unit/proposals/check-tier-quota.spec.ts
git commit -m "feat(proposals): Growth tier 10/mo cap, Scale unlimited

evaluateProposalQuota gates proposal creation by tier (open-question #5
in the spec). Returns 402 with a clear reason code so the client can
show 'upgrade' messaging."
```

### Task 9.6: Manual smoke test on Vercel preview

**This task is surfaced to the user to run, not executed autonomously.**

When the implementer reaches Task 9.6, pause and ask the user to:

1. Open the Vercel preview deploy for the branch
2. Sign in as the agency operator
3. Visit `/proposals/onboarding` — connect a Stripe TEST account
4. Click "New proposal" — paste a real URL, use a custom email (e.g., their own + alias)
5. Click "Generate" — confirm workspace provisions in <60s
6. Edit price, click "Send" — confirm email arrives
7. Open the public proposal link — confirm iframe + screenshots render, brand color applies
8. Click Accept — confirm Stripe TEST Checkout opens
9. Complete checkout with test card `4242 4242 4242 4242`
10. Confirm:
    - Agency notification email arrives
    - Prospect onboarding email arrives
    - `proposals.status = accepted` in the DB
    - Workspace `preview_mode = false` in the DB
    - Visiting `/p/[token]/success` shows the success screen

Document any issues found; fix in a new commit before merging the PR.

---

## Self-review

### Spec coverage

| Spec section | Implementing task(s) |
|---|---|
| Goal + success criterion | Whole plan (Phases 0-9) |
| Locked decisions #1 Connect Express direct charges | Phase 1 (1.2, 1.3, 1.4) + Phase 5 (5.2) |
| Locked decisions #2 workspace provisioning at send time | Task 2.1 + 2.4 (createFullWorkspace with preview_mode) |
| Locked decisions #3 iframe + screenshots | Tasks 4.2 + 4.3 + 4.4 |
| Locked decisions #4 dedicated proposals table | Tasks 0.1 + 0.2 |
| Locked decisions #5 UUID + signed token | Task 0.6 |
| Locked decisions #6 per-agency template | Task 0.4 + Phase 7 |
| Locked decisions #7 three pricing presets | Task 2.3 (PROPOSAL_TIER_PRICES) |
| Locked decisions #8 Checkout hosted | Task 5.1 + 5.2 |
| Locked decisions #9 0% cut (no application_fee) | Verify Task 5.1 — params builder omits `application_fee_amount` |
| Locked decisions #10 idempotency via session ID | Task 5.2 (idempotencyKey: `proposal-{id}`) + Task 6.3 (status check before re-applying) |
| Data model: proposals table | Tasks 0.1 + 0.2 |
| Data model: proposal_events table | Tasks 0.1 + 0.3 |
| Data model: agency_profile.proposalTemplate | Task 0.4 |
| Architecture flow 1 agency onboarding | Phase 1 |
| Architecture flow 2 proposal creation | Phase 2 |
| Architecture flow 3 operator review + send | Phase 3 |
| Architecture flow 4 prospect views | Phase 4 |
| Architecture flow 5 accept → Checkout | Phase 5 |
| Architecture flow 6 webhook → activation | Phase 6 |
| Architecture flow 7 recurring billing | Stripe handles automatically (no code) |
| Killer detail: live workspace preview | Task 4.2 + 4.4 |
| Migration risk + rollback | Task 0.1 uses `IF NOT EXISTS`; Task 9.2 documents feature flag |
| Operator-facing surfaces | Tasks 1.5 (onboarding), 7.1 (template), 3.2 (list), 2.5 (new), 3.3 (edit) |
| Public surfaces | Tasks 4.4 (page), 5.2 (accept), 4.5 (decline), 5.3 (success/cancel) |

### Type consistency

- `ProposalStatus` defined in `db/schema/proposals.ts` consumed by `status.ts`, `actions.ts`, `proposal-status-pill.tsx`, `load-by-token.ts` — all use the same union.
- `ProposalPricingTier` defined in `db/schema/proposals.ts` consumed by `create.ts` — same union.
- `ProposalScopeItem` defined in `db/schema/proposals.ts` consumed by `actions.ts` + `proposal-editor.tsx` — same shape.
- `AgencyProposalTemplate` defined in `db/schema/agency-profile.ts` consumed by `generate-html.ts`, `actions.ts`, `template-editor.tsx` — same shape.
- `buildCheckoutSessionParams` input fields (proposalId, monthlyPriceCents, signedToken) match the keys read by the webhook in Task 6.3 (`session.subscription_data.metadata.proposal_id`, `.signed_token`).
- `activateProposalWorkspace` signature in Task 6.1 matches the call site in Task 6.3.

### Placeholder scan

Run final mental scan — no "TBD", "TODO", "implement later", or "add error handling" without inline code. Every step that changes code includes the actual code; every command includes the actual command + expected output.

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-05-19-proposal-builder.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
