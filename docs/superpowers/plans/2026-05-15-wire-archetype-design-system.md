# Wire Archetype Design System Into v2 Lean URL Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make per-vertical landing pages actually look per-vertical (HVAC plumbing = bold-urgency split-screen, dental = clinical-trust nexora-light, medspa = cinematic-aspirational cinematic-aura) and eliminate text-only heroes by adding per-archetype curated Unsplash fallback queries.

**Architecture:** Two coordinated changes. (1) Archetype propagates server → CC agent → server: stored in `OrgTheme.aestheticArchetype` JSONB field at workspace creation; surfaced in `v2/create` response context; hero SKILL.md teaches the LLM the Archetype→Template mapping; `persist_block` server-enforces the mapping as a safety net. (2) Per-archetype curated `fallbackImageQueries` set on each archetype; `resolveHeroImage` and `resolveGalleryImages` fire Phase 2 fallback (deterministic hash → query) when all LLM-generated candidates zero-result.

**Tech Stack:** Next.js 16.2 (App Router) backend at `packages/crm`, `node:test` + `tsx` for unit tests at `packages/crm/tests/unit/`, run via `pnpm test:unit` from repo root. pnpm + turbo monorepo. No DB migration (OrgTheme is JSONB). MCP server at `skills/mcp-server` is not touched.

**Spec:** `docs/superpowers/specs/2026-05-15-wire-archetype-design-system-design.md` (commit `f5daa6aa`).

---

## File Structure

### Modified

| Path | Change | Why |
|------|--------|-----|
| `packages/crm/src/lib/theme/types.ts` | Add optional `aestheticArchetype` field to `OrgTheme` interface | Carry archetype id in the JSONB column already on `organizations` table |
| `packages/crm/src/lib/workspace/aesthetic-archetypes.ts` | Add `fallbackImageQueries: string[]` field to interface + populate on all 7 archetypes | Phase 2 fallback source |
| `packages/crm/src/lib/workspace/enhance-blocks.ts` | (a) One-line patch to existing `applyOrgTheme` call: include `aestheticArchetype: archetypeId` in the patch. (b) Thread `archetypeContext` into `resolveHeroImage` + `resolveGalleryImages` calls in `payloadToSections` | (a) Persist on org at classification time. (b) Enable Phase 2 fallback on v1 first-render path |
| `packages/crm/src/app/api/v1/workspace/v2/create/route.ts` | Surface `aesthetic_archetype` in response `context` object | Pass archetype to CC agent |
| `packages/crm/src/lib/crm/personality-images.ts` | Refactor inner search loop into `tryUnsplashSearch` helper; add Phase 2 fallback in both `resolveHeroImage` + `resolveGalleryImages`; new `pickFallbackQuery` deterministic-hash helper | Eliminate text-only heroes |
| `packages/crm/src/lib/page-blocks/persist.ts` | New `resolveOrgArchetype` helper (lazy-backfill); enforce `archetype.heroVariant` and `archetype.defaultTemplate` on hero blocks; pass `archetypeContext` through to image resolvers | Safety-net override + fallback wiring |
| `packages/crm/src/blocks/hero/SKILL.md` | Prepend Archetype→Template guidance table | Teach LLM to obey archetype |

### Created (tests)

| Path | Purpose |
|------|---------|
| `packages/crm/tests/unit/aesthetic-archetypes-fallback.spec.ts` | Registry invariants for `fallbackImageQueries` + classifier regression |
| `packages/crm/tests/unit/personality-images-archetype-fallback.spec.ts` | Phase 2 fallback behavior + `pickFallbackQuery` determinism |
| `packages/crm/tests/unit/persist-hero-archetype-enforcement.spec.ts` | Server-side override of `template` + `variant` |
| `packages/crm/tests/unit/org-theme-archetype-backfill.spec.ts` | Lazy backfill for pre-v1.54 workspaces |

### NOT modified (out of scope reminder)

- `skills/mcp-server/**` — pure backend change, no MCP version bump
- Any of the 7 hero template renderer components — we pick, not rewrite
- `lib/workspace/create-full.ts` first-render path — already archetype-correct
- DB schema files — JSONB field extension only, no migration

---

## Task 1: Extend OrgTheme with aestheticArchetype

**Files:**
- Modify: `packages/crm/src/lib/theme/types.ts`

- [ ] **Step 1: Add the optional field to OrgTheme**

Open `packages/crm/src/lib/theme/types.ts`. Find the `OrgTheme` interface (around line 27). Add the new field at the end of the interface, just before the closing brace, and add the import at the top of the file.

Add this import near the top with the other imports:

```typescript
import type { AestheticArchetypeId } from "@/lib/workspace/aesthetic-archetypes";
```

Add this field to the `OrgTheme` interface, right after the existing `motionPreset?: MotionPreset;` line:

```typescript
  /** v1.54.0 — Aesthetic archetype id chosen at workspace creation.
   *  Drives persist_block's hero template/variant enforcement and
   *  archetype-curated Unsplash fallback. Optional for backward compat:
   *  workspaces created pre-1.54 lazy-reclassify on first hero persist. */
  aestheticArchetype?: AestheticArchetypeId;
```

- [ ] **Step 2: Verify typecheck passes**

Run from repo root:

```bash
pnpm typecheck
```

Expected: typecheck completes without new errors. (Pre-existing errors unrelated to this change are fine.)

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/lib/theme/types.ts
git commit -m "feat(theme): extend OrgTheme with optional aestheticArchetype field"
```

---

## Task 2: Add fallbackImageQueries to all 7 archetypes (TDD)

**Files:**
- Create: `packages/crm/tests/unit/aesthetic-archetypes-fallback.spec.ts`
- Modify: `packages/crm/src/lib/workspace/aesthetic-archetypes.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/crm/tests/unit/aesthetic-archetypes-fallback.spec.ts` with this content:

```typescript
// Tests for the v1.54.0 fallbackImageQueries field on every aesthetic
// archetype. The field is used by personality-images.ts's Phase 2
// fallback when all LLM-generated Unsplash queries zero-result.
//
// Invariants:
//   1. Every archetype has at least 5 fallback queries
//   2. Each query is 2-4 words (broad enough to guarantee Unsplash hits,
//      narrow enough not to be useless filler)
//   3. Queries within an archetype are unique
//   4. The 7 known archetypes are still present (regression guard)
//   5. The classifier still routes plumbing/dental/medspa correctly

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  ARCHETYPES,
  classifyArchetype,
  type AestheticArchetypeId,
} from "../../src/lib/workspace/aesthetic-archetypes";

const ARCHETYPE_IDS: AestheticArchetypeId[] = [
  "editorial-warm",
  "bold-urgency",
  "clinical-trust",
  "cinematic-aspirational",
  "technical-restrained",
  "soft-residential",
  "brutalist",
];

describe("ARCHETYPES.fallbackImageQueries — invariants", () => {
  for (const id of ARCHETYPE_IDS) {
    test(`${id}: has at least 5 fallback queries`, () => {
      const archetype = ARCHETYPES[id];
      assert.ok(
        archetype.fallbackImageQueries.length >= 5,
        `${id} has ${archetype.fallbackImageQueries.length} fallbacks, expected >= 5`,
      );
    });

    test(`${id}: every fallback query is 2-4 words`, () => {
      const archetype = ARCHETYPES[id];
      for (const q of archetype.fallbackImageQueries) {
        const wordCount = q.trim().split(/\s+/).length;
        assert.ok(
          wordCount >= 2 && wordCount <= 4,
          `${id}: "${q}" has ${wordCount} words (must be 2-4)`,
        );
      }
    });

    test(`${id}: fallback queries are all unique`, () => {
      const archetype = ARCHETYPES[id];
      const set = new Set(archetype.fallbackImageQueries);
      assert.equal(
        set.size,
        archetype.fallbackImageQueries.length,
        `${id} has duplicate fallback queries`,
      );
    });
  }

  test("all 7 archetype ids are present", () => {
    for (const id of ARCHETYPE_IDS) {
      assert.ok(ARCHETYPES[id], `missing archetype: ${id}`);
    }
    assert.equal(
      Object.keys(ARCHETYPES).length,
      7,
      "exactly 7 archetypes expected",
    );
  });
});

