---
id: landing-pages
scope: universal
frameworks: agency,coaching,consulting,service,realestate,ecommerce,saas
status: core
---
# BLOCK: Landing Pages

**Description**
Puck-based landing-page editor + public renderer + Claude-powered generator. Pages are JSON (Puck's `{content, root, zones}` shape), validated against a typed component registry before save, statically rendered via Next ISR at `/l/<orgSlug>/<pageSlug>`, and tracked via client-side visit beacons so ISR caching doesn't skip analytics.

**Behavior**
Composition-driven, not turn-driven (email/sms) and not state-machine-driven (payments). The block is a thin wrapper over Puck's editor + data model, with three additions:
1. **Validator** (`lib/puck/validator.ts`) — introspects `puckConfig` and rejects payloads that mis-use enums, miss required ids, reference unknown components, or drift from documented props. Runs on every save from every source.
2. **Claude generation path** (`lib/puck/generate-with-claude.ts`) — Soul-aware page drafting. Phase 7 Agent Synthesis will drive this; Phase 6 ships the endpoint.
3. **Visit beacon** (`components/landing/visit-beacon.tsx`) — fires `navigator.sendBeacon` on public-page load so cached pages still emit analytics.

**Integration Points**
- **CRM** — `landing.converted` writes a contact on submit via `FormContainer` → `/api/v1/forms/submit`.
- **Formbricks intake** — Puck's `FormContainer` + typed input components are the rendered surface for a form block living inside a page.
- **Brain v2** — `landing.visited` + `landing.converted` feed conversion-funnel learning.
- **Automations** — `landing.published` is a trigger (launch-day email blast, etc.). `landing.visited` with a scored threshold is a trigger for retargeting flows.
- **Email / SMS** — `FormContainer` scoring thresholds redirect qualified leads to booking; downstream automations send confirmation messages.
- **Payments** — `PaymentButton` Puck component embeds a checkout link per page; payment completion emits `payment.completed` attributed to the landing source.

---

## Purpose

The builder-facing face of the workspace for cold traffic. The SMB's ads, social posts, business-card QR codes all point here. Quality of the generated page is the deciding factor in whether a booked lead becomes a first-touch conversion. Claude-driven drafting + Soul-aware copy is the differentiator vs GoHighLevel's drag-and-drop-only editor — but the editor still exists for builders who want to hand-tune.

---

## Entities

- **LandingPage** (`landing_pages`): `title`, `slug`, `status` (draft | published), `pageType`, `source` (scratch | template | soul | api), `puckData` (the Puck payload), `sections` (legacy; kept for backward compat), `contentHtml`+`contentCss` (legacy rendered output for pre-Puck pages), `seo`, `settings`.

The Puck payload is the source of truth for new pages. Legacy `sections`/`contentHtml` stays populated for pages authored before Puck was enabled; the public renderer checks for `contentHtml` first, falls back to `sections`, then falls back to `puckData` via `PageRenderer`.

---

## Events

### Emits
- `landing.published` — `{pageId, slug, orgId}`. Fires on publish via `publishLandingPageFromApi` + the server-action equivalent. Also busts ISR via `revalidatePath` and dispatches a workspace webhook.
- `landing.unpublished` — `{pageId, orgId}`. Reverse of publish.
- `landing.updated` — `{pageId, orgId}`. Emitted from any `updateLandingPageFromApi` call; re-triggers cache bust if the page is currently published.
- `landing.visited` — `{pageId, visitorId}`. Emitted from the client beacon on each real browser view. Throttled per-session via `sessionStorage` + per-visitor via an `sf_vid` cookie (400-day Max-Age, SameSite=Lax).
- `landing.converted` — `{pageId, contactId}`. Emitted when a visitor submits a FormContainer on a page; writes the contact, links it to the source page in metadata.

### Listens
- None directly — landing pages are a publishing surface. Soul updates + theme changes are read on-demand, not reactively.

---

## Composition Contract

Machine-readable contract for Phase 7 agent synthesis.

produces: [landing.published, landing.unpublished, landing.updated, landing.visited, landing.converted]
consumes: [workspace.soul.business_type, workspace.soul.services, workspace.soul.tone, workspace.soul.mission, workspace.soul.offer, workspace.soul.entity_labels, workspace.soul.journey_stages, workspace.theme.primary_color, contact.id]
verbs: [page, landing, website, publish, generate page, copy, homepage, squeeze, hero, cta, funnel, optin]
compose_with: [formbricks-intake, crm, caldiy-booking, email, sms, payments, automation, brain-v2]

---

## Notes for agent synthesis

**UI-composition is Puck's job, not the contract.** `compose_with` is block-slug level — it says "landing pairs with payments" but not *how*. The how lives in `lib/puck/config.impl.tsx`: the `PaymentButton` component is what actually gets embedded. Agents composing a landing page read both:
1. This BLOCK.md for which blocks the page can pair with (event + data-flow level).
2. `puckConfig` for which Puck components exist and their typed fields (UI-composition level).

A `ui_components` field in the contract is queued for V1.1 — see the 6.a audit.

**Validator is load-bearing.** Any agent producing a Puck payload must route it through `validatePuckPayload` before calling `create_landing_page` / `update_landing_page`. The MCP tool bindings do this already. Custom agent code should too.

**Generation is Phase 7's job; this block exposes the endpoint.** `generate_landing_page` returns a validated payload without persisting. The Phase 7 Agent Synthesis loop calls this endpoint, optionally revises with a second prompt, then calls `create_landing_page` to save. Keeping generation out of this block preserves the thin-harness separation — the block primitives know nothing about agent loops.

**Component coverage:** 32 Puck components across layout / content / forms / business / interactive categories. More than v1 needs; do not add more without a concrete use case. Agents should prefer combining existing components over requesting new ones.

**Cache + beacon semantics:** Public pages cache for 3600s (1 hour) and bust on publish/update. The client beacon fires once per session per page per visitor; double-counting from React StrictMode or SPA re-mounts is suppressed via `sessionStorage`.

---

## Navigation

- `/editor/[pageId]` — Puck editor (dashboard, session-authed)
- `/landing` — dashboard list of pages
- `/l/[orgSlug]/[slug]` — public URL (ISR-cached, client-beaconed)
- `/api/v1/landing` — MCP surface (GET + POST)
- `/api/v1/landing/[id]` — GET + PATCH
- `/api/v1/landing/[id]/publish` — POST
- `/api/v1/landing/generate` — POST (Claude-driven draft)
- `/api/v1/landing/track-visit` — public POST (client beacon)
