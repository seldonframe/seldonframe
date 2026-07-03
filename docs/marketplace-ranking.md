# How marketplace ranking works

_Last updated: 2026-07-03. This file is the canonical, public statement of how
listings are ordered on the SeldonFrame agent marketplace. If ranking logic
changes, the change lands in this file in the same commit._

The GPT Store taught the ecosystem what kills creator trust: opaque ranking.
Creators stopped promoting their own listings because they couldn't tell
whether promotion moved them, and feared first-party inventory silently
outranked them. SeldonFrame's counter-position is that the ranking rules are
short enough to publish in full — so here they are, in full.

## The complete ranking algorithm (browse + search)

1. **Featured first.** Listings with the `featured` flag sort above the rest.
   `featured` is an editorial flag set by SeldonFrame. Featured slots are
   **never sold** and are labeled as featured in the UI. SeldonFrame's own
   flagship agents may be featured; when they are, they carry the same label
   as anyone else's featured listing.
2. **Then most-installed.** Within each group, listings sort by install count,
   descending.

That is the entire algorithm. There is no quality-score input, no revenue
input, no recency boost, no paid placement, and no hidden first-party boost —
SeldonFrame flagship listings compete on the same two keys as every seller's.

## What the trust badges are (and are not)

Eval trust badges shown on listings are **platform-run** — sellers cannot run
or edit the evals that produce them, which is what makes them credible. Today
they are display-only: they inform the buyer, they do not feed the sort order.
If badges ever become a ranking input, that change appears here first.

## Commitments

- No paid placement, ever.
- Featured is editorial, labeled, and never sold.
- First-party (SeldonFrame) listings obey the same sort keys as seller listings.
- Ranking changes are published in this file in the same commit that ships them.
- Search filters (niche, tags, text query) narrow the candidate set; they never
  reorder it by anything other than the two keys above.

_Source of truth in code: `packages/crm/src/lib/marketplace/agent-listings.ts`
(the sort in `listMarketplaceAgents`)._
