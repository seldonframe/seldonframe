# Web Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A cold visitor pastes a URL on seldonframe.com and watches a real workspace + answering chatbot build at `/try` before signup; Google one-click signup; a true signup→workspace→built→tested funnel on super-admin.

**Architecture:** P1 wires a new public, flag-gated, IP-rate-limited SSE route + `/try` page onto the EXISTING `runCreateFromUrl` orchestrator (which already supports `sessionUser: null`, already streams the BuildAnimation event sequence `fetching → extracting → soul_built → chatbot_built → demo_seeded → done`, and already auto-creates the website chatbot). Claim = existing `link-owner` route via a new `/claim-build` return page. Extraction cost is bounded by a new `url_extraction_cache` table + `cache_control` prompt caching. P2 adds Google buttons over the already-registered conditional provider. P3 rewrites `super-admin/activation.ts`.

**Tech Stack:** Next.js 16 App Router (packages/crm), Drizzle/Neon, node:test + tsx, Anthropic SDK (`claude-sonnet-4-20250514` pinned), Vercel crons.

**Spec:** `docs/superpowers/specs/2026-07-03-web-activation-design.md`

## Global Constraints

- **No new Stripe calls anywhere.** The only new spend is Anthropic tokens on extraction, bounded by `checkRateLimit` + the URL cache.
- **Flag-gated dark:** all P1 public surface behind `SF_WEB_UNGATED_BUILD` with strict value `"1"` (trim), same pattern as `isTasteFlagOn`. Flag off ⇒ `/try` and the stream route return 404 and `marketing-hero.tsx` submit behavior is byte-identical to today (`router.push('/signup?intent=build&url=…')`).
- **Extraction model pinned:** `claude-sonnet-4-20250514`. Do NOT swap models. Add `cache_control: { type: "ephemeral" }` system blocks only (pattern: `src/lib/workspace/enhance-blocks.ts:722-748`).
- **Migration house rule:** hand-write `packages/crm/drizzle/0065_url_extraction_cache.sql` (next FILENAME number) + hand-append `drizzle/meta/_journal.json` entry `{ "idx": 42, "version": "7", "when": <epoch ms>, "tag": "0065_url_extraction_cache", "breakpoints": true }`. NEVER run `drizzle-kit generate`. No snapshot files.
- **Secrets are Max's:** never hard-code or echo `GOOGLE_CLIENT_ID/SECRET`, `CRON_SECRET`, `UPSTASH_*`, `ANTHROPIC_API_KEY` values.
- **Working dir:** all commands run from `packages/crm` inside the worktree unless stated.
- **Verify gate (per task where named + final):** `node --import tsx --test <specs>`, `pnpm typecheck`, `pnpm check:use-server`, `pnpm build` (build = final task only).
- **Commit per task** with a conventional message; do not push until the final gate.

## Pinned signatures (source of truth for every task)

- `runCreateFromUrl(input: RunInput): Promise<RunResult>` — `src/lib/web-onboarding/run-create-from-url.ts:159`. `RunInput = { deps: RunDeps, …, sessionUser: { id: string; primaryOrgId: string | null } | null }` (`:137-151`). SSE events: `fetching → extracting → soul_built → chatbot_built → demo_seeded → done`.
- `RunDeps` includes: `resolveExtractionKey: (orgId: string | null) => Promise<{ key: string } | null>` (`:55`), `extractBusinessFactsFromUrl: (args: { url: string; byokKey: string }) => Promise<ExtractedBusinessFacts>` (`:56`), `createWebsiteChatbot: (args: { workspaceId; workspaceSlug }) => Promise<unknown>` (`:86`), `seedSoulWikiSourceUrl` (`:105`), `seedDefaultOutboundTriggers` (`:114`).
- Authed caller to mirror: `src/app/api/v1/web/workspaces/create-from-url/route.ts` (250 lines; GET reads `url/template/mode` query params — EventSource-compatible; POST reads `{url, template, mode}`; wires `autoCreateWebsiteChatbot` with `{ createAgent, setPublicChatbotEmbed }`; returns `new Response(stream, { headers })`).
- `CreateFullWorkspaceResult` carries `_bearer_token?: string`, `_bearer_token_expires_at?: string | null`, `workspace_id`, `slug`, `public_urls.home` (`src/lib/workspace/create-full.ts:118-157`).
- Claim: `POST /api/v1/workspace/[id]/link-owner` — auth `Authorization: Bearer wst_…` via `resolveWorkspaceBearer(request.headers)`; identifies user from session; sets `organizations.ownerId + parentUserId` (`route.ts:154-160`); JSON `{ ok, workspace, linked_to, urls, next }`.
- `checkRateLimit(key: string, limit = 120, windowMs = 60_000): Promise<boolean>` — `src/lib/utils/rate-limit.ts:54` (Upstash-backed, in-memory fallback).
- Flag pattern: `isTasteFlagOn(env) { return env.SF_AGENT_TASTE_MODE?.trim() === "1"; }` — `src/lib/marketplace/taste/taste-policy.ts:48-50`.
- Redirect allowlist: `SAFE_REDIRECT_PREFIXES` — `src/lib/auth/signup-redirect.ts:219-232` (add `"/claim-build"`).
- GC cron: `src/app/api/cron/orphan-workspace-ttl/route.ts` — deletes `isNull(organizations.ownerId) && lt(createdAt, cutoff)` at 30d; runs daily `0 4 * * *` (already in `vercel.json` crons). Auth header `Bearer ${CRON_SECRET}` (same as expire-proposals `route.ts:12`).
- `organizations` has NO `source` column; marker = `settings` jsonb key `origin: "web_ungated"`. Columns available: `ownerId`, `parentUserId`, `parentAgencyId`, `previewMode`, `archivedAt`, `settings`, `createdAt` (`src/db/schema/organizations.ts:105-163`).
- Hero submit to modify: `src/components/landing/marketing-hero.tsx:140-157` (currently `router.push(`/signup?${params}`)`).
- `/w/[slug]` metadata sets `robots { index: true, follow: true }` (`src/app/(public)/w/[slug]/page.tsx:95-98`).
- Google provider is ALREADY conditional: `src/lib/auth/config.ts:28-51` (`if (googleClientId && googleClientSecret) authProviders.push(Google({ …, allowDangerousEmailAccountLinking: true }))`).
- Signup form: `src/app/(auth)/signup/signup-form.tsx` (hidden `redirectTo`, submit "Continue with email link"); login form `src/app/(auth)/login/login-form.tsx` (email-only, `?callbackUrl` via `toInternalRedirectPath`).
- Funnel: `src/lib/super-admin/activation.ts` (`getActivationFunnel(): Promise<ActivationSummary>`, `unstable_cache` TTL 300, `.catch`-guarded). Schema for stages: `agents.orgId`, `agent_conversations.orgId/startedAt` (any status incl. `'test'`), `agent_evals` table exists, `users.planId`.
- analyze-url extraction to prompt-cache: `src/app/api/v1/public/analyze-url/route.ts:305-335` (`extractBusinessData(markdown, url)`, single string `system`, `max_tokens: 2048`).
- Test runner: `node --import tsx --test tests/unit/<name>.spec.ts` (imports via `@/` alias work).
- Route paths free & confirmed: `/try` (page), `/api/v1/web/build/stream` (route), `/claim-build` (page). `/build` and `/start` are TAKEN — do not use.

