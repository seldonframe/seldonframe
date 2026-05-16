# Cut A: SeldonFrame Web Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the web front door for SeldonFrame — agencies sign up, paste a client URL on `/clients/new`, and a workspace is created in under 60 seconds via Anthropic `web_fetch` extraction streamed back over SSE.

**Architecture:** Add `agency_profile` JSONB to `users` for agency identity. Introduce one new SSE endpoint `POST /api/v1/web/workspaces/create-from-url` that auths, enforces a workspace-creation tier limit, requires a BYOK Anthropic key, calls Anthropic `web_fetch` with the operator's key, parses the extracted business facts, then composes the existing `createWorkspaceFromSoulAction` helper while emitting phase events. The frontend `/clients/new` page consumes the stream, renders inline narration, and handles 412 (BYOK prompt), 402 (UpgradeModal — defined here, reused by Cut B/C), and 422/500 (error banners). Dashboard gets a CTA + usage badge. SetupWizard is deleted; every `/setup` redirect retargets `/clients/new`.

**Tech Stack:** Next.js 16.2 App Router (`packages/crm`), Drizzle ORM + Postgres, NextAuth (existing `@/auth`), Anthropic SDK 0.x (`@anthropic-ai/sdk`), `node:test` + `tsx` for unit tests at `packages/crm/tests/unit/**`, Tailwind v4 + shadcn primitives.

**Spec:** `docs/superpowers/specs/2026-05-16-seldonframe-web-onboarding-pivot-design.md` (commit `b71fd47b`).

**Pre-existing failing tests on origin/main (NOT caused by this plan, do not try to fix):**
- `workflow-event-log/category-server-actions`
- `block-codegen-staleness`
- SLICE 9 archetype-isolation
- theme integration

---

## File Structure

### Created — backend

| Path | Purpose |
|------|---------|
| `packages/crm/drizzle/0099_users_agency_profile.sql` | Drizzle migration: add `agency_profile JSONB NOT NULL DEFAULT '{}'::jsonb` to `users`, backfill from primary org name |
| `packages/crm/src/db/schema/agency-profile.ts` | TypeScript type `AgencyProfile` (`name`, `logo_url`, `brand_color`, `website_url`) |
| `packages/crm/src/lib/web-onboarding/byok-resolver.ts` | `getOperatorByokAnthropicKey({ orgId })` — loads `organizations.integrations`, decrypts `anthropic.apiKey`, returns `{ key, source }` or `null` |
| `packages/crm/src/lib/web-onboarding/url-validator.ts` | `validateCreateFromUrlInput(raw)` — trims, regex-tests, returns `{ ok, url }` or `{ ok: false, code: "invalid_url" }` |
| `packages/crm/src/lib/web-onboarding/extraction-prompt.ts` | `EXTRACTION_INSTRUCTIONS` constant + `REQUIRED_FIELDS_SCHEMA` shape (TypeScript type + JSON Schema for the system prompt) |
| `packages/crm/src/lib/web-onboarding/extraction-parser.ts` | `parseExtraction(rawText: string)` — extracts JSON, validates against `extractedBusinessFactsSchema` (Zod), returns `{ ok, data }` or `{ ok: false, reason }` |
| `packages/crm/src/lib/web-onboarding/sse.ts` | SSE helper: `createSseStream()` returns `{ stream, emit(event, data), close(), error(code, body) }` |
| `packages/crm/src/lib/web-onboarding/workspace-limit.ts` | `enforceWorkspaceLimit({ userId })` — returns `{ allowed: true, tier, used, limit }` or `{ allowed: false, tier, used, limit, upgradeUrl }` |
| `packages/crm/src/lib/web-onboarding/web-fetch-extractor.ts` | `extractBusinessFactsFromUrl({ url, byokKey })` — instantiates Anthropic SDK, calls `messages.create` with `web_fetch` server tool, returns parsed facts or throws typed `WebFetchError` |
| `packages/crm/src/app/api/v1/web/workspaces/create-from-url/route.ts` | The SSE endpoint — composes all of the above |

### Created — frontend

| Path | Purpose |
|------|---------|
| `packages/crm/src/components/billing/upgrade-modal.tsx` | The reusable upgrade modal (Cut A first consumer; Cut B/C reuse this exact file) |
| `packages/crm/src/app/(dashboard)/clients/new/page.tsx` | Server component — page chrome, auth gate, renders client form |
| `packages/crm/src/app/(dashboard)/clients/new/clients-new-form.tsx` | Client component — URL form, EventSource consumer, progress narration, error states |
| `packages/crm/src/components/dashboard/create-client-cta.tsx` | Client component — primary button + usage badge wrapper, opens UpgradeModal when at limit |

### Created — tests

| Path | Purpose |
|------|---------|
| `packages/crm/tests/unit/web-onboarding/url-validator.spec.ts` | URL validator (5 cases per spec) |
| `packages/crm/tests/unit/web-onboarding/extraction-parser.spec.ts` | Parser (well-formed, malformed, missing required fields, fenced ```json block) |
| `packages/crm/tests/unit/web-onboarding/byok-resolver.spec.ts` | BYOK precondition (key present + encrypted, empty string, undecryptable, no integrations row) |
| `packages/crm/tests/unit/web-onboarding/workspace-limit.spec.ts` | Tier-limit branch (Free under limit, Free at limit, Growth under, Growth at, Scale unlimited) |
| `packages/crm/tests/unit/web-onboarding/sse.spec.ts` | SSE helper emits `event:` + `data:` framing, closes cleanly, error frames |
| `packages/crm/tests/unit/web-onboarding/extraction-prompt.spec.ts` | The prompt mentions REQUIRED_FIELDS_SCHEMA keys (snapshot guard) |
| `packages/crm/tests/unit/web-onboarding/web-fetch-extractor.spec.ts` | Calls mocked Anthropic SDK with `tools: [{ type: "web_fetch_20250910" }]`, correct beta header, surfaces `extraction_failed` on bad output |
| `packages/crm/tests/unit/web-onboarding/route-create-from-url.spec.ts` | End-to-end SSE flow with all dependencies mocked: 401, 400, 412, 402, 422, success-path event sequence |
| `packages/crm/tests/unit/web-onboarding/upgrade-modal.spec.tsx` | UpgradeModal renders both tiers, both upgrade buttons POST to `/api/stripe/checkout`, "Maybe later" closes |
| `packages/crm/tests/unit/web-onboarding/clients-new-form.spec.tsx` | Form submit opens EventSource; renders narration checkmarks per event; 412 swaps to BYOK form; 402 opens modal |

### Modified

| Path | Change |
|------|--------|
| `packages/crm/src/db/schema/users.ts` | Add `agencyProfile: jsonb("agency_profile").$type<AgencyProfile>().notNull().default(sql\`'{}'::jsonb\`)` |
| `packages/crm/src/db/schema/index.ts` (if it re-exports) | Re-export `AgencyProfile` type |
| `packages/crm/src/app/(dashboard)/dashboard/page.tsx` | Insert `<CreateClientCta />` in dashboard header; pass `tier/used/limit` from `enforceWorkspaceLimit` server-side |
| `packages/crm/src/app/(auth)/signup/signup-form.tsx:24` | Change `const callbackUrl = token ? ... : "/setup"` → `"/clients/new"` |
| `packages/crm/src/app/(auth)/signup/actions.ts:40,49` | Replace both `"/setup"` literals with `"/clients/new"` |
| `packages/crm/src/app/(auth)/login/login-form.tsx:52` | Replace `callbackInput.value = "/setup"` with `"/clients/new"` |
| `packages/crm/src/app/(onboarding)/welcome/page.tsx:25` | `redirect("/setup")` → `redirect("/clients/new")` |
| `packages/crm/src/proxy.ts:110,194,207,208` | Replace `/setup` literal in `isPublicPath` and the unfinished-soul redirect with `/clients/new` |
| `packages/crm/src/components/layout/dashboard-topbar.tsx:31` | `"/setup": "Soul Setup"` → `"/clients/new": "New Client"` |
| `packages/crm/src/lib/billing/actions.ts:70,163` | Replace `/setup?plan=...` Stripe success URL fragments with `/clients/new?plan=...` |
| `packages/crm/src/lib/integrations/actions.ts:232,298` | `revalidatePath("/setup")` → `revalidatePath("/clients/new")` |

### Deleted

| Path | Why |
|------|-----|
| `packages/crm/src/app/(onboarding)/setup/page.tsx` | SetupWizard entry point — replaced by `/clients/new` |
| `packages/crm/src/components/soul/setup-wizard.tsx` | The wizard itself — no remaining importer after this Cut |
| `packages/crm/src/app/orgs/new/page.tsx` | Imports `SetupWizard`; out of scope path — remove rather than keep dead |

**NOT modified (out of scope):**
- `packages/crm/src/app/(onboarding)/welcome/` directory body — keep as a celebration page (spec §7 says future spec decides its fate)
- `packages/crm/src/lib/billing/orgs.ts createWorkspaceFromSoulAction` — reused as-is for the workspace-build call from inside the new SSE route
- Cut B's `/clients` page, `/api/v1/web/workspaces/mine`, `hasFeature`, `/settings/agency-profile` — separate plan
- Cut C's marketing site rebuild — separate plan

---

## Inter-Cut interfaces produced by Cut A

These are referenced (not redefined) by Cut B and Cut C plans:

1. **`<UpgradeModal>`** at `packages/crm/src/components/billing/upgrade-modal.tsx` — exports `UpgradeModal`, `UpgradeModalProps = { open: boolean; onOpenChange: (open: boolean) => void; tier: "free"|"growth"; used: number; limit: number }`
2. **`users.agency_profile`** JSONB column — shape `AgencyProfile` at `packages/crm/src/db/schema/agency-profile.ts`
3. **`POST /api/v1/web/workspaces/create-from-url`** — SSE shape documented inline in the route file
4. **`enforceWorkspaceLimit({ userId })`** at `packages/crm/src/lib/web-onboarding/workspace-limit.ts` — returns `{ allowed: boolean, tier: "free"|"growth"|"scale", used: number, limit: number, upgradeUrl: string }`

---

## Phase 1 — Schema migration: `users.agency_profile`

### Task 1.1: Write the AgencyProfile TypeScript type

**Files:**
- Create: `packages/crm/src/db/schema/agency-profile.ts`

- [ ] **Step 1: Create the type file**

```typescript
// packages/crm/src/db/schema/agency-profile.ts
// Shape of the users.agency_profile JSONB column added in 0099_users_agency_profile.sql.
// Spec: 2026-05-16-seldonframe-web-onboarding-pivot-design.md §"Schema migration".

export type AgencyProfile = {
  name?: string;
  logo_url?: string;
  brand_color?: string;
  website_url?: string;
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/crm/src/db/schema/agency-profile.ts
git commit -m "feat(web-onboarding): add AgencyProfile TypeScript shape"
```

### Task 1.2: Add the JSONB column to the Drizzle users schema

**Files:**
- Modify: `packages/crm/src/db/schema/users.ts`

- [ ] **Step 1: Add the column**

Open `packages/crm/src/db/schema/users.ts`. Update imports and the table definition:

```typescript
import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import type { AgencyProfile } from "./agency-profile";

export const users = pgTable(
  "users",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    role: text("role").notNull().default("member"),
    avatarUrl: text("avatar_url"),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    passwordHash: text("password_hash"),
    planId: text("plan_id"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    billingPeriod: text("billing_period").notNull().default("monthly"),
    subscriptionStatus: text("subscription_status").notNull().default("trialing"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    agencyProfile: jsonb("agency_profile")
      .$type<AgencyProfile>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("users_org_id_idx").on(table.orgId)]
);
```

- [ ] **Step 2: Verify TypeScript compiles**

Run from repo root:
```bash
pnpm typecheck
```

Expected: success (or only the pre-existing failing-test type errors noted at top — none from `users.ts` or `agency-profile.ts`).

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/db/schema/users.ts
git commit -m "feat(web-onboarding): wire agency_profile JSONB column on users"
```

### Task 1.3: Write the SQL migration

**Files:**
- Create: `packages/crm/drizzle/0099_users_agency_profile.sql`

- [ ] **Step 1: Determine next migration number**

```bash
ls packages/crm/drizzle/*.sql | sort | tail -5
```

Use the next free 4-digit number greater than the latest. The number `0099` below is a placeholder — substitute the real next number in the filename AND in the journal update in Task 1.4.

- [ ] **Step 2: Write the migration**

```sql
-- packages/crm/drizzle/0099_users_agency_profile.sql
-- Adds the agency_profile JSONB column to users for the web-onboarding pivot.
-- Spec: 2026-05-16-seldonframe-web-onboarding-pivot-design.md.
--
-- Backfill rule: for each user that has a primary org (users.org_id), copy the
-- org's name into agency_profile.name so existing accounts get a non-empty
-- agency identity. We do this in a single statement so the migration is idempotent.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "agency_profile" JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE "users" AS u
SET    "agency_profile" = jsonb_build_object('name', o.name)
FROM   "organizations" AS o
WHERE  u.org_id = o.id
  AND  (u.agency_profile = '{}'::jsonb OR u.agency_profile IS NULL)
  AND  o.name IS NOT NULL
  AND  length(o.name) > 0;
```

- [ ] **Step 3: Update the Drizzle journal**

Open `packages/crm/drizzle/meta/_journal.json` and append an entry for the new migration. Use the exact format of the last entry in that file (same `version`, increment `idx`, set `when` to `Date.now()` in ms, set `tag` to the filename without `.sql`).

- [ ] **Step 4: Commit**

```bash
git add packages/crm/drizzle/0099_users_agency_profile.sql packages/crm/drizzle/meta/_journal.json
git commit -m "feat(web-onboarding): add 0099_users_agency_profile migration"
```

### Task 1.4: Smoke-test the migration locally (developer step)

- [ ] **Step 1: Run the migration**

From repo root:
```bash
pnpm --filter @seldonframe/crm db:push
```

Expected: prints the new migration name and exits 0.

- [ ] **Step 2: Verify column exists**

```bash
pnpm --filter @seldonframe/crm db:studio
```

Then in the studio inspect `users.agency_profile` — should be `jsonb NOT NULL DEFAULT '{}'`. Existing rows with an org should have `{ "name": "<org name>" }`. New rows default to `{}`.

This task does NOT produce a commit. It validates the prior commit on the developer's local DB.

---

## Phase 2 — BYOK resolver + Anthropic web_fetch extractor scaffolding

### Task 2.1: Write the byok-resolver test

**Files:**
- Create: `packages/crm/tests/unit/web-onboarding/byok-resolver.spec.ts`

- [ ] **Step 1: Create the test file**

```typescript
// packages/crm/tests/unit/web-onboarding/byok-resolver.spec.ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveByokKeyFromIntegrationsBlob } from "../../../src/lib/web-onboarding/byok-resolver";

describe("resolveByokKeyFromIntegrationsBlob", () => {
  test("returns the plaintext key when integrations.anthropic.apiKey is plaintext", () => {
    const result = resolveByokKeyFromIntegrationsBlob({ anthropic: { apiKey: "sk-ant-plain" } });
    assert.equal(result.key, "sk-ant-plain");
    assert.equal(result.source, "byok");
  });

  test("returns null when integrations is null or undefined", () => {
    assert.deepEqual(resolveByokKeyFromIntegrationsBlob(null), { key: null, source: "missing" });
    assert.deepEqual(resolveByokKeyFromIntegrationsBlob(undefined), { key: null, source: "missing" });
  });

  test("returns null when anthropic.apiKey is an empty string", () => {
    const result = resolveByokKeyFromIntegrationsBlob({ anthropic: { apiKey: "" } });
    assert.equal(result.key, null);
    assert.equal(result.source, "missing");
  });

  test("returns null when the encrypted payload cannot be decrypted", () => {
    // "v1." prefix signals encrypted payload; mangled body will fail decrypt and
    // the resolver swallows the error.
    const result = resolveByokKeyFromIntegrationsBlob({ anthropic: { apiKey: "v1.broken.payload.here" } });
    assert.equal(result.key, null);
    assert.equal(result.source, "undecryptable");
  });
});
```

- [ ] **Step 2: Run the test, expect compile failure**

From repo root:
```bash
cd packages/crm && node --import tsx --test tests/unit/web-onboarding/byok-resolver.spec.ts
```

Expected: FAIL — `Cannot find module '../../../src/lib/web-onboarding/byok-resolver'` (file doesn't exist yet).

### Task 2.2: Implement byok-resolver

**Files:**
- Create: `packages/crm/src/lib/web-onboarding/byok-resolver.ts`

- [ ] **Step 1: Write the resolver**

```typescript
// packages/crm/src/lib/web-onboarding/byok-resolver.ts
// Resolves the operator's BYOK Anthropic key for the web-onboarding extraction
// endpoint. Mirrors the existing pattern in lib/ai/client.ts:107 and
// lib/integrations/newsletter-sync.ts:16, but factored out so the SSE route
// stays thin and the resolver is unit-testable without a DB.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { decryptValue } from "@/lib/encryption";

export type ByokResolverResult = {
  key: string | null;
  source: "byok" | "missing" | "undecryptable";
};

type IntegrationsBlob = {
  anthropic?: { apiKey?: string | null } | null;
} | null | undefined;

function decryptIfNeeded(value: string): string {
  if (!value) {
    return "";
  }

  if (!value.startsWith("v1.")) {
    return value;
  }

  return decryptValue(value);
}

/**
 * Pure function — accepts the decoded integrations JSONB and returns the
 * resolved key + source label. No DB calls. Unit-tested.
 */
export function resolveByokKeyFromIntegrationsBlob(integrations: IntegrationsBlob): ByokResolverResult {
  if (!integrations || typeof integrations !== "object") {
    return { key: null, source: "missing" };
  }

  const raw = integrations.anthropic?.apiKey;
  if (typeof raw !== "string" || raw.length === 0) {
    return { key: null, source: "missing" };
  }

  try {
    const plain = decryptIfNeeded(raw).trim();
    if (!plain) {
      return { key: null, source: "missing" };
    }
    return { key: plain, source: "byok" };
  } catch {
    return { key: null, source: "undecryptable" };
  }
}

/**
 * DB wrapper — loads the integrations blob for the given org and delegates
 * to resolveByokKeyFromIntegrationsBlob. Used by the route handler.
 */
export async function getOperatorByokAnthropicKey(params: { orgId: string }): Promise<ByokResolverResult> {
  const [row] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, params.orgId))
    .limit(1);

  return resolveByokKeyFromIntegrationsBlob(row?.integrations as IntegrationsBlob);
}
```

- [ ] **Step 2: Run the test, expect pass**

```bash
cd packages/crm && node --import tsx --test tests/unit/web-onboarding/byok-resolver.spec.ts
```

Expected: PASS — all 4 tests green. (The `decryptValue` import will throw at runtime only if `ENCRYPTION_KEY` is unset AND the payload starts with `v1.`. The "undecryptable" test path triggers that; ensure `ENCRYPTION_KEY=$(openssl rand -base64 32)` is in the test env via `packages/crm/.env.test` or the wrapper script that already loads it.)

If the "undecryptable" test fails because `ENCRYPTION_KEY` is unset, set it inline for the test run:
```bash
cd packages/crm && ENCRYPTION_KEY="$(openssl rand -base64 32)" node --import tsx --test tests/unit/web-onboarding/byok-resolver.spec.ts
```

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/lib/web-onboarding/byok-resolver.ts packages/crm/tests/unit/web-onboarding/byok-resolver.spec.ts
git commit -m "feat(web-onboarding): byok resolver pulls operator anthropic key from integrations"
```

