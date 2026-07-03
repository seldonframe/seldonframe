# Agent Taste Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anonymous, flag-gated "taste mode" on `POST /api/v1/agents/[slug]/mcp` — N free read-only calls with instant business-grounding (`ground_on_my_business`), then a three-door conversion response.

**Architecture:** All new logic is pure + dependency-injected under `src/lib/marketplace/taste/`; the existing DI'd handler (`agent-mcp-handler.ts`) grows one optional `taste` dep — absent ⇒ byte-identical to today. The route builds real taste deps only when `SF_AGENT_TASTE_MODE=1`. Grounding reuses `assertPublicHttpUrl` + the analyze-url fetch/extract shape; session state is a signed `tst_` token (rental-token pattern) keyed to a ≤1h-TTL DB row.

**Tech Stack:** Next.js App Router route handlers, Drizzle/Postgres (hand-written migration), `node:crypto` HMAC, `checkRateLimit` (Upstash/in-memory), Anthropic SDK, `node:test` + `assert/strict` specs run by `scripts/run-unit-tests.js`.

**Companion design doc:** `2026-07-03-agent-taste-mode-design.md` (same directory — read it first; every decision below is justified there).

## Global Constraints

- **Flag:** `SF_AGENT_TASTE_MODE` — taste deps are built ONLY when `process.env.SF_AGENT_TASTE_MODE?.trim() === "1"`. Unset ⇒ anonymous behavior byte-identical to today (Task 8 proves it by deep-equal).
- **Taste lane requires `bearer === null`.** Any presented bearer (valid/expired/junk) takes today's `authorize()` path verbatim.
- **Money-safety invariant:** a taste call never spends the platform key unless `creatorOrgId ∈ SF_FLAGSHIP_ORG_IDS` (comma-separated env). Detection: `getAIClient(...)` result `provider === "platform"` (src/lib/ai/client.ts:232). Task 6's spec proves refusal and proves the turn runner is never invoked on that branch.
- **Model pin:** `TASTE_MODEL = "claude-3-5-haiku-20241022"` (repo cheap tier — value of `DEFAULT_TERTIARY_MODEL`, personality-generator.ts:359). Turn output ceiling `TASTE_MAX_TOKENS = 400`; extraction `max_tokens: 1200`, input ≤ 20 000 chars.
- **Caps (24h windows via `checkRateLimit(key, limit, 86_400_000)`):** visitor calls `clamp(prefs.tasteCallsPerVisitor ?? 3, 0, 10)` on `taste:calls:<listingId>:<ipHash>`; listing daily `clamp(prefs.tasteDailyCap ?? 50, 0, 500)` on `taste:daily:<listingId>`; grounding 2/day on `taste:ground:<listingId>:<ipHash>` and 6/day on `taste:ground:ip:<ipHash>`; started-event dedupe 1/day on `taste:started:<listingId>:<ipHash>`.
- **Tool allowlist (anonymous):** `get_quote_range`, `provide_faq_answer`, `ask` (taste variant), `ground_on_my_business`. Turn capability intersection: `["provide_faq_answer","get_quote_range"]`; `testMode: true` always. `prompts/*` stay key-gated.
- **Session:** `tst_` HMAC token (payload `{v:1,s:slug,sid,x}`), TTL `3_600_000` ms; blob ≤ `8192` bytes serialized; row in `agent_taste_sessions`; cleanup piggybacked on `/api/cron/orphan-workspace-ttl`.
- **Migration numbering (both cases, house rule — NEVER `drizzle-kit generate`):** hand-written SQL + hand-appended journal entry. Case A (worktree state today): disk tail `0062_wallet_rls` / journal idx 39 → create `0063_agent_taste_sessions.sql`, journal idx 40. Case B (OAuth wave landed): disk tail `0063_oauth_clients` / idx 40 → create `0064_agent_taste_sessions.sql`, idx 41. **Check the actual disk tail + journal tail at implementation time; use next-on-disk number + next idx.**
- **Doors URLs (locked):** keep-talking + sell → `https://seldonframe.com/build`; fork → `<NEXT_PUBLIC_APP_URL || "https://app.seldonframe.com">/marketplace/<slug>`.
- **Events:** `trackEvent(name, props, { orgId: creatorOrgId })` — names `taste_session_started`, `taste_grounded`, `taste_limit_hit`. P1 tracking only; no billing/accrual changes; taste calls never emit `agent_rental_call`.
- **Logging hygiene:** never log the `tst_` token, any API key, or raw IPs (log `sid` + ipHash only).
- **Test baseline:** `pnpm test:unit` has a ~75-failure pre-existing baseline — judge by delta. Targeted runs: `node scripts/run-unit-tests.js <spec path>` from the repo root. Spec imports: this plan uses relative paths; if neighboring specs (`packages/crm/tests/unit/marketplace/fork-listing.spec.ts`) use the `@/` alias, mirror that instead.
- Work on a feature branch `feature/agent-taste-mode` off `main`. Commit after every task with the trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Schema — `agent_taste_sessions` table, `sellerPreferences` column, hand-written migration

**Files:**
- Create: `packages/crm/src/db/schema/agent-taste-sessions.ts`
- Modify: `packages/crm/src/db/schema/marketplace.ts` (add `sellerPreferences` column + type, near `trustStats` at ~line 175)
- Modify: `packages/crm/src/db/schema/index.ts` (export the new table — schema-index export is a known repo gotcha, see commit 248ef12d)
- Create: `packages/crm/drizzle/0063_agent_taste_sessions.sql` (**or `0064_…` per the both-cases rule — check disk first**)
- Modify: `packages/crm/drizzle/meta/_journal.json` (hand-append entry)

**Interfaces:**
- Produces: `agentTasteSessions` drizzle table; `ListingSellerPreferences = { tasteCallsPerVisitor?: number; tasteDailyCap?: number }` exported from `schema/marketplace.ts`; column `marketplaceListings.sellerPreferences: ListingSellerPreferences | null`.

- [ ] **Step 1: Check the real migration tail (both-cases rule)**

```bash
ls packages/crm/drizzle/*.sql | sort | tail -3
node -e "const j=require('./packages/crm/drizzle/meta/_journal.json'); console.log(j.entries[j.entries.length-1])"
```
Expected (Case A): `0062_wallet_rls.sql` last on disk, journal tail `idx: 39`. Then the new file is `0063_agent_taste_sessions.sql` with journal `idx: 40`. If `0063_oauth_clients` is present (Case B): use `0064_agent_taste_sessions.sql` / `idx: 41`. All later steps say `0063`/`40` — substitute if Case B.

- [ ] **Step 2: Create the table schema file**

```ts
// packages/crm/src/db/schema/agent-taste-sessions.ts
//
// Taste mode (anonymous MCP rental free lane) — short-TTL grounding sessions.
// One row per successful ground_on_my_business call. Anonymous-write safety:
// rows are created ONLY behind per-IP creation caps, TTL <= 1h, grounding blob
// size-capped at 8KB serialized (enforced in taste-session-store.ts), and
// expired rows are swept by the orphan-workspace-ttl cron. No org-owned data
// lives here; ip_hash is sha256(ip|secret) — raw IPs are never stored.

import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { marketplaceListings } from "./marketplace";

export type TasteGrounding = {
  businessName: string;
  industry?: string;
  tagline?: string;
  description?: string;
  services?: string[];
  voiceTone?: string;
  idealClient?: string;
  sourceDomain: string;
};

export const agentTasteSessions = pgTable(
  "agent_taste_sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`).notNull(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => marketplaceListings.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    sourceUrl: text("source_url").notNull(),
    grounding: jsonb("grounding").$type<TasteGrounding>().notNull(),
    ipHash: text("ip_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("idx_agent_taste_sessions_expires_at").on(t.expiresAt)],
);
```

Note: match the surrounding schema files' index-definition style — if `marketplace.ts` uses the `(t) => ({ name: index(...) })` object form instead of the array form, mirror it.

- [ ] **Step 3: Add `sellerPreferences` to `marketplaceListings`**

In `packages/crm/src/db/schema/marketplace.ts`, directly below the `trustStats` column (~line 175):

```ts
/** Seller-controlled taste-mode budget (design: 2026-07-03-agent-taste-mode).
 *  Absent/null => defaults (3 calls/visitor, 50/day). tasteCallsPerVisitor: 0
 *  disables taste for this listing. Platform clamps: [0,10] and [0,500]. */
sellerPreferences: jsonb("seller_preferences").$type<ListingSellerPreferences | null>(),
```

And near the file's other exported types:

```ts
export type ListingSellerPreferences = {
  tasteCallsPerVisitor?: number;
  tasteDailyCap?: number;
};
```

- [ ] **Step 4: Export from the schema index**

In `packages/crm/src/db/schema/index.ts`, add alongside the existing exports:

```ts
export * from "./agent-taste-sessions";
```

- [ ] **Step 5: Hand-write the migration SQL**

```sql
-- packages/crm/drizzle/0063_agent_taste_sessions.sql
-- Taste mode: anonymous grounding sessions + per-listing seller taste budget.
-- HAND-WRITTEN (house rule: never drizzle-kit generate in this repo).
CREATE TABLE "agent_taste_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "listing_id" uuid NOT NULL,
  "slug" text NOT NULL,
  "source_url" text NOT NULL,
  "grounding" jsonb NOT NULL,
  "ip_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  CONSTRAINT "agent_taste_sessions_listing_id_fk"
    FOREIGN KEY ("listing_id") REFERENCES "marketplace_listings"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "idx_agent_taste_sessions_expires_at" ON "agent_taste_sessions" ("expires_at");
--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD COLUMN "seller_preferences" jsonb;
```

Before writing, open `packages/crm/drizzle/0062_wallet_rls.sql` (or the actual tail file) and mirror its exact FK/statement-breakpoint conventions. If it establishes an RLS pattern for new tables, replicate it here.

- [ ] **Step 6: Hand-append the journal entry**

In `packages/crm/drizzle/meta/_journal.json`, append to `entries` (copy the tail entry's shape exactly — same `version`/`breakpoints` values as its neighbors):

```json
{ "idx": 40, "version": "7", "when": 1751500800000, "tag": "0063_agent_taste_sessions", "breakpoints": true }
```

Use the real prior entry's `version` string and a fresh epoch-ms `when` (`node -e "console.log(Date.now())"`).

- [ ] **Step 7: Typecheck**

```bash
cd packages/crm && npx tsc --noEmit -p tsconfig.json
```
Expected: no NEW errors versus a pre-task run (capture baseline first: run it once before Step 2 and diff).

- [ ] **Step 8: Commit**

```bash
git add packages/crm/src/db/schema/agent-taste-sessions.ts packages/crm/src/db/schema/marketplace.ts packages/crm/src/db/schema/index.ts packages/crm/drizzle/0063_agent_taste_sessions.sql packages/crm/drizzle/meta/_journal.json
git commit -m "feat(taste): agent_taste_sessions table + sellerPreferences column (hand-written 0063)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `taste-policy.ts` — constants, clamps, flagship parse, doors + instructions copy

**Files:**
- Create: `packages/crm/src/lib/marketplace/taste/taste-policy.ts`
- Test: `packages/crm/tests/unit/marketplace/taste/taste-policy.spec.ts`

**Interfaces:**
- Consumes: `ListingSellerPreferences` (Task 1).
- Produces (used by Tasks 5-9): `TASTE_MODEL`, `TASTE_MAX_TOKENS`, `TASTE_EXTRACT_MAX_TOKENS`, `TASTE_EXTRACT_INPUT_CHARS`, `TASTE_SESSION_TTL_MS`, `TASTE_GROUNDING_MAX_BYTES`, `TASTE_CAPABILITY_ALLOWLIST`, `TASTE_TOOL_ALLOWLIST`, `DAY_MS`; `isTasteFlagOn(env)`, `parseFlagshipOrgIds(env)`, `resolveTasteBudget(prefs)`, `hashTasteIp(ip, secret)`, `appBaseUrl(env)`, `buildTasteDoorsText(input)`, `buildTasteInstructions(input)`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/crm/tests/unit/marketplace/taste/taste-policy.spec.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isTasteFlagOn,
  parseFlagshipOrgIds,
  resolveTasteBudget,
  hashTasteIp,
  buildTasteDoorsText,
  buildTasteInstructions,
  TASTE_MODEL,
  TASTE_MAX_TOKENS,
  TASTE_SESSION_TTL_MS,
  TASTE_GROUNDING_MAX_BYTES,
  TASTE_CAPABILITY_ALLOWLIST,
  TASTE_TOOL_ALLOWLIST,
} from "../../../../src/lib/marketplace/taste/taste-policy";

describe("taste-policy constants", () => {
  it("pins the locked values", () => {
    assert.equal(TASTE_MODEL, "claude-3-5-haiku-20241022");
    assert.equal(TASTE_MAX_TOKENS, 400);
    assert.equal(TASTE_SESSION_TTL_MS, 3_600_000);
    assert.equal(TASTE_GROUNDING_MAX_BYTES, 8192);
    assert.deepEqual(TASTE_CAPABILITY_ALLOWLIST, ["provide_faq_answer", "get_quote_range"]);
    assert.deepEqual(
      [...TASTE_TOOL_ALLOWLIST].sort(),
      ["ask", "get_quote_range", "ground_on_my_business", "provide_faq_answer"],
    );
  });
});