---

### Task 1: Web-build policy + URL cache key (pure, TDD)

**Files:**
- Create: `packages/crm/src/lib/web-build/policy.ts`
- Create: `packages/crm/src/lib/web-build/url-cache-key.ts`
- Test: `packages/crm/tests/unit/web-build-policy.spec.ts`

**Interfaces:**
- Produces: `isWebUngatedBuildOn(env: { SF_WEB_UNGATED_BUILD?: string | undefined }): boolean`; `WEB_BUILD_RATE_LIMIT = 3`; `WEB_BUILD_RATE_WINDOW_MS = 86_400_000`; `WEB_UNGATED_ORIGIN = "web_ungated"`; `normalizeUrlForExtractionCache(raw: string): string | null`; `urlExtractionCacheKey(raw: string): string | null` (sha256 hex of normalized).

- [ ] **Step 1: Write the failing test** — `tests/unit/web-build-policy.spec.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isWebUngatedBuildOn,
  WEB_BUILD_RATE_LIMIT,
  WEB_BUILD_RATE_WINDOW_MS,
  WEB_UNGATED_ORIGIN,
} from "@/lib/web-build/policy";
import {
  normalizeUrlForExtractionCache,
  urlExtractionCacheKey,
} from "@/lib/web-build/url-cache-key";

test("flag: on only for exact '1' (trimmed)", () => {
  assert.equal(isWebUngatedBuildOn({ SF_WEB_UNGATED_BUILD: "1" }), true);
  assert.equal(isWebUngatedBuildOn({ SF_WEB_UNGATED_BUILD: " 1 " }), true);
  assert.equal(isWebUngatedBuildOn({ SF_WEB_UNGATED_BUILD: "true" }), false);
  assert.equal(isWebUngatedBuildOn({ SF_WEB_UNGATED_BUILD: "0" }), false);
  assert.equal(isWebUngatedBuildOn({}), false);
});

test("constants", () => {
  assert.equal(WEB_BUILD_RATE_LIMIT, 3);
  assert.equal(WEB_BUILD_RATE_WINDOW_MS, 24 * 60 * 60 * 1000);
  assert.equal(WEB_UNGATED_ORIGIN, "web_ungated");
});

test("normalize: lowercases host, strips scheme/query/hash/trailing slash, keeps path", () => {
  assert.equal(
    normalizeUrlForExtractionCache("HTTPS://WWW.Example.com/Services/?utm=x#top"),
    "www.example.com/Services"
  );
  assert.equal(normalizeUrlForExtractionCache("http://example.com/"), "example.com");
  assert.equal(normalizeUrlForExtractionCache("example.com/about"), "example.com/about");
  assert.equal(normalizeUrlForExtractionCache("not a url %%"), null);
});

test("cache key: sha256 hex, stable, null for invalid", () => {
  const a = urlExtractionCacheKey("https://example.com/");
  const b = urlExtractionCacheKey("EXAMPLE.com");
  assert.ok(a && /^[0-9a-f]{64}$/.test(a));
  assert.equal(a, b);
  assert.equal(urlExtractionCacheKey("%%"), null);
});
```

- [ ] **Step 2: Run to verify it fails** — `node --import tsx --test tests/unit/web-build-policy.spec.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `src/lib/web-build/policy.ts`:

```ts
// Web ungated-build policy — flag + guardrail constants.
// Flag pattern mirrors isTasteFlagOn (taste-policy.ts): strict "1" after trim,
// so a stray "true"/"yes" in Vercel can never accidentally open the surface.

export const WEB_BUILD_RATE_LIMIT = 3;
export const WEB_BUILD_RATE_WINDOW_MS = 24 * 60 * 60 * 1000;
/** organizations.settings.origin marker for anonymous web builds (no schema column). */
export const WEB_UNGATED_ORIGIN = "web_ungated";

export function isWebUngatedBuildOn(env: {
  SF_WEB_UNGATED_BUILD?: string | undefined;
}): boolean {
  return env.SF_WEB_UNGATED_BUILD?.trim() === "1";
}
```

`src/lib/web-build/url-cache-key.ts`:

```ts
import { createHash } from "node:crypto";

/**
 * Canonical form for the extraction cache: lowercase host, no scheme, no
 * query/hash, no trailing slash. Path case is preserved (some sites are
 * case-sensitive). Returns null when the input can't parse as a URL even
 * with an https:// prefix — callers skip the cache for those.
 */
export function normalizeUrlForExtractionCache(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (!url.hostname || !url.hostname.includes(".")) return null;
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.hostname.toLowerCase()}${path}`;
}

export function urlExtractionCacheKey(raw: string): string | null {
  const normalized = normalizeUrlForExtractionCache(raw);
  if (normalized === null) return null;
  return createHash("sha256").update(normalized).digest("hex");
}
```

- [ ] **Step 4: Run to verify pass** — same command → all tests PASS.
- [ ] **Step 5: Commit** — `git add src/lib/web-build tests/unit/web-build-policy.spec.ts && git commit -m "feat(web-build): policy flag + URL extraction cache key (pure)"`

---

### Task 2: `url_extraction_cache` table — migration 0065 + store

**Files:**
- Create: `packages/crm/drizzle/0065_url_extraction_cache.sql`
- Modify: `packages/crm/drizzle/meta/_journal.json` (append idx 42)
- Create: `packages/crm/src/db/schema/url-extraction-cache.ts`
- Modify: `packages/crm/src/db/schema/index.ts` (export the new schema file, alongside existing exports)
- Create: `packages/crm/src/lib/web-build/extraction-cache-store.ts`
- Test: `packages/crm/tests/unit/url-extraction-cache-store.spec.ts`

