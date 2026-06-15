# Client PWA (Branded Contractor App) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a v1 installable, agency-branded, mobile-first PWA for an agency's contractor clients — a LeadConnector-style **Today / Leads / Messages / Appointments** app — by reusing the existing operator-portal auth, workspace-scoped data, and partner-agency branding, and adding a PWA shell (dynamic per-slug manifest + PNG icons + a hand-rolled service worker + install affordance).

**Architecture:** The operator portal at `app/portal/[orgSlug]/(operator)/` currently just `redirect("/dashboard")`. v1 replaces that redirect with a purpose-built mobile shell: a branded header + fixed bottom-tab nav (Today · Leads · Messages · Appts), with 4 mobile screen routes. All data is read through the existing `listContacts({ orgId })` / `listBookings(orgId)` / `smsMessages`-grouping helpers, scoped to the operator's workspace via the `sf_operator_session` cookie (`getOrgId()`). Branding for the manifest + chrome comes from `getEffectiveBrandingForWorkspace(orgId)`. Installability is provided by a dynamic per-slug `manifest.webmanifest` route handler + a hand-rolled `public/sw.js` (app-shell cache + offline fallback) registered from the layout. Pure decision logic (branding→manifest mapping, the new count queries) is extracted into testable helpers and unit-tested; UI shells/screens get exact code + manual-verification steps (the codebase does not unit-test interactive screens — the runner has no persistent jsdom for these and there is no module mocking).

**Tech Stack:** Next.js 16.2.1 (App Router, Turbopack, `withWorkflow` config wrapper), React 19 + React Compiler, Drizzle ORM (Neon Postgres), TypeScript, `node:test` + `tsx` unit runner (`pnpm test:unit`), Tailwind v4 utility classes + inline styles for the light-mode portal aesthetic, hand-rolled service worker (no new deps).

---

## Decisions locked for v1

1. **Route group is `(operator)`, param is `[orgSlug]`.** Verified on disk: `packages/crm/src/app/portal/[orgSlug]/(operator)/{layout.tsx,page.tsx,contacts/,bookings/,deals/}`. (Some tooling caches showed `(client)`/`[slug]` — ignore that; the on-disk truth is `(operator)`/`[orgSlug]`.) All new routes go under `(operator)`.

