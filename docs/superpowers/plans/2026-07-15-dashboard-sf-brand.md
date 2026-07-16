# Dashboard SF Brand + Retire /settings/theme — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The authenticated dashboard always renders in the SeldonFrame brand (the forest/paper tokens already in `design-tokens.css`) instead of per-workspace theme colors, and the `/settings/theme` page is retired (redirects to `/settings/branding`).

**Architecture:** Delete the "admin theme bridge" (`adminThemeToCSSVars` + `AdminThemeProvider`) that injects per-org `--primary/--ring/--accent/--radius` overrides into the dashboard chrome — the base shadcn tokens in `packages/crm/src/styles/design-tokens.css` are already the SF marketing palette, so removal alone delivers the rebrand for all existing and future workspaces with no migration. Separately, replace the `/settings/theme` page with a server redirect and repoint its inbound links. Public-surface theming (`PublicThemeProvider`, `themeToCSS`, archetypes, copilot `update_theme`, `saveThemeForOrg`) is untouched.

**Tech Stack:** Next.js App Router (packages/crm), node:test unit suite, TypeScript.

**Spec:** `docs/superpowers/specs/2026-07-15-dashboard-sf-brand-design.md`

## Global Constraints

- Branch: `dashboard-sf-brand` (already cut from origin/main; spec committed).
- Do NOT touch: `public-theme-provider.tsx`, `apply-theme.ts`, `normalize-theme.ts`, archetype files, copilot `update_theme`/`update_design` tools, `organizations.theme` schema/data. `saveThemeForOrg` in `save-theme.ts` stays (only its `REVALIDATE_PATHS` list is trimmed).
- Keep `getThemeSettings` in `lib/theme/actions.ts` — the dashboard layout (logo) and forms page (swatch) still use it.
- Logos stay: workspace logo + agency whitelabel logo rendering in `app/(dashboard)/layout.tsx` / sidebar must be unchanged.
- Unit tests are DB-bound-flaky by baseline (~50-65 failures on Neon-bound specs are pre-existing). Judge by DELTA vs a baseline run, never absolute count. Runner: `node scripts/run-unit-tests.js` from repo root (also `pnpm test:unit`).
- Typecheck: `pnpm --filter @seldonframe/crm typecheck` (repo root). If `packages/crm/node_modules` junction is missing in a worktree, see memory note "Worktree typecheck method" — in the main checkout it works directly.
- Windows/PowerShell environment; paths contain a space (`Seldon Frame`) — always quote.

---

### Task 1: Remove the admin theme bridge (dashboard always SF tokens)

**Files:**
- Modify: `packages/crm/src/app/(dashboard)/layout.tsx` (import ~line 30-40, comment+fetch ~116-122, wrapper ~290 and its closing tag near end of JSX, logo comment ~299)
- Delete: `packages/crm/src/lib/theme/admin-theme.ts`
- Delete: `packages/crm/src/components/theme/admin-theme-provider.tsx`
- Delete: `packages/crm/tests/unit/ui/admin-theme.spec.ts`
- Modify: `packages/crm/tests/unit/ui/integration.spec.tsx`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: dashboard layout no longer wraps children in `AdminThemeProvider`; `adminThemeSettings` local in `layout.tsx` remains and is used ONLY for `workspaceLogoUrl`.

- [ ] **Step 1: Baseline the unit suite** (so Task-end delta is honest)

Run from repo root: `node scripts/run-unit-tests.js` — record pass/fail counts. Expect the DB-bound baseline failures; that's fine.

- [ ] **Step 2: Remove the wrapper from the dashboard layout**

In `packages/crm/src/app/(dashboard)/layout.tsx`:

a) Delete the import line:
```tsx
import { AdminThemeProvider } from "@/components/theme/admin-theme-provider";
```

b) Replace the fetch comment (lines ~116-119) so it explains why the fetch survives:
```tsx
  // 2026-05-17 — fetch the workspace theme so the AdminThemeProvider
  // can override --primary / --ring / --accent / --radius in admin
  // chrome. Best-effort: failures just skip the override (chrome falls
  // back to default shadcn tokens).
```
becomes:
```tsx
  // 2026-07-15 — the admin theme bridge is gone: the dashboard always
  // wears the SF brand tokens from design-tokens.css. This fetch
  // survives only for theme.logoUrl (workspace switcher tile below).
  // Best-effort: failures just drop the logo.
```

c) Remove the JSX wrapper. The opening tag (line ~290):
```tsx
      <AdminThemeProvider theme={adminThemeSettings?.theme ?? null}>
```
and its matching `</AdminThemeProvider>` closing tag near the end of the returned JSX — delete both lines, keeping the children exactly as they are (fix indentation only if trivial; a dedent-free deletion is fine).