**Interfaces:**
- Produces: table `url_extraction_cache(url_hash text, kind text, url text, data jsonb, created_at timestamptz, PRIMARY KEY (url_hash, kind))`; `getCachedUrlExtraction<T>(kind: string, rawUrl: string, deps?: { db?: DbLike; now?: () => Date; maxAgeMs?: number }): Promise<T | null>`; `putCachedUrlExtraction(kind: string, rawUrl: string, data: unknown, deps?: { db?: DbLike }): Promise<void>` (both no-op returning null/void when `urlExtractionCacheKey` is null; default maxAge 30 days).
- Consumes: `urlExtractionCacheKey` from Task 1.

- [ ] **Step 1: Migration SQL** — `drizzle/0065_url_extraction_cache.sql`:

```sql
-- 0065 — URL-keyed extraction result cache (web activation P1).
-- Repeat pastes of the same URL skip scrape + LLM entirely (~$0).
-- kind discriminates the payload shape: 'business_facts' (run-create-from-url
-- pipeline) vs 'analyze_url' (public analyze-url endpoint).
CREATE TABLE IF NOT EXISTS "url_extraction_cache" (
  "url_hash" text NOT NULL,
  "kind" text NOT NULL,
  "url" text NOT NULL,
  "data" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "url_extraction_cache_pk" PRIMARY KEY ("url_hash", "kind")
);
```

- [ ] **Step 2: Journal append** — edit `drizzle/meta/_journal.json`, append after the idx-41 entry (keep valid JSON; `when` = current epoch ms):

```json
{ "idx": 42, "version": "7", "when": 1783130000000, "tag": "0065_url_extraction_cache", "breakpoints": true }
```

Run `pnpm db:check-journaled` → passes (file journaled).

- [ ] **Step 3: Schema file** — `src/db/schema/url-extraction-cache.ts`:

```ts
import { jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const urlExtractionCache = pgTable(
  "url_extraction_cache",
  {
    urlHash: text("url_hash").notNull(),
    kind: text("kind").notNull(),
    url: text("url").notNull(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: "url_extraction_cache_pk", columns: [t.urlHash, t.kind] })]
);
```

Export it from `src/db/schema/index.ts` following the file's existing export style.

- [ ] **Step 4: Failing store test** — `tests/unit/url-extraction-cache-store.spec.ts`. Use a mock db exposing the drizzle calls the store makes (select→where→limit returning rows; insert→values→onConflictDoUpdate). Assert: (a) get returns `data` when a row exists and is fresh; (b) get returns null when the row is older than `maxAgeMs` (inject `now`); (c) get/put return null/void without touching db when the URL is invalid; (d) put upserts on conflict.

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getCachedUrlExtraction,
  putCachedUrlExtraction,
} from "@/lib/web-build/extraction-cache-store";

function mockDb(rows: unknown[]) {
  const calls: Record<string, unknown[]> = { insert: [] };
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => rows }) }) }),
    insert: (..._: unknown[]) => ({
      values: (v: unknown) => {
        calls.insert.push(v);
        return { onConflictDoUpdate: async (_u: unknown) => undefined };
      },
    }),
  };
  return { db: db as never, calls };
}

test("get: fresh row → data", async () => {
  const created = new Date("2026-07-01T00:00:00Z");
  const { db } = mockDb([{ data: { a: 1 }, createdAt: created }]);
  const out = await getCachedUrlExtraction("business_facts", "https://example.com", {
    db, now: () => new Date("2026-07-02T00:00:00Z"),
  });
  assert.deepEqual(out, { a: 1 });
});

test("get: stale row → null", async () => {
  const created = new Date("2026-05-01T00:00:00Z");
  const { db } = mockDb([{ data: { a: 1 }, createdAt: created }]);
  const out = await getCachedUrlExtraction("business_facts", "https://example.com", {
    db, now: () => new Date("2026-07-02T00:00:00Z"),
  });
  assert.equal(out, null);
});

test("invalid URL → no-op, no db touch", async () => {
  let touched = false;
  const db = { select: () => { touched = true; throw new Error("no"); } } as never;
  assert.equal(await getCachedUrlExtraction("k", "%%", { db }), null);
  await putCachedUrlExtraction("k", "%%", { x: 1 }, { db });
  assert.equal(touched, false);
});

test("put: upserts", async () => {
  const { db, calls } = mockDb([]);
  await putCachedUrlExtraction("analyze_url", "https://example.com", { b: 2 }, { db });
  assert.equal(calls.insert.length, 1);
});
```

- [ ] **Step 5: Run to verify fail**, then implement `src/lib/web-build/extraction-cache-store.ts`:

```ts
import { and, eq } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { urlExtractionCache } from "@/db/schema";
import { urlExtractionCacheKey } from "@/lib/web-build/url-cache-key";

const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

type Deps = { db?: typeof defaultDb; now?: () => Date; maxAgeMs?: number };

