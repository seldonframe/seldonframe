# Health & Wellness Landing Templates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire 5 premium Claude Design health/wellness full-page landing templates into the SeldonFrame create-workspace pipeline so vertical-appropriate templates render at `/w/[slug]`, themed per-business via the archetype system.

**Architecture:** Each template is a self-contained, server-rendered React package with a shared entry signature `({ data, ctas, theme })`, consuming the business **soul** and theming 100% via injected `--sf-*` CSS variables. A registry maps template IDs → components; a thin dispatch in `app/(public)/w/[slug]/page.tsx` renders the chosen template (loading soul + theme directly) and falls back to the existing landing-r1 renderer when no new template is selected. Template selection is persisted on `organizations.theme.landingTemplate` and chosen at creation from a vertical→template map.

**Tech stack:** Next.js App Router (RSC), TypeScript, styled-jsx (global), Drizzle (Neon Postgres), Vitest.

**Source of T5 deliverable:** `C:/Users/maxim/CascadeProjects/hw-templates/templates/05-earthy-modern-clinical/react/` (verified against the contract: shared API, theme-only colors, graceful fallbacks, house rules, container queries).

---

## Key decisions (locked)

1. **Template data source = the r1 landing payload** (NOT `organizations.soul`). Finding during pilot: `organizations.soul` is the `OrgSoul` CRM-personality shape (pipeline, voice, entityLabels, `services`) — it lacks the phone/faqs/testimonials/photos/reviews the templates need. The clean, already-populated source is the **r1 landing payload** (`landing_pages.blueprintJson`, slug `r1`) — the extracted, cleaned hero/services/testimonials/faq/footer that `/w/[slug]` already loads via `loadLandingPayload(slug)`. So the new templates are **alternative renderers of the same r1 content**: map `R1LandingPayload → template Soul`. Consequence: a workspace must have an r1 landing to render a new template — true for every real-pipeline workspace; the 5 old health workspaces (built via `create_full_workspace`, no r1 row) get one in Phase 3, or the pilot proof targets a workspace that already has one (e.g. resultspt).
2. **Template home:** `packages/crm/src/components/landing-templates/<id>/` (mirrors `landing-r1/`). Shared contract files (`types.ts`) are **byte-identical** across all five.
3. **Selection persisted** at `organizations.theme.landingTemplate` (theme JSON is already extensible; no migration needed).
4. **Dispatch precedence** in `/w/[slug]`: if `theme.landingTemplate` is a registered template AND a soul exists → render new template; else → existing landing-r1 path (unchanged).
5. **Offerings normalization:** souls in the wild carry `offerings` as EITHER `string[]` (older `submit_soul`/`create_full_workspace`) OR `object[]` (Phase U extraction). The soul→template mapper MUST normalize both to the template's `{ name, description?, price?, ... }[]`.
6. **Theme key adapter:** archetype palette `{ primary, secondary, background, text, border }` + `fonts:{ headline, body }` → template `SfTheme` `{ primary, secondary, bg, text, border, fontHeadline, fontBody }`.

---

## File structure

| File | Responsibility |
|---|---|
| `components/landing-templates/_contract/types.ts` | Shared `Soul`, `CTAs`, `SfTheme`, `TemplateProps` (single source; templates import from here) |
| `components/landing-templates/earthy-modern-clinical/*` | T5 ported package (sections, css, theme, ui, interactive, icons, EarthyModernClinical.tsx) |
| `components/landing-templates/registry.ts` | `LANDING_TEMPLATES` map id→component, `isLandingTemplateId()` guard, `TEMPLATE_BY_VERTICAL` map |
| `lib/landing/template-adapters.ts` | `archetypeToSfTheme(theme)`, `soulToTemplateData(soul)` (with offerings normalization), `buildTemplateCtas(slug, orgId)` |
| `lib/landing/template-adapters.test.ts` | Unit tests for both adapters incl. string[]-offerings + missing-field cases |
| `lib/landing/public-workspace.ts` | `getPublicWorkspaceForTemplate(slug)` → `{ orgId, soul, theme } | null` (org-by-slug + soul + theme) |
| `app/(public)/w/[slug]/page.tsx` | Add template dispatch ahead of the landing-r1 render |
| `lib/workspace/aesthetic-archetypes.ts` | Add/extend `pickLandingTemplate({ vertical, archetype })` for creation-time selection |
| (create pipeline) `lib/.../run-create-from-url.ts` + paste | Persist `theme.landingTemplate` at the `landing_built` step |