d) Update the workspace-logo comment (~line 299) which says "workspace logo from /settings/theme":
```tsx
              // 2026-05-18 — workspace logo from /settings/theme. The
```
becomes:
```tsx
              // 2026-05-18 — workspace logo from theme.logoUrl. The
```
(rest of that comment block unchanged).

- [ ] **Step 3: Delete the bridge module, provider, and its unit spec**

```powershell
git rm "packages/crm/src/lib/theme/admin-theme.ts" "packages/crm/src/components/theme/admin-theme-provider.tsx" "packages/crm/tests/unit/ui/admin-theme.spec.ts"
```

- [ ] **Step 4: Update the integration spec**

In `packages/crm/tests/unit/ui/integration.spec.tsx`:

a) Header comment: replace scope item 2 (lines 6-7):
```
//   2. Theme propagation through <AdminThemeProvider> surfaces on
//      the DOM as CSS custom properties.
```
with:
```
//   2. (retired 2026-07-15) Theme propagation — the admin theme
//      bridge was removed; the dashboard always uses SF brand tokens.
```

b) Delete imports (lines 43-44):
```tsx
import { AdminThemeProvider } from "../../../src/components/theme/admin-theme-provider";
import { DEFAULT_ORG_THEME } from "../../../src/lib/theme/types";
```
(`DEFAULT_ORG_THEME` is used only inside the sections edited below — after these edits it is unused; verify with a grep in the file before deleting the import.)

c) Delete the whole section-2 describe block, including its banner comment (lines ~217-271): from
```tsx
// ---------------------------------------------------------------------
// 2. Theme propagation
// ---------------------------------------------------------------------

describe("integration — theme propagation through <AdminThemeProvider>", () => {
```
through its closing `});`.

d) Section 3 ("scaffold schema + all patterns compose in one tree"): replace the wrapper
```tsx
    const html = renderToString(
      <AdminThemeProvider theme={DEFAULT_ORG_THEME}>
        <BlockListPage
```
with
```tsx
    const html = renderToString(
      <>
        <BlockListPage
```
and the closing
```tsx
      </AdminThemeProvider>,
    );
```
with
```tsx
      </>,
    );
```
Then delete the now-false assertion:
```tsx
    assert.match(html, /data-admin-theme-provider=""/);
```
Also update the section-3 banner comment line "wrapped by AdminThemeProvider, sibling to a CompositionCard + ActivityFeed." → "sibling to a CompositionCard + ActivityFeed."

e) Section 4 ("zero console noise"): same surgery — replace `<AdminThemeProvider theme={DEFAULT_ORG_THEME}>` with `<>` and `</AdminThemeProvider>,` with `</>,`. (No data-admin-theme-provider assertion in this block.)

- [ ] **Step 5: Typecheck + targeted grep**

Run: `pnpm --filter @seldonframe/crm typecheck` → expect clean (or identical to pre-change baseline).
Run: `git grep -n "AdminThemeProvider\|adminThemeToCSSVars\|admin-theme"` → expect ZERO hits in `packages/crm/src` and `packages/crm/tests` (docs/ hits are fine).

- [ ] **Step 6: Run the unit suite, judge by delta**

Run: `node scripts/run-unit-tests.js`. Compare to Step 1 baseline: the deleted `admin-theme.spec.ts` tests disappear, `integration.spec.tsx` still passes, no NEW failures elsewhere.

- [ ] **Step 7: Commit**

```powershell
git add -A
git commit -m "feat(dashboard): always wear the SF brand — remove per-org admin theme bridge"
```

---

### Task 2: Retire /settings/theme (redirect + remove form and its action)

**Files:**
- Modify: `packages/crm/src/app/(dashboard)/settings/theme/page.tsx` (full rewrite → redirect)
- Delete: `packages/crm/src/components/theme/theme-settings-form.tsx`
- Modify: `packages/crm/src/lib/theme/actions.ts` (remove `saveThemeSettingsAction`, lines 100-132)
- Modify: `packages/crm/src/lib/theme/save-theme.ts` (trim `REVALIDATE_PATHS`, line 22)
- Modify: `packages/crm/src/lib/agents/copilot/tools.ts` (stale comment ~line 537)
- Modify: `packages/crm/src/lib/onboarding/execute-change-plan.ts` (stale comment ~line 220)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `/settings/theme` now server-redirects to `/settings/branding`. `lib/theme/actions.ts` exports only `getThemeSettings`, `getPublicOrgThemeBySlug`, `getPublicOrgThemeById`. `saveThemeForOrg` (lib/theme/save-theme.ts) unchanged — still the copilot write path.

- [ ] **Step 1: Rewrite the page as a redirect**

Replace the ENTIRE content of `packages/crm/src/app/(dashboard)/settings/theme/page.tsx` with:

