# Dashboard always wears the SeldonFrame brand — design

**Date:** 2026-07-15
**Status:** Approved direction (Max, 2026-07-15); spec pending review
**Decision trail:** Max first asked for "all workspaces use the seldonframe.com brand theme", then narrowed scope: only the **dashboard** (the authenticated app where the operator lives) should be uniformly SF-branded. All client-facing surfaces — landing site, chatbot, intake forms, booking pages — keep their archetype/design-choice theming untouched. Max also asked to remove the `/settings/theme` page.

## Problem

The dashboard chrome currently picks up each workspace's `organizations.theme` colors via `AdminThemeProvider`, so the app looks different per workspace (old `#1f2421`/`#3d6e4f` defaults or archetype palettes) instead of the SF marketing brand. Meanwhile the dashboard's base tokens in `packages/crm/src/styles/design-tokens.css` are **already** the forest/paper rebrand palette (`--primary` ≈ #1F2B24, `--background` ≈ #F6F2EA, ink foreground, clay accent, plus a dark variant). The per-org override is the only thing hiding it.

## Design

### 1. Neutralize dashboard color/radius overrides

File: `packages/crm/src/lib/theme/admin-theme.ts` (consumed by `AdminThemeProvider` in `app/(dashboard)/layout.tsx:290`).

- Stop emitting the per-org overrides for `--primary`, `--ring`, `--accent`, and `--radius`.
- The dashboard then falls through to `design-tokens.css` everywhere: forest/paper in light mode, the existing dark variant in dark mode. Uniform squared-radius SF look (radius override removed deliberately — the rebrand look includes shape).
- Existing and future workspaces are covered automatically — **no migration, no theme data touched**. `organizations.theme` keeps driving public surfaces exactly as today.
- If nothing else in the provider remains meaningful (logo is passed separately in the layout), gut the provider to a passthrough or delete it and its wrapper — whichever leaves the smaller, clearer diff. Do not remove the workspace-logo or agency-whitelabel-logo rendering in the layout/sidebar: logos are identity, not theme, and stay.

### 2. Remove `/settings/theme`

- Delete the page UI (`app/(dashboard)/settings/theme/page.tsx` and the `ThemeSettingsForm` component if nothing else uses it).
- Replace the route with a server-side `redirect("/settings/branding")` so old bookmarks/links don't 404.
- **Keep the write path**: `saveThemeForOrg`, `saveThemeSettingsAction`'s underlying logic (or at least `saveThemeForOrg`), the copilot `update_theme` tool, `update_design`, archetypes, and the design picker all stay — they are how public-page theming is customized from now on (copilot-first, plus the design picker; `/settings/branding` keeps brand name + logo).
- Repoint the links that reference `/settings/theme`:
  - `app/(dashboard)/settings/page.tsx` — the two "Brand & Theme" card entries (≈ lines 199, 345): repoint to `/settings/branding` (or fold into the branding card; keep the diff minimal).
  - `app/(dashboard)/forms/page.tsx:75` — "Customize design" link → `/settings/branding`.
  - `components/settings/client-portal-settings.tsx:313` → `/settings/branding`.
  - Comments mentioning the page (`components/layout/sidebar.tsx:233`, `app/(dashboard)/layout.tsx:299`, `components/bookings/public-booking-form.tsx:150`) — update wording so they don't point at a dead page.

### 3. Explicit non-goals

- No change to `PublicThemeProvider`, `themeToCSS`, archetypes, `landing-r1`, booking/intake/chat theming.
- No change to `organizations.theme` schema or stored data.
- No change to dashboard dark-mode behavior (stays user-controlled via next-themes, default dark).
- No new brand-token module (dashboard tokens already match marketing; unification is a separate, larger task if ever wanted).

## Error handling / edge cases

- Workspaces with `customizedAt` set: their colors continue to apply on public pages; dashboard simply stops reflecting them. No data loss.
- Agency-whitelabeled workspaces: whitelabel logo behavior unchanged.
- Any component that read the org-derived `--primary`/`--accent` inside the dashboard now reads the SF token values — that's the intended behavior, but the verification pass should eyeball high-traffic dashboard views (home, clients, inbox, settings) on a workspace with a loud archetype palette to catch contrast regressions.

## Testing / verification

1. Unit/typecheck via `/verify-build` gate.
2. Manual/visual: pick (or create) a workspace with a non-default archetype palette; confirm dashboard renders SF forest/paper (light) and unchanged dark mode, while its **public** landing/booking/forms still show the archetype colors.
3. Confirm `/settings/theme` redirects to `/settings/branding`; confirm forms-page and portal-settings links land correctly.
4. Confirm copilot `update_theme` still saves and still changes public pages (nothing in its path removed).