describe("isTasteFlagOn", () => {
  it("is on only for exactly '1' (trimmed)", () => {
    assert.equal(isTasteFlagOn({ SF_AGENT_TASTE_MODE: "1" }), true);
    assert.equal(isTasteFlagOn({ SF_AGENT_TASTE_MODE: " 1 " }), true);
    assert.equal(isTasteFlagOn({ SF_AGENT_TASTE_MODE: "true" }), false);
    assert.equal(isTasteFlagOn({ SF_AGENT_TASTE_MODE: "" }), false);
    assert.equal(isTasteFlagOn({}), false);
  });
});

describe("parseFlagshipOrgIds", () => {
  it("splits, trims, drops empties", () => {
    assert.deepEqual(
      parseFlagshipOrgIds({ SF_FLAGSHIP_ORG_IDS: "a, b ,,c" }),
      new Set(["a", "b", "c"]),
    );
    assert.deepEqual(parseFlagshipOrgIds({}), new Set());
  });
});

describe("resolveTasteBudget", () => {
  it("defaults 3/visitor, 50/day when prefs absent", () => {
    assert.deepEqual(resolveTasteBudget(null), { visitorLimit: 3, dailyCap: 50, optedOut: false });
    assert.deepEqual(resolveTasteBudget(undefined), { visitorLimit: 3, dailyCap: 50, optedOut: false });
  });
  it("clamps to platform ceilings [0,10] and [0,500]", () => {
    assert.deepEqual(
      resolveTasteBudget({ tasteCallsPerVisitor: 99, tasteDailyCap: 9999 }),
      { visitorLimit: 10, dailyCap: 500, optedOut: false },
    );
    assert.deepEqual(
      resolveTasteBudget({ tasteCallsPerVisitor: -5, tasteDailyCap: -1 }),
      { visitorLimit: 0, dailyCap: 0, optedOut: true },
    );
  });
  it("zero visitor calls means opted out", () => {
    assert.equal(resolveTasteBudget({ tasteCallsPerVisitor: 0 }).optedOut, true);
  });
  it("ignores non-finite garbage", () => {
    assert.deepEqual(
      resolveTasteBudget({ tasteCallsPerVisitor: Number.NaN, tasteDailyCap: Infinity }),
      { visitorLimit: 3, dailyCap: 500, optedOut: false },
    );
  });
});

describe("hashTasteIp", () => {
  it("is deterministic, 32 hex chars, never the raw ip", () => {
    const h = hashTasteIp("203.0.113.9", "secret");
    assert.equal(h, hashTasteIp("203.0.113.9", "secret"));
    assert.match(h, /^[0-9a-f]{32}$/);
    assert.notEqual(hashTasteIp("203.0.113.9", "other"), h);
    assert.ok(!h.includes("203.0.113.9"));
  });
});

describe("doors + instructions copy", () => {
  it("doors carry the three real URLs and the agent name", () => {
    const text = buildTasteDoorsText({
      agentName: "HVAC Receptionist",
      slug: "hvac-receptionist",
      visitorLimit: 3,
      reason: "visitor_cap",
      env: {},
    });
    assert.ok(text.includes("https://seldonframe.com/build"));
    assert.ok(text.includes("https://app.seldonframe.com/marketplace/hvac-receptionist"));
    assert.ok(text.includes("HVAC Receptionist"));
    assert.ok(text.includes("3 free taste calls"));
  });
  it("locked_tool reason swaps the first line", () => {
    const text = buildTasteDoorsText({
      agentName: "A", slug: "a", visitorLimit: 3, reason: "locked_tool", env: {},
    });
    assert.ok(text.includes("needs a real rental key"));
  });
  it("fork door honors NEXT_PUBLIC_APP_URL", () => {
    const text = buildTasteDoorsText({
      agentName: "A", slug: "a", visitorLimit: 3, reason: "daily_cap",
      env: { NEXT_PUBLIC_APP_URL: "https://staging.example.com/" },
    });
    assert.ok(text.includes("https://staging.example.com/marketplace/a"));
  });
  it("instructions advertise the budget and ground-first", () => {
    const s = buildTasteInstructions({ agentName: "A", capabilities: [], visitorLimit: 5 });
    assert.ok(s.includes("5 free"));
    assert.ok(s.includes("ground_on_my_business"));
  });
});
```

- [ ] **Step 2: Run it — expect module-not-found failure**

```bash
node scripts/run-unit-tests.js packages/crm/tests/unit/marketplace/taste/taste-policy.spec.ts
```
Expected: FAIL (cannot find `taste-policy`).

- [ ] **Step 3: Implement**

```ts
// packages/crm/src/lib/marketplace/taste/taste-policy.ts
//
// Taste mode — pure policy: constants, clamps, flagship parse, doors copy.
// Everything here is env-free-by-parameter (env objects are passed in) so it
// unit-tests with no process.env mutation. Design:
// scratchpad/taste-mode/2026-07-03-agent-taste-mode-design.md §3, §4.

import { createHash } from "node:crypto";
import type { ListingSellerPreferences } from "@/db/schema/marketplace";

/** Cheap tier — the literal value of DEFAULT_TERTIARY_MODEL
 *  (lib/blocks/personality-generator.ts). Taste never escalates models. */
export const TASTE_MODEL = "claude-3-5-haiku-20241022";
/** Per-turn output ceiling (seller-spend protection). */
export const TASTE_MAX_TOKENS = 400;
/** Grounding extraction output ceiling + input truncation. */
export const TASTE_EXTRACT_MAX_TOKENS = 1200;
export const TASTE_EXTRACT_INPUT_CHARS = 20_000;
/** Session TTL — token expiry AND row expires_at agree on this. */
export const TASTE_SESSION_TTL_MS = 3_600_000; // 1h
/** Serialized grounding blob hard cap. */
export const TASTE_GROUNDING_MAX_BYTES = 8192;
export const DAY_MS = 86_400_000;

/** Platform hard ceilings the seller's budget clamps into. */
export const DEFAULT_TASTE_CALLS_PER_VISITOR = 3;
export const HARD_MAX_TASTE_CALLS_PER_VISITOR = 10;
export const DEFAULT_TASTE_DAILY_CAP = 50;
export const HARD_MAX_TASTE_DAILY_CAP = 500;

/** Capabilities the taste turn may hand the agent loop (creator-workspace
 *  readers and all side-effect tools are excluded; testMode:true is the second
 *  fence). */
export const TASTE_CAPABILITY_ALLOWLIST = ["provide_faq_answer", "get_quote_range"] as const;

export const GROUND_TOOL_NAME = "ground_on_my_business";

/** The anonymous tools/call allowlist (wire names). */
export const TASTE_TOOL_ALLOWLIST: ReadonlySet<string> = new Set([
  "get_quote_range",
  "provide_faq_answer",
  "ask",
  GROUND_TOOL_NAME,
]);

type EnvLike = Record<string, string | undefined>;

export function isTasteFlagOn(env: EnvLike): boolean {
  return env.SF_AGENT_TASTE_MODE?.trim() === "1";
}

/** SF-owned orgs where platform-key taste is intended (the flagship bench). */
export function parseFlagshipOrgIds(env: EnvLike): Set<string> {
  return new Set(
    (env.SF_FLAGSHIP_ORG_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}

export type TasteBudget = { visitorLimit: number; dailyCap: number; optedOut: boolean };

function clampInt(raw: unknown, fallback: number, max: number): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : fallback;
  return Math.min(Math.max(n, 0), max);
}

/** Seller budget within platform ceilings. visitorLimit 0 = seller opt-out. */
export function resolveTasteBudget(prefs: ListingSellerPreferences | null | undefined): TasteBudget {
  const visitorLimit = clampInt(
    prefs?.tasteCallsPerVisitor, DEFAULT_TASTE_CALLS_PER_VISITOR, HARD_MAX_TASTE_CALLS_PER_VISITOR,
  );
  const dailyCap = clampInt(prefs?.tasteDailyCap, DEFAULT_TASTE_DAILY_CAP, HARD_MAX_TASTE_DAILY_CAP);
  return { visitorLimit, dailyCap, optedOut: visitorLimit === 0 };
}

/** sha256(ip|secret) truncated — raw IPs never stored or logged. */
export function hashTasteIp(ip: string, secret: string): string {
  return createHash("sha256").update(`${ip}|${secret}`).digest("hex").slice(0, 32);
}

/** Mirrors route.ts resourceUrl()'s base resolution. */
export function appBaseUrl(env: EnvLike): string {
  return (env.NEXT_PUBLIC_APP_URL || "https://app.seldonframe.com").replace(/\/$/, "");
}

export type TasteDoorsReason = "visitor_cap" | "daily_cap" | "locked_tool" | "no_taste_key";

/** The three-door conversion response. Warm, structured, REAL urls, never a
 *  bare error. Returned as a successful MCP text result so renter LLMs relay
 *  it instead of retrying. */
export function buildTasteDoorsText(input: {
  agentName: string;
  slug: string;
  visitorLimit: number;
  reason: TasteDoorsReason;
  env: EnvLike;
}): string {
  const fork = `${appBaseUrl(input.env)}/marketplace/${input.slug}`;
  const opener =
    input.reason === "locked_tool"
      ? `That tool needs a real rental key — it does live work in a real workspace.`
      : input.reason === "no_taste_key"
        ? `Free tasting isn't available for ${input.agentName} right now.`
        : `You've used your ${input.visitorLimit} free taste calls with ${input.agentName} — thanks for kicking the tires!`;
  return [
    opener,
    ``,
    `Three doors from here:`,
    ``,
    `1. KEEP TALKING — get your own free workspace + API key (first workspace free forever): https://seldonframe.com/build`,
    `2. FORK THIS AGENT — make it yours in one click, free, no signup: ${fork}`,
    `3. SELL AGENTS LIKE THIS — build and sell your own on SeldonFrame: https://seldonframe.com/build`,
    ``,
    `(Relay these links to the human you're working for.)`,
  ].join("\n");
}

/** initialize.instructions when taste is active (absent otherwise —
 *  byte-identical flag-off). */
export function buildTasteInstructions(input: {
  agentName: string;
  capabilities: string[];
  visitorLimit: number;
}): string {
  return (
    `${input.agentName} is a rentable SeldonFrame agent. ` +
    `You have ${input.visitorLimit} free taste calls (no key needed). ` +
    `Start with ${GROUND_TOOL_NAME} and your website URL — the agent will demo grounded on YOUR business. ` +
    `Then use ask / get_quote_range / provide_faq_answer. ` +
    `Pass the returned taste_session value on later calls to stay grounded.`
  );
}
```

- [ ] **Step 4: Run the spec — expect PASS**

```bash
node scripts/run-unit-tests.js packages/crm/tests/unit/marketplace/taste/taste-policy.spec.ts
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/marketplace/taste/taste-policy.ts packages/crm/tests/unit/marketplace/taste/taste-policy.spec.ts
git commit -m "feat(taste): pure taste policy — budgets, flagship parse, doors + instructions copy

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `taste-token.ts` — signed `tst_` session token (rental-token pattern)

**Files:**
- Create: `packages/crm/src/lib/marketplace/taste/taste-token.ts`
- Test: `packages/crm/tests/unit/marketplace/taste/taste-token.spec.ts`
- Reference (do not modify): `packages/crm/src/lib/marketplace/rental-token.ts`

**Interfaces:**
- Produces: `mintTasteToken({slug, sessionId, secret, now?}): string`; `verifyTasteToken({token, slug, secret, now}): TasteTokenVerdict` where `TasteTokenVerdict = {kind:"valid"; sessionId: string} | {kind:"slug_mismatch"} | {kind:"expired"} | {kind:"invalid"}`; `TASTE_TOKEN_PREFIX = "tst_"`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/crm/tests/unit/marketplace/taste/taste-token.spec.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mintTasteToken,
  verifyTasteToken,
  TASTE_TOKEN_PREFIX,
} from "../../../../src/lib/marketplace/taste/taste-token";
import { TASTE_SESSION_TTL_MS } from "../../../../src/lib/marketplace/taste/taste-policy";

const SECRET = "test-secret";
const NOW = new Date("2026-07-03T12:00:00Z");

