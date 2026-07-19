# The Content Engine — /guides + the weekly content loop (2026-07-09)

Plan of record for the long-form article surface. Referenced by
`docs/ops/agents/content-loop.md` (the weekly headless agent that executes
Phase 2). Written 2026-07-09 to match what shipped; §6 records the
auto-publish decision the loop prompt cites.

## 1. Why a guides surface at all

The comparison/pricing/best/tools tree captures buyers who already know the
category. The `/guides` surface captures the step earlier: the problem-aware
searcher ("how do I stop no-shows", "why is my business not showing up in
ChatGPT"). Two jobs, in priority order:

1. **Feed the money pages.** Every guide internally links its `relatedTool`
   (a /tools calculator) and the relevant comparison/best pages — the
   Keval-playbook pattern where informational content exists to strengthen
   transactional pages, whether or not it ranks itself.
2. **Win citations.** Guides follow the same citable architecture as the rest
   of the tree (sourced claims, dated, authored, .md twins) so LLMs can lift
   them safely.

## 2. Architecture (Phase 1 — SHIPPED to main 2026-07-09)

Registry-driven like every other SEO surface: one `Guide` object per file in
`packages/crm/src/lib/seo/guides/<slug>.ts`, codegen'd `index.ts`, pure
lookups, `/guides/<slug>` pages + `.md` twins, sitemap/llms.txt auto-derive,
`tests/unit/seo/guides.spec.ts` as the integrity gate. Golden reference:
`guides/what-is-speed-to-lead.ts`.

Content rules (inherited, non-negotiable): never-lies — every stat cited to a
verified-live source or hedged; grade-6 prose; one page per intent; authored
(AuthorByline) and dated.

## 3. Clusters

Guides cluster under the pillar tools/topics: speed-to-lead · missed calls /
AI receptionist · no-shows & reminders · online booking · service-business
FAQ/website · AI visibility (GEO: "how to get recommended by ChatGPT").
Each cluster's guides interlink and all point at the cluster's money pages.

## 4. Phase 2 — the weekly content loop (this is what runs)

`docs/ops/agents/content-loop.md`, Wednesdays 13:00 UTC on the devbox
(the day after Monday's keyword-recon so research is ≤48h fresh):
measure (DataForSEO / recon queue) → dedupe against every existing slug →
draft ≤15 guides into the registry → adversarial self-critique → mechanical
gate (guides.spec + typecheck + REAL `pnpm build` on the box) → auto-publish
via PR → IndexNow ping → run manifest.

## 5. Caps and the circuit breaker

- ≤15 articles/run; ~$0.20 DataForSEO/run; no sub-agents.
- Gate failure or <3 surviving articles ⇒ NO merge: draft PR + manifest +
  stop. Auto-publish is forfeited for the run, never forced.

## 6. The publishing model — why auto-publish (decision of record)

Options considered: (a) human merges every batch (safest, but recreates the
desktop-bottleneck this whole system exists to remove and makes the weekly
cadence hostage to founder attention); (b) auto-publish with a hard quality
gate + full audit trail. **Chosen: (b).**

What makes (b) acceptable — all five, together:
1. The mechanical gate includes the real `next build` and the guides spec.
2. The adversarial critique drops anything uncitable, thin, duplicated, or
   machine-spun — drop-when-in-doubt is written into the prompt.
3. Every run leaves a PR + a manifest (`docs/strategy/content-loop/`)
   naming what published, what was dropped and why — reviewable in git,
   revertible with one `git revert`.
4. The blast radius is a content surface (static pages), not product code;
   the worst realistic failure is a weak article, and Google's
   scaled-content-abuse policy is the reason the gate treats quality as
   sacred rather than a nice-to-have.
5. The loop's identity is the machine user (`seldonframe-devbox`, Write) —
   its ONLY path to main is a PR that satisfies the ruleset, so the trail
   can't be skipped even by a misbehaving run.

Standing review ritual: Max skims the weekly manifest; two consecutive
manifests with dropped-quality complaints ⇒ pause the cron and re-tighten
the gate before resuming. The cadence cap only rises after 4 clean runs.

## 7. Sequencing

Phase 1 engine ✅ (2026-07-09, ~20 seed guides live) → Phase 2 loop armed
(this doc + the cron) → Phase 3 (later): guide-level videoId seams like
/best, and per-cluster pillar pages once GSC shows which clusters earn
impressions.