export async function getCachedUrlExtraction<T>(
  kind: string,
  rawUrl: string,
  deps: Deps = {}
): Promise<T | null> {
  const key = urlExtractionCacheKey(rawUrl);
  if (!key) return null;
  const db = deps.db ?? defaultDb;
  const now = deps.now ? deps.now() : new Date();
  const maxAgeMs = deps.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  try {
    const rows = await db
      .select({ data: urlExtractionCache.data, createdAt: urlExtractionCache.createdAt })
      .from(urlExtractionCache)
      .where(and(eq(urlExtractionCache.urlHash, key), eq(urlExtractionCache.kind, kind)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    if (now.getTime() - new Date(row.createdAt).getTime() > maxAgeMs) return null;
    return row.data as T;
  } catch {
    return null; // cache is best-effort — never block a build on it
  }
}

export async function putCachedUrlExtraction(
  kind: string,
  rawUrl: string,
  data: unknown,
  deps: Deps = {}
): Promise<void> {
  const key = urlExtractionCacheKey(rawUrl);
  if (!key) return;
  const db = deps.db ?? defaultDb;
  try {
    await db
      .insert(urlExtractionCache)
      .values({ urlHash: key, kind, url: rawUrl.trim(), data })
      .onConflictDoUpdate({
        target: [urlExtractionCache.urlHash, urlExtractionCache.kind],
        set: { data, url: rawUrl.trim(), createdAt: new Date() },
      });
  } catch {
    // best-effort
  }
}
```

- [ ] **Step 6: Verify pass** — `node --import tsx --test tests/unit/url-extraction-cache-store.spec.ts` + `pnpm db:check-journaled` + `pnpm typecheck`.
- [ ] **Step 7: Commit** — `git commit -m "feat(web-build): url_extraction_cache table (0065/idx42) + best-effort store"`

---

### Task 3: Cached + prompt-cached extraction (both seams)

**Files:**
- Create: `packages/crm/src/lib/web-build/cached-extraction.ts`
- Modify: `packages/crm/src/app/api/v1/public/analyze-url/route.ts:305-335` (restructure `extractBusinessData`'s Anthropic call; add result cache)
- Modify: the module implementing the authed route's `extractBusinessFactsFromUrl` dep (find the wiring in `src/app/api/v1/web/workspaces/create-from-url/route.ts` — likely `src/lib/web-onboarding/web-fetch-extractor.ts` / `extraction-prompt.ts`). Add `cache_control` on its static instruction block(s) ONLY if it makes a direct `messages.create` call with a static system/instructions prefix; do not restructure its output contract.
- Test: `packages/crm/tests/unit/cached-extraction.spec.ts`

**Interfaces:**
- Produces: `withUrlExtractionCache<T>(kind: string, url: string, run: () => Promise<T>, deps?: { get?: typeof getCachedUrlExtraction; put?: typeof putCachedUrlExtraction }): Promise<{ value: T; cached: boolean }>` — get → hit returns `{value, cached:true}` with zero `run()` calls; miss runs, puts, returns `{value, cached:false}`; put failures never throw.
- Consumes: Task 2 store.

- [ ] **Step 1: Failing test** — `tests/unit/cached-extraction.spec.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { withUrlExtractionCache } from "@/lib/web-build/cached-extraction";

test("hit: returns cached, run() not called", async () => {
  let ran = 0;
  const out = await withUrlExtractionCache(
    "business_facts", "https://example.com",
    async () => { ran += 1; return { fresh: true }; },
    { get: async () => ({ fresh: false }), put: async () => {} }
  );
  assert.deepEqual(out, { value: { fresh: false }, cached: true });
  assert.equal(ran, 0);
});

test("miss: runs once, puts, returns fresh", async () => {
  let ran = 0; let putArgs: unknown[] = [];
  const out = await withUrlExtractionCache(
    "business_facts", "https://example.com",
    async () => { ran += 1; return { fresh: true }; },
    { get: async () => null, put: async (...a) => { putArgs = a; } }
  );
  assert.deepEqual(out, { value: { fresh: true }, cached: false });
  assert.equal(ran, 1);
  assert.equal(putArgs[0], "business_facts");
});

test("put failure is swallowed", async () => {
  const out = await withUrlExtractionCache(
    "k", "https://example.com",
    async () => 42,
    { get: async () => null, put: async () => { throw new Error("db down"); } }
  );
  assert.deepEqual(out, { value: 42, cached: false });
});
```

- [ ] **Step 2: Verify fail, implement** `src/lib/web-build/cached-extraction.ts`:

```ts
import {
  getCachedUrlExtraction,
  putCachedUrlExtraction,
} from "@/lib/web-build/extraction-cache-store";

type Deps = {
  get?: typeof getCachedUrlExtraction;
  put?: typeof putCachedUrlExtraction;
};

/** Wrap an expensive URL-extraction with the url_extraction_cache. Best-effort:
 *  cache errors never block the build; a hit skips run() entirely. */
export async function withUrlExtractionCache<T>(
  kind: string,
  url: string,
  run: () => Promise<T>,
  deps: Deps = {}
): Promise<{ value: T; cached: boolean }> {
  const get = deps.get ?? getCachedUrlExtraction;
  const put = deps.put ?? putCachedUrlExtraction;
  const hit = await get<T>(kind, url).catch(() => null);
  if (hit !== null) return { value: hit, cached: true };
  const value = await run();
  try {
    await put(kind, url, value);
  } catch {
    // best-effort
  }
  return { value, cached: false };
}
```

- [ ] **Step 3: Prompt-cache `extractBusinessData`** in `analyze-url/route.ts` — restructure ONLY the `messages.create` call (`:312-323`): move the static instruction + JSON schema into a `system` **array** with `cache_control`, keep the variable markdown in the user message, keep the model + max_tokens:

```ts
const EXTRACTION_SYSTEM_STATIC =
  "You extract structured business data from website content. Return ONLY valid JSON, no markdown fences. If a field cannot be determined, use null. Extract the business's own words when possible.\n\nReturn JSON:\n{\n  \"businessName\": \"string\",\n  \"industry\": \"string\",\n  \"tagline\": \"string\",\n  \"description\": \"string\",\n  \"services\": [{ \"name\": \"string\", \"description\": \"string\", \"price\": \"string or null\", \"duration\": \"string or null\" }],\n  \"testimonials\": [{ \"quote\": \"string\", \"author\": \"string\", \"role\": \"string or null\" }],\n  \"contactInfo\": { \"email\": \"string or null\", \"phone\": \"string or null\", \"address\": \"string or null\" },\n  \"voiceTone\": \"string\",\n  \"idealClient\": \"string or null\",\n  \"suggestedFramework\": \"coaching | agency | saas | ecommerce | services | other\"\n}";

const response = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 2048,
  system: [
    { type: "text", text: EXTRACTION_SYSTEM_STATIC, cache_control: { type: "ephemeral" } },
  ],
  messages: [
    { role: "user", content: `Extract business data from this website (${url}):\n\n${markdown.slice(0, MAX_MODEL_INPUT_CHARS)}` },
  ],
});
```

Then wrap the call site (`:398`) with the result cache: `const { value: businessData } = await withUrlExtractionCache("analyze_url", safeUrl, () => extractBusinessData(markdown, safeUrl));` (scrape still runs pre-cache here — acceptable; the LLM call is the cost).

- [ ] **Step 4: Prompt-cache the pipeline extractor** — read the `extractBusinessFactsFromUrl` implementation wired by `create-from-url/route.ts`. If it calls `messages.create` with a static instructions block (e.g. `EXTRACTION_INSTRUCTIONS_MD` from `extraction-prompt.ts`), convert that static block to a `system` array entry with `cache_control: { type: "ephemeral" }` exactly as above (do NOT change its parsing or output type). If its call goes through a helper that doesn't expose `system` structuring, report the deviation in your task report instead of forcing it.

- [ ] **Step 5: Verify** — `node --import tsx --test tests/unit/cached-extraction.spec.ts` PASS; `pnpm typecheck`; existing analyze-url behavior unchanged shape-wise (no test exists for the route; typecheck + careful diff is the gate).
- [ ] **Step 6: Commit** — `git commit -m "feat(web-build): URL-keyed extraction cache wrap + Sonnet cache_control on both extraction seams"`

---

### Task 4: Public SSE build route `/api/v1/web/build/stream`

**Files:**
- Create: `packages/crm/src/app/api/v1/web/build/stream/route.ts`
- Test: `packages/crm/tests/unit/web-build-stream-route.spec.ts` (gate logic via exported pure helper)

**Interfaces:**
- Consumes: Task 1 (`isWebUngatedBuildOn`, `WEB_BUILD_RATE_LIMIT`, `WEB_BUILD_RATE_WINDOW_MS`, `WEB_UNGATED_ORIGIN`), Task 3 (`withUrlExtractionCache`), pinned `runCreateFromUrl` + the authed route's deps wiring, `checkRateLimit`.
- Produces: `GET /api/v1/web/build/stream?url=<https…>` → SSE stream (same event sequence as authed route) whose `done` event data ALSO includes `{ ws_id, slug, public_home_url, chatbot_embed_url, claim_token }`; 404 when flag off; SSE `error` event with `code: "rate_limited"` when over limit. Also exports `resolveWebBuildGate(env, ip, rateCheck)` pure helper for tests.

- [ ] **Step 1: Read the authed route end-to-end** (`src/app/api/v1/web/workspaces/create-from-url/route.ts`) and `run-create-from-url.ts`. Confirm: how `deps` are assembled, how the `done` event payload is built (find where `revealLinks`/final data is emitted), and what `resolveExtractionKey(null)` returns today (if it returns null for anonymous, the public route must supply its own resolver returning the platform `process.env.ANTHROPIC_API_KEY`).

- [ ] **Step 2: Failing test for the gate helper** — `tests/unit/web-build-stream-route.spec.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveWebBuildGate } from "@/app/api/v1/web/build/stream/route";

