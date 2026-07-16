# Adjudicate quote conflicts at the source, not the intermediate doc

## The problem, in one line
Two parallel implementers quoted the same GoHighLevel help article with different words on two public pages; the reviewer blocked one as a "misquote presented as the vendor's own words" — but its only evidence was our research plan doc, an intermediate artifact.

## The approach
1. Recognize the conflict class: implementer A claimed it live-fetched the article and the plan doc's quote wasn't an exact substring; implementer B trusted the plan doc; the reviewer trusted the plan doc too. Three parties, one shared upstream source nobody in the dispute had just read.
2. Fetch the live source (the GHL help article) and extract every candidate sentence character-for-character.
3. Result: the article contains BOTH sentences — each quote was a verbatim substring of a different sentence. No misquote existed; the reviewer's block was a false positive created by verifying against a summary instead of the source.
4. Fix what the conflict revealed anyway: the spec pinned the quote string but could never catch fidelity drift, so document each quote's provenance (full source sentence + fetch date + "re-verify at the source if this string changes") next to the pinned constant.

## Judgment calls
- Did NOT "apply the reviewer's fix" reflexively — swapping A's true quote for B's would have shipped a correct page while leaving the false belief (that A misquoted) on the record, and destroyed useful variety (two different verbatim sentences on two surfaces is stronger evidence, not weaker).
- Did NOT force both surfaces onto one quote for "consistency" — consistency between quotes is not a virtue when both are independently true and serve different framings.
- DID keep the reviewer's other findings (color drift, missing rel) — one false positive doesn't discredit a review.

## The reusable rule, one line
When two claims about a source disagree — including a reviewer vs an implementer — the tiebreaker is always a fresh fetch of the source itself, never the intermediate document either party relied on.