describe("classifyArchetype regression", () => {
  test("plumbing + emergency → bold-urgency", () => {
    assert.equal(
      classifyArchetype({
        vertical: "plumbing",
        emergencyService: true,
        businessDescription: "24/7 emergency plumbing in Austin",
      }),
      "bold-urgency",
    );
  });

  test("dental → clinical-trust", () => {
    assert.equal(
      classifyArchetype({ vertical: "dental" }),
      "clinical-trust",
    );
  });

  test("medspa → cinematic-aspirational", () => {
    assert.equal(
      classifyArchetype({ vertical: "medspa" }),
      "cinematic-aspirational",
    );
  });

  test("design studio → brutalist", () => {
    assert.equal(
      classifyArchetype({
        vertical: "design studio",
        businessDescription: "creative design studio concept work",
      }),
      "brutalist",
    );
  });

  test("home cleaning → soft-residential", () => {
    assert.equal(
      classifyArchetype({ vertical: "cleaning" }),
      "soft-residential",
    );
  });

  test("unknown vertical → editorial-warm (fallback)", () => {
    assert.equal(
      classifyArchetype({ vertical: "alien massage parlor" }),
      "editorial-warm",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from repo root:

```bash
pnpm test:unit 2>&1 | grep -E "(aesthetic-archetypes-fallback|fail )" | head -20
```

Expected: TypeScript compile error like `Property 'fallbackImageQueries' does not exist on type 'AestheticArchetype'`. This proves the test is wired and fails for the right reason.

- [ ] **Step 3: Add fallbackImageQueries to the AestheticArchetype interface**

Open `packages/crm/src/lib/workspace/aesthetic-archetypes.ts`. Find the `AestheticArchetype` interface (around line 46). Add this new field at the end of the interface, just before the closing brace:

```typescript
  /** v1.54.0 — Curated Unsplash search terms verified to return non-zero
   *  results. Used as last-resort fallback by personality-images.ts when
   *  the LLM-generated query + all broadening tiers in
   *  buildQueryCandidates all return zero results. Each entry must be
   *  2-4 words: broad enough to guarantee hits, narrow enough not to be
   *  generic stock-photo filler. Picked deterministically by
   *  hash(business_name) % len so regenerate gives the same fallback. */
  fallbackImageQueries: string[];
```

- [ ] **Step 4: Populate fallbackImageQueries on all 7 archetypes**

Still in `packages/crm/src/lib/workspace/aesthetic-archetypes.ts`. For each of the 7 archetype entries in the `ARCHETYPES` const, add a `fallbackImageQueries` array. Insert each array right after the `voice` block in the corresponding archetype.

For `"editorial-warm"`:

```typescript
    fallbackImageQueries: [
      "craftsman workshop",
      "artisan hands working",
      "skilled tradesperson",
      "family workshop",
      "warm restoration project",
      "craft detail",
    ],
```

For `"bold-urgency"`:

```typescript
    fallbackImageQueries: [
      "plumber working",
      "hvac technician",
      "electrician work",
      "service truck",
      "uniform worker",
      "trade professional",
    ],
```

For `"clinical-trust"`:

```typescript
    fallbackImageQueries: [
      "modern dental office",
      "medical practice interior",
      "professional consultation",
      "doctor office reception",
      "law firm interior",
      "professional handshake",
    ],
```

For `"cinematic-aspirational"`:

```typescript
    fallbackImageQueries: [
      "luxury spa interior",
      "modern wellness studio",
      "minimalist treatment room",
      "premium fitness studio",
      "spa relaxation",
      "aesthetic beauty",
    ],
```

For `"technical-restrained"`:

```typescript
    fallbackImageQueries: [
      "modern workspace",
      "professional team meeting",
      "minimalist office",
      "design studio",
      "tech workspace",
      "professional collaboration",
    ],
```

For `"soft-residential"`:

```typescript
    fallbackImageQueries: [
      "home garden",
      "tidy modern home",
      "residential lawn",
      "clean home interior",
      "pet grooming",
      "homeowner happy",
    ],
```

For `"brutalist"`:

```typescript
    fallbackImageQueries: [
      "concrete architecture",
      "industrial design",
      "raw studio space",
      "minimalist gallery",
      "modern sculpture",
      "design exhibit",
    ],
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test:unit 2>&1 | grep -E "(aesthetic-archetypes-fallback|pass |fail )" | head -30
```

Expected: all tests in `aesthetic-archetypes-fallback.spec.ts` pass (count ≥ 28 — 7 archetypes × 3 invariants + 4 ids + 7 classifier).

- [ ] **Step 6: Commit**

```bash
git add packages/crm/src/lib/workspace/aesthetic-archetypes.ts packages/crm/tests/unit/aesthetic-archetypes-fallback.spec.ts
git commit -m "feat(archetypes): add fallbackImageQueries to all 7 archetypes"
```

---

## Task 3: Persist archetypeId on org during classification

**Files:**
- Modify: `packages/crm/src/lib/workspace/enhance-blocks.ts:1348-1376`

- [ ] **Step 1: Read the current applyOrgTheme call**

Open `packages/crm/src/lib/workspace/enhance-blocks.ts`. Find the `applyOrgTheme` block that runs after archetype classification (around line 1348-1376). Verify it currently looks like:

```typescript
  try {
    await applyOrgTheme({
      orgId: input.orgId,
      patch: {
        primaryColor: archetype.palette.primary,
        accentColor: archetype.palette.secondary,
        fontFamily: archetype.fonts.headline as OrgTheme["fontFamily"],
        mode: "light",
        borderRadius: "rounded",
        logoUrl: null,
        motionPreset: archetype.motionPreset,
      },
    });
  } catch (err) {
```

- [ ] **Step 2: Add aestheticArchetype to the patch**

In the same block, add one line inside the `patch` object, right after `motionPreset: archetype.motionPreset,`:

```typescript
        motionPreset: archetype.motionPreset,
        // v1.54.0 — persist the classified archetype id so persist_block
        // can enforce template + variant + image-fallback overrides on
        // every subsequent hero persist (including lean v2 flow's
        // CC-agent-overwrites-server scenario).
        aestheticArchetype: archetypeId,
```

- [ ] **Step 3: Verify typecheck still passes**

```bash
pnpm typecheck
```

Expected: clean (Task 1 already added the field to `OrgTheme`).

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/lib/workspace/enhance-blocks.ts
git commit -m "feat(workspace): persist aestheticArchetype on org at classification time"
```

---

## Task 4: Surface aesthetic_archetype in v2/create response

**Files:**
- Modify: `packages/crm/src/app/api/v1/workspace/v2/create/route.ts:179-197`

- [ ] **Step 1: Read the current context object**

Open `packages/crm/src/app/api/v1/workspace/v2/create/route.ts`. Find the `context` object passed back to the CC agent (around line 179). Verify it includes:

```typescript
  const context = {
    business_name: input.business_name,
    /* ...other fields... */
    public_urls: result.public_urls,
    personality_vertical: result.configured?.personality ?? null,
    timezone: result.configured?.timezone ?? null,
    theme: result.configured?.theme ?? null,
  };
```

- [ ] **Step 2: Add aesthetic_archetype to context**

Add the field at the end of the `context` object, right after `theme: result.configured?.theme ?? null,`:

```typescript
    theme: result.configured?.theme ?? null,
    // v1.54.0 — aesthetic archetype id (one of 7) so the CC agent's
    // hero block prompt can pick the right template + voice without
    // guessing from vertical alone. Server enforces this anyway in
    // persist_block, but giving it to the LLM is how the generated
    // copy ends up matching the visual treatment (urgent vs editorial).
    aesthetic_archetype: result.configured?.theme?.aestheticArchetype ?? null,
```

- [ ] **Step 3: Verify typecheck still passes**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/app/api/v1/workspace/v2/create/route.ts
git commit -m "feat(v2/create): surface aesthetic_archetype in response context"
```

---

## Task 5: Add Phase 2 fallback to resolveHeroImage (TDD)

**Files:**
- Create: `packages/crm/tests/unit/personality-images-archetype-fallback.spec.ts`
- Modify: `packages/crm/src/lib/crm/personality-images.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/crm/tests/unit/personality-images-archetype-fallback.spec.ts`:

```typescript
// Tests for v1.54.0 archetype-curated Unsplash fallback.
//
// Phase 1 (existing behavior): LLM-generated query + 3-tier broadening.
// Phase 2 (NEW): when all Phase 1 candidates return zero results AND
// caller provided archetypeContext, try archetype.fallbackImageQueries
// picked deterministically by hash(business_name) % len.

import { describe, test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  resolveHeroImage,
  __setUnsplashFetchForTest,
  __resetUnsplashFetchForTest,
  pickFallbackQuery,
} from "../../src/lib/crm/personality-images";

// Build a fake Unsplash search response with N results, mimicking the
// real API shape just enough for the resolver to extract urls + id +
// download_location + photographer attribution.
function fakeSearchResponse(count: number, queryEcho: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      results: Array.from({ length: count }).map((_, i) => ({
        id: `${queryEcho}-${i}`,
        urls: { raw: `https://example.com/${queryEcho}-${i}.jpg` },
        links: { download_location: `https://example.com/dl/${queryEcho}-${i}` },
        user: {
          name: "Test Photographer",
          username: "testphotog",
          links: { html: "https://example.com/photog" },
        },
      })),
    }),
  };
}

function fakeZeroResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({ results: [] }),
  };
}

before(() => {
  process.env.UNSPLASH_ACCESS_KEY = "test-key";
});

after(() => {
  delete process.env.UNSPLASH_ACCESS_KEY;
  __resetUnsplashFetchForTest();
});

beforeEach(() => {
  __resetUnsplashFetchForTest();
});

describe("pickFallbackQuery — determinism + distribution", () => {
  test("same input → same output", () => {
    const a = pickFallbackQuery("bold-urgency", "Mr Rooter Plumbing");
    const b = pickFallbackQuery("bold-urgency", "Mr Rooter Plumbing");
    assert.equal(a, b);
  });

  test("different business names produce at least 2 distinct fallbacks", () => {
    const picks = new Set([
      pickFallbackQuery("bold-urgency", "Mr Rooter Plumbing"),
      pickFallbackQuery("bold-urgency", "Joe's HVAC Service"),
      pickFallbackQuery("bold-urgency", "Quigley Air Conditioning"),
      pickFallbackQuery("bold-urgency", "Acme Electrical"),
    ]);
    assert.ok(
      picks.size >= 2,
      `expected >= 2 distinct picks, got ${picks.size}: ${[...picks].join(", ")}`,
    );
  });

  test("returns a query that exists in the archetype's fallbackImageQueries", () => {
    const pick = pickFallbackQuery("clinical-trust", "Smile Dental");
    // Import here to assert membership.
    const { ARCHETYPES } = require("../../src/lib/workspace/aesthetic-archetypes");
    assert.ok(
      ARCHETYPES["clinical-trust"].fallbackImageQueries.includes(pick),
      `${pick} not in clinical-trust fallbacks`,
    );
  });
});

describe("resolveHeroImage — Phase 1 succeeds, Phase 2 never fires", () => {
  test("returns LLM query result when Phase 1 hits", async () => {
    const calls: string[] = [];
    __setUnsplashFetchForTest(async (url: string) => {
      calls.push(url);
      return fakeSearchResponse(3, "plumber");
    });

    const result = await resolveHeroImage("emergency plumber", {
      archetype: "bold-urgency",
      businessName: "Mr Rooter",
    });

    assert.ok(result);
    assert.match(result!.url, /plumber-0\.jpg/);
    // Phase 2 should NOT have fired — only Phase 1 query.
    assert.equal(calls.length, 1, `expected 1 call, got ${calls.length}`);
  });
});

describe("resolveHeroImage — Phase 1 all-zero, no archetype context", () => {
  test("returns null (preserves existing behavior)", async () => {
    __setUnsplashFetchForTest(async () => fakeZeroResponse());

    const result = await resolveHeroImage("asphalt shingle residential roof");
    assert.equal(result, null);
  });
});

describe("resolveHeroImage — Phase 1 all-zero, with archetype context, Phase 2 fires", () => {
  test("fires fallback query and returns result", async () => {
    const queries: string[] = [];
    __setUnsplashFetchForTest(async (url: string) => {
      const match = url.match(/query=([^&]+)/);
      const query = match ? decodeURIComponent(match[1]) : "";
      queries.push(query);
      // Phase 1 candidates zero-result; Phase 2 fallback succeeds.
      if (query.startsWith("asphalt") || query.startsWith("shingle") || query === "residential roof") {
        return fakeZeroResponse();
      }
      return fakeSearchResponse(5, "fallback");
    });

    const result = await resolveHeroImage("asphalt shingle residential roof", {
      archetype: "bold-urgency",
      businessName: "Mr Rooter",
    });

    assert.ok(result, "Phase 2 should have returned a result");
    assert.match(result!.url, /fallback-0\.jpg/);
    // Phase 1: 3 candidates. Phase 2: 1 fallback query. Total = 4.
    assert.equal(queries.length, 4, `expected 4 queries (3 Phase 1 + 1 Phase 2), got ${queries.length}: ${queries.join(" | ")}`);
    // The last query should be a known bold-urgency fallback.
    const { ARCHETYPES } = require("../../src/lib/workspace/aesthetic-archetypes");
    assert.ok(
      ARCHETYPES["bold-urgency"].fallbackImageQueries.includes(queries[3]),
      `last query "${queries[3]}" should be a bold-urgency fallback`,
    );
  });
});