test("flag off → not_found regardless of rate", async () => {
  const out = await resolveWebBuildGate({}, "1.2.3.4", async () => true);
  assert.deepEqual(out, { kind: "not_found" });
});

test("flag on + under limit → ok", async () => {
  const out = await resolveWebBuildGate({ SF_WEB_UNGATED_BUILD: "1" }, "1.2.3.4", async () => true);
  assert.deepEqual(out, { kind: "ok" });
});

test("flag on + over limit → rate_limited", async () => {
  const out = await resolveWebBuildGate({ SF_WEB_UNGATED_BUILD: "1" }, "1.2.3.4", async () => false);
  assert.deepEqual(out, { kind: "rate_limited" });
});
```

- [ ] **Step 3: Implement the route.** Requirements (mirror the authed route's structure — copy its GET param parsing and stream plumbing):
  - `export async function resolveWebBuildGate(env, ip, rateCheck): Promise<{kind:"not_found"|"rate_limited"|"ok"}>` — flag check first (`isWebUngatedBuildOn`), then `await rateCheck()` (caller passes `() => checkRateLimit(\`web-build:${ip}\`, WEB_BUILD_RATE_LIMIT, WEB_BUILD_RATE_WINDOW_MS)`).
  - `GET` handler: gate → `not_found` ⇒ `return new Response(null, { status: 404 })`; `rate_limited` ⇒ SSE stream that emits one `error` event `{ code: "rate_limited", message: "You've built a few workspaces today — sign up to keep building." }` then closes (the /try page shows it inline); `ok` ⇒ call `runCreateFromUrl` with:
    - `sessionUser: null`
    - the SAME deps as the authed route, with two overrides: (a) `resolveExtractionKey: async () => (process.env.ANTHROPIC_API_KEY ? { key: process.env.ANTHROPIC_API_KEY } : null)`; (b) `extractBusinessFactsFromUrl` wrapped: `(args) => withUrlExtractionCache("business_facts", args.url, () => realExtract(args)).then(r => r.value)`.
  - After the workspace exists (wherever the orchestrator/route observes `workspace_id` — the same place the authed route wires `createWebsiteChatbot`), stamp the marker with one update: `settings: sql\`jsonb_set(coalesce(settings,'{}'::jsonb), '{origin}', '"web_ungated"')\`` on `organizations` for the new org (or merge in JS if the route already re-reads settings — match local style).
  - Extend the `done` event data to include `{ ws_id, slug, public_home_url, chatbot_embed_url, claim_token }` where `claim_token` = `CreateFullWorkspaceResult._bearer_token`. If the orchestrator owns the `done` emit, add these fields to its done payload ONLY when a new optional `deps`/input flag (e.g. `includeClaimGrant: true`) is set by this route, so the authed route's event shape is unchanged.
  - No auth import; no session read; `export const dynamic = "force-dynamic"`. Follow the authed route's header/stream return exactly: `return new Response(stream, { headers })`.
- [ ] **Step 4: Verify** — gate spec PASS; `pnpm typecheck`; `pnpm check:use-server`.
- [ ] **Step 5: Commit** — `git commit -m "feat(web-build): public flag-gated rate-limited SSE build route with claim grant in done event"`

---

### Task 5: `/try` public page — paste → animation → reveal → save CTA

**Files:**
- Create: `packages/crm/src/app/(public)/try/page.tsx` (server: flag gate + metadata)
- Create: `packages/crm/src/app/(public)/try/try-client.tsx` (client island)
- Test: `packages/crm/tests/unit/try-page-gate.spec.ts` (server gate helper) — UI behavior is typecheck + manual smoke.

**Interfaces:**
- Consumes: Task 1 flag; Task 4 route (`/api/v1/web/build/stream?url=…` SSE; `done` data `{ ws_id, slug, public_home_url, chatbot_embed_url, claim_token }`; `error` event `{ code, message }`); pinned `BuildAnimation({ active, input, eventSource, revealLinks })` from `src/app/(dashboard)/clients/new/build-animation` (client-safe, session-free).
- Produces: the public page; "Save your workspace" CTA hrefs to `/signup?callbackUrl=${encodeURIComponent(`/claim-build?ws=${ws_id}&token=${claim_token}`)}`.

- [ ] **Step 1: Server page** — `page.tsx`: `notFound()` when `!isWebUngatedBuildOn(process.env)`; metadata `robots: { index: false, follow: false }` (an app surface, not content); reads `searchParams.url` and passes to the island.

```tsx
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isWebUngatedBuildOn } from "@/lib/web-build/policy";
import { TryClient } from "./try-client";

export const metadata: Metadata = {
  title: "Try SeldonFrame — watch your business build itself",
  robots: { index: false, follow: false },
};

export default async function TryPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  if (!isWebUngatedBuildOn(process.env)) notFound();
  const params = await searchParams;
  return <TryClient initialUrl={typeof params.url === "string" ? params.url : ""} />;
}
```

