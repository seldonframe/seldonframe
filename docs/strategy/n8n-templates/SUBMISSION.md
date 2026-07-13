# n8n Distribution Playbook

Goal: use n8n's own creator/template surfaces as a low-cost distribution
channel for SeldonFrame, the way Zernio and similar API-first products get
found through "workflow with X" searches rather than paid acquisition.

Two tracks, in priority order: (1) the creator/template gallery — cheap, fast,
do this first; (2) a verified community node — bigger investment, only worth
it once track 1 proves template→claim conversion.

## Track 1 — Creator program + template gallery submission

1. **Apply to the n8n Creator Program** at `creators.n8n.io`. This gets you a
   creator profile page on n8n.io and access to submit workflows to the
   public template gallery (`n8n.io/workflows`).
2. **Submit each of the 5 templates individually** through the Creator hub,
   not as one bundle — each gets its own gallery listing, its own SEO page,
   and can rank independently for its own long-tail query (e.g. "speed to
   lead sms n8n template", "n8n typeform booking automation").
3. For each submission: use the one-line value prop from `README.md` as the
   listing description, name SeldonFrame explicitly as the API being called,
   and link back to `app.seldonframe.com` (or the marketing site) in the
   author/workflow description field.
4. **Benefits of a gallery listing**: a dedicated SEO-indexed page per
   template on n8n.io, eligibility for n8n's own "featured" rotation and
   newsletter inclusion, and (per n8n's creator terms at time of writing) an
   affiliate/referral mechanism for the creator — confirm current terms on
   the creator program page before assuming payout specifics, those change.
5. **UTM every link** in every submitted template and listing description
   (e.g. `?utm_source=n8n_gallery&utm_medium=template&utm_campaign=<template-name>`)
   so we can see template→claim conversion per template before investing
   further in track 2.

## Track 2 — Verified community node (`n8n-nodes-seldonframe`)

A dedicated node gives in-app discovery inside n8n Cloud's node panel
("SeldonFrame" search-and-drop, no manual HTTP Request wiring). Bigger lift
than track 1; only build this once template installs show real conversion.

Requirements for n8n's "verified" community node program, as of this
writing:

- npm package **named `n8n-nodes-*`** (e.g. `n8n-nodes-seldonframe`).
- **MIT license.**
- **No runtime dependencies** beyond what n8n itself already provides
  (keeps the install lean and passes the verification scan).
- **One service per package** — this package should wrap SeldonFrame only,
  not bundle unrelated integrations. Matches how we'd want it positioned
  anyway (SF as one clean node, not a grab-bag).
- **Scaffold via the official `n8n-node` CLI** rather than hand-rolling the
  package structure, so it matches n8n's expected layout out of the box.
- **From 2026-05-01, publish via GitHub Actions with npm provenance**
  attached to the published package. SF's existing npm-provenance publishing
  pipeline (used for `@seldonframe/mcp`) already satisfies this requirement
  — reuse it rather than standing up a second publishing pipeline.

### Positioning check (CLAUDE.md §1b compliance)

Building this node does **not** violate the "no Zapier/Make, SF pushes
outward, never a dependent pulling through middleware" rule. SF remains the
source-of-truth endpoint in every case — the node is a thin client that calls
`app.seldonframe.com`, exactly like the JSON templates in this folder do
today. n8n is the user's chosen middleware/orchestrator; SF isn't adopting a
dependency on n8n, n8n users are adopting a dependency on SF. The BYO-OAuth-app
rule and the "SF never does Google CASA" rule are unaffected since this node
only talks to SF's own API, not third-party OAuth surfaces.

### Sequencing caveat

Do not start the node build until we've watched template→claim conversion
from track 1 for at least a few weeks post-submission. If the JSON templates
don't convert gallery views into SF signups, a maintained npm package with a
verification review cycle is the wrong next dollar to spend. Track 1 first,
track 2 conditional on its data.

## Ongoing maintenance note

Endpoints referenced in these templates (`/api/v1/sms`, `/api/v1/emails`,
`/api/v1/agents`, `/api/v1/public/agent/{slug}/turn`,
`/api/v1/public/bookings`) are the verified real SF API surface as of
2026-07-13. If any of these routes, their auth requirements, or their body
shapes change, the templates in this folder need a coordinated update and
re-submission — a stale gallery template that 400s on first use is worse for
trust than no template at all.
