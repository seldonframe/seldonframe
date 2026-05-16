# Cut C: SeldonFrame Marketing Site Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh `seldonframe.com` marketing site to convert agency visitors into Free-tier signups, using the working web-onboarding flow shipped in Cuts A & B.

**Architecture:** Refresh the existing public home page at `packages/crm/src/app/(public)/page.tsx` (which composes named section components in `packages/crm/src/components/landing/`) by rewriting the hero, adding three new section components ("How it works", "Demo video", "Pricing", "Built for agencies, MIT-licensed", "FAQ"), and replacing the footer's stub links with a real GitHub-prominent footer. Do not rewrite the page from scratch — keep the existing `LandingSoulSection`, `LandingSeldonItSection`, `LandingBentoSection`, `LandingMarketplaceSection`, and `LandingFinalCta` components intact. Every section ships through the four design skills (`design:design-system`, `design:ux-copy`, `design:design-critique`, `design:accessibility-review`) per spec §9.

**Tech Stack:** Next.js 16.2 App Router, React 19, Tailwind, shadcn primitives, lucide-react icons. No new dependencies.

**Prerequisites:**
- Cut A merged: `/auth/signup` has a Google OAuth button (CTAs in this plan link to `/auth/signup`); `/clients/new` exists (screenshots in "How it works" step 2 come from it).
- Cut B merged: `lib/billing/features.ts` exposes a `hasFeature(orgId, featureName)` helper and the six feature flags (`branding_hidden`, `custom_domain`, `client_portal`, `ai_agents`, `white_label_portal`, `priority_support`); the spec's Free / Growth ($29) / Scale ($99) tier names are recognized by `getOrgFeatures()`. Cut C displays the same tier-features matrix in the marketing pricing section.
- Worktree: this plan executes in a worktree off `origin/main` named `seldonframe-marketing-rebuild` (or whatever the orchestrator chose).

**Spec note on file naming:** The spec refers to `landing-client.tsx` and `MarketingFaq`. Those names do not exist in the codebase. The actual files are `packages/crm/src/app/(public)/page.tsx` (server component) composing nine `Landing*` section components in `packages/crm/src/components/landing/*.tsx`. There is no existing FAQ component on the marketing home; this plan creates one.

---

## File Structure

**New files (create):**

| Path | Responsibility |
|---|---|
| `packages/crm/src/components/landing/how-it-works-section.tsx` | 3-step "How it works" client component with screenshots/GIFs |
| `packages/crm/src/components/landing/demo-video-section.tsx` | 60-second demo video container with `<video>` tag + GIF fallback poster |
| `packages/crm/src/components/landing/marketing-pricing-section.tsx` | 3-column Free / Growth / Scale pricing table (distinct from the existing in-app `LandingPricingSection` 6-tier variant) |
| `packages/crm/src/components/landing/open-source-section.tsx` | "Built for agencies, MIT-licensed" section with live GitHub stars badge |
| `packages/crm/src/components/landing/marketing-faq-section.tsx` | 6-question agency-focused FAQ accordion (`<details>` based) |
| `packages/crm/src/components/landing/github-stars-badge.tsx` | Server component that fetches the live star count from `api.github.com/repos/seldonframe/crm` and renders a badge |
| `packages/crm/public/marketing/how-it-works-step-1.png` | Screenshot of signup form (placeholder asset, see manual capture task) |
| `packages/crm/public/marketing/how-it-works-step-2.png` | Screenshot of `/clients/new` mid-extraction (placeholder) |
| `packages/crm/public/marketing/how-it-works-step-3.png` | Screenshot of fresh workspace dashboard (placeholder) |
| `packages/crm/public/marketing/hero-loop.gif` | 6-second hero looped GIF (week-5 placeholder; week-6 swap optional) |
| `packages/crm/public/marketing/demo-placeholder.gif` | 6-second demo placeholder GIF (week 5 ships this) |
| `packages/crm/public/marketing/demo-video.mp4` | 60-second demo video (week 6 manual swap-in) |
| `packages/crm/tests/unit/landing/hero-cta.spec.ts` | Snapshot/shape test for refreshed hero |
| `packages/crm/tests/unit/landing/how-it-works.spec.ts` | Snapshot/shape test for "How it works" section |
| `packages/crm/tests/unit/landing/marketing-pricing.spec.ts` | Tier-cells assertions for pricing table |
| `packages/crm/tests/unit/landing/marketing-faq.spec.ts` | Asserts 6 questions render with expected answers |
| `packages/crm/tests/unit/landing/open-source-section.spec.ts` | GitHub stars badge rendering + numeric format |

**Modified files:**

| Path | What changes |
|---|---|
| `packages/crm/src/app/(public)/page.tsx` | Add new section imports; reorder `<main>` children: hero → how-it-works → bento → demo → soul → seldon-it → pricing → open-source → faq → final-cta. Update `<title>` + meta description. |
| `packages/crm/src/components/landing/hero.tsx` | Rewrite headline + subhead + replace `<UrlAnalyzer />` with two CTAs (Sign Up Free / Continue in Claude Code), embed 6-sec hero loop GIF. |
| `packages/crm/src/components/landing/footer.tsx` | Replace stub `href="#"` links with real targets; add prominent GitHub block at top of footer. |
| `packages/crm/src/components/landing/nav.tsx` | Add "Sign Up Free" CTA on the right; keep GitHub + Sign In links. |