### Task 2.3: Write the EXTRACTION_INSTRUCTIONS prompt + schema

**Files:**
- Create: `packages/crm/src/lib/web-onboarding/extraction-prompt.ts`
- Create: `packages/crm/tests/unit/web-onboarding/extraction-prompt.spec.ts`

- [ ] **Step 1: Write the prompt file**

```typescript
// packages/crm/src/lib/web-onboarding/extraction-prompt.ts
// The single prompt the SSE endpoint sends to Anthropic alongside web_fetch.
// Mirrors the Claude Code MCP url-extraction-instructions playbook by asking
// the model to fetch up to 3 priority pages (home, about, services) and emit
// a strict JSON block. Schema kept narrow on purpose — the soul compiler
// downstream fills in extras.
//
// Spec: 2026-05-16-seldonframe-web-onboarding-pivot-design.md, "Extraction call"
// and "Parse extracted fields".

import { z } from "zod";

export const extractedBusinessFactsSchema = z.object({
  business_name: z.string().min(1),
  tagline: z.string().default(""),
  description: z.string().min(1),
  audience_type: z.enum(["service", "product"]),
  services: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().default(""),
        price: z.number().nullable().optional(),
      })
    )
    .default([]),
  contact: z
    .object({
      email: z.string().email().nullable().optional(),
      phone: z.string().nullable().optional(),
      address: z.string().nullable().optional(),
    })
    .default({}),
  hours: z.string().default(""),
  source_pages: z.array(z.string().url()).default([]),
});

export type ExtractedBusinessFacts = z.infer<typeof extractedBusinessFactsSchema>;

export const REQUIRED_FIELDS_SCHEMA_DESCRIPTION = `{
  "business_name": string (required),
  "tagline": string,
  "description": string (required),
  "audience_type": "service" | "product",
  "services": [{ "name": string, "description": string, "price": number | null }],
  "contact": { "email": string | null, "phone": string | null, "address": string | null },
  "hours": string,
  "source_pages": [string url]
}`;

export const EXTRACTION_INSTRUCTIONS = `You are SeldonFrame's URL-to-business extractor. The user just pasted a URL. Use the web_fetch tool to:

1. Fetch the homepage at the URL.
2. If the homepage clearly links to an "About", "Services", "Pricing", or "Work" page, fetch up to TWO more priority pages.
3. Stop after 3 fetches total. If all 3 fetches fail (404, blocked, JS-only with no useful content), output a JSON object with "_error": "fetch_failed" and stop.

Once you have content, emit EXACTLY ONE JSON object matching this shape (no prose, no markdown fences, no comments):

${REQUIRED_FIELDS_SCHEMA_DESCRIPTION}

Rules:
- "audience_type" is "service" if the business sells human-delivered services (coaching, consulting, agencies, HVAC, dental). "product" if it sells software/SaaS.
- "services" lists up to 6 of the highest-value offerings. Omit price if not on the page.
- "description" is 1-3 sentences describing what the business does and for whom.
- "tagline" is at most one sentence.
- "source_pages" lists the URLs you actually fetched.
- Output ONLY the JSON object. No "Here is the data:" preamble.`;
```

- [ ] **Step 2: Write the prompt guard test**

```typescript
// packages/crm/tests/unit/web-onboarding/extraction-prompt.spec.ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  EXTRACTION_INSTRUCTIONS,
  REQUIRED_FIELDS_SCHEMA_DESCRIPTION,
  extractedBusinessFactsSchema,
} from "../../../src/lib/web-onboarding/extraction-prompt";

describe("EXTRACTION_INSTRUCTIONS", () => {
  test("includes every required field name in the inlined schema description", () => {
    for (const key of [
      "business_name",
      "tagline",
      "description",
      "audience_type",
      "services",
      "contact",
      "hours",
      "source_pages",
    ]) {
      assert.match(REQUIRED_FIELDS_SCHEMA_DESCRIPTION, new RegExp(`"${key}"`));
    }
  });

  test("mentions the web_fetch tool by name so the model knows it can call it", () => {
    assert.match(EXTRACTION_INSTRUCTIONS, /web_fetch/);
  });

  test("caps the fetch count at 3", () => {
    assert.match(EXTRACTION_INSTRUCTIONS, /3 fetches/);
  });
});

describe("extractedBusinessFactsSchema", () => {
  test("accepts a minimum-viable payload", () => {
    const parsed = extractedBusinessFactsSchema.parse({
      business_name: "Acme",
      description: "A small business",
      audience_type: "service",
    });
    assert.equal(parsed.business_name, "Acme");
    assert.deepEqual(parsed.services, []);
  });

  test("rejects a payload missing business_name", () => {
    const result = extractedBusinessFactsSchema.safeParse({
      description: "x",
      audience_type: "service",
    });
    assert.equal(result.success, false);
  });
});
```

- [ ] **Step 3: Run the test, expect pass**

```bash
cd packages/crm && node --import tsx --test tests/unit/web-onboarding/extraction-prompt.spec.ts
```

Expected: PASS — 5 tests green.

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/lib/web-onboarding/extraction-prompt.ts packages/crm/tests/unit/web-onboarding/extraction-prompt.spec.ts
git commit -m "feat(web-onboarding): add EXTRACTION_INSTRUCTIONS prompt + Zod schema"
```

---

## Phase 3 — URL validator (pure, TDD)

### Task 3.1: Write the URL validator test

**Files:**
- Create: `packages/crm/tests/unit/web-onboarding/url-validator.spec.ts`

- [ ] **Step 1: Create the test file**

```typescript
// packages/crm/tests/unit/web-onboarding/url-validator.spec.ts
// Spec §"URL validation": /^https?:\/\/[a-z0-9.-]+(\.[a-z]{2,})/i after trim.
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { validateCreateFromUrlInput } from "../../../src/lib/web-onboarding/url-validator";

describe("validateCreateFromUrlInput", () => {
  test("accepts a valid http URL after trim", () => {
    const result = validateCreateFromUrlInput("  http://acme.com  ");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.url, "http://acme.com");
    }
  });

  test("accepts a valid https URL with path", () => {
    const result = validateCreateFromUrlInput("https://acme-digital.io/about");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.url, "https://acme-digital.io/about");
    }
  });

  test("rejects a non-http(s) scheme", () => {
    const result = validateCreateFromUrlInput("ftp://acme.com");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "invalid_url");
    }
  });

  test("rejects a URL missing a TLD", () => {
    const result = validateCreateFromUrlInput("http://acme");
    assert.equal(result.ok, false);
  });

  test("rejects an empty / whitespace-only input", () => {
    assert.equal(validateCreateFromUrlInput("").ok, false);
    assert.equal(validateCreateFromUrlInput("   ").ok, false);
  });
});
```

- [ ] **Step 2: Run the test, expect compile failure**

```bash
cd packages/crm && node --import tsx --test tests/unit/web-onboarding/url-validator.spec.ts
```

Expected: FAIL — `Cannot find module '../../../src/lib/web-onboarding/url-validator'`.

### Task 3.2: Implement the URL validator

**Files:**
- Create: `packages/crm/src/lib/web-onboarding/url-validator.ts`

- [ ] **Step 1: Write the validator**

```typescript
// packages/crm/src/lib/web-onboarding/url-validator.ts
// Pure validator for the create-from-url endpoint body.
// Regex per spec §"URL validation": /^https?:\/\/[a-z0-9.-]+(\.[a-z]{2,})/i after trim.

export type UrlValidationResult =
  | { ok: true; url: string }
  | { ok: false; code: "invalid_url" };

