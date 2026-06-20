# Multi-Page Site Generator — Phase 4 (Generation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the R1 generator automatically produce, on every `/clients/new` build, what we hand-built for the first demo: a **service detail page per real service** (`servicePages[]`), **HD service photos** written to the key the renderer reads, and a **booking-calendar hero CTA** — all validated before save. Plus a one-line renderer fallback that fixes service-card photos on *every already-built* workspace.

**Architecture:** P1/P2 shipped the multi-page *render* (route, template, navbar dropdown, dark mode, map, intake). P4 fills the *data*. The existing generator (`generateR1Payload`, one Anthropic call) is unchanged in shape; P4 adds: (1) a tiny renderer photo-fallback + two prompt fixes (photo field name, `/book` CTA); (2) pure CDN photo-upscale helpers; (3) a second scoped LLM call `generateServicePages` (one `ServicePage` per **real** grid service — never fabricated — slug = `serviceSlug(name)`, photo resolved real-first then HD Unsplash fallback); (4) wiring in `runR1LandingStep` (generate → generate service pages → `validateSiteTree` gate → save). Everything new lives in small, DB-free, unit-tested modules following the generator's existing `anthropicClient` DI seam.

**Tech Stack:** Next.js 16, React 19, TypeScript, Anthropic SDK (`generateR1Payload` pattern: model `LANDING_PAYLOAD_MODEL || "claude-haiku-4-5"`, JSON-only system prompt, `pickText`/`stripFences`/`JSON.parse`), the existing Unsplash helpers (`resolveHeroImage`/`resolveGalleryImages` in `lib/crm/personality-images.ts`, env `UNSPLASH_ACCESS_KEY`), `node:test` + `tsx` unit tests (DI, no module mocking), Drizzle (read-only here).

---

## Key Decisions (confirmed with Max — these are the plan's spine)

1. **Real services only — NEVER fabricate.** `servicePages[]` is generated **1:1 from the real grid services** (the `facts.services` the site actually lists, 3–8 of them). The LLM writes richer copy for *those* services; it does **not** invent services the business didn't state. This mirrors the existing no-fabricated-reviews guardrail. (Consequence: `servicePages.length === payload.services.services.length`; no 15–20 expansion, no grid/pages decoupling — much simpler + safe.)
2. **Photos: real-first, HD-stock fallback.** For each service, prefer the business's **real** scraped photo (CDN-upscaled when the source allows); when it's missing **or** too low-res, fall back to an **HD Unsplash** photo keyed to `service + vertical` via the existing `resolveHeroImage`/`resolveGalleryImages`. Same rule for the home services grid and each service page's hero.
3. **Fix the `image`→`photo` bug at BOTH ends.** The prompt never named the service photo field, so the LLM emitted `image` while the renderer reads `photo`. P4 (a) names the field `photo` in the prompt, and (b) adds a one-line `service.photo ?? service.image` fallback in the renderer — which **immediately fixes photos on every existing build** once deployed, independent of regeneration.
4. **Hero CTA → `/book`.** The prompt hardcodes a `tel:` href on `hero.primaryCTA`; switch it to `/book` (which `rewriteR1Hrefs` maps to the workspace booking URL — the booking template is always seeded). Keep the phone as `hero.secondaryCTA` + the services-section CTA.
5. **`validateSiteTree` is the write-time gate.** `runR1LandingStep` runs it on the assembled payload before save; invalid `servicePages` entries are pruned (never block the whole build — `validateSiteTree` never throws).

**Known constraint (flag, not a blocker):** Unsplash may be on the **demo tier (50 req/hr)**. A build resolves at most ~1 photo per real service (3–8) + the hero — well under 50, but many concurrent builds could exhaust it. P4 caps Unsplash calls per build and degrades gracefully (real photo or the existing striped placeholder) when the API is unavailable/rate-limited. Production-tier Unsplash is recommended before high volume.

---

## Spec ↔ Code Reconciliation (read before starting)

- The design spec (`2026-06-19-...-design.md`) said "expand to a comprehensive 15–20 service set." **Superseded by Key Decision 1** (real services only) — Max chose brand-safety over SEO breadth. The generator must NOT invent services.
- `generateR1Payload` (`lib/landing/r1-payload-generator.ts`) currently emits `hero, services, testimonials, faq, footer` (+ optional `emergency/sticky/leadForm`); it does **not** emit `servicePages`/`nav`/`theme`. `isR1LandingPayload` only checks the five core keys. P4 leaves call 1 intact and adds `servicePages` via a second call; `theme` is already injected in `runR1LandingStep` (P2).
- Renderer reads `services[i].photo` (`services-grid.tsx`); the LLM emits `image` because the prompt's ENRICHMENT_PHOTOS block tells it to attach service photos but never names the field. Both ends get fixed (Decision 3).
- `rewriteR1Hrefs` REWRITE_MAP maps `/book` + `/intake` only and skips `tel:`/`http`/`#`. P4 adds `nav.cta.href` to the set of rewritten spots (currently only hero/services/footer/sticky hrefs are walked).