- [ ] **Step 2: Client island** — `try-client.tsx` (`"use client"`). Behavior contract (implementer writes idiomatic code matching `clients-new-form.tsx` patterns):
  - State: `phase: "idle" | "building" | "revealed" | "error"`, `url`, `done: DoneData | null`, `error: string | null`.
  - On submit (button + Enter): create `new EventSource(\`/api/v1/web/build/stream?url=${encodeURIComponent(url)}\`)`, set `phase="building"`, render `<BuildAnimation active input={{ url }} eventSource={es} />`.
  - Listen for the `done` event → parse `{ ws_id, slug, public_home_url, chatbot_embed_url, claim_token }` → `phase="revealed"`; `error` event → `phase="error"` with the message (rate-limit copy shows a "Sign up to keep building" link to `/signup`).
  - Revealed layout: (a) headline "**{slug}.app.seldonframe.com is live**"; (b) `<iframe src={public_home_url} … />` site preview (~60% width desktop, stacked mobile); (c) `<iframe src={chatbot_embed_url} …/>` chatbot panel titled "Talk to your new AI receptionist — ask it anything about your business"; (d) primary CTA button "Save your workspace — it's free" → `href={"/signup?callbackUrl=" + encodeURIComponent(`/claim-build?ws=${done.ws_id}&token=${done.claim_token}`)}`; (e) secondary "Start over" resets to idle.
  - Style: match the marketing surface (light `#F6F2EA` paper, `#00897B` green accents — same palette tokens used in `marketing-hero.tsx`). No dashboard chrome.
- [ ] **Step 3: Gate test** — `tests/unit/try-page-gate.spec.ts`: import `isWebUngatedBuildOn` and assert the same flag semantics the page uses (documents the 404 contract; direct page render isn't unit-testable here):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { isWebUngatedBuildOn } from "@/lib/web-build/policy";

test("/try gate follows the strict flag (page calls notFound() when off)", () => {
  assert.equal(isWebUngatedBuildOn({}), false);
  assert.equal(isWebUngatedBuildOn({ SF_WEB_UNGATED_BUILD: "1" }), true);
});
```

- [ ] **Step 4: Verify** — `pnpm typecheck` + `pnpm check:use-server`; spec PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(web-build): /try public paste→build→reveal page with live chatbot + save CTA"`

---

### Task 6: `/claim-build` — invisible claim on first auth

**Files:**
- Create: `packages/crm/src/app/(dashboard)/claim-build/page.tsx`
- Modify: `packages/crm/src/lib/auth/signup-redirect.ts:219-232` (add `"/claim-build"` to `SAFE_REDIRECT_PREFIXES`, with a dated comment)
- Test: extend the existing signup-redirect spec (find `tests/unit/*signup-redirect*`; if none exists, create `tests/unit/signup-redirect-claim-build.spec.ts`)

**Interfaces:**
- Consumes: pinned `POST /api/v1/workspace/[id]/link-owner` (`Authorization: Bearer <claim_token>`; user from session; response `{ ok, … }`).
- Produces: authenticated page at `/claim-build?ws=<orgId>&token=<wst_…>` that claims then redirects.

- [ ] **Step 1: Failing allowlist test:**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeRedirectTo } from "@/lib/auth/signup-redirect"; // use the module's real exported name — read the file first

test("claim-build round-trip path survives the signup allowlist", () => {
  const target = "/claim-build?ws=abc&token=wst_x";
  assert.equal(sanitizeRedirectTo(target), target);
});
```

(Read `signup-redirect.ts` first and use its actual exported validator name — the pinned facts name the array, not the export.)

- [ ] **Step 2: Add `"/claim-build"`** to `SAFE_REDIRECT_PREFIXES` with comment `// 2026-07-03 — web-activation invisible claim return (docs/superpowers/specs/2026-07-03-web-activation-design.md)`. Test passes.
- [ ] **Step 3: Page** — client component modeled directly on the existing `/claim` page (`(dashboard)/claim/page.tsx:37-41` fetch pattern): reads `ws` + `token` search params; POSTs `fetch(\`/api/v1/workspace/${ws}/link-owner\`, { method: "POST", headers: { Authorization: \`Bearer ${token}\` } })`; on `ok` → `router.replace("/dashboard?claimed=1")`; on failure → `router.replace("/dashboard?claim=failed")` (never strands the user); shows a minimal "Attaching your workspace…" spinner meanwhile. Missing params → immediate `/dashboard` replace.
- [ ] **Step 4: Verify** — spec PASS; `pnpm typecheck`; `pnpm check:use-server`.
- [ ] **Step 5: Commit** — `git commit -m "feat(web-build): /claim-build invisible claim return + signup allowlist entry"`

---

### Task 7: GC — 7-day reclaim for `web_ungated` orphans

**Files:**
- Modify: `packages/crm/src/app/api/cron/orphan-workspace-ttl/route.ts`
- Create: `packages/crm/src/lib/web-build/gc-cutoffs.ts`
- Test: `packages/crm/tests/unit/web-build-gc.spec.ts`

**Interfaces:**
- Produces: `webUngatedGcCutoff(now: Date): Date` (now − 7 days); the cron additionally deletes orgs where `ownerId IS NULL AND createdAt < webUngatedGcCutoff AND settings->>'origin' = 'web_ungated'`. The existing 30-day general delete is UNCHANGED (it already covers these rows later; this just tightens web_ungated to 7d).
- Consumes: `WEB_UNGATED_ORIGIN` (Task 1).

- [ ] **Step 1: Failing test:**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { webUngatedGcCutoff } from "@/lib/web-build/gc-cutoffs";

