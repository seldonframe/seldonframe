# PR body — Launch-prep: marketing website + sibling pages

**This file is the PR body for the marketing-website merge.** Title:

> `Launch-prep: marketing website + sibling pages`

---

## What ships

Launch-prep work to get the marketing surface ready for launch.
Single PR, two commits.

### Commit 1 — Landing page integration + sibling pages (`5d9a721f`)

The Gemini-authored landing page integrated into the Next.js app at
`/`, plus the sibling pages needed so all nav/footer/CTA links resolve.

**Landing page (app/(public)/page.tsx + landing-client.tsx):**
- Replaces the prior `LandingHero/LandingNav` composition with the
  new Gemini design — hero, personas, features, how-it-works,
  see-it-built (NEW), pricing, infrastructure, final CTA, footer,
  Discord float
- Preserves the existing auth redirect (signed-in users → `/dashboard`)
- New metadata (title, description, OG, Twitter card pointing at
  brand assets shipped in SLICE 9 PR 2)

**Gemini fixes applied (a-g per Max's prompt):**
- (a) Footer hrefs → real paths
- (b) HowItWorks animation: `x: -30` → `y: 20` for vertical-reveal parity
- (c) Featured pricing card: removed `scale: 1.02` (teal border suffices)
- (d) Nav Pricing link: `/pricing` → `#pricing` anchor
- (e) Cost-visibility feature copy reframed (no concrete dollar
  claims — per SLICE 11 audit §2.10, the marketing $0.05/$0.32
  numbers don't appear in running code)
- (f) BYO note below pricing reframed (same)
- (g) NEW "See it built" section between HowItWorks and Pricing → `/demo`

**Marketing-group sibling pages (app/(marketing)/):**
- `layout.tsx` — minimal layout matching dark-theme chrome
- `marketing-shell.tsx` — shared nav + footer for marketing pages
- `docs/quickstart/page.tsx` — three-command install flow + prerequisites
  + next-steps (the "Start for $0" CTA destination)
- `blog/page.tsx` — "Coming soon" placeholder
- `demo/page.tsx` — "Demo video coming soon" placeholder + walkthrough link

### Commit 2 — URL fixes (`4ad415be`)

- **GitHub URL update:** repo renamed `seldonframe/crm` →
  `seldonframe/seldonframe`. All 6 references updated across
  landing-client.tsx (nav + footer), marketing-shell.tsx (nav +
  footer), demo/page.tsx, docs/quickstart/page.tsx.
- **Discord invite update:** placeholder `discord.gg/seldonframe`
  → permanent invite `discord.gg/sbVUu976NW`. All 5 references
  updated across landing-client.tsx (footer + float button),
  marketing-shell.tsx, blog/page.tsx, demo/page.tsx.

## Self-review verification

Final grep at the merge boundary:
- `grep "seldonframe/crm" packages/crm/src/app/(public)/ (marketing)/` → **zero results** ✅
- `grep "discord.gg/seldonframe"` (placeholder) → **zero results** ✅
- `grep "discord.gg/sbVUu976NW"` (correct invite) → **5 results** as expected ✅

Note: `packages/crm/package.json:2` still reads `"name": "@seldonframe/crm"` —
this is the npm workspace package name (used internally for
inter-package imports), NOT a GitHub URL. Renaming would cascade
through tsconfig paths + dependency declarations + every workspace
reference. Out of scope for the marketing-website PR; can be
handled separately if desired.

## Containment

- `/pricing /privacy /terms /docs` — substantive top-level pages
  already exist and serve real content; left untouched per
  containment rule
- Old `LandingHero` etc. components in `components/landing/` remain
  in the tree (unused) — not deleted, in case other slices reference
  them
- Brand assets (favicon, OG, Twitter card) already wired in root
  layout via SLICE 9 PR 2 — no changes needed
- Zero changes to schemas, dispatchers, primitives, blocks, admin
  surfaces, or any SLICE 1-11 code

## Verification

- ✅ `pnpm typecheck`: zero errors
- ✅ `pnpm test:unit`: 1858 pass / 0 fail / 12 todo (no regression)
- ✅ `pnpm build`: full Next.js build successful both before and
  after URL fixes
- ✅ New routes built as static: `/blog`, `/demo`, `/docs/quickstart`
- ✅ Vercel preview observed green by Max at HEAD before this final
  fix push
- 18-probe regression: skipped (marketing pages don't affect
  synthesis context; 31-streak preserved by inspection — zero
  changes to global archetype registry or any synthesis-relevant
  surface)

## Merge strategy

**Standard merge commit (NOT squash, NOT rebase).**

Merge commit message: `Merge launch-prep: marketing website + sibling pages`

## Branch cleanup

`claude/marketing-website` deleted post-merge.