2. **Service worker = hand-rolled `public/sw.js`, NOT serwist.** Rationale: `next.config.ts` already wraps with `withWorkflow(nextConfig)`; composing `withSerwist(withWorkflow(...))` risks build conflicts (serwist's InjectManifest is webpack-oriented; Next 16 builds with Turbopack) and adds two devDeps. Serwist *does* support Next 16.2.x, so the documented upgrade path is: `pnpm --filter @seldonframe/crm add -D @serwist/next @serwist/cli`, add `app/sw.ts`, wrap as `withSerwist(withWorkflow(nextConfig))`, swap registration to `<SerwistProvider swUrl="/sw.js">`. For v1 the hand-rolled SW (app-shell cache + `/portal/[orgSlug]/offline` fallback) is enough to fire the Android/desktop install prompt and is the lowest-risk choice.

3. **"Unread texts" = unread inbound SMS derived from `sms_messages`** (inbound rows with no outbound after them), mirroring `app/(dashboard)/conversations/page.tsx`. `sms_messages` has **no `read_at` column**. (Note: `OperatorTodaySnapshot` counts `portal_messages.read_at` — a *different* table for the homeowner customer portal. The PWA Messages screen + the "unread texts" count both use `sms_messages`, matching the spec's "unread inbound SMS".)

4. **Data helpers already accept an `orgId` override** — `listContacts({ orgId })`, `listBookings(orgId)`, `listDeals(orgId)`. The operator layout resolves the session once via `getOperatorSessionForOrg(orgSlug)` and threads `session.orgId` to every screen. This avoids relying on `getOrgId()`'s cookie precedence inside leaf server components (it works, but explicit threading is clearer and matches the v1.24.0 "operator-portal mirror" override pattern already in those helpers).

5. **Magic-link landing changes to the mobile shell.** `app/portal/[orgSlug]/magic/route.ts` currently redirects to `/dashboard`. v1 changes the default target to `/portal/${orgSlug}` so a freshly-installed PWA launch lands on Today, not the dense desktop CRM.

6. **Gating is unchanged.** The operator portal is gated to Scale-tier-or-agency-attached at magic-link-issue time inside `requestOperatorMagicLinkAction`. v1 does NOT modify the gate; it unlocks the 9 demos by attaching them to the Seldon Studio partner agency (Task 10), which both satisfies the gate and brands the app.

7. **PNG icons are an asset to produce.** `public/` has `logo.png` + SVGs but no `icon-192.png` / `icon-512.png` / `apple-touch-icon.png`. Task 1 produces them (from `logo.png` via the documented one-off, or commits provided PNGs). The current `app/manifest.ts` and `generatePwaManifest()` default already reference `/icon-192.png` + `/icon-512.png` that don't exist — Task 1 fixes that latent bug too.

---

## File Structure

| File | Create / Modify | Responsibility |
| --- | --- | --- |
| `packages/crm/public/icon-192.png` | Create (binary asset) | 192×192 app icon (default SeldonFrame; agency name/theme still apply via manifest). |
| `packages/crm/public/icon-512.png` | Create (binary asset) | 512×512 maskable app icon. |
| `packages/crm/public/apple-touch-icon.png` | Create (binary asset) | 180×180 iOS A2HS icon. |
| `packages/core/src/virality/pwa-manifest.ts` | Modify | Extend pure `generatePwaManifest` + add pure `brandingToManifestOptions(...)` mapper (branding → `PwaManifestOptions`). Unit-tested. |
| `packages/crm/tests/unit/virality/branding-to-manifest.spec.ts` | Create (test) | TDD: branding→manifest mapping (agency name/theme/icons; SF fallback). |
| `packages/crm/src/app/portal/[orgSlug]/manifest.webmanifest/route.ts` | Create | Dynamic per-slug `GET` manifest: resolve org by slug → branding → `generatePwaManifest(brandingToManifestOptions(...))` with `start_url`+`scope`=`/portal/[orgSlug]/`. |
| `packages/crm/public/sw.js` | Create | Hand-rolled service worker: precache app shell, network-first for docs with offline fallback. |
| `packages/crm/src/components/operator-portal/pwa/sw-register.tsx` | Create | Client component: register `/sw.js` scoped to `/portal/[orgSlug]/`. |
| `packages/crm/src/components/operator-portal/pwa/install-button.tsx` | Create | Client component: capture `beforeinstallprompt` → prompt; iOS A2HS hint. |
| `packages/crm/src/components/operator-portal/mobile/operator-mobile-nav.tsx` | Create | Client component: fixed bottom-tab nav (Today/Leads/Messages/Appts) with `usePathname` active state. |
| `packages/crm/src/components/operator-portal/mobile/operator-mobile-shell.tsx` | Create | Server component: branded header + `<main>` + bottom-nav + SW register + install button. |
| `packages/crm/src/app/portal/[orgSlug]/(operator)/layout.tsx` | Modify | Session-gate (existing) + wrap children in the mobile shell + `export const metadata` linking the manifest + apple meta. |
| `packages/crm/src/app/portal/[orgSlug]/(operator)/page.tsx` | Modify | Replace `redirect("/dashboard")` with the **Today** screen. |
| `packages/crm/src/lib/operator-portal/counts.ts` | Create | Pure count helpers (`countNewLeads`, `countUnreadInboundSms`) + thin DB wrappers. Pure parts unit-tested. |
| `packages/crm/tests/unit/operator-portal/counts.spec.ts` | Create (test) | TDD: `countNewLeads` (7-day window + status='lead') and `countUnreadInboundSms` (inbound-with-no-outbound-after). |
| `packages/crm/src/app/portal/[orgSlug]/(operator)/leads/page.tsx` | Create | **Leads** screen: mobile card list of contacts + tap-to-call/text. |
| `packages/crm/src/app/portal/[orgSlug]/(operator)/messages/page.tsx` | Create | **Messages** screen: SMS threads grouped by contact (latest + unread badge). |
| `packages/crm/src/app/portal/[orgSlug]/(operator)/messages/[contactId]/page.tsx` | Create | **Thread** view: full SMS thread, read-only, tap-to-call/text header. |
| `packages/crm/src/app/portal/[orgSlug]/(operator)/appointments/page.tsx` | Create | **Appointments** screen: upcoming bookings grouped by day. |
| `packages/crm/src/app/portal/[orgSlug]/(operator)/offline/page.tsx` | Create | Friendly offline fallback (precached; SW serves it when a doc fetch fails). |
| `packages/crm/src/lib/operator-portal/mobile-format.ts` | Create | Pure formatters (`groupBookingsByDay`, `formatRelative`, `telHref`, `smsHref`, `contactDisplayName`). Unit-tested. |
| `packages/crm/tests/unit/operator-portal/mobile-format.spec.ts` | Create (test) | TDD: the pure formatters above. |
| `packages/crm/src/app/portal/[orgSlug]/magic/route.ts` | Modify | Default magic-link redirect target → `/portal/${orgSlug}` (mobile shell). |

---

## Task 1: PNG app icons (asset)

**Files:**
- Create: `packages/crm/public/icon-192.png` (192×192 PNG)
- Create: `packages/crm/public/icon-512.png` (512×512 PNG, maskable-safe)
- Create: `packages/crm/public/apple-touch-icon.png` (180×180 PNG)

> These are binary assets, not code. The manifest builder (Task 2) and the existing `app/manifest.ts` already reference `/icon-192.png` + `/icon-512.png`, which do **not** exist in `public/` today — this task also fixes that latent 404.

- [ ] **Step 1: Generate the three PNGs from the existing logo**

There is an existing raster source at `packages/crm/public/logo.png`. Generate square icons with padding so the maskable 512 survives Android's safe-zone crop. Use ImageMagick if available:

```bash
cd packages/crm/public
# 192 (any-purpose)
magick logo.png -resize 192x192 -background none -gravity center -extent 192x192 icon-192.png
# 512 (maskable — pad to ~80% so the safe zone isn't clipped)
magick logo.png -resize 410x410 -background "#0a0e14" -gravity center -extent 512x512 icon-512.png
# 180 apple-touch (opaque background; iOS ignores transparency)
magick logo.png -resize 160x160 -background "#0a0e14" -gravity center -extent 180x180 apple-touch-icon.png
```

If ImageMagick is unavailable, use `sharp` from the repo's node_modules:

```bash
cd packages/crm
node -e "const s=require('sharp'); const bg={r:10,g:14,b:20,alpha:1}; \
 s('public/logo.png').resize(192,192,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toFile('public/icon-192.png'); \
 s('public/logo.png').resize(410,410,{fit:'contain',background:bg}).extend({top:51,bottom:51,left:51,right:51,background:bg}).png().toFile('public/icon-512.png'); \
 s('public/logo.png').resize(180,180,{fit:'contain',background:bg}).png().toFile('public/apple-touch-icon.png');"
```

> **If neither tool is available in your environment:** this step's deliverable is simply "place three valid PNG files at the exact paths above, sized 192×192, 512×512, 180×180." Flag to the user that the icon assets need to be produced (e.g. exported from the brand kit) and commit them. Do not block the rest of the plan — the manifest/SW tasks work as soon as the files exist.

- [ ] **Step 2: Verify the files exist and are valid PNGs**

Run:
```bash
cd packages/crm && node -e "for (const f of ['icon-192.png','icon-512.png','apple-touch-icon.png']){const b=require('fs').readFileSync('public/'+f); if(b.slice(0,8).toString('hex')!=='89504e470d0a1a0a') throw new Error(f+' is not a PNG'); console.log(f, b.length, 'bytes OK');}"
```
Expected: three lines, each ending `OK`, each `> 0 bytes`.

- [ ] **Step 3: Commit**

```bash
git add packages/crm/public/icon-192.png packages/crm/public/icon-512.png packages/crm/public/apple-touch-icon.png
git commit -m "feat(pwa): add default app icons (192, 512 maskable, apple-touch)"
```

---

## Task 2: Pure manifest builder + branding→manifest mapping (TDD)

**Files:**
- Modify: `packages/core/src/virality/pwa-manifest.ts`
- Test: `packages/crm/tests/unit/virality/branding-to-manifest.spec.ts`

> `generatePwaManifest(options)` already exists (pure). We ADD a pure `brandingToManifestOptions(input)` that maps an `EffectiveBranding`-shaped object + an `orgSlug` into `PwaManifestOptions`, so the route handler (Task 3) is a thin shell over two pure functions. This is the unit-tested seam (DB-touching code stays out of the test, matching the repo's "inject deps / test the pure core" convention).

Current contents of `packages/core/src/virality/pwa-manifest.ts` for reference:

```typescript
export type PwaManifestOptions = {
  name: string;
  shortName?: string;
  description?: string;
  startUrl?: string;
  display?: "standalone" | "fullscreen" | "minimal-ui" | "browser";
  themeColor?: string;
  backgroundColor?: string;
  icons?: Array<{ src: string; sizes: string; type: string }>;
};

export function generatePwaManifest(options: PwaManifestOptions) {
  return {
    name: options.name,
    short_name: options.shortName ?? options.name,
    description: options.description ?? "",
    start_url: options.startUrl ?? "/dashboard",
    display: options.display ?? "standalone",
    theme_color: options.themeColor ?? "#0a0e14",
    background_color: options.backgroundColor ?? "#0a0e14",
    icons: options.icons ?? [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
```

- [ ] **Step 1: Write the failing test**

Create `packages/crm/tests/unit/virality/branding-to-manifest.spec.ts`:

```typescript
// Pins the per-agency PWA manifest mapping. The dynamic
// /portal/[orgSlug]/manifest.webmanifest route is a thin shell over
// brandingToManifestOptions(...) + generatePwaManifest(...); these
// tests are the real coverage for "agency name/theme drives the
// installed app identity, SF defaults otherwise".

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  brandingToManifestOptions,
  generatePwaManifest,
} from "@seldonframe/core/virality";

const SF_BRANDING = {
  is_white_label: false,
  brand_name: "SeldonFrame",
  logo_url: null,
  primary_color: null,
  accent_color: null,
};

const AGENCY_BRANDING = {
  is_white_label: true,
  brand_name: "Seldon Studio",
  logo_url: "https://cdn.example.com/logo.png",
  primary_color: "#5b21b6",
  accent_color: "#a78bfa",
};

describe("brandingToManifestOptions", () => {
  test("scopes start_url + scope to the org's portal path", () => {
    const opts = brandingToManifestOptions({ orgSlug: "rapid-rooter", branding: AGENCY_BRANDING });
    assert.equal(opts.startUrl, "/portal/rapid-rooter/");
    assert.equal(opts.scope, "/portal/rapid-rooter/");
  });

  test("uses the agency brand name for name + short_name", () => {
    const opts = brandingToManifestOptions({ orgSlug: "rapid-rooter", branding: AGENCY_BRANDING });
    assert.equal(opts.name, "Seldon Studio");
    assert.equal(opts.shortName, "Seldon Studio");
  });

  test("uses the agency primary color for theme_color", () => {
    const opts = brandingToManifestOptions({ orgSlug: "rapid-rooter", branding: AGENCY_BRANDING });
    assert.equal(opts.themeColor, "#5b21b6");
  });

  test("falls back to SeldonFrame name + default theme when not white-label", () => {
    const opts = brandingToManifestOptions({ orgSlug: "demo", branding: SF_BRANDING });
    assert.equal(opts.name, "SeldonFrame");
    assert.equal(opts.themeColor, "#0a0e14");
  });

  test("always references the default PNG icon set", () => {
    const opts = brandingToManifestOptions({ orgSlug: "demo", branding: SF_BRANDING });
    const srcs = (opts.icons ?? []).map((i) => i.src);
    assert.ok(srcs.includes("/icon-192.png"));
    assert.ok(srcs.includes("/icon-512.png"));
  });

  test("produces a maskable 512 icon entry", () => {
    const opts = brandingToManifestOptions({ orgSlug: "demo", branding: SF_BRANDING });
    const maskable = (opts.icons ?? []).find((i) => i.purpose === "maskable");
    assert.ok(maskable, "expected a maskable icon entry");
    assert.equal(maskable?.sizes, "512x512");
  });

  test("generatePwaManifest threads scope + standalone display through", () => {
    const manifest = generatePwaManifest(
      brandingToManifestOptions({ orgSlug: "rapid-rooter", branding: AGENCY_BRANDING }),
    );
    assert.equal(manifest.scope, "/portal/rapid-rooter/");
    assert.equal(manifest.start_url, "/portal/rapid-rooter/");
    assert.equal(manifest.display, "standalone");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit`
Expected: FAIL — `brandingToManifestOptions` is not exported (`SyntaxError`/`undefined is not a function`), and `opts.scope` / `i.purpose` / `manifest.scope` don't exist yet.

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `packages/core/src/virality/pwa-manifest.ts` with:

```typescript
export type PwaIcon = {
  src: string;
  sizes: string;
  type: string;
  /** v1 PWA — "maskable" lets Android crop into the safe zone without
   *  clipping the glyph. Omitted = "any" purpose. */
  purpose?: "any" | "maskable";
};

export type PwaManifestOptions = {
  name: string;
  shortName?: string;
  description?: string;
  startUrl?: string;
  /** v1 PWA — installable scope. When set, the installed app only
   *  "owns" URLs under this path; out-of-scope links open in the
   *  browser. Per-agency app scopes to /portal/<slug>/. */
  scope?: string;
  display?: "standalone" | "fullscreen" | "minimal-ui" | "browser";
  themeColor?: string;
  backgroundColor?: string;
  icons?: PwaIcon[];
};

const DEFAULT_THEME_COLOR = "#0a0e14";
const DEFAULT_BACKGROUND_COLOR = "#0a0e14";

const DEFAULT_ICONS: PwaIcon[] = [
  { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];

export function generatePwaManifest(options: PwaManifestOptions) {
  return {
    name: options.name,
    short_name: options.shortName ?? options.name,
    description: options.description ?? "",
    start_url: options.startUrl ?? "/dashboard",
    scope: options.scope ?? options.startUrl ?? "/",
    display: options.display ?? "standalone",
    theme_color: options.themeColor ?? DEFAULT_THEME_COLOR,
    background_color: options.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
    icons: options.icons ?? DEFAULT_ICONS,
  };
}

/** Minimal branding shape this mapper needs. Matches the relevant
 *  subset of `EffectiveBranding` from
 *  packages/crm/src/lib/partner-agencies/branding.ts so the CRM can
 *  pass the resolved branding straight through. */
export type ManifestBrandingInput = {
  is_white_label: boolean;
  brand_name: string;
  logo_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
};

/** Pure: map effective branding + an org slug into PwaManifestOptions
 *  for the per-agency installable app. The installed app's identity
 *  (name, theme color) comes from the active agency; SeldonFrame
 *  defaults apply when there's no active white-label agency. Icons
 *  are always the default PNG set in v1 (per-agency generated icons
 *  are a fast-follow). */
export function brandingToManifestOptions(input: {
  orgSlug: string;
  branding: ManifestBrandingInput;
}): PwaManifestOptions {
  const scope = `/portal/${input.orgSlug}/`;
  const name = input.branding.is_white_label
    ? input.branding.brand_name
    : "SeldonFrame";
  const themeColor =
    input.branding.is_white_label && input.branding.primary_color
      ? input.branding.primary_color
      : DEFAULT_THEME_COLOR;
  return {
    name,
    shortName: name,
    description: `${name} — your business in your pocket.`,
    startUrl: scope,
    scope,
    display: "standalone",
    themeColor,
    backgroundColor: DEFAULT_BACKGROUND_COLOR,
    icons: DEFAULT_ICONS,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit`
Expected: PASS — all `brandingToManifestOptions` + `generatePwaManifest` assertions green.

- [ ] **Step 5: Typecheck the core change**

Run: `cd packages/crm && npx tsc --noEmit`
Expected: no errors (the existing `app/manifest.ts` consumer still compiles — `generatePwaManifest` is backward-compatible; `scope` is optional).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/virality/pwa-manifest.ts packages/crm/tests/unit/virality/branding-to-manifest.spec.ts
git commit -m "feat(pwa): pure brandingToManifestOptions mapper + scoped manifest builder"
```

---

## Task 3: Dynamic per-slug manifest route + layout link

**Files:**
- Create: `packages/crm/src/app/portal/[orgSlug]/manifest.webmanifest/route.ts`
- Modify: `packages/crm/src/app/portal/[orgSlug]/(operator)/layout.tsx` (metadata link — full layout rewrite happens in Task 5; for now just confirm the route renders)

> The route is a thin shell over Task 2's pure functions + a slug→org lookup that mirrors `getOrgBySlug` in `lib/operator-portal/auth.ts` and the org lookup in `lib/partner-agencies/branding.ts`. It returns SF defaults when the slug is unknown (never 500s on a bad slug).

- [ ] **Step 1: Write the route handler**

Create `packages/crm/src/app/portal/[orgSlug]/manifest.webmanifest/route.ts`:

```typescript
// v1 PWA — dynamic per-agency web app manifest.
//
// GET /portal/<orgSlug>/manifest.webmanifest → resolve the workspace
// by slug → effective partner-agency branding → a manifest whose
// name/theme_color identify the AGENCY (white-label) and whose
// start_url + scope are pinned to /portal/<orgSlug>/ so the installed
// app opens straight into this contractor's mobile shell.
//
// Falls back to SeldonFrame defaults when the slug is unknown or the
// workspace has no active agency (branding resolver already returns
// SF defaults in those cases). Never throws on a bad slug.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getEffectiveBrandingForWorkspace } from "@/lib/partner-agencies/branding";
import {
  brandingToManifestOptions,
  generatePwaManifest,
} from "@seldonframe/core/virality";

// Per-slug branding can change (agency attach/detach); don't statically
// cache. Cheap query + small JSON.
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await context.params;

  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, orgSlug))
    .limit(1);

  // brandingToManifestOptions only reads the ManifestBrandingInput
  // subset (is_white_label, brand_name, logo_url, primary_color,
  // accent_color). For a known slug we pass the full EffectiveBranding
  // (structurally compatible); for an unknown slug we pass a minimal
  // SF-default input rather than the full 10-field EffectiveBranding,
  // so this literal can't drift from that interface.
  const branding = org
    ? await getEffectiveBrandingForWorkspace(org.id)
    : {
        is_white_label: false,
        brand_name: "SeldonFrame",
        logo_url: null,
        primary_color: null,
        accent_color: null,
      };

  const manifest = generatePwaManifest(
    brandingToManifestOptions({ orgSlug, branding }),
  );

  return new Response(JSON.stringify(manifest), {
    status: 200,
    headers: {
      "content-type": "application/manifest+json; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
```

- [ ] **Step 2: Temporarily link the manifest from the operator layout**

Open `packages/crm/src/app/portal/[orgSlug]/(operator)/layout.tsx`. It currently is:

```typescript
import { requireOperatorSessionForOrg } from "@/lib/operator-portal/auth";

export default async function OperatorPortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  await requireOperatorSessionForOrg(orgSlug);
  return <>{children}</>;
}
```

Add a `generateMetadata` export so the manifest `<link>` is emitted per-slug (Task 5 replaces the body; this metadata export survives that rewrite):

```typescript
import type { Metadata } from "next";
import { requireOperatorSessionForOrg } from "@/lib/operator-portal/auth";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}): Promise<Metadata> {
  const { orgSlug } = await params;
  return {
    manifest: `/portal/${orgSlug}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Today",
    },
    icons: {
      apple: "/apple-touch-icon.png",
    },
  };
}

export default async function OperatorPortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  await requireOperatorSessionForOrg(orgSlug);
  return <>{children}</>;
}
```

- [ ] **Step 3: Typecheck**

Run: `cd packages/crm && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification — the manifest route returns branded JSON**

Run the dev server and curl the route for a demo slug:
```bash
cd packages/crm && pnpm dev
# in a second shell:
curl -s http://localhost:3000/portal/rapid-rooter-plumbing-828a/manifest.webmanifest | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const m=JSON.parse(s);console.log({name:m.name,start_url:m.start_url,scope:m.scope,theme_color:m.theme_color,icons:m.icons.length});})"
```
Expected: JSON with `start_url` and `scope` = `/portal/rapid-rooter-plumbing-828a/`, `display:"standalone"`, `icons` length 3. (`name`/`theme_color` will be SeldonFrame defaults until Task 10 attaches the agency; after Task 10 they become "Seldon Studio" / the agency primary color.) Also confirm a bogus slug returns SF defaults, not a 500:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/portal/does-not-exist-xyz/manifest.webmanifest
```
Expected: `200`.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/app/portal/[orgSlug]/manifest.webmanifest/route.ts "packages/crm/src/app/portal/[orgSlug]/(operator)/layout.tsx"
git commit -m "feat(pwa): dynamic per-agency manifest.webmanifest route + layout link"
```

---

## Task 4: Service worker + install affordance

**Files:**
- Create: `packages/crm/public/sw.js`
- Create: `packages/crm/src/components/operator-portal/pwa/sw-register.tsx`
- Create: `packages/crm/src/components/operator-portal/pwa/install-button.tsx`
- Create: `packages/crm/src/app/portal/[orgSlug]/(operator)/offline/page.tsx`

> Hand-rolled SW (Decision #2). The SW + manifest together enable the Android/desktop install prompt. iOS uses A2HS (manifest + apple meta from Task 3 + apple-touch-icon) and ignores the SW for install. No unit test (the runner has no SW/jsdom harness); verified manually + by `next build`.

- [ ] **Step 1: Write the service worker**

Create `packages/crm/public/sw.js`:

```javascript
// v1 PWA service worker (hand-rolled — see plan Decision #2).
//
// Scope is set at registration time to /portal/<orgSlug>/ so each
// installed contractor app controls only its own workspace path.
//
// Strategy:
//   - install: precache the app shell (icons + the offline fallback).
//   - fetch (navigations / documents): network-first, fall back to the
//     cached offline page when the network is unavailable.
//   - fetch (same-origin static GET): stale-while-revalidate.
//   - everything else (cross-origin, non-GET, API): pass through.
//
// Data always needs the network; we deliberately do NOT cache API or
// server-action responses (they're workspace-scoped + change often).

const CACHE = "sf-pwa-shell-v1";
const PRECACHE = ["/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // The per-scope offline page lives under the registration scope;
      // resolve it relative to the SW's own scope.
      const scope = new URL(self.registration.scope);
      const offlineUrl = new URL("offline", scope).pathname;
      await cache.addAll([...PRECACHE, offlineUrl]);
      self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations / HTML documents → network-first, offline fallback.
  const isDocument =
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");

  if (isDocument) {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          const cache = await caches.open(CACHE);
          const scope = new URL(self.registration.scope);
          const offlineUrl = new URL("offline", scope).pathname;
          const cached = await cache.match(offlineUrl);
          return cached ?? new Response("You're offline.", { status: 503 });
        }
      })(),
    );
    return;
  }

  // Static same-origin assets → stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached ?? network;
    })(),
  );
});
```

- [ ] **Step 2: Write the SW registration client component**

Create `packages/crm/src/components/operator-portal/pwa/sw-register.tsx`:

```tsx
// v1 PWA — registers the hand-rolled service worker scoped to this
// workspace's portal path. Client-only; renders nothing. Registration
// is best-effort: failures are logged, never thrown (SW is a
// progressive enhancement; the app works without it).

