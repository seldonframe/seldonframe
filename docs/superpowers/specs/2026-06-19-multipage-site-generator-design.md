# Multi-Page Site Generator — Design

**Date:** 2026-06-19
**Status:** Approved design, pending spec review → implementation plan
**Owner:** Max / Seldon Studio

## Goal

Upgrade the `/clients/new` workspace-creation pipeline so the generated public website is a **multi-page, lead-capture-first site** modeled on `greenwood-remodeling-group.com`: a real page per service (15–20), an intake form **in the hero**, a Google map, the SMS chatbot, hours + social in the footer, an operator-chosen light/dark theme, and **no horizontal scroll** — all produced automatically from a URL or pasted business description.

## Non-Goals (this project)

- Rewriting the existing R1 single-page framework. We **extend** it.
- Per-service bespoke/hand-designed pages. Every service page uses **one template**, auto-populated.
- Migrating existing live workspaces automatically (they can be regenerated on demand).
- The marketing-site demo additions — that is **Project B** (separate spec): new live-demo options (black theme, intake-in-hero) on seldonstudio.com + seldonframe.com.

## Approach

**Extend the existing R1 framework into multi-page — do not build a parallel "greenwood template" system.** The current pipeline is solid and reused wholesale: the 13-step `create-full.ts` orchestrator, the extraction pipeline, the 7 aesthetic archetypes + `archetypeStyle()` CSS-var theming, the `landing-r1` hero/section/footer components, and the auto-wired chatbot embed. We add:

1. A **page tree** in the existing R1 landing payload (one JSON blob per workspace stays the source of truth).
2. **Next.js routes** under `/w/[slug]/...` that render each page from that payload through one shared shell.
3. New **page templates** (per-service, gallery, service-areas, contact, blog) + a couple of new section components (intake-in-hero, map).
4. A **dark archetype** + an operator **light/dark toggle** at creation.
5. An extended **generator** that fills the whole tree.

Rejected alternative: a standalone multi-page generator/renderer parallel to R1 — duplicates theme/extraction/components and leaves two systems to maintain. (YAGNI.)

## Data Model

The R1 landing payload (`landing_pages.blueprint_json.payload`, slug `r1`) grows from a single page to a small page tree. Today's top-level sections (hero, services, testimonials, faq, leadForm, footer) become the **home** page; new collections are added:

```
R1LandingPayload {
  theme: { archetype, mode: "light" | "dark" }     // mode = NEW (operator toggle)
  home: { hero, servicesGrid, testimonials, faq, map, footer }   // existing sections + map; hero gains leadFormInHero
  services: ServicePage[]        // 15–20, one per service
  gallery: GalleryItem[]
  serviceAreas: ServiceArea[]
  blog: BlogPost[]
  contact: { intro, mapAddress, hours, phone }
  nav: { items }                 // shared navbar config (Services dropdown, etc.)
}

ServicePage {
  slug, name, heroPhoto?, summary,
  body[],            // description + process/benefits blocks
  gallery[],         // mini-gallery (subset / service-tagged)
  testimonials[],    // service-tagged or general
  ctaLabel
}
GalleryItem { src, alt, caption?, serviceSlug? }
ServiceArea { slug, name, blurb? }
BlogPost { slug, title, date, excerpt, body[] }
```

Shared data (hours, address, social, phone, business name, photos, Google reviews) continues to come from extraction → Soul (`organizations.soul`) → payload, exactly as today. Reviews are **only** used when present in the source — never fabricated.

## Routes & Shared Shell

A workspace's public site becomes a small route tree, all reading the one payload via the existing `loadLandingPayload()`:

| Route | Page |
| --- | --- |
| `/w/[slug]` | Home |
| `/w/[slug]/services/[service]` | Service detail (template) |
| `/w/[slug]/gallery` | Gallery |
| `/w/[slug]/service-areas` | Service areas (index; per-area pages optional, future) |
| `/w/[slug]/contact` | Contact (form + map + hours) |
| `/w/[slug]/blog` + `/w/[slug]/blog/[post]` | Blog index + post |

Subdomain routing (`{orgSlug}.app.seldonframe.com/...`) maps onto the same tree via the existing rewrite layer (extend it from one path to the tree).

**Shared shell:** one `Navbar` (logo, links, **Services dropdown**, phone, primary CTA) + one `Footer` (hours, social, address, service-area links) rendered by a layout wrapping every page, themed by `archetypeStyle()` + the light/dark mode. The chatbot embed script mounts once at the shell level (already auto-wired).

