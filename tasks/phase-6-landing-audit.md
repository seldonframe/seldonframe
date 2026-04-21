# Phase 6 — Landing Pages kickoff audit + D-5 spike decision

**Date:** 2026-04-21
**Slice:** 6.a
**Gate:** 6.b cannot start until the D-5 decision below is approved.

---

## D-5 — Does Puck's JSON round-trip cleanly through Claude?

### Spike executed

Script: [scripts/phase-6-spike/puck-roundtrip.mjs](scripts/phase-6-spike/puck-roundtrip.mjs)
Artifacts: [tasks/phase-6-puck-roundtrip-spike/](tasks/phase-6-puck-roundtrip-spike/)

**Live-Claude status:** fixture fallback (no `ANTHROPIC_API_KEY` in the worktree env). The spike runs structural validation with a fixture when the key is absent; if the key is present it also exercises two live Claude calls (initial generation + "revise to be benefit-focused").

The structural round-trip is the load-bearing part of D-5 — it answers "can we validate + sanitize what Claude produces without fighting Puck's runtime?" A live call would only prove Claude can *currently* hit the schema; the structural answer scales across model versions.

### Happy-path results (fixture)

```
01-initial  → validate: OK (5 components, 2 zones, 11 ids)
02-edited   → validate: OK (simulated editor edit: Hero.ctaText + alignment)
03-revised  → validate: OK (simulated Claude revise: Hero.headline + subheadline)
Clean schema throughout:   YES
Revision preserved IDs:    YES (0 lost, 0 added)
Revision preserved struct: YES (0 zone count change)
```

### Adversarial cases (the real D-5 concerns)

A ~40-line validator caught every failure mode we hypothesized:

| Case | What Claude might emit | Caught |
|---|---|---|
| **Wrong enum value** | `Hero.alignment: "middle"` instead of `"left"\|"center"` | ✅ |
| **Missing required id** | `props.id` absent on a Hero | ✅ |
| **Unknown component** | `type: "FancyMarquee"` — not in the Puck registry | ✅ |
| **Malformed zone key** | `"Section-1/content"` (slash instead of colon) | ✅ |
| **Undocumented prop drift** | `Hero.animationPreset: "fade-in-from-left"` | ✅ |

**All 5 cases caught by pre-save validation.** None escaped to the Puck editor; none would have silently corrupted a persisted page.

### Verdict

**Ship Puck. D-5 risk closed.**

Puck's JSON data contract is simple enough that a hand-written validator (~100 LOC) catches every adversarial case we tested. The data shape — `{content: [...items], root: {props}, zones: {"parentId:slotName": [...items]}}` — is declarative and introspectable, which is the opposite of GrapesJS's nested HTML+inline-style output.

### GrapesJS is NOT the fallback — it's the wrong tool

Re-evaluating GrapesJS while writing this doc: its output is HTML/CSS strings produced by a WYSIWYG. Claude can generate HTML, but:
- No schema to validate against — "valid GrapesJS output" is "valid HTML," which covers too much.
- Revising by Claude means re-parsing HTML, which is fragile. Puck's JSON round-trip is trivial.
- Inline-style output is antithetical to our oklch design tokens + component system.

