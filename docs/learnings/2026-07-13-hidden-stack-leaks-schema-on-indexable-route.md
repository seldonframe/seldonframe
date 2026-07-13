# A mounted-but-hidden alternate UI stack leaks JSON-LD and duplicate ids onto indexable routes

## The problem, in one line
The dual-mode landing shell kept its alternate ("build") section stack mounted-but-`hidden` in record mode — correct on `/` where an in-place flip must preserve input state, but the same shell also rendered `/record`, silently putting a second `FAQPage` JSON-LD graph, duplicate element ids (`#top`, `#pricing`, `#get-started`), and a full page of hidden competing copy onto a newly-indexable URL.

## The approach
1. The code had already half-seen the hazard: `RecordFaq` grew a `withSchema` prop exactly so "two FAQPage graphs on one URL" couldn't happen — but the gate only covered the record FAQ's OWN schema, not the sibling stack's. A guard that protects one emitter doesn't protect the URL.
2. Ten task-scoped reviews (all green) structurally could not catch it: each task saw its own diff; the leak exists only in the composition of shell × route × schema. It was found by the FINAL whole-branch review, whose dispatch explicitly asked "what does a crawler see in the hidden DOM on each route?" — `display:none` content is still parsed for script tags, ids, and text.
3. The fix keyed off intent, not symptoms: the hidden stack exists ONLY to preserve hero input state across the in-place flip, and only `/` has an in-place flip (`urlStrategy === "replace-state"`); `/record` flips back via full navigation. So gate the mounting on the strategy — `{urlStrategy === "replace-state" ? <div hidden={…}>{buildStack}</div> : null}` — which deletes the duplicate schema, the duplicate ids, and the content bloat in one line while leaving `/` (including flag-off) byte-equivalent.
4. Pin it with a composition-level test at the URL's granularity: render the full composition for the indexable route and assert `"FAQPage"` occurs exactly once and the alternate stack's sentinel copy occurs zero times.

## Judgment calls
- Did NOT unmount the hidden stack on `/` too — the flip there is client state, and unmounting would drop typed hero input on every toggle; the residual duplicate ids on `/?mode=record` were accepted and recorded (that URL is a UX convenience, not the canonical indexed record page).
- Did NOT fix by suppressing the build FAQ's schema with another prop — chasing per-emitter flags re-creates the original half-guard; removing the unneeded DOM is the invariant-level fix.
- Renamed colliding anchors (`#top` → `#record-top` in the record hero) rather than relying on "the hidden copy has zero height so the anchor accidentally works".

## The reusable rule, one line
Schema/id uniqueness is a property of the URL, not of any component — whenever alternate UI stacks coexist in one DOM, gate what mounts per-route by the reason the duplicate exists, and give every whole-branch review the question "what does the crawler see in the hidden DOM?"

Related: `docs/learnings/2026-07-13-inverting-token-on-invariant-surface.md` (same build, same lesson-shape: invariants live at a higher level than the diff), memory `dual-path-landing-record-mode`.
