# GHL-Intercept SEO/GEO Engine — Design

**Date:** 2026-07-08 · **Branch:** `feature/ghl-seo-engine` · **Status:** approved-by-directive
(Max's request enumerated the deliverables explicitly; session is autonomous, so the
brainstorm gate is satisfied by the request itself + this written design.)

## Goal

Intercept GoHighLevel-adjacent and "best tool for X" search demand with three additive,
registry-driven page families, extending the shipped `/alternatives` + `/compare` + `/tools`
system (`packages/crm/src/lib/seo/alternative-pages*.ts`). Everything static, no DB, no flags.
Research finding: GHL's own free-tool surface is 3 agency-facing calculators — the local-SMB
tool space (missed-call, reviews, A2P) is an open gap; their vs-pages are conversion-heavy but
content-light (tables sometimes images, no honest tradeoffs) — honest, crawlable, schema-marked
pages out-trust them for LLM citation.

## Deliverable 1 — "HighLevel vs X" pages (11)

Mechanism already exists: `VS_PAIRS` → `/compare/<a>-vs-<b>` (4-column table ending in the
SeldonFrame both-worlds answer) + `.md` twins. `gohighlevel-vs-vendasta` already shipped.

Add **10 new competitors** to `COMPETITORS` + `EXTRAS` (slugs fixed):
`activecampaign, hubspot, clickfunnels, keap, linktree, kartra, sharpspring, klaviyo, zoho, salesforce`

Add **10 new VS_PAIRS** (`gohighlevel` vs each). Each new competitor also gets the standard
`/alternative-to-<slug>` page folder + `.md` twin folder (thin copies of the gohighlevel
pattern). Hub, sitemap, llms.txt pick everything up automatically from the registries.

## Deliverable 2 — `/best/<category>-for-<audience>` listicle engine (~30 pages)

New files (all additive):
- `lib/seo/best-pages.ts` — registry: `BestCategory` (slug, noun forms, contenders, freeAngle,
  base FAQ), `BestAudience` (slug, label, group: `trades|beauty|medical|construction|general`,
  painHook, exampleService — mirrors `verticals.ts` style), `Contender` (name, price, oneLiner,
  bestFor, strengths[], watchOut, optional per-group fitNote), curated `BEST_PAGES` combos +
  `bestSlug()`/`getBestPage()` lookups.
- `components/seo/best-page.tsx` — listicle template: breadcrumb, H1 "The N Best <Category> for
  <Audience> (2026)", pain-hook intro, SeldonFrame #1 card (honest: what's included, $29 flat,
  free-build-first), ranked contender cards with watchOuts, comparison table, "free tier"
  section on small-business pages, FAQ, CTA row, cross-links (related /best pages + relevant
  /alternative-to pages). JSON-LD: `ItemList` + `FAQPage`.
- `app/(public)/best/[slug]/page.tsx` (generateStaticParams) + `app/(public)/best/page.tsx` hub.
- `.md` twins via the shipped dotted-folder pattern (`app/best/<slug>.md/route.ts`), rendered by
  a new `renderBestMarkdown()`.

Categories: `crm`, `website-builder`, `booking-system`, `booking-app`, `ai-receptionist`,
`intake-form-builder`. Audiences: `small-business` + trades (plumbers, hvac, electricians,
roofers, landscapers, cleaning, construction) + beauty (salons, med-spas) + dentists, law-firms.