describe("resolveHeroImage — no UNSPLASH_ACCESS_KEY", () => {
  test("returns null without making any API calls", async () => {
    delete process.env.UNSPLASH_ACCESS_KEY;
    let called = false;
    __setUnsplashFetchForTest(async () => {
      called = true;
      return fakeZeroResponse();
    });

    const result = await resolveHeroImage("anything", {
      archetype: "bold-urgency",
      businessName: "Mr Rooter",
    });

    assert.equal(result, null);
    assert.equal(called, false);
    process.env.UNSPLASH_ACCESS_KEY = "test-key"; // restore for next test
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:unit 2>&1 | grep -E "(personality-images-archetype-fallback|fail )" | head -10
```

Expected: TypeScript errors like `Property '__setUnsplashFetchForTest' does not exist` and `Property 'pickFallbackQuery' does not exist`. These prove the test is wired to detect missing implementation.

- [ ] **Step 3: Refactor personality-images.ts to introduce the fetch test seam + pickFallbackQuery**

Open `packages/crm/src/lib/crm/personality-images.ts`. Near the top of the file (after the existing imports), add:

```typescript
import { ARCHETYPES, type AestheticArchetypeId } from "@/lib/workspace/aesthetic-archetypes";

// Test seam: production uses globalThis.fetch. Tests override via
// __setUnsplashFetchForTest. Doing it module-scope keeps the fast-path
// production call free of indirection.
type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;
let unsplashFetch: FetchFn = (url, init) => fetch(url, init) as Promise<Response>;

export function __setUnsplashFetchForTest(fn: FetchFn): void {
  unsplashFetch = fn;
}

export function __resetUnsplashFetchForTest(): void {
  unsplashFetch = (url, init) => fetch(url, init) as Promise<Response>;
}

/**
 * v1.54.0 — Deterministic fallback query picker. Same business name
 * always selects the same fallback query (so regenerate doesn't roll
 * the dice on operator iteration). djb2-style hash.
 */
export function pickFallbackQuery(
  archetype: AestheticArchetypeId,
  businessName: string,
): string {
  const fallbacks = ARCHETYPES[archetype].fallbackImageQueries;
  if (fallbacks.length === 0) return "professional business";
  let hash = 5381;
  for (let i = 0; i < businessName.length; i++) {
    hash = ((hash << 5) + hash + businessName.charCodeAt(i)) | 0;
  }
  return fallbacks[Math.abs(hash) % fallbacks.length];
}
```

- [ ] **Step 4: Route the existing fetch call through the test seam**

In `personality-images.ts`, find the `searchUnsplash` function (around line 327). Replace `fetch(` with `unsplashFetch(` so the test seam is honored. The function should now read:

```typescript
async function searchUnsplash(
  query: string,
  apiKey: string,
  opts: { perPage: number; orientation: "landscape" | "squarish" },
): Promise<UnsplashSearchResult[] | null> {
  const response = await unsplashFetch(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
      query,
    )}&per_page=${opts.perPage}&orientation=${opts.orientation}&content_filter=low`,
    {
      headers: {
        Authorization: `Client-ID ${apiKey}`,
        "Accept-Version": "v1",
      },
    },
  );
  if (!response.ok) {
```

Also find any other `fetch(` calls in this file (the `trackUnsplashDownload` function may have one — leave that as `fetch(` since the test doesn't exercise it).

- [ ] **Step 5: Modify resolveHeroImage to add Phase 2 fallback**

In `personality-images.ts`, find `resolveHeroImage` (around line 435). Replace its body with the Phase 2-aware version:

```typescript
export async function resolveHeroImage(
  query: string,
  archetypeContext?: { archetype: AestheticArchetypeId; businessName: string },
): Promise<ResolvedUnsplashImage | null> {
  const cleanedQuery = query?.trim() || "professional business interior";
  const apiKey = process.env.UNSPLASH_ACCESS_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  const candidates = buildQueryCandidates(cleanedQuery);

  // Phase 1 — LLM-generated query + broadenings (existing behavior).
  for (const candidate of candidates) {
    const result = await tryHeroUnsplashFetch(candidate, apiKey);
    if (result) return result;
  }

  // Phase 2 — v1.54.0 — archetype-curated fallback. Only fires when
  // caller provided archetypeContext AND Phase 1 returned no usable
  // image. The fallback query is picked deterministically so regenerate
  // gives the same image (operator-iteration story).
  if (archetypeContext) {
    const fallbackQuery = pickFallbackQuery(
      archetypeContext.archetype,
      archetypeContext.businessName,
    );
    console.warn(
      JSON.stringify({
        event: "unsplash_archetype_fallback_used",
        original_query: query,
        archetype: archetypeContext.archetype,
        fallback_query: fallbackQuery,
      }),
    );
    const result = await tryHeroUnsplashFetch(fallbackQuery, apiKey);
    if (result) return result;
  }

  return null;
}

// Inner search-and-pick logic, extracted so resolveHeroImage's Phase 1
// loop and Phase 2 fallback path share the same try/zero/throw handling.
async function tryHeroUnsplashFetch(
  candidate: string,
  apiKey: string,
): Promise<ResolvedUnsplashImage | null> {
  try {
    const results = await searchUnsplash(candidate, apiKey, {
      perPage: 15,
      orientation: "landscape",
    });
    if (!results) return null; // API error — try next candidate
    if (results.length === 0) {
      console.warn(
        JSON.stringify({
          event: "unsplash_api_zero_results",
          query: candidate,
        }),
      );
      return null;
    }
    const picked = pickBestHeroResult(results);
    const raw = picked?.urls?.raw ?? picked?.urls?.full;
    if (raw && picked) {
      if (picked.links?.download_location) {
        trackUnsplashDownload(picked.links.download_location, apiKey);
      }
      return {
        url: `${raw}${raw.includes("?") ? "&" : "?"}${HERO_QUERY_PARAMS}`,
        attribution: buildAttribution(picked),
      };
    }
    return null;
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "unsplash_api_throw",
        query: candidate,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
pnpm test:unit 2>&1 | grep -E "(personality-images-archetype-fallback|pass |fail )" | head -25
```

Expected: all tests in `personality-images-archetype-fallback.spec.ts` pass (count: 6 — determinism, distribution, membership, Phase 1 hit, Phase 1 all-zero no-context, Phase 1 all-zero with-context, no-API-key).

- [ ] **Step 7: Commit**

```bash
git add packages/crm/src/lib/crm/personality-images.ts packages/crm/tests/unit/personality-images-archetype-fallback.spec.ts
git commit -m "feat(personality-images): add Phase 2 archetype-curated Unsplash fallback for hero"
```

---

## Task 6: Add Phase 2 fallback to resolveGalleryImages

**Files:**
- Modify: `packages/crm/src/lib/crm/personality-images.ts:522-585`
- Modify: `packages/crm/tests/unit/personality-images-archetype-fallback.spec.ts`

- [ ] **Step 1: Add the failing gallery test**

Open `packages/crm/tests/unit/personality-images-archetype-fallback.spec.ts`. At the end of the file, add this new describe block:

```typescript
describe("resolveGalleryImages — Phase 2 per zero-result slot", () => {
  test("LLM queries succeed → no Phase 2", async () => {
    const { resolveGalleryImages } = await import("../../src/lib/crm/personality-images");
    __setUnsplashFetchForTest(async (url: string) => {
      const match = url.match(/query=([^&]+)/);
      const query = match ? decodeURIComponent(match[1]) : "";
      return fakeSearchResponse(5, query.replace(/\s+/g, "-"));
    });

    const results = await resolveGalleryImages(
      ["dental crown", "dental cleaning", "dental implant"],
      { archetype: "clinical-trust", businessName: "Smile Dental" },
    );
    assert.equal(results.length, 3);
  });

  test("All LLM queries zero-result → Phase 2 fills each slot", async () => {
    const { resolveGalleryImages } = await import("../../src/lib/crm/personality-images");
    const seenQueries: string[] = [];
    __setUnsplashFetchForTest(async (url: string) => {
      const match = url.match(/query=([^&]+)/);
      const query = match ? decodeURIComponent(match[1]) : "";
      seenQueries.push(query);
      // Specific LLM queries zero-result; broad fallbacks succeed.
      const { ARCHETYPES } = require("../../src/lib/workspace/aesthetic-archetypes");
      const isFallback = ARCHETYPES["clinical-trust"].fallbackImageQueries.includes(query);
      return isFallback ? fakeSearchResponse(5, query.replace(/\s+/g, "-")) : fakeZeroResponse();
    });

    const results = await resolveGalleryImages(
      ["super specific dental crown procedure", "minimally invasive dental cleaning"],
      { archetype: "clinical-trust", businessName: "Smile Dental" },
    );
    assert.equal(results.length, 2, "both slots should have been filled via Phase 2");
  });

  test("No archetypeContext → Phase 2 skipped, slots stay empty (existing behavior)", async () => {
    const { resolveGalleryImages } = await import("../../src/lib/crm/personality-images");
    __setUnsplashFetchForTest(async () => fakeZeroResponse());

    const results = await resolveGalleryImages(["something nonexistent"]);
    assert.equal(results.length, 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:unit 2>&1 | grep -E "(personality-images-archetype-fallback|fail )" | head -15
```

Expected: TypeScript error on `resolveGalleryImages` signature (won't accept the second arg yet) OR test failures showing 0 results when 2 expected.

- [ ] **Step 3: Modify resolveGalleryImages to accept archetypeContext and fire Phase 2**

Open `packages/crm/src/lib/crm/personality-images.ts`. Find `resolveGalleryImages` (around line 522). Replace its signature + body:

```typescript
export async function resolveGalleryImages(
  queries: string[],
  archetypeContext?: { archetype: AestheticArchetypeId; businessName: string },
): Promise<ResolvedUnsplashImage[]> {
  if (queries.length === 0) return [];
  const apiKey = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!apiKey) {
    return [];
  }

  const seenIds = new Set<string>();
  const out: ResolvedUnsplashImage[] = [];

  for (let slotIdx = 0; slotIdx < queries.length; slotIdx++) {
    const query = queries[slotIdx];
    const cleaned = query?.trim() || "professional business";

    let resolved = false;

    // Phase 1 — try LLM-generated query + broadenings.
    const candidates = buildQueryCandidates(cleaned);
    for (const candidate of candidates) {
      const picked = await tryGalleryUnsplashFetch(candidate, apiKey, seenIds);
      if (picked) {
        out.push(picked);
        resolved = true;
        break;
      }
    }

    // Phase 2 — v1.54.0 — archetype-curated fallback. Index-based picking
    // (NOT hash) so 6 services don't all land on the same fallback photo
    // when their queries all zero-result. Modulo over the fallback array.
    if (!resolved && archetypeContext) {
      const fallbacks = ARCHETYPES[archetypeContext.archetype].fallbackImageQueries;
      const fallbackQuery = fallbacks[slotIdx % fallbacks.length];
      console.warn(
        JSON.stringify({
          event: "unsplash_archetype_fallback_used",
          original_query: cleaned,
          archetype: archetypeContext.archetype,
          fallback_query: fallbackQuery,
          context: "gallery",
        }),
      );
      const picked = await tryGalleryUnsplashFetch(fallbackQuery, apiKey, seenIds);
      if (picked) out.push(picked);
    }
  }

  return out;
}

// Gallery-specific inner search: squarish orientation, perPage 10,
// dedupes by photo id (shared seenIds set passed by caller).
async function tryGalleryUnsplashFetch(
  candidate: string,
  apiKey: string,
  seenIds: Set<string>,
): Promise<ResolvedUnsplashImage | null> {
  try {
    const results = await searchUnsplash(candidate, apiKey, {
      perPage: 10,
      orientation: "squarish",
    });
    if (!results) return null;
    if (results.length === 0) {
      console.warn(
        JSON.stringify({
          event: "unsplash_gallery_zero_results",
          query: candidate,
        }),
      );
      return null;
    }
    const fresh = results.find((r) => r.id && !seenIds.has(r.id));
    const raw = fresh?.urls?.raw ?? fresh?.urls?.full;
    if (raw && fresh?.id) {
      seenIds.add(fresh.id);
      if (fresh.links?.download_location) {
        trackUnsplashDownload(fresh.links.download_location, apiKey);
      }
      return {
        url: `${raw}${raw.includes("?") ? "&" : "?"}${GALLERY_QUERY_PARAMS}`,
        attribution: buildAttribution(fresh),
      };
    }
    return null;
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "unsplash_gallery_throw",
        query: candidate,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test:unit 2>&1 | grep -E "(personality-images-archetype-fallback|pass |fail )" | head -30
```

Expected: all tests in `personality-images-archetype-fallback.spec.ts` pass (count: 9 — original 6 + new 3 gallery tests).

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/crm/personality-images.ts packages/crm/tests/unit/personality-images-archetype-fallback.spec.ts
git commit -m "feat(personality-images): add Phase 2 archetype fallback for gallery"
```

---

## Task 7: Add resolveOrgArchetype helper + lazy backfill (TDD)

**Files:**
- Create: `packages/crm/tests/unit/org-theme-archetype-backfill.spec.ts`
- Modify: `packages/crm/src/lib/page-blocks/persist.ts` (add helper, no usage yet)

- [ ] **Step 1: Read the existing imports in persist.ts**

Open `packages/crm/src/lib/page-blocks/persist.ts`. Note the existing imports near the top — you'll add to them in Step 3.

- [ ] **Step 2: Write the failing test**

Create `packages/crm/tests/unit/org-theme-archetype-backfill.spec.ts`:

```typescript
// Tests for v1.54.0 lazy backfill of org.theme.aestheticArchetype.
//
// Pre-v1.54 workspaces have a theme JSONB without aestheticArchetype.
// resolveOrgArchetype must:
//   1. Use org.theme.aestheticArchetype when present (no DB write)
//   2. Re-classify from soul fields + patch theme when absent
//   3. Be idempotent: second call after backfill reads from theme directly

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveOrgArchetype,
} from "../../src/lib/page-blocks/persist";
import type { OrgTheme } from "../../src/lib/theme/types";
import type { OrgSoul } from "../../src/lib/soul/types";

// In-memory "DB" — captures writes so the test can assert the lazy
// backfill happened. The real resolveOrgArchetype takes a DB-write
// callback as its third arg (extracted for testability).

describe("resolveOrgArchetype — happy path (archetype already in theme)", () => {
  test("returns stored archetypeId without writing", async () => {
    const theme: OrgTheme = {
      primaryColor: "#000",
      accentColor: "#fff",
      fontFamily: "Geist",
      mode: "light",
      borderRadius: "rounded",
      logoUrl: null,
      aestheticArchetype: "bold-urgency",
    };
    let writeCount = 0;
    const id = await resolveOrgArchetype(
      "ws-1",
      { theme, soul: null, name: "Mr Rooter" },
      async () => {
        writeCount++;
      },
    );
    assert.equal(id, "bold-urgency");
    assert.equal(writeCount, 0, "no write expected when archetype already present");
  });
});

describe("resolveOrgArchetype — lazy backfill", () => {
  test("re-classifies from soul + patches theme when archetype absent", async () => {
    const theme: OrgTheme = {
      primaryColor: "#000",
      accentColor: "#fff",
      fontFamily: "Geist",
      mode: "light",
      borderRadius: "rounded",
      logoUrl: null,
      // aestheticArchetype absent — pre-v1.54 shape
    };
    const soul = {
      personality_vertical: "plumbing",
      emergency_service: true,
      same_day: null,
      review_rating: null,
      review_count: null,
      business_description: "24/7 emergency plumbing in Austin",
    } as unknown as OrgSoul;

    let writeCalledWith: { theme: OrgTheme } | null = null;
    const id = await resolveOrgArchetype(
      "ws-2",
      { theme, soul, name: "Mr Rooter" },
      async (patch) => {
        writeCalledWith = patch;
      },
    );
    assert.equal(id, "bold-urgency");
    assert.ok(writeCalledWith, "lazy backfill should have written");
    assert.equal(writeCalledWith!.theme.aestheticArchetype, "bold-urgency");
  });

  test("falls back to editorial-warm when soul is null", async () => {
    const theme: OrgTheme = {
      primaryColor: "#000",
      accentColor: "#fff",
      fontFamily: "Geist",
      mode: "light",
      borderRadius: "rounded",
      logoUrl: null,
    };
    let writeCalled = false;
    const id = await resolveOrgArchetype(
      "ws-3",
      { theme, soul: null, name: "Unknown Biz" },
      async () => {
        writeCalled = true;
      },
    );
    // classifyArchetype's catch-all is editorial-warm
    assert.equal(id, "editorial-warm");
    assert.ok(writeCalled);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm test:unit 2>&1 | grep -E "(org-theme-archetype-backfill|fail )" | head -10
```

Expected: import error `'resolveOrgArchetype' is not exported`. Proves test is wired.

- [ ] **Step 4: Add resolveOrgArchetype to persist.ts**

Open `packages/crm/src/lib/page-blocks/persist.ts`. Add to the imports near the top:

```typescript
import {
  ARCHETYPES,
  classifyArchetype,
  type AestheticArchetypeId,
} from "@/lib/workspace/aesthetic-archetypes";
import type { OrgTheme } from "@/lib/theme/types";
import type { OrgSoul } from "@/lib/soul/types";
```

Then, near the top of the file (above `persistPageBlock` or alongside the other module-scope helpers), add:

```typescript
/**
 * v1.54.0 — Resolves the aesthetic archetype for an org, with lazy
 * backfill for workspaces created before v1.54 (whose theme JSONB
 * lacks aestheticArchetype).
 *
 * Happy path: returns org.theme.aestheticArchetype, no DB write.
 * Backfill: re-classifies from soul + writes patched theme via the
 * dbUpdate callback, returns the freshly classified id.
 *
 * dbUpdate is injected for testability — the real callsite passes a
 * closure over db.update(organizations).
 */
export async function resolveOrgArchetype(
  workspaceId: string,
  org: { theme: OrgTheme; soul: OrgSoul | null; name: string },
  dbUpdate: (patch: { theme: OrgTheme }) => Promise<void>,
): Promise<AestheticArchetypeId> {
  if (org.theme.aestheticArchetype) {
    return org.theme.aestheticArchetype;
  }

  // Lazy backfill — re-classify from soul + patch theme so subsequent
  // persists read from theme directly.
  const reclassified = classifyArchetype({
    vertical: org.soul?.personality_vertical ?? "",
    emergencyService: org.soul?.emergency_service ?? null,
    sameDay: org.soul?.same_day ?? null,
    reviewRating: org.soul?.review_rating ?? null,
    reviewCount: org.soul?.review_count ?? null,
    businessDescription: org.soul?.business_description ?? null,
  });

  console.warn(
    JSON.stringify({
      event: "org_archetype_lazy_backfilled",
      workspace_id: workspaceId,
      archetype: reclassified,
    }),
  );

  await dbUpdate({
    theme: { ...org.theme, aestheticArchetype: reclassified },
  });

  return reclassified;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test:unit 2>&1 | grep -E "(org-theme-archetype-backfill|pass |fail )" | head -15
```

Expected: all 3 tests in `org-theme-archetype-backfill.spec.ts` pass.

- [ ] **Step 6: Commit**

```bash
git add packages/crm/src/lib/page-blocks/persist.ts packages/crm/tests/unit/org-theme-archetype-backfill.spec.ts
git commit -m "feat(persist): add resolveOrgArchetype helper with lazy backfill"
```

---

## Task 8: Wire archetype enforcement into persistPageBlock (TDD)

**Files:**
- Create: `packages/crm/tests/unit/persist-hero-archetype-enforcement.spec.ts`
- Modify: `packages/crm/src/lib/page-blocks/persist.ts`

This task wires the archetype lookup into the actual hero-block persist path, overriding template and variant + threading archetypeContext into the image resolvers.

- [ ] **Step 1: Write the failing test**

Create `packages/crm/tests/unit/persist-hero-archetype-enforcement.spec.ts`:

```typescript
// Tests for v1.54.0 server-side enforcement of archetype-correct
// hero template + variant in persist_block.
//
// The CC agent's LLM may pick the wrong template (e.g. "viktor-light"
// for a bold-urgency plumbing workspace). persist_block must:
//   1. Resolve archetype from org.theme.aestheticArchetype
//   2. Override hero's `template` and `variant` server-side
//   3. Emit observability events when override fires
//
// This is a pure unit test of the override decision logic, extracted
// into a pure function (enforceArchetypeOnHero) so we don't need a
// real DB to test it.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  enforceArchetypeOnHero,
  type HeroEnforcementInput,
} from "../../src/lib/page-blocks/persist";

describe("enforceArchetypeOnHero — bold-urgency forces empty template + split-screen variant", () => {
  test("LLM picked viktor-light → override to empty template", () => {
    const input: HeroEnforcementInput = {
      workspaceId: "ws-1",
      archetypeId: "bold-urgency",
      llmTemplate: "viktor-light",
      llmVariant: "full-bleed",
    };
    const result = enforceArchetypeOnHero(input);
    assert.equal(result.finalTemplate, "");
    assert.equal(result.finalVariant, "split-screen-50-50");
    assert.ok(result.templateOverridden);
    assert.ok(result.variantOverridden);
  });

  test("LLM picked empty (correct) → no override", () => {
    const input: HeroEnforcementInput = {
      workspaceId: "ws-1",
      archetypeId: "bold-urgency",
      llmTemplate: "",
      llmVariant: "split-screen-50-50",
    };
    const result = enforceArchetypeOnHero(input);
    assert.equal(result.finalTemplate, "");
    assert.equal(result.finalVariant, "split-screen-50-50");
    assert.equal(result.templateOverridden, false);
    assert.equal(result.variantOverridden, false);
  });
});

describe("enforceArchetypeOnHero — clinical-trust forces nexora-light + left-aligned-asymmetric", () => {
  test("LLM picked viktor-light → override to nexora-light", () => {
    const input: HeroEnforcementInput = {
      workspaceId: "ws-2",
      archetypeId: "clinical-trust",
      llmTemplate: "viktor-light",
      llmVariant: "founder-portrait",
    };
    const result = enforceArchetypeOnHero(input);
    assert.equal(result.finalTemplate, "nexora-light");
    assert.equal(result.finalVariant, "left-aligned-asymmetric");
    assert.ok(result.templateOverridden);
  });

  test("LLM picked nexora-light (correct) → no override", () => {
    const input: HeroEnforcementInput = {
      workspaceId: "ws-2",
      archetypeId: "clinical-trust",
      llmTemplate: "nexora-light",
      llmVariant: "left-aligned-asymmetric",
    };
    const result = enforceArchetypeOnHero(input);
    assert.equal(result.finalTemplate, "nexora-light");
    assert.equal(result.templateOverridden, false);
  });
});

describe("enforceArchetypeOnHero — cinematic-aspirational forces cinematic-aura", () => {
  test("LLM picked anything → override to cinematic-aura", () => {
    const input: HeroEnforcementInput = {
      workspaceId: "ws-3",
      archetypeId: "cinematic-aspirational",
      llmTemplate: "stellar-tabs-white",
      llmVariant: "full-bleed",
    };
    const result = enforceArchetypeOnHero(input);
    assert.equal(result.finalTemplate, "cinematic-aura");
    assert.equal(result.finalVariant, "cinematic-aura");
    assert.ok(result.templateOverridden);
    assert.ok(result.variantOverridden);
  });
});

describe("enforceArchetypeOnHero — unknown template treated as overridable", () => {
  test("LLM picked garbage → override to archetype default", () => {
    const input: HeroEnforcementInput = {
      workspaceId: "ws-4",
      archetypeId: "editorial-warm",
      llmTemplate: "totally-invalid-template-id",
      llmVariant: "split-image-right",
    };
    const result = enforceArchetypeOnHero(input);
    assert.equal(result.finalTemplate, "viktor-light");
    assert.ok(result.templateOverridden);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:unit 2>&1 | grep -E "(persist-hero-archetype-enforcement|fail )" | head -10
```

Expected: import error `'enforceArchetypeOnHero' is not exported`. Proves test is wired.

- [ ] **Step 3: Add enforceArchetypeOnHero to persist.ts**

Open `packages/crm/src/lib/page-blocks/persist.ts`. After `resolveOrgArchetype` (added in Task 7), add this exported helper:

```typescript
const KNOWN_TEMPLATES = new Set([
  "cinematic-aura",
  "viktor-light",
  "velorah-editorial",
  "nexora-light",
  "securify-bold",
  "stellar-tabs-white",
]);

export interface HeroEnforcementInput {
  workspaceId: string;
  archetypeId: AestheticArchetypeId;
  /** What the CC agent's LLM put in the `template` prop (may be empty,
   *  undefined, or invalid). */
  llmTemplate: string | undefined;
  /** What the CC agent's LLM put in the `variant` prop. */
  llmVariant: string | undefined;
}

export interface HeroEnforcementResult {
  /** Final template id to write into landing_pages.sections. */
  finalTemplate: string;
  /** Final variant to write. */
  finalVariant: string;
  /** True iff finalTemplate ≠ what the LLM picked. */
  templateOverridden: boolean;
  /** True iff finalVariant ≠ what the LLM picked. */
  variantOverridden: boolean;
}

/**
 * v1.54.0 — Pure decision function: given archetype + LLM picks, decide
 * the final template + variant. Trust the LLM ONLY when it agrees with
 * the archetype's defaults. Otherwise override to archetype defaults.
 *
 * Logging happens in the caller using the boolean flags returned here.
 */
export function enforceArchetypeOnHero(
  input: HeroEnforcementInput,
): HeroEnforcementResult {
  const archetype = ARCHETYPES[input.archetypeId];
  const llmTemplate = input.llmTemplate ?? "";
  const llmVariant = input.llmVariant ?? "";

  // Template: trust LLM only when it picked a known template that
  // matches the archetype's default. Empty string also "matches" when
  // archetype.defaultTemplate is "".
  const llmTemplateValid =
    llmTemplate === "" || KNOWN_TEMPLATES.has(llmTemplate);
  const templateAgrees =
    llmTemplateValid && llmTemplate === archetype.defaultTemplate;
  const finalTemplate = templateAgrees ? llmTemplate : archetype.defaultTemplate;

  // Variant: trust LLM only when it exactly matches archetype.heroVariant.
  const variantAgrees = llmVariant === archetype.heroVariant;
  const finalVariant = variantAgrees ? llmVariant : archetype.heroVariant;

  return {
    finalTemplate,
    finalVariant,
    templateOverridden: !templateAgrees,
    variantOverridden: !variantAgrees,
  };
}
```

- [ ] **Step 4: Run unit tests to verify they pass**

```bash
pnpm test:unit 2>&1 | grep -E "(persist-hero-archetype-enforcement|pass |fail )" | head -15
```

Expected: all 6 tests in `persist-hero-archetype-enforcement.spec.ts` pass.

- [ ] **Step 5: Wire enforcement into the actual persistLandingSectionBlock flow**

Open `packages/crm/src/lib/page-blocks/persist.ts`. Find the function that handles landing-section blocks — search for `if (blockName === "hero" && section.type === "hero")` (around line 251). The block today loads image queries from the validated props. We need to inject:
1. Load the org (theme + soul + name) so we can resolve archetype
2. Run `enforceArchetypeOnHero` to compute overrides
3. Mutate `section.variant`, `validatedProps.template` before downstream code reads them
4. Pass `archetypeContext` into `resolveHeroImage`

First, just before that hero-specific block (search for `if (blockName === "hero" && section.type === "hero") {`), add the archetype-resolve step:

```typescript
  // v1.54.0 — Resolve archetype for hero blocks BEFORE image resolution
  // and section construction so we can (a) override template/variant
  // server-side and (b) thread archetypeContext into resolveHeroImage's
  // Phase 2 fallback.
  let heroArchetypeContext:
    | { archetype: AestheticArchetypeId; businessName: string }
    | undefined = undefined;
  if (blockName === "hero" && section.type === "hero") {
    const [org] = await db
      .select({
        name: organizations.name,
        theme: organizations.theme,
        soul: organizations.soul,
      })
      .from(organizations)
      .where(eq(organizations.id, workspaceId))
      .limit(1);
    if (org) {
      const archetypeId = await resolveOrgArchetype(
        workspaceId,
        { theme: org.theme, soul: org.soul, name: org.name },
        async (patch) => {
          await db
            .update(organizations)
            .set({ theme: patch.theme })
            .where(eq(organizations.id, workspaceId));
        },
      );
      heroArchetypeContext = {
        archetype: archetypeId,
        businessName: org.name,
      };

      // Server-side enforcement of template + variant.
      const enforcement = enforceArchetypeOnHero({
        workspaceId,
        archetypeId,
        llmTemplate: (validatedProps as { template?: string }).template,
        llmVariant: section.variant,
      });
      if (enforcement.templateOverridden) {
        console.warn(
          JSON.stringify({
            event: "hero_template_overridden",
            workspace_id: workspaceId,
            archetype: archetypeId,
            llm_picked: (validatedProps as { template?: string }).template ?? "",
            archetype_default: enforcement.finalTemplate,
          }),
        );
      }
      if (enforcement.variantOverridden) {
        console.warn(
          JSON.stringify({
            event: "hero_variant_overridden",
            workspace_id: workspaceId,
            archetype: archetypeId,
            llm_picked: section.variant ?? "",
            archetype_default: enforcement.finalVariant,
          }),
        );
      }
      // Mutate downstream inputs to use the enforced values.
      (validatedProps as { template?: string }).template = enforcement.finalTemplate || undefined;
      section = { ...section, variant: enforcement.finalVariant as typeof section.variant };
    }
  }
```

- [ ] **Step 6: Pass archetypeContext to resolveHeroImage**

Still in `persist.ts`. Find the existing call to `resolveHeroImage(imageQuery)` (inside the same hero block, around line 264). Replace with:

```typescript
      imageQuery ? resolveHeroImage(imageQuery, heroArchetypeContext) : Promise.resolve(null),
```

Also find the legacy fallback call to `resolveHeroImageUrlForQuery(imageQuery)` a few lines down. Leave it as-is — it's a `null`-only safety net and the Phase 2 fallback already fired in the main path.

- [ ] **Step 7: Run typecheck + tests**

```bash
pnpm typecheck && pnpm test:unit 2>&1 | grep -E "(persist-hero-archetype-enforcement|pass |fail )" | tail -10
```

Expected: typecheck clean; all enforcement tests still pass.

- [ ] **Step 8: Commit**

```bash
git add packages/crm/src/lib/page-blocks/persist.ts packages/crm/tests/unit/persist-hero-archetype-enforcement.spec.ts
git commit -m "feat(persist): server-enforce archetype template + variant on hero blocks"
```

---

## Task 9: Thread archetypeContext through enhance-blocks image resolvers

**Files:**
- Modify: `packages/crm/src/lib/workspace/enhance-blocks.ts:926-934`

The v1 first-render path (enhance-blocks → payloadToSections) calls `resolveHeroImage` and `resolveGalleryImages` WITHOUT archetypeContext today, so the Phase 2 fallback never fires there. Same line, four-token fix per call.

- [ ] **Step 1: Confirm the call site and archetype scope**

```bash
grep -n "resolveHeroImage\|resolveGalleryImages" packages/crm/src/lib/workspace/enhance-blocks.ts | head -10
```

Expected: lines around 927 (`resolveHeroImage(heroImageQuery)`) and 932 (`resolveGalleryImages(galleryQueries)`), both inside `payloadToSections` which receives `archetype: AestheticArchetype` and `input: { business_name: string; ... }` as parameters.

- [ ] **Step 2: Pass archetypeContext into both calls**

Open `packages/crm/src/lib/workspace/enhance-blocks.ts`. Find the `Promise.allSettled` block around line 926. Replace it with:

```typescript
  const archetypeContext = {
    archetype: archetype.id,
    businessName: input.business_name,
  };

  const [heroImageSettled, heroVideoSettled, gallerySettled] = await Promise.allSettled([
    heroImageQuery ? resolveHeroImage(heroImageQuery, archetypeContext) : Promise.resolve(null),
    wantsCinematicVideo && heroVideoQuery
      ? searchPexelsVideo(heroVideoQuery, { orientation: "landscape", size: "medium" })
      : Promise.resolve(null),
    galleryQueries.length > 0
      ? resolveGalleryImages(galleryQueries, archetypeContext)
      : Promise.resolve([] as Awaited<ReturnType<typeof resolveGalleryImages>>),
  ]);
```

- [ ] **Step 3: Verify typecheck + tests still pass**

```bash
pnpm typecheck && pnpm test:unit 2>&1 | grep -E "(personality-images|pass |fail )" | tail -15
```

Expected: typecheck clean; all tests pass. The `archetype.id` field already exists on the AestheticArchetype interface (line 47 of aesthetic-archetypes.ts) so this needs no new types.

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/lib/workspace/enhance-blocks.ts
git commit -m "feat(enhance-blocks): thread archetypeContext into hero + gallery image resolvers"
```

---

## Task 10: Update hero SKILL.md with archetype→template guidance

**Files:**
- Modify: `packages/crm/src/blocks/hero/SKILL.md`

- [ ] **Step 1: Read the current archetype guidance section**

```bash
grep -n "Archetype.*template\|archetype → template" packages/crm/src/blocks/hero/SKILL.md
```

Expected: lines around 224 and 234 reference archetype→template guidance.

- [ ] **Step 2: Prepend the v1.54 guidance table near the top of the catalog**

Open `packages/crm/src/blocks/hero/SKILL.md`. Find the line `## Template catalog — pick ONE for the \`template\` field (v1.44.0)` (around line 195). Just BEFORE that line, insert the new guidance section:

```markdown
## v1.54 — Archetype-driven template selection (read this FIRST)

The workspace has been classified into one of 7 aesthetic archetypes
at server-side workspace creation. The classified id is available in
`context.aesthetic_archetype`. **Use this table verbatim** to pick the
`template` field — the server enforces it anyway, so deviating costs
you a round-trip without changing the rendered output.

| `context.aesthetic_archetype` | `template` field |
|--------------------------------|------------------|
| `"bold-urgency"`               | `""` (omit) — tradesmen use the legacy split-screen variant; no template fits the bold-urgency vibe yet |
| `"clinical-trust"`             | `"nexora-light"` |
| `"cinematic-aspirational"`     | `"cinematic-aura"` |
| `"editorial-warm"`             | `"viktor-light"` |
| `"technical-restrained"`       | `"viktor-light"` (or `"stellar-tabs-white"` when the workspace is clearly a SaaS product, or `"securify-bold"` for dev-tools) |
| `"soft-residential"`           | `"viktor-light"` |
| `"brutalist"`                  | `"securify-bold"` |

When `context.aesthetic_archetype` is `null` (pre-v1.54 workspaces),
fall back to the older archetype heuristics in the catalog below.
Picking the archetype-correct template means your `headline` /
`subheadline` copy ends up matching the visual treatment (urgent and
imperative for bold-urgency, editorial and warm for editorial-warm,
cinematic and aspirational for cinematic-aspirational).

---

```

- [ ] **Step 3: Verify the file parses (it's markdown, but blocks-emit script reads frontmatter)**

```bash
pnpm emit:blocks:check 2>&1 | head -20
```

Expected: no errors related to the hero block.

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/blocks/hero/SKILL.md
git commit -m "docs(hero): prepend v1.54 archetype-driven template guidance"
```

---

## Task 11: Run the full test suite + typecheck to confirm no regressions

- [ ] **Step 1: Typecheck**

```bash
pnpm typecheck
```

Expected: clean. Pre-existing errors unrelated to this work are fine.

- [ ] **Step 2: Run the full unit test suite**

```bash
pnpm test:unit 2>&1 | tail -50
```

Expected:
- All 4 new spec files have all tests passing
- Pre-existing `workflow-event-log/category-server-actions.spec.ts` failure is the ONLY failure (it's documented in the spec as out-of-scope)
- No other regressions

If anything else fails, investigate before proceeding.

- [ ] **Step 3: Confirm new files are all committed**

```bash
git status --short docs/superpowers/ packages/crm/src/lib/ packages/crm/src/app/ packages/crm/src/blocks/ packages/crm/tests/unit/
```

Expected: clean (no uncommitted changes in those paths). If anything appears, commit it with a `chore: leftover from arch wire` message before continuing.

---

## Task 12: Integration smoke test (manual, on preview deploy)

This is run AFTER the implementation lands on a preview deployment. It validates the three-archetype invariant end-to-end.

- [ ] **Step 1: Wait for Vercel preview to deploy**

After pushing the branch and opening a PR, Vercel auto-deploys. Look for the preview URL in the PR comments or in `vercel ls`.

- [ ] **Step 2: Create a bold-urgency workspace via the v2 lean URL flow**

Use the MCP tool from a CC session pointed at the preview URL:

```
mcp__seldonframe__create_workspace_from_url --url https://www.mrrooter.com/locations/austin
```

Wait for the workspace to complete. Note the workspace_id returned.

- [ ] **Step 3: Verify the snapshot shows bold-urgency rendering**

```bash
curl -s "https://<preview-url>/api/v1/workspace/<workspace_id>/snapshot" \
  -H "Authorization: Bearer <token>" \
  | jq '{
      archetype: .theme.aestheticArchetype,
      hero_template: .landing.sections[0].content.template,
      hero_variant: .landing.sections[0].content.variant,
      hero_image: .landing.sections[0].content.heroImage,
    }'
```

Expected output:

```json
{
  "archetype": "bold-urgency",
  "hero_template": "",
  "hero_variant": "split-screen-50-50",
  "hero_image": "https://images.unsplash.com/..."
}
```

If `hero_image` is empty, check Vercel logs for `unsplash_archetype_fallback_used` events.

- [ ] **Step 4: Create a clinical-trust workspace**

```
mcp__seldonframe__create_workspace_from_url --url <a dental practice URL>
```

Snapshot assertions:

```json
{
  "archetype": "clinical-trust",
  "hero_template": "nexora-light",
  "hero_image": "https://images.unsplash.com/..."
}
```

- [ ] **Step 5: Create a cinematic-aspirational workspace**

```
mcp__seldonframe__create_workspace_from_url --url <a medspa URL>
```

Snapshot assertions:

```json
{
  "archetype": "cinematic-aspirational",
  "hero_template": "cinematic-aura",
  "hero_image": "https://images.unsplash.com/..."
}
```

- [ ] **Step 6: Check Vercel logs for the four new events**

In Vercel dashboard → Logs → filter by these event names:
- `hero_template_overridden` — present, with `llm_picked` values varying (initial state: LLM disagrees often)
- `hero_variant_overridden` — present
- `org_archetype_lazy_backfilled` — should be zero on new workspaces (only fires for pre-v1.54)
- `unsplash_archetype_fallback_used` — present, ~10-20% of hero resolutions

- [ ] **Step 7: Confirm Mr Rooter regenerates correctly on production**

After PR merges and production deploys, regenerate the Mr Rooter workspace (the canonical bug-report workspace). Confirm via snapshot that:
- `hero_template` is `""` (was probably `"viktor-light"` before)
- `hero_variant` is `"split-screen-50-50"`
- `hero_image` is non-empty Unsplash URL
- Vercel logs show `hero_template_overridden` was emitted with `llm_picked: "viktor-light"` (or whatever the LLM did pick)

This is the definition-of-done from the spec.

---

## Definition of Done

- [ ] All 4 new spec files have all tests passing locally (`pnpm test:unit`)
- [ ] `pnpm typecheck` is clean (modulo pre-existing unrelated errors)
- [ ] Branch pushed; PR opened with reference to spec `f5daa6aa`
- [ ] Preview smoke test (Task 12) confirms 3 archetypes render distinct hero variants + templates
- [ ] PR merged to main; Vercel auto-deploys to production
- [ ] Mr Rooter workspace regenerate renders bold-urgency split-screen with real Unsplash image
- [ ] 24h log audit on production shows the 4 new event types appearing at expected rates
- [ ] `hero_template_overridden` rate is non-zero (we know the LLM doesn't always obey — that's the safety-net value)
- [ ] `unsplash_archetype_fallback_used` rate > 0 (fallback is being exercised)
- [ ] No regressions in existing landing page rendering for pre-v1.54 workspaces (verify by spot-checking one or two old workspaces that did NOT have aestheticArchetype in theme — they should lazy-backfill on first hero regen and render correctly)