"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister({ scope }: { scope: string }) {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    navigator.serviceWorker
      .register("/sw.js", { scope })
      .catch((err) => {
        console.warn("[pwa] service worker registration failed", err);
      });
  }, [scope]);

  return null;
}
```

- [ ] **Step 3: Write the install-button client component**

Create `packages/crm/src/components/operator-portal/pwa/install-button.tsx`:

```tsx
// v1 PWA — install affordance.
//
// Android / desktop Chrome: capture the `beforeinstallprompt` event,
// stash it, and show an "Install app" button that calls prompt().
// iOS Safari: there is no beforeinstallprompt — detect iOS + non-
// standalone and show a one-line "Add to Home Screen" hint instead.
// When already installed (display-mode: standalone) render nothing.

"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS legacy
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function InstallButton({ brandColor }: { brandColor: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    if (isIos()) {
      setShowIosHint(true);
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  if (showIosHint) {
    return (
      <p className="text-[12px]" style={{ color: "#666" }}>
        Install: tap Share, then <strong>Add to Home Screen</strong>.
      </p>
    );
  }

  if (!deferred) return null;

  return (
    <button
      type="button"
      onClick={async () => {
        await deferred.prompt();
        await deferred.userChoice;
        setDeferred(null);
      }}
      className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-white"
      style={{ backgroundColor: brandColor }}
    >
      Install app
    </button>
  );
}
```

- [ ] **Step 4: Write the offline fallback page**

Create `packages/crm/src/app/portal/[orgSlug]/(operator)/offline/page.tsx`:

```tsx
// v1 PWA — offline fallback. Precached by the service worker and
// served when a document fetch fails with no network. Static + tiny
// so it caches cleanly. Lives inside (operator) so it inherits the
// session gate + the mobile shell chrome.

export default function OfflinePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <div
        className="mb-4 flex size-12 items-center justify-center rounded-full"
        style={{ backgroundColor: "#F0F0EC", color: "#666" }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.58 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" />
        </svg>
      </div>
      <h1 className="text-[15px] font-semibold" style={{ color: "#111" }}>
        You&apos;re offline
      </h1>
      <p className="mt-1 max-w-[260px] text-[13px]" style={{ color: "#666" }}>
        Reconnect to see your latest leads, messages, and appointments.
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `cd packages/crm && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit** (wiring into the layout happens in Task 5)

```bash
git add packages/crm/public/sw.js packages/crm/src/components/operator-portal/pwa/ "packages/crm/src/app/portal/[orgSlug]/(operator)/offline/page.tsx"
git commit -m "feat(pwa): hand-rolled service worker + install affordance + offline page"
```

---

## Task 5: Mobile shell layout + bottom-tab nav (replace redirect)

**Files:**
- Create: `packages/crm/src/components/operator-portal/mobile/operator-mobile-nav.tsx`
- Create: `packages/crm/src/components/operator-portal/mobile/operator-mobile-shell.tsx`
- Modify: `packages/crm/src/app/portal/[orgSlug]/(operator)/layout.tsx`

> Mirrors the mobile-first inline-style light aesthetic of `components/customer-portal/customer-portal-nav.tsx`, but uses a **fixed bottom-tab** nav (LeadConnector-style) instead of top tabs. The shell resolves the operator session ONCE and threads `orgId` to screens via React context is overkill for v1 — instead each screen re-resolves the session (cheap cookie read) the same way the layout does. To keep screens DRY we expose a tiny `getOperatorContext(orgSlug)` from `mobile-format.ts`'s sibling — but to avoid a `"use server"`/export-shape pitfall we just call `getOperatorSessionForOrg(orgSlug)` directly in each screen (it's already exported and async-only). The layout still calls `requireOperatorSessionForOrg` for the redirect-on-missing behavior.

- [ ] **Step 1: Write the bottom-tab nav (client component)**

Create `packages/crm/src/components/operator-portal/mobile/operator-mobile-nav.tsx`:

```tsx
// v1 PWA — operator mobile bottom-tab nav.
//
// Mirrors components/customer-portal/customer-portal-nav.tsx's path-
// based active-state pattern (usePathname in a client subtree so the
// server layout doesn't have to prop-drill the active route), but
// renders a FIXED BOTTOM tab bar (LeadConnector-style) for the
// contractor app. Four tabs: Today / Leads / Messages / Appts.
//
// Safe-area aware (env(safe-area-inset-bottom)) so it clears the iOS
// home indicator when launched standalone.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  key: "today" | "leads" | "messages" | "appointments";
  label: string;
  /** Path tail after `/portal/<slug>`. "" = Today. */
  pathTail: string;
  icon: React.ReactNode;
};

const NAV_ITEMS: NavItem[] = [
  {
    key: "today",
    label: "Today",
    pathTail: "",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><path d="M9 22V12h6v10" />
      </svg>
    ),
  },
  {
    key: "leads",
    label: "Leads",
    pathTail: "/leads",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    key: "messages",
    label: "Messages",
    pathTail: "/messages",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
      </svg>
    ),
  },
  {
    key: "appointments",
    label: "Appts",
    pathTail: "/appointments",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
];

function isActive(pathname: string, base: string, tail: string): boolean {
  const target = base + tail;
  if (tail === "") {
    return pathname === base || pathname === `${base}/`;
  }
  return pathname === target || pathname.startsWith(`${target}/`);
}

export function OperatorMobileNav({
  orgSlug,
  activeColor,
}: {
  orgSlug: string;
  activeColor: string;
}) {
  const pathname = usePathname() ?? "";
  const base = `/portal/${orgSlug}`;

  return (
    <nav
      data-operator-mobile-nav=""
      className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[640px] items-stretch justify-around"
      style={{
        backgroundColor: "#FFFFFF",
        borderTop: "1px solid #E5E5E1",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, base, item.pathTail);
        return (
          <Link
            key={item.key}
            href={`${base}${item.pathTail}`}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2"
            style={{ color: active ? activeColor : "#9A9A95" }}
          >
            {item.icon}
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Write the mobile shell (server component)**

Create `packages/crm/src/components/operator-portal/mobile/operator-mobile-shell.tsx`:

```tsx
// v1 PWA — operator mobile shell.
//
// Branded header (logo + brand name) + scrollable content + fixed
// bottom-tab nav + service-worker registration + install affordance.
// Light-mode inline-style aesthetic matching the customer portal.
// min-h-[100dvh] so it fills the standalone viewport; bottom padding
// reserves space for the fixed nav (+ iOS safe area).
//
// Pure composition: all data (branding, orgSlug) is passed in by the
// layout. No internal state.

import type { ReactNode } from "react";

import type { EffectiveBranding } from "@/lib/partner-agencies/branding";
import { OperatorMobileNav } from "./operator-mobile-nav";
import { ServiceWorkerRegister } from "@/components/operator-portal/pwa/sw-register";
import { InstallButton } from "@/components/operator-portal/pwa/install-button";

export function OperatorMobileShell({
  orgSlug,
  orgName,
  branding,
  children,
}: {
  orgSlug: string;
  orgName: string;
  branding: EffectiveBranding | null;
  children: ReactNode;
}) {
  const brandName = branding?.is_white_label ? branding.brand_name : "SeldonFrame";
  const logoUrl = branding?.logo_url ?? null;
  const activeColor =
    (branding?.is_white_label && branding.primary_color) || "#5b21b6";
  const scope = `/portal/${orgSlug}/`;

  return (
    <div
      data-operator-mobile-shell=""
      data-white-label={branding?.is_white_label ? "true" : "false"}
      className="mx-auto flex min-h-[100dvh] max-w-[640px] flex-col"
      style={{
        backgroundColor: "#F7F7F5",
        color: "#111",
        fontFamily:
          "var(--sf-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif)",
      }}
    >
      <header
        className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-3"
        style={{ backgroundColor: "#FFFFFF", borderBottom: "1px solid #E5E5E1" }}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={brandName}
              className="h-7 w-7 shrink-0 rounded-md object-cover"
            />
          ) : null}
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[14px] font-semibold tracking-tight" style={{ color: "#111" }}>
              {orgName}
            </span>
            {branding?.is_white_label ? (
              <span className="truncate text-[11px]" style={{ color: "#999" }}>
                on {brandName}
              </span>
            ) : null}
          </div>
        </div>
        <InstallButton brandColor={activeColor} />
      </header>

      {/* Content. Bottom padding clears the fixed nav (56px) + safe area. */}
      <main
        className="flex flex-1 flex-col"
        style={{ paddingBottom: "calc(56px + env(safe-area-inset-bottom, 0px))" }}
      >
        {children}
      </main>

      <OperatorMobileNav orgSlug={orgSlug} activeColor={activeColor} />
      <ServiceWorkerRegister scope={scope} />
    </div>
  );
}
```

- [ ] **Step 3: Rewrite the operator layout to wrap children in the shell**

Replace the entire body of `packages/crm/src/app/portal/[orgSlug]/(operator)/layout.tsx` with (keeps the `generateMetadata` from Task 3, adds the shell):

```tsx
// v1 PWA — operator portal layout.
//
// Verifies the operator session (redirects to /portal/<slug>/login if
// missing), resolves agency branding + workspace name, and wraps every
// (operator) screen in the branded mobile shell (header + bottom-tab
// nav + service worker + install button). The leaf screens render only
// their content; the shell owns the chrome.

import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { requireOperatorSessionForOrg } from "@/lib/operator-portal/auth";
import { getEffectiveBrandingForWorkspace } from "@/lib/partner-agencies/branding";
import { OperatorMobileShell } from "@/components/operator-portal/mobile/operator-mobile-shell";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}): Promise<Metadata> {
  const { orgSlug } = await params;
  return {
    manifest: `/portal/${orgSlug}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Today",
    },
    icons: { apple: "/apple-touch-icon.png" },
  };
}

export default async function OperatorPortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await requireOperatorSessionForOrg(orgSlug);

  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, session.orgId))
    .limit(1);

  const branding = await getEffectiveBrandingForWorkspace(session.orgId);

  return (
    <OperatorMobileShell
      orgSlug={orgSlug}
      orgName={org?.name ?? orgSlug}
      branding={branding}
    >
      {children}
    </OperatorMobileShell>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `cd packages/crm && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification — shell renders with branded chrome + working tabs**

With `pnpm dev` running, sign in to a demo workspace operator portal (request a magic link at `/portal/rapid-rooter-plumbing-828a/login` using an email, click the emailed link — or, if Resend isn't configured locally, mint a session by visiting the magic route with a token from the dev logs). Then:
- Visit `/portal/rapid-rooter-plumbing-828a` → confirm the branded header (workspace name; "on Seldon Studio" appears only after Task 10) and a fixed bottom-tab bar with Today/Leads/Messages/Appts.
- Tap each tab → URL changes to `/leads`, `/messages`, `/appointments`; the active tab highlights. (Today/Leads/etc. content lands in Tasks 6-9; for now the four routes may 404 except Today is wired in Task 6 — that's expected at this checkpoint. The nav itself must render + navigate.)
- Resize to desktop width → shell stays centered at `max-w-[640px]` (mobile-first, not a stretched desktop CRM).

- [ ] **Step 6: Commit**

```bash
git add packages/crm/src/components/operator-portal/mobile/ "packages/crm/src/app/portal/[orgSlug]/(operator)/layout.tsx"
git commit -m "feat(pwa): branded mobile shell + bottom-tab nav for operator portal"
```

---

## Task 6: Today screen + count queries (TDD the pure count logic)

**Files:**
- Create: `packages/crm/src/lib/operator-portal/counts.ts`
- Test: `packages/crm/tests/unit/operator-portal/counts.spec.ts`
- Create: `packages/crm/src/lib/operator-portal/mobile-format.ts`
- Test: `packages/crm/tests/unit/operator-portal/mobile-format.spec.ts`
- Modify: `packages/crm/src/app/portal/[orgSlug]/(operator)/page.tsx`

> The DB-touching count wrappers can't be unit-tested without a live DB or module mocking (the repo has neither — see the messaging-layer "tests use injected deps" convention). So we extract the **pure** decision cores: `unreadInboundCountFromRows(rows)` (the "inbound with no outbound after" reduction, lifted from `conversations/page.tsx`) and `isWithinDays(date, days, now)`. We unit-test those; the thin Drizzle wrappers (`countNewLeads`, `countUnreadInboundSms`) just feed rows in. We also TDD the shared formatters in `mobile-format.ts` (used by Today + every other screen).

- [ ] **Step 1: Write the failing counts test**

Create `packages/crm/tests/unit/operator-portal/counts.spec.ts`:

```typescript
// Pure cores for the Today-screen glance counts. The Drizzle wrappers
// (countNewLeads / countUnreadInboundSms) feed rows into these; the
// reductions are where the logic lives, so they're what we pin.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  isWithinDays,
  unreadInboundCountFromRows,
} from "../../../src/lib/operator-portal/counts";