test("cutoff is exactly 7 days before now", () => {
  const now = new Date("2026-07-10T12:00:00Z");
  assert.equal(webUngatedGcCutoff(now).toISOString(), "2026-07-03T12:00:00.000Z");
});
```

- [ ] **Step 2: Implement** `gc-cutoffs.ts` (`export function webUngatedGcCutoff(now: Date): Date { return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); }`) and extend the cron route: after the existing 30d delete, add a second `db.delete(organizations).where(and(isNull(organizations.ownerId), lt(organizations.createdAt, webUngatedGcCutoff(new Date())), sql\`${organizations.settings} ->> 'origin' = ${WEB_UNGATED_ORIGIN}\`)).returning(...)`; log each as `event: "web_ungated_workspace_gc"` and include `web_ungated_deleted_count` in the JSON response. Auth line and schedule are untouched (cron already exists in vercel.json).
- [ ] **Step 3: Verify** — spec PASS; `pnpm typecheck`.
- [ ] **Step 4: Commit** — `git commit -m "feat(web-build): 7-day GC for unclaimed web_ungated workspaces in orphan-ttl cron"`

---

### Task 8: Hero wiring + noindex for unclaimed sites

**Files:**
- Modify: `packages/crm/src/app/(public)/page.tsx` (compute `ungatedBuildEnabled` server-side, pass to `<MarketingHero />`)
- Modify: `packages/crm/src/components/landing/marketing-hero.tsx:140-157`
- Modify: `packages/crm/src/app/(public)/w/[slug]/page.tsx:95-98` (robots)
- Test: `packages/crm/tests/unit/marketing-hero-target.spec.ts`

**Interfaces:**
- Consumes: Task 1 flag + `WEB_UNGATED_ORIGIN`.
- Produces: `MarketingHero` gains optional prop `ungatedBuildEnabled?: boolean` (default `false`); exported pure helper `heroSubmitTarget(tab: "url" | "biz", value: string, ungatedBuildEnabled: boolean): string`.

- [ ] **Step 1: Failing test:**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { heroSubmitTarget } from "@/components/landing/marketing-hero";

test("flag off → byte-identical current behavior", () => {
  assert.equal(
    heroSubmitTarget("url", "https://acme.com", false),
    "/signup?intent=build&url=https%3A%2F%2Facme.com"
  );
  assert.equal(heroSubmitTarget("biz", "Family plumbing in Reno", false), "/signup?intent=build");
});

test("flag on → /try carries the url; biz tab still goes to /try", () => {
  assert.equal(
    heroSubmitTarget("url", "https://acme.com", true),
    "/try?url=https%3A%2F%2Facme.com"
  );
  assert.equal(heroSubmitTarget("biz", "Family plumbing in Reno", true), "/try");
});
```

- [ ] **Step 2: Implement.** In `marketing-hero.tsx`: export `heroSubmitTarget` (pure — builds exactly the strings above using `URLSearchParams` in the same order as the current code: `intent=build` first for the signup path); change `submit()` to `router.push(heroSubmitTarget(tab, value, ungatedBuildEnabled))` keeping the localStorage seed write + 380ms delay untouched. In `(public)/page.tsx`: `import { isWebUngatedBuildOn } from "@/lib/web-build/policy";` → `<MarketingHero ungatedBuildEnabled={isWebUngatedBuildOn(process.env)} />`. (Note: `/try` reads `?url=`; the biz-description tab relies on the localStorage seed it already writes — `/try` island should read `sf-workspace-seed` from localStorage when no `?url=` param, matching the hero's existing seed contract.) Add that localStorage fallback read to `try-client.tsx` if not already done in Task 5 (one `useEffect`, parse `{kind, value}`).
- [ ] **Step 3: noindex** — in `/w/[slug]/page.tsx` `generateMetadata`, where the org row is already loaded, replace the static `robots { index: true }` with: `index: !(org.ownerId === null && (org.settings as Record<string, unknown> | null)?.["origin"] === "web_ungated")` (claimed or non-web orgs stay indexed; comment why).
- [ ] **Step 4: Verify** — spec PASS; `pnpm typecheck`; `pnpm check:use-server`.
- [ ] **Step 5: Commit** — `git commit -m "feat(web-build): hero routes paste to /try behind flag (byte-identical off) + noindex unclaimed sites"`

---

### Task 9: Google one-click on signup + login (P2)

**Files:**
- Modify: `packages/crm/src/app/(auth)/signup/signup-form.tsx`
- Modify: `packages/crm/src/app/(auth)/signup/page.tsx` (pass `googleEnabled`)
- Modify: `packages/crm/src/app/(auth)/login/login-form.tsx` + `login/page.tsx` (same)
- Create: `packages/crm/src/app/(auth)/oauth-actions.ts` (server action)
- Test: `packages/crm/tests/unit/google-signin-gate.spec.ts`

**Interfaces:**
- Produces: `googleSignInAction(formData: FormData): Promise<void>` server action calling `signIn("google", { redirectTo })` (import `signIn` from `@/auth`); both forms render a primary "Continue with Google" button ONLY when `googleEnabled` prop is true; `isGoogleAuthEnabled(env): boolean` pure helper (`Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)`) in `src/lib/auth/google-enabled.ts`.

- [ ] **Step 1: Failing test:**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { isGoogleAuthEnabled } from "@/lib/auth/google-enabled";

test("enabled only when both env vars present and non-empty", () => {
  assert.equal(isGoogleAuthEnabled({ GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "y" }), true);
  assert.equal(isGoogleAuthEnabled({ GOOGLE_CLIENT_ID: "x" }), false);
  assert.equal(isGoogleAuthEnabled({ GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "y" }), false);
  assert.equal(isGoogleAuthEnabled({}), false);
});
```

- [ ] **Step 2: Implement.** `google-enabled.ts` helper. `oauth-actions.ts`:

```ts
"use server";

import { signIn } from "@/auth";
import { sanitizeRedirectTo } from "@/lib/auth/signup-redirect"; // real exported name — read the module

export async function googleSignInAction(formData: FormData): Promise<void> {
  const redirectTo = sanitizeRedirectTo(formData.get("redirectTo"));
  await signIn("google", { redirectTo });
}
```

(Confirm the repo's NextAuth v5 import path for `signIn` — `@/auth` re-exports it per `packages/crm/auth.ts`; `check:use-server` enforces async-only exports.) Both forms: add above the email field, when `googleEnabled`:

```tsx
<form action={googleSignInAction}>
  <input type="hidden" name="redirectTo" value={callbackUrl} />
  <button type="submit" className="…primary…">Continue with Google</button>
</form>
<div className="…divider…">or</div>
```

Email/magic-link block becomes secondary styling. Pages pass `googleEnabled={isGoogleAuthEnabled(process.env)}`. Copy: button text exactly "Continue with Google"; no other copy changes.
- [ ] **Step 3: Verify** — spec PASS; `pnpm typecheck`; `pnpm check:use-server` (the new action file must pass the async-export rule).
- [ ] **Step 4: Commit** — `git commit -m "feat(auth): Google one-click on signup+login, env-gated, redirectTo-preserving"`

---

### Task 10: Activation funnel rewrite — signup → workspace → built → tested (P3)

**Files:**
- Modify: `packages/crm/src/lib/super-admin/activation.ts`
- Create: `packages/crm/src/lib/super-admin/internal-exclusion.ts`
- Test: `packages/crm/tests/unit/internal-exclusion.spec.ts`

**Interfaces:**
- Produces: `parseInternalIds(env: { SF_INTERNAL_USER_IDS?: string; SF_INTERNAL_AGENCY_ID?: string }): { userIds: string[]; agencyId: string | null }` (comma-split, trim, drop empties); `getActivationFunnel(opts?: { includeInternal?: boolean }): Promise<ActivationSummary>` where `ActivationSummary` gains `{ excludedInternal: boolean; internalOrgCount: number }` and `stages` becomes exactly 4 entries: `Signups`, `Created a workspace`, `Built an agent`, `Tested an agent` (percent-of-signups), keeping the existing `connections` block and adding `paying: number` as a top-level field (moved out of stages).
- Consumes: existing schema columns (pinned): `organizations.ownerId/parentUserId/parentAgencyId/previewMode`, `agents.orgId`, `agent_conversations.orgId`, `agent_evals`.

- [ ] **Step 1: Failing test** for `parseInternalIds` (3 cases: normal parse, whitespace/empties dropped, absent env → `{userIds: [], agencyId: null}`).
- [ ] **Step 2: Implement `internal-exclusion.ts`** (pure). Also export `internalOrgPredicateSql(ids)` returning a drizzle `sql` fragment used by activation queries: an org is internal when `owner_id = ANY(ids)` OR `parent_user_id = ANY(ids)` OR `parent_agency_id = <agencyId>` OR `preview_mode = true`; when `userIds` empty and no agencyId, only `preview_mode = true` applies.
- [ ] **Step 3: Rewrite `activation.ts` stage getters** (keep the file's `unstable_cache` keys DISTINCT per includeInternal — suffix cache keys with `:ext` / `:all`; keep `.catch(() => 0)` guards):
  - Signups: `count(users.id)` minus internal users when excluding (`lower(email)` NOT needed — exclude by `users.id = ANY(userIds)`).
  - Created a workspace: `count(DISTINCT organizations.ownerId)` over non-internal orgs with `ownerId IS NOT NULL` (and owner not internal).
  - Built an agent: `count(DISTINCT org_id)` from `agents` joined to non-internal owned orgs.
  - Tested an agent: `count(DISTINCT org_id)` from `(SELECT org_id FROM agent_conversations UNION SELECT org_id FROM agent_evals)` joined the same way.
  - `paying` + `connections`: keep existing queries as-is.
  - `internalOrgCount`: one cached count of orgs matching the internal predicate.
- [ ] **Step 4: Verify** — spec PASS; `pnpm typecheck`. (SQL correctness is spot-checked in Task 12's report against the known truth: external ≈ 22 signups / 2 built.)
- [ ] **Step 5: Commit** — `git commit -m "feat(super-admin): signup→workspace→built→tested funnel with internal-account exclusion"`

---

### Task 11: Super-admin funnel render + include-internal toggle

**Files:**
- Modify: `packages/crm/src/app/super-admin/page.tsx` (the activation section added in `e12c0be9`)

**Interfaces:**
- Consumes: Task 10 `getActivationFunnel({ includeInternal })` + new `ActivationSummary` shape.

- [ ] **Step 1:** Read the current activation section render. Update: pass `includeInternal: searchParams.include_internal === "1"`; render the 4 stages in order with counts + `ofTotalPct` (percent of Signups); a muted note `Excluding N internal workspaces — <Link href="?include_internal=1">include</Link>` (and the inverse link when included); keep the StatCard/#1FAE85 visual language already used on the page; render `paying` as its own small stat beside connections.
- [ ] **Step 2: Verify** — `pnpm typecheck`; `pnpm check:use-server`.
- [ ] **Step 3: Commit** — `git commit -m "feat(super-admin): render 4-stage external funnel + include-internal toggle"`

---

### Task 12: Full verify gate + flag-off proof + report

**Files:**
- Create: `.superpowers/sdd/web-activation-report.md` (worktree-local, git-ignored ok)

- [ ] **Step 1: Full unit sweep** — `node --import tsx --test tests/unit/web-build-policy.spec.ts tests/unit/url-extraction-cache-store.spec.ts tests/unit/cached-extraction.spec.ts tests/unit/web-build-stream-route.spec.ts tests/unit/try-page-gate.spec.ts tests/unit/web-build-gc.spec.ts tests/unit/marketing-hero-target.spec.ts tests/unit/google-signin-gate.spec.ts tests/unit/internal-exclusion.spec.ts` (+ the signup-redirect spec touched in Task 6) → ALL PASS.
- [ ] **Step 2:** `pnpm typecheck` → clean. `pnpm check:use-server` → clean. `pnpm db:check-journaled` → clean.
- [ ] **Step 3:** `pnpm build` → succeeds (this also runs check-use-server).
- [ ] **Step 4: Flag-off proof (grep-level):** confirm `heroSubmitTarget(tab, value, false)` output strings equal the pre-change targets (Task 8 spec covers it); confirm `/try/page.tsx` and the stream route both hard-gate on `isWebUngatedBuildOn` before any other work (quote the lines in the report).
- [ ] **Step 5: Report** — write `.superpowers/sdd/web-activation-report.md`: commits list, test counts, the two Max-action checklists (Vercel: `SF_WEB_UNGATED_BUILD=1` when ready, `SF_INTERNAL_USER_IDS=<4 ids>`, `SF_INTERNAL_AGENCY_ID=<id>`, `GOOGLE_CLIENT_ID/SECRET`; Google Cloud: authorized redirect URI `https://app.seldonframe.com/api/auth/callback/google`), and the preview smoke script (paste → build → talk → Google signup → claimed).
- [ ] **Step 6: Commit** — `git commit -m "chore(web-activation): full verify gate + rollout report"`

---

## Self-review notes

- **Spec coverage:** P1 §6.1 items 1-6 → Tasks 8, 5, 4, 4(chatbot via orchestrator deps — already wired by `autoCreateWebsiteChatbot`), 5(reveal), 6(claim), 7(GC). §9 cost → Tasks 2+3. P2 §7 → Task 9. P3 §8 → Tasks 10+11. §10 testing → per-task specs + Task 12. Spec's `/build` path superseded by `/try` (collision found — `/build` and `/start` are taken; deviation recorded here deliberately).
- **Known judgment points for implementers** (report, don't guess silently): Task 3 Step 4's "no compatible seam" branch; Task 4's `done`-payload extension mechanism (`includeClaimGrant` flag) if the orchestrator's emit site differs from expectation; Task 6's real exported validator name in `signup-redirect.ts`.
- **Type consistency:** `DoneData` fields (`ws_id, slug, public_home_url, chatbot_embed_url, claim_token`) are named identically in Tasks 4 and 5. `WEB_UNGATED_ORIGIN` used in Tasks 4, 7, 8. Flag helper name `isWebUngatedBuildOn` everywhere.