const URL_PATTERN = /^https?:\/\/[a-z0-9.-]+(\.[a-z]{2,})/i;

export function validateCreateFromUrlInput(raw: unknown): UrlValidationResult {
  if (typeof raw !== "string") {
    return { ok: false, code: "invalid_url" };
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, code: "invalid_url" };
  }

  if (!URL_PATTERN.test(trimmed)) {
    return { ok: false, code: "invalid_url" };
  }

  return { ok: true, url: trimmed };
}
```

- [ ] **Step 2: Run the test, expect pass**

```bash
cd packages/crm && node --import tsx --test tests/unit/web-onboarding/url-validator.spec.ts
```

Expected: PASS — 5 tests green.

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/lib/web-onboarding/url-validator.ts packages/crm/tests/unit/web-onboarding/url-validator.spec.ts
git commit -m "feat(web-onboarding): URL validator for create-from-url endpoint"
```

---

## Phase 4 — Extraction parser (pure, TDD)

### Task 4.1: Write the parser test

**Files:**
- Create: `packages/crm/tests/unit/web-onboarding/extraction-parser.spec.ts`

- [ ] **Step 1: Create the test file**

```typescript
// packages/crm/tests/unit/web-onboarding/extraction-parser.spec.ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { parseExtraction } from "../../../src/lib/web-onboarding/extraction-parser";

const validJson = JSON.stringify({
  business_name: "Acme Plumbing",
  tagline: "Pipes done right.",
  description: "Family-owned plumbing serving Phoenix since 1998.",
  audience_type: "service",
  services: [{ name: "Drain cleaning", description: "", price: null }],
  contact: { email: "hi@acme.com", phone: "555-0100", address: null },
  hours: "Mon-Fri 8-5",
  source_pages: ["https://acme.com/"],
});

describe("parseExtraction", () => {
  test("parses a clean JSON payload", () => {
    const result = parseExtraction(validJson);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.business_name, "Acme Plumbing");
      assert.equal(result.data.services.length, 1);
    }
  });

  test("parses JSON wrapped in a ```json fenced block", () => {
    const result = parseExtraction("```json\n" + validJson + "\n```");
    assert.equal(result.ok, true);
  });

  test("parses JSON wrapped in an unlabelled ``` fenced block", () => {
    const result = parseExtraction("```\n" + validJson + "\n```");
    assert.equal(result.ok, true);
  });

  test("returns extraction_failed on malformed JSON", () => {
    const result = parseExtraction("{ business_name: 'no quotes' ");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "extraction_failed");
    }
  });

  test("returns extraction_failed when required fields are missing", () => {
    const result = parseExtraction(JSON.stringify({ tagline: "no business name" }));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "extraction_failed");
    }
  });

  test("returns extraction_failed when the model emitted _error", () => {
    const result = parseExtraction(JSON.stringify({ _error: "fetch_failed" }));
    assert.equal(result.ok, false);
  });
});
```

- [ ] **Step 2: Run the test, expect compile failure**

```bash
cd packages/crm && node --import tsx --test tests/unit/web-onboarding/extraction-parser.spec.ts
```

Expected: FAIL — module not found.

### Task 4.2: Implement the parser

**Files:**
- Create: `packages/crm/src/lib/web-onboarding/extraction-parser.ts`

- [ ] **Step 1: Write the parser**

```typescript
// packages/crm/src/lib/web-onboarding/extraction-parser.ts
// Parses the raw text Anthropic emits after the web_fetch tool turn finishes.
// Looks for the first JSON object (optionally fenced) and validates against
// extractedBusinessFactsSchema. Pure — no IO, fully unit-testable.

import {
  extractedBusinessFactsSchema,
  type ExtractedBusinessFacts,
} from "./extraction-prompt";

export type ExtractionParseResult =
  | { ok: true; data: ExtractedBusinessFacts }
  | { ok: false; reason: "extraction_failed" };

function extractFirstJsonObject(input: string): unknown | null {
  const fenced = input.match(/```json\s*([\s\S]*?)```/i) ?? input.match(/```\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? input.trim();

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function parseExtraction(rawText: string): ExtractionParseResult {
  const parsed = extractFirstJsonObject(rawText);

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "extraction_failed" };
  }

  if ("_error" in parsed) {
    return { ok: false, reason: "extraction_failed" };
  }

  const validated = extractedBusinessFactsSchema.safeParse(parsed);
  if (!validated.success) {
    return { ok: false, reason: "extraction_failed" };
  }

  return { ok: true, data: validated.data };
}
```

- [ ] **Step 2: Run the test, expect pass**

```bash
cd packages/crm && node --import tsx --test tests/unit/web-onboarding/extraction-parser.spec.ts
```

Expected: PASS — 6 tests green.

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/lib/web-onboarding/extraction-parser.ts packages/crm/tests/unit/web-onboarding/extraction-parser.spec.ts
git commit -m "feat(web-onboarding): extraction parser with fenced-block + zod validation"
```

---

## Phase 5 — SSE event emitter helper

### Task 5.1: Write the SSE helper test

**Files:**
- Create: `packages/crm/tests/unit/web-onboarding/sse.spec.ts`

- [ ] **Step 1: Create the test file**

```typescript
// packages/crm/tests/unit/web-onboarding/sse.spec.ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { createSseStream } from "../../../src/lib/web-onboarding/sse";

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value);
  }
  return out;
}

describe("createSseStream", () => {
  test("frames a single event with name and JSON data", async () => {
    const { stream, emit, close } = createSseStream();
    emit("fetching", { url: "https://x.com" });
    close();
    const text = await readAll(stream);
    assert.match(text, /^event: fetching\ndata: \{"url":"https:\/\/x.com"\}\n\n/);
  });

  test("frames multiple events in order", async () => {
    const { stream, emit, close } = createSseStream();
    emit("a", { n: 1 });
    emit("b", { n: 2 });
    close();
    const text = await readAll(stream);
    const lines = text.trim().split(/\n\n/);
    assert.equal(lines[0], 'event: a\ndata: {"n":1}');
    assert.equal(lines[1], 'event: b\ndata: {"n":2}');
  });

  test("error() emits an error event with code + body", async () => {
    const { stream, error, close } = createSseStream();
    error(402, { reason: "workspace_limit_reached", limit: 1 });
    close();
    const text = await readAll(stream);
    assert.match(text, /event: error\ndata: \{"code":402,"reason":"workspace_limit_reached","limit":1\}/);
  });
});
```

- [ ] **Step 2: Run the test, expect compile failure**

```bash
cd packages/crm && node --import tsx --test tests/unit/web-onboarding/sse.spec.ts
```

Expected: FAIL — module not found.

### Task 5.2: Implement the SSE helper

**Files:**
- Create: `packages/crm/src/lib/web-onboarding/sse.ts`

- [ ] **Step 1: Write the helper**

```typescript
// packages/crm/src/lib/web-onboarding/sse.ts
// Tiny Server-Sent Events helper around the standard ReadableStream interface.
// Next.js 16 App Router routes return a Response with this stream as the body.
// Frames each event as `event: <name>\ndata: <json>\n\n` per the SSE spec.

export type SseStreamHandle = {
  stream: ReadableStream<Uint8Array>;
  emit: (event: string, data: unknown) => void;
  error: (code: number, body: Record<string, unknown>) => void;
  close: () => void;
};

export function createSseStream(): SseStreamHandle {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      closed = true;
      controller = null;
    },
  });

  function write(text: string) {
    if (closed || !controller) return;
    controller.enqueue(encoder.encode(text));
  }

  return {
    stream,
    emit(event, data) {
      write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    error(code, body) {
      write(`event: error\ndata: ${JSON.stringify({ code, ...body })}\n\n`);
    },
    close() {
      if (closed || !controller) return;
      closed = true;
      controller.close();
      controller = null;
    },
  };
}

export const SSE_RESPONSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};
```

- [ ] **Step 2: Run the test, expect pass**

```bash
cd packages/crm && node --import tsx --test tests/unit/web-onboarding/sse.spec.ts
```

Expected: PASS — 3 tests green.

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/lib/web-onboarding/sse.ts packages/crm/tests/unit/web-onboarding/sse.spec.ts
git commit -m "feat(web-onboarding): SSE stream helper with event/data framing"
```

---

## Phase 6 — Workspace limit + web_fetch extractor + main route handler

### Task 6.1: Write workspace-limit test

**Files:**
- Create: `packages/crm/tests/unit/web-onboarding/workspace-limit.spec.ts`

- [ ] **Step 1: Create the test file**

```typescript
// packages/crm/tests/unit/web-onboarding/workspace-limit.spec.ts
// Spec §"Workspace limit check" — Free=1, Growth=3, Scale=unlimited (matches
// CLOUD_TIERS in packages/crm/src/lib/tier/config.ts).
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { computeWorkspaceLimit } from "../../../src/lib/web-onboarding/workspace-limit";

describe("computeWorkspaceLimit", () => {
  test("Free tier with 0 owned workspaces is allowed", () => {
    const result = computeWorkspaceLimit({ tier: "free", ownedCount: 0 });
    assert.equal(result.allowed, true);
    assert.equal(result.limit, 1);
    assert.equal(result.used, 0);
  });

  test("Free tier with 1 owned workspace is denied", () => {
    const result = computeWorkspaceLimit({ tier: "free", ownedCount: 1 });
    assert.equal(result.allowed, false);
    assert.equal(result.tier, "free");
    assert.equal(result.upgradeUrl, "/settings/billing?upgrade=growth");
  });

  test("Growth tier with 2 owned workspaces is allowed", () => {
    const result = computeWorkspaceLimit({ tier: "growth", ownedCount: 2 });
    assert.equal(result.allowed, true);
    assert.equal(result.limit, 3);
  });

  test("Growth tier with 3 owned workspaces is denied", () => {
    const result = computeWorkspaceLimit({ tier: "growth", ownedCount: 3 });
    assert.equal(result.allowed, false);
    assert.equal(result.upgradeUrl, "/settings/billing?upgrade=scale");
  });

  test("Scale tier with 100 owned workspaces is allowed (unlimited)", () => {
    const result = computeWorkspaceLimit({ tier: "scale", ownedCount: 100 });
    assert.equal(result.allowed, true);
    assert.equal(result.limit, Number.POSITIVE_INFINITY);
  });
});
```

- [ ] **Step 2: Run the test, expect compile failure**

```bash
cd packages/crm && node --import tsx --test tests/unit/web-onboarding/workspace-limit.spec.ts
```

Expected: FAIL — module not found.

### Task 6.2: Implement workspace-limit

**Files:**
- Create: `packages/crm/src/lib/web-onboarding/workspace-limit.ts`

- [ ] **Step 1: Write the helper**

```typescript
// packages/crm/src/lib/web-onboarding/workspace-limit.ts
// Determines whether the given user is allowed to create another workspace.
// Tier mapping per spec §5: Free=1, Growth=3, Scale=unlimited.
// The DB wrapper (enforceWorkspaceLimit) is what the route handler calls;
// computeWorkspaceLimit is the pure decision function exposed for tests.

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";

export type WorkspaceTier = "free" | "growth" | "scale";

const TIER_LIMITS: Record<WorkspaceTier, number> = {
  free: 1,
  growth: 3,
  scale: Number.POSITIVE_INFINITY,
};

const UPGRADE_TARGETS: Record<WorkspaceTier, string> = {
  free: "/settings/billing?upgrade=growth",
  growth: "/settings/billing?upgrade=scale",
  scale: "/settings/billing",
};

export type WorkspaceLimitDecision =
  | { allowed: true; tier: WorkspaceTier; used: number; limit: number }
  | { allowed: false; tier: WorkspaceTier; used: number; limit: number; upgradeUrl: string };

export function computeWorkspaceLimit(params: {
  tier: WorkspaceTier;
  ownedCount: number;
}): WorkspaceLimitDecision {
  const limit = TIER_LIMITS[params.tier];
  const allowed = params.ownedCount < limit;
  if (allowed) {
    return { allowed: true, tier: params.tier, used: params.ownedCount, limit };
  }
  return {
    allowed: false,
    tier: params.tier,
    used: params.ownedCount,
    limit,
    upgradeUrl: UPGRADE_TARGETS[params.tier],
  };
}

function resolveTier(planId: string | null | undefined): WorkspaceTier {
  const normalized = (planId ?? "").toLowerCase();
  if (normalized.includes("scale") || normalized.includes("enterprise")) return "scale";
  if (normalized.includes("growth") || normalized.includes("pro")) return "growth";
  return "free";
}

export async function enforceWorkspaceLimit(params: { userId: string }): Promise<WorkspaceLimitDecision> {
  const [user] = await db
    .select({ id: users.id, planId: users.planId })
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);

  if (!user) {
    return {
      allowed: false,
      tier: "free",
      used: 0,
      limit: 1,
      upgradeUrl: "/auth/login",
    };
  }

  const [countRow] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(organizations)
    .where(eq(organizations.ownerId, user.id));

  const ownedCount = Number(countRow?.value ?? 0);
  const tier = resolveTier(user.planId);
  return computeWorkspaceLimit({ tier, ownedCount });
}
```

- [ ] **Step 2: Run the test, expect pass**

```bash
cd packages/crm && node --import tsx --test tests/unit/web-onboarding/workspace-limit.spec.ts
```