// NOTE: countNewLeads / countUnreadInboundSms hit the DB, so they are
// NOT unit-tested here (the runner has no DB + no module mocking — see
// the messaging-layer "tests use injected deps" convention). The PURE
// cores below ARE the logic; they're exported async (the module is
// "use server", which forbids non-async exports), so each assertion
// awaits.

describe("isWithinDays", () => {
  const now = new Date("2026-06-14T12:00:00Z");

  test("true for a date 3 days ago within a 7-day window", async () => {
    assert.equal(await isWithinDays(new Date("2026-06-11T12:00:00Z"), 7, now), true);
  });

  test("false for a date 8 days ago within a 7-day window", async () => {
    assert.equal(await isWithinDays(new Date("2026-06-06T11:59:00Z"), 7, now), false);
  });

  test("true for right now", async () => {
    assert.equal(await isWithinDays(now, 7, now), true);
  });
});

describe("unreadInboundCountFromRows", () => {
  // Rows are desc-by-createdAt, matching the conversations query.
  // Unread = inbound messages with NO outbound after them (walking
  // newest→oldest, once we hit an outbound for a contact the older
  // inbounds are considered read).
  test("counts a single trailing inbound as unread", async () => {
    const rows = [
      { contactId: "c1", direction: "inbound" as const },
    ];
    assert.equal(await unreadInboundCountFromRows(rows), 1);
  });

  test("inbound followed (newer) by outbound is read → zero", async () => {
    const rows = [
      { contactId: "c1", direction: "outbound" as const }, // newest
      { contactId: "c1", direction: "inbound" as const },
    ];
    assert.equal(await unreadInboundCountFromRows(rows), 0);
  });

  test("two unanswered inbounds from same contact count as two", async () => {
    const rows = [
      { contactId: "c1", direction: "inbound" as const },
      { contactId: "c1", direction: "inbound" as const },
    ];
    assert.equal(await unreadInboundCountFromRows(rows), 2);
  });

  test("sums unread across contacts", async () => {
    const rows = [
      { contactId: "c1", direction: "inbound" as const },
      { contactId: "c2", direction: "outbound" as const },
      { contactId: "c2", direction: "inbound" as const },
      { contactId: "c3", direction: "inbound" as const },
    ];
    // c1: 1 unread, c2: 0 (outbound newer than its inbound), c3: 1 → 2
    assert.equal(await unreadInboundCountFromRows(rows), 2);
  });

  test("ignores rows with no contactId", async () => {
    const rows = [
      { contactId: null, direction: "inbound" as const },
      { contactId: "c1", direction: "inbound" as const },
    ];
    assert.equal(await unreadInboundCountFromRows(rows), 1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit`
Expected: FAIL — `src/lib/operator-portal/counts.ts` does not exist (module not found).

- [ ] **Step 3: Write `counts.ts`**

Create `packages/crm/src/lib/operator-portal/counts.ts`:

```typescript
"use server";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, smsMessages } from "@/db/schema";

// NOTE: a `"use server"` module may only export ASYNC functions (and
// types). The two PURE helpers below are exported for unit testing, so
// they MUST stay async (they're trivially async-wrapped) to satisfy
// the check-use-server build gate. Callers `await` them; tests `await`
// them too.

/** Pure: is `date` within the last `days` days relative to `now`?
 *  Async only to satisfy the "use server" export rule. */
export async function isWithinDays(
  date: Date,
  days: number,
  now: Date = new Date(),
): Promise<boolean> {
  const windowStart = now.getTime() - days * 24 * 60 * 60 * 1000;
  return date.getTime() >= windowStart && date.getTime() <= now.getTime();
}

type DirectionRow = { contactId: string | null; direction: "inbound" | "outbound" };

/** Pure: count unread inbound SMS from desc-by-createdAt rows.
 *  Unread = inbound messages with no outbound AFTER them (newer).
 *  Mirrors app/(dashboard)/conversations/page.tsx's thread reduction.
 *  Async only to satisfy the "use server" export rule. */
export async function unreadInboundCountFromRows(
  rows: DirectionRow[],
): Promise<number> {
  const seenOutbound = new Map<string, boolean>();
  let unread = 0;
  for (const row of rows) {
    if (!row.contactId) continue;
    if (row.direction === "inbound") {
      if (!seenOutbound.get(row.contactId)) unread += 1;
    } else {
      seenOutbound.set(row.contactId, true);
    }
  }
  return unread;
}

/** New leads = contacts with status='lead' created in the last 7 days,
 *  scoped to the workspace. Counts in JS over a small filtered set so
 *  we can reuse the pure isWithinDays window logic. */
export async function countNewLeads(orgId: string, days = 7): Promise<number> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ id: contacts.id, createdAt: contacts.createdAt })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.status, "lead")));
  let count = 0;
  for (const row of rows) {
    if (row.createdAt >= since) count += 1;
  }
  return count;
}