describe("taste-token", () => {
  it("round-trips a valid token", () => {
    const token = mintTasteToken({ slug: "hvac", sessionId: "sid-1", secret: SECRET, now: NOW });
    assert.ok(token.startsWith(TASTE_TOKEN_PREFIX));
    const v = verifyTasteToken({ token, slug: "hvac", secret: SECRET, now: NOW });
    assert.deepEqual(v, { kind: "valid", sessionId: "sid-1" });
  });

  it("binds to the slug", () => {
    const token = mintTasteToken({ slug: "hvac", sessionId: "sid-1", secret: SECRET, now: NOW });
    assert.equal(verifyTasteToken({ token, slug: "other", secret: SECRET, now: NOW }).kind, "slug_mismatch");
  });

  it("expires after exactly the 1h TTL (closed-open)", () => {
    const token = mintTasteToken({ slug: "s", sessionId: "x", secret: SECRET, now: NOW });
    const justBefore = new Date(NOW.getTime() + TASTE_SESSION_TTL_MS - 1);
    const atExpiry = new Date(NOW.getTime() + TASTE_SESSION_TTL_MS);
    assert.equal(verifyTasteToken({ token, slug: "s", secret: SECRET, now: justBefore }).kind, "valid");
    assert.equal(verifyTasteToken({ token, slug: "s", secret: SECRET, now: atExpiry }).kind, "expired");
  });

  it("rejects tampering, wrong secret, junk, and rk_ tokens", () => {
    const token = mintTasteToken({ slug: "s", sessionId: "x", secret: SECRET, now: NOW });
    assert.equal(verifyTasteToken({ token: token.slice(0, -2), slug: "s", secret: SECRET, now: NOW }).kind, "invalid");
    assert.equal(verifyTasteToken({ token, slug: "s", secret: "wrong", now: NOW }).kind, "invalid");
    assert.equal(verifyTasteToken({ token: "garbage", slug: "s", secret: SECRET, now: NOW }).kind, "invalid");
    assert.equal(verifyTasteToken({ token: "rk_abc.def", slug: "s", secret: SECRET, now: NOW }).kind, "invalid");
  });
});
```

- [ ] **Step 2: Run — expect FAIL (module not found)**

```bash
node scripts/run-unit-tests.js packages/crm/tests/unit/marketplace/taste/taste-token.spec.ts
```

- [ ] **Step 3: Implement (mirror rental-token.ts structure exactly)**

```ts
// packages/crm/src/lib/marketplace/taste/taste-token.ts
//
// Taste mode — signed opaque session token. Same proven shape as the rental
// key (lib/marketplace/rental-token.ts): tst_<b64url(payload)>.<b64url(hmac)>,
// constant-time compare, slug-bound, expiry distinct from invalid. The token
// carries ONLY {slug, sessionId, exp}; the grounding blob stays server-side in
// agent_taste_sessions (design D1 — never ship 8KB through the renter's LLM).

import { createHmac, timingSafeEqual } from "node:crypto";
import { TASTE_SESSION_TTL_MS } from "./taste-policy";

export const TASTE_TOKEN_PREFIX = "tst_";
const TOKEN_VERSION = 1;

type TastePayload = { v: number; s: string; sid: string; x: number };

export type TasteTokenVerdict =
  | { kind: "valid"; sessionId: string }
  | { kind: "slug_mismatch" }
  | { kind: "expired" }
  | { kind: "invalid" };