---

## Phase 0 — T5 pilot (do now; proves the whole path end-to-end)

### Task 0.1: Shared contract + port T5 package

**Files:**
- Create: `packages/crm/src/components/landing-templates/_contract/types.ts`
- Create: `packages/crm/src/components/landing-templates/earthy-modern-clinical/{EarthyModernClinical.tsx,sections.tsx,interactive.tsx,ui.tsx,icons.tsx,css.ts,theme.ts,Styles.tsx,fixture.ts}`

- [ ] **Step 1:** Copy the 11 files from `hw-templates/.../05-earthy-modern-clinical/react/` into `earthy-modern-clinical/`. Move `types.ts` to `_contract/types.ts`; update each file's `./types` import to `../_contract/types`.
- [ ] **Step 2:** Rename the default export to a named export `EarthyModernClinical` (registry imports by name). Keep the `({ data, ctas, theme })` signature.
- [ ] **Step 3:** Confirm `"use client"` only on `interactive.tsx` + `ui.tsx`; `Styles.tsx` uses `<style jsx global>`.
- [ ] **Step 4:** `pnpm -C packages/crm typecheck` → PASS.
- [ ] **Step 5:** Commit `feat(landing-templates): port T5 Earthy Modern Clinical package`.

### Task 0.2: Registry + vertical map

**Files:**
- Create: `packages/crm/src/components/landing-templates/registry.ts`

- [ ] **Step 1:** Export `LANDING_TEMPLATES = { "earthy-modern-clinical": EarthyModernClinical } as const satisfies Record<string, ComponentType<TemplateProps>>`, `type LandingTemplateId`, and `isLandingTemplateId(v): v is LandingTemplateId`.
- [ ] **Step 2:** Export `TEMPLATE_BY_VERTICAL: Record<string, LandingTemplateId>` seeded with chiropractic/physiotherapy/sports-medicine/"" → `earthy-modern-clinical` (others added with T1–T4).
- [ ] **Step 3:** typecheck → PASS. Commit.

### Task 0.3: Adapters

**Files:**
- `packages/crm/src/lib/landing/template-adapters.ts` ✅ **DONE** — `archetypeToSfTheme(archetypeId)` (looks up `ARCHETYPES[id]`, maps palette+fonts → SfTheme) and `buildTemplateCtas(slug, orgId, phone?)` (workspace URLs + `tel:` href). Typechecks.
- Create: `packages/crm/src/lib/landing/r1-payload-to-template.ts` + `.test.ts` (the remaining mapper).

- [ ] **Step 1 (RED):** Write tests for `r1PayloadToTemplateData(payload): Soul`:
  - hero → `business_name`, `tagline`, `soul_description`, `review_rating`, `review_count`, hero photo (role "hero").
  - services items → `offerings: [{ name, description?, price?, duration_minutes? }]` (normalize r1 service shape; tolerate string-only).
  - testimonials/faq/footer → `testimonials`, `faqs`, `phone`/`email`/`address`/`service_area`, service photos by role.
- [ ] **Step 2:** Run tests → FAIL (module not implemented).
- [ ] **Step 3 (GREEN):** Implement `r1PayloadToTemplateData` against the `R1LandingPayload` sub-types (`lib/landing/r1-payload-generator.ts` / `_shared/types.ts`). Map photos to `{ url, alt, role }`; missing → omit (template renders themed placeholder).
- [ ] **Step 4:** Run tests → PASS. typecheck → PASS. Commit.

### Task 0.4: Template choice resolver (no separate soul loader)

The data + archetype + orgId already come from `loadLandingPayload(slug)`. We only additionally need the persisted template id.