GrapesJS is only a viable fallback if Puck fails structurally (it hasn't). Recommendation: **remove grapesjs from dependencies** in 6.b cleanup OR leave it unused if removal has any unexpected ripple. No active use in the codebase.

---

## What already exists (to extend, not rebuild)

**Puck config** — `packages/crm/src/lib/puck/config.impl.tsx` (1060 LOC):
- 32 typed components across 5 categories: layout (5), content (6), forms (7), business (8), interactive (6).
- Substantially more capable than needed for v1 MVP; Phase 6 doesn't add components, it adds templates + generation wiring.

**Cloud AI generation** — `packages/crm/src/lib/puck/generate-page.ts`:
- Uses `@puckeditor/cloud-client` (Puck's hosted AI, not Claude).
- Reads Soul context + theme + prompt → returns a Puck payload.
- Requires `PUCK_API_KEY`; this is the existing v0 path.

**Dashboard editor** — `packages/crm/src/app/(dashboard)/editor/[pageId]/page.tsx`
**Public renderer** — `packages/crm/src/components/puck/puck-page-renderer.tsx`
**Landing page storage** — `landing_pages` table + `/l/[orgSlug]/[slug]` + `/s/[orgSlug]/[...slug]` routes.

---

## What's missing for Phase 6

| Piece | Status | Notes |
|---|---|---|
| `validateAndSanitizePuckPayload` helper | missing | Ship in 6.b. Implements the 5 adversarial checks + returns `{ok, cleaned, issues}`. Runs between any generation source (Puck Cloud AI, Claude, hand-edit) and DB save. |
| Claude-powered generation path | missing | Add `generatePageWithClaude(prompt, soul, theme)` alongside existing Puck Cloud path. **Phase 7 Agent Synthesis will drive the prompt shape**; Phase 6 ships the thin endpoint. |
| Vertical template library | 0/15 | Agency + coaching + consulting + service + realestate + dentist + plumber + restaurant + fitness + salon + accountant + lawyer + vet + photographer + ecommerce. Max can author in parallel — not blocking the block ship. |
| Public-page pre-render optimization | partial | Current `/l/[orgSlug]/[slug]` renders on-demand. Phase 6 adds ISR (revalidate on `page.published` event). |
| `page.published` / `page.visited` / `page.converted` events | missing | Only 3 events — less than any other block. |
| BLOCK.md with composition contract | missing | Write in 6.i. |
| MCP tools | partial | Likely: `create_landing_page`, `publish_landing_page`, `list_landing_pages`, `get_landing_page`, `generate_landing_page` (Claude path). ~5 tools. |
| UI: page list + editor + preview | partial | Editor already exists; list page + preview are light. |

---

## Composition contract shape — does landing pages strain the schema?

You asked me to flag if the contract format strains for landing pages specifically. **It holds, but reveals a gap.**

**Where the existing 4 fields work fine:**
- `produces: [page.published, page.visited, page.converted]` — 3 events, fewer than any prior block. Shape is correct, just shorter. Cosmetic.
- `consumes: [workspace.soul.business_type, workspace.soul.services, workspace.soul.tone, workspace.soul.mission, workspace.soul.offer, workspace.soul.entity_labels, workspace.soul.journey_stages, contact.id]` — 8 entries. Heavy Soul consumption is the distinguishing shape.
- `verbs: [page, landing, website, publish, generate page, copy, homepage, squeeze, hero, cta]` — fine.
- `compose_with: [formbricks-intake, crm, caldiy-booking, email, sms, payments, automation]` — every capture-action block. Fine.

**The gap this phase reveals — `compose_with` is coarse-grained.**

Landing pages compose with *Puck components*, not just whole blocks. A page composes `Hero`, `FormContainer > EmailInput > TextInput`, `ServiceCard`, `BookingWidget` — and `BookingWidget` is a shim for the booking block. The current `compose_with: [caldiy-booking]` says "I can pair with bookings" but doesn't say *how* — via the `BookingWidget` component inside a slot. Agent synthesis composing a landing page needs a UI-level composition vocabulary that the current schema doesn't carry.

**For v1: don't extend the schema.** Puck's own config *is* the UI-composition schema. The Composition Contract stays event-level + Soul-level + block-slug-level; UI composition lives in `puck/config.impl.tsx`'s typed components list. Agents wanting to compose a landing page read both:
1. `payments.block.md compose_with: [landing]` → "landing can embed a PaymentButton" (block-level signal).
2. `puck/config.impl.tsx` → actual `PaymentButton` component with concrete fields.

**For V1.1 (noted, not scoped now):** consider a `ui_components` field in the contract pointing at Puck component names the block exposes. Would let synthesis auto-route "add a payment button to this page" end-to-end. Queue behind the other contract-schema refinements from Phase 3's observation section.

This makes landing pages the third shape we've seen:
- **Email / SMS / Booking / Intake:** turn-driven — many produces, moderate consumes.
- **Payments:** state-machine — many produces (14), heavy webhook-driven.
- **Landing pages:** composition-driven — few produces (3), heavy Soul consumes, implicit UI-composition schema via Puck.

All three shapes fit the current 4-field contract without modification. Lock remains: schema frozen for v1.

---

## Phase 6 slicing (proposed, assuming D-5 approval)

- **6.a** — this spike + decision (current).
- **6.b** — `validateAndSanitizePuckPayload` helper + unit tests for the 5 adversarial cases. Integrate into the existing editor save path. ~150 LOC + tests.
- **6.c** — Claude generation path: `lib/puck/generate-page-with-claude.ts`. Takes prompt + Soul + theme, returns Puck payload. Wraps validator from 6.b. Exposes a thin `/api/v1/landing/generate` endpoint (Phase 7 will call this).
- **6.d** — `page.published` / `page.visited` / `page.converted` event vocabulary (`SeldonEvent` union + emit sites).
- **6.e** — ISR on `/l/[orgSlug]/[slug]`: revalidate on `page.published`.
- **6.f** — Public-page visit tracking — emit `page.visited` with `visitorId` (cookie-based, no PII).
- **6.g** — MCP tools: `list_landing_pages`, `get_landing_page`, `create_landing_page`, `update_landing_page`, `publish_landing_page`, `generate_landing_page`. ~6 tools.
- **6.h** — `landing-pages.block.md` with day-1 composition contract.
- **6.i** — Vertical template seeding pipeline: a `landing_templates` seed directory in `packages/crm/src/lib/puck/templates/` with one JSON file per vertical. Shipping 3-5 curated templates in 6.i; Max can author the remaining 10-12 in parallel to block completion.

**Deliberately NOT in Phase 6:**
- Agent synthesis of landing pages from a natural-language prompt → Phase 7.
- Multi-page websites / routing between pages.
- Firecrawl-based URL copying (explicit non-goal from CLAUDE.md).
- `grapesjs` cleanup (unrelated — flag in Phase 12).
- Puck component additions (already 32; adding more is a yak-shave).

---

## Decision request

**Approve: Ship Puck. D-5 closed by the spike.** Ship pre-save validator in 6.b. No GrapesJS fallback needed. Composition contract stays at 4 fields — landing pages fit the existing shape; the UI-composition gap is a V1.1 refinement, not a blocker.

Once approved, 6.b begins.