```tsx
import { redirect } from "next/navigation";

// 2026-07-15 — the Brand & Theme form is retired. The dashboard always
// wears the SF brand (design-tokens.css); public-page styling is
// customized via the copilot (update_theme / update_design) and the
// design picker. Brand name + logo live at /settings/branding — old
// bookmarks land there instead of 404ing.
export default function ThemeSettingsPage() {
  redirect("/settings/branding");
}
```

- [ ] **Step 2: Delete the form component**

```powershell
git rm "packages/crm/src/components/theme/theme-settings-form.tsx"
```
(Verify first it has no other importers: `git grep -n "theme-settings-form\|ThemeSettingsForm" -- packages/crm/src` should now return nothing.)

- [ ] **Step 3: Remove `saveThemeSettingsAction` from `lib/theme/actions.ts`**

Delete lines 100-132 (the whole `export async function saveThemeSettingsAction(formData: FormData) { ... }` including its preceding comment block inside the function). Then remove the now-unused imports at the top of the file:
- `redirect` from `next/navigation` (line 4)
- `assertWritable` from `@/lib/demo/server` (line 8)
- `saveThemeForOrg` from `@/lib/theme/save-theme` (line 11)

Do NOT remove the `OrgTheme` type import (line 9) — the two `getPublicOrgTheme*` signatures still return `Promise<OrgTheme>`.

- [ ] **Step 4: Trim the revalidate list**

In `packages/crm/src/lib/theme/save-theme.ts` line 22:
```ts
const REVALIDATE_PATHS = ["/settings", "/settings/theme", "/l", "/book", "/forms"] as const;
```
becomes:
```ts
const REVALIDATE_PATHS = ["/settings", "/l", "/book", "/forms"] as const;
```

- [ ] **Step 5: Fix stale comments**

a) `packages/crm/src/lib/agents/copilot/tools.ts` ~line 537 — the comment referencing `saveThemeSettingsAction, lib/theme/actions.ts:100`. Reword that one comment line to reference `saveThemeForOrg (lib/theme/save-theme.ts)` instead (read the surrounding block and keep its meaning; only the dead symbol/path changes).

b) `packages/crm/src/lib/onboarding/execute-change-plan.ts` ~line 220 — comment "Direct DB write — mirrors saveThemeSettingsAction but without session". Reword to "Direct DB write — mirrors the retired settings-form action (theme writes now flow through saveThemeForOrg) but without session".

- [ ] **Step 6: Typecheck + grep**

Run: `pnpm --filter @seldonframe/crm typecheck` → clean.
Run: `git grep -n "saveThemeSettingsAction" -- packages/crm` → zero hits.

- [ ] **Step 7: Commit**

```powershell
git add -A
git commit -m "feat(settings): retire /settings/theme — redirect to /settings/branding, remove form + action"
```

---

### Task 3: Repoint inbound links and copy

**Files:**
- Modify: `packages/crm/src/app/(dashboard)/settings/page.tsx` (two cards ~lines 198-208 and ~344-354; themeSettings fetch ~lines 14, 42-50)
- Modify: `packages/crm/src/app/(dashboard)/forms/page.tsx` (callout link ~lines 67-101)
- Modify: `packages/crm/src/components/settings/client-portal-settings.tsx` (~lines 310-319)
- Modify: `packages/crm/src/components/layout/sidebar.tsx` (comment ~line 233)
- Modify: `packages/crm/src/components/bookings/public-booking-form.tsx` (comment ~line 150)

**Interfaces:**
- Consumes: Task 2's redirect existing (links would still work mid-flight thanks to the redirect, so order is not load-bearing).
- Produces: no `href="/settings/theme"` remains anywhere in `packages/crm/src`.

- [ ] **Step 1: settings index — replace the two "Brand & Theme" cards**

In `packages/crm/src/app/(dashboard)/settings/page.tsx`:

a) Card in the grouped view (~lines 198-208):
```tsx
        {
          href: "/settings/theme",
          title: "Brand & Theme",
          description: "Colors, fonts, logo for your public pages and chatbot",
          status: (
            <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full border border-border" style={{ backgroundColor: themeSettings?.theme.primaryColor || "#059669" }} />
              {themeSettings?.theme.primaryColor || "Primary color"}
            </span>
          ),
        },
```
becomes:
```tsx
        {
          href: "/settings/branding",
          title: "Branding",
          description: "Brand name and logo for your public pages — ask the copilot to change colors",
          status: null,
        },
```

b) Card in `clientWorkspaceCards` (~lines 344-354): same replacement (identical old block except the description reads "Colors, fonts, logo for public pages and the chatbot"), same new block as above.

