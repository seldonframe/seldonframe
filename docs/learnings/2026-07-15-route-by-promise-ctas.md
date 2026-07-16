# Route-by-promise: a CTA's label picks its destination

## The problem, in one line
On seldonframe.com, buttons labeled "Build it free" sent visitors to `/signup` — more friction than either chatbox path — so the CTA promising the *least* friction delivered the *most*, while the ungated build (`/try`) sat one tab away.

## The approach
1. **Trace every entry path to its post-click reality before proposing anything.** Three paths existed: CTA buttons → `/signup` → empty `/clients/new`; chatbox "describe" tab → `/signup?intent=build` + localStorage seed → auto-building `/clients/new`; chatbox "URL" tab → `/try` anonymous build (no signup). Same builder, wildly different friction — invisible unless you walk all three.
2. **Replace the goal "unify the flows" with the requirement underneath it**: every CTA should deliver what its label promises, via the highest-converting path. That reframe split the CTAs cleanly — "Build it free"/"Start building" promise a *build*; "Start for free"/"Start free" promise *signing up* — and only the first group was broken.
3. **Route build-promising CTAs to the hero chatbox** (`/#hero-form`), not to `/try` directly: `/try` is URL-only (kills the describe path) and 404s if its feature flag flips off, while the chatbox already routes correctly under both flag states via `heroSubmitTarget`. Anchoring inherits the routing logic for free.
4. **Make the anchor land ready-to-type**: same-page pill does `preventDefault` + smooth `scrollIntoView` (reduced-motion aware) + focus; cross-page links use absolute `/#hero-form`, and a `hashchange`+mount effect in the hero focuses the active tab's input. A bare anchor jump reads as a dead click — focus is what makes it read as intent fulfilled.

## Judgment calls
- **Did NOT unify everything.** Nav "Start for free" and FAQ "Start free" stayed on `/signup` — signup *is* what those labels promise, and it preserves one deliberate email-first capture path. Uniformity was never the goal.
- **Did NOT point anything at `/try`** despite it being the zero-friction star — coupling every CTA to a flag-gated route is a disguised dependency.
- **Shipped ahead of the PostHog click-split query** (reversible change, kill threshold set: signups −20% in 14 days without a build+claim rise → revert) — but the query remains the named tripwire, not forgotten.

## The reusable rule, one line
Route CTAs by what their label promises, not by where the funnel wants people — a "Build it free" button that opens a signup wall is a small lie, and small lies compound into activation walls.

Related: learnings `2026-07-15-pricing-claims-drift-audit`; memory `web-activation-build` (~22 signup-first → 0 paying), `agency-homepage-repositioning`.