**Files:**
- Modify: `packages/crm/src/lib/landing/r1-save.ts` — extend `loadLandingPayload` to also `select` `organizations.theme` (or add `getLandingTemplateId(orgId)`), returning `theme?.landingTemplate`.

- [ ] **Step 1:** Surface `landingTemplate` (string | undefined) alongside the existing `{ payload, archetype, orgId, seo }` return.
- [ ] **Step 2:** typecheck → PASS. Commit.

### Task 0.5: Dispatch in /w/[slug]

**Files:**
- Modify: `packages/crm/src/app/(public)/w/[slug]/page.tsx`

- [ ] **Step 1:** After `loadLandingPayload(slug)` returns `{ payload, archetype, orgId, landingTemplate }`, if `isLandingTemplateId(landingTemplate)`, render:
  ```tsx
  const Tpl = LANDING_TEMPLATES[landingTemplate];
  const data = r1PayloadToTemplateData(payload);
  return <Tpl data={data} ctas={buildTemplateCtas(slug, orgId, data.phone)} theme={archetypeToSfTheme(archetype)} />;
  ```
  `generateMetadata` already reads from `payload`/`seo`, so it keeps working unchanged.
- [ ] **Step 2:** Else fall through to the existing landing-r1 render (unchanged).
- [ ] **Step 3:** Render the chatbot embed script on the template path too (`getPublicChatbotEmbed(orgId)`).
- [ ] **Step 4:** typecheck → PASS. Commit.

### Task 0.6: Manual pilot proof

- [ ] **Step 1:** On a health workspace WITH a soul (e.g. Austin Family Chiropractic, org `8efdb7a1-…`), set `theme = jsonb_set(theme, '{landingTemplate}', '"earthy-modern-clinical"')` and `{aestheticArchetype}` if absent, via Neon SQL.
- [ ] **Step 2:** Deploy the branch preview; visit `/w/austin-family-chiropractic`. Confirm T5 renders with that workspace's real soul, themed, with graceful placeholders. (Manual — surface to user.)

---

## Phase 1 — Generalize to T1–T4 (when Claude Design delivers)

- [ ] Port each package under `landing-templates/<id>/` reusing `_contract/types.ts` (must be identical API).
- [ ] Add each to `LANDING_TEMPLATES` + extend `TEMPLATE_BY_VERTICAL` (massage→editorial-bodywork, derm/medspa→clinical-luxe, women's-wellness→warm-wellness, holistic/osteo→cinematic-sanctuary).
- [ ] Per-template: typecheck + preview render with its matching soul.

## Phase 2 — Creation-pipeline selection

- [ ] Add `pickLandingTemplate({ vertical, archetype })` in `aesthetic-archetypes.ts` (vertical-first via `TEMPLATE_BY_VERTICAL`, archetype fallback).
- [ ] In the create-from-url + create-from-paste flows, at the `landing_built` step, persist `theme.landingTemplate = pickLandingTemplate(...)` alongside the existing r1 landing write (so new workspaces auto-select).
- [ ] Verify a fresh `/clients/new` build for a chiro URL selects + renders T5.

## Phase 3 — Re-render the 5 Austin workspaces + cleanup

- [ ] For each of the 5 health workspaces: ensure soul present (done), set `theme.landingTemplate` via the vertical map, confirm `/w/<slug>` renders the right template.
- [ ] Decide subdomain vs `/w/` canonical (the old `*.app.seldonframe.com/l/home` template pages still exist) — point the workspace's public URL to `/w/<slug>`.
- [ ] Remove the stale `source:"template"` `home` landing rows if they conflict.

---

## Self-review

- **Spec coverage:** all 5 templates, creation-time selection, /w dispatch, re-render of the 5 workspaces — covered.
- **Type consistency:** `TemplateProps`/`Soul`/`SfTheme` defined once in `_contract/types.ts`; registry typed to `ComponentType<TemplateProps>`; adapters return those exact types.
- **Risk — offerings shape:** addressed by normalization in `soulToTemplateData` (Task 0.3) + a dedicated test.
- **Risk — workspace with no r1 row:** addressed by loading soul directly (Task 0.4), not the r1 payload.