Expected: PASS — 5 tests green.

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/lib/web-onboarding/workspace-limit.ts packages/crm/tests/unit/web-onboarding/workspace-limit.spec.ts
git commit -m "feat(web-onboarding): enforceWorkspaceLimit with pure decision helper"
```

### Task 6.3: Write web_fetch extractor test

**Files:**
- Create: `packages/crm/tests/unit/web-onboarding/web-fetch-extractor.spec.ts`

- [ ] **Step 1: Create the test file**

```typescript
// packages/crm/tests/unit/web-onboarding/web-fetch-extractor.spec.ts
// Mocks the Anthropic SDK module via tsx's loader-less object replacement:
// we inject a fake client into extractBusinessFactsFromUrl so we never hit the
// real Anthropic API in unit tests.
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  extractBusinessFactsFromUrl,
  WebFetchError,
} from "../../../src/lib/web-onboarding/web-fetch-extractor";

function makeFakeClient(messageResponse: { content: Array<{ type: string; text?: string }> }) {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    client: {
      messages: {
        create: async (params: Record<string, unknown>) => {
          calls.push(params);
          return messageResponse;
        },
      },
    } as unknown,
  };
}

describe("extractBusinessFactsFromUrl", () => {
  test("returns parsed facts on a successful extraction", async () => {
    const text = JSON.stringify({
      business_name: "Acme",
      description: "Stuff and things",
      audience_type: "service",
    });
    const { client, calls } = makeFakeClient({ content: [{ type: "text", text }] });
    const result = await extractBusinessFactsFromUrl({
      url: "https://acme.com",
      byokKey: "sk-ant-test",
      anthropicClient: client,
    });
    assert.equal(result.business_name, "Acme");
    // Confirm we passed the web_fetch server tool and the model is the spec default.
    const call = calls[0] as { tools?: unknown[]; model?: string };
    assert.deepEqual(call.tools, [{ type: "web_fetch_20250910" }]);
    assert.ok((call.model as string).startsWith("claude-sonnet-"));
  });

  test("throws WebFetchError(extraction_failed) when the model emits malformed JSON", async () => {
    const { client } = makeFakeClient({ content: [{ type: "text", text: "not json at all" }] });
    await assert.rejects(
      () =>
        extractBusinessFactsFromUrl({
          url: "https://acme.com",
          byokKey: "sk-ant-test",
          anthropicClient: client,
        }),
      (err: unknown) => err instanceof WebFetchError && err.reason === "extraction_failed"
    );
  });

  test("throws WebFetchError(credits_exhausted) when the SDK throws a 402-like error", async () => {
    const client = {
      messages: {
        create: async () => {
          const e = new Error("billing: credit limit exceeded");
          (e as unknown as { status?: number }).status = 402;
          throw e;
        },
      },
    } as unknown;
    await assert.rejects(
      () =>
        extractBusinessFactsFromUrl({
          url: "https://acme.com",
          byokKey: "sk-ant-test",
          anthropicClient: client,
        }),
      (err: unknown) => err instanceof WebFetchError && err.reason === "credits_exhausted"
    );
  });
});
```

- [ ] **Step 2: Run the test, expect compile failure**

```bash
cd packages/crm && node --import tsx --test tests/unit/web-onboarding/web-fetch-extractor.spec.ts
```

Expected: FAIL — module not found.

### Task 6.4: Implement web_fetch extractor

**Files:**
- Create: `packages/crm/src/lib/web-onboarding/web-fetch-extractor.ts`

- [ ] **Step 1: Write the extractor**

```typescript
// packages/crm/src/lib/web-onboarding/web-fetch-extractor.ts
// Wraps Anthropic SDK messages.create with the web_fetch server tool enabled.
// Returns the parsed business facts, or throws WebFetchError with a typed reason.
//
// Spec §"Extraction call" — we pass tools: [{ type: "web_fetch_20250910" }] and
// the beta header "web-fetch-2025-09-10". Anthropic fetches the pages server-side
// and returns the model's text turn containing the JSON extraction.

import Anthropic from "@anthropic-ai/sdk";

import {
  EXTRACTION_INSTRUCTIONS,
  type ExtractedBusinessFacts,
} from "./extraction-prompt";
import { parseExtraction } from "./extraction-parser";

export type WebFetchErrorReason =
  | "extraction_failed"
  | "credits_exhausted"
  | "anthropic_unauthorized"
  | "internal_error";

export class WebFetchError extends Error {
  constructor(public reason: WebFetchErrorReason, message: string, public cause?: unknown) {
    super(message);
    this.name = "WebFetchError";
  }
}

const DEFAULT_MODEL = process.env.WEB_ONBOARDING_MODEL?.trim() || "claude-sonnet-4-20250514";
const MAX_TOKENS = 4096;
const WEB_FETCH_TOOL_TYPE = "web_fetch_20250910";
const WEB_FETCH_BETA_HEADER = "web-fetch-2025-09-10";

type AnthropicLike = {
  messages: {
    create: (params: Record<string, unknown>, opts?: { headers?: Record<string, string> }) => Promise<{
      content: Array<{ type: string; text?: string }>;
    }>;
  };
};

function pickText(content: Array<{ type: string; text?: string }>): string {
  return content
    .map((part) => (part.type === "text" ? part.text ?? "" : ""))
    .join("\n")
    .trim();
}

export async function extractBusinessFactsFromUrl(params: {
  url: string;
  byokKey: string;
  /** Optional injection point for tests. Production path constructs a real Anthropic client. */
  anthropicClient?: unknown;
  model?: string;
}): Promise<ExtractedBusinessFacts> {
  const client = (params.anthropicClient ?? new Anthropic({ apiKey: params.byokKey })) as AnthropicLike;

  let response: { content: Array<{ type: string; text?: string }> };
  try {
    response = await client.messages.create(
      {
        model: params.model || DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        tools: [{ type: WEB_FETCH_TOOL_TYPE }],
        messages: [
          {
            role: "user",
            content: `${EXTRACTION_INSTRUCTIONS}\n\nURL to extract: ${params.url}`,
          },
        ],
      },
      { headers: { "anthropic-beta": WEB_FETCH_BETA_HEADER } }
    );
  } catch (err: unknown) {
    const status = (err as { status?: number } | null)?.status;
    if (status === 401 || status === 403) {
      throw new WebFetchError("anthropic_unauthorized", "Anthropic rejected the BYOK key.", err);
    }
    if (status === 402 || status === 429) {
      throw new WebFetchError(
        "credits_exhausted",
        "BYOK Anthropic key has no remaining credits.",
        err
      );
    }
    throw new WebFetchError(
      "internal_error",
      err instanceof Error ? err.message : "Anthropic SDK call failed.",
      err
    );
  }

  const text = pickText(response.content);
  const parsed = parseExtraction(text);
  if (!parsed.ok) {
    throw new WebFetchError("extraction_failed", "The model returned no usable JSON.");
  }

  return parsed.data;
}
```

- [ ] **Step 2: Run the test, expect pass**

```bash
cd packages/crm && node --import tsx --test tests/unit/web-onboarding/web-fetch-extractor.spec.ts
```

Expected: PASS — 3 tests green.

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/lib/web-onboarding/web-fetch-extractor.ts packages/crm/tests/unit/web-onboarding/web-fetch-extractor.spec.ts
git commit -m "feat(web-onboarding): web_fetch extractor wrapping Anthropic SDK"
```

### Task 6.5: Map extracted facts to the soul shape

**Files:**
- Create: `packages/crm/src/lib/web-onboarding/map-facts-to-soul.ts`

- [ ] **Step 1: Write the mapper**

```typescript
// packages/crm/src/lib/web-onboarding/map-facts-to-soul.ts
// Converts ExtractedBusinessFacts (the narrow web-onboarding shape) into a
// SoulV4-compatible input so we can reuse createWorkspaceFromSoulAction.
// We lean on the soul compiler's normalizers downstream, so the mapping here
// only needs to fill the required fields.

import type { ExtractedBusinessFacts } from "./extraction-prompt";
import type { SoulV4 } from "@/lib/soul-compiler/schema";

const SERVICE_FRAMEWORK = "coaching" as const;
const PRODUCT_FRAMEWORK = "f1-landing-waitlist" as const;

export function mapFactsToSoul(facts: ExtractedBusinessFacts): SoulV4 {
  const baseFramework = facts.audience_type === "product" ? PRODUCT_FRAMEWORK : SERVICE_FRAMEWORK;

  return {
    business_name: facts.business_name,
    audience_type: facts.audience_type,
    base_framework: baseFramework,
    tagline: facts.tagline || facts.description.slice(0, 80),
    soul_description: facts.description,
    pipeline_stages: [
      { name: "New lead", description: "Inbound contact, not yet qualified" },
      { name: "Qualified", description: "Confirmed fit and timing" },
      { name: "Engaged", description: "Active conversation underway" },
      { name: "Won", description: "Customer/client onboarded" },
    ],
    intake_form_fields: [
      { field_id: "full_name", label: "Full name", type: "text", required: true },
      { field_id: "email", label: "Email", type: "email", required: true },
      { field_id: "message", label: "How can we help?", type: "textarea", required: false },
    ],
    booking_config:
      facts.audience_type === "service"
        ? {
            enabled: true,
            default_duration_minutes: 30,
            buffer_minutes: 10,
            services: facts.services.slice(0, 6).map((s) => ({
              name: s.name,
              description: s.description ?? "",
              price: typeof s.price === "number" ? s.price : 0,
            })),
          }
        : null,
    pricing_config:
      facts.audience_type === "product"
        ? {
            enabled: true,
            model: "fixed",
            tiers: [],
          }
        : null,
    landing_page_sections: ["hero", "services", "about", "contact"],
    intelligence_hooks: [],
    ucp_capabilities: {
      checkout: false,
      booking: facts.audience_type === "service",
      catalog: false,
      cart: false,
    },
    custom_blocks: [],
    split_recommendation: false,
    custom_domain_suggestion: null,
    framework_version: "v4",
    framework_creator: "seldonframe-web",
  } as SoulV4;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/lib/web-onboarding/map-facts-to-soul.ts
git commit -m "feat(web-onboarding): map extracted facts to SoulV4 shape"
```

### Task 6.6: Write the route-handler integration test

**Files:**
- Create: `packages/crm/tests/unit/web-onboarding/route-create-from-url.spec.ts`

- [ ] **Step 1: Create the test file**

The route imports many DB-bound helpers (`auth`, `enforceWorkspaceLimit`, `getOperatorByokAnthropicKey`, `createWorkspaceFromSoulAction`). To keep the test pure we hoist the SSE-building logic into an exported `runCreateFromUrl({ deps, body, sessionUser })` function and test that. The route file's `POST` is then a 6-line wrapper that wires real deps.

```typescript
// packages/crm/tests/unit/web-onboarding/route-create-from-url.spec.ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { runCreateFromUrl } from "../../../src/lib/web-onboarding/run-create-from-url";

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value);
  }
  return out;
}

const validFacts = {
  business_name: "Acme",
  description: "Stuff",
  audience_type: "service" as const,
  tagline: "",
  services: [],
  contact: {},
  hours: "",
  source_pages: ["https://acme.com/"],
};

function baseDeps() {
  return {
    enforceWorkspaceLimit: async () => ({ allowed: true as const, tier: "free" as const, used: 0, limit: 1 }),
    getOperatorByokAnthropicKey: async () => ({ key: "sk-ant-test", source: "byok" as const }),
    extractBusinessFactsFromUrl: async () => validFacts,
    createWorkspaceFromSoulAction: async () => ({ orgId: "org-1", slug: "acme", name: "Acme" }),
    workspaceBaseDomain: "app.seldonframe.com",
  };
}

describe("runCreateFromUrl", () => {
  test("emits 401 then closes when sessionUser is null", async () => {
    const { stream } = await runCreateFromUrl({
      sessionUser: null,
      body: { url: "https://acme.com" },
      deps: baseDeps(),
    });
    const text = await readAll(stream);
    assert.match(text, /event: error\ndata: \{"code":401,"reason":"unauthorized"\}/);
  });

  test("emits 400 when URL is malformed", async () => {
    const { stream } = await runCreateFromUrl({
      sessionUser: { id: "u1", orgId: "o1" },
      body: { url: "not a url" },
      deps: baseDeps(),
    });
    const text = await readAll(stream);
    assert.match(text, /"code":400,"reason":"invalid_url"/);
  });

  test("emits 402 when workspace limit is reached", async () => {
    const { stream } = await runCreateFromUrl({
      sessionUser: { id: "u1", orgId: "o1" },
      body: { url: "https://acme.com" },
      deps: {
        ...baseDeps(),
        enforceWorkspaceLimit: async () => ({
          allowed: false as const,
          tier: "free" as const,
          used: 1,
          limit: 1,
          upgradeUrl: "/settings/billing?upgrade=growth",
        }),
      },
    });
    const text = await readAll(stream);
    assert.match(text, /"code":402,"reason":"workspace_limit_reached"/);
    assert.match(text, /"upgradeUrl":"\/settings\/billing\?upgrade=growth"/);
  });

  test("emits 412 when BYOK key is missing", async () => {
    const { stream } = await runCreateFromUrl({
      sessionUser: { id: "u1", orgId: "o1" },
      body: { url: "https://acme.com" },
      deps: {
        ...baseDeps(),
        getOperatorByokAnthropicKey: async () => ({ key: null, source: "missing" as const }),
      },
    });
    const text = await readAll(stream);
    assert.match(text, /"code":412,"reason":"needs_byok"/);
  });

  test("emits 422 when extraction fails", async () => {
    const { stream } = await runCreateFromUrl({
      sessionUser: { id: "u1", orgId: "o1" },
      body: { url: "https://acme.com" },
      deps: {
        ...baseDeps(),
        extractBusinessFactsFromUrl: async () => {
          const { WebFetchError } = await import("../../../src/lib/web-onboarding/web-fetch-extractor");
          throw new WebFetchError("extraction_failed", "no json");
        },
      },
    });
    const text = await readAll(stream);
    assert.match(text, /"code":422,"reason":"extraction_failed"/);
  });

  test("emits the full happy-path event sequence", async () => {
    const { stream } = await runCreateFromUrl({
      sessionUser: { id: "u1", orgId: "o1" },
      body: { url: "https://acme.com" },
      deps: baseDeps(),
    });
    const text = await readAll(stream);
    const events = text
      .split(/\n\n/)
      .filter(Boolean)
      .map((chunk) => /event:\s*(\w+)/.exec(chunk)?.[1]);
    assert.deepEqual(events, [
      "fetching",
      "extracting",
      "soul_built",
      "landing_built",
      "chatbot_built",
      "demo_seeded",
      "done",
    ]);
    assert.match(text, /"workspaceId":"org-1"/);
    assert.match(text, /"slug":"acme"/);
  });
});
```