c) `themeSettings` is now unused in this file. Remove:
- the import (line 14): `import { getThemeSettings } from "@/lib/theme/actions";`
- `const themeSettingsPromise = getThemeSettings().catch(() => null);` (line 42)
- `themeSettings` from BOTH the destructuring array and the `Promise.all([...])` array (line 44-50) — these are positional; remove the same slot from each.

Note: the `advancedItems` entry `{ href: "/settings/branding", title: "White-label Branding", ... }` (~line 322) stays as-is — same destination from a different angle (agency white-label toggle) is acceptable.

- [ ] **Step 2: forms page — repoint the design callout**

In `packages/crm/src/app/(dashboard)/forms/page.tsx`:

a) The comment block (~lines 67-73): replace the sentence
```
          Clicking "Customize design" lands on /settings/theme where
          they can upload a logo, pick fonts, and tune the brand color
          — every saved field cascades to all intake forms automatically. */}
```
with:
```
          Clicking "Customize design" lands on /settings/branding for
          the logo; colors/fonts are changed by asking the copilot
          (update_theme) — every saved field cascades to all intake
          forms automatically. */}
```

b) `href="/settings/theme"` (line 75) → `href="/settings/branding"`.

c) Copy strings (~lines 97-98):
```tsx
              ? "Logo, primary color, and font cascade automatically. Tweak anytime in Brand & Theme."
              : "Upload a logo and pick brand colors / fonts in Brand & Theme. Every intake form picks them up automatically."}
```
becomes:
```tsx
              ? "Logo, primary color, and font cascade automatically. Tweak your logo in Branding, or ask the copilot to change colors."
              : "Upload a logo in Branding — or ask the copilot to change colors and fonts. Every intake form picks them up automatically."}
```

(The `getThemeSettings` usage for `themePrimary`/`themeLogoUrl` swatch display in this file STAYS.)

- [ ] **Step 3: client portal settings — repoint the footer link**

In `packages/crm/src/components/settings/client-portal-settings.tsx` (~lines 310-319):
```tsx
        <p className="mt-3 text-xs text-muted-foreground">
          Adjust your brand color in{" "}
          <Link
            href="/settings/theme"
            className="text-primary underline-offset-4 hover:underline"
          >
            Brand &amp; Theme
          </Link>
          .
        </p>
```
becomes:
```tsx
        <p className="mt-3 text-xs text-muted-foreground">
          Adjust your logo and brand name in{" "}
          <Link
            href="/settings/branding"
            className="text-primary underline-offset-4 hover:underline"
          >
            Branding
          </Link>
          {" "}— or ask the copilot to change your brand color.
        </p>
```

- [ ] **Step 4: stale comments**

a) `packages/crm/src/components/layout/sidebar.tsx` ~line 233: the comment "operator uploads a logo at /settings/theme, that" — reword to "operator uploads a logo (theme.logoUrl, set via /settings/branding or the copilot), that" keeping the rest of the sentence intact.

b) `packages/crm/src/components/bookings/public-booking-form.tsx` ~line 150: comment "The /settings/theme page already persists this" — reword to "The theme write path (saveThemeForOrg) already persists this" keeping surrounding lines intact.

- [ ] **Step 5: Final grep + typecheck + unit delta**

Run: `git grep -n "settings/theme" -- packages/crm/src` → the ONLY acceptable hit is the redirect page path itself (`app/(dashboard)/settings/theme/page.tsx` — its own file path; its content must not link back). Everything else: zero.
Run: `pnpm --filter @seldonframe/crm typecheck` → clean.
Run: `node scripts/run-unit-tests.js` → no new failures vs Task 1 Step 1 baseline.

- [ ] **Step 6: Commit**

```powershell
git add -A
git commit -m "feat(settings): repoint Brand & Theme links to /settings/branding"
```

---

### Task 4: Merge gate + visual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the repo merge gate**

Invoke the `/verify-build` skill (or dispatch the `verify-runner` agent) on branch `dashboard-sf-brand`. Required: ONE green PASS verdict (unit delta, tsc, check-use-server, migration-journal — no migrations in this change — regression-grep).

- [ ] **Step 2: Visual smoke (dev server)**

Start the dev server, sign in to a workspace whose org theme has a loud non-default palette (any archetype-skinned workspace; or temporarily set one's theme.primaryColor to `#ff5722` via the copilot on a test workspace). Verify:
- Dashboard chrome (home, /clients, /inbox, /settings) shows the SF forest/paper tokens — no orange/teal leaking into buttons, focus rings, or accent chips.
- Dark-mode toggle still works (user-controlled, unchanged).
- Sidebar workspace logo still renders.
- `/settings/theme` redirects to `/settings/branding`.
- The workspace's PUBLIC landing/booking/forms pages still show the workspace's own palette (public theming untouched).

- [ ] **Step 3: Report** — summarize delta evidence (baseline vs post counts, grep results, screenshots if captured) before requesting merge.