Must-ship combos (Max's YouTube targets get exact-match pages):
`crm-for-small-business`, `website-builder-for-small-business`,
`website-builder-for-construction-companies`, `booking-system-for-small-business`,
`booking-app-for-small-business`, `booking-system-for-beauty-businesses`,
`ai-agents-for-small-business` (alias category label for ai-receptionist audience page),
`crm-for-plumbers`, `booking-system-for-med-spas`, `website-builder-for-hvac`, plus the rest of
the curated matrix (~30 total). "…free" keywords are folded into the small-business pages as an
H2 section (SF's build-free-before-signup is the honest answer), not thin twin pages.

Contenders per category (facts hedged, from public pricing July 2026):
- CRM: SeldonFrame, GoHighLevel, HubSpot, Zoho, Keap, Pipedrive, Jobber (trades fitNote)
- Website builder: SeldonFrame, Wix, Squarespace, Durable, WordPress, GoDaddy
- Booking system/app: SeldonFrame, Calendly, Acuity, Square Appointments, Vagaro (beauty),
  Housecall Pro (trades), Cal.com
- AI receptionist/agents: SeldonFrame, GHL AI Employee, Podium AI, Goodcall, Smith.ai,
  My AI Front Desk (reuse registry facts where they exist)
- Intake forms: SeldonFrame (Formbricks native), Typeform, Jotform, Google Forms, Gravity Forms

## Deliverable 3 — free tools (4 new, `/tools` hub grows to 5)

All client islands (`components/seo/*.tsx` + `app/(public)/tools/<slug>/page.tsx`), no API keys,
no server cost, following `missed-call-calculator` conventions:
1. `/tools/google-review-link-generator` — paste Place ID or Maps link → review link + copy +
   printable QR (qrserver.com image) + "find your Place ID" helper. (Podium's proven motion.)
2. `/tools/ai-receptionist-cost-calculator` — human receptionist vs answering service vs
   per-minute AI vs flat; sliders; the category-shopper's tool.
3. `/tools/a2p-10dlc-checker` — quiz → SMS compliance readiness score + fix list. Near-zero
   competition; SF owns deep A2P knowledge.
4. `/tools/review-response-generator` — template-based (tone × rating × scenario), instant,
   honest "no AI needed" framing.

## Integration (done by the coordinator, not the fan-out agents)

`sitemap.ts` (best hub + best pages + new tools), `llms.txt` (comparisons section additions are
automatic via registries; add Best-of + Tools sections), `tools/page.tsx` TOOLS array,
`alternatives` hub copy tweak (categories now include CRM/marketing platforms).

## Verification

- Registry integrity spec `lib/seo/best-pages.spec.ts` (unique slugs, combos resolve, every
  contender group referenced exists) + run existing `seo/*.spec.ts`.
- Local `tsc` via the junction-node_modules method (judge by delta vs baseline).
- Reviewer subagent pass over the diff; fix Critical/Important.
- NOT claimed: staging/live verification (per lessons L-06 — this is code-correct, static pages).

## Facts pack (for the registry author — hedge per never-lies; researched 2026-07-08)

**GoHighLevel baseline:** Starter $97/mo (3 sub-accounts) · Unlimited $297/mo · Agency Pro
$497/mo (SaaS mode; official name is "Agency Pro") · AI Employee add-on $50–$97/mo per
sub-account · white-label mobile app $497/mo, HIPAA $297/mo · usage-billed voice/SMS/email.

**ActiveCampaign** — automation-first email + light CRM. Per-contact: ~$15–$145/mo @1k contacts
(annual), configurator-gated; climbs steeply with list size. Strengths: automation depth,
deliverability, 900+ integrations. Weak vs GHL: per-contact pricing pain, no white-label, no
funnels/booking/phone/unified inbox. 2025-26: "Active Intelligence" AI suite.

**HubSpot** — premium all-in-one CRM. Free CRM; Marketing Starter $15/seat/mo (annual); Pro
$800/mo + $3,000 mandatory onboarding; Enterprise $3,600/mo. AI metered via credits. Strengths:
CRM depth/reporting/polish, scales to enterprise. Weak: ~40x Starter→Pro cliff, per-contact
charges, no white-label, SMS/voice need add-ons.

**ClickFunnels** — funnel builder for offer-sellers. Launch $97 (10k contacts) / Scale $197 /
Optimize $297; contact caps every tier. Strengths: converting templates, fast solo launch,
Brunson ecosystem + courses/community. Weak: no white-label/agency model, weak CRM, no native
SMS/voice, contact caps.

**Keap** (Thryv-owned since Oct 2024) — veteran SMB CRM+automation. From $299/mo ($249 annual,
2 users, 1,500 contacts) + $39/user + paid implementation. Strengths: mature automations,
invoicing/payments, onboarding culture. Weak: 3x GHL entry price, no white-label, dated UI +
acquisition uncertainty (features folding into Thryv over time).

**Linktree** — link-in-bio, not a platform. Free / $8 / $15 / $35 Premium (0% commission only on
Premium; 9–12% sales commission below). Strengths: 60-second setup, free tier, creator
mind-share. Weak: one page — no CRM/booking/automation; commission on sales; rented touchpoint.

**Kartra** — creator/coach all-in-one. Essentials $59 (500 contacts!) / Starter $119 / Growth
$229 / Pro $549; contact caps every tier. Strengths: courses/memberships/video/affiliates,
helpdesk. Weak: contact caps, no white-label/sub-accounts, no phone/local-SMB tools.

**SharpSpring / Constant Contact Lead Gen & CRM** — agency marketing automation in maintenance
mode post-acquisition. Pricing quote-gated (~$449/mo per 1k contacts commonly cited — print as
"quote-gated, commonly cited ~$449/mo"). Strengths: unlimited users flat, VisitorID tracking,
agency heritage. Weak: brand being retired, little innovation, no local-SMB stack. Frame the
page as a migration source.

**Klaviyo** — ecommerce email/SMS + B2C CRM. Per-profile: free 250; ~$30–45/mo @1k, ~$130 @10k;
SMS usage on top. Strengths: ecomm data model, Shopify depth, deliverability. Weak: per-profile
costs (including suppressed profiles unless pruned), no agencies/white-label, no
funnels/sites/booking.

**Zoho** — value CRM + 45-app suite. CRM Standard $20/user/mo ($14 annual) → Enterprise
$40/user; Zoho One ~$37–45/user (print "~"). Strengths: extreme value/breadth, deep CRM
customization, Zia AI. Weak: per-user + edition gating, assembly required, no white-label,
weak local-SMB front-office tools.

**Salesforce** — enterprise standard down-marketing via Starter $25/user/mo, Pro Suite
$100/user/mo; Agentforce editions to $550/user. Strengths: brand/compliance, limitless
customization path, AppExchange + Agentforce. Weak: per-user escalation + add-on sprawl, thin
SMB marketing/funnel/SMS, no white-label, admin overhead.

Sources: vendor pricing pages fetched 2026-07-08 (GHL, HubSpot, ClickFunnels, Keap, Kartra,
Vendasta, Klaviyo-free verified live; ActiveCampaign/Linktree/Klaviyo-paid/Zoho/Salesforce from
current roundups citing vendor pages — hedge those with "listed at ~"; SharpSpring quote-gated).
