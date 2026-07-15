# Live archetype normalized at the source — design

**Date:** 2026-07-15 · **Branch:** `fix/live-archetype-at-source` (off main @ `ea4bffd9d`) · **Status:** prod bug fix (Max report 2026-07-14 evening: design switch changes dashboard colors but not the public site)

## Verified root cause (DB + live-HTML + code, all first-hand)

Workspace `zen-flow-hydration` (org `33b746de-085c-4c6c-9575-6288d6ac2215`):

- `organizations.theme.aestheticArchetype` = `cinematic-aspirational` — Max's
  picker choice WROTE correctly (the picker/track detection is NOT the bug;
  "Cinematic Luxe" = `cinematic-aspirational` in `design-picker/data.ts:51`).
  `theme.primaryColor` = `#a08562` — why his dashboard went gold.
- `landing_pages` r1 row: `blueprint_json.archetype` AND
  `blueprint_json.payload.*.archetype` fields are frozen at build-time
  `clinical-trust`.
- Rendered HTML today:
  - `/w/zen-flow-hydration`: MIXED — SiteShell/Navbar/Hero/Map/LeadForm render
    `data-archetype="cinematic-aspirational"` (the v1.56.0 fix at
    `w/[slug]/page.tsx:235-241` overrides `payload.hero.archetype`), but
    ServicesGrid / Testimonials / FAQ / Footer / sticky-nav render
    `data-archetype="clinical-trust"` — they read their OWN per-section
    `archetype` fields from the payload, which nothing normalizes.
  - Subdomain `zen-flow-hydration.app.seldonframe.com` (route
    `(public)/s/[orgSlug]/[...slug]/page.tsx` — what the dashboard's "View
    your website" opens): 100% frozen `clinical-trust` — this route has NO
    live-theme normalization at all (it passes raw `payload.hero.archetype`
    at lines 164-250).
  - Both responses are `X-Vercel-Cache: MISS`, `no-store` — not a caching
    issue.

**One line:** the archetype is denormalized into many payload fields at
generation time; only ONE render site normalizes only ONE of those fields
from the live org theme, so a design switch re-skins part of /w and none of
the subdomain.

## Fix — normalize once, at the loader

`loadLandingPayload` (`lib/landing/r1-save.ts:~102`) is the single source
both public routes (and any other consumer) read. It already selects
`organizations.theme` and returns `normalizeTheme(orgRow.theme)`.

1. New pure helper `packages/crm/src/lib/landing/apply-live-archetype.ts`:

   ```ts
   export function applyLiveArchetype<T>(payload: T, live: AestheticArchetypeId): T
   ```

   Deep-walks the payload (plain JSON — objects/arrays only) and replaces the
   value of every property named `archetype` whose current value is a string
   key of `ARCHETYPES` (from `@/lib/workspace/aesthetic-archetypes`) with
   `live`. Non-archetype-id values (unknown strings) are left untouched.
   Returns a NEW object (no mutation of the input). Bounded recursion (payloads
   are small JSON); no `any` leakage beyond the walk internals.

2. In `loadLandingPayload`, after the payload row is read and before return:
   when `theme.aestheticArchetype` is set AND `theme.aestheticArchetype in
   ARCHETYPES` AND it differs from `blueprintJson.archetype`, return
   `payload: applyLiveArchetype(payload, theme.aestheticArchetype)` and also
   surface the live id as the returned top-level `archetype`. When the org
   theme has no archetype (pre-1.54 workspaces), return the payload untouched
   — the frozen value remains the fallback, exactly as today.

3. `(public)/w/[slug]/page.tsx:227-241` — remove the now-redundant local
   `liveArchetype` override block; replace with a one-line comment pointing
   at the loader ("live-archetype normalization moved into loadLandingPayload
   so ALL consumers + ALL payload sections re-skin — see
   apply-live-archetype.ts"). The rest of the page is untouched (it keeps
   reading `payload.hero.archetype`, which now arrives normalized).

4. `(public)/s/[orgSlug]/[...slug]/page.tsx` — NO change needed for the
   archetype (it reads the same loader). Do not add health-template rendering
   here (separate gap, separate slice — see Out of scope).

## Why this shape

- Single seam: every render site — current and future (og-image, service
  subpages, embeds) — inherits the fix; no per-route drift (this bug IS the
  drift: v1.56.0 fixed one field on one route).
- The org theme is the canonical user-intent store (the picker, the dashboard
  card, and SeldonChat's update_design all write it via
  setArchetypeForOrg/setLandingTemplateForOrg). The payload pin becomes what
  it should be: a build-time fallback.

## Out of scope (explicitly)

- The /s route also never checks `theme.landingTemplate` (health templates
  can't render on subdomains) — REAL gap, but zero current workspaces hit it
  and it needs template-render plumbing in /s; filed as a follow-up task, not
  this fix.
- `theme.mode` propagation differences between routes.
- Converging the frozen pin on payload re-save (harmless either way).

## Tests

- `tests/unit/landing/apply-live-archetype.spec.ts` (new, pure):
  - replaces `archetype` at top level, in `hero`, in nested section objects,
    and inside arrays (`servicePages[].sections[]`-shaped fixtures);
  - leaves non-archetype-id strings and non-`archetype` keys untouched;
  - returns a new object; input not mutated;
  - no-ops when live id equals the frozen id everywhere.
- `loadLandingPayload` has no DI seam for db — its integration is covered by
  the pure-helper spec + tsc + the post-deploy live smoke (below). Existing
  r1-save / w-page specs (if any reference the removed block) updated.

## Verification

- verify-runner six checks (no migrations/deps/env).
- Post-deploy smoke (the REAL gate, on the exact broken workspace):
  `https://zen-flow-hydration.app.seldonframe.com/` AND
  `https://app.seldonframe.com/w/zen-flow-hydration` must render
  `data-archetype="cinematic-aspirational"` on EVERY data-archetype
  attribute (grep the HTML; zero `clinical-trust` attribute values), without
  Max touching the picker again.