**Files explicitly NOT touched:**
- `packages/crm/src/components/marketing/landing-pricing-section.tsx` — different surface (in-product), out of scope.
- `packages/crm/src/components/landing/sections/faq.tsx` — Puck-renderable variant, out of scope.
- `packages/crm/src/components/landing/agencies-section.tsx` — kept as-is for now (it predates Cut B's tier rename and Cut B owns reconciling it; if its $349/mo "10 workspaces" claim looks stale post-Cut-B, flag for a follow-up).

**Test command:** `cd packages/crm && node --import tsx --test tests/unit/landing/<file>.spec.ts`
**Typecheck:** `pnpm typecheck` from repo root

---

## Phase 1 — Hero refresh

Replaces the existing "Paste your website" hero (which embeds `<UrlAnalyzer />` for anonymous prospects) with a two-CTA hero that funnels signed-out visitors to `/auth/signup`. The `UrlAnalyzer` is deliberately removed from the home page hero — Cut A's `/auth/signup` → `/clients/new` is now the URL-paste moment for signed-in users.

### Task 1.1 — Write failing snapshot test for the refreshed hero

**Files:**
- Create: `packages/crm/tests/unit/landing/hero-cta.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// Snapshot-shape test for refreshed LandingHero.
// Verifies: headline copy, both CTA destinations, alt text on the
// hero loop image. Shape-check (props/children walk), not full DOM
// render — matches the SLICE 4a convention (see
// tests/unit/test-mode-banner.spec.ts).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { LandingHero } from "../../../src/components/landing/hero";

type AnyEl = { props?: Record<string, unknown>; type?: unknown };

function walk(node: unknown, predicate: (el: AnyEl) => boolean): AnyEl | null {
  if (!node || typeof node !== "object") return null;
  const el = node as AnyEl;
  if (predicate(el)) return el;
  const children = el.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = walk(child, predicate);
      if (found) return found;
    }
  } else if (children) {
    return walk(children, predicate);
  }
  return null;
}

describe("LandingHero — agency-onboarding refresh", () => {
  test("headline mentions agency + 60 seconds", () => {
    const result = LandingHero();
    const h1 = walk(result, (el) => el.type === "h1");
    assert.ok(h1, "hero must render an <h1>");
    const text = JSON.stringify(h1.props?.children);
    assert.match(text, /agency/i);
    assert.match(text, /60 seconds/i);
  });

  test("primary CTA links to /auth/signup", () => {
    const result = LandingHero();
    const primary = walk(
      result,
      (el) => (el.props as { href?: string })?.href === "/auth/signup",
    );
    assert.ok(primary, "primary CTA must link to /auth/signup");
  });

  test("secondary CTA links to /docs/claude-code-mcp", () => {
    const result = LandingHero();
    const secondary = walk(
      result,
      (el) => (el.props as { href?: string })?.href === "/docs/claude-code-mcp",
    );
    assert.ok(secondary, "secondary CTA must link to /docs/claude-code-mcp");
  });

  test("hero loop image has alt text", () => {
    const result = LandingHero();
    const img = walk(result, (el) => {
      const p = el.props as { src?: string; alt?: string } | undefined;
      return typeof p?.src === "string" && p.src.includes("hero-loop");
    });
    assert.ok(img, "hero must render the 6-sec loop image");
    assert.ok(
      typeof (img.props as { alt?: string }).alt === "string" &&
        (img.props as { alt: string }).alt.length > 0,
      "hero loop image must have non-empty alt text",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/crm && node --import tsx --test tests/unit/landing/hero-cta.spec.ts`
Expected: FAIL with "headline mentions agency + 60 seconds" (current copy is "Paste your website.")

- [ ] **Step 3: Rewrite `hero.tsx` to the new shape**

Replace the entire contents of `packages/crm/src/components/landing/hero.tsx` with:

```tsx
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";

export function LandingHero() {
  return (
    <section className="flex flex-col items-center justify-center px-6 py-20 text-center md:py-28">
      <h1 className="max-w-4xl text-5xl font-bold tracking-tight text-zinc-100 md:text-6xl lg:leading-[1.1]">
        The open-source Business OS your agency builds for clients in 60 seconds.
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
        Paste your client&apos;s URL. We build their CRM, booking page, intake form, and AI chatbot — all wired up,
        ready to hand over.
      </p>

      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        <Link
          href="/auth/signup"
          className="inline-flex items-center gap-2 rounded-xl bg-[#14b8a6] px-8 py-4 font-semibold text-white transition-opacity hover:opacity-90"
        >
          Sign Up Free
          <ArrowRight size={18} />
        </Link>
        <Link
          href="/docs/claude-code-mcp"
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-8 py-4 font-semibold text-zinc-200 transition-colors hover:border-zinc-500"
        >
          Continue in Claude Code →
        </Link>
      </div>
      <p className="mt-3 text-xs text-zinc-600">Free tier — 1 workspace, no credit card.</p>

      <div className="mt-12 w-full max-w-4xl overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        <Image
          src="/marketing/hero-loop.gif"
          alt="A 6-second loop of an operator pasting a URL and watching a SeldonFrame workspace appear: CRM, booking page, intake form, and AI chatbot."
          width={1280}
          height={720}
          className="h-auto w-full motion-reduce:hidden"
          unoptimized
          priority
        />
        <div className="hidden h-[60px] items-center justify-center bg-zinc-900 px-6 text-sm text-zinc-500 motion-reduce:flex">
          A 6-second loop shows: paste URL → CRM, booking page, intake form, and AI chatbot appear.
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/crm && node --import tsx --test tests/unit/landing/hero-cta.spec.ts`
Expected: 4 PASS

- [ ] **Step 5: Drop a placeholder GIF asset**

Create `packages/crm/public/marketing/hero-loop.gif` with any valid 1x1 GIF byte stream (real recording is captured in Phase 9). On Windows PowerShell:

```powershell
$gif = [byte[]](0x47,0x49,0x46,0x38,0x39,0x61,0x01,0x00,0x01,0x00,0x80,0x00,0x00,0xff,0xff,0xff,0x00,0x00,0x00,0x21,0xf9,0x04,0x00,0x00,0x00,0x00,0x00,0x2c,0x00,0x00,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0x02,0x02,0x44,0x01,0x00,0x3b)
New-Item -ItemType Directory -Force -Path packages/crm/public/marketing | Out-Null
[System.IO.File]::WriteAllBytes("packages/crm/public/marketing/hero-loop.gif", $gif)
```

- [ ] **Step 6: Commit**

```bash
git add packages/crm/src/components/landing/hero.tsx packages/crm/tests/unit/landing/hero-cta.spec.ts packages/crm/public/marketing/hero-loop.gif
git commit -m "feat(marketing): rewrite hero with Sign Up Free + Claude Code CTAs"
```

### Task 1.2 — design:design-system skill pass on the hero

- [ ] **Step 1: Invoke skill**

Invoke `design:design-system` skill.

Feed it: contents of the new `packages/crm/src/components/landing/hero.tsx`, plus the existing `packages/crm/src/components/landing/nav.tsx` and `final-cta.tsx` (so it can audit the hero against established marketing tokens — `#14b8a6` teal accent, zinc-900 surfaces, zinc-100 headings, `text-5xl md:text-6xl` headlines, 4-px button radii `rounded-xl`).

- [ ] **Step 2: Apply skill output inline**

Apply any returned fixes (token corrections, spacing adjustments, typography swaps) directly to `hero.tsx`. If the skill recommends extracting a button primitive, defer to a follow-up — do not block this phase on it.

- [ ] **Step 3: Re-run hero test**

Run: `cd packages/crm && node --import tsx --test tests/unit/landing/hero-cta.spec.ts`
Expected: 4 PASS

- [ ] **Step 4: Commit (only if files changed)**

```bash
git add packages/crm/src/components/landing/hero.tsx
git commit -m "style(marketing): apply design-system pass to hero"
```

### Task 1.3 — design:ux-copy skill pass on every hero string

- [ ] **Step 1: Invoke skill**

Invoke `design:ux-copy` skill.

Feed it: every string in the new hero (h1, subhead, primary CTA label, secondary CTA label, free-tier reassurance, hero-loop alt text, motion-reduce fallback text). Tell it the audience is digital agency owners who serve SMBs and care about white-label, BYOK Anthropic, and per-client workspaces. Tell it the conversion goal is to push them to `/auth/signup`.

- [ ] **Step 2: Apply skill output inline**

Apply the refined copy to `hero.tsx`. If the headline changes, update the regex in `hero-cta.spec.ts` to match the new wording while still asserting the two anchor concepts (agency + 60 seconds).

- [ ] **Step 3: Re-run test**

Run: `cd packages/crm && node --import tsx --test tests/unit/landing/hero-cta.spec.ts`
Expected: 4 PASS

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/components/landing/hero.tsx packages/crm/tests/unit/landing/hero-cta.spec.ts
git commit -m "copy(marketing): refine hero strings via ux-copy skill"
```

### Task 1.4 — Update nav: add Sign Up Free CTA, repoint Sign In

**Files:**
- Modify: `packages/crm/src/components/landing/nav.tsx`

- [ ] **Step 1: Update nav.tsx**

Replace the closing `</div>` content (the right-side links group) with this version, which adds a primary "Sign Up Free" button and points "Sign In" at `/auth/login` (Cut A's signin route):

```tsx
<div className="flex items-center gap-5 text-sm font-medium text-zinc-500">
  <Link href="/pricing" className="transition-colors hover:text-zinc-200">
    Pricing
  </Link>
  <Link
    href="https://github.com/seldonframe/crm"
    target="_blank"
    rel="noopener noreferrer"
    className="flex items-center gap-1 transition-colors hover:text-zinc-200"
  >
    GitHub <ExternalLink size={12} />
  </Link>
  <Link href="/auth/login" className="transition-colors hover:text-zinc-200">
    Sign In
  </Link>
  <Link
    href="/auth/signup"
    className="rounded-lg bg-[#14b8a6] px-4 py-1.5 font-semibold text-white transition-opacity hover:opacity-90"
  >
    Sign Up Free
  </Link>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add packages/crm/src/components/landing/nav.tsx
git commit -m "feat(marketing): add Sign Up Free CTA to nav"
```

### Task 1.5 — design:design-critique skill pass on the hero block

- [ ] **Step 1: Invoke skill**

Invoke `design:design-critique` skill.

Feed it: a screenshot of the rendered hero at `localhost:3000/` (run `pnpm dev` from `packages/crm` first; capture with Claude in Chrome or paste in a browser screenshot). Tell it the goal: convert agency visitors into `/auth/signup` clicks. Ask for usability + visual hierarchy critique.

If a dev server can't run in this environment, describe the rendered hero verbatim (headline, subhead, two CTAs with colors, hero loop image, motion-reduce fallback) and ask for critique based on the description.

- [ ] **Step 2: Apply critique fixes inline**

Apply any high-impact fixes (CTA hierarchy, spacing, color emphasis). Skip nice-to-haves.

- [ ] **Step 3: Re-run hero test**

Run: `cd packages/crm && node --import tsx --test tests/unit/landing/hero-cta.spec.ts`
Expected: 4 PASS

- [ ] **Step 4: Commit (only if files changed)**

```bash
git add packages/crm/src/components/landing/hero.tsx
git commit -m "style(marketing): apply design-critique fixes to hero"
```

---

## Phase 2 — "How it works" 3-step section

### Task 2.1 — Write failing test for "How it works" section

**Files:**
- Create: `packages/crm/tests/unit/landing/how-it-works.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { LandingHowItWorksSection } from "../../../src/components/landing/how-it-works-section";

type AnyEl = { props?: Record<string, unknown>; type?: unknown };

function flatten(node: unknown, acc: AnyEl[] = []): AnyEl[] {
  if (!node || typeof node !== "object") return acc;
  const el = node as AnyEl;
  acc.push(el);
  const children = el.props?.children;
  if (Array.isArray(children)) for (const c of children) flatten(c, acc);
  else if (children) flatten(children, acc);
  return acc;
}

describe("LandingHowItWorksSection — 3-step layout", () => {
  test("renders exactly 3 step cards", () => {
    const result = LandingHowItWorksSection();
    const cards = flatten(result).filter(
      (el) =>
        typeof (el.props as { "data-step"?: string })?.["data-step"] === "string",
    );
    assert.equal(cards.length, 3, "must have 3 step cards");
  });

  test("step 1 mentions Sign up free", () => {
    const result = LandingHowItWorksSection();
    const text = JSON.stringify(result);
    assert.match(text, /Sign up free/i);
  });

  test("step 2 mentions paste URL", () => {
    const result = LandingHowItWorksSection();
    const text = JSON.stringify(result);
    assert.match(text, /paste/i);
    assert.match(text, /URL|website/i);
  });

  test("step 3 mentions 60 seconds", () => {
    const result = LandingHowItWorksSection();
    const text = JSON.stringify(result);
    assert.match(text, /60 seconds/i);
  });

  test("all 3 step screenshots have non-empty alt text", () => {
    const result = LandingHowItWorksSection();
    const imgs = flatten(result).filter((el) => {
      const p = el.props as { src?: string } | undefined;
      return typeof p?.src === "string" && p.src.startsWith("/marketing/how-it-works");
    });
    assert.equal(imgs.length, 3);
    for (const img of imgs) {
      const alt = (img.props as { alt?: string }).alt;
      assert.ok(typeof alt === "string" && alt.length > 0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/crm && node --import tsx --test tests/unit/landing/how-it-works.spec.ts`
Expected: FAIL — `Cannot find module how-it-works-section`

- [ ] **Step 3: Create the section component**

Create `packages/crm/src/components/landing/how-it-works-section.tsx`:

```tsx
import Image from "next/image";

type Step = {
  number: 1 | 2 | 3;
  title: string;
  body: string;
  screenshot: string;
  alt: string;
};

const STEPS: readonly Step[] = [
  {
    number: 1,
    title: "Sign up free",
    body: "Google OAuth or email. 30 seconds. No credit card.",
    screenshot: "/marketing/how-it-works-step-1.png",
    alt: "Screenshot of the SeldonFrame signup form showing a Continue with Google button above an email field.",
  },
  {
    number: 2,
    title: "Paste your client's URL",
    body: "We extract their business, services, hours, and reviews automatically using your Anthropic key.",
    screenshot: "/marketing/how-it-works-step-2.png",
    alt: "Screenshot of the /clients/new page mid-extraction, with progress checkmarks for Fetching site, Extracting business facts, and Generating personality.",
  },
  {
    number: 3,
    title: "Workspace ready in 60 seconds",
    body: "CRM, booking page, intake form, AI chatbot, demo portal — all pre-wired and ready to hand over.",
    screenshot: "/marketing/how-it-works-step-3.png",
    alt: "Screenshot of a fresh SeldonFrame workspace dashboard with the CRM kanban, booking page link, and AI chatbot status all visible.",
  },
];

export function LandingHowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="mx-auto max-w-6xl border-t border-zinc-800/30 px-6 py-16 md:py-24"
    >
      <div className="text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          How it works
        </p>
        <h2 className="text-3xl font-bold text-zinc-100 md:text-4xl">
          From URL to a fully-wired client workspace, in 3 steps.
        </h2>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
        {STEPS.map((step) => (
          <div
            key={step.number}
            data-step={String(step.number)}
            className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-5"
          >
            <div className="mb-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#14b8a6]/15 text-sm font-bold text-[#14b8a6]">
              {step.number}
            </div>
            <h3 className="text-lg font-semibold text-zinc-100">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{step.body}</p>
            <div className="mt-5 overflow-hidden rounded-lg border border-zinc-800">
              <Image
                src={step.screenshot}
                alt={step.alt}
                width={640}
                height={400}
                className="h-auto w-full"
                unoptimized
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Add placeholder screenshots**

Use the same 1x1 GIF bytes (renamed to .png is invalid PNG; use a valid 1x1 PNG). On PowerShell:

```powershell
$png = [byte[]](0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00,0x00,0x00,0x0d,0x49,0x48,0x44,0x52,0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,0x08,0x06,0x00,0x00,0x00,0x1f,0x15,0xc4,0x89,0x00,0x00,0x00,0x0d,0x49,0x44,0x41,0x54,0x78,0x9c,0x63,0x00,0x01,0x00,0x00,0x05,0x00,0x01,0x0d,0x0a,0x2d,0xb4,0x00,0x00,0x00,0x00,0x49,0x45,0x4e,0x44,0xae,0x42,0x60,0x82)
foreach ($n in 1,2,3) {
  [System.IO.File]::WriteAllBytes("packages/crm/public/marketing/how-it-works-step-$n.png", $png)
}
```

Real screenshots are captured manually in Phase 9.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/crm && node --import tsx --test tests/unit/landing/how-it-works.spec.ts`
Expected: 5 PASS

- [ ] **Step 6: Commit**

```bash
git add packages/crm/src/components/landing/how-it-works-section.tsx packages/crm/tests/unit/landing/how-it-works.spec.ts packages/crm/public/marketing/how-it-works-step-1.png packages/crm/public/marketing/how-it-works-step-2.png packages/crm/public/marketing/how-it-works-step-3.png
git commit -m "feat(marketing): add How it works 3-step section"
```

### Task 2.2 — Thread the section into the home page

**Files:**
- Modify: `packages/crm/src/app/(public)/page.tsx`

- [ ] **Step 1: Add the import**

Add this import line after the existing `LandingHero` import:

```tsx
import { LandingHowItWorksSection } from "@/components/landing/how-it-works-section";
```

- [ ] **Step 2: Insert into `<main>`**

Modify the `<main>` block. The new order is:

```tsx
<main>
  <LandingHero />
  <LandingHowItWorksSection />
  <LandingSoulSection />
  <LandingSeldonItSection />
  <LandingBentoSection />
  <LandingAgenciesSection />
  <LandingMarketplaceSection />
  <LandingWhyNowSection />
  <LandingFinalCta />
</main>
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (no new errors).

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/app/(public)/page.tsx
git commit -m "feat(marketing): mount How it works section on home"
```

### Task 2.3 — design:design-system skill pass on the section

- [ ] **Step 1: Invoke skill**

Invoke `design:design-system` skill.

Feed it: contents of `how-it-works-section.tsx` + the existing `agencies-section.tsx` and `bento-section.tsx` for token reference. Ask whether step-card spacing, badge sizing, and image border radii match the established marketing system.

- [ ] **Step 2: Apply skill output inline**

Apply fixes to `how-it-works-section.tsx`. Re-run the test.

Run: `cd packages/crm && node --import tsx --test tests/unit/landing/how-it-works.spec.ts`
Expected: 5 PASS

- [ ] **Step 3: Commit (only if files changed)**

```bash
git add packages/crm/src/components/landing/how-it-works-section.tsx
git commit -m "style(marketing): design-system pass on How it works"
```

### Task 2.4 — design:ux-copy skill pass on all 8 strings in the section

- [ ] **Step 1: Invoke skill**

Invoke `design:ux-copy` skill.

Feed it: the section eyebrow ("How it works"), the h2 ("From URL to a fully-wired client workspace, in 3 steps."), and each of the 3 step `title` + `body` pairs (6 strings) + 3 image alt texts. Total: 8 visible strings + 3 alt texts. Audience: agency owner skimming the page. Goal: communicate that the flow is fast and concrete.

- [ ] **Step 2: Apply refined copy**

Apply skill output to `how-it-works-section.tsx`. If step titles change wording, update the regex assertions in `how-it-works.spec.ts` to track the new wording while still anchoring on "Sign up free", "paste"/"URL", and "60 seconds".

- [ ] **Step 3: Re-run test**

Run: `cd packages/crm && node --import tsx --test tests/unit/landing/how-it-works.spec.ts`
Expected: 5 PASS

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/components/landing/how-it-works-section.tsx packages/crm/tests/unit/landing/how-it-works.spec.ts
git commit -m "copy(marketing): refine How it works strings"
```

### Task 2.5 — design:design-critique skill pass on the section

- [ ] **Step 1: Invoke skill**

Invoke `design:design-critique` skill.

Feed it: the rendered section (screenshot or verbatim description). Ask whether visual rhythm carries the eye through the 3 steps, whether numbered badges are necessary or distracting, whether screenshots feel like proof rather than decoration.

- [ ] **Step 2: Apply fixes inline**

Apply high-impact critique fixes. Skip cosmetic suggestions.

- [ ] **Step 3: Re-run test + commit**

```bash
cd packages/crm && node --import tsx --test tests/unit/landing/how-it-works.spec.ts
git add packages/crm/src/components/landing/how-it-works-section.tsx
git commit -m "style(marketing): design-critique fixes on How it works"
```

---

## Phase 3 — Demo video section placeholder

The spec calls out a 60-second demo video as the centerpiece, but recording can't happen until Cuts A & B are shipped to prod. Phase 3 ships a placeholder GIF with the proper section shell so Phase 9 can swap in the real video by replacing a single file.

### Task 3.1 — Create the demo video section component

**Files:**
- Create: `packages/crm/src/components/landing/demo-video-section.tsx`

- [ ] **Step 1: Write the component**

```tsx
import Image from "next/image";

export function LandingDemoVideoSection() {
  // Phase 9 (week 6) swaps the GIF for the real /marketing/demo-video.mp4
  // by uncommenting the <video> block and removing the placeholder Image.
  return (
    <section
      id="demo"
      className="mx-auto max-w-5xl border-t border-zinc-800/30 px-6 py-16 md:py-24"
    >
      <div className="text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          See it in action
        </p>
        <h2 className="text-3xl font-bold text-zinc-100 md:text-4xl">
          60 seconds. Signup to live workspace.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-zinc-400">
          Watch the full flow: sign up with Google, paste a client URL, and walk through the CRM, booking
          page, intake form, AI chatbot, and demo portal that get built in under a minute.
        </p>
      </div>

      <div className="mt-10 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <Image
          src="/marketing/demo-placeholder.gif"
          alt="A 6-second animated preview of the SeldonFrame signup-to-workspace flow. The full 60-second narrated demo lands soon."
          width={1280}
          height={720}
          className="h-auto w-full motion-reduce:hidden"
          unoptimized
        />
        <div className="hidden h-[60px] items-center justify-center bg-zinc-900 px-6 text-sm text-zinc-500 motion-reduce:flex">
          Animated preview hidden because you prefer reduced motion. The full narrated demo lands soon.
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-zinc-600">
        Polished 60-second narrated demo ships in week 6.
      </p>
    </section>
  );
}
```

- [ ] **Step 2: Add the placeholder GIF**

```powershell
$gif = [byte[]](0x47,0x49,0x46,0x38,0x39,0x61,0x01,0x00,0x01,0x00,0x80,0x00,0x00,0xff,0xff,0xff,0x00,0x00,0x00,0x21,0xf9,0x04,0x00,0x00,0x00,0x00,0x00,0x2c,0x00,0x00,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0x02,0x02,0x44,0x01,0x00,0x3b)
[System.IO.File]::WriteAllBytes("packages/crm/public/marketing/demo-placeholder.gif", $gif)
```

- [ ] **Step 3: Mount in `(public)/page.tsx`**

Add the import:

```tsx
import { LandingDemoVideoSection } from "@/components/landing/demo-video-section";
```

Insert `<LandingDemoVideoSection />` between `<LandingBentoSection />` and `<LandingAgenciesSection />`:

```tsx
<main>
  <LandingHero />
  <LandingHowItWorksSection />
  <LandingSoulSection />
  <LandingSeldonItSection />
  <LandingBentoSection />
  <LandingDemoVideoSection />
  <LandingAgenciesSection />
  <LandingMarketplaceSection />
  <LandingWhyNowSection />
  <LandingFinalCta />
</main>
```

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm typecheck
git add packages/crm/src/components/landing/demo-video-section.tsx packages/crm/src/app/(public)/page.tsx packages/crm/public/marketing/demo-placeholder.gif
git commit -m "feat(marketing): add demo video section with placeholder GIF"
```

### Task 3.2 — design:design-system skill pass on the demo section

- [ ] **Step 1: Invoke skill**

Invoke `design:design-system` skill.

Feed it: the new `demo-video-section.tsx` + the existing `marketplace-section.tsx` for proportion reference. Ask whether the 16:9 aspect, border-radius, and surface color match the marketing token language.

- [ ] **Step 2: Apply skill output inline + commit**

```bash
git add packages/crm/src/components/landing/demo-video-section.tsx
git commit -m "style(marketing): design-system pass on demo video section"
```

### Task 3.3 — design:ux-copy skill pass on the demo section

- [ ] **Step 1: Invoke skill**

Invoke `design:ux-copy` skill.

Feed it: eyebrow ("See it in action"), h2 ("60 seconds. Signup to live workspace."), description paragraph, motion-reduce fallback, "Polished 60-second narrated demo ships in week 6." footer, and the placeholder GIF alt text. Audience: skeptical agency owner.

- [ ] **Step 2: Apply refined copy + commit**

```bash
git add packages/crm/src/components/landing/demo-video-section.tsx
git commit -m "copy(marketing): refine demo video section strings"
```

### Task 3.4 — design:design-critique skill pass on the demo section

- [ ] **Step 1: Invoke skill**

Invoke `design:design-critique` skill.

Feed it: a screenshot or description of the rendered section. Ask whether the placeholder feels intentional (week-6 promise) versus broken (missing asset). If the critique recommends adding a "subscribe for video" CTA, defer to a follow-up.

- [ ] **Step 2: Apply fixes inline + commit**

```bash
git add packages/crm/src/components/landing/demo-video-section.tsx
git commit -m "style(marketing): design-critique pass on demo video section"
```

---

## Phase 4 — Pricing comparison table

Per spec lines 280-292 the pricing matrix is the single source of truth across Cut B (gating) and Cut C (marketing). This phase displays the matrix verbatim. The tier names match Cut B (`free`, `growth`, `scale`) — Cut B is responsible for adding these to `lib/billing/features.ts`. If Cut B used different names, update the literal strings in this section without changing structure.

### Task 4.1 — Write failing tests for the pricing section

**Files:**
- Create: `packages/crm/tests/unit/landing/marketing-pricing.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { LandingMarketingPricingSection } from "../../../src/components/landing/marketing-pricing-section";

type AnyEl = { props?: Record<string, unknown>; type?: unknown };

function flatten(node: unknown, acc: AnyEl[] = []): AnyEl[] {
  if (!node || typeof node !== "object") return acc;
  const el = node as AnyEl;
  acc.push(el);
  const children = el.props?.children;
  if (Array.isArray(children)) for (const c of children) flatten(c, acc);
  else if (children) flatten(children, acc);
  return acc;
}

describe("LandingMarketingPricingSection — 3-column matrix", () => {
  test("renders 3 tier columns: Free, Growth, Scale", () => {
    const result = LandingMarketingPricingSection();
    const cols = flatten(result).filter(
      (el) =>
        typeof (el.props as { "data-tier"?: string })?.["data-tier"] === "string",
    );
    const tiers = cols.map((c) => (c.props as { "data-tier": string })["data-tier"]);
    assert.deepEqual(tiers, ["free", "growth", "scale"]);
  });

  test("each tier card surfaces its price label", () => {
    const result = LandingMarketingPricingSection();
    const text = JSON.stringify(result);
    assert.match(text, /\$0/);
    assert.match(text, /\$29/);
    assert.match(text, /\$99/);
  });

  test("Free column CTA links to /auth/signup", () => {
    const result = LandingMarketingPricingSection();
    const ctas = flatten(result).filter(
      (el) => (el.props as { "data-tier-cta"?: string })?.["data-tier-cta"] === "free",
    );
    assert.equal(ctas.length, 1);
    assert.equal(
      (ctas[0].props as { href?: string }).href,
      "/auth/signup",
    );
  });

  test("Growth + Scale CTAs link to /auth/signup with plan query param", () => {
    const result = LandingMarketingPricingSection();
    const growthCta = flatten(result).find(
      (el) => (el.props as { "data-tier-cta"?: string })?.["data-tier-cta"] === "growth",
    );
    const scaleCta = flatten(result).find(
      (el) => (el.props as { "data-tier-cta"?: string })?.["data-tier-cta"] === "scale",
    );
    assert.equal(
      (growthCta?.props as { href?: string } | undefined)?.href,
      "/auth/signup?plan=growth",
    );
    assert.equal(
      (scaleCta?.props as { href?: string } | undefined)?.href,
      "/auth/signup?plan=scale",
    );
  });

  test("all 10 feature rows from spec §Cut B render", () => {
    const result = LandingMarketingPricingSection();
    const text = JSON.stringify(result);
    for (const label of [
      "Workspaces",
      "BYOK Anthropic key",
      "Unlimited contacts",
      "branding hidden",
      "Custom domain",
      "Client portal",
      "AI agents",
      "white-label",
      "Priority support",
      "Claude Code MCP",
    ]) {
      assert.match(text, new RegExp(label, "i"), `missing feature row: ${label}`);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/crm && node --import tsx --test tests/unit/landing/marketing-pricing.spec.ts`
Expected: FAIL — `Cannot find module marketing-pricing-section`

- [ ] **Step 3: Create the pricing section**

Create `packages/crm/src/components/landing/marketing-pricing-section.tsx`:

```tsx
import Link from "next/link";
import { Check, Minus } from "lucide-react";

type TierKey = "free" | "growth" | "scale";

type Tier = {
  key: TierKey;
  name: string;
  price: string;
  period: string;
  tagline: string;
  ctaLabel: string;
  ctaHref: string;
  highlighted?: boolean;
};

type FeatureRow = {
  label: string;
  values: Readonly<Record<TierKey, string | boolean>>;
};

const TIERS: readonly Tier[] = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    tagline: "1 workspace. BYOK. Try the whole product.",
    ctaLabel: "Sign Up Free",
    ctaHref: "/auth/signup",
  },
  {
    key: "growth",
    name: "Growth",
    price: "$29",
    period: "/month",
    tagline: "3 workspaces, custom domains, no SeldonFrame branding.",
    ctaLabel: "Start free trial",
    ctaHref: "/auth/signup?plan=growth",
    highlighted: true,
  },
  {
    key: "scale",
    name: "Scale",
    price: "$99",
    period: "/month",
    tagline: "Unlimited workspaces, AI agents, full white-label.",
    ctaLabel: "Start free trial",
    ctaHref: "/auth/signup?plan=scale",
  },
];

// Source of truth: spec §Cut B tier features table, lines 280-292.
const FEATURES: readonly FeatureRow[] = [
  { label: "Workspaces", values: { free: "1", growth: "3", scale: "Unlimited" } },
  { label: "BYOK Anthropic key", values: { free: true, growth: true, scale: "✓ (or managed)" } },
  { label: "Unlimited contacts per workspace", values: { free: true, growth: true, scale: true } },
  { label: "SeldonFrame branding hidden", values: { free: false, growth: true, scale: true } },
  { label: "Custom domain per client", values: { free: false, growth: true, scale: true } },
  { label: "Client portal access", values: { free: false, growth: true, scale: true } },
  {
    label: "AI agents (Speed-to-Lead, Win-Back, Review Requester)",
    values: { free: false, growth: false, scale: true },
  },
  { label: "Full white-label client portal", values: { free: false, growth: false, scale: true } },
  { label: "Priority support", values: { free: false, growth: false, scale: true } },
  { label: "Claude Code MCP access", values: { free: true, growth: true, scale: true } },
];

function renderCell(value: string | boolean) {
  if (value === true) {
    return <Check size={16} className="mx-auto text-[#14b8a6]" aria-label="Included" />;
  }
  if (value === false) {
    return <Minus size={16} className="mx-auto text-zinc-700" aria-label="Not included" />;
  }
  return <span className="text-sm text-zinc-200">{value}</span>;
}

export function LandingMarketingPricingSection() {
  return (
    <section
      id="pricing"
      className="mx-auto max-w-6xl border-t border-zinc-800/30 px-6 py-16 md:py-24"
    >
      <div className="text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Pricing
        </p>
        <h2 className="text-3xl font-bold text-zinc-100 md:text-4xl">
          Start free. Upgrade when you need more clients.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-zinc-400">
          Workspaces are per-client. Every tier includes unlimited contacts, bookings, and your own
          Anthropic key.
        </p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
        {TIERS.map((tier) => (
          <article
            key={tier.key}
            data-tier={tier.key}
            className={`relative flex flex-col rounded-2xl border p-6 ${
              tier.highlighted
                ? "border-[#14b8a6]/50 bg-zinc-900"
                : "border-zinc-800 bg-zinc-900"
            }`}
          >
            {tier.highlighted ? (
              <span className="absolute right-4 top-4 rounded-full border border-[#14b8a6]/40 bg-[#14b8a6]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#14b8a6]">
                Recommended
              </span>
            ) : null}
            <h3 className="text-lg font-semibold text-zinc-100">{tier.name}</h3>
            <p className="mt-1 text-sm text-zinc-400">{tier.tagline}</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-bold text-zinc-100">{tier.price}</span>
              <span className="text-sm text-zinc-500">{tier.period}</span>
            </div>
            <Link
              href={tier.ctaHref}
              data-tier-cta={tier.key}
              className={`mt-6 inline-flex items-center justify-center rounded-xl px-6 py-3 font-semibold transition-opacity ${
                tier.highlighted
                  ? "bg-[#14b8a6] text-white hover:opacity-90"
                  : "border border-zinc-700 text-zinc-200 hover:border-zinc-500"
              }`}
            >
              {tier.ctaLabel}
            </Link>
          </article>
        ))}
      </div>

      <div className="mt-10 overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">Tier feature comparison</caption>
          <thead>
            <tr className="bg-zinc-900/50">
              <th scope="col" className="p-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Feature
              </th>
              {TIERS.map((tier) => (
                <th
                  key={tier.key}
                  scope="col"
                  className="p-4 text-center text-xs font-semibold uppercase tracking-wider text-zinc-500"
                >
                  {tier.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FEATURES.map((row) => (
              <tr key={row.label} className="border-t border-zinc-800/60">
                <th scope="row" className="p-4 text-left font-normal text-zinc-300">
                  {row.label}
                </th>
                {TIERS.map((tier) => (
                  <td key={tier.key} className="p-4 text-center">
                    {renderCell(row.values[tier.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/crm && node --import tsx --test tests/unit/landing/marketing-pricing.spec.ts`
Expected: 5 PASS

- [ ] **Step 5: Mount on home page**

Modify `packages/crm/src/app/(public)/page.tsx`:

Add the import:

```tsx
import { LandingMarketingPricingSection } from "@/components/landing/marketing-pricing-section";
```

Insert in `<main>` between `<LandingMarketplaceSection />` and `<LandingWhyNowSection />`:

```tsx
<main>
  <LandingHero />
  <LandingHowItWorksSection />
  <LandingSoulSection />
  <LandingSeldonItSection />
  <LandingBentoSection />
  <LandingDemoVideoSection />
  <LandingAgenciesSection />
  <LandingMarketplaceSection />
  <LandingMarketingPricingSection />
  <LandingWhyNowSection />
  <LandingFinalCta />
</main>
```

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm typecheck
git add packages/crm/src/components/landing/marketing-pricing-section.tsx packages/crm/tests/unit/landing/marketing-pricing.spec.ts packages/crm/src/app/(public)/page.tsx
git commit -m "feat(marketing): add Free/Growth/Scale pricing section"
```

### Task 4.2 — design:design-system skill pass on pricing

- [ ] **Step 1: Invoke skill**

Invoke `design:design-system` skill.

Feed it: `marketing-pricing-section.tsx` + the existing in-product `packages/crm/src/components/marketing/landing-pricing-section.tsx` for visual continuity reference. Confirm card padding, table border colors, and the highlighted-tier accent treatment match the marketing palette.

- [ ] **Step 2: Apply fixes inline + commit**

```bash
cd packages/crm && node --import tsx --test tests/unit/landing/marketing-pricing.spec.ts
git add packages/crm/src/components/landing/marketing-pricing-section.tsx
git commit -m "style(marketing): design-system pass on pricing section"
```

### Task 4.3 — design:ux-copy skill pass on every pricing string

- [ ] **Step 1: Invoke skill**

Invoke `design:ux-copy` skill.

Feed it: section eyebrow, h2, subtitle, every tier `name`/`tagline`/`ctaLabel` (9 strings), and every feature `label` (10 strings). Audience: agency owner deciding whether $29 is worth it. Goal: highlight what they save by upgrading without sounding pushy.

- [ ] **Step 2: Apply refined copy**

If any tier label changes (e.g. "Free" → "Solo"), update the regex in `marketing-pricing.spec.ts` while keeping the `data-tier` attribute values constant (`free`, `growth`, `scale`).

- [ ] **Step 3: Re-run test + commit**

```bash
cd packages/crm && node --import tsx --test tests/unit/landing/marketing-pricing.spec.ts
git add packages/crm/src/components/landing/marketing-pricing-section.tsx packages/crm/tests/unit/landing/marketing-pricing.spec.ts
git commit -m "copy(marketing): refine pricing section strings"
```

### Task 4.4 — design:design-critique skill pass on pricing

- [ ] **Step 1: Invoke skill**

Invoke `design:design-critique` skill.

Feed it: rendered section. Ask: does the Growth tier feel like the obvious next step from Free? Is the feature table scannable or overwhelming? Does the "Recommended" badge land?

- [ ] **Step 2: Apply fixes inline + commit**

```bash
cd packages/crm && node --import tsx --test tests/unit/landing/marketing-pricing.spec.ts
git add packages/crm/src/components/landing/marketing-pricing-section.tsx
git commit -m "style(marketing): design-critique fixes on pricing"
```

### Task 4.5 — design:accessibility-review skill pass on pricing

The pricing table is the most accessibility-sensitive surface in Cut C (table semantics, icon-only feature cells, color-only emphasis on the highlighted tier).

- [ ] **Step 1: Invoke skill**

Invoke `design:accessibility-review` skill.

Feed it: `marketing-pricing-section.tsx`. Specifically ask it to check:
- Color contrast on `#14b8a6` text and on zinc-500 captions.
- Keyboard nav order through tier CTAs (3 cards) then table cells.
- Screen reader behavior on `<Check>` and `<Minus>` icons (we added `aria-label`, verify it reads sensibly).
- Whether the `<caption className="sr-only">` is announced.
- Whether the "Recommended" badge is exposed to AT (it's visual-only today).

- [ ] **Step 2: Apply fixes inline**

Likely fixes: tighten contrast, add `aria-label` to the highlighted card, ensure `<th scope>` is correct on both axes.

- [ ] **Step 3: Re-run test + commit**

```bash
cd packages/crm && node --import tsx --test tests/unit/landing/marketing-pricing.spec.ts
git add packages/crm/src/components/landing/marketing-pricing-section.tsx
git commit -m "a11y(marketing): accessibility-review fixes on pricing"
```

### Task 4.6 — Verify exact feature labels match Cut B enum

The pricing matrix copy must stay in sync with Cut B's `hasFeature(orgId, featureName)` enum. Cross-check the rows:

| Spec row label | Cut B feature flag |
|---|---|
| `Workspaces` | (count, not a flag) |
| `BYOK Anthropic key` | (no flag, baseline) |
| `Unlimited contacts per workspace` | (no flag, baseline) |
| `SeldonFrame branding hidden` | `branding_hidden` |
| `Custom domain per client` | `custom_domain` |
| `Client portal access` | `client_portal` |
| `AI agents (Speed-to-Lead, Win-Back, Review Requester)` | `ai_agents` |
| `Full white-label client portal` | `white_label_portal` |
| `Priority support` | `priority_support` |
| `Claude Code MCP access` | (no flag, baseline) |

- [ ] **Step 1: Read Cut B's `lib/billing/features.ts`**

Run: open `packages/crm/src/lib/billing/features.ts` and confirm each of the 6 flag names above is exported.

- [ ] **Step 2: If a flag name has drifted, update the table doc comment**

If a flag was renamed (e.g. `branding_hidden` → `hide_branding`), do NOT change the visible feature label — only update the inline doc comment in `marketing-pricing-section.tsx` to mirror the actual flag name.

- [ ] **Step 3: Commit (only if changes)**

```bash
git add packages/crm/src/components/landing/marketing-pricing-section.tsx
git commit -m "docs(marketing): sync pricing feature labels with Cut B flag names"
```

---

## Phase 5 — "Built for agencies, MIT-licensed" + GitHub stars badge

The spec calls it "MIT-licensed" in the section name (line 360-364), but the existing footer says "MIT license" and the source code header in the repo says AGPL-3.0. Match whatever the actual `LICENSE` file says — verify and use that exact string. The plan below assumes "MIT" to match the current footer; adjust if `LICENSE` says otherwise.

### Task 5.1 — Write failing test for the open-source section + GitHub stars badge

**Files:**
- Create: `packages/crm/tests/unit/landing/open-source-section.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { GitHubStarsBadge } from "../../../src/components/landing/github-stars-badge";

describe("GitHubStarsBadge", () => {
  test("formats 4-digit star count with k suffix", () => {
    const result = GitHubStarsBadge({ stars: 1234 });
    const text = JSON.stringify(result);
    assert.match(text, /1\.2k|1\.2K/);
  });

  test("formats 6-digit star count with k suffix", () => {
    const result = GitHubStarsBadge({ stars: 134567 });
    const text = JSON.stringify(result);
    assert.match(text, /134k|134K/);
  });

  test("uses raw number under 1000", () => {
    const result = GitHubStarsBadge({ stars: 42 });
    const text = JSON.stringify(result);
    assert.match(text, />42</);
  });

  test("falls back to 'GitHub' when stars is null", () => {
    const result = GitHubStarsBadge({ stars: null });
    const text = JSON.stringify(result);
    assert.match(text, /GitHub/);
    assert.doesNotMatch(text, /\d+/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/crm && node --import tsx --test tests/unit/landing/open-source-section.spec.ts`
Expected: FAIL — `Cannot find module github-stars-badge`

- [ ] **Step 3: Implement the stars badge**

Create `packages/crm/src/components/landing/github-stars-badge.tsx`:

```tsx
import Link from "next/link";
import { Star, Github } from "lucide-react";

function formatStars(stars: number): string {
  if (stars >= 1000) {
    const k = stars / 1000;
    return k >= 100 ? `${Math.round(k)}k` : `${k.toFixed(1)}k`;
  }
  return String(stars);
}

export function GitHubStarsBadge({ stars }: { stars: number | null }) {
  return (
    <Link
      href="https://github.com/seldonframe/crm"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-200 transition-colors hover:border-zinc-500"
    >
      <Github size={16} />
      <span>seldonframe/crm</span>
      {stars !== null ? (
        <span className="flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
          <Star size={12} className="text-[#14b8a6]" />
          {formatStars(stars)}
        </span>
      ) : null}
    </Link>
  );
}

// Server-side fetch with revalidate cache. Wrap in async server component
// for use in the section.
export async function fetchStarCount(): Promise<number | null> {
  try {
    const res = await fetch("https://api.github.com/repos/seldonframe/crm", {
      next: { revalidate: 3600 }, // 1 hour
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { stargazers_count?: number };
    return typeof data.stargazers_count === "number" ? data.stargazers_count : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/crm && node --import tsx --test tests/unit/landing/open-source-section.spec.ts`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/components/landing/github-stars-badge.tsx packages/crm/tests/unit/landing/open-source-section.spec.ts
git commit -m "feat(marketing): add GitHubStarsBadge with live count"
```

### Task 5.2 — Create the open-source section + verify license string

- [ ] **Step 1: Check the repo `LICENSE` file**

Run: `Read` on `LICENSE` (repo root) and note the exact license name (MIT vs AGPL-3.0). The spec text says "MIT-licensed" in the section heading but the footer copy already says "MIT license" — use whatever `LICENSE` says. The plan below uses `MIT`; substitute if the repo file disagrees.

- [ ] **Step 2: Create the section component**

Create `packages/crm/src/components/landing/open-source-section.tsx`:

```tsx
import { Server, Plug, Code2 } from "lucide-react";
import { GitHubStarsBadge, fetchStarCount } from "@/components/landing/github-stars-badge";

const PILLARS = [
  { icon: Code2, label: "MIT licensed", body: "Fork it, modify it, ship it. No license fees." },
  { icon: Plug, label: "MCP-native", body: "Use Claude Code as your power-user surface." },
  { icon: Server, label: "Self-hostable", body: "docker compose up. Your hardware, your data." },
];

export async function LandingOpenSourceSection() {
  const stars = await fetchStarCount();

  return (
    <section
      id="open-source"
      className="mx-auto max-w-5xl border-t border-zinc-800/30 px-6 py-16 md:py-24"
    >
      <div className="text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Open source
        </p>
        <h2 className="text-3xl font-bold text-zinc-100 md:text-4xl">
          Built for agencies. MIT-licensed.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-zinc-400">
          Self-host SeldonFrame with <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-sm text-zinc-300">docker compose up</code>, or use SeldonFrame Cloud and let us run it.
        </p>
        <div className="mt-6 flex justify-center">
          <GitHubStarsBadge stars={stars} />
        </div>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
        {PILLARS.map((pillar) => {
          const Icon = pillar.icon;
          return (
            <div
              key={pillar.label}
              className="flex flex-col items-start rounded-xl border border-zinc-800 bg-zinc-900 p-5"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#14b8a6]/10 text-[#14b8a6]">
                <Icon size={20} />
              </div>
              <h3 className="mt-4 text-base font-semibold text-zinc-100">{pillar.label}</h3>
              <p className="mt-1 text-sm leading-relaxed text-zinc-400">{pillar.body}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Mount on home page**

Modify `packages/crm/src/app/(public)/page.tsx`. Add:

```tsx
import { LandingOpenSourceSection } from "@/components/landing/open-source-section";
```

Insert `<LandingOpenSourceSection />` between `<LandingMarketingPricingSection />` and `<LandingWhyNowSection />`:

```tsx
<main>
  <LandingHero />
  <LandingHowItWorksSection />
  <LandingSoulSection />
  <LandingSeldonItSection />
  <LandingBentoSection />
  <LandingDemoVideoSection />
  <LandingAgenciesSection />
  <LandingMarketplaceSection />
  <LandingMarketingPricingSection />
  <LandingOpenSourceSection />
  <LandingWhyNowSection />
  <LandingFinalCta />
</main>
```

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm typecheck
git add packages/crm/src/components/landing/open-source-section.tsx packages/crm/src/app/(public)/page.tsx
git commit -m "feat(marketing): add open-source section with GitHub stars"
```

### Task 5.3 — design:design-system + ux-copy combined pass on open-source section

- [ ] **Step 1: Invoke design:design-system**

Feed it the new `open-source-section.tsx` + the existing `marketplace-section.tsx`. Confirm pillar card layout, icon treatment, and spacing match.

- [ ] **Step 2: Invoke design:ux-copy**

Feed it the eyebrow, h2, intro paragraph, 3 pillar labels, 3 pillar bodies. Audience: agency owner evaluating switching costs and lock-in fears.

- [ ] **Step 3: Apply both passes + commit**

```bash
git add packages/crm/src/components/landing/open-source-section.tsx
git commit -m "style(marketing): design-system + ux-copy pass on open-source section"
```

### Task 5.4 — design:design-critique skill pass on the open-source section

- [ ] **Step 1: Invoke skill**

Invoke `design:design-critique` skill.

Feed it the rendered section. Ask whether the stars badge feels like proof or decoration; whether the 3 pillars are sufficient or whether one obvious agency objection (data ownership? GDPR?) is missing.

- [ ] **Step 2: Apply fixes inline + commit**

```bash
git add packages/crm/src/components/landing/open-source-section.tsx
git commit -m "style(marketing): design-critique pass on open-source section"
```

---

## Phase 6 — FAQ refresh (new section)

There is no existing FAQ component on the marketing home page. The Puck-based `sections/faq.tsx` is for in-product page builder use — out of scope. This phase creates a new `LandingMarketingFaqSection` with the 6 agency-focused Q&As from spec lines 366-373.

### Task 6.1 — Write failing test for the FAQ section

**Files:**
- Create: `packages/crm/tests/unit/landing/marketing-faq.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { LandingMarketingFaqSection } from "../../../src/components/landing/marketing-faq-section";

type AnyEl = { props?: Record<string, unknown>; type?: unknown };

function flatten(node: unknown, acc: AnyEl[] = []): AnyEl[] {
  if (!node || typeof node !== "object") return acc;
  const el = node as AnyEl;
  acc.push(el);
  const children = el.props?.children;
  if (Array.isArray(children)) for (const c of children) flatten(c, acc);
  else if (children) flatten(children, acc);
  return acc;
}

const EXPECTED_QUESTIONS = [
  /white-label/i,
  /own domain/i,
  /Anthropic API key/i,
  /how many client workspaces/i,
  /Claude Code/i,
  /isolated/i,
];

describe("LandingMarketingFaqSection — 6 agency-focused Q&A", () => {
  test("renders exactly 6 <details> entries", () => {
    const result = LandingMarketingFaqSection();
    const details = flatten(result).filter((el) => el.type === "details");
    assert.equal(details.length, 6);
  });

  test("each expected question pattern matches at least once", () => {
    const result = LandingMarketingFaqSection();
    const text = JSON.stringify(result);
    for (const pattern of EXPECTED_QUESTIONS) {
      assert.match(text, pattern);
    }
  });

  test("answer for white-label mentions both Growth and Scale", () => {
    const result = LandingMarketingFaqSection();
    const text = JSON.stringify(result);
    assert.match(text, /Growth/);
    assert.match(text, /Scale/);
  });

  test("answer for BYOK explicitly says all tiers", () => {
    const result = LandingMarketingFaqSection();
    const text = JSON.stringify(result);
    assert.match(text, /all tiers/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd packages/crm && node --import tsx --test tests/unit/landing/marketing-faq.spec.ts`
Expected: FAIL — `Cannot find module marketing-faq-section`

- [ ] **Step 3: Create the FAQ section**

Create `packages/crm/src/components/landing/marketing-faq-section.tsx`:

```tsx
type FaqItem = { question: string; answer: string };

// Source: spec lines 366-373. Verbatim Q&A copy lands here; the
// design:ux-copy task that follows refines the answers.
const FAQS: readonly FaqItem[] = [
  {
    question: "Can I white-label this for my clients?",
    answer:
      "Yes. On Growth ($29/mo) the SeldonFrame branding is hidden across the landing page, client portal, and emails. On Scale ($99/mo) you get full white-label of the client portal too.",
  },
  {
    question: "What if my client wants their own domain?",
    answer:
      "Custom domain per workspace is included on Growth and Scale. Each client workspace gets its own DNS-mapped domain — yourclient.com, not yourclient.seldonframe.com.",
  },
  {
    question: "Does it work with my existing Anthropic API key?",
    answer:
      "Yes — BYOK Anthropic key is supported on all tiers, including Free. Your key, your bill from Anthropic. We never proxy or store the key in plaintext.",
  },
  {
    question: "How many client workspaces can I create?",
    answer:
      "1 on Free, 3 on Growth, unlimited on Scale. Workspaces are the upgrade lever — features (custom domain, white-label, AI agents) layer on top by tier.",
  },
  {
    question: "Can I use Claude Code instead of the web?",
    answer:
      "Yes — both paths share the same backend. The Claude Code MCP power-user path stays free on every tier. Use the web to onboard non-technical teammates; use Claude Code when you want full programmatic control.",
  },
  {
    question: "Is my client data isolated between workspaces?",
    answer:
      "Yes. Each workspace is an independent org with full data isolation: separate CRM contacts, separate booking calendar, separate AI chatbot conversations. There is no cross-workspace read path.",
  },
];

export function LandingMarketingFaqSection() {
  return (
    <section
      id="faq"
      className="mx-auto max-w-4xl border-t border-zinc-800/30 px-6 py-16 md:py-24"
    >
      <div className="text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          FAQ
        </p>
        <h2 className="text-3xl font-bold text-zinc-100 md:text-4xl">
          Agency questions, answered.
        </h2>
      </div>

      <div className="mt-10 space-y-3">
        {FAQS.map((faq) => (
          <details
            key={faq.question}
            className="group rounded-xl border border-zinc-800 bg-zinc-900 p-5"
          >
            <summary className="cursor-pointer list-none text-base font-semibold text-zinc-100 group-open:text-[#14b8a6]">
              {faq.question}
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">{faq.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/crm && node --import tsx --test tests/unit/landing/marketing-faq.spec.ts`
Expected: 4 PASS

- [ ] **Step 5: Mount on home page**

Modify `packages/crm/src/app/(public)/page.tsx`. Add:

```tsx
import { LandingMarketingFaqSection } from "@/components/landing/marketing-faq-section";
```

Insert between `<LandingOpenSourceSection />` and `<LandingWhyNowSection />`:

```tsx
<main>
  <LandingHero />
  <LandingHowItWorksSection />
  <LandingSoulSection />
  <LandingSeldonItSection />
  <LandingBentoSection />
  <LandingDemoVideoSection />
  <LandingAgenciesSection />
  <LandingMarketplaceSection />
  <LandingMarketingPricingSection />
  <LandingOpenSourceSection />
  <LandingMarketingFaqSection />
  <LandingWhyNowSection />
  <LandingFinalCta />
</main>
```

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm typecheck
git add packages/crm/src/components/landing/marketing-faq-section.tsx packages/crm/tests/unit/landing/marketing-faq.spec.ts packages/crm/src/app/(public)/page.tsx
git commit -m "feat(marketing): add 6-question agency-focused FAQ section"
```

### Task 6.2 — design:design-system skill pass on FAQ

- [ ] **Step 1: Invoke skill**

Invoke `design:design-system` skill.

Feed it `marketing-faq-section.tsx` + the existing Puck-renderable `sections/faq.tsx` for token-style continuity. Confirm `<details>`/`<summary>` styling, open-state accent color, spacing rhythm match the home-page palette.

- [ ] **Step 2: Apply fixes + commit**

```bash
cd packages/crm && node --import tsx --test tests/unit/landing/marketing-faq.spec.ts
git add packages/crm/src/components/landing/marketing-faq-section.tsx
git commit -m "style(marketing): design-system pass on FAQ section"
```

### Task 6.3 — design:ux-copy skill pass on every Q and A

- [ ] **Step 1: Invoke skill**

Invoke `design:ux-copy` skill.

Feed it: eyebrow ("FAQ"), h2 ("Agency questions, answered."), and all 6 `question`/`answer` pairs (12 strings). Audience: agency owner doing due diligence before signup. Goal: confidence-building, concrete, no marketing fluff.

- [ ] **Step 2: Apply refined copy**

If question wording shifts, update the `EXPECTED_QUESTIONS` regex array in `marketing-faq.spec.ts` to track the new wording while keeping the conceptual anchors (white-label, domain, Anthropic key, workspace count, Claude Code, isolation).

- [ ] **Step 3: Re-run test + commit**

```bash
cd packages/crm && node --import tsx --test tests/unit/landing/marketing-faq.spec.ts
git add packages/crm/src/components/landing/marketing-faq-section.tsx packages/crm/tests/unit/landing/marketing-faq.spec.ts
git commit -m "copy(marketing): refine FAQ Q&A via ux-copy skill"
```

### Task 6.4 — design:design-critique skill pass on FAQ

- [ ] **Step 1: Invoke skill**

Invoke `design:design-critique` skill.

Feed it the rendered section. Ask whether 6 Qs is the right number (cut to 5 if any feels redundant), whether the order leads with the highest-objection question, whether the answer length feels right (not too terse, not a wall).

- [ ] **Step 2: Apply fixes inline + commit**

```bash
git add packages/crm/src/components/landing/marketing-faq-section.tsx
git commit -m "style(marketing): design-critique fixes on FAQ"
```

---

## Phase 7 — Footer refresh

### Task 7.1 — Replace stub footer with real links + prominent GitHub block

**Files:**
- Modify: `packages/crm/src/components/landing/footer.tsx`

- [ ] **Step 1: Replace footer contents**

Replace the entire body of `footer.tsx` with:

```tsx
import Link from "next/link";
import { Github, ExternalLink } from "lucide-react";

const PRODUCT_LINKS = [
  { label: "Pricing", href: "/pricing" },
  { label: "Docs", href: "/docs" },
  { label: "Demo", href: "/demo" },
  { label: "Soul Marketplace", href: "/soul-marketplace" },
];

const RESOURCE_LINKS = [
  { label: "Blog", href: "/blog" },
  { label: "Claude Code MCP", href: "/docs/claude-code-mcp" },
  { label: "Changelog", href: "/changelog" },
];

const LEGAL_LINKS = [
  { label: "Privacy", href: "https://app.seldonframe.com/policy" },
  { label: "Terms", href: "https://app.seldonframe.com/terms" },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-zinc-800/30 py-12">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mb-10 flex flex-col items-start justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5 md:flex-row md:items-center">
          <div>
            <p className="text-sm font-semibold text-zinc-100">Open source on GitHub</p>
            <p className="mt-1 text-xs text-zinc-500">
              Star the repo, file an issue, or fork it. PRs welcome.
            </p>
          </div>
          <Link
            href="https://github.com/seldonframe/crm"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Github size={16} />
            View on GitHub
            <ExternalLink size={12} />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <span className="text-sm font-semibold text-zinc-100">SeldonFrame</span>
            <p className="mt-4 text-xs leading-relaxed text-zinc-700">
              © 2026 SeldonFrame. <br />
              Open source under MIT license.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Product</span>
            {PRODUCT_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-xs text-zinc-600 transition-colors hover:text-zinc-400"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              Resources
            </span>
            {RESOURCE_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-xs text-zinc-600 transition-colors hover:text-zinc-400"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Legal</span>
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-xs text-zinc-600 transition-colors hover:text-zinc-400"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm typecheck
git add packages/crm/src/components/landing/footer.tsx
git commit -m "feat(marketing): refresh footer with prominent GitHub block"
```

### Task 7.2 — design:ux-copy + design:design-system combined pass on footer

- [ ] **Step 1: Invoke design:ux-copy**

Feed it the GitHub block heading ("Open source on GitHub"), sub-line ("Star the repo, file an issue, or fork it. PRs welcome."), CTA label ("View on GitHub"), and all link labels (4 product + 3 resources + 2 legal). Audience: returning visitor, footer is the last chance.

- [ ] **Step 2: Invoke design:design-system**

Feed it the refreshed `footer.tsx`. Verify it matches the marketing palette and matches the nav's GitHub link treatment.

- [ ] **Step 3: Apply fixes inline + commit**

```bash
git add packages/crm/src/components/landing/footer.tsx
git commit -m "style(marketing): design-system + ux-copy pass on footer"
```

---

## Phase 8 — Full-page design + accessibility review

The per-section design passes are done. This phase runs the two highest-level reviews across the whole page as a single unit, then ships.

### Task 8.1 — design:design-critique skill pass on the full home page

- [ ] **Step 1: Invoke skill**

Invoke `design:design-critique` skill.

Feed it: a full-page screenshot of `localhost:3000/` (or, if no dev server, the section-by-section list:
1. Hero (2 CTAs + 6-sec loop)
2. How it works (3 step cards)
3. Soul section (unchanged)
4. Seldon It section (unchanged)
5. Bento section (unchanged)
6. Demo video (placeholder GIF)
7. Agencies section (unchanged, $349/mo Pro 10 callout — flag if it conflicts with new pricing)
8. Marketplace section (unchanged)
9. Marketing pricing (Free/Growth/Scale table)
10. Open-source section (3 pillars + stars badge)
11. FAQ (6 questions)
12. Why Now section (unchanged)
13. Final CTA (unchanged "Try it now" — flag if it conflicts with new "Sign Up Free" hierarchy)
14. Footer (GitHub block + 3 columns)

Ask: does the page have a coherent narrative? Are there sections that should be deleted, reordered, or merged? Are the unchanged sections (#3-5, #7-8, #12-13) earning their slot or padding the page?

- [ ] **Step 2: Triage critique into 3 buckets**

a) **Fix now** — anything that breaks the funnel (e.g. final CTA contradicts hero CTA hierarchy).
b) **Spawn task** — anything that needs more design work than fits in this Cut (e.g. "Reorder Soul/Seldon-It sections" or "Replace Agencies section stale stats"). Use `mcp__ccd_session__spawn_task` to flag these.
c) **Skip** — cosmetic suggestions that don't move the conversion needle.

- [ ] **Step 3: Apply bucket-(a) fixes inline + commit**

```bash
git add -p
git commit -m "style(marketing): full-page design-critique fixes"
```

### Task 8.2 — design:accessibility-review skill pass on the full home page

- [ ] **Step 1: Invoke skill**

Invoke `design:accessibility-review` skill.

Feed it: the full list of new + modified components — `hero.tsx`, `how-it-works-section.tsx`, `demo-video-section.tsx`, `marketing-pricing-section.tsx`, `open-source-section.tsx`, `github-stars-badge.tsx`, `marketing-faq-section.tsx`, `footer.tsx`, `nav.tsx`. Specifically request WCAG 2.1 AA review on:
- Color contrast on every text-on-background pair (especially zinc-500 captions on `#09090b`, `#14b8a6` text on zinc-900).
- Reduced-motion handling on the hero loop GIF and demo placeholder GIF (we use `motion-reduce:hidden` + a text fallback — verify the fallback announces correctly).
- Alt text on all marketing screenshots.
- Keyboard nav order: tab through nav → hero CTAs → how-it-works links → demo → pricing tier CTAs → pricing table cells → open-source stars badge → FAQ summaries → footer GitHub CTA → footer links.
- `<details>`/`<summary>` keyboard behavior (Enter/Space toggles).
- Focus-visible rings on every interactive element.

- [ ] **Step 2: Apply WCAG fixes inline**

Likely fixes: bump zinc-500 captions to zinc-400 for contrast, add `focus-visible:ring-2 focus-visible:ring-[#14b8a6]` to all CTAs, add `aria-label` to the GitHub icon links, swap any color-only state cues for color + iconography.

- [ ] **Step 3: Re-run all landing tests + commit**

```bash
cd packages/crm && node --import tsx --test tests/unit/landing/hero-cta.spec.ts tests/unit/landing/how-it-works.spec.ts tests/unit/landing/marketing-pricing.spec.ts tests/unit/landing/open-source-section.spec.ts tests/unit/landing/marketing-faq.spec.ts
pnpm typecheck
git add -p
git commit -m "a11y(marketing): WCAG 2.1 AA fixes across home page"
```

---

## Phase 9 — Demo video recording + screenshot swap (MANUAL, WEEK 6)

This phase has no shell commands for the recording itself — Claude Code can't record a screencast or operate a real browser session well enough to produce a polished asset. Surface this as a manual operator task at week-6 cutover.

### Task 9.1 — Manual asset capture and swap (operator runs)

- [ ] **Step 1: Record real assets**

Operator records:
1. A 6-second hero loop (signup → paste URL → workspace card appears). Save as `packages/crm/public/marketing/hero-loop.gif` — overwrite the placeholder.
2. A 60-second narrated demo (signup → paste URL → workspace ready → chatbot conversation → client portal demo). Save as `packages/crm/public/marketing/demo-video.mp4`.
3. Real screenshots for the 3 "How it works" cards:
   - `how-it-works-step-1.png`: full `/auth/signup` page with Google button visible.
   - `how-it-works-step-2.png`: `/clients/new` page mid-extraction with at least 3 progress checkmarks visible.
   - `how-it-works-step-3.png`: a fresh workspace dashboard with CRM kanban + booking + chatbot panels.

Compress GIFs to <2 MB and MP4 to <8 MB before committing.

- [ ] **Step 2: Swap the demo video section from GIF to MP4**

Edit `packages/crm/src/components/landing/demo-video-section.tsx`. Replace the `<Image src="/marketing/demo-placeholder.gif" ... />` block with:

```tsx
<video
  src="/marketing/demo-video.mp4"
  poster="/marketing/demo-placeholder.gif"
  controls
  preload="metadata"
  className="h-auto w-full motion-reduce:hidden"
  aria-label="60-second demo: SeldonFrame from signup to live client workspace."
/>
<div className="hidden h-[60px] items-center justify-center bg-zinc-900 px-6 text-sm text-zinc-500 motion-reduce:flex">
  60-second narrated demo paused because you prefer reduced motion. Press play to watch on demand.
</div>
```

The `motion-reduce` fallback for `<video>` is debatable since `<video>` doesn't autoplay by default — leave the user-controlled poster visible. Adjust if the design-critique flagged a stricter policy.

Update the section footer line:

```tsx
<p className="mt-4 text-center text-xs text-zinc-600">
  60-second walkthrough — captions and transcript at <Link href="/docs/demo-transcript" className="underline">/docs/demo-transcript</Link>.
</p>
```

- [ ] **Step 3: Re-run landing tests + commit**

```bash
cd packages/crm && node --import tsx --test tests/unit/landing/hero-cta.spec.ts tests/unit/landing/how-it-works.spec.ts
git add packages/crm/public/marketing/hero-loop.gif packages/crm/public/marketing/demo-video.mp4 packages/crm/public/marketing/how-it-works-step-1.png packages/crm/public/marketing/how-it-works-step-2.png packages/crm/public/marketing/how-it-works-step-3.png packages/crm/src/components/landing/demo-video-section.tsx
git commit -m "feat(marketing): swap in real demo video + how-it-works screenshots"
```

---

## Self-review

**1. Spec coverage** — each Cut C section has at least one task:

| Spec section | Phase / task |
|---|---|
| Hero refresh | Phase 1 (Tasks 1.1-1.5) |
| "How it works" 3-step | Phase 2 (Tasks 2.1-2.5) |
| Demo video section | Phase 3 (Tasks 3.1-3.4) + Phase 9 swap |
| Pricing 3-column table | Phase 4 (Tasks 4.1-4.6) |
| Built for agencies, MIT-licensed | Phase 5 (Tasks 5.1-5.4) |
| Refreshed FAQ (6 Qs) | Phase 6 (Tasks 6.1-6.4) |
| Footer GitHub prominence | Phase 7 (Tasks 7.1-7.2) |
| Full-page design + a11y | Phase 8 (Tasks 8.1-8.2) |
| Demo video recording (chicken-and-egg) | Phase 9 (Task 9.1, manual) |
| All 4 design skills per section | Each phase invokes design-system, ux-copy, design-critique, and (where applicable) accessibility-review explicitly |

**2. Design-skill coverage per section** — confirmation that all 4 design skills are invoked at least once per new section:

| Section | design-system | ux-copy | design-critique | accessibility-review |
|---|---|---|---|---|
| Hero | Task 1.2 | Task 1.3 | Task 1.5 | Phase 8 (page-wide) |
| How it works | Task 2.3 | Task 2.4 | Task 2.5 | Phase 8 (page-wide) |
| Demo video | Task 3.2 | Task 3.3 | Task 3.4 | Phase 8 (page-wide) |
| Pricing | Task 4.2 | Task 4.3 | Task 4.4 | Task 4.5 (dedicated, table semantics are sensitive) |
| Open source | Task 5.3 | Task 5.3 | Task 5.4 | Phase 8 (page-wide) |
| FAQ | Task 6.2 | Task 6.3 | Task 6.4 | Phase 8 (page-wide) |
| Footer | Task 7.2 | Task 7.2 | Phase 8 (page-wide) | Phase 8 (page-wide) |

Every new section gets all 4 skills. Per-section accessibility passes for hero/demo/open-source/FAQ/footer roll up into the Phase 8 full-page accessibility review rather than duplicating; the pricing section gets a dedicated a11y pass (Task 4.5) because tables, color-only emphasis, and icon-only cells are the highest-risk a11y surface.

**3. Placeholder scan** — no "TBD", "TODO", or "implement later" in any task. Copy lands as concrete starting points (e.g. hero h1 "The open-source Business OS your agency builds for clients in 60 seconds.") with explicit ux-copy refinement tasks that may rewrite it; tests anchor on conceptual matches (`/agency/i`, `/60 seconds/i`) so refinement doesn't break the test.

**4. Type / name consistency** —
- Tier keys are `free` / `growth` / `scale` everywhere (pricing data attrs, CTA hrefs `?plan=growth`, FAQ answers).
- `LandingHowItWorksSection`, `LandingDemoVideoSection`, `LandingMarketingPricingSection`, `LandingOpenSourceSection`, `LandingMarketingFaqSection`, `GitHubStarsBadge`, `fetchStarCount` — every symbol introduced is consumed by a later task with the same casing.
- Test file regex assertions anchor on conceptual phrases (agency, paste, URL, 60 seconds, Growth, Scale, all tiers, white-label, isolated) so the ux-copy refinement tasks can rewrite surface copy without breaking tests.

**5. Cut B feature-flag sync** — Task 4.6 explicitly cross-checks the pricing matrix labels against the 6 flag names from Cut B (`branding_hidden`, `custom_domain`, `client_portal`, `ai_agents`, `white_label_portal`, `priority_support`).

---

## Open notes for the orchestrator

1. **`(public)/page.tsx` is a server component.** `LandingHero` is currently `"use client"` because it embeds `<UrlAnalyzer />`. After Phase 1 removes the `UrlAnalyzer`, the hero only contains `<Link>` and `<Image>` — drop the `"use client"` directive. Same for `final-cta.tsx` if it's left as-is and never wires up state (out of scope, but flag if a server-render audit comes up).
2. **The existing `LandingAgenciesSection`** ($349/mo Pro 10 callout) and `LandingFinalCta` ("Try it now" scroll-to-top) predate Cut B's tier rename and may conflict with the new Free/Growth/Scale framing. Phase 8 design-critique flags them. If the critique says rewrite, that's a follow-up — keep this Cut focused.
3. **GitHub repo path:** The plan assumes `seldonframe/crm`. If the repo lives at a different path (`seldonframe/seldonframe`?) update `github-stars-badge.tsx`, `footer.tsx`, and `nav.tsx` together.
4. **Hero `UrlAnalyzer` removal** is irreversible from the hero. If product wants to keep the URL-paste-without-signup experience as a teaser, mount `<UrlAnalyzer />` inside a smaller "Try it" widget on the demo section or a new `/try` route — out of scope for this Cut.
5. **The 6-sec hero loop and 60-sec demo are gated on Cut A reaching prod.** Phase 9 is explicitly week-6 manual work. Do not block Phase 1-8 commits on real video assets.