## Per-Service Page Template

One template, populated per `ServicePage`: **hero** (service name + photo + the intake form) → **description** → **process / benefits** → **mini-gallery** → **testimonials** → **CTA** → **map**. Reuses existing section components where possible (testimonials, footer); new: the intake-in-hero block and the map block.

## Home Upgrades

- **Intake form in the hero:** add `leadFormInHero` to the home hero. Desktop: form in the hero's right column (sticky on scroll); mobile: hero image then the form directly below it. Reuses the existing `LeadFormSection` (Name · Phone · short message · TCPA/SMS consent) and `submitLeadFormAction` (lead contact + speed-to-lead SMS). Aligns with the prior `2026-06-14-hero-lead-form-speed-to-lead` work.
- **Map section:** new `sections/map.tsx` renders a Google Maps embed `<iframe>` from `address` (lazy-loaded). Appears on home, contact, and each service page.
- **Services grid links out** to the per-service routes (today it's display-only).

## Theme: Light/Dark

- Add a greenwood-style **dark archetype** (near-black bg, high-contrast text, a strong accent like greenwood's green) to `aesthetic-archetypes.ts` + `components/landing-r1/archetypes.ts`, emitted via `archetypeStyle()` exactly like the other 7.
- Add `mode: "light" | "dark"` to the payload `theme`, chosen by an operator **toggle in `/clients/new`**, persisted on the workspace, and honored by every page (the shell flips the CSS-var palette). Default mode follows the classified archetype (dark archetype → dark, light archetypes → light) but the operator can override.

## No Horizontal Scroll

The existing framework is container-disciplined (max-width sections). We harden it: a global `overflow-x: clip` on the public-site root layout + an audit of new components (map iframe, navbar dropdown, mini-gallery) to confirm none exceed the viewport on mobile.

## Generation

Extend `r1-payload-generator.ts` (+ its prompt) so the AI fills the whole tree from the extracted facts + business description:

- **Service list (15–20):** start from extracted services; the model expands to a comprehensive, vertical-appropriate set (e.g. remodeling → kitchen, bath, roofing, siding, decks, additions, …) with per-service copy.
- **Gallery / service areas / blog:** generated from the business context; gallery uses extracted/stock photos, blog seeds a few starter posts.
- **Guardrails:** real hours/address/phone/reviews used verbatim where extracted; never fabricate reviews; keep copy on-archetype (voice/tone per archetype).

Generation may run as a few scoped LLM calls (home + services in one, the lighter pages in another) to keep each prompt focused and reliable.

## Phasing (each phase ships working software)

- **P1 — Multi-page foundation:** payload page-tree types; `/w/[slug]/...` routes; shared Navbar/Footer shell + layout; the per-service template; services-grid → service-page links. Hand-seed a payload to render.
- **P2 — Home + components:** intake-in-hero (desktop right-column / mobile-below), `map.tsx`, the dark archetype, the light/dark toggle in `/clients/new`, the global no-scroll guard.
- **P3 — Extra pages:** Gallery, Service Areas, Contact, Blog (index + post) templates.
- **P4 — Generation + wiring:** extend `r1-payload-generator` to produce the full tree; wire into `create-full.ts` / `/clients/new`; end-to-end: URL → live multi-page site.
- **Project B (separate spec):** marketing-site demo options.

## Testing

- **Unit (node:test + tsx):** payload page-tree types/validators; the generator's structural output (service count, required fields, no-fabricated-reviews invariant) via the existing DI/test conventions; pure helpers (service slugging, theme-mode resolution, map-embed URL builder).
- **Build gate:** `bash scripts/check-use-server.sh src && npx tsc --noEmit && npx next build` (server/client boundaries matter — new routes are server components, the lead form + map are client).
- **Manual smoke (per phase):** seed/generate a workspace, walk the route tree on desktop + mobile, confirm: no horizontal scroll, intake form posts a lead + fires speed-to-lead SMS, chatbot bubble loads, map renders, light/dark honored.

## Open Questions / Risks

- **Generation cost/latency** for the full tree (15–20 service pages + gallery + blog) — mitigated by scoped multi-call generation + a turn/size budget; acceptable for a one-time build.
- **Photo supply** for 15–20 services + a gallery — reuse the existing extraction/stock-photo path; degrade gracefully (text-forward template) when photos are thin.
- **SEO/sitemap** for the new pages — generate a `sitemap.xml` per workspace (P3/P4, low effort).
