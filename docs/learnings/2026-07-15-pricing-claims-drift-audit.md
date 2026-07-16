# Pricing-claims drift: audit against the catalog, then fan out fixes

## The problem, in one line
Weeks after the pricing catalog moved to the $29/$49/$99/$199/$299 ladder (2026-07-08), ranked marketing/SEO content still sold the retired era — "$29 white-label client workspaces", a "5→3→2% GMV ladder", a "$297 agency tier" — 41 false or misleading claims across ~20 files, none caught by per-page review.

## The approach
1. **Lock the truth table first, from code, not memory.** Read `packages/crm/src/lib/billing/plans.ts` and extract per-tier booleans (`fullWhiteLabel`, `clientPortal`, `maxSubAccounts`) — not just prices. The decisive fact was a boolean: Builder $29 has `fullWhiteLabel: false`, so *any* "$29 + white-label" collocation is false regardless of phrasing.
2. **One read-only audit agent, grep-driven, judging collocations.** Grep for money tokens ($29, $99, $297, 2%, 5%, "stepping down") and capability tokens (white-label, portal, sub-account, "your own brand", trial), then read 10+ lines around each hit and judge the *claim* being made and *who it targets* (solo vs agency). Output a findings table (file:line, quoted claim, verdict, fix) plus an explicit "checked and TRUE" list — the true-list is what makes the audit trustworthy, because it proves coverage rather than cherry-picking.
3. **Fan out fixes by file-cluster, not by finding.** Three implementer agents with mutually exclusive file sets (SEO comparison pages / guides / components+docs), each carrying the same truth table, each instructed to make the *smallest edit that makes the claim true* and to grep-proof + test its own files before returning.
4. **Orchestrator commits; agents never do.** Kept one reviewable commit and avoided racing a concurrent session in the same working tree.

Dead end worth skipping: trying to fix claims with find/replace. Every instance needed its sentence rewritten around the qualifier ("agency white-label from $99/mo") — the collocation is the bug, not the string.

## Judgment calls
- **Did NOT touch true "$29/mo flat, unlimited workspaces" claims** aimed at solo operators — the number is right when the capability context is right. Over-correcting true claims would have been its own drift.
- **Did NOT soften the competitive contrast.** Two guides were built entirely on the false "$29 vs GoHighLevel's $497" white-label premise; the honest number ($99 vs $497) is still a 5× advantage, so the guides kept their narrative and only swapped the tier. Honesty cost nothing here — check before assuming a truth-fix weakens the pitch.
- **Left grandfathered-tier references in code comments and billing internals alone** — they describe real subscribers' frozen terms, not marketing claims.
- **Deferred, not fixed, a dead CTA's deeper question**: `/signup?plan=agency` pointed at a query param nothing consumes. The fix routed to `/pricing` (verified live to render the ladder) rather than building param support — smallest true fix, no scope creep.

## The reusable rule, one line
Marketing claims are joins between a price and a capability: when the pricing catalog changes, grep the whole content surface for the OLD numbers and price+capability collocations — per-page review never catches catalog-wide drift.

Related: memory `agency-homepage-repositioning`, `pricing-ladder-shipped`; CLAUDE.md §1b.