- [ ] **Step 2: Run the test, expect compile failure**

```bash
cd packages/crm && node --import tsx --test tests/unit/web-onboarding/route-create-from-url.spec.ts
```

Expected: FAIL — `Cannot find module '../../../src/lib/web-onboarding/run-create-from-url'`.

### Task 6.7: Implement the runCreateFromUrl orchestrator

**Files:**
- Create: `packages/crm/src/lib/web-onboarding/run-create-from-url.ts`

- [ ] **Step 1: Write the orchestrator**

```typescript
// packages/crm/src/lib/web-onboarding/run-create-from-url.ts
// The whole route logic, factored as a pure function with injectable deps so
// the SSE event sequence is unit-testable. The thin route file (Task 6.8)
// supplies real deps + returns the stream as a Response.

import { createSseStream, SSE_RESPONSE_HEADERS, type SseStreamHandle } from "./sse";
import { validateCreateFromUrlInput } from "./url-validator";
import { mapFactsToSoul } from "./map-facts-to-soul";
import { WebFetchError } from "./web-fetch-extractor";
import type { WorkspaceLimitDecision } from "./workspace-limit";
import type { ByokResolverResult } from "./byok-resolver";
import type { ExtractedBusinessFacts } from "./extraction-prompt";

export type RunDeps = {
  enforceWorkspaceLimit: (params: { userId: string }) => Promise<WorkspaceLimitDecision>;
  getOperatorByokAnthropicKey: (params: { orgId: string }) => Promise<ByokResolverResult>;
  extractBusinessFactsFromUrl: (params: { url: string; byokKey: string }) => Promise<ExtractedBusinessFacts>;
  createWorkspaceFromSoulAction: (
    input: { soul: ReturnType<typeof mapFactsToSoul>; sourceText?: string; pagesUsed?: string[] },
    options: { userId: string }
  ) => Promise<{ orgId: string; slug: string; name: string }>;
  workspaceBaseDomain: string;
};

export type RunInput = {
  sessionUser: { id: string; orgId: string } | null;
  body: { url?: unknown };
  deps: RunDeps;
};

export type RunResult = {
  stream: ReadableStream<Uint8Array>;
  headers: Record<string, string>;
};

async function runImpl(sse: SseStreamHandle, input: RunInput): Promise<void> {
  // 1. Auth
  if (!input.sessionUser?.id) {
    sse.error(401, { reason: "unauthorized" });
    sse.close();
    return;
  }

  // 2. URL validate
  const urlResult = validateCreateFromUrlInput(input.body?.url);
  if (!urlResult.ok) {
    sse.error(400, { reason: "invalid_url" });
    sse.close();
    return;
  }

  // 3. Workspace limit
  const limit = await input.deps.enforceWorkspaceLimit({ userId: input.sessionUser.id });
  if (!limit.allowed) {
    sse.error(402, {
      reason: "workspace_limit_reached",
      tier: limit.tier,
      used: limit.used,
      limit: limit.limit === Number.POSITIVE_INFINITY ? null : limit.limit,
      upgradeUrl: limit.upgradeUrl,
    });
    sse.close();
    return;
  }

  // 4. BYOK
  const byok = await input.deps.getOperatorByokAnthropicKey({ orgId: input.sessionUser.orgId });
  if (!byok.key) {
    sse.error(412, { reason: "needs_byok" });
    sse.close();
    return;
  }

  // 5. Extraction
  sse.emit("fetching", { url: urlResult.url });
  let facts: ExtractedBusinessFacts;
  try {
    facts = await input.deps.extractBusinessFactsFromUrl({ url: urlResult.url, byokKey: byok.key });
    sse.emit("extracting", { fields_found: Object.keys(facts).length });
  } catch (err) {
    if (err instanceof WebFetchError) {
      if (err.reason === "extraction_failed") {
        sse.error(422, { reason: "extraction_failed" });
        sse.close();
        return;
      }
      if (err.reason === "credits_exhausted") {
        sse.error(402, { reason: "credits_exhausted" });
        sse.close();
        return;
      }
      if (err.reason === "anthropic_unauthorized") {
        sse.error(412, { reason: "needs_byok" });
        sse.close();
        return;
      }
    }
    sse.error(500, { reason: "internal_error" });
    sse.close();
    return;
  }

  // 6. Build workspace via existing primitive. Emit synthetic phase events
  // around it so the UI narration matches the spec.
  const soul = mapFactsToSoul(facts);
  sse.emit("soul_built", { audience_type: soul.audience_type, base_framework: soul.base_framework });

  let workspace: { orgId: string; slug: string; name: string };
  try {
    workspace = await input.deps.createWorkspaceFromSoulAction(
      {
        soul,
        sourceText: facts.description,
        pagesUsed: facts.source_pages,
      },
      { userId: input.sessionUser.id }
    );
  } catch (err) {
    sse.error(500, {
      reason: "internal_error",
      detail: err instanceof Error ? err.message : "createWorkspaceFromSoulAction failed",
    });
    sse.close();
    return;
  }

  sse.emit("landing_built", { workspaceId: workspace.orgId });
  sse.emit("chatbot_built", { workspaceId: workspace.orgId });
  sse.emit("demo_seeded", { workspaceId: workspace.orgId });

  const dashboardUrl = `/dashboard?workspace=${encodeURIComponent(workspace.orgId)}`;
  const publicHomeUrl = `https://${workspace.slug}.${input.deps.workspaceBaseDomain}`;
  const chatbotEmbedUrl = `${publicHomeUrl}/chat`;

  sse.emit("done", {
    workspaceId: workspace.orgId,
    slug: workspace.slug,
    dashboardUrl,
    publicHomeUrl,
    chatbotEmbedUrl,
  });
  sse.close();
}

export async function runCreateFromUrl(input: RunInput): Promise<RunResult> {
  const sse = createSseStream();
  // Fire-and-forget the work; the consumer reads from the stream.
  void runImpl(sse, input).catch((err) => {
    sse.error(500, { reason: "internal_error", detail: err instanceof Error ? err.message : String(err) });
    sse.close();
  });
  return { stream: sse.stream, headers: { ...SSE_RESPONSE_HEADERS } };
}
```

- [ ] **Step 2: Run the test, expect pass**

```bash
cd packages/crm && node --import tsx --test tests/unit/web-onboarding/route-create-from-url.spec.ts
```

Expected: PASS — 6 tests green.

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/lib/web-onboarding/run-create-from-url.ts packages/crm/tests/unit/web-onboarding/route-create-from-url.spec.ts
git commit -m "feat(web-onboarding): runCreateFromUrl orchestrator with dep injection"
```

### Task 6.8: Write the thin route file

**Files:**
- Create: `packages/crm/src/app/api/v1/web/workspaces/create-from-url/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// packages/crm/src/app/api/v1/web/workspaces/create-from-url/route.ts
// SSE endpoint. Thin wrapper — all logic lives in run-create-from-url.ts so it
// can be unit-tested without a request/response.
//
// Spec: 2026-05-16-seldonframe-web-onboarding-pivot-design.md §"New backend endpoint".

import { auth } from "@/auth";
import {
  enforceWorkspaceLimit,
} from "@/lib/web-onboarding/workspace-limit";
import { getOperatorByokAnthropicKey } from "@/lib/web-onboarding/byok-resolver";
import { extractBusinessFactsFromUrl } from "@/lib/web-onboarding/web-fetch-extractor";
import { createWorkspaceFromSoulAction } from "@/lib/billing/orgs";
import { runCreateFromUrl } from "@/lib/web-onboarding/run-create-from-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKSPACE_BASE_DOMAIN = process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { url?: unknown };
  const session = await auth();
  const sessionUser =
    session?.user?.id && session.user.orgId
      ? { id: session.user.id, orgId: session.user.orgId }
      : null;

  const { stream, headers } = await runCreateFromUrl({
    sessionUser,
    body,
    deps: {
      enforceWorkspaceLimit,
      getOperatorByokAnthropicKey,
      extractBusinessFactsFromUrl: ({ url, byokKey }) =>
        extractBusinessFactsFromUrl({ url, byokKey }),
      createWorkspaceFromSoulAction,
      workspaceBaseDomain: WORKSPACE_BASE_DOMAIN,
    },
  });

  return new Response(stream, { status: 200, headers });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck
```

Expected: success. If `session.user.orgId` is not on the NextAuth `user` type, fall back to the existing pattern used elsewhere in the codebase: import `getOrgId` from `@/lib/auth/helpers` and use it instead — adjust the route to:

```typescript
const session = await auth();
const orgId = session?.user?.id ? await getOrgId() : null;
const sessionUser = session?.user?.id && orgId ? { id: session.user.id, orgId } : null;
```

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/app/api/v1/web/workspaces/create-from-url/route.ts
git commit -m "feat(web-onboarding): mount POST /api/v1/web/workspaces/create-from-url"
```

---

## Phase 7 — UpgradeModal component (TDD + design pass)

### Task 7.1: Invoke design:design-system for UpgradeModal

- [ ] **Step 1: Invoke the skill**

Run the `design:design-system` skill with this prompt:

> "Audit which shadcn primitives already in `packages/crm/src/components/ui/` should compose the `UpgradeModal` described in spec §'Upgrade modal component' (Cut B context, but built in Cut A). Required elements: modal dialog, two side-by-side tier cards (Growth $29 / Scale $99), feature checklists, primary upgrade button per card, secondary 'Maybe later' close button. The modal must be reusable across `/dashboard`, `/clients/new`, and (future) `/clients`. Output: the exact shadcn component imports to use, any new tokens needed, and a 1-sentence rationale per choice."

- [ ] **Step 2: Capture the recommendation**

Save the skill's recommendation to a scratch comment at the top of `packages/crm/src/components/billing/upgrade-modal.tsx` (when you create it in Task 7.3) so the next reviewer sees the rationale. No commit yet.

### Task 7.2: Invoke design:ux-copy for UpgradeModal strings

- [ ] **Step 1: Invoke the skill**

Run the `design:ux-copy` skill with this prompt:

> "Write the user-facing copy for SeldonFrame's UpgradeModal. The modal opens when a Free-tier agency tries to create a second client workspace. Required strings: (1) modal title, (2) dynamic subtitle that interpolates `used` and `limit` (e.g. 'You're on Free with 1 of 1 workspaces used'), (3) Growth tier card — name, price line, 4 bullet features (3 workspaces, custom domain per client, no SeldonFrame branding, client portal access), CTA button label, (4) Scale tier card — name, price line, 4 bullet features (unlimited workspaces, AI agents, full white-label client portal, priority support), CTA button label, (5) footer copy '(Both tiers include …)', (6) 'Maybe later' link. Tone: value-forward, not pushy. No emoji. No exclamation marks. Each string under 80 chars except feature bullets which can be 6-8 words."

- [ ] **Step 2: Capture the copy**

Save the produced strings as a const block at the top of the new component file in Task 7.3.

### Task 7.3: Write the UpgradeModal test

**Files:**
- Create: `packages/crm/tests/unit/web-onboarding/upgrade-modal.spec.tsx`

- [ ] **Step 1: Create the test file**

```typescript
// packages/crm/tests/unit/web-onboarding/upgrade-modal.spec.tsx
// React Testing Library is already a transitive dep via the existing
// component snapshot tests in packages/crm/tests/unit/blocks/.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

import { UpgradeModal } from "../../../src/components/billing/upgrade-modal";