---

## File Structure

| File | New / Modified | Responsibility |
| --- | --- | --- |
| `packages/crm/src/lib/landing/service-photo.ts` | **New** | Pure, DB-free photo helpers: `upscaleCdnImageUrl(src)` (Wix/known-CDN render-size bump; pass-through otherwise), `isLowResImageUrl(src)` (detects small CDN renders), and `pickServicePhotoSrc(realSrc)` (returns an upscaled real src or null when absent/too-small). Unit-tested. |
| `packages/crm/src/components/landing-r1/sections/services-grid.tsx` | **Modified** | Renderer fallback: read `service.photo ?? service.image` (via a tiny local `cardPhoto(service)`), upscaling via `upscaleCdnImageUrl`. Fixes existing builds. (Also keep the P3-era `serviceCardHref`.) |
| `packages/crm/src/lib/landing/r1-payload-prompt.ts` | **Modified** | Prompt fixes: name the service photo field `photo: { src, alt }` in the ENRICHMENT_PHOTOS instruction; change `hero.primaryCTA.href` instruction from `tel:` to `/book` and add a `secondaryCTA` = the phone. (Prompt-string edits; no type change.) |
| `packages/crm/src/lib/landing/service-pages-prompt.ts` | **New** | Pure `buildServicePagesPrompt(input)` — the LLM instruction to write one `ServicePage` per **real** grid service (summary + body blocks + ctaLabel), explicitly forbidding fabrication of new services. Unit-tested for structure. |
| `packages/crm/src/lib/landing/service-pages-generator.ts` | **New** | `generateServicePages({ gridServices, facts, archetype, byokKey, anthropicClient?, model?, photoResolver? })` — the 2nd scoped Anthropic call. Parses, **forces** `slug = serviceSlug(name)` per entry, resolves each `heroPhoto` (real-first → Unsplash fallback via injected `photoResolver`), and returns a `ServicePage[]` that passes `validateSiteTree`. DI seams for the LLM client + the photo resolver. Unit-tested. |
| `packages/crm/src/lib/landing/service-photo-resolver.ts` | **New** | `resolveServicePhoto({ realSrc, realAlt, serviceName, vertical, archetype, businessName })` — the real-first/HD-Unsplash decision, calling `resolveHeroImage` from `personality-images.ts` for the fallback. Caps + try/catch around Unsplash (graceful null). The injectable seam used by both the grid post-process and `generateServicePages`. |
| `packages/crm/src/lib/landing/r1-payload-generator.ts` | **Modified** | After call 1, post-process the home services grid: set each `services[i].photo` via `resolveServicePhoto` (real-first/Unsplash). (Keeps call 1's prompt output but guarantees HD `photo`.) |
| `packages/crm/src/lib/landing/r1-landing-step.ts` | **Modified** | After `generateR1Payload`: call `generateServicePages`, run `validateSiteTree` (prune invalid entries), set `payload.servicePages` + `payload.nav.cta = { label, href: "/book" }`; then the existing theme injection + save. |
| `packages/crm/src/lib/landing/r1-rewrite-hrefs.ts` | **Modified** | Also rewrite `payload.nav?.cta?.href` (so the navbar CTA's `/book` resolves like the hero's). |
| `packages/crm/tests/unit/landing/service-photo.spec.ts` | **New** | Unit tests for `upscaleCdnImageUrl`/`isLowResImageUrl`/`pickServicePhotoSrc`. |
| `packages/crm/tests/unit/landing/service-pages-prompt.spec.ts` | **New** | Unit tests: the prompt names each real service, instructs no-fabrication, asks for the ServicePage shape. |
| `packages/crm/tests/unit/landing/service-pages-generator.spec.ts` | **New** | Unit tests with an injected fake Anthropic client + fake photoResolver: structure, **count === real services**, **no fabricated services**, slug = `serviceSlug(name)`, output passes `validateSiteTree`, heroPhoto assigned. |

**Decomposition notes:** All new *logic* is pure or DI-seamed → unit-testable under `node:test` + `tsx` with zero network/DB. The two LLM calls and the Unsplash calls are isolated behind injectable seams (`anthropicClient`, `photoResolver`) exactly like the existing `generateR1Payload`. No DB migration; no render changes beyond the one-line photo fallback.

---

## Build gate (run before every commit touching `packages/crm`)

```bash
cd packages/crm && bash scripts/check-use-server.sh src && npx tsc --noEmit 2>&1 | grep -v '^\.next/' | grep 'error TS' || echo "no source TS errors"
```
- `check-use-server` exits 0; **no source TS errors** (`.next/types/validator.ts` are pre-existing stale artifacts — filtered).
- Single spec: `cd packages/crm && npx tsx --test tests/unit/landing/<file>.spec.ts`. Task 10 runs `next build`.

---

## GROUP A — Immediate fixes (also repair existing builds)

## Task 1: Renderer photo fallback (`photo ?? image`) + upscale

Fixes service-card photos on **every already-built** workspace the moment it deploys — independent of P4 regeneration.

**Files:** create `packages/crm/src/lib/landing/service-photo.ts`; modify `sections/services-grid.tsx`. Test: `tests/unit/landing/service-photo.spec.ts`.

- [ ] **Step 1: Write the failing test** — `tests/unit/landing/service-photo.spec.ts`:
```ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { upscaleCdnImageUrl, isLowResImageUrl, pickServicePhotoSrc } from "../../../src/lib/landing/service-photo";

describe("upscaleCdnImageUrl", () => {
  test("bumps a Wix fill render to a larger size", () => {
    const src = "https://static.wixstatic.com/media/abc~mv2.jpg/v1/crop/x_0,y_0,w_768,h_768/fill/w_206,h_206,al_c,q_80,enc_avif,quality_auto/x.jpg";
    const out = upscaleCdnImageUrl(src);
    assert.ok(out.includes("fill/w_1100,h_825"), out);
    assert.ok(!out.includes("w_206,h_206"));
  });
  test("passes through non-Wix / non-fill urls unchanged", () => {
    assert.equal(upscaleCdnImageUrl("https://images.unsplash.com/photo-1?w=1600"), "https://images.unsplash.com/photo-1?w=1600");
    assert.equal(upscaleCdnImageUrl(""), "");
  });
});

describe("isLowResImageUrl", () => {
  test("flags small Wix fill renders", () => {
    assert.equal(isLowResImageUrl("https://static.wixstatic.com/media/x/v1/fill/w_206,h_206,al_c/x.jpg"), true);
  });
  test("does not flag large or unknown urls", () => {
    assert.equal(isLowResImageUrl("https://static.wixstatic.com/media/x/v1/fill/w_1100,h_825/x.jpg"), false);
    assert.equal(isLowResImageUrl("https://images.unsplash.com/photo-1?w=1600"), false);
  });
});

describe("pickServicePhotoSrc", () => {
  test("returns an upscaled real src when present and upscalable", () => {
    const s = "https://static.wixstatic.com/media/x/v1/fill/w_206,h_206,al_c/x.jpg";
    assert.ok(pickServicePhotoSrc(s)?.includes("w_1100,h_825"));
  });
  test("returns null for blank input", () => {
    assert.equal(pickServicePhotoSrc(""), null);
    assert.equal(pickServicePhotoSrc(undefined), null);
  });
});
```
Run → FAIL (module missing).

- [ ] **Step 2: Implement `lib/landing/service-photo.ts`:**
```ts
// Pure, DB-free photo helpers. No network. The generator/renderer use these to
// upgrade scraped CDN thumbnails to a usable resolution and decide whether a
// real photo is good enough to keep (else the caller falls back to HD stock).

const WIX_FILL_RE = /\/fill\/w_(\d+),h_(\d+)/;
const TARGET_W = 1100;
const TARGET_H = 825; // 4:3-ish; the renderers object-fit: cover so exact ratio is cosmetic.

/** Bump a known CDN render (Wix `fill/w_,h_`) to ~1100px. Pass through anything
 *  we don't recognize (Unsplash already comes HD; unknown CDNs left as-is). */
export function upscaleCdnImageUrl(src: string | null | undefined): string {
  const s = (src ?? "").trim();
  if (!s) return "";
  if (s.includes("static.wixstatic.com") && WIX_FILL_RE.test(s)) {
    return s.replace(WIX_FILL_RE, `/fill/w_${TARGET_W},h_${TARGET_H}`);
  }
  return s;
}

/** True when a CDN url is a small render we'd rather replace with HD stock. */
export function isLowResImageUrl(src: string | null | undefined): boolean {
  const s = (src ?? "").trim();
  if (!s) return false;
  const m = s.match(WIX_FILL_RE);
  if (m) {
    const w = Number(m[1]);
    return Number.isFinite(w) && w < 700;
  }
  return false;
}

/** The real-photo candidate for a service: an upscaled real src, or null when
 *  absent. (The caller decides real-vs-stock; this only prepares the real one.) */
export function pickServicePhotoSrc(realSrc: string | null | undefined): string | null {
  const s = (realSrc ?? "").trim();
  if (!s) return null;
  return upscaleCdnImageUrl(s);
}
```
Run → PASS.

- [ ] **Step 3: Renderer fallback in `services-grid.tsx`** — in `ServiceCard`, read both keys + upscale. Add near the top of `services-grid.tsx`: `import { upscaleCdnImageUrl } from "@/lib/landing/r1-... }` → actually `@/lib/landing/service-photo`. Then replace the photo read:
```tsx
{service.photo ? (
  <img className="ph-img" src={service.photo.src} alt={service.photo.alt} loading="lazy" />
) : null}
```
with:
```tsx
{(() => {
  // P4: tolerate legacy payloads that stored the photo under `image`, and
  // upscale small CDN renders. Existing builds get photos without regeneration.
  const p = service.photo ?? (service as { image?: { src: string; alt: string } }).image;
  return p?.src ? (
    <img className="ph-img" src={upscaleCdnImageUrl(p.src)} alt={p.alt ?? service.name} loading="lazy" />
  ) : null;
})()}
```
(Confirm the `Service` type still only declares `photo?`; the `image` read is a defensive cast for legacy data.)

- [ ] **Step 4:** Build gate. Run the spec → PASS.
- [ ] **Step 5: Commit**
```bash
git add packages/crm/src/lib/landing/service-photo.ts packages/crm/src/components/landing-r1/sections/services-grid.tsx packages/crm/tests/unit/landing/service-photo.spec.ts
git commit -m "feat(landing): service-card photo fallback (photo??image) + CDN upscale"
```

---

## Task 2: Prompt fixes — name the `photo` field + `/book` hero CTA

**Files:** modify `lib/landing/r1-payload-prompt.ts` (prompt strings only). No unit test (LLM-prompt text; verified by reading + the generator structural tests + manual smoke in Task 10).

- [ ] **Step 1:** READ `r1-payload-prompt.ts`. Find the ENRICHMENT_PHOTOS instruction (~lines 348–355) that assigns `section==="services"` photos to service tiles. Change it to specify the field name explicitly, e.g.:
  > `...assign each as **photo: { src, alt }** on the matching service object (NOT "image").`
- [ ] **Step 2:** Find the `hero.primaryCTA` instruction (~line 285, currently `href = "${telHref}"`). Change to:
  > `primaryCTA: { label, href: "/book" } — label reflects the archetype voice (e.g. "Get a free estimate" / "Book a consultation"). ALSO emit secondaryCTA: { label: "Call ${phoneDisplay}", href: "${telHref}" }.`
  (Use the real variable names in scope — `telHref`, the phone display string. Keep the services-section CTA's `tel:` as-is.)
- [ ] **Step 3:** Build gate (tsc — prompt is a string, should be clean). Confirm no other code depends on the old CTA text.
- [ ] **Step 4: Commit**
```bash
git add packages/crm/src/lib/landing/r1-payload-prompt.ts
git commit -m "feat(landing): prompt emits service photo field + /book hero CTA"
```

---

## GROUP B — Photo resolution (real-first, HD-stock fallback)

## Task 3: `resolveServicePhoto` — real-first / HD-Unsplash fallback (DI-seamed)

**Files:** create `lib/landing/service-photo-resolver.ts`. Test: covered indirectly via Task 5's generator tests (this is an async network helper; unit-test its pure decision branch by injecting a fake stock resolver).

- [ ] **Step 1:** Implement `service-photo-resolver.ts`:
```ts
// Decide the best photo for a service: prefer the business's real scraped photo
// (upscaled) when it exists and isn't a tiny thumbnail; otherwise fall back to an
// HD Unsplash photo keyed to the service + vertical. Network (Unsplash) is behind
// an injectable seam so the generator's unit tests stay offline + deterministic.

import { resolveHeroImage } from "@/lib/crm/personality-images";
import { upscaleCdnImageUrl, isLowResImageUrl } from "./service-photo";
import type { AestheticArchetypeId } from "@/components/landing-r1/archetypes";

export type ServicePhoto = { src: string; alt: string };

export type StockResolver = (
  query: string,
  ctx: { archetype: AestheticArchetypeId; businessName: string },
) => Promise<{ url: string; alt?: string } | null>;

const defaultStock: StockResolver = async (query, ctx) => {
  const img = await resolveHeroImage(query, { archetype: ctx.archetype, businessName: ctx.businessName } as never);
  return img ? { url: img.url, alt: (img as { alt?: string }).alt } : null;
};

export async function resolveServicePhoto(input: {
  realSrc?: string | null;
  realAlt?: string | null;
  serviceName: string;
  vertical: string;
  archetype: AestheticArchetypeId;
  businessName: string;
  stock?: StockResolver; // DI seam (tests inject a fake)
}): Promise<ServicePhoto | null> {
  const real = (input.realSrc ?? "").trim();
  // Prefer real when present AND not a tiny thumbnail.
  if (real && !isLowResImageUrl(real)) {
    return { src: upscaleCdnImageUrl(real), alt: input.realAlt?.trim() || input.serviceName };
  }
  // Fallback: HD stock keyed to service + vertical (graceful null on failure/rate-limit).
  const stock = input.stock ?? defaultStock;
  try {
    const hit = await stock(`${input.serviceName} ${input.vertical}`.trim(), {
      archetype: input.archetype,
      businessName: input.businessName,
    });
    if (hit?.url) return { src: hit.url, alt: hit.alt || `${input.serviceName} — ${input.businessName}` };
  } catch {
    /* rate-limited / network — degrade */
  }
  // Last resort: an upscaled real (even if small) beats nothing; else null (placeholder).
  return real ? { src: upscaleCdnImageUrl(real), alt: input.realAlt?.trim() || input.serviceName } : null;
}
```
> Confirm `resolveHeroImage`'s real signature/return shape from `personality-images.ts` and adapt the `defaultStock` adapter (the research found `resolveHeroImage(query, archetypeContext?)` → `{ url, ... } | null` at 1600×900). If its context arg shape differs, fix the adapter.

- [ ] **Step 2:** Build gate (tsc clean). No standalone spec (exercised in Task 5 with an injected `stock`).
- [ ] **Step 3: Commit**
```bash
git add packages/crm/src/lib/landing/service-photo-resolver.ts
git commit -m "feat(landing): resolveServicePhoto (real-first, HD Unsplash fallback, DI-seamed)"
```

---

## GROUP C — Service-pages generation (real services only)

## Task 4: `buildServicePagesPrompt` (pure, no fabrication)

**Files:** create `lib/landing/service-pages-prompt.ts`. Test: `tests/unit/landing/service-pages-prompt.spec.ts`.

- [ ] **Step 1: Failing test** — assert the prompt (a) lists every real grid service by name, (b) contains an explicit no-fabrication instruction, (c) asks for the ServicePage shape (summary, body blocks, ctaLabel), (d) instructs slug = a URL slug of the name:
```ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildServicePagesPrompt } from "../../../src/lib/landing/service-pages-prompt";

const services = [
  { id: "s1", name: "Greenscaping", description: "Plants and lawns." },
  { id: "s2", name: "Hardscaping", description: "Patios and walls." },
];

describe("buildServicePagesPrompt", () => {
  const p = buildServicePagesPrompt({ services, businessName: "Acme Yards", vertical: "landscaping", city: "Dallas", testimonials: [] });
  test("names every real service", () => { for (const s of services) assert.ok(p.includes(s.name)); });
  test("forbids inventing services", () => { assert.match(p, /only.*(these|listed)|do not (invent|add|fabricate)/i); });
  test("asks for the ServicePage shape", () => { assert.match(p, /summary/i); assert.match(p, /body/i); assert.match(p, /ctaLabel/i); });
});
```
Run → FAIL.

- [ ] **Step 2: Implement `service-pages-prompt.ts`** — a pure function returning the instruction string. It receives the **already-generated grid services** (the real ones) + facts context, and asks the LLM to write ONE `ServicePage` per service, in the same order, **without adding or removing any**:
```ts
import type { ServicePage } from "./r1-site-tree";

export type ServicePagesPromptInput = {
  services: { id: string; name: string; description: string }[];
  businessName: string;
  vertical: string;
  city: string;
  testimonials: { quote: string; name?: string; city?: string; rating?: number; service?: string }[];
};

export function buildServicePagesPrompt(input: ServicePagesPromptInput): string {
  const list = input.services.map((s, i) => `${i + 1}. ${s.name} — ${s.description}`).join("\n");
  return [
    `You write per-service detail pages for ${input.businessName}, a ${input.vertical} business in ${input.city}.`,
    `Write EXACTLY ONE service page for each of these ${input.services.length} services, in this order. Do NOT add, remove, merge, or rename services — use ONLY the services listed:`,
    list,
    ``,
    `For each service return an object:`,
    `{ "name": <exact service name>, "summary": <1 sentence>, "body": [ { "kind": "heading", "text": <short heading> }, { "kind": "paragraph", "text": <2-4 sentences> }, ... 2-4 blocks ], "ctaLabel": <e.g. "Get a free <service> estimate"> }`,
    `Voice: confident, specific, on-brand for ${input.vertical}. Never invent prices, guarantees, or services not listed. Use the city/region naturally.`,
    input.testimonials.length
      ? `You may reference these real testimonials thematically but do NOT fabricate new ones.`
      : ``,
    `Return JSON: { "servicePages": [ ...one per service, same order... ] }. JSON only.`,
  ].filter(Boolean).join("\n");
}
```
(`slug`, `heroPhoto`, and `testimonials` are added in code by the generator — the LLM only writes copy. This keeps the no-fabrication + slug-invariant guarantees in code, not in the model.)

- [ ] **Step 3:** Run test → PASS. Build gate. Commit:
```bash
git add packages/crm/src/lib/landing/service-pages-prompt.ts packages/crm/tests/unit/landing/service-pages-prompt.spec.ts
git commit -m "feat(landing): buildServicePagesPrompt (one page per real service, no fabrication)"
```

---

## Task 5: `generateServicePages` — the 2nd LLM call + slug/photo/validate

**Files:** create `lib/landing/service-pages-generator.ts`. Test: `tests/unit/landing/service-pages-generator.spec.ts`.

- [ ] **Step 1: Failing test** (inject a fake Anthropic client returning copy for 2 services + a fake `photoResolver`; assert count, no-fabrication, slug, validity, heroPhoto):
```ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { generateServicePages } from "../../../src/lib/landing/service-pages-generator";
import { validateSiteTree, serviceSlug } from "../../../src/lib/landing/r1-site-tree";

const gridServices = [
  { id: "s1", name: "Outdoor Structures", description: "Pergolas." },
  { id: "s2", name: "Irrigation and Drainage", description: "Sprinklers." },
];
const fakeClient = {
  messages: { create: async () => ({ content: [{ type: "text", text: JSON.stringify({ servicePages: [
    { name: "Outdoor Structures", summary: "Custom builds.", body: [{ kind: "paragraph", text: "We build pergolas." }], ctaLabel: "Plan yours" },
    { name: "Irrigation and Drainage", summary: "Stay green.", body: [{ kind: "paragraph", text: "We zone systems." }], ctaLabel: "Get an estimate" },
  ] }) }] }) } },
};
const fakePhoto = async () => ({ src: "https://images.unsplash.com/p?w=1600", alt: "x" });

describe("generateServicePages", () => {
  test("produces exactly one page per real service, slug = serviceSlug(name), valid + photo'd", async () => {
    const pages = await generateServicePages({
      gridServices, facts: { business_name: "Acme", city: "Dallas", state: "TX", vertical: "landscaping", testimonials: [] } as never,
      archetype: "editorial-warm", byokKey: "x", anthropicClient: fakeClient, photoResolver: fakePhoto as never,
    });
    assert.equal(pages.length, 2);
    assert.equal(pages[0].slug, serviceSlug("Outdoor Structures"));
    assert.equal(pages[1].slug, serviceSlug("Irrigation and Drainage"));
    assert.ok(pages[0].heroPhoto?.src);
    const res = validateSiteTree({ servicePages: pages } as never);
    assert.equal(res.valid, true, JSON.stringify(res.errors));
  });

  test("drops any LLM service not in the real grid (no fabrication)", async () => {
    const rogue = { messages: { create: async () => ({ content: [{ type: "text", text: JSON.stringify({ servicePages: [
      { name: "Outdoor Structures", summary: "ok", body: [{ kind: "paragraph", text: "x" }], ctaLabel: "go" },
      { name: "Pool Installation", summary: "nope", body: [{ kind: "paragraph", text: "x" }], ctaLabel: "go" },
    ] }) }] }) } };
    const pages = await generateServicePages({ gridServices: [gridServices[0]], facts: { vertical: "landscaping", testimonials: [] } as never, archetype: "editorial-warm", byokKey: "x", anthropicClient: rogue, photoResolver: fakePhoto as never });
    assert.equal(pages.length, 1);
    assert.equal(pages[0].name, "Outdoor Structures");
  });
});
```
Run → FAIL (module missing).

- [ ] **Step 2: Implement `service-pages-generator.ts`** — mirror `generateR1Payload`'s structure (model/env, `pickText`/`stripFences`/`JSON.parse`, the `anthropicClient` seam). Then **enforce the guarantees in code**: keep only LLM entries whose name matches a real grid service (drop fabrications), in grid order; set `slug = serviceSlug(gridService.name)`; attach `heroPhoto` via the injected `photoResolver` (real-first); attach matching `testimonials` (service-tagged, from facts); finally filter through `validateSiteTree` (drop invalid).
```ts
import Anthropic from "@anthropic-ai/sdk";
import { serviceSlug, type ServicePage, validateSiteTree } from "./r1-site-tree";
import { buildServicePagesPrompt } from "./service-pages-prompt";
import { resolveServicePhoto, type ServicePhoto } from "./service-photo-resolver";
import type { AestheticArchetypeId } from "@/components/landing-r1/archetypes";
import type { ExtractedBusinessFacts } from "@/lib/web-onboarding/extraction-prompt";

const MODEL = process.env.LANDING_SERVICE_PAGES_MODEL ?? process.env.LANDING_PAYLOAD_MODEL ?? "claude-haiku-4-5";

type GridService = { id: string; name: string; description: string; photo?: { src: string; alt: string } };
type PhotoResolver = (args: { realSrc?: string | null; realAlt?: string | null; serviceName: string; vertical: string; archetype: AestheticArchetypeId; businessName: string }) => Promise<ServicePhoto | null>;

export async function generateServicePages(args: {
  gridServices: GridService[];
  facts: ExtractedBusinessFacts & { vertical?: string };
  archetype: AestheticArchetypeId;
  byokKey: string;
  anthropicClient?: unknown;     // test seam
  model?: string;
  photoResolver?: PhotoResolver; // test seam
}): Promise<ServicePage[]> {
  const vertical = (args.facts as { vertical?: string }).vertical ?? "service business";
  const prompt = buildServicePagesPrompt({
    services: args.gridServices.map((s) => ({ id: s.id, name: s.name, description: s.description })),
    businessName: args.facts.business_name, vertical, city: args.facts.city,
    testimonials: (args.facts.testimonials ?? []).map((t) => ({ quote: t.quote, name: t.name ?? undefined, rating: t.rating ?? undefined })),
  });

  const client = (args.anthropicClient as { messages: { create: Function } }) ?? new Anthropic({ apiKey: args.byokKey });
  const resp = await client.messages.create({
    model: args.model ?? MODEL, max_tokens: 8192,
    system: "Output JSON only. No prose, no markdown fences.",
    messages: [{ role: "user", content: prompt }],
  });

  // Parse (mirror r1-payload-generator's pickText/stripFences/JSON.parse).
  const text = pickText(resp);
  let parsed: { servicePages?: unknown };
  try { parsed = JSON.parse(stripFences(text)); } catch { return []; }
  const raw = Array.isArray(parsed.servicePages) ? parsed.servicePages : [];

  const photoResolver: PhotoResolver = args.photoResolver
    ?? ((a) => resolveServicePhoto({ ...a, archetype: args.archetype, businessName: args.facts.business_name }));

  const out: ServicePage[] = [];
  for (const grid of args.gridServices) {
    // Match LLM copy to a REAL service by name (case-insensitive). Drop fabrications.
    const copy = raw.find((r): r is Record<string, unknown> =>
      !!r && typeof r === "object" && String((r as { name?: unknown }).name ?? "").trim().toLowerCase() === grid.name.toLowerCase());
    if (!copy) continue;
    const heroPhoto = await photoResolver({
      realSrc: grid.photo?.src, realAlt: grid.photo?.alt, serviceName: grid.name, vertical,
      archetype: args.archetype, businessName: args.facts.business_name,
    });
    const page: ServicePage = {
      slug: serviceSlug(grid.name),
      name: grid.name,
      summary: String((copy.summary as string) ?? grid.description).trim(),
      body: normalizeBody(copy.body),
      ctaLabel: String((copy.ctaLabel as string) ?? `Get a free ${grid.name.toLowerCase()} estimate`).trim(),
      ...(heroPhoto ? { heroPhoto } : {}),
      testimonials: (args.facts.testimonials ?? [])
        .filter((t) => (t.service ?? "").toLowerCase() === grid.name.toLowerCase())
        .map((t, i) => ({ id: `${grid.id}-t${i}`, quote: t.quote, name: t.name ?? "Customer", rating: t.rating ?? undefined })),
    };
    out.push(page);
  }
  // Final structural gate: drop anything malformed (never throws).
  return out.filter((p) => validateSiteTree({ servicePages: [p] }).valid);
}

function normalizeBody(b: unknown): ServicePage["body"] {
  if (!Array.isArray(b)) return [];
  return b.flatMap((blk) => {
    if (!blk || typeof blk !== "object") return [];
    const kind = (blk as { kind?: string }).kind === "heading" ? "heading" : "paragraph";
    const text = String((blk as { text?: unknown }).text ?? "").trim();
    return text ? [{ kind, text } as ServicePage["body"][number]] : [];
  });
}

// pickText/stripFences: copy the tiny helpers from r1-payload-generator.ts (or export+import them).
```
> Reuse `pickText`/`stripFences` from `r1-payload-generator.ts` (export them there and import, to avoid drift). Confirm `ServicePage`'s exact field set + the testimonial item shape; adapt. Confirm `facts.testimonials[i]` field names (`service`, `rating`, `name`).

- [ ] **Step 3:** Run tests → PASS. Build gate. Commit:
```bash
git add packages/crm/src/lib/landing/service-pages-generator.ts packages/crm/tests/unit/landing/service-pages-generator.spec.ts packages/crm/src/lib/landing/r1-payload-generator.ts
git commit -m "feat(landing): generateServicePages (real-only, slug-enforced, photo'd, validated)"
```

---

## GROUP D — Wiring into the build

## Task 6: Grid-photo HD post-process in `generateR1Payload`

Guarantee the home services grid gets HD `photo`s (real-first/Unsplash), regardless of what the LLM emitted.

**Files:** modify `lib/landing/r1-payload-generator.ts`.

- [ ] **Step 1:** After call 1 parses + validates, before returning, post-process `payload.services.services`: for each, set `photo = await resolveServicePhoto({ realSrc: existing photo/image src, serviceName: name, vertical, archetype, businessName, ... })`. Use the injected client's NO-network seam? — photos are network; gate behind a `resolvePhotos !== false` option so unit tests can skip. Pull `vertical` via the existing `inferVertical`/`detectVertical` helper. Quote the real return path + insert the loop.
- [ ] **Step 2:** Build gate; ensure existing `r1-payload-generator` tests still pass (inject/skip photo resolution in tests). Commit:
```bash
git add packages/crm/src/lib/landing/r1-payload-generator.ts
git commit -m "feat(landing): grid services get HD photos (real-first/Unsplash) post-generation"
```

## Task 7: `runR1LandingStep` — generate service pages, validate, set nav CTA

**Files:** modify `lib/landing/r1-landing-step.ts`, `lib/landing/r1-rewrite-hrefs.ts`.

- [ ] **Step 1:** In `runR1LandingStep`, after `generateR1Payload` (and the existing theme injection): 
```ts
const servicePages = await generateServicePages({
  gridServices: payload.services.services, facts, archetype, byokKey: args.byokKey,
});
const gate = validateSiteTree({ ...payload, servicePages });
payload.servicePages = gate.valid ? servicePages : servicePages.filter((p) => validateSiteTree({ servicePages: [p] }).valid);
payload.nav = { ...(payload.nav ?? {}), cta: { label: "Book now", href: "/book" } };
```
(Wrap `generateServicePages` in try/catch → on failure, leave `servicePages` unset so the site renders one-page rather than failing the build. Log a structured warning.)
- [ ] **Step 2:** In `r1-rewrite-hrefs.ts`, also rewrite `p.nav?.cta?.href` (mirror the hero/sticky rewrite). 
- [ ] **Step 3:** Build gate. Commit:
```bash
git add packages/crm/src/lib/landing/r1-landing-step.ts packages/crm/src/lib/landing/r1-rewrite-hrefs.ts
git commit -m "feat(landing): wire servicePages generation + validate gate + nav /book CTA into the build"
```

---

## GROUP E — Verify

## Task 8: Full gate + repo suite + manual smoke

- [ ] **Step 1:** `cd packages/crm && npx tsx --test tests/unit/landing/service-photo.spec.ts tests/unit/landing/service-pages-prompt.spec.ts tests/unit/landing/service-pages-generator.spec.ts` → `fail 0`.
- [ ] **Step 2:** `pnpm test:unit 2>&1 | tail -15` → no new failures vs baseline.
- [ ] **Step 3:** `bash scripts/check-use-server.sh src && npx tsc --noEmit && npx next build` → all succeed.
- [ ] **Step 4: Manual smoke (the real test):** Build a NEW workspace via `app.seldonframe.com/clients/new` (paste a real landscaper/contractor URL, pick Dark). Then on `/w/<slug>`: (1) service cards show **HD** photos; (2) clicking a card opens its detail page (no 500); (3) the page count == the real services (no invented ones); (4) the hero "Get a free estimate" opens the **booking calendar**; (5) Services dropdown lists exactly the real services. Confirm a paste-mode build (no scraped photos) falls back to HD Unsplash.
- [ ] **Step 5:** Commit any verification fixes.

---

## Self-Review (plan author)

**Decisions honored:** real-services-only (count enforced in `generateServicePages` by iterating `gridServices` + dropping non-matches), real-first/HD-stock photos (`resolveServicePhoto`), photo-field fix at both ends (Task 1 renderer + Task 2 prompt), `/book` CTA (Task 2 + nav Task 7), `validateSiteTree` gate (Task 7). **No fabrication** is guaranteed in CODE (the LLM can't add services — only real grid services produce pages).

**Slug invariant:** `generateServicePages` sets `slug = serviceSlug(grid.name)` and the grid card links to `${home}/services/${serviceSlug(name)}` (P3) — guaranteed match.

**Graceful degradation:** service-pages generation + each Unsplash call are try/caught → a failure yields a one-page site (today's behavior) or the striped placeholder, never a broken build. Unsplash quota capped (≤ services+1 calls/build); flag for production-tier.

**Test integrity:** pure helpers (`upscaleCdnImageUrl`, `buildServicePagesPrompt`) + the DI-seamed generator (fake client + fake photoResolver) are fully offline-testable; the no-fabrication + slug + validity invariants are asserted directly.

**Placeholder scan:** the LLM/photo network pieces are specified with real structure + the exact existing seams from research (`generateR1Payload` shape, `resolveHeroImage`, `validateSiteTree`, `serviceSlug`); executor confirms a few real field names noted inline.

---

## Roadmap after P4
- Unsplash production-tier (or a Pexels-photos fallback) before high build volume.
- P3 (deferred): Gallery / Service-Areas / Contact / Blog pages + per-workspace `sitemap.xml`.
- Optional: operator "add a service" UI (since we don't auto-fabricate, operators may want to add vertical-standard services manually).
