# Subdomain landing-template parity — design

**Date:** 2026-07-14
**Status:** approved (gap + fix shape verified in the dispatching session, 2026-07-15 recon)
**Branch:** `claude/cranky-driscoll-e2efa0` (worktree `nostalgic-mcnulty-bcc4e0`, off `origin/main` @ `ea4bffd9d`)

## Problem

`/s/[orgSlug]/[...slug]/page.tsx` — the renderer behind `<slug>.app.seldonframe.com`
(the proxy rewrites the subdomain root to `/s/<slug>/home`) — never checks
`theme.landingTemplate`. A workspace that picked a premium health template
(persisted at `organizations.theme.landingTemplate`, rendered by
`/w/[slug]/page.tsx` via `isLandingTemplateId` → `LANDING_TEMPLATES[...]`)
still renders the R1 sections on its subdomain. **Every health-template
workspace diverges between /w and its subdomain** — and the subdomain is the
URL the operator actually hands out.

## Ground truth (read, not guessed)

- `/w/[slug]/page.tsx:166` — template precedence: `r1?.landingTemplate ?? ctx.theme?.landingTemplate`.
  Both values are sourced from `organizations.theme.landingTemplate`
  (`loadLandingPayload` reads it off the org row at `r1-save.ts:143-146`), so
  inside a branch that already holds an r1 result, `r1.landingTemplate` alone
  carries the exact same precedence.
- `/w/[slug]/page.tsx:179-206` — the template branch:
  `withTemplateDefaults(r1 ? r1PayloadToTemplateData(r1.payload) : submittedSoulToTemplateData(ctx.soul), landingTemplate)`,
  `explicitArchetype = r1?.archetype ?? ctx.theme?.aestheticArchetype` →
  `archetypeToSfTheme` (else `undefined` = template's signature palette),
  CTAs via `buildTemplateCtas(slug, orgId, templateData.phone)`, plus the
  chatbot embed script.
- `/w` also renders a template for **soul-only** workspaces (no r1 row) via
  `getWorkspaceTemplateContext` (`public-workspace.ts`). `/s` currently sends
  those to the legacy `PageRenderer` fall-through.
- `loadLandingPayload` already returns `landingTemplate`, `theme`
  (normalized `OrgTheme`, includes `aestheticArchetype` post-#67), `archetype`,
  `orgId` — no new queries needed for the r1 case.
- Sibling branch `fix/live-archetype-at-source` is **not merged** to
  origin/main as of this spec; we mirror /w's *current* precedence exactly and
  centralize it so any later precedence fix lands in one place.

## Fix shape

**Extract /w's template branch into one shared function; both routes call it.**

### New: `packages/crm/src/lib/landing/render-landing-template.tsx`

```tsx
export function renderLandingTemplate(input: {
  slug: string;
  orgId: string;
  landingTemplate: string | undefined;
  /** r1 content source (preferred). null → soul fallback. */
  r1: { payload: R1LandingPayload; archetype: AestheticArchetypeId } | null;
  /** raw organizations.soul — read only when r1 is null */
  soul: unknown;
  /** live org-theme archetype (theme.aestheticArchetype) */
  themeArchetype: string | undefined;
}): ReactElement | null
```

Returns `null` unless `isLandingTemplateId(input.landingTemplate)`; otherwise
the `<Tpl data ctas theme>` element, byte-for-byte the logic /w has today
(withTemplateDefaults fill, `r1?.archetype ?? themeArchetype` explicit-archetype
rule, `in ARCHETYPES` guard, `buildTemplateCtas`). Pure given its inputs — no
db, no async — so it unit-tests without mocks. The chatbot embed stays
route-local (each route already loads it).

### `/w/[slug]/page.tsx` — behavior-preserving refactor

Replace lines ~179-206 with a call to `renderLandingTemplate` (pass
`r1 ? { payload, archetype } : null`, `ctx.soul`, `ctx.theme?.aestheticArchetype`);
keep the early return + chatbot embed wrapper. No rendering change.

### `/s/[orgSlug]/[...slug]/page.tsx` — the actual fix

In the home-page branch (`isHomePage(pageSlug)`):

1. **r1 workspaces:** after `loadLandingPayload` succeeds, call
   `renderLandingTemplate` with `r1Data`'s fields
   (`landingTemplate: r1Data.landingTemplate`, `r1: { payload, archetype }`,
   `soul: null`, `themeArchetype: r1Data.theme?.aestheticArchetype`). Non-null →
   return it + chatbot embed. Null → existing R1 sections, unchanged.
2. **Soul-only workspaces:** when `loadLandingPayload` returns null, call
   `getWorkspaceTemplateContext(orgSlug)`; if it resolves and
   `renderLandingTemplate` (with `ctx.theme?.landingTemplate`, `r1: null`,
   `ctx.soul`) returns an element, return it + chatbot embed. Otherwise fall
   through to the legacy PageRenderer path **unchanged** (old-landing
   workspaces have no `landingTemplate`, so `isLandingTemplateId` fails and
   nothing changes for them).
3. **Metadata parity for soul-only template workspaces:** in
   `generateMetadata`'s home branch, when there's no r1 payload, mirror /w's
   soul fallback (title/description from `submittedSoulToTemplateData`,
   `robots` per the unclaimed-anonymous-build rule, canonical `/w/${orgSlug}`
   — /s canonicals already point at /w). Existing r1-home metadata is
   untouched.

## Out of scope

- /w's archetype precedence itself (baked-r1-first) — `fix/live-archetype-at-source`
  owns archetype normalization; centralizing into the shared function means its
  fix (or any later one) lands on both routes automatically once both call it.
- Service sub-pages (`/s/<slug>/services/<x>`) — same R1 rendering on both
  routes today; templates are single-page.
- No new deps, no migrations, no flag (this is a bug fix restoring an
  intended invariant, not a new behavior).

## Tests (node:test + tsx, `tests/unit/landing/render-landing-template.spec.ts`)

Pure-function tests on the returned element (type + props — no DOM needed;
`.spec.tsx`/renderToString available if needed):

1. Unregistered / undefined `landingTemplate` → `null` (legacy workspaces safe).
2. Registered id + r1 payload → `element.type === LANDING_TEMPLATES[id]`,
   `props.data.business_name` from the payload, `props.ctas.bookUrl/intakeUrl`
   workspace-scoped, `props.ctas.callHref` tel-normalized.
3. `r1: null` + soul → data mapped via `submittedSoulToTemplateData`.
4. Explicit archetype (r1.archetype or themeArchetype) in `ARCHETYPES` →
   `props.theme` is the mapped SfTheme; r1.archetype wins over themeArchetype.
5. No archetype anywhere / unknown archetype string → `props.theme === undefined`
   (template renders its signature palette).
6. `withTemplateDefaults` applied — empty photo slots filled from the
   template's curated fixtures.

Route-level equivalence is guaranteed structurally (both routes call the one
function) — the post-deploy smoke (below) is the end-to-end check.

## Verification

- `/verify-build` gate (unit delta vs baseline at
  `scratchpad/unit-baseline.log`, tsc stash-delta, check-use-server,
  migration journal, regression grep).
- **Post-deploy smoke:** pick a health-template workspace; its
  `<slug>.app.seldonframe.com` root and `/w/<slug>` must render the same
  template (same `<h1>`/hero sentinel, template-specific DOM marker present on
  both, R1 `SiteShell` marker absent on both).