/** Unread inbound SMS across the workspace. Loads recent sms_messages
 *  desc-by-createdAt (same shape as the conversations inbox) and
 *  reduces via the pure unreadInboundCountFromRows. */
export async function countUnreadInboundSms(orgId: string): Promise<number> {
  const rows = await db
    .select({ contactId: smsMessages.contactId, direction: smsMessages.direction })
    .from(smsMessages)
    .where(eq(smsMessages.orgId, orgId))
    .orderBy(desc(smsMessages.createdAt))
    .limit(500);
  return unreadInboundCountFromRows(
    rows.map((r) => ({
      contactId: r.contactId,
      direction: r.direction as "inbound" | "outbound",
    })),
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit`
Expected: PASS — all `isWithinDays` + `unreadInboundCountFromRows` assertions green.

- [ ] **Step 5: Write the failing mobile-format test**

Create `packages/crm/tests/unit/operator-portal/mobile-format.spec.ts`:

```typescript
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  contactDisplayName,
  groupBookingsByDay,
  smsHref,
  telHref,
} from "../../../src/lib/operator-portal/mobile-format";

describe("telHref / smsHref", () => {
  test("telHref strips spaces/parens/dashes to an E.164-ish dial string", () => {
    assert.equal(telHref("(839) 274-5430"), "tel:8392745430");
  });
  test("telHref keeps a leading +", () => {
    assert.equal(telHref("+1 839 274 5430"), "tel:+18392745430");
  });
  test("telHref returns empty string for no phone", () => {
    assert.equal(telHref(null), "");
  });
  test("smsHref uses the sms: scheme", () => {
    assert.equal(smsHref("+18392745430"), "sms:+18392745430");
  });
});

describe("contactDisplayName", () => {
  test("joins first + last", () => {
    assert.equal(contactDisplayName({ firstName: "Jane", lastName: "Doe" }), "Jane Doe");
  });
  test("falls back to phone when no name", () => {
    assert.equal(
      contactDisplayName({ firstName: "", lastName: null, phone: "8392745430" }),
      "8392745430",
    );
  });
  test("falls back to 'Lead' when nothing", () => {
    assert.equal(contactDisplayName({ firstName: "", lastName: null }), "Lead");
  });
});

describe("groupBookingsByDay", () => {
  test("groups bookings under a stable day key, ascending", () => {
    const groups = groupBookingsByDay([
      { id: "b2", startsAt: new Date("2026-06-15T14:00:00Z"), title: "B", fullName: null },
      { id: "b1", startsAt: new Date("2026-06-15T09:00:00Z"), title: "A", fullName: null },
      { id: "b3", startsAt: new Date("2026-06-16T10:00:00Z"), title: "C", fullName: null },
    ]);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].items.length, 2);
    assert.equal(groups[1].items.length, 1);
    // items within a day sorted ascending by start
    assert.equal(groups[0].items[0].id, "b1");
    assert.equal(groups[0].items[1].id, "b2");
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm test:unit`
Expected: FAIL — `src/lib/operator-portal/mobile-format.ts` does not exist.

- [ ] **Step 7: Write `mobile-format.ts`**

Create `packages/crm/src/lib/operator-portal/mobile-format.ts` (NOT a `"use server"` file — these are pure sync utilities consumed by both server + client components, so they can export non-async functions):

```typescript
// Pure formatters shared across the operator mobile screens. No
// "use server" directive — these are sync utilities imported by both
// server components (screens) and never call the DB.

export function telHref(phone: string | null | undefined): string {
  if (!phone) return "";
  const trimmed = phone.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  const digits = trimmed.replace(/[^\d]/g, "");
  return digits ? `tel:${plus}${digits}` : "";
}

export function smsHref(phone: string | null | undefined): string {
  if (!phone) return "";
  const trimmed = phone.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  const digits = trimmed.replace(/[^\d]/g, "");
  return digits ? `sms:${plus}${digits}` : "";
}

export function contactDisplayName(input: {
  firstName: string | null;
  lastName: string | null;
  phone?: string | null;
}): string {
  const name = [input.firstName, input.lastName]
    .filter((p): p is string => Boolean(p && p.trim()))
    .join(" ")
    .trim();
  if (name) return name;
  if (input.phone && input.phone.trim()) return input.phone.trim();
  return "Lead";
}

export function formatRelative(date: Date, now: number = Date.now()): string {
  const diffMin = Math.floor((now - date.getTime()) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

export type DayBooking = {
  id: string;
  startsAt: Date;
  title: string;
  fullName: string | null;
};

export type BookingDayGroup = {
  /** Stable YYYY-MM-DD key (local). */
  dayKey: string;
  /** Human label, e.g. "Mon, Jun 15". */
  label: string;
  items: DayBooking[];
};

export function groupBookingsByDay(bookings: DayBooking[]): BookingDayGroup[] {
  const byKey = new Map<string, DayBooking[]>();
  for (const b of bookings) {
    const d = b.startsAt;
    const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const arr = byKey.get(dayKey) ?? [];
    arr.push(b);
    byKey.set(dayKey, arr);
  }
  return Array.from(byKey.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, items]) => ({
      dayKey,
      label: items[0].startsAt.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      items: items.sort((x, y) => x.startsAt.getTime() - y.startsAt.getTime()),
    }));
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm test:unit`
Expected: PASS — all `telHref`/`smsHref`/`contactDisplayName`/`groupBookingsByDay` assertions green.

- [ ] **Step 9: Write the Today screen**

Replace the entire contents of `packages/crm/src/app/portal/[orgSlug]/(operator)/page.tsx` with:

```tsx
// v1 PWA — Today screen (operator mobile home).
//
// Glance cards: New leads (status='lead' last 7d) · Today's
// appointments · Unread texts (unread inbound SMS) · Missed calls
// (coming soon — no call data surfaced yet) + a short "up next" list.
// All data scoped to the operator's workspace via the session orgId.

import Link from "next/link";
import { and, asc, eq, gte, lt, ne } from "drizzle-orm";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { getOperatorSessionForOrg } from "@/lib/operator-portal/auth";
import { countNewLeads, countUnreadInboundSms } from "@/lib/operator-portal/counts";
import { contactDisplayName } from "@/lib/operator-portal/mobile-format";

export default async function OperatorTodayPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await getOperatorSessionForOrg(orgSlug);
  // Layout already guards; this is a type-narrowing guard for orgId.
  if (!session) return null;
  const orgId = session.orgId;

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const [newLeads, unreadTexts, todaysBookings] = await Promise.all([
    countNewLeads(orgId),
    countUnreadInboundSms(orgId),
    db
      .select({
        id: bookings.id,
        title: bookings.title,
        startsAt: bookings.startsAt,
        fullName: bookings.fullName,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.orgId, orgId),
          ne(bookings.status, "template"),
          ne(bookings.status, "cancelled"),
          gte(bookings.startsAt, startOfToday),
          lt(bookings.startsAt, endOfToday),
        ),
      )
      .orderBy(asc(bookings.startsAt))
      .limit(5),
  ]);

  const base = `/portal/${orgSlug}`;

  return (
    <section className="flex flex-col gap-4 px-4 py-4">
      <header>
        <h1 className="text-[18px] font-semibold tracking-tight" style={{ color: "#111" }}>
          Today
        </h1>
        <p className="text-[13px]" style={{ color: "#777" }}>
          {todaysBookings.length === 0
            ? "Nothing on the schedule yet today."
            : `${todaysBookings.length} appointment${todaysBookings.length === 1 ? "" : "s"} today.`}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <GlanceCard label="New leads" sub="last 7 days" value={newLeads} href={`${base}/leads`} highlight={newLeads > 0} />
        <GlanceCard label="Today's appts" sub="scheduled" value={todaysBookings.length} href={`${base}/appointments`} />
        <GlanceCard label="Unread texts" sub="need a reply" value={unreadTexts} href={`${base}/messages`} highlight={unreadTexts > 0} />
        <GlanceCard label="Missed calls" sub="coming soon" value="—" href={`${base}`} muted />
      </div>

      {todaysBookings.length > 0 ? (
        <div className="rounded-2xl bg-white p-4" style={{ border: "1px solid #E5E5E1" }}>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide" style={{ color: "#999" }}>
            Up next
          </p>
          <ul className="flex flex-col gap-1.5">
            {todaysBookings.map((b) => {
              const time = new Date(b.startsAt).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              });
              return (
                <li key={b.id} className="flex items-center gap-2 text-[13px]">
                  <span className="font-semibold" style={{ color: "#111" }}>{time}</span>
                  <span className="truncate" style={{ color: "#666" }}>
                    {contactDisplayName({ firstName: b.fullName, lastName: null })} — {b.title}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function GlanceCard({
  label,
  sub,
  value,
  href,
  highlight,
  muted,
}: {
  label: string;
  sub: string;
  value: number | string;
  href: string;
  highlight?: boolean;
  muted?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-2xl bg-white p-4"
      style={{ border: "1px solid #E5E5E1" }}
    >
      <span
        className="text-[26px] font-semibold leading-none"
        style={{ color: muted ? "#BBB" : highlight ? "#5b21b6" : "#111" }}
      >
        {value}
      </span>
      <span className="text-[12px] font-medium" style={{ color: "#333" }}>{label}</span>
      <span className="text-[10px] uppercase tracking-wide" style={{ color: "#AAA" }}>{sub}</span>
    </Link>
  );
}
```

- [ ] **Step 10: Typecheck + full unit suite**

Run: `cd packages/crm && npx tsc --noEmit` then `cd ../.. && pnpm test:unit`
Expected: tsc clean; all unit tests green.

- [ ] **Step 11: Manual verification — Today renders real workspace counts**

With a demo operator session, visit `/portal/<demo-slug>` → confirm four glance cards (New leads / Today's appts / Unread texts / Missed calls "—"), an "Up next" list when there are bookings today, and tapping a card navigates to the matching tab. Cross-check "New leads" against the dashboard `/contacts` filtered to status=lead created in the last week.

- [ ] **Step 12: Commit**

```bash
git add packages/crm/src/lib/operator-portal/counts.ts packages/crm/src/lib/operator-portal/mobile-format.ts packages/crm/tests/unit/operator-portal/ "packages/crm/src/app/portal/[orgSlug]/(operator)/page.tsx"
git commit -m "feat(pwa): Today screen + workspace-scoped count queries (TDD)"
```

---

## Task 7: Leads screen + tap-to-call/text

**Files:**
- Create: `packages/crm/src/app/portal/[orgSlug]/(operator)/leads/page.tsx`

> Reuses `listContacts({ orgId })` (already accepts an explicit `orgId` override). Mobile card list with name/phone/status/source/time and inline tap-to-call (`tel:`) + tap-to-text (`sms:`) using the TDD'd `telHref`/`smsHref`. No separate detail route in v1 — the call/text actions are the primary interactions and live on the card (keeps v1 lean; a detail drawer is a fast-follow).

- [ ] **Step 1: Write the Leads screen**

Create `packages/crm/src/app/portal/[orgSlug]/(operator)/leads/page.tsx`:

```tsx
// v1 PWA — Leads screen.
//
// Mobile card list of this workspace's contacts (newest first) with
// name, status, source, relative created time, and one-tap Call /
// Text actions. Reuses listContacts({ orgId }) — the same query the
// desktop /contacts grid uses, scoped via the operator session orgId.

import { getOperatorSessionForOrg } from "@/lib/operator-portal/auth";
import { listContacts } from "@/lib/contacts/actions";
import {
  contactDisplayName,
  formatRelative,
  smsHref,
  telHref,
} from "@/lib/operator-portal/mobile-format";

export default async function OperatorLeadsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await getOperatorSessionForOrg(orgSlug);
  if (!session) return null;

  const contacts = await listContacts({ orgId: session.orgId, sort: "recent" });

  return (
    <section className="flex flex-col gap-3 px-4 py-4">
      <header>
        <h1 className="text-[18px] font-semibold tracking-tight" style={{ color: "#111" }}>
          Leads
        </h1>
        <p className="text-[13px]" style={{ color: "#777" }}>
          {contacts.length === 0
            ? "No leads yet — they'll show up here as they come in."
            : `${contacts.length} contact${contacts.length === 1 ? "" : "s"}.`}
        </p>
      </header>

      {contacts.length === 0 ? null : (
        <ul className="flex flex-col gap-2.5">
          {contacts.map((c) => {
            const name = contactDisplayName({
              firstName: c.firstName,
              lastName: c.lastName,
              phone: c.phone,
            });
            const tel = telHref(c.phone);
            const sms = smsHref(c.phone);
            return (
              <li
                key={c.id}
                className="rounded-2xl bg-white p-3.5"
                style={{ border: "1px solid #E5E5E1" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold" style={{ color: "#111" }}>
                      {name}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]" style={{ color: "#888" }}>
                      <span className="rounded-full px-1.5 py-0.5" style={{ backgroundColor: "#F0F0EC", color: "#555" }}>
                        {c.status}
                      </span>
                      {c.source ? <span>via {c.source}</span> : null}
                      <span>{formatRelative(new Date(c.createdAt))}</span>
                    </div>
                    {c.phone ? (
                      <p className="mt-1 text-[12px]" style={{ color: "#666" }}>{c.phone}</p>
                    ) : null}
                  </div>
                </div>

                {c.phone ? (
                  <div className="mt-3 flex gap-2">
                    <a
                      href={tel}
                      className="flex-1 rounded-full py-2 text-center text-[12px] font-semibold text-white"
                      style={{ backgroundColor: "#5b21b6" }}
                    >
                      Call
                    </a>
                    <a
                      href={sms}
                      className="flex-1 rounded-full py-2 text-center text-[12px] font-semibold"
                      style={{ border: "1px solid #5b21b6", color: "#5b21b6" }}
                    >
                      Text
                    </a>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd packages/crm && npx tsc --noEmit`
Expected: no errors. (`listContacts` returns full contact rows; `c.firstName`/`c.lastName`/`c.phone`/`c.status`/`c.source`/`c.createdAt` all exist on the `contacts` schema.)

- [ ] **Step 3: Manual verification — Leads list + tap actions**

With a demo operator session, visit `/portal/<demo-slug>/leads`:
- Confirm a card list of contacts, newest first, each showing name, status pill, source, relative time, phone.
- On a phone (or Chrome devtools device mode), tap **Call** → the OS dial prompt opens with the contact's number; tap **Text** → the SMS composer opens. (On desktop without a tel/sms handler the link is inert — that's expected; verify the `href` is `tel:`/`sms:` via inspect.)
- Empty-state copy shows for a workspace with no contacts.

- [ ] **Step 4: Commit**

```bash
git add "packages/crm/src/app/portal/[orgSlug]/(operator)/leads/page.tsx"
git commit -m "feat(pwa): Leads screen with tap-to-call/text"
```

---

## Task 8: Messages screen + thread view

**Files:**
- Create: `packages/crm/src/app/portal/[orgSlug]/(operator)/messages/page.tsx`
- Create: `packages/crm/src/app/portal/[orgSlug]/(operator)/messages/[contactId]/page.tsx`

> Reuses the exact thread-grouping logic from `app/(dashboard)/conversations/page.tsx` (group `sms_messages` by contact, derive unread via "inbound with no outbound after"), scoped via the operator session orgId. v1 is read-focused: the thread view shows the full conversation + a Call/Text header (tap-to-text opens the native SMS composer); in-app reply is a fast-follow per the spec.

- [ ] **Step 1: Write the Messages inbox screen**

Create `packages/crm/src/app/portal/[orgSlug]/(operator)/messages/page.tsx`:

```tsx
// v1 PWA — Messages inbox.
//
// SMS threads grouped by contact (latest message + unread badge),
// most-recent first. Same derivation as the desktop /conversations
// inbox (group sms_messages by contactId; unread = inbound with no
// outbound after), scoped to the operator workspace. Tapping a thread
// opens the read-only thread view.

import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, smsMessages } from "@/db/schema";
import { getOperatorSessionForOrg } from "@/lib/operator-portal/auth";
import { contactDisplayName, formatRelative } from "@/lib/operator-portal/mobile-format";

function snippet(body: string, max = 64): string {
  const t = body.trim().replace(/\s+/g, " ");
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

export default async function OperatorMessagesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await getOperatorSessionForOrg(orgSlug);
  if (!session) return null;
  const orgId = session.orgId;

  const rows = await db
    .select({
      contactId: smsMessages.contactId,
      direction: smsMessages.direction,
      body: smsMessages.body,
      createdAt: smsMessages.createdAt,
    })
    .from(smsMessages)
    .where(eq(smsMessages.orgId, orgId))
    .orderBy(desc(smsMessages.createdAt))
    .limit(500);

  type Thread = {
    contactId: string;
    lastMessageAt: Date;
    lastMessageBody: string;
    lastDirection: "inbound" | "outbound";
    hasInbound: boolean;
    seenOutbound: boolean;
    unreadCount: number;
  };
  const threadMap = new Map<string, Thread>();
  for (const row of rows) {
    if (!row.contactId) continue;
    const direction = row.direction as "inbound" | "outbound";
    let t = threadMap.get(row.contactId);
    if (!t) {
      t = {
        contactId: row.contactId,
        lastMessageAt: row.createdAt,
        lastMessageBody: row.body,
        lastDirection: direction,
        hasInbound: false,
        seenOutbound: false,
        unreadCount: 0,
      };
      threadMap.set(row.contactId, t);
    }
    if (direction === "inbound") {
      t.hasInbound = true;
      if (!t.seenOutbound) t.unreadCount += 1;
    } else {
      t.seenOutbound = true;
    }
  }

  const candidateIds = Array.from(threadMap.values())
    .filter((t) => t.hasInbound)
    .map((t) => t.contactId);

  const contactRows = candidateIds.length
    ? await db
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          phone: contacts.phone,
        })
        .from(contacts)
        .where(eq(contacts.orgId, orgId))
    : [];
  const contactById = new Map(contactRows.map((c) => [c.id, c]));

  const threads = candidateIds
    .map((id) => {
      const t = threadMap.get(id)!;
      const c = contactById.get(id) ?? null;
      return {
        ...t,
        name: contactDisplayName({
          firstName: c?.firstName ?? null,
          lastName: c?.lastName ?? null,
          phone: c?.phone ?? null,
        }),
      };
    })
    .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());

  const base = `/portal/${orgSlug}`;

  return (
    <section className="flex flex-col gap-3 px-4 py-4">
      <header>
        <h1 className="text-[18px] font-semibold tracking-tight" style={{ color: "#111" }}>
          Messages
        </h1>
        <p className="text-[13px]" style={{ color: "#777" }}>
          {threads.length === 0
            ? "No texts yet. Replies land here when a customer texts you."
            : "Two-way SMS with your customers."}
        </p>
      </header>

      {threads.length === 0 ? null : (
        <ul className="overflow-hidden rounded-2xl bg-white" style={{ border: "1px solid #E5E5E1" }}>
          {threads.map((t, i) => (
            <li key={t.contactId} style={{ borderTop: i === 0 ? "none" : "1px solid #EFEFEC" }}>
              <Link href={`${base}/messages/${t.contactId}`} className="flex items-start gap-3 px-4 py-3">
                <div
                  className="flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold"
                  style={{ backgroundColor: "#F0F0EC", color: "#555" }}
                >
                  {t.name.trim().charAt(0).toUpperCase() || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[14px] font-semibold" style={{ color: "#111" }}>{t.name}</p>
                    <span className="shrink-0 text-[11px]" style={{ color: "#999" }}>
                      {formatRelative(t.lastMessageAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-[12px]" style={{ color: "#777" }}>
                      {t.lastDirection === "outbound" ? <span style={{ color: "#AAA" }}>You: </span> : null}
                      {snippet(t.lastMessageBody)}
                    </p>
                    {t.unreadCount > 0 ? (
                      <span
                        className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white"
                        style={{ backgroundColor: "#5b21b6" }}
                      >
                        {t.unreadCount}
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Write the thread view**

Create `packages/crm/src/app/portal/[orgSlug]/(operator)/messages/[contactId]/page.tsx`:

```tsx
// v1 PWA — SMS thread view (read-focused).
//
// Full conversation with one contact (ascending), scoped to the
// operator workspace. Header shows the contact name + Call/Text
// actions (tap-to-text opens the native composer). In-app reply is a
// fast-follow; v1 reads the thread + bounces to the device SMS app.

import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, smsMessages } from "@/db/schema";
import { getOperatorSessionForOrg } from "@/lib/operator-portal/auth";
import { contactDisplayName, smsHref, telHref } from "@/lib/operator-portal/mobile-format";

export default async function OperatorThreadPage({
  params,
}: {
  params: Promise<{ orgSlug: string; contactId: string }>;
}) {
  const { orgSlug, contactId } = await params;
  const session = await getOperatorSessionForOrg(orgSlug);
  if (!session) return null;
  const orgId = session.orgId;

  const [contact] = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      phone: contacts.phone,
    })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)))
    .limit(1);

  if (!contact) notFound();

  const messages = await db
    .select({
      id: smsMessages.id,
      direction: smsMessages.direction,
      body: smsMessages.body,
      createdAt: smsMessages.createdAt,
    })
    .from(smsMessages)
    .where(and(eq(smsMessages.orgId, orgId), eq(smsMessages.contactId, contactId)))
    .orderBy(asc(smsMessages.createdAt));

  const name = contactDisplayName({
    firstName: contact.firstName,
    lastName: contact.lastName,
    phone: contact.phone,
  });
  const base = `/portal/${orgSlug}`;

  return (
    <section className="flex flex-col">
      <header
        className="sticky top-[57px] z-10 flex items-center gap-3 px-4 py-2.5"
        style={{ backgroundColor: "#FFFFFF", borderBottom: "1px solid #E5E5E1" }}
      >
        <Link href={`${base}/messages`} className="text-[13px]" style={{ color: "#5b21b6" }}>
          ‹ Back
        </Link>
        <p className="min-w-0 flex-1 truncate text-[14px] font-semibold" style={{ color: "#111" }}>
          {name}
        </p>
        {contact.phone ? (
          <div className="flex items-center gap-2">
            <a href={telHref(contact.phone)} className="text-[12px] font-semibold" style={{ color: "#5b21b6" }}>
              Call
            </a>
            <a href={smsHref(contact.phone)} className="text-[12px] font-semibold" style={{ color: "#5b21b6" }}>
              Text
            </a>
          </div>
        ) : null}
      </header>

      <div className="flex flex-col gap-2 px-4 py-4">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-[13px]" style={{ color: "#999" }}>
            No messages in this thread yet.
          </p>
        ) : (
          messages.map((m) => {
            const outbound = m.direction === "outbound";
            return (
              <div
                key={m.id}
                className="max-w-[80%] rounded-2xl px-3 py-2 text-[13px]"
                style={{
                  alignSelf: outbound ? "flex-end" : "flex-start",
                  backgroundColor: outbound ? "#5b21b6" : "#FFFFFF",
                  color: outbound ? "#FFFFFF" : "#111",
                  border: outbound ? "none" : "1px solid #E5E5E1",
                }}
              >
                {m.body}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd packages/crm && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification — inbox + thread**

With a demo operator session that has inbound SMS (or seed one via the dashboard `/conversations`): visit `/portal/<demo-slug>/messages` → confirm threads grouped by contact, latest snippet, unread badge counts; tap a thread → `/messages/<contactId>` shows the full conversation (outbound right/purple, inbound left/white), and the header Call/Text links carry `tel:`/`sms:`. A workspace with no inbound texts shows the empty state.

- [ ] **Step 5: Commit**

```bash
git add "packages/crm/src/app/portal/[orgSlug]/(operator)/messages/"
git commit -m "feat(pwa): Messages inbox + read-focused thread view"
```

---

## Task 9: Appointments screen

**Files:**
- Create: `packages/crm/src/app/portal/[orgSlug]/(operator)/appointments/page.tsx`

> Reuses `listBookings(orgId)` (accepts the orgId override; already excludes template rows) and the TDD'd `groupBookingsByDay`. Shows upcoming bookings grouped by day with time / customer / service.

- [ ] **Step 1: Write the Appointments screen**

Create `packages/crm/src/app/portal/[orgSlug]/(operator)/appointments/page.tsx`:

```tsx
// v1 PWA — Appointments screen.
//
// Upcoming bookings grouped by day (date/time, customer, service).
// Reuses listBookings(orgId) — excludes template rows — filtered to
// future/active and grouped via the TDD'd groupBookingsByDay.

import { getOperatorSessionForOrg } from "@/lib/operator-portal/auth";
import { listBookings } from "@/lib/bookings/actions";
import { contactDisplayName, groupBookingsByDay } from "@/lib/operator-portal/mobile-format";

export default async function OperatorAppointmentsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await getOperatorSessionForOrg(orgSlug);
  if (!session) return null;

  const all = await listBookings(session.orgId);
  const now = Date.now();
  const upcoming = all
    .filter((b) => b.status !== "cancelled" && new Date(b.startsAt).getTime() >= now - 60 * 60 * 1000)
    .map((b) => ({
      id: b.id,
      startsAt: new Date(b.startsAt),
      title: b.title,
      fullName: b.fullName,
    }));

  const groups = groupBookingsByDay(upcoming);

  return (
    <section className="flex flex-col gap-4 px-4 py-4">
      <header>
        <h1 className="text-[18px] font-semibold tracking-tight" style={{ color: "#111" }}>
          Appointments
        </h1>
        <p className="text-[13px]" style={{ color: "#777" }}>
          {upcoming.length === 0
            ? "No upcoming appointments."
            : `${upcoming.length} upcoming.`}
        </p>
      </header>

      {groups.map((group) => (
        <div key={group.dayKey} className="flex flex-col gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "#999" }}>
            {group.label}
          </p>
          <ul className="overflow-hidden rounded-2xl bg-white" style={{ border: "1px solid #E5E5E1" }}>
            {group.items.map((b, i) => {
              const time = b.startsAt.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              });
              return (
                <li
                  key={b.id}
                  className="flex items-center gap-3 px-4 py-3"
                  style={{ borderTop: i === 0 ? "none" : "1px solid #EFEFEC" }}
                >
                  <span className="w-16 shrink-0 text-[13px] font-semibold" style={{ color: "#111" }}>
                    {time}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium" style={{ color: "#111" }}>
                      {b.title}
                    </span>
                    <span className="block truncate text-[12px]" style={{ color: "#888" }}>
                      {contactDisplayName({ firstName: b.fullName, lastName: null })}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd packages/crm && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification — Appointments grouped by day**

With a demo operator session, visit `/portal/<demo-slug>/appointments` → confirm upcoming bookings grouped under day headers ("Mon, Jun 15"), each row showing time, service title, and customer name; cancelled + past bookings excluded; empty state when none.

- [ ] **Step 4: Commit**

```bash
git add "packages/crm/src/app/portal/[orgSlug]/(operator)/appointments/page.tsx"
git commit -m "feat(pwa): Appointments screen grouped by day"
```

---

## Task 10: Land the PWA on Today after magic-link login

**Files:**
- Modify: `packages/crm/src/app/portal/[orgSlug]/magic/route.ts`

> A freshly-installed PWA opens `/portal/<slug>`; with no session that redirects to login; after the magic link is consumed, the operator should land back on the mobile shell (Today), NOT `/dashboard`. One-line default-target change. Keeps the explicit `?redirect=` override (still must be a relative path).

- [ ] **Step 1: Change the default redirect target**

In `packages/crm/src/app/portal/[orgSlug]/magic/route.ts`, the success branch currently reads:

```typescript
  const target =
    redirectTo && redirectTo.startsWith("/") ? redirectTo : `/dashboard`;
  return NextResponse.redirect(new URL(target, request.url));
```

Replace `/dashboard` with the mobile shell root and update the comment above it:

```typescript
  // v1 PWA — land on the mobile shell (Today), not the dense desktop
  // CRM. The installed contractor app's start_url is /portal/<slug>/,
  // so after sign-in the operator continues straight into the app they
  // launched. An explicit ?redirect= (relative) still wins.
  const target =
    redirectTo && redirectTo.startsWith("/") ? redirectTo : `/portal/${orgSlug}`;
  return NextResponse.redirect(new URL(target, request.url));
```

- [ ] **Step 2: Typecheck**

Run: `cd packages/crm && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification — magic link lands on Today**

Request + consume a magic link for a demo workspace; confirm the browser lands on `/portal/<demo-slug>` (the mobile shell Today screen), not `/dashboard`.

- [ ] **Step 4: Commit**

```bash
git add "packages/crm/src/app/portal/[orgSlug]/magic/route.ts"
git commit -m "feat(pwa): land operator on mobile shell (Today) after magic-link login"
```

---

## Task 11: Attach the 9 demo workspaces to the Seldon Studio partner agency (Neon)

**Files:** none (data task — Neon SQL via `mcp__neon__run_sql`, project `autumn-field-50385990`).

> The operator portal is gated to Scale-tier-or-agency-attached. Attaching the 9 demos to the Seldon Studio partner agency both unlocks the portal/PWA for them AND brands their installed app as Seldon Studio (the manifest + shell read `getEffectiveBrandingForWorkspace`, which only substitutes chrome when the agency status is `'active'`). We use direct SQL (per the integration map) because `attachWorkspaceToAgency(...)` enforces an ownership-authz check meant for the in-app flow; setting `parent_agency_id` directly is the operator/admin-side equivalent.
>
> **CONFIRM-FIRST INPUT:** the Seldon Studio **partner-agency id**. Do NOT guess. Resolve it read-only (Step 1) and confirm with the user before any write. (The canonical Seldon Studio *organization* id is `e1b16f47-d90a-4f3f-adb5-484b639ff0ed`, but the **partner_agencies** row id is what `parent_agency_id` must point at — they are different tables.)
>
> The 9 demo slugs (from prior work, task #126): `rapid-rooter-plumbing-828a`, `peakair-heating-cooling-e7df`, `summit-roofing-co-e045`, `voltware-electric-1325`, `hearth-home-builds-87ac`, `coastline-garage-doors-4c77`, `lumire-med-spa-20b0`, `vitalis-weight-clinic-d320`, `apex-trt-hormone-7b4a`.

- [ ] **Step 1: Resolve the Seldon Studio partner-agency id + its status (READ ONLY)**

Run via `mcp__neon__run_sql` (project `autumn-field-50385990`):

```sql
SELECT id, name, slug, status, owner_workspace_id
FROM partner_agencies
WHERE name ILIKE '%seldon studio%' OR slug ILIKE '%seldon%';
```

Expected: one (or few) rows. Note the `id` (this is `<AGENCY_ID>`) and confirm `status = 'active'`. If `status <> 'active'`, STOP — branding substitution + the gate require an active agency; surface this to the user (the agency must be activated, which is tied to the owning workspace's Scale tier). Confirm the chosen `<AGENCY_ID>` with the user before proceeding.

- [ ] **Step 2: Preview the 9 target workspaces (READ ONLY)**

```sql
SELECT id, slug, name, parent_agency_id
FROM organizations
WHERE slug IN (
  'rapid-rooter-plumbing-828a','peakair-heating-cooling-e7df','summit-roofing-co-e045',
  'voltware-electric-1325','hearth-home-builds-87ac','coastline-garage-doors-4c77',
  'lumire-med-spa-20b0','vitalis-weight-clinic-d320','apex-trt-hormone-7b4a'
)
ORDER BY slug;
```

Expected: exactly 9 rows. Confirm each `parent_agency_id` is currently `NULL` (or already the agency id). If fewer than 9 rows return, STOP and reconcile slugs with the user (slugs carry random suffixes; do not invent them).

- [ ] **Step 3: Attach the 9 workspaces (WRITE — only after Steps 1-2 confirmed)**

Substitute the confirmed `<AGENCY_ID>` and run:

```sql
UPDATE organizations
SET parent_agency_id = '<AGENCY_ID>', updated_at = now()
WHERE slug IN (
  'rapid-rooter-plumbing-828a','peakair-heating-cooling-e7df','summit-roofing-co-e045',
  'voltware-electric-1325','hearth-home-builds-87ac','coastline-garage-doors-4c77',
  'lumire-med-spa-20b0','vitalis-weight-clinic-d320','apex-trt-hormone-7b4a'
)
AND (parent_agency_id IS NULL OR parent_agency_id <> '<AGENCY_ID>');
```

Expected: `UPDATE 9` (or fewer if some were already attached).

- [ ] **Step 4: Verify the attachment + resulting branding**

```sql
SELECT o.slug, o.parent_agency_id, a.name AS agency_name, a.status AS agency_status,
       a.primary_color, a.logo_url
FROM organizations o
JOIN partner_agencies a ON a.id = o.parent_agency_id
WHERE o.slug IN (
  'rapid-rooter-plumbing-828a','peakair-heating-cooling-e7df','summit-roofing-co-e045',
  'voltware-electric-1325','hearth-home-builds-87ac','coastline-garage-doors-4c77',
  'lumire-med-spa-20b0','vitalis-weight-clinic-d320','apex-trt-hormone-7b4a'
)
ORDER BY o.slug;
```

Expected: 9 rows, each `agency_name = "Seldon Studio"`, `agency_status = "active"`. Then re-run the Task 3 manual curl for one slug and confirm the manifest `name` is now "Seldon Studio" and `theme_color` is the agency `primary_color` — proving the data task flows through to the installed app identity.

- [ ] **Step 5: Record the result**

No commit (no files changed). Note in the PR/turn summary: "Attached 9 Seldon Studio demos to partner agency `<AGENCY_ID>`; manifest + shell now brand as Seldon Studio."

---

## Task 12: Final build/verify + manual install smokes

**Files:** none (verification only).

> The full prod gate is `next build` (Turbopack). `tsc --noEmit` does NOT catch the `'use server'`-non-async-export rule, which has broken `main` before — `check-use-server.sh` does. Run both. The PWA specifically needs `next build` to confirm the `manifest.webmanifest` route + the layout metadata + the route tree all compile, and that `public/sw.js` ships as a static asset.

- [ ] **Step 1: Run the use-server gate + typecheck**

Run:
```bash
cd packages/crm && bash scripts/check-use-server.sh src && npx tsc --noEmit
```
Expected: the script prints no violations and exits 0; tsc reports no errors. (If `counts.ts` trips the gate, confirm every export there is `async` — the two pure helpers are intentionally async-wrapped for this reason.)

- [ ] **Step 2: Run the full unit suite**

Run: `pnpm test:unit`
Expected: all green, including the new `branding-to-manifest.spec.ts`, `counts.spec.ts`, `mobile-format.spec.ts`.

- [ ] **Step 3: Run the full production build**

Run: `cd packages/crm && pnpm build`
Expected: build succeeds. Confirm the build output lists the routes `/portal/[orgSlug]/manifest.webmanifest`, `/portal/[orgSlug]/(operator)` (Today), `/leads`, `/messages`, `/messages/[contactId]`, `/appointments`, `/offline`. No "use server may only export async" error.

- [ ] **Step 4: Manual smoke — desktop Chrome install**

`pnpm start` (or use a Vercel preview). Sign in to a demo operator portal, land on Today. In Chrome desktop: open DevTools → Application → Manifest → confirm name = "Seldon Studio", `start_url`/`scope` = `/portal/<slug>/`, 3 icons resolve (no 404). Application → Service Workers → confirm `/sw.js` is activated for the `/portal/<slug>/` scope. Confirm the install icon appears in the address bar (or the in-app "Install app" button) → install → the app opens standalone and lands on Today.

- [ ] **Step 5: Manual smoke — iOS Add-to-Home-Screen**

On an iPhone (Safari) against the preview URL: sign in → Today. Tap Share → **Add to Home Screen** → confirm the icon is the apple-touch-icon and the title shows; launch from the home screen → opens standalone (no Safari chrome) and lands on Today. (No install prompt on iOS — the in-shell hint "tap Share, then Add to Home Screen" should be visible there.)

- [ ] **Step 6: Manual smoke — offline shell**

In the installed/standalone app, toggle the device offline (DevTools → Network → Offline, or airplane mode) and navigate (e.g. tap a tab) → the precached `/portal/<slug>/offline` page renders ("You're offline"), not a browser error page. Toggle back online → data screens load again.

- [ ] **Step 7: Manual smoke — per-agency branding correctness**

Confirm a demo shows "Seldon Studio" name + agency color in the manifest/shell (post-Task 11), and a NON-attached workspace (any Scale-tier workspace not under the agency, if available) falls back to SeldonFrame defaults in its manifest — proving the fallback path.

- [ ] **Step 8: Finalize**

If all smokes pass, the branch is ready. Use `superpowers:finishing-a-development-branch` to choose merge/PR. (Per project convention: merge to `main` via an isolated worktree `git merge --no-ff` + `push HEAD:main`; Vercel auto-deploys main → production. gh CLI is not authenticated in this environment.)

---

## Notes for the implementer

- **Route group + param names are `(operator)` and `[orgSlug]`.** Do not rename to `(client)`/`[slug]` even if a tool autocompletes that — the on-disk truth is `(operator)`/`[orgSlug]`.
- **`getOperatorSessionForOrg(orgSlug)` returns `{ orgId, orgSlug, email, supportOriginUserId } | null`.** It's already exported + async. Each screen calls it for the orgId; the layout's `requireOperatorSessionForOrg` handles the redirect-on-missing.
- **The data helpers' orgId overrides exist for exactly this surface** (v1.24.0 "operator-portal mirror"): `listContacts({ orgId })`, `listBookings(orgId)`, `listDeals(orgId)`. Use them; don't re-query the tables directly except for the bespoke Today bookings query + the Messages grouping (which need column projections the helpers don't expose).
- **`"use server"` files may only export async functions/types.** `counts.ts` is `"use server"` so its pure helpers are async-wrapped on purpose. `mobile-format.ts` is deliberately NOT `"use server"` so it can export sync utilities used by both server + (potential) client components.
- **`sms_messages` has no `read_at`.** All "unread" logic is derived ("inbound with no outbound after"), exactly like the existing `/conversations` inbox.
- **Service worker is hand-rolled (Decision #2).** If a future task wants serwist, the upgrade path is documented at the top of this plan.
- **Icons (Task 1) are an asset dependency.** Everything downstream assumes `/icon-192.png`, `/icon-512.png`, `/apple-touch-icon.png` exist in `packages/crm/public/`.