export function mintTasteToken(input: {
  slug: string;
  sessionId: string;
  secret: string;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const payload: TastePayload = {
    v: TOKEN_VERSION,
    s: input.slug,
    sid: input.sessionId,
    x: now.getTime() + TASTE_SESSION_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${TASTE_TOKEN_PREFIX}${payloadB64}.${sign(payloadB64, input.secret)}`;
}

export function verifyTasteToken(input: {
  token: string;
  slug: string;
  secret: string;
  now: Date;
}): TasteTokenVerdict {
  if (!input.token.startsWith(TASTE_TOKEN_PREFIX)) return { kind: "invalid" };
  const body = input.token.slice(TASTE_TOKEN_PREFIX.length);
  const dot = body.indexOf(".");
  if (dot <= 0 || dot === body.length - 1) return { kind: "invalid" };

  const payloadB64 = body.slice(0, dot);
  const presented = body.slice(dot + 1);
  const expected = sign(payloadB64, input.secret);

  let a: Buffer;
  let b: Buffer;
  try {
    a = Buffer.from(presented, "base64url");
    b = Buffer.from(expected, "base64url");
  } catch {
    return { kind: "invalid" };
  }
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { kind: "invalid" };

  let payload: TastePayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as TastePayload;
  } catch {
    return { kind: "invalid" };
  }
  if (typeof payload !== "object" || payload === null) return { kind: "invalid" };
  if (payload.v !== TOKEN_VERSION) return { kind: "invalid" };
  if (typeof payload.s !== "string" || payload.s.length === 0) return { kind: "invalid" };
  if (typeof payload.sid !== "string" || payload.sid.length === 0) return { kind: "invalid" };
  if (typeof payload.x !== "number") return { kind: "invalid" };

  if (payload.s !== input.slug) return { kind: "slug_mismatch" };
  if (input.now.getTime() >= payload.x) return { kind: "expired" };
  return { kind: "valid", sessionId: payload.sid };
}

function sign(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
node scripts/run-unit-tests.js packages/crm/tests/unit/marketplace/taste/taste-token.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/marketplace/taste/taste-token.ts packages/crm/tests/unit/marketplace/taste/taste-token.spec.ts
git commit -m "feat(taste): signed tst_ session token (rental-token pattern, 1h TTL)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `taste-session-store.ts` — size-capped create / TTL-checked read / expiry sweep

**Files:**
- Create: `packages/crm/src/lib/marketplace/taste/taste-session-store.ts`
- Test: `packages/crm/tests/unit/marketplace/taste/taste-session-store.spec.ts`

**Interfaces:**
- Consumes: `agentTasteSessions`, `TasteGrounding` (Task 1); `TASTE_GROUNDING_MAX_BYTES`, `TASTE_SESSION_TTL_MS` (Task 2).
- Produces: pure `truncateGroundingToCap(g): TasteGrounding` and `groundingByteSize(g): number`; DB-thin `createTasteSession(...)`, `getTasteSession({sessionId, now})`, `deleteExpiredTasteSessions(now)` (used by Tasks 5, 9, 10). DB functions take an optional `dbi` param defaulting to the real `db` so specs pass fakes (repo DI convention).

- [ ] **Step 1: Write the failing test (pure parts + fake-db wiring)**

```ts
// packages/crm/tests/unit/marketplace/taste/taste-session-store.spec.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  truncateGroundingToCap,
  groundingByteSize,
  isSessionExpired,
} from "../../../../src/lib/marketplace/taste/taste-session-store";
import { TASTE_GROUNDING_MAX_BYTES } from "../../../../src/lib/marketplace/taste/taste-policy";
import type { TasteGrounding } from "../../../../src/db/schema/agent-taste-sessions";

const big = (n: number) => "x".repeat(n);

describe("truncateGroundingToCap", () => {
  it("passes small groundings through unchanged", () => {
    const g: TasteGrounding = { businessName: "Acme", sourceDomain: "acme.com", services: ["a"] };
    assert.deepEqual(truncateGroundingToCap(g), g);
  });

  it("caps every field and always lands under the byte cap", () => {
    const g: TasteGrounding = {
      businessName: big(1000),
      description: big(20_000),
      tagline: big(5000),
      industry: big(5000),
      voiceTone: big(5000),
      idealClient: big(5000),
      services: Array.from({ length: 50 }, (_, i) => big(900) + i),
      sourceDomain: "acme.com",
    };
    const t = truncateGroundingToCap(g);
    assert.ok(groundingByteSize(t) <= TASTE_GROUNDING_MAX_BYTES, `size ${groundingByteSize(t)}`);
    assert.ok(t.services!.length <= 8);
    assert.ok(t.businessName.length <= 200);
    assert.equal(t.sourceDomain, "acme.com");
  });
});

describe("isSessionExpired", () => {
  it("closed-open expiry", () => {
    const exp = new Date("2026-07-03T13:00:00Z");
    assert.equal(isSessionExpired(exp, new Date("2026-07-03T12:59:59Z")), false);
    assert.equal(isSessionExpired(exp, new Date("2026-07-03T13:00:00Z")), true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
node scripts/run-unit-tests.js packages/crm/tests/unit/marketplace/taste/taste-session-store.spec.ts
```

- [ ] **Step 3: Implement**

```ts
// packages/crm/src/lib/marketplace/taste/taste-session-store.ts
//
// Taste mode — the anonymous session rows. Anonymous-write safety is enforced
// HERE (size cap) and in the handler (creation rate caps). Pure helpers are
// exported separately from the DB-thin wrappers so node:test covers the logic
// without Postgres (repo DI convention — see agent-mcp-handler.ts header).

import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { agentTasteSessions, type TasteGrounding } from "@/db/schema/agent-taste-sessions";
import { TASTE_GROUNDING_MAX_BYTES, TASTE_SESSION_TTL_MS } from "./taste-policy";

// ── pure ─────────────────────────────────────────────────────────────────────

export function groundingByteSize(g: TasteGrounding): number {
  return Buffer.byteLength(JSON.stringify(g), "utf8");
}

const FIELD_CAPS = {
  businessName: 200,
  industry: 120,
  tagline: 300,
  description: 1500,
  voiceTone: 300,
  idealClient: 400,
  service: 200,
  maxServices: 8,
} as const;

/** Field-wise truncation that guarantees the serialized blob fits the 8KB cap.
 *  Deterministic and lossy-by-design: taste grounding is a demo context, not a
 *  soul of record. */
export function truncateGroundingToCap(g: TasteGrounding): TasteGrounding {
  const cut = (s: string | undefined, n: number) => (typeof s === "string" ? s.slice(0, n) : undefined);
  const out: TasteGrounding = {
    businessName: (g.businessName ?? "").slice(0, FIELD_CAPS.businessName),
    sourceDomain: (g.sourceDomain ?? "").slice(0, 253),
    industry: cut(g.industry, FIELD_CAPS.industry),
    tagline: cut(g.tagline, FIELD_CAPS.tagline),
    description: cut(g.description, FIELD_CAPS.description),
    voiceTone: cut(g.voiceTone, FIELD_CAPS.voiceTone),
    idealClient: cut(g.idealClient, FIELD_CAPS.idealClient),
    services: (g.services ?? [])
      .slice(0, FIELD_CAPS.maxServices)
      .map((s) => String(s).slice(0, FIELD_CAPS.service)),
  };
  // Belt-and-braces: if still over (impossible with the caps above, but never
  // trust arithmetic where money/storage is involved), drop optional fields.
  if (groundingByteSize(out) > TASTE_GROUNDING_MAX_BYTES) {
    return {
      businessName: out.businessName,
      sourceDomain: out.sourceDomain,
      description: cut(out.description, 500),
    };
  }
  return out;
}

/** Closed-open: now >= expiresAt is expired (mirrors rental-token expiry). */
export function isSessionExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}

// ── DB-thin ──────────────────────────────────────────────────────────────────

type Dbi = typeof db;

export async function createTasteSession(
  input: {
    listingId: string;
    slug: string;
    sourceUrl: string;
    grounding: TasteGrounding;
    ipHash: string;
    now: Date;
  },
  dbi: Dbi = db,
): Promise<{ sessionId: string }> {
  const grounding = truncateGroundingToCap(input.grounding);
  const [row] = await dbi
    .insert(agentTasteSessions)
    .values({
      listingId: input.listingId,
      slug: input.slug,
      sourceUrl: input.sourceUrl.slice(0, 2000),
      grounding,
      ipHash: input.ipHash,
      expiresAt: new Date(input.now.getTime() + TASTE_SESSION_TTL_MS),
    })
    .returning({ id: agentTasteSessions.id });
  return { sessionId: row.id };
}

export async function getTasteSession(
  input: { sessionId: string; slug: string; now: Date },
  dbi: Dbi = db,
): Promise<TasteGrounding | null> {
  const [row] = await dbi
    .select({
      grounding: agentTasteSessions.grounding,
      expiresAt: agentTasteSessions.expiresAt,
      slug: agentTasteSessions.slug,
    })
    .from(agentTasteSessions)
    .where(and(eq(agentTasteSessions.id, input.sessionId), eq(agentTasteSessions.slug, input.slug)))
    .limit(1);
  if (!row) return null;
  if (isSessionExpired(row.expiresAt, input.now)) return null;
  return row.grounding;
}

/** Hygiene sweep — piggybacked on /api/cron/orphan-workspace-ttl (design D9).
 *  Correctness never depends on it (reads TTL-check independently). */
export async function deleteExpiredTasteSessions(now: Date, dbi: Dbi = db): Promise<void> {
  await dbi.delete(agentTasteSessions).where(lt(agentTasteSessions.expiresAt, now));
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
node scripts/run-unit-tests.js packages/crm/tests/unit/marketplace/taste/taste-session-store.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/marketplace/taste/taste-session-store.ts packages/crm/tests/unit/marketplace/taste/taste-session-store.spec.ts
git commit -m "feat(taste): session store — 8KB-capped grounding, 1h TTL reads, expiry sweep

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: `stateless-turn.ts` — additive `modelOverride` / `maxTokensOverride`

**Files:**
- Modify: `packages/crm/src/lib/agents/stateless-turn.ts` (input type ~line 66-95; every `client.messages.create` call site — initial ~line 173-179 and the recovery/escalation path near line 295)
- Test: `packages/crm/tests/unit/agents/stateless-turn-overrides.spec.ts`

**Interfaces:**
- Consumes: existing `RunStatelessAgentTurnInput`.
- Produces: two new OPTIONAL fields on `RunStatelessAgentTurnInput`: `modelOverride?: string` (when set, used for EVERY iteration — bypasses `resolveTurnModel` entirely, including recovery escalation) and `maxTokensOverride?: number` (replaces the hardcoded `MAX_TOKENS = 1024`). Absent ⇒ behavior unchanged for all existing callers (agent-rental-run.ts, the template test sandbox).

- [ ] **Step 1: Write the failing test**

```ts
// packages/crm/tests/unit/agents/stateless-turn-overrides.spec.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runStatelessAgentTurn } from "../../../src/lib/agents/stateless-turn";
import type { AgentBlueprint } from "../../../src/db/schema/agents";

// Minimal fake Anthropic client: records create() params, replies end_turn.
function makeFakeClient() {
  const calls: Array<{ model: string; max_tokens: number }> = [];
  const client = {
    messages: {
      create: async (params: { model: string; max_tokens: number }) => {
        calls.push({ model: params.model, max_tokens: params.max_tokens });
        return {
          stop_reason: "end_turn",
          content: [{ type: "text", text: "hi" }],
        };
      },
    },
  };
  return { client: client as never, calls };
}

const blueprint = {
  greeting: "hi",
  capabilities: [],
  faq: [],
} as unknown as AgentBlueprint;

const baseInput = {
  orgId: "org-1",
  orgSlug: "org",
  orgName: "Org",
  soul: null,
  timezone: "UTC",
  blueprint,
  messages: [{ role: "user" as const, content: "hello" }],
  testMode: true,
};

describe("stateless-turn overrides", () => {
  it("uses the override model + max_tokens on every create call", async () => {
    const { client, calls } = makeFakeClient();
    const result = await runStatelessAgentTurn({
      ...baseInput,
      client,
      modelOverride: "claude-3-5-haiku-20241022",
      maxTokensOverride: 400,
    });
    assert.equal(result.ok, true);
    assert.ok(calls.length >= 1);
    for (const c of calls) {
      assert.equal(c.model, "claude-3-5-haiku-20241022");
      assert.equal(c.max_tokens, 400);
    }
  });

  it("keeps today's defaults when overrides are absent", async () => {
    const { client, calls } = makeFakeClient();
    const result = await runStatelessAgentTurn({ ...baseInput, client });
    assert.equal(result.ok, true);
    assert.equal(calls[0].max_tokens, 1024);
    assert.notEqual(calls[0].model, "claude-3-5-haiku-20241022");
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (unknown property `modelOverride` under tsc/tsx, or default-behavior assertion only passing)

```bash
node scripts/run-unit-tests.js packages/crm/tests/unit/agents/stateless-turn-overrides.spec.ts
```

- [ ] **Step 3: Implement the additive change**

In `RunStatelessAgentTurnInput` (after `now?: Date;`):

```ts
  /** Taste mode / cost-pinned callers: force THIS model for every iteration —
   *  bypasses resolveTurnModel entirely (no adaptive/recovery escalation).
   *  Absent => today's behavior. */
  modelOverride?: string;
  /** Replaces the default 1024 output cap when set. */
  maxTokensOverride?: number;
```

At the model-resolution site (~line 152-179), change the model selection to honor the override, e.g.:

```ts
    const turnModel = input.modelOverride ?? resolveTurnModel({
      // ...existing args unchanged...
      defaultModel: MODEL,
    });
```

and in the `client.messages.create({ ... })` params:

```ts
        model: turnModel,
        max_tokens: input.maxTokensOverride ?? MAX_TOKENS,
```

Repeat for the recovery/escalation call site near line 295: the escalated model must ALSO be `input.modelOverride ?? <escalated>` — grep the file for every `resolveTurnModel(` and every `messages.create(` and apply both overrides at each.

- [ ] **Step 4: Run the new spec AND the existing stateless-turn spec (regression)**

```bash
node scripts/run-unit-tests.js packages/crm/tests/unit/agents/stateless-turn-overrides.spec.ts
node scripts/run-unit-tests.js packages/crm/tests/unit/agents/stateless-turn.spec.ts
```
Expected: both PASS (if the second path doesn't exist, run `pnpm test:unit` and confirm no new failures vs baseline).

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/agents/stateless-turn.ts packages/crm/tests/unit/agents/stateless-turn-overrides.spec.ts
git commit -m "feat(agents): optional modelOverride/maxTokensOverride on runStatelessAgentTurn (additive)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: `taste-turn.ts` — seller-key turn with the flagship platform-key guard (THE money test)

**Files:**
- Create: `packages/crm/src/lib/marketplace/taste/taste-turn.ts`
- Test: `packages/crm/tests/unit/marketplace/taste/taste-turn.spec.ts`

**Interfaces:**
- Consumes: `getAIClient` shape `{client, provider}` (src/lib/ai/client.ts:189-233), `runStatelessAgentTurn` + overrides (Task 5), `TASTE_MODEL`/`TASTE_MAX_TOKENS`/`TASTE_CAPABILITY_ALLOWLIST` (Task 2), `RentalAgent` (agent-rental-run.ts:42-64), `TasteGrounding` (Task 1).
- Produces: `runTasteTurn(input, deps): Promise<RentalTurnResult>` with `TasteTurnDeps = { getClient, runTurn, flagshipOrgIds }`. `RentalTurnResult` is the existing type from agent-rental-run.ts (`{ok:true; reply; conversationId} | {ok:false; reason; message}`); refusal reason string: `"no_taste_key"`.

- [ ] **Step 1: Write the failing test — including the money invariant**

```ts
// packages/crm/tests/unit/marketplace/taste/taste-turn.spec.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runTasteTurn, type TasteTurnDeps } from "../../../../src/lib/marketplace/taste/taste-turn";
import type { RentalAgent } from "../../../../src/lib/marketplace/agent-rental-run";

const agent = {
  listingId: "l1",
  slug: "hvac",
  agentName: "HVAC Bot",
  capabilities: ["provide_faq_answer", "get_quote_range", "book_appointment", "take_message"],
  creatorOrgId: "seller-org",
  creatorOrgName: "Seller Co",
  creatorOrgSlug: "seller",
  soul: null,
  timezone: "UTC",
  blueprint: { capabilities: ["provide_faq_answer", "get_quote_range", "book_appointment"] },
} as unknown as RentalAgent;

function makeDeps(overrides: Partial<TasteTurnDeps> = {}) {
  const seen: { turnInputs: unknown[]; getClientCalls: number } = { turnInputs: [], getClientCalls: 0 };
  const deps: TasteTurnDeps = {
    getClient: async () => {
      seen.getClientCalls += 1;
      return { client: { fake: true } as never, provider: "anthropic" };
    },
    runTurn: async (input) => {
      seen.turnInputs.push(input);
      return { ok: true, reply: "grounded reply", toolCalls: [] };
    },
    flagshipOrgIds: new Set<string>(),
    ...overrides,
  };
  return { deps, seen };
}

describe("runTasteTurn — money invariant", () => {
  it("REFUSES when the seller resolves to the platform key and is not flagship — and never runs the turn", async () => {
    const { deps, seen } = makeDeps({
      getClient: async () => ({ client: { fake: true } as never, provider: "platform" }),
    });
    const result = await runTasteTurn({ agent, message: "hi", grounding: null }, deps);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "no_taste_key");
    assert.equal(seen.turnInputs.length, 0, "turn runner must NOT be invoked on the refusal branch");
  });

  it("ALLOWS platform key for a flagship org", async () => {
    const { deps, seen } = makeDeps({
      getClient: async () => ({ client: { fake: true } as never, provider: "platform" }),
      flagshipOrgIds: new Set(["seller-org"]),
    });
    const result = await runTasteTurn({ agent, message: "hi", grounding: null }, deps);
    assert.equal(result.ok, true);
    assert.equal(seen.turnInputs.length, 1);
  });

  it("refuses cleanly when no client resolves at all", async () => {
    const { deps, seen } = makeDeps({
      getClient: async () => ({ client: null, provider: "platform" }),
      flagshipOrgIds: new Set(["seller-org"]),
    });
    const result = await runTasteTurn({ agent, message: "hi", grounding: null }, deps);
    assert.equal(result.ok, false);
    assert.equal(seen.turnInputs.length, 0);
  });
});

describe("runTasteTurn — pinning and fencing", () => {
  it("pins haiku + 400 tokens + testMode:true + intersected capabilities", async () => {
    const { deps, seen } = makeDeps();
    await runTasteTurn({ agent, message: "hi", grounding: null }, deps);
    const input = seen.turnInputs[0] as Record<string, unknown>;
    assert.equal(input.modelOverride, "claude-3-5-haiku-20241022");
    assert.equal(input.maxTokensOverride, 400);
    assert.equal(input.testMode, true);
    const bp = input.blueprint as { capabilities: string[] };
    assert.deepEqual([...bp.capabilities].sort(), ["get_quote_range", "provide_faq_answer"]);
  });

  it("wears the visitor's business when grounding is present", async () => {
    const { deps, seen } = makeDeps();
    await runTasteTurn(
      {
        agent,
        message: "hi",
        grounding: { businessName: "Visitor Plumbing", sourceDomain: "visitor.com", industry: "plumbing" },
      },
      deps,
    );
    const input = seen.turnInputs[0] as Record<string, unknown>;
    assert.equal(input.orgName, "Visitor Plumbing");
  });

  it("falls back to the seller's identity ungrounded", async () => {
    const { deps, seen } = makeDeps();
    await runTasteTurn({ agent, message: "hi", grounding: null }, deps);
    const input = seen.turnInputs[0] as Record<string, unknown>;
    assert.equal(input.orgName, "Seller Co");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
node scripts/run-unit-tests.js packages/crm/tests/unit/marketplace/taste/taste-turn.spec.ts
```

- [ ] **Step 3: Implement**

```ts
// packages/crm/src/lib/marketplace/taste/taste-turn.ts
//
// Taste mode — ONE anonymous demo turn. FOUNDER ECONOMICS (final): the seller
// pays for taste (it's their CAC — they keep 95% of listing revenue), resolved
// exactly like paid rentals (getAIClient, BYOK-first). MONEY INVARIANT: if the
// creator org falls through to the PLATFORM key (provider === "platform",
// lib/ai/client.ts) and is NOT in SF_FLAGSHIP_ORG_IDS, we REFUSE — an
// anonymous stranger never burns the platform key for a third-party seller.
// Flagship (SF-owned) listings are the one intended exception.
//
// Seller-spend protection regardless of key: haiku pin + 400-token ceiling +
// testMode:true + capability intersection (design D2/D3). DI'd for node:test.

import type Anthropic from "@anthropic-ai/sdk";
import type { RentalAgent, RentalTurnResult } from "../agent-rental-run";
import type { TasteGrounding } from "@/db/schema/agent-taste-sessions";
import type { OrgSoul } from "@/lib/soul/types";
import { getAIClient } from "@/lib/ai/client";
import {
  runStatelessAgentTurn,
  type RunStatelessAgentTurnInput,
  type RunStatelessAgentTurnResult,
} from "@/lib/agents/stateless-turn";
import { TASTE_MODEL, TASTE_MAX_TOKENS, TASTE_CAPABILITY_ALLOWLIST } from "./taste-policy";
import { randomUUID } from "node:crypto";

export type TasteTurnDeps = {
  /** Resolution seam — REAL binding is getAIClient({orgId: creatorOrgId}).
   *  Only {client, provider} are read. */
  getClient: (args: { orgId: string }) => Promise<{ client: Anthropic | null; provider: string }>;
  runTurn: (input: RunStatelessAgentTurnInput) => Promise<RunStatelessAgentTurnResult>;
  flagshipOrgIds: Set<string>;
};

export const REAL_TASTE_TURN_DEPS: Omit<TasteTurnDeps, "flagshipOrgIds"> = {
  getClient: (args) => getAIClient({ orgId: args.orgId }),
  runTurn: runStatelessAgentTurn,
};

const NOT_AVAILABLE: RentalTurnResult = {
  ok: false,
  reason: "no_taste_key",
  message: "Free tasting isn't available for this agent right now.",
};

export async function runTasteTurn(
  input: { agent: RentalAgent; message: string; grounding: TasteGrounding | null },
  deps: TasteTurnDeps,
): Promise<RentalTurnResult> {
  const { agent, grounding } = input;

  const resolution = await deps.getClient({ orgId: agent.creatorOrgId });

  // ── MONEY INVARIANT (design §4.1): platform key only for flagship sellers.
  if (resolution.provider === "platform" && !deps.flagshipOrgIds.has(agent.creatorOrgId)) {
    return NOT_AVAILABLE;
  }
  if (!resolution.client) {
    return NOT_AVAILABLE;
  }

  // Two fences: capability intersection + testMode. The blueprint's capability
  // list drives getToolsForCapabilities inside the loop, so intersecting here
  // removes creator-workspace readers and every side-effect tool.
  const allow = new Set<string>(TASTE_CAPABILITY_ALLOWLIST);
  const tasteBlueprint = {
    ...agent.blueprint,
    capabilities: (agent.blueprint.capabilities ?? []).filter((c) => allow.has(c)),
  };

  // The taste pitch: the seller's agent, wearing the VISITOR's business.
  const orgName = grounding?.businessName?.trim() || agent.creatorOrgName;
  const soul: OrgSoul | null = grounding
    ? ({
        // Minimal OrgSoul-shaped grounding; unknown fields are simply absent.
        business_name: grounding.businessName,
        industry: grounding.industry,
        tagline: grounding.tagline,
        soul_description: grounding.description,
        services: grounding.services,
        voice: grounding.voiceTone,
      } as unknown as OrgSoul)
    : agent.soul;

  const result = await deps.runTurn({
    orgId: agent.creatorOrgId,
    orgSlug: agent.creatorOrgSlug,
    orgName,
    soul,
    timezone: agent.timezone,
    blueprint: tasteBlueprint,
    messages: [{ role: "user", content: input.message }],
    testMode: true, // second fence: every write tool short-circuits, no DB path
    client: resolution.client,
    modelOverride: TASTE_MODEL,
    maxTokensOverride: TASTE_MAX_TOKENS,
  });

  if (!result.ok) return { ok: false, reason: result.reason, message: result.message };
  return { ok: true, reply: result.reply, conversationId: `taste_${randomUUID()}` };
}
```

Implementation note: check the real `OrgSoul` field names in `src/lib/soul/types.ts` while implementing and map the six grounding fields onto the closest real fields (the cast above marks exactly where); the spec only pins `orgName`, which is type-safe.

- [ ] **Step 4: Run — expect PASS**

```bash
node scripts/run-unit-tests.js packages/crm/tests/unit/marketplace/taste/taste-turn.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/marketplace/taste/taste-turn.ts packages/crm/tests/unit/marketplace/taste/taste-turn.spec.ts
git commit -m "feat(taste): seller-key taste turn with flagship platform-key guard (money invariant + test)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: `ground-business.ts` — SSRF-guarded fetch + haiku extraction (reuse, don't reimplement)

**Files:**
- Create: `packages/crm/src/lib/marketplace/taste/ground-business.ts`
- Modify (only if not already exported): `packages/crm/src/lib/soul-wiki/ingest.ts` — export the existing `htmlToMarkdown` (lines ~131-163) with `export` keyword; no behavior change
- Test: `packages/crm/tests/unit/marketplace/taste/ground-business.spec.ts`

**Interfaces:**
- Consumes: `assertPublicHttpUrl` (src/lib/security/ssrf-guard.ts:298 — throws `SsrfBlockedError`), `htmlToMarkdown` (soul-wiki), `TASTE_EXTRACT_*` constants (Task 2), `truncateGroundingToCap` (Task 4), the Task 6 key-resolution seam (same guard applies to extraction — seller pays for grounding too).
- Produces: `groundOnBusiness(input, deps): Promise<GroundOutcome>` where `GroundOutcome = { ok: true; grounding: TasteGrounding } | { ok: false; code: "blocked_url" | "fetch_failed" | "no_taste_key"; message: string }` and `GroundDeps = { assertUrl, fetchPage, getClient, flagshipOrgIds, extract? }`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/crm/tests/unit/marketplace/taste/ground-business.spec.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { groundOnBusiness, type GroundDeps } from "../../../../src/lib/marketplace/taste/ground-business";
import { TASTE_GROUNDING_MAX_BYTES } from "../../../../src/lib/marketplace/taste/taste-policy";
import { groundingByteSize } from "../../../../src/lib/marketplace/taste/taste-session-store";

const CREATOR = "seller-org";

function makeDeps(overrides: Partial<GroundDeps> = {}): GroundDeps {
  return {
    assertUrl: async (raw: string) => ({ url: new URL(raw), ip: "203.0.113.7" }),
    fetchPage: async () => ({ markdown: "# Visitor Plumbing\nWe fix pipes in Austin.", title: "Visitor Plumbing" }),
    getClient: async () => ({
      client: {
        messages: {
          create: async () => ({
            content: [{ type: "text", text: JSON.stringify({ businessName: "Visitor Plumbing", industry: "plumbing", services: ["repairs"] }) }],
          }),
        },
      } as never,
      provider: "anthropic",
    }),
    flagshipOrgIds: new Set<string>(),
    ...overrides,
  };
}

describe("groundOnBusiness", () => {
  it("happy path: asserts, fetches, extracts, returns capped grounding with sourceDomain", async () => {
    const out = await groundOnBusiness({ url: "https://visitor.com", creatorOrgId: CREATOR }, makeDeps());
    assert.equal(out.ok, true);
    if (out.ok) {
      assert.equal(out.grounding.businessName, "Visitor Plumbing");
      assert.equal(out.grounding.sourceDomain, "visitor.com");
      assert.ok(groundingByteSize(out.grounding) <= TASTE_GROUNDING_MAX_BYTES);
    }
  });

  it("SSRF rejection maps to blocked_url (never fetches)", async () => {
    let fetched = 0;
    const out = await groundOnBusiness(
      { url: "http://169.254.169.254/", creatorOrgId: CREATOR },
      makeDeps({
        assertUrl: async () => { throw new Error("URL not allowed"); },
        fetchPage: async () => { fetched += 1; return { markdown: "", title: "" }; },
      }),
    );
    assert.equal(out.ok, false);
    if (!out.ok) assert.equal(out.code, "blocked_url");
    assert.equal(fetched, 0);
  });

  it("platform-key non-flagship seller: refuses extraction (money invariant reaches grounding too)", async () => {
    const out = await groundOnBusiness(
      { url: "https://visitor.com", creatorOrgId: CREATOR },
      makeDeps({ getClient: async () => ({ client: { } as never, provider: "platform" }) }),
    );
    assert.equal(out.ok, false);
    if (!out.ok) assert.equal(out.code, "no_taste_key");
  });

  it("LLM failure falls back to the no-LLM minimal grounding (title + first words)", async () => {
    const out = await groundOnBusiness(
      { url: "https://visitor.com", creatorOrgId: CREATOR },
      makeDeps({
        getClient: async () => ({
          client: { messages: { create: async () => { throw new Error("boom"); } } } as never,
          provider: "anthropic",
        }),
      }),
    );
    assert.equal(out.ok, true);
    if (out.ok) assert.equal(out.grounding.businessName, "Visitor Plumbing");
  });

  it("fetch failure maps to fetch_failed", async () => {
    const out = await groundOnBusiness(
      { url: "https://visitor.com", creatorOrgId: CREATOR },
      makeDeps({ fetchPage: async () => { throw new Error("timeout"); } }),
    );
    assert.equal(out.ok, false);
    if (!out.ok) assert.equal(out.code, "fetch_failed");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
node scripts/run-unit-tests.js packages/crm/tests/unit/marketplace/taste/ground-business.spec.ts
```

- [ ] **Step 3: Implement**

```ts
// packages/crm/src/lib/marketplace/taste/ground-business.ts
//
// Taste mode — ground_on_my_business. REUSES the platform's existing pieces,
// never reimplements them: assertPublicHttpUrl (lib/security/ssrf-guard — the
// same guard analyze-url and soul-wiki ingest use), htmlToMarkdown (soul-wiki),
// and the analyze-url extraction SHAPE (one messages.create + no-LLM fallback,
// see app/api/v1/public/analyze-url/route.ts:305-420) — pinned to the haiku
// tier with a 20K-char input cap because the SELLER pays (design §1.1, D3).
// The flagship platform-key guard applies here exactly as in taste-turn.ts.

import type Anthropic from "@anthropic-ai/sdk";
import { assertPublicHttpUrl } from "@/lib/security/ssrf-guard";
import { htmlToMarkdown } from "@/lib/soul-wiki/ingest";
import { getAIClient } from "@/lib/ai/client";
import type { TasteGrounding } from "@/db/schema/agent-taste-sessions";
import { truncateGroundingToCap } from "./taste-session-store";
import { TASTE_MODEL, TASTE_EXTRACT_MAX_TOKENS, TASTE_EXTRACT_INPUT_CHARS } from "./taste-policy";

export type GroundOutcome =
  | { ok: true; grounding: TasteGrounding }
  | { ok: false; code: "blocked_url" | "fetch_failed" | "no_taste_key"; message: string };

export type GroundDeps = {
  /** REAL: assertPublicHttpUrl. Throws on private/blocked targets. */
  assertUrl: (rawUrl: string) => Promise<{ url: URL; ip: string }>;
  /** REAL: fetch with the analyze-url conventions (UA + 10s timeout) →
   *  htmlToMarkdown → char cap. DI'd so specs never touch the network. */
  fetchPage: (safeUrl: string) => Promise<{ markdown: string; title: string }>;
  /** Same seam + guard as taste-turn (seller pays for grounding too). */
  getClient: (args: { orgId: string }) => Promise<{ client: Anthropic | null; provider: string }>;
  flagshipOrgIds: Set<string>;
};

export const REAL_GROUND_DEPS: Omit<GroundDeps, "flagshipOrgIds"> = {
  assertUrl: (raw) => assertPublicHttpUrl(raw),
  fetchPage: async (safeUrl) => {
    const response = await fetch(safeUrl, {
      headers: { "User-Agent": "SeldonFrame/1.0 (Business Analysis)" },
      signal: AbortSignal.timeout(10_000),
    });
    const html = await response.text();
    const markdown = htmlToMarkdown(html).slice(0, TASTE_EXTRACT_INPUT_CHARS);
    const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
    return { markdown, title };
  },
  getClient: (args) => getAIClient({ orgId: args.orgId }),
};

const EXTRACT_SYSTEM =
  `Extract the business behind this website as compact JSON with keys: ` +
  `businessName, industry, tagline, description, services (array of strings), ` +
  `voiceTone, idealClient. Only include what the page supports. JSON only.`;

export async function groundOnBusiness(
  input: { url: string; creatorOrgId: string },
  deps: GroundDeps,
): Promise<GroundOutcome> {
  // 1) SSRF gate FIRST — never fetch an unvetted URL.
  let safeUrl: URL;
  try {
    safeUrl = (await deps.assertUrl(input.url)).url;
  } catch {
    return { ok: false, code: "blocked_url", message: "That URL can't be fetched. Use a public https:// website." };
  }

  // 2) Fetch + convert (existing conventions, DI'd).
  let page: { markdown: string; title: string };
  try {
    page = await deps.fetchPage(safeUrl.toString());
  } catch {
    return { ok: false, code: "fetch_failed", message: "Couldn't fetch that site. Check the URL and try again." };
  }

  // 3) Key resolution — the flagship guard applies to grounding spend too.
  const resolution = await deps.getClient({ orgId: input.creatorOrgId });
  if (resolution.provider === "platform" && !deps.flagshipOrgIds.has(input.creatorOrgId)) {
    return { ok: false, code: "no_taste_key", message: "Free tasting isn't available for this agent right now." };
  }
  if (!resolution.client) {
    return { ok: false, code: "no_taste_key", message: "Free tasting isn't available for this agent right now." };
  }

  const sourceDomain = safeUrl.hostname;

  // 4) One capped haiku extraction; NO-LLM fallback on any failure (mirrors
  //    fallbackBusinessData's spirit in analyze-url).
  let extracted: Partial<TasteGrounding> = {};
  try {
    const msg = await resolution.client.messages.create({
      model: TASTE_MODEL,
      max_tokens: TASTE_EXTRACT_MAX_TOKENS,
      system: EXTRACT_SYSTEM,
      messages: [{ role: "user", content: page.markdown.slice(0, TASTE_EXTRACT_INPUT_CHARS) }],
    });
    const text = msg.content.find((b): b is { type: "text"; text: string } => b.type === "text")?.text ?? "";
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      extracted = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as Partial<TasteGrounding>;
    }
  } catch {
    extracted = {};
  }

  const grounding = truncateGroundingToCap({
    businessName: (extracted.businessName || page.title || sourceDomain).toString(),
    industry: extracted.industry,
    tagline: extracted.tagline,
    description: extracted.description || page.markdown.slice(0, 300),
    services: Array.isArray(extracted.services) ? extracted.services.map(String) : undefined,
    voiceTone: extracted.voiceTone,
    idealClient: extracted.idealClient,
    sourceDomain,
  });

  return { ok: true, grounding };
}
```

If `htmlToMarkdown` is not currently exported from `soul-wiki/ingest.ts`, add `export` to its declaration (no other change). If its signature differs (e.g. it's named differently), bind `fetchPage`'s conversion to whatever the real exported converter is — the DI seam means the spec is unaffected.

- [ ] **Step 4: Run — expect PASS**

```bash
node scripts/run-unit-tests.js packages/crm/tests/unit/marketplace/taste/ground-business.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/marketplace/taste/ground-business.ts packages/crm/src/lib/soul-wiki/ingest.ts packages/crm/tests/unit/marketplace/taste/ground-business.spec.ts
git commit -m "feat(taste): ground_on_my_business pipeline — SSRF-guarded fetch + capped haiku extraction

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Wire layer + handler — the taste branch, and the byte-identical proof

**Files:**
- Modify: `packages/crm/src/lib/marketplace/agent-mcp-rpc.ts` (add ground descriptor + taste tools-list builder + optional `instructions` on `buildInitializeResult`)
- Modify: `packages/crm/src/lib/marketplace/agent-mcp-handler.ts` (optional `taste` dep + the anonymous taste lane)
- Test: `packages/crm/tests/unit/marketplace/taste/agent-mcp-handler-taste.spec.ts`

**Interfaces:**
- Consumes: everything above via a `TasteDeps` bundle of injected functions.
- Produces on rpc.ts: `buildGroundToolDescriptor(): McpToolDescriptor`; `buildTasteToolsListResult({agentName, capabilities, visitorLimit})`; `buildInitializeResult({agentName, instructions?})` — `instructions` key present in the result ONLY when the param is passed.
- Produces on handler: `export type TasteDeps = {...}` (below); `AgentRentalRpcDeps` gains `taste?: TasteDeps`. **Absent ⇒ every outcome object is identical to today.**

```ts
// The TasteDeps contract (added to agent-mcp-handler.ts):
export type TasteDeps = {
  ipHash: string;
  /** Listing-level activation: flag is already on if this object exists; this
   *  resolves budget + key predicate. */
  policyFor: (agent: RentalAgent) => Promise<
    { active: false } | { active: true; visitorLimit: number; dailyCap: number }
  >;
  /** checkRateLimit binding. */
  checkLimit: (key: string, limit: number, windowMs: number) => Promise<boolean>;
  ground: (args: { agent: RentalAgent; url: string; ipHash: string }) => Promise<
    { ok: true; text: string } | { ok: false; text: string }
  >;
  runTasteTurn: (args: { agent: RentalAgent; message: string; tasteSession: string | null }) => Promise<RentalTurnResult>;
  doorsText: (args: { agent: RentalAgent; visitorLimit: number; reason: "visitor_cap" | "daily_cap" | "locked_tool" }) => string;
  instructions: (args: { agent: RentalAgent; visitorLimit: number }) => string;
  track: (event: "taste_session_started" | "taste_grounded" | "taste_limit_hit", props: Record<string, unknown>, creatorOrgId: string) => void;
};
```

- [ ] **Step 1: Write the failing test — byte-identical suite FIRST**

```ts
// packages/crm/tests/unit/marketplace/taste/agent-mcp-handler-taste.spec.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  handleAgentRentalRpc,
  type AgentRentalRpcDeps,
  type TasteDeps,
} from "../../../../src/lib/marketplace/agent-mcp-handler";
import type { RentalAgent } from "../../../../src/lib/marketplace/agent-rental-run";

const agent = {
  listingId: "l1",
  slug: "hvac",
  agentName: "HVAC Bot",
  capabilities: ["provide_faq_answer"],
  creatorOrgId: "seller-org",
  creatorOrgName: "Seller",
  creatorOrgSlug: "seller",
  soul: null,
  timezone: "UTC",
  blueprint: { faq: [{ q: "hours?", a: "9-5" }], quoteRanges: [] },
} as unknown as RentalAgent;

function baseDeps(overrides: Partial<AgentRentalRpcDeps> = {}): AgentRentalRpcDeps {
  return {
    resolveAgent: async () => agent,
    runTurn: async () => ({ ok: true, reply: "r", conversationId: "c" }),
    getSecret: () => "secret",
    logUsage: () => {},
    now: () => new Date("2026-07-03T12:00:00Z"),
    ...overrides,
  };
}

function rpc(method: string, params: Record<string, unknown> = {}, id = 1): string {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params });
}

function makeTaste(overrides: Partial<TasteDeps> = {}): { taste: TasteDeps; events: Array<[string, Record<string, unknown>]> } {
  const events: Array<[string, Record<string, unknown>]> = [];
  const taste: TasteDeps = {
    ipHash: "iphash1",
    policyFor: async () => ({ active: true, visitorLimit: 3, dailyCap: 50 }),
    checkLimit: async () => true,
    ground: async () => ({ ok: true, text: "grounded! taste_session: tst_abc" }),
    runTasteTurn: async () => ({ ok: true, reply: "taste reply", conversationId: "taste_1" }),
    doorsText: ({ reason }) => `DOORS(${reason})`,
    instructions: ({ visitorLimit }) => `INSTR(${visitorLimit})`,
    track: (event, props) => { events.push([event, props]); },
    ...overrides,
  };
  return { taste, events };
}

// ── The flag-off proof: with taste undefined, every method's outcome is
// deep-equal to today's literal envelopes. ─────────────────────────────────
describe("taste absent => byte-identical to today", () => {
  const CASES: Array<{ name: string; body: string; bearer: string | null; expected: unknown }> = [
    {
      name: "tools/list no bearer",
      body: rpc("tools/list"),
      bearer: null,
      expected: {
        status: 200,
        body: {
          jsonrpc: "2.0", id: 1,
          error: { code: -32000, message: "Missing rental key. Send `Authorization: Bearer <key>`." },
        },
      },
    },
    {
      name: "tools/call no bearer",
      body: rpc("tools/call", { name: "ask", arguments: { message: "hi" } }),
      bearer: null,
      expected: {
        status: 200,
        body: {
          jsonrpc: "2.0", id: 1,
          error: { code: -32000, message: "Missing rental key. Send `Authorization: Bearer <key>`." },
        },
      },
    },
    {
      name: "prompts/list no bearer",
      body: rpc("prompts/list"),
      bearer: null,
      expected: {
        status: 200,
        body: {
          jsonrpc: "2.0", id: 1,
          error: { code: -32000, message: "Missing rental key. Send `Authorization: Bearer <key>`." },
        },
      },
    },
  ];

  for (const c of CASES) {
    it(c.name, async () => {
      const out = await handleAgentRentalRpc("hvac", c.body, c.bearer, baseDeps());
      assert.deepEqual(out, c.expected);
    });
  }

  it("initialize result has NO instructions key without taste", async () => {
    const out = await handleAgentRentalRpc("hvac", rpc("initialize"), null, baseDeps());
    const result = (out.body as { result: Record<string, unknown> }).result;
    assert.equal("instructions" in result, false);
  });
});

// ── Taste active behavior. ──────────────────────────────────────────────────
describe("taste active (no bearer)", () => {
  it("initialize gains instructions", async () => {
    const { taste } = makeTaste();
    const out = await handleAgentRentalRpc("hvac", rpc("initialize"), null, { ...baseDeps(), taste });
    const result = (out.body as { result: Record<string, unknown> }).result;
    assert.equal(result.instructions, "INSTR(3)");
  });

  it("tools/list returns exactly the 4 allowlisted descriptors", async () => {
    const { taste } = makeTaste();
    const out = await handleAgentRentalRpc("hvac", rpc("tools/list"), null, { ...baseDeps(), taste });
    const tools = ((out.body as { result: { tools: Array<{ name: string }> } }).result).tools.map((t) => t.name).sort();
    assert.deepEqual(tools, ["ask", "get_quote_range", "ground_on_my_business", "provide_faq_answer"]);
  });

  it("prompts/list STAYS key-gated", async () => {
    const { taste } = makeTaste();
    const out = await handleAgentRentalRpc("hvac", rpc("prompts/list"), null, { ...baseDeps(), taste });
    assert.equal((out.body as { error: { code: number } }).error.code, -32000);
  });

  it("deterministic tool runs anonymously and emits taste_session_started once", async () => {
    const { taste, events } = makeTaste();
    const out = await handleAgentRentalRpc(
      "hvac", rpc("tools/call", { name: "provide_faq_answer", arguments: { question: "hours?" } }), null,
      { ...baseDeps(), taste },
    );
    assert.equal(out.status, 200);
    assert.ok(JSON.stringify(out.body).includes("9-5"));
    assert.deepEqual(events.filter(([e]) => e === "taste_session_started").length, 1);
  });

  it("ground_on_my_business routes to ground and emits taste_grounded", async () => {
    const { taste, events } = makeTaste();
    const out = await handleAgentRentalRpc(
      "hvac", rpc("tools/call", { name: "ground_on_my_business", arguments: { url: "https://visitor.com" } }), null,
      { ...baseDeps(), taste },
    );
    assert.ok(JSON.stringify(out.body).includes("tst_abc"));
    assert.equal(events.some(([e]) => e === "taste_grounded"), true);
  });

  it("visitor cap exhausted => doors as a SUCCESSFUL text result + taste_limit_hit(visitor_cap)", async () => {
    const { taste, events } = makeTaste({ checkLimit: async (key) => !key.startsWith("taste:calls:") });
    const out = await handleAgentRentalRpc(
      "hvac", rpc("tools/call", { name: "ask", arguments: { message: "hi" } }), null,
      { ...baseDeps(), taste },
    );
    assert.equal(out.status, 200);
    const body = out.body as { result?: unknown; error?: unknown };
    assert.ok(body.result, "doors must be a result, never an error envelope");
    assert.ok(JSON.stringify(body.result).includes("DOORS(visitor_cap)"));
    assert.equal(events.some(([e, p]) => e === "taste_limit_hit" && p.reason === "visitor_cap"), true);
  });

  it("non-allowlisted tool => doors(locked_tool), also a result", async () => {
    const { taste } = makeTaste();
    const out = await handleAgentRentalRpc(
      "hvac", rpc("tools/call", { name: "book_appointment", arguments: {} }), null,
      { ...baseDeps(), taste },
    );
    assert.ok(JSON.stringify((out.body as { result: unknown }).result).includes("DOORS(locked_tool)"));
  });

  it("policyFor inactive (opt-out / no key / unlisted) => today's -32000 exactly", async () => {
    const { taste } = makeTaste({ policyFor: async () => ({ active: false }) });
    const out = await handleAgentRentalRpc("hvac", rpc("tools/list"), null, { ...baseDeps(), taste });
    assert.deepEqual(out.body, {
      jsonrpc: "2.0", id: 1,
      error: { code: -32000, message: "Missing rental key. Send `Authorization: Bearer <key>`." },
    });
  });

  it("ANY presented bearer bypasses taste entirely (expired key message preserved)", async () => {
    const { taste } = makeTaste();
    // A structurally-invalid bearer hits the today-path "Invalid rental key.".
    const out = await handleAgentRentalRpc("hvac", rpc("tools/list"), "rk_junk.junk", { ...baseDeps(), taste });
    assert.equal((out.body as { error: { message: string } }).error.message, "Invalid rental key.");
  });
});
```

- [ ] **Step 2: Run — expect FAIL (TasteDeps not exported, taste branch absent)**

```bash
node scripts/run-unit-tests.js packages/crm/tests/unit/marketplace/taste/agent-mcp-handler-taste.spec.ts
```

- [ ] **Step 3: Implement the rpc.ts additions**

In `agent-mcp-rpc.ts`:

```ts
// (near the other tool-name consts)
export const GROUND_TOOL_NAME = "ground_on_my_business";

/** Taste mode — the grounding tool descriptor. */
export function buildGroundToolDescriptor(): McpToolDescriptor {
  return {
    name: GROUND_TOOL_NAME,
    description:
      `FREE TASTE: ground this agent on YOUR business. Pass your website URL; ` +
      `the agent reads it and demos as if it were deployed for you. Returns a ` +
      `taste_session value — pass it to later ask calls to stay grounded.`,
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Your business website (https://…)." },
      },
      required: ["url"],
    },
  };
}

/** Taste mode tools/list: the read-only subset + ground. The ask descriptor
 *  gains an optional taste_session arg in this variant. */
export function buildTasteToolsListResult(input: {
  agentName: string;
  capabilities: string[] | undefined | null;
  visitorLimit: number;
}): Record<string, unknown> {
  const ask = buildAskToolDescriptor(input);
  const askSchema = ask.inputSchema as { properties: Record<string, unknown> };
  askSchema.properties.taste_session = {
    type: "string",
    description: "Optional. The taste_session from ground_on_my_business — keeps the demo grounded on your business.",
  };
  ask.description =
    `${ask.description} FREE TASTE MODE: you have ${input.visitorLimit} free calls; ` +
    `run ${GROUND_TOOL_NAME} first for a demo grounded on your own business.`;
  return {
    tools: [
      ...buildDeterministicToolDescriptors({ agentName: input.agentName }),
      ask,
      buildGroundToolDescriptor(),
    ],
  };
}
```

And make `instructions` additive on `buildInitializeResult` (existing callers unchanged — key ABSENT when param absent):

```ts
export function buildInitializeResult(input: { agentName: string; instructions?: string }): Record<string, unknown> {
  return {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: { tools: {}, prompts: {} },
    serverInfo: { name: input.agentName, version: "1.0.0" },
    ...(input.instructions ? { instructions: input.instructions } : {}),
  };
}
```

- [ ] **Step 4: Implement the handler taste lane**

In `agent-mcp-handler.ts` — add the `TasteDeps` type (Interfaces block above), `taste?: TasteDeps` on `AgentRentalRpcDeps`, and a private helper. **The taste lane engages ONLY when `bearer === null && deps.taste` and the listing policy is active; otherwise every line of today's flow runs untouched.** Concretely:

```ts
import { DAY_MS, TASTE_TOOL_ALLOWLIST, GROUND_TOOL_NAME } from "./taste/taste-policy";

/** Resolve the taste policy when the lane could apply. null = lane inactive
 *  (fall through to today's behavior verbatim). */
async function tastePolicyOrNull(
  bearer: string | null,
  deps: AgentRentalRpcDeps,
  agent: RentalAgent,
): Promise<{ taste: TasteDeps; visitorLimit: number; dailyCap: number } | null> {
  if (bearer !== null || !deps.taste) return null;
  const policy = await deps.taste.policyFor(agent);
  if (!policy.active) return null;
  return { taste: deps.taste, visitorLimit: policy.visitorLimit, dailyCap: policy.dailyCap };
}
```

Case `initialize` becomes:

```ts
    case "initialize": {
      const lane = await tastePolicyOrNull(bearer, deps, agent);
      return {
        status: 200,
        body: jsonRpcResult(
          id,
          buildInitializeResult({
            agentName: agent.agentName,
            ...(lane
              ? { instructions: lane.taste.instructions({ agent, visitorLimit: lane.visitorLimit }) }
              : {}),
          }),
        ),
      };
    }
```

Case `tools/list` gains a pre-authorize branch:

```ts
    case "tools/list": {
      const lane = await tastePolicyOrNull(bearer, deps, agent);
      if (lane) {
        return {
          status: 200,
          body: jsonRpcResult(id, buildTasteToolsListResult({
            agentName: agent.agentName,
            capabilities: agent.capabilities,
            visitorLimit: lane.visitorLimit,
          })),
        };
      }
      const auth = authorize(bearer, slug, id, deps);
      if (!auth.ok) return auth.outcome;
      // ...existing body unchanged...
    }
```

Case `tools/call` gains the taste lane before `authorize()`:

```ts
    case "tools/call": {
      const lane = await tastePolicyOrNull(bearer, deps, agent);
      if (lane) return await handleTasteToolCall({ id, slug, agent, params, lane, deps });
      // ...existing authorize + paid flow unchanged...
    }
```

And the lane handler (new function at the bottom of the file — thin: policy and copy live in the deps):

```ts
async function handleTasteToolCall(args: {
  id: JsonRpcId;
  slug: string;
  agent: RentalAgent;
  params: Record<string, unknown>;
  lane: { taste: TasteDeps; visitorLimit: number; dailyCap: number };
  deps: AgentRentalRpcDeps;
}): Promise<RpcOutcome> {
  const { id, slug, agent, params, lane } = args;
  const { taste, visitorLimit, dailyCap } = lane;
  const toolName = typeof params.name === "string" ? params.name : "";
  const toolArgs =
    typeof params.arguments === "object" && params.arguments !== null
      ? (params.arguments as Record<string, unknown>)
      : {};

  const doors = (reason: "visitor_cap" | "daily_cap" | "locked_tool"): RpcOutcome => {
    taste.track("taste_limit_hit", { slug, listing_id: agent.listingId, reason }, agent.creatorOrgId);
    return {
      status: 200,
      body: jsonRpcResult(id, toolTextResult(taste.doorsText({ agent, visitorLimit, reason }))),
    };
  };

  // Funnel start (once per ip+listing+day — deduped by a 1/day rate key).
  if (await taste.checkLimit(`taste:started:${agent.listingId}:${taste.ipHash}`, 1, DAY_MS)) {
    taste.track("taste_session_started", { slug, listing_id: agent.listingId }, agent.creatorOrgId);
  }

  if (!TASTE_TOOL_ALLOWLIST.has(toolName)) return doors("locked_tool");
  if (!(await taste.checkLimit(`taste:calls:${agent.listingId}:${taste.ipHash}`, visitorLimit, DAY_MS))) {
    return doors("visitor_cap");
  }
  if (!(await taste.checkLimit(`taste:daily:${agent.listingId}`, dailyCap, DAY_MS))) {
    return doors("daily_cap");
  }

  if (toolName === GROUND_TOOL_NAME) {
    const url = typeof toolArgs.url === "string" ? toolArgs.url.trim() : "";
    if (!url) {
      return { status: 200, body: jsonRpcError(id, JSONRPC_INVALID_PARAMS, "Invalid params: `url` (non-empty string) is required.") };
    }
    // Grounding creation caps (2/visitor+listing/day, 6/ip/day across listings).
    if (
      !(await taste.checkLimit(`taste:ground:${agent.listingId}:${taste.ipHash}`, 2, DAY_MS)) ||
      !(await taste.checkLimit(`taste:ground:ip:${taste.ipHash}`, 6, DAY_MS))
    ) {
      return doors("visitor_cap");
    }
    const ground = await taste.ground({ agent, url, ipHash: taste.ipHash });
    if (ground.ok) {
      taste.track("taste_grounded", { slug, listing_id: agent.listingId, has_grounding: true }, agent.creatorOrgId);
    }
    return { status: 200, body: jsonRpcResult(id, toolTextResult(ground.text)) };
  }

  if (isDeterministicTool(toolName)) {
    const det = executeDeterministicTool(toolName, toolArgs, agent.blueprint);
    if (!det.ok) return { status: 200, body: jsonRpcError(id, det.error.code, det.error.message) };
    return { status: 200, body: jsonRpcResult(id, toolTextResult(JSON.stringify(det.result))) };
  }

  // ask — taste variant (seller key + flagship guard live inside runTasteTurn).
  const askArgs = extractAskArgs(params);
  if (!askArgs.ok) return { status: 200, body: jsonRpcError(id, askArgs.error.code, askArgs.error.message) };
  const tasteSession = typeof toolArgs.taste_session === "string" && toolArgs.taste_session.length > 0
    ? toolArgs.taste_session
    : null;
  const turn = await taste.runTasteTurn({ agent, message: askArgs.message, tasteSession });
  if (!turn.ok) return { status: 200, body: jsonRpcResult(id, toolTextResult(turn.message, true)) };
  const result = toolTextResult(turn.reply);
  (result as { conversationId?: string }).conversationId = turn.conversationId;
  return { status: 200, body: jsonRpcResult(id, result) };
}
```

Note the taste lane NEVER calls `deps.logUsage` (`agent_rental_call` is a rental accrual — taste calls are not rentals; P1 is tracking-only).

- [ ] **Step 5: Run the new spec, then the EXISTING handler spec (regression — this is the byte-identical gate)**

```bash
node scripts/run-unit-tests.js packages/crm/tests/unit/marketplace/taste/agent-mcp-handler-taste.spec.ts
node scripts/run-unit-tests.js packages/crm/tests/unit/marketplace/agent-mcp-handler.spec.ts
node scripts/run-unit-tests.js packages/crm/tests/unit/marketplace/agent-mcp-rpc.spec.ts
```
Expected: all PASS (existing spec filenames may differ slightly — `ls packages/crm/tests/unit/marketplace/` and run whichever cover the handler + rpc; zero regressions allowed here).

- [ ] **Step 6: Commit**

```bash
git add packages/crm/src/lib/marketplace/agent-mcp-rpc.ts packages/crm/src/lib/marketplace/agent-mcp-handler.ts packages/crm/tests/unit/marketplace/taste/agent-mcp-handler-taste.spec.ts
git commit -m "feat(taste): anonymous taste lane in the MCP rental handler (flag-off byte-identical, proven)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Real deps + route wiring + `sellerPreferences` resolve + cron sweep

**Files:**
- Create: `packages/crm/src/lib/marketplace/taste/taste-real-deps.ts`
- Modify: `packages/crm/src/lib/marketplace/agent-rental-run.ts` (select + carry `sellerPreferences` on `RentalAgent` — 3 additive lines)
- Modify: `packages/crm/src/app/api/v1/agents/[slug]/mcp/route.ts` (build taste deps behind the flag; pass into `REAL_DEPS`)
- Modify: `packages/crm/src/app/api/cron/orphan-workspace-ttl/route.ts` (append the expired-session sweep)
- Test: `packages/crm/tests/unit/marketplace/taste/taste-real-deps.spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 2-8; `resolveAgentKeyStatus` (ai/client.ts), `checkRateLimit`, `trackEvent`, `getRentalSigningSecret`, `mintTasteToken`/`verifyTasteToken`, `createTasteSession`/`getTasteSession`, `groundOnBusiness`/`REAL_GROUND_DEPS`, `runTasteTurn`/`REAL_TASTE_TURN_DEPS`, `resolveTasteBudget`, `parseFlagshipOrgIds`, `isTasteFlagOn`, `hashTasteIp`, `buildTasteDoorsText`, `buildTasteInstructions`.
- Produces: `buildTasteDeps(input: { request: { headers: { get(n: string): string | null } }; env: Record<string, string | undefined> }): TasteDeps | undefined` — `undefined` whenever the flag is off (the route-level inertness switch).

- [ ] **Step 1: Add `sellerPreferences` to `RentalAgent` (additive)**

In `agent-rental-run.ts`: add to the `RentalAgent` type

```ts
  /** Taste-mode budget (marketplace_listings.seller_preferences). */
  sellerPreferences?: ListingSellerPreferences | null;
```

add `sellerPreferences: marketplaceListings.sellerPreferences,` to the `.select({...})` in `resolveRentalAgent`, and `sellerPreferences: row.sellerPreferences ?? null,` to the returned object. Import the type from `@/db/schema/marketplace`.

- [ ] **Step 2: Write the failing test**

```ts
// packages/crm/tests/unit/marketplace/taste/taste-real-deps.spec.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildTasteDeps, resolveTastePolicyForAgent } from "../../../../src/lib/marketplace/taste/taste-real-deps";
import type { RentalAgent } from "../../../../src/lib/marketplace/agent-rental-run";

const req = (ip?: string) => ({
  headers: { get: (n: string) => (n === "x-forwarded-for" && ip ? `${ip}, 10.0.0.1` : null) },
});

describe("buildTasteDeps flag gating", () => {
  it("returns undefined when the flag is off — the route-level inertness switch", () => {
    assert.equal(buildTasteDeps({ request: req("1.2.3.4"), env: {} }), undefined);
    assert.equal(buildTasteDeps({ request: req("1.2.3.4"), env: { SF_AGENT_TASTE_MODE: "0" } }), undefined);
  });
  it("builds deps when flag=1, with a hashed (non-raw) ip", () => {
    const deps = buildTasteDeps({
      request: req("1.2.3.4"),
      env: { SF_AGENT_TASTE_MODE: "1", MARKETPLACE_RENTAL_SIGNING_SECRET: "s" },
    });
    assert.ok(deps);
    assert.ok(!deps!.ipHash.includes("1.2.3.4"));
    assert.match(deps!.ipHash, /^[0-9a-f]{32}$/);
  });
});

describe("resolveTastePolicyForAgent", () => {
  const agent = (prefs: unknown, creatorOrgId = "seller") =>
    ({ creatorOrgId, sellerPreferences: prefs } as unknown as RentalAgent);

  it("inactive when seller opted out (0 visitor calls)", async () => {
    const policy = await resolveTastePolicyForAgent(agent({ tasteCallsPerVisitor: 0 }), {
      keyStatus: async () => ({ hasKey: true, mode: "byok", provider: "anthropic" }),
      flagshipOrgIds: new Set(),
    });
    assert.deepEqual(policy, { active: false });
  });

  it("inactive for a platform-fallback non-flagship seller", async () => {
    const policy = await resolveTastePolicyForAgent(agent(null), {
      keyStatus: async () => ({ hasKey: true, mode: "platform", provider: null }),
      flagshipOrgIds: new Set(),
    });
    assert.deepEqual(policy, { active: false });
  });

  it("ACTIVE for a platform-fallback FLAGSHIP seller", async () => {
    const policy = await resolveTastePolicyForAgent(agent(null, "sf-org"), {
      keyStatus: async () => ({ hasKey: true, mode: "platform", provider: null }),
      flagshipOrgIds: new Set(["sf-org"]),
    });
    assert.deepEqual(policy, { active: true, visitorLimit: 3, dailyCap: 50 });
  });

  it("inactive for an openai-only BYOK seller (no Anthropic client possible)", async () => {
    const policy = await resolveTastePolicyForAgent(agent(null), {
      keyStatus: async () => ({ hasKey: true, mode: "byok", provider: "openai" }),
      flagshipOrgIds: new Set(),
    });
    assert.deepEqual(policy, { active: false });
  });

  it("active with seller budget applied for anthropic BYOK", async () => {
    const policy = await resolveTastePolicyForAgent(agent({ tasteCallsPerVisitor: 7, tasteDailyCap: 100 }), {
      keyStatus: async () => ({ hasKey: true, mode: "byok", provider: "anthropic" }),
      flagshipOrgIds: new Set(),
    });
    assert.deepEqual(policy, { active: true, visitorLimit: 7, dailyCap: 100 });
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

```bash
node scripts/run-unit-tests.js packages/crm/tests/unit/marketplace/taste/taste-real-deps.spec.ts
```

- [ ] **Step 4: Implement `taste-real-deps.ts`**

```ts
// packages/crm/src/lib/marketplace/taste/taste-real-deps.ts
//
// Taste mode — binds the pure taste modules to the real platform services and
// hands the handler ONE optional TasteDeps object. buildTasteDeps returns
// UNDEFINED whenever SF_AGENT_TASTE_MODE != "1" — that single return is the
// global inertness switch (design D7): no deps object, no taste code path.

import type { TasteDeps } from "../agent-mcp-handler";
import type { RentalAgent } from "../agent-rental-run";
import { resolveAgentKeyStatus, type AgentKeyStatus } from "@/lib/ai/client";
import { checkRateLimit } from "@/lib/utils/rate-limit";
import { trackEvent } from "@/lib/analytics/track";
import { getRentalSigningSecret } from "../rental-secret";
import { mintTasteToken, verifyTasteToken } from "./taste-token";
import { createTasteSession, getTasteSession } from "./taste-session-store";
import { groundOnBusiness, REAL_GROUND_DEPS } from "./ground-business";
import { runTasteTurn, REAL_TASTE_TURN_DEPS } from "./taste-turn";
import {
  isTasteFlagOn,
  parseFlagshipOrgIds,
  resolveTasteBudget,
  hashTasteIp,
  buildTasteDoorsText,
  buildTasteInstructions,
} from "./taste-policy";

type KeyStatusFn = (orgId: string) => Promise<AgentKeyStatus>;

/** Listing-level activation: seller budget > 0 AND the key predicate passes
 *  (anthropic BYOK, or flagship with any key). Pure over its deps. */
export async function resolveTastePolicyForAgent(
  agent: RentalAgent,
  deps: { keyStatus: KeyStatusFn; flagshipOrgIds: Set<string> },
): Promise<{ active: false } | { active: true; visitorLimit: number; dailyCap: number }> {
  const budget = resolveTasteBudget(agent.sellerPreferences ?? null);
  if (budget.optedOut) return { active: false };

  const status = await deps.keyStatus(agent.creatorOrgId);
  const keyOk =
    (status.mode === "byok" && status.provider === "anthropic") ||
    (deps.flagshipOrgIds.has(agent.creatorOrgId) && status.hasKey);
  if (!keyOk) return { active: false };

  return { active: true, visitorLimit: budget.visitorLimit, dailyCap: budget.dailyCap };
}

export function buildTasteDeps(input: {
  request: { headers: { get(name: string): string | null } };
  env: Record<string, string | undefined>;
}): TasteDeps | undefined {
  if (!isTasteFlagOn(input.env)) return undefined;

  const flagshipOrgIds = parseFlagshipOrgIds(input.env);
  const clientIp =
    input.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const secret = safeSecret();
  const ipHash = hashTasteIp(clientIp, secret);

  return {
    ipHash,
    policyFor: (agent) =>
      resolveTastePolicyForAgent(agent, { keyStatus: resolveAgentKeyStatus, flagshipOrgIds }),
    checkLimit: (key, limit, windowMs) => checkRateLimit(key, limit, windowMs),
    ground: async ({ agent, url, ipHash: ih }) => {
      const now = new Date();
      const outcome = await groundOnBusiness(
        { url, creatorOrgId: agent.creatorOrgId },
        { ...REAL_GROUND_DEPS, flagshipOrgIds },
      );
      if (!outcome.ok) return { ok: false, text: outcome.message };
      const { sessionId } = await createTasteSession({
        listingId: agent.listingId,
        slug: agent.slug,
        sourceUrl: url,
        grounding: outcome.grounding,
        ipHash: ih,
        now,
      });
      const token = mintTasteToken({ slug: agent.slug, sessionId, secret, now });
      // NOTE: log sid only, never the token (Global Constraints).
      console.log(`[taste] grounded slug=${agent.slug} sid=${sessionId}`);
      return {
        ok: true,
        text:
          `Grounded on ${outcome.grounding.businessName} (${outcome.grounding.sourceDomain}). ` +
          `Now ask me anything — I'll answer as ${agent.agentName} working for YOUR business.\n\n` +
          `taste_session: ${token}\n(Include taste_session on your next ask calls. Expires in 1 hour.)`,
      };
    },
    runTasteTurn: async ({ agent, message, tasteSession }) => {
      const now = new Date();
      let grounding = null;
      if (tasteSession) {
        const verdict = verifyTasteToken({ token: tasteSession, slug: agent.slug, secret, now });
        if (verdict.kind === "valid") {
          grounding = await getTasteSession({ sessionId: verdict.sessionId, slug: agent.slug, now });
        }
        // Invalid/expired => run ungrounded; the reply text naturally invites
        // re-grounding (never a hard error — design D11).
      }
      return runTasteTurn({ agent, message, grounding }, { ...REAL_TASTE_TURN_DEPS, flagshipOrgIds });
    },
    doorsText: ({ agent, visitorLimit, reason }) =>
      buildTasteDoorsText({ agentName: agent.agentName, slug: agent.slug, visitorLimit, reason, env: input.env }),
    instructions: ({ agent, visitorLimit }) =>
      buildTasteInstructions({ agentName: agent.agentName, capabilities: agent.capabilities, visitorLimit }),
    track: (event, props, creatorOrgId) => {
      trackEvent(event, props, { orgId: creatorOrgId });
    },
  };
}

/** The rental secret is required for the endpoint anyway; if unresolvable we
 *  disable taste rather than throw (the paid path surfaces its own error). */
function safeSecret(): string {
  try {
    return getRentalSigningSecret();
  } catch {
    return "";
  }
}
```

Add to `buildTasteDeps` right after `const secret = safeSecret();`: `if (!secret) return undefined;` — no secret, no taste (and add a spec case: flag on but no secret ⇒ `undefined`; set `MARKETPLACE_RENTAL_SIGNING_SECRET` name to whatever `rental-secret.ts` actually reads — open it and mirror; the spec stubs may need a tiny `secretResolver` DI param on `buildTasteDeps` if `getRentalSigningSecret` reads env directly: `secretResolver: () => string = getRentalSigningSecret` as a second optional argument, overridden in the spec).

- [ ] **Step 5: Wire the route**

In `route.ts`, import and thread (the ONLY route change — `REAL_DEPS` becomes per-request because taste needs the request's IP):

```ts
import { buildTasteDeps } from "@/lib/marketplace/taste/taste-real-deps";

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const rawBody = await request.text();
  const bearer = readBearer(request);
  const headers = { "x-payment": request.headers.get("x-payment") ?? "" };

  const deps: AgentRentalRpcDeps = {
    ...REAL_DEPS,
    taste: buildTasteDeps({ request, env: process.env }),
  };

  const outcome = await handleAgentRentalRpc(slug, rawBody, bearer, deps, headers);
  // ...unchanged response mapping...
}
```

- [ ] **Step 6: Append the cron sweep**

In `src/app/api/cron/orphan-workspace-ttl/route.ts`, inside the existing handler after its current work (match the file's error-handling style):

```ts
import { deleteExpiredTasteSessions } from "@/lib/marketplace/taste/taste-session-store";
// ... inside the handler, after existing cleanup:
try {
  await deleteExpiredTasteSessions(new Date());
} catch (err) {
  console.error(`[cron/orphan-workspace-ttl] taste_session_sweep_error: ${err instanceof Error ? err.message : String(err)}`);
}
```

- [ ] **Step 7: Run the spec + full suite delta**

```bash
node scripts/run-unit-tests.js packages/crm/tests/unit/marketplace/taste/taste-real-deps.spec.ts
pnpm test:unit
```
Expected: new spec PASS; full suite shows no NEW failures vs the ~75-failure baseline (capture the baseline count on `main` before Task 1 and compare).

- [ ] **Step 8: Commit**

```bash
git add packages/crm/src/lib/marketplace/taste/taste-real-deps.ts packages/crm/src/lib/marketplace/agent-rental-run.ts packages/crm/src/app/api/v1/agents/[slug]/mcp/route.ts packages/crm/src/app/api/cron/orphan-workspace-ttl/route.ts packages/crm/tests/unit/marketplace/taste/taste-real-deps.spec.ts
git commit -m "feat(taste): real deps + flag-gated route wiring + cron sweep piggyback

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Seller budget action — `updateListingTastePreferencesAction`

**Files:**
- Create: `packages/crm/src/lib/marketplace/taste/apply-taste-preferences.ts` (pure merge+clamp)
- Modify: `packages/crm/src/lib/marketplace/seller-actions.ts` (thin `"use server"` action — follow the file's existing update-action pattern around its listing-update precedent, ~line 201)
- Test: `packages/crm/tests/unit/marketplace/taste/apply-taste-preferences.spec.ts`

**Interfaces:**
- Produces: `applyTastePreferencesUpdate(current: ListingSellerPreferences | null, patch: { tasteCallsPerVisitor?: number; tasteDailyCap?: number }): ListingSellerPreferences` (pure, clamped); action `updateListingTastePreferencesAction({ listingId, tasteCallsPerVisitor?, tasteDailyCap? })` — org-guarded, creator-only.

- [ ] **Step 1: Write the failing test**

```ts
// packages/crm/tests/unit/marketplace/taste/apply-taste-preferences.spec.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyTastePreferencesUpdate } from "../../../../src/lib/marketplace/taste/apply-taste-preferences";

describe("applyTastePreferencesUpdate", () => {
  it("merges a patch over current, clamped to platform ceilings", () => {
    assert.deepEqual(
      applyTastePreferencesUpdate({ tasteDailyCap: 100 }, { tasteCallsPerVisitor: 99 }),
      { tasteCallsPerVisitor: 10, tasteDailyCap: 100 },
    );
  });
  it("0 is a valid opt-out value and survives", () => {
    assert.deepEqual(
      applyTastePreferencesUpdate(null, { tasteCallsPerVisitor: 0 }),
      { tasteCallsPerVisitor: 0, tasteDailyCap: 50 },
    );
  });
  it("absent fields fall back to defaults", () => {
    assert.deepEqual(applyTastePreferencesUpdate(null, {}), { tasteCallsPerVisitor: 3, tasteDailyCap: 50 });
  });
});
```

- [ ] **Step 2: Run — expect FAIL, then implement**

```bash
node scripts/run-unit-tests.js packages/crm/tests/unit/marketplace/taste/apply-taste-preferences.spec.ts
```

```ts
// packages/crm/src/lib/marketplace/taste/apply-taste-preferences.ts
import type { ListingSellerPreferences } from "@/db/schema/marketplace";
import { resolveTasteBudget } from "./taste-policy";

/** Pure merge+clamp for the seller taste-budget action. Always returns a
 *  fully-populated object (both fields), clamped to platform ceilings. */
export function applyTastePreferencesUpdate(
  current: ListingSellerPreferences | null,
  patch: { tasteCallsPerVisitor?: number; tasteDailyCap?: number },
): ListingSellerPreferences {
  const merged = { ...(current ?? {}), ...patch };
  const budget = resolveTasteBudget(merged);
  return { tasteCallsPerVisitor: budget.visitorLimit, tasteDailyCap: budget.dailyCap };
}
```

Then the thin action in `seller-actions.ts` (mirror the file's existing org-guard + creator-scoped update pattern exactly — same imports, same result shape as its neighbors):

```ts
export async function updateListingTastePreferencesAction(input: {
  listingId: string;
  tasteCallsPerVisitor?: number;
  tasteDailyCap?: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const [listing] = await db
    .select({ id: marketplaceListings.id, sellerPreferences: marketplaceListings.sellerPreferences })
    .from(marketplaceListings)
    .where(and(eq(marketplaceListings.id, input.listingId), eq(marketplaceListings.creatorOrgId, orgId)))
    .limit(1);
  if (!listing) return { ok: false, error: "Listing not found." };

  const next = applyTastePreferencesUpdate(listing.sellerPreferences ?? null, {
    tasteCallsPerVisitor: input.tasteCallsPerVisitor,
    tasteDailyCap: input.tasteDailyCap,
  });
  await db
    .update(marketplaceListings)
    .set({ sellerPreferences: next })
    .where(eq(marketplaceListings.id, input.listingId));
  return { ok: true };
}
```

- [ ] **Step 3: Run — expect PASS**

```bash
node scripts/run-unit-tests.js packages/crm/tests/unit/marketplace/taste/apply-taste-preferences.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/lib/marketplace/taste/apply-taste-preferences.ts packages/crm/src/lib/marketplace/seller-actions.ts packages/crm/tests/unit/marketplace/taste/apply-taste-preferences.spec.ts
git commit -m "feat(taste): seller taste-budget action (merge+clamp, creator-guarded)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Final gate

- [ ] **Step 1: Full taste spec glob**

```bash
node scripts/run-unit-tests.js packages/crm/tests/unit/marketplace/taste/*.spec.ts packages/crm/tests/unit/agents/stateless-turn-overrides.spec.ts
```
Expected: ALL PASS. (If the runner takes one path at a time, run each of the 7 spec files individually — every one must pass.)

- [ ] **Step 2: Full unit suite — delta vs baseline**

```bash
pnpm test:unit
```
Expected: failure count ≤ the pre-Task-1 baseline (~75 known); ZERO new failures in marketplace/, agents/, or any file this plan touched.

- [ ] **Step 3: TypeScript (non-.next)**

```bash
cd packages/crm && npx tsc --noEmit -p tsconfig.json
```
Expected: no NEW errors vs the pre-Task-1 baseline (the repo has pre-existing React-19 artifact noise; `.next` is excluded by the project tsconfig — if any `.next/**` errors surface, they are pre-existing and out of scope).

- [ ] **Step 4: use-server gate**

```bash
pnpm check:use-server
```
(If the script name differs, find it: `node -e "console.log(require('./package.json').scripts)"` at repo root and in `packages/crm` — run whichever contains `check-use-server`.) Expected: PASS — `seller-actions.ts` still exports only async functions.

- [ ] **Step 5: Production build**

```bash
pnpm -C packages/crm build
```
Expected: build completes (same warnings as `main`, no new errors).

- [ ] **Step 6: Flag-off smoke (behavioral, not just unit)**

With `SF_AGENT_TASTE_MODE` unset, run the dev server and:

```bash
curl -s -X POST http://localhost:3000/api/v1/agents/<any-published-agent-slug>/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```
Expected byte-for-byte: `{"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"Missing rental key. Send \`Authorization: Bearer <key>\`."}}` — today's exact envelope. Repeat with `SF_AGENT_TASTE_MODE=1` and a flagship-listed slug to see the taste descriptors.

- [ ] **Step 7: Final commit + stop**

```bash
git status   # only intended files
git log --oneline main..HEAD
```
Do NOT merge or push — hand back to Max with the branch name and the two docs. Deployment note for the PR body: taste stays OFF in prod until `SF_AGENT_TASTE_MODE=1` and `SF_FLAGSHIP_ORG_IDS` are set in Vercel, and the migration (`0063` or `0064` per the both-cases rule) must be applied with the same care as every hand-written migration in this repo.

---

## Self-review notes (already applied)

- Spec coverage: funnel (Tasks 8-9), grounding (7), session (3-4), caps/budget (2, 9, 10), model/key economics + money test (5-6), flag inertness (8 Step 1 + 11 Step 6), migration both-cases (1), events (8-9), cron (9), seller action (10).
- Type consistency: `TasteDeps` is defined once (Task 8) and consumed by Task 9's `buildTasteDeps`; `RentalTurnResult` reused from agent-rental-run.ts; `TasteGrounding` defined once (Task 1).
- Known judgment calls an implementer may hit: exact `OrgSoul` field names (Task 6 note), `htmlToMarkdown` export (Task 7 note), drizzle index-definition style (Task 1 note), existing handler-spec filenames (Task 8 Step 5), `getRentalSigningSecret` env name (Task 9 Step 4 note). Each has an in-task instruction — none blocks.