describe("UpgradeModal", () => {
  test("renders both tier cards when open", () => {
    render(<UpgradeModal open={true} onOpenChange={() => {}} tier="free" used={1} limit={1} />);
    assert.ok(screen.getByText(/Growth/i));
    assert.ok(screen.getByText(/Scale/i));
    assert.ok(screen.getByText(/\$29/));
    assert.ok(screen.getByText(/\$99/));
  });

  test("interpolates used and limit into the subtitle", () => {
    render(<UpgradeModal open={true} onOpenChange={() => {}} tier="free" used={1} limit={1} />);
    assert.ok(screen.getByText(/1 of 1 workspaces used/));
  });

  test("calls onOpenChange(false) when the close link is clicked", () => {
    let opened = true;
    render(
      <UpgradeModal open={opened} onOpenChange={(next) => { opened = next; }} tier="free" used={1} limit={1} />
    );
    fireEvent.click(screen.getByText(/Maybe later/i));
    assert.equal(opened, false);
  });

  test("upgrade buttons POST to /api/stripe/checkout with the correct priceId", async () => {
    const fetchMock = async (url: string, init?: RequestInit) => {
      fetchMock.calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
      return new Response(JSON.stringify({ url: "https://checkout.stripe.com/test" }), { status: 200 });
    };
    fetchMock.calls = [] as Array<{ url: string; body: unknown }>;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      render(<UpgradeModal open={true} onOpenChange={() => {}} tier="free" used={1} limit={1} />);
      fireEvent.click(screen.getByRole("button", { name: /upgrade to growth/i }));
      // Allow the click handler microtask to flush.
      await Promise.resolve();
      assert.equal(fetchMock.calls.length, 1);
      assert.equal(fetchMock.calls[0]!.url, "/api/stripe/checkout");
      assert.match(JSON.stringify(fetchMock.calls[0]!.body), /priceId/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
```

- [ ] **Step 2: Run the test, expect compile failure**

```bash
cd packages/crm && node --import tsx --test tests/unit/web-onboarding/upgrade-modal.spec.tsx
```

Expected: FAIL — module not found.

### Task 7.4: Implement UpgradeModal

**Files:**
- Create: `packages/crm/src/components/billing/upgrade-modal.tsx`

- [ ] **Step 1: Write the component**

Use the shadcn components confirmed in Task 7.1 (likely `Dialog`, `Card`, `Button` from `@/components/ui/`). Replace the placeholder copy below with the exact strings from Task 7.2. The component MUST follow this exported interface (Cut B/C depend on it):

```tsx
// packages/crm/src/components/billing/upgrade-modal.tsx
// Cut A first consumer is /clients/new's 402 path; Cut B reuses this from
// /clients and from the dashboard CTA at-limit click; Cut C may surface it
// from marketing CTAs. DO NOT redefine this component in later Cuts.
//
// Design system recommendation (Task 7.1):
//   Dialog (shadcn) for shell; Card for tier; Button variant=default for the
//   upgrade CTAs; Button variant=ghost for "Maybe later".
// Copy (Task 7.2):
//   <PASTE the ux-copy skill output here, in a single const block>
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Replace these placeholders with the design:ux-copy output from Task 7.2.
const COPY = {
  title: "You've used all your workspaces on Free",
  subtitleTemplate: (used: number, limit: number) =>
    `You're on Free with ${used} of ${limit} workspaces used. Upgrade to add more clients.`,
  growth: {
    name: "Growth",
    price: "$29/mo",
    features: ["3 workspaces", "Custom domain per client", "No SeldonFrame branding", "Client portal access"],
    cta: "Upgrade to Growth",
  },
  scale: {
    name: "Scale",
    price: "$99/mo",
    features: [
      "Unlimited workspaces",
      "AI agents (Speed-to-Lead, Win-Back, Review Requester)",
      "Full white-label client portal",
      "Priority support",
    ],
    cta: "Upgrade to Scale",
  },
  footer:
    "Both tiers include unlimited contacts, unlimited bookings, BYOK Anthropic key support, and Claude Code MCP access.",
  cancel: "Maybe later",
};

// Real Stripe priceIds live in `lib/billing/price-ids.ts`; the consumer site
// hot-swaps these via env. We pass the tier slug and the server resolves the
// priceId. Keeps secrets out of the client bundle.
const TIER_TO_REQUEST = {
  growth: { tier: "growth" as const, priceLookupKey: "cloud_growth_monthly" },
  scale: { tier: "scale" as const, priceLookupKey: "cloud_scale_monthly" },
};

export type UpgradeModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tier: "free" | "growth";
  used: number;
  limit: number;
};

export function UpgradeModal({ open, onOpenChange, used, limit }: UpgradeModalProps) {
  const [pending, setPending] = useState<"growth" | "scale" | null>(null);

  async function upgrade(target: "growth" | "scale") {
    setPending(target);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceId: TIER_TO_REQUEST[target].priceLookupKey,
          tier: TIER_TO_REQUEST[target].tier,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { url?: string };
        if (data.url) {
          window.location.assign(data.url);
          return;
        }
      }
      setPending(null);
    } catch {
      setPending(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{COPY.title}</DialogTitle>
          <DialogDescription>{COPY.subtitleTemplate(used, limit)}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(["growth", "scale"] as const).map((tier) => {
            const card = COPY[tier];
            return (
              <Card key={tier}>
                <CardHeader>
                  <CardTitle>{card.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{card.price}</p>
                </CardHeader>
                <CardContent>
                  <ul className="mb-4 space-y-2 text-sm">
                    {card.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  <Button onClick={() => upgrade(tier)} disabled={pending !== null} className="w-full">
                    {pending === tier ? "Redirecting..." : card.cta}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">{COPY.footer}</p>

        <div className="mt-2 text-center">
          <button
            type="button"
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            onClick={() => onOpenChange(false)}
          >
            {COPY.cancel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Run the test, expect pass**

```bash
cd packages/crm && node --import tsx --test tests/unit/web-onboarding/upgrade-modal.spec.tsx
```

Expected: PASS — 4 tests green.

If the test fails with JSX-runtime errors, ensure the existing component tests in the repo use the same shape; add `import React from "react"` at the top of the test (already present in the template above).

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/components/billing/upgrade-modal.tsx packages/crm/tests/unit/web-onboarding/upgrade-modal.spec.tsx
git commit -m "feat(billing): reusable UpgradeModal for tier limit prompts"
```

### Task 7.5: Invoke design:design-critique on UpgradeModal

- [ ] **Step 1: Invoke the skill**

Run the `design:design-critique` skill with this prompt:

> "Critique `packages/crm/src/components/billing/upgrade-modal.tsx`. The modal is the moment a Free agency decides whether to pay. Review: tier-card hierarchy (Growth vs Scale — should Scale be visually emphasized as the upgrade path?), CTA button affordance, copy density, escape hatch ('Maybe later' placement). Return concrete inline edits if you spot issues."

- [ ] **Step 2: Apply inline fixes**

Edit the component to incorporate any recommended changes. Re-run the tests:

```bash
cd packages/crm && node --import tsx --test tests/unit/web-onboarding/upgrade-modal.spec.tsx
```

Expected: PASS — still 4 green. (If your changes broke a test, either update the test to match the new intentional behavior or revert the change.)

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/components/billing/upgrade-modal.tsx
git commit -m "fix(billing): apply design-critique feedback to UpgradeModal"
```

### Task 7.6: Invoke design:accessibility-review on UpgradeModal

- [ ] **Step 1: Invoke the skill**

Run the `design:accessibility-review` skill with this prompt:

> "Run a WCAG 2.1 AA audit on `packages/crm/src/components/billing/upgrade-modal.tsx`. Check: focus trap inside dialog, ESC key closes, every interactive element reachable by Tab, screen-reader announces the dynamic subtitle when the modal opens, color contrast of the price text and Maybe-later link, button labels make sense out of context. Return concrete fixes."

- [ ] **Step 2: Apply inline fixes**

Edit the component to incorporate fixes (e.g. add `aria-describedby`, ensure subtitle has the right semantic element, set `autoFocus` on the primary upgrade button if recommended). Re-run the tests:

```bash
cd packages/crm && node --import tsx --test tests/unit/web-onboarding/upgrade-modal.spec.tsx
```

Expected: PASS — 4 green.

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/components/billing/upgrade-modal.tsx
git commit -m "fix(billing): apply accessibility-review fixes to UpgradeModal"
```

---

## Phase 8 — `/clients/new` page + client form (TDD + design pass + a11y pass)

### Task 8.1: Invoke design:design-system for /clients/new

- [ ] **Step 1: Invoke the skill**

Run the `design:design-system` skill with this prompt:

> "Confirm the shadcn primitive selection for SeldonFrame's `/clients/new` page (spec §'New frontend page'). Elements: large hero heading + subtext, an oversized URL input with autofocus + placeholder, primary 'Create workspace' button, secondary 'skip and create one manually later' link, and a right-side progress narration column with 6 checkmark rows that animate on as events arrive. List the exact primitives from `packages/crm/src/components/ui/` to use and any new ones to create. Return one-line rationale per choice."

- [ ] **Step 2: Capture the recommendation**

Note the recommendation in the file header comment of `clients-new-form.tsx` (Task 8.4).

### Task 8.2: Invoke design:ux-copy for every /clients/new string

- [ ] **Step 1: Invoke the skill**

Run the `design:ux-copy` skill with this prompt:

> "Write copy for SeldonFrame's `/clients/new` page (the first thing a newly-signed-up agency sees). Required strings: (1) hero heading 'Create your first client workspace' — refine or confirm, (2) hero subtext that explains URL paste creates a CRM/booking/intake/chatbot in 60 sec, (3) input placeholder 'https://your-client-business.com', (4) primary button label 'Create workspace', (5) secondary link 'or skip and create one manually later', (6) six progress narration phrases — one each for events `fetching`, `extracting`, `soul_built`, `landing_built`, `chatbot_built`, `demo_seeded`. Each phrase under 5 words, sentence-cased, active voice, no emoji. Also (7) five error banner copy strings — one each for the 5 error codes: 400 invalid_url, 412 needs_byok (inline BYOK prompt heading + body + input label + button), 422 extraction_failed, 402 workspace_limit_reached (used to open modal — needs short banner), 500 internal_error with 'Try again' button."

- [ ] **Step 2: Capture the copy**

Save the produced strings as a const block in `clients-new-form.tsx` (Task 8.4) so future Cuts can re-read it.

### Task 8.3: Write the /clients/new form test

**Files:**
- Create: `packages/crm/tests/unit/web-onboarding/clients-new-form.spec.tsx`

- [ ] **Step 1: Create the test file**

```typescript
// packages/crm/tests/unit/web-onboarding/clients-new-form.spec.tsx
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";

import { ClientsNewForm } from "../../../src/app/(dashboard)/clients/new/clients-new-form";

// Lightweight EventSource stub. The form constructs `new EventSource(url)`;
// we intercept globally so tests can drive the event stream.
type Listener = (e: { data: string }) => void;
class FakeEventSource {
  static last: FakeEventSource | null = null;
  static instances: FakeEventSource[] = [];
  listeners: Record<string, Listener[]> = {};
  url: string;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.last = this;
    FakeEventSource.instances.push(this);
  }
  addEventListener(event: string, fn: Listener) {
    (this.listeners[event] ??= []).push(fn);
  }
  close() {}
  fire(event: string, data: unknown) {
    for (const fn of this.listeners[event] ?? []) fn({ data: JSON.stringify(data) });
  }
}

describe("ClientsNewForm", () => {
  test("submits, opens EventSource, renders progress checkmarks as events arrive", async () => {
    (globalThis as unknown as { EventSource: typeof FakeEventSource }).EventSource = FakeEventSource;
    render(<ClientsNewForm />);
    fireEvent.change(screen.getByPlaceholderText(/https:\/\//i), { target: { value: "https://acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: /create workspace/i }));

    const es = FakeEventSource.last;
    assert.ok(es, "EventSource was constructed");
    assert.match(es!.url, /\/api\/v1\/web\/workspaces\/create-from-url\?url=https%3A%2F%2Facme\.com/);

    act(() => es!.fire("fetching", { url: "https://acme.com" }));
    assert.ok(screen.getByTestId("progress-fetching").getAttribute("data-state") === "done");

    act(() => es!.fire("extracting", {}));
    assert.ok(screen.getByTestId("progress-extracting").getAttribute("data-state") === "done");
  });

  test("on error code 412 the form swaps to the BYOK prompt", async () => {
    (globalThis as unknown as { EventSource: typeof FakeEventSource }).EventSource = FakeEventSource;
    render(<ClientsNewForm />);
    fireEvent.change(screen.getByPlaceholderText(/https:\/\//i), { target: { value: "https://acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: /create workspace/i }));

    const es = FakeEventSource.last;
    act(() => es!.fire("error", { code: 412, reason: "needs_byok" }));

    assert.ok(screen.getByPlaceholderText(/sk-ant-/i), "BYOK input appeared");
    assert.ok(screen.getByRole("button", { name: /save and continue/i }));
  });

  test("on error code 402 the UpgradeModal opens", async () => {
    (globalThis as unknown as { EventSource: typeof FakeEventSource }).EventSource = FakeEventSource;
    render(<ClientsNewForm />);
    fireEvent.change(screen.getByPlaceholderText(/https:\/\//i), { target: { value: "https://acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: /create workspace/i }));

    const es = FakeEventSource.last;
    act(() => es!.fire("error", { code: 402, reason: "workspace_limit_reached", tier: "free", used: 1, limit: 1, upgradeUrl: "/settings/billing?upgrade=growth" }));

    assert.ok(screen.getByText(/Maybe later/i), "UpgradeModal rendered");
  });

  test("on error code 422 the form shows an error banner and keeps the URL filled in", async () => {
    (globalThis as unknown as { EventSource: typeof FakeEventSource }).EventSource = FakeEventSource;
    render(<ClientsNewForm />);
    const input = screen.getByPlaceholderText(/https:\/\//i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "https://acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: /create workspace/i }));

    const es = FakeEventSource.last;
    act(() => es!.fire("error", { code: 422, reason: "extraction_failed" }));

    assert.ok(screen.getByRole("alert"));
    assert.equal(input.value, "https://acme.com");
  });
});
```

- [ ] **Step 2: Run the test, expect compile failure**

```bash
cd packages/crm && node --import tsx --test tests/unit/web-onboarding/clients-new-form.spec.tsx
```

Expected: FAIL — module not found.

### Task 8.4: Implement the client form component

**Files:**
- Create: `packages/crm/src/app/(dashboard)/clients/new/clients-new-form.tsx`

- [ ] **Step 1: Write the component**

Replace `COPY.*` placeholders with the strings produced in Task 8.2.

```tsx
// packages/crm/src/app/(dashboard)/clients/new/clients-new-form.tsx
// Client-side form for the /clients/new page. Spec §"New frontend page".
//
// Design system recommendation (Task 8.1): <paste Task 8.1 output here>
// UX copy (Task 8.2): bundled in COPY const below.
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { UpgradeModal } from "@/components/billing/upgrade-modal";

// Replace with the design:ux-copy output from Task 8.2.
const COPY = {
  hero: "Create your first client workspace",
  subtext:
    "Paste your client's website URL and we'll build their CRM, booking page, intake form, and AI chatbot in under 60 seconds.",
  placeholder: "https://your-client-business.com",
  primary: "Create workspace",
  secondary: "or skip and create one manually later",
  progress: {
    fetching: "Fetching site",
    extracting: "Extracting business facts",
    soul_built: "Generating personality",
    landing_built: "Building landing page",
    chatbot_built: "Wiring up AI chatbot",
    demo_seeded: "Seeding demo portal",
  },
  errors: {
    invalid_url: "That URL doesn't look right. Try again.",
    extraction_failed: "We couldn't read that site. Try a different URL.",
    internal_error: "Something went wrong. Try again.",
    byokHeading: "Add your Anthropic API key",
    byokBody: "We use your key to read the site and build the workspace. Stored encrypted on your account.",
    byokLabel: "Anthropic API key",
    byokSave: "Save and continue",
  },
};

const PROGRESS_KEYS = ["fetching", "extracting", "soul_built", "landing_built", "chatbot_built", "demo_seeded"] as const;
type ProgressKey = typeof PROGRESS_KEYS[number];

type LimitInfo = { tier: "free" | "growth"; used: number; limit: number; upgradeUrl: string };

export function ClientsNewForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [done, setDone] = useState<Record<ProgressKey, boolean>>({
    fetching: false,
    extracting: false,
    soul_built: false,
    landing_built: false,
    chatbot_built: false,
    demo_seeded: false,
  });
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [needsByok, setNeedsByok] = useState(false);
  const [byokKey, setByokKey] = useState("");
  const [byokSaving, setByokSaving] = useState(false);
  const [upgradeInfo, setUpgradeInfo] = useState<LimitInfo | null>(null);
  const esRef = useRef<EventSource | null>(null);

  function startStream(targetUrl: string) {
    setSubmitted(true);
    setErrorBanner(null);
    setNeedsByok(false);
    setUpgradeInfo(null);
    setDone({
      fetching: false,
      extracting: false,
      soul_built: false,
      landing_built: false,
      chatbot_built: false,
      demo_seeded: false,
    });

    const qs = new URLSearchParams({ url: targetUrl });
    const es = new EventSource(`/api/v1/web/workspaces/create-from-url?${qs.toString()}`);
    esRef.current = es;

    for (const key of PROGRESS_KEYS) {
      es.addEventListener(key, () => {
        setDone((prev) => ({ ...prev, [key]: true }));
      });
    }

    es.addEventListener("done", (raw) => {
      const data = JSON.parse((raw as MessageEvent).data) as { dashboardUrl: string };
      es.close();
      router.push(data.dashboardUrl);
    });

    es.addEventListener("error", (raw) => {
      const data = JSON.parse((raw as MessageEvent).data ?? "{}") as { code?: number; reason?: string } & Partial<LimitInfo>;
      es.close();
      setSubmitted(false);

      if (data.code === 412) {
        setNeedsByok(true);
        return;
      }
      if (data.code === 402 && data.reason === "workspace_limit_reached") {
        setUpgradeInfo({
          tier: (data.tier as "free" | "growth") ?? "free",
          used: data.used ?? 0,
          limit: data.limit ?? 1,
          upgradeUrl: data.upgradeUrl ?? "/settings/billing",
        });
        return;
      }
      if (data.code === 400) {
        setErrorBanner(COPY.errors.invalid_url);
        return;
      }
      if (data.code === 422) {
        setErrorBanner(COPY.errors.extraction_failed);
        return;
      }
      setErrorBanner(COPY.errors.internal_error);
    });
  }

  useEffect(() => () => esRef.current?.close(), []);

  async function saveByokAndRetry() {
    if (!byokKey.trim()) return;
    setByokSaving(true);
    try {
      const res = await fetch("/api/integrations/anthropic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: byokKey.trim() }),
      });
      if (res.ok) {
        setNeedsByok(false);
        setByokKey("");
        startStream(url);
      } else {
        setErrorBanner(COPY.errors.internal_error);
      }
    } finally {
      setByokSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
      <section>
        <h1 className="text-3xl font-semibold">{COPY.hero}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{COPY.subtext}</p>

        {!needsByok ? (
          <form
            className="mt-6 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              startStream(url);
            }}
          >
            <Input
              autoFocus
              type="url"
              placeholder={COPY.placeholder}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              className="h-12 text-base"
            />
            <Button type="submit" disabled={submitted} className="h-12 w-full">
              {submitted ? "Creating..." : COPY.primary}
            </Button>
            <p className="text-center text-xs">
              <a href="/dashboard" className="text-muted-foreground underline">
                {COPY.secondary}
              </a>
            </p>
          </form>
        ) : (
          <div className="mt-6 space-y-3">
            <h2 className="text-lg font-medium">{COPY.errors.byokHeading}</h2>
            <p className="text-sm text-muted-foreground">{COPY.errors.byokBody}</p>
            <label className="block text-sm" htmlFor="byok-key">
              {COPY.errors.byokLabel}
            </label>
            <Input
              id="byok-key"
              type="password"
              placeholder="sk-ant-..."
              value={byokKey}
              onChange={(e) => setByokKey(e.target.value)}
            />
            <Button onClick={saveByokAndRetry} disabled={byokSaving || !byokKey.trim()} className="w-full">
              {byokSaving ? "Saving..." : COPY.errors.byokSave}
            </Button>
          </div>
        )}

        {errorBanner ? (
          <Alert role="alert" className="mt-4">
            <AlertDescription>{errorBanner}</AlertDescription>
          </Alert>
        ) : null}
      </section>

      <aside aria-live="polite" className="rounded-lg border p-4">
        <ol className="space-y-3 text-sm">
          {PROGRESS_KEYS.map((key) => (
            <li
              key={key}
              data-testid={`progress-${key}`}
              data-state={done[key] ? "done" : "pending"}
              className={done[key] ? "text-foreground" : "text-muted-foreground"}
            >
              {done[key] ? "✓" : "·"} {COPY.progress[key]}
            </li>
          ))}
        </ol>
      </aside>

      {upgradeInfo ? (
        <UpgradeModal
          open={true}
          onOpenChange={(open) => {
            if (!open) setUpgradeInfo(null);
          }}
          tier={upgradeInfo.tier}
          used={upgradeInfo.used}
          limit={upgradeInfo.limit}
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Run the test, expect pass**

```bash
cd packages/crm && node --import tsx --test tests/unit/web-onboarding/clients-new-form.spec.tsx
```

Expected: PASS — 4 tests green. (If the test for the success-event drives `router.push`, ensure `next/navigation` is mocked or test ends before the `done` event.)

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/app/(dashboard)/clients/new/clients-new-form.tsx packages/crm/tests/unit/web-onboarding/clients-new-form.spec.tsx
git commit -m "feat(web-onboarding): /clients/new client form with SSE narration and BYOK retry"
```

### Task 8.5: Write the /clients/new page (server component)

**Files:**
- Create: `packages/crm/src/app/(dashboard)/clients/new/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// packages/crm/src/app/(dashboard)/clients/new/page.tsx
// Server component for the post-signup "paste a URL" screen.
// Spec §"New frontend page".

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ClientsNewForm } from "./clients-new-form";

export default async function ClientsNewPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/clients/new");
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <ClientsNewForm />
    </main>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/app/(dashboard)/clients/new/page.tsx
git commit -m "feat(web-onboarding): /clients/new server page chrome"
```

### Task 8.6: Invoke design:design-critique on /clients/new

- [ ] **Step 1: Invoke the skill**

Run the `design:design-critique` skill with this prompt:

> "Critique the rendered `/clients/new` page. Files: `packages/crm/src/app/(dashboard)/clients/new/page.tsx` and `clients-new-form.tsx`. Focus: does the page communicate 'paste URL → workspace in 60 seconds' at first glance? Is the URL input prominent enough? Is the progress narration column anchored so it doesn't shift when checkmarks fill in? Is the BYOK swap-in jarring or smooth? Return concrete inline edits."

- [ ] **Step 2: Apply inline fixes + re-run tests**

```bash
cd packages/crm && node --import tsx --test tests/unit/web-onboarding/clients-new-form.spec.tsx
```

Expected: PASS — 4 green.

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/app/\(dashboard\)/clients/new/
git commit -m "fix(web-onboarding): apply design-critique feedback to /clients/new"
```

### Task 8.7: Invoke design:accessibility-review on /clients/new

- [ ] **Step 1: Invoke the skill**

Run the `design:accessibility-review` skill with this prompt:

> "WCAG 2.1 AA audit on `packages/crm/src/app/(dashboard)/clients/new/`. Check: progress narration column has `aria-live='polite'` (already set — verify), every progress item has a visible non-color status indicator (✓ vs ·), the URL input has an associated label (currently uses placeholder — fix that), focus order on the BYOK swap-in, color contrast of muted text on the right column, UpgradeModal trap-focus inheritance, keyboard activation of the secondary 'skip' link. Return concrete fixes."

- [ ] **Step 2: Apply inline fixes + re-run tests**

```bash
cd packages/crm && node --import tsx --test tests/unit/web-onboarding/clients-new-form.spec.tsx
```

Expected: PASS — 4 green (you may need to update test selectors if you changed how the input is labelled — that's expected and intentional).

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/app/\(dashboard\)/clients/new/
git commit -m "fix(web-onboarding): apply accessibility-review fixes to /clients/new"
```

---

## Phase 9 — Dashboard CTA + usage badge

### Task 9.1: Invoke design:design-system for the CTA

- [ ] **Step 1: Invoke the skill**

Run the `design:design-system` skill with this prompt:

> "The SeldonFrame dashboard header needs a new component: a primary button labelled 'Create Client Workspace' on the right side of the header, with a small workspace-usage badge next to it ('1/3 workspaces' tooltip 'On Growth plan'). When the user is at limit the click opens UpgradeModal (existing). When under, it navigates to `/clients/new`. Reference existing usage banners in the codebase (search `getFreeTierUsageBannerData`). Recommend the shadcn primitives and badge styling. The current dashboard page is `packages/crm/src/app/(dashboard)/dashboard/page.tsx` — see lines 1-100 for current header structure."

- [ ] **Step 2: Capture the recommendation**

Note it as a comment in the new `create-client-cta.tsx` file (Task 9.3).

### Task 9.2: Invoke design:ux-copy for the CTA + tooltip

- [ ] **Step 1: Invoke the skill**

Run the `design:ux-copy` skill with this prompt:

> "Two strings: (1) the primary CTA button label on the SeldonFrame dashboard, used by agencies to create another client workspace. Current draft: 'Create Client Workspace'. Refine for clarity + action-orientation. Under 25 chars. (2) The tooltip text on a small usage badge next to it showing 'X/Y workspaces'. Tooltip should explain the limit context (e.g. 'On Free plan' / 'On Growth plan')."

- [ ] **Step 2: Capture the copy**

Use the produced strings in Task 9.3.

### Task 9.3: Implement the CTA component

**Files:**
- Create: `packages/crm/src/components/dashboard/create-client-cta.tsx`

- [ ] **Step 1: Write the component**

```tsx
// packages/crm/src/components/dashboard/create-client-cta.tsx
// Dashboard header CTA + workspace usage badge. Spec §"Dashboard CTA".
//
// Design system recommendation (Task 9.1): <paste here>
// UX copy (Task 9.2): COPY const below.
"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UpgradeModal } from "@/components/billing/upgrade-modal";

// Replace with Task 9.2 output.
const COPY = {
  cta: "Create Client Workspace",
  tooltipTemplate: (tier: string) => `On ${tier.charAt(0).toUpperCase()}${tier.slice(1)} plan`,
};

export type CreateClientCtaProps = {
  tier: "free" | "growth" | "scale";
  used: number;
  limit: number;
};

export function CreateClientCta({ tier, used, limit }: CreateClientCtaProps) {
  const [open, setOpen] = useState(false);
  const atLimit = Number.isFinite(limit) && used >= limit;
  const limitLabel = Number.isFinite(limit) ? `${used}/${limit} workspaces` : `${used} workspaces`;

  return (
    <div className="flex items-center gap-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary">{limitLabel}</Badge>
        </TooltipTrigger>
        <TooltipContent>{COPY.tooltipTemplate(tier)}</TooltipContent>
      </Tooltip>

      {atLimit ? (
        <>
          <Button onClick={() => setOpen(true)}>{COPY.cta}</Button>
          <UpgradeModal
            open={open}
            onOpenChange={setOpen}
            tier={tier === "scale" ? "growth" : (tier as "free" | "growth")}
            used={used}
            limit={Number.isFinite(limit) ? limit : 0}
          />
        </>
      ) : (
        <Button asChild>
          <Link href="/clients/new">{COPY.cta}</Link>
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck
```

Expected: success. If the codebase doesn't already have `@/components/ui/tooltip` or `badge`, the design-system skill in Task 9.1 will tell you what to swap (probably just a `span` with a `title` attribute as a fallback).

### Task 9.4: Wire the CTA into the dashboard header

**Files:**
- Modify: `packages/crm/src/app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Insert the import + call**

Open `packages/crm/src/app/(dashboard)/dashboard/page.tsx`. At the top, add:

```typescript
import { CreateClientCta } from "@/components/dashboard/create-client-cta";
import { enforceWorkspaceLimit } from "@/lib/web-onboarding/workspace-limit";
```

Inside the default exported async component, after the existing `getCurrentUser()` call, compute the limit:

```typescript
const limit = await enforceWorkspaceLimit({ userId: user.id });
```

Then locate the dashboard header section (find the existing welcome heading near the top of the JSX — see the file's lines 22-37 for the "welcome-section" structural notes) and add the CTA to the right side of the flex row:

```tsx
<div className="ml-auto">
  <CreateClientCta
    tier={limit.tier}
    used={limit.used}
    limit={limit.limit}
  />
</div>
```

Exact placement: inside the outermost flex container of the welcome/header section, as the last child.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/components/dashboard/create-client-cta.tsx packages/crm/src/app/\(dashboard\)/dashboard/page.tsx
git commit -m "feat(dashboard): Create Client Workspace CTA with usage badge + at-limit modal"
```

### Task 9.5: Invoke design:accessibility-review on the CTA

- [ ] **Step 1: Invoke the skill**

Run the `design:accessibility-review` skill with this prompt:

> "Audit `packages/crm/src/components/dashboard/create-client-cta.tsx`. The component renders either a Link or a Button depending on at-limit state; the Button opens UpgradeModal. Check: keyboard activation of the modal trigger (Enter and Space both fire), tooltip on the badge is accessible (use aria-describedby instead of title?), the badge text 'X/Y workspaces' is read sensibly by screen readers (e.g. is '/' announced as 'of'?). Return concrete fixes."

- [ ] **Step 2: Apply inline fixes + commit**

```bash
git add packages/crm/src/components/dashboard/create-client-cta.tsx
git commit -m "fix(dashboard): apply accessibility-review fixes to CreateClientCta"
```

---

## Phase 10 — Google OAuth + signup redirect

The Google OAuth button is ALREADY wired in `packages/crm/src/app/(auth)/signup/signup-form.tsx` (lines 7-21, 72-80) — see Phase 0 exploration. This phase only updates the post-signup redirect target.

### Task 10.1: Update the signup form callback URL

**Files:**
- Modify: `packages/crm/src/app/(auth)/signup/signup-form.tsx`

- [ ] **Step 1: Change the literal**

In `packages/crm/src/app/(auth)/signup/signup-form.tsx` find line 24:

```typescript
const callbackUrl = token ? `/claim?token=${encodeURIComponent(token)}` : "/setup";
```

Replace with:

```typescript
const callbackUrl = token ? `/claim?token=${encodeURIComponent(token)}` : "/clients/new";
```

- [ ] **Step 2: Update the signup server actions**

In `packages/crm/src/app/(auth)/signup/actions.ts`:
- Line 40: change `return "/setup";` → `return "/clients/new";`
- Line 49: change `await signIn("google", { redirectTo: "/setup" });` → `await signIn("google", { redirectTo: "/clients/new" });`

- [ ] **Step 3: Update the login form**

In `packages/crm/src/app/(auth)/login/login-form.tsx` line 52: change `callbackInput.value = "/setup";` → `callbackInput.value = "/clients/new";`.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm typecheck
```

Expected: success.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/app/\(auth\)/
git commit -m "feat(auth): redirect signup/login to /clients/new instead of /setup"
```

### Task 10.2: Invoke design:ux-copy for the Google button label

The button label is currently "Sign in with Google" on the signup page. Spec says "Continue with Google".

- [ ] **Step 1: Invoke the skill**

Run the `design:ux-copy` skill with this prompt:

> "Two strings on the SeldonFrame signup page. (1) The Google OAuth button currently reads 'Sign in with Google'. The spec asks for 'Continue with Google'. Confirm or refine — should it differ between signup ('Continue with Google') and login ('Sign in with Google')? (2) The 'or' divider between OAuth and the email form — currently 'OR' in uppercase, single word. Should it stay or change?"

- [ ] **Step 2: Apply the recommended copy**

Edit `packages/crm/src/app/(auth)/signup/signup-form.tsx`:
- Line 79: change `Sign in with Google` to `Continue with Google` (per spec — but apply the skill's recommendation if it differs)
- Line 85: confirm the `or` divider copy

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/app/\(auth\)/signup/signup-form.tsx
git commit -m "fix(auth): refine Google OAuth + divider copy per design:ux-copy"
```

### Task 10.3: Invoke design:accessibility-review on the signup form

- [ ] **Step 1: Invoke the skill**

Run the `design:accessibility-review` skill with this prompt:

> "Audit `packages/crm/src/app/(auth)/signup/signup-form.tsx`. Check: keyboard tab order between Google OAuth button → 'or' divider → email input → submit button → 'Sign in' link, Google button has accessible label (currently just text), divider with `aria-hidden`, the Google SVG has `aria-hidden='true'` (currently does — verify), focus visible on all interactive elements. Return concrete fixes."

- [ ] **Step 2: Apply inline fixes + commit**

```bash
git add packages/crm/src/app/\(auth\)/signup/signup-form.tsx
git commit -m "fix(auth): apply accessibility-review fixes to signup form"
```

---

## Phase 11 — SetupWizard deletion + redirect updates

### Task 11.1: Delete the SetupWizard files

**Files:**
- Delete: `packages/crm/src/app/(onboarding)/setup/page.tsx`
- Delete: `packages/crm/src/components/soul/setup-wizard.tsx`
- Delete: `packages/crm/src/app/orgs/new/page.tsx`

- [ ] **Step 1: Run the deletions**

```bash
git rm packages/crm/src/app/\(onboarding\)/setup/page.tsx
git rm packages/crm/src/components/soul/setup-wizard.tsx
git rm packages/crm/src/app/orgs/new/page.tsx
```

- [ ] **Step 2: Find remaining imports of the deleted files**

```bash
grep -r "setup-wizard\|onboarding/setup\|orgs/new" packages/crm/src --include="*.ts" --include="*.tsx"
```

Expected: zero hits in `src/` (some hits in `.next/` build cache — ignore those). If any source file still imports the deleted files, delete that file too (it's dead code from the same path) or surface it as a question — but per the spec scope, only `setup-wizard.tsx` and the two pages above were importers.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm typecheck
```

Expected: success.

### Task 11.2: Update remaining /setup redirects

**Files (all modify):**
- `packages/crm/src/app/(onboarding)/welcome/page.tsx`
- `packages/crm/src/proxy.ts`
- `packages/crm/src/components/layout/dashboard-topbar.tsx`
- `packages/crm/src/lib/billing/actions.ts`
- `packages/crm/src/lib/integrations/actions.ts`

- [ ] **Step 1: Make each replacement**

For each file, change every `/setup` literal to `/clients/new`. Exact lines + originals:

- `packages/crm/src/app/(onboarding)/welcome/page.tsx:25`
  - `redirect("/setup");` → `redirect("/clients/new");`
- `packages/crm/src/proxy.ts:110`
  - `return pathname === "/login" || pathname === "/signup" || pathname === "/setup" || pathname === "/welcome";` → `return pathname === "/login" || pathname === "/signup" || pathname === "/clients/new" || pathname === "/welcome";`
- `packages/crm/src/proxy.ts:194`
  - `return NextResponse.redirect(new URL("/setup", request.url));` → `return NextResponse.redirect(new URL("/clients/new", request.url));`
- `packages/crm/src/proxy.ts:207`
  - `if (isAuthenticated && !isSoulCompleted && pathname !== "/setup" && !isPublicPath(pathname)) {` → `if (isAuthenticated && !isSoulCompleted && pathname !== "/clients/new" && !isPublicPath(pathname)) {`
- `packages/crm/src/proxy.ts:208`
  - `return NextResponse.redirect(new URL("/setup", request.url));` → `return NextResponse.redirect(new URL("/clients/new", request.url));`
- `packages/crm/src/components/layout/dashboard-topbar.tsx:31`
  - `"/setup": "Soul Setup",` → `"/clients/new": "New Client",`
- `packages/crm/src/lib/billing/actions.ts:70`
  - `success_url: \`${appBaseUrl}/setup?plan=${encodeURIComponent(params.planId)}&billing=${params.billingPeriod}\`,` → swap `/setup` segment for `/clients/new`
- `packages/crm/src/lib/billing/actions.ts:163`
  - `redirect(\`/setup?plan=${encodeURIComponent(planId)}&billing=${normalizedPeriod}\`);` → swap `/setup` segment for `/clients/new`
- `packages/crm/src/lib/integrations/actions.ts:232`
  - `revalidatePath("/setup");` → `revalidatePath("/clients/new");`
- `packages/crm/src/lib/integrations/actions.ts:298`
  - `revalidatePath("/setup");` → `revalidatePath("/clients/new");`

- [ ] **Step 2: Verify no remaining /setup references in src/**

```bash
grep -r '"/setup"\|/setup?\|/setup\b' packages/crm/src --include="*.ts" --include="*.tsx"
```

Expected: zero hits.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm typecheck
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/
git commit -m "refactor: replace all /setup redirects with /clients/new and delete SetupWizard"
```

---

## Phase 12 — End-to-end manual smoke test (surface to user)

### Task 12.1: Surface the manual smoke test to the user

This is the FIRST and ONLY task that does NOT run automation. It exists because the full create-from-url path requires a real Anthropic API key in a real DB; agentic execution should not provision either.

- [ ] **Step 1: Write the smoke test instructions to a scratch file**

```bash
cat > tmp-smoke-test-instructions.md <<'EOF'
# Cut A — End-to-end smoke test (manual)

Run these steps after merging Cut A:

1. **Migration**: from a staging shell, `pnpm --filter @seldonframe/crm db:push`. Verify it prints `0099_users_agency_profile`.
2. **Verify backfill**: `psql $DATABASE_URL -c "SELECT id, email, agency_profile->>'name' FROM users LIMIT 5;"` — expect the org name in `agency_profile.name` for any user with a primary org.
3. **Signup flow**: in an incognito window, hit `https://app.seldonframe.com/signup`. Click "Continue with Google" — confirm you land on `/clients/new` after auth, not `/setup`.
4. **Paste URL (BYOK present)**: as a user whose `organizations.integrations.anthropic.apiKey` is already populated (use a seed account or set it via `/settings/integrations/llm`), paste `https://stripe.com` on `/clients/new`. Click Create. Confirm:
   - Progress narration column ticks through fetching → extracting → soul_built → landing_built → chatbot_built → demo_seeded
   - Browser navigates to the new workspace's dashboard within ~60 sec
   - The new org exists in `SELECT * FROM organizations WHERE owner_id = '<your user id>' ORDER BY created_at DESC LIMIT 1`
5. **Paste URL (no BYOK)**: as a fresh signup with no Anthropic key, paste a URL and submit. Confirm the BYOK inline prompt appears. Paste a key, click Save and continue, confirm extraction resumes and workspace creates.
6. **Tier limit (Free at limit)**: with a Free-tier account that already has 1 workspace, attempt another. Confirm the UpgradeModal opens immediately on Create click without an SSE attempt.
7. **Invalid URL**: type "not-a-url" and submit. Confirm the 400 banner appears.
8. **Extraction failed**: paste a URL that Anthropic cannot fetch (e.g. `https://localhost:9999`). Confirm the 422 banner appears.
9. **Dashboard CTA**: navigate to `/dashboard`. Confirm the "Create Client Workspace" button + usage badge ("X/Y workspaces") appear in the header. Click while at limit → UpgradeModal opens. Click while under limit → navigates to `/clients/new`.
10. **SetupWizard gone**: hit `/setup` directly. Confirm 404 OR redirect to `/clients/new` (proxy rule will redirect when unfinished-soul state triggers).

Sign off when all 10 pass.
EOF
```

- [ ] **Step 2: Report the smoke test to the user**

In your final response to the orchestrator, include the smoke test contents above. Do not commit the scratch file (it's gitignored as `tmp-*`).

- [ ] **Step 3: Final typecheck across the whole repo**

```bash
pnpm typecheck
```

Expected: success (modulo the 4 pre-existing failing-test type errors noted at top).

- [ ] **Step 4: Run the full Cut A unit test suite**

```bash
cd packages/crm && node --import tsx --test tests/unit/web-onboarding/*.spec.ts tests/unit/web-onboarding/*.spec.tsx
```

Expected: all green. Count: 5 (url) + 6 (parser) + 4 (byok) + 5 (limit) + 3 (sse) + 5 (prompt) + 3 (extractor) + 6 (route) + 4 (modal) + 4 (form) = **45 passing tests**.

---

## Cut A complete

At this point the web-onboarding front door is shipped end-to-end:

- Schema column `users.agency_profile` exists and backfilled.
- `POST /api/v1/web/workspaces/create-from-url` accepts a URL, auths, enforces tier limit, requires BYOK, calls Anthropic `web_fetch`, parses, creates workspace, streams SSE events.
- `/clients/new` page renders the URL form with live SSE narration, BYOK swap-in, UpgradeModal on 402, error banners on 400/422/500.
- Dashboard header shows the "Create Client Workspace" button + usage badge with at-limit modal.
- Google OAuth + email signup both redirect to `/clients/new` after success.
- `/setup` routes are gone; all redirects updated.
- `UpgradeModal` component lives at `packages/crm/src/components/billing/upgrade-modal.tsx` for Cut B and Cut C to reuse without redefinition.
- All 4 design skills (`design:design-system`, `design:ux-copy`, `design:design-critique`, `design:accessibility-review`) were invoked across the 3 user-facing surfaces (UpgradeModal, /clients/new, dashboard CTA, signup form).

Cut B and Cut C consume the inter-Cut interfaces listed at the top of this plan.
