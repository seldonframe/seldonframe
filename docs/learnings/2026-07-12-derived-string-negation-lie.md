# Derived marketing strings can lie by matching a negation — render the output to catch it

## The problem, in one line
`composeCheapestOption` (packages/crm/src/components/seo/best-page.tsx) labeled Lindy — whose price line reads "from ~$49.99/mo (7-day trial; **no free tier**)" — as "(has a free plan)" on the new /best/everyday-ai-agent-for-small-business page, because its `/free/i` regex matched the word "free" inside the negation.

## The approach
1. Built the new /best registry entry with hedged price lines copied verbatim from verified sources (registry strings + live pricing-page fetches), per never-lies.
2. All 1398 SEO unit tests passed and tsc showed zero delta — every gate was green.
3. Before calling it done, rendered the ACTUAL artifact (the page's markdown twin via `renderBestMarkdown(<slug>)`) and read it top to bottom. The TL;DR line said "Cheapest real option: Lindy — … no free tier … (has a free plan)" — a flat contradiction visible only in composed output.
4. Fixed the root cause in the pure function (`/free/i.test(from) && !/no free/i.test(from)`), not the wording — a wording dodge would have left every future "no free" price line exposed.
5. Added a registry-wide regression test: for every category, if the composed line claims "(has a free plan)", the line must not contain "no free". (tests/unit/seo/best-pages.spec.ts)

## Judgment calls
- Did NOT dodge by rewording Lindy's price line to avoid the word "free" — the negation is valuable buyer information, and the bug class (regex keyword match hitting its own negation in composed strings) would have survived to bite the next entry. Fix the composer, keep the honest string.
- Did NOT trust the existing 1398-test suite as proof of correctness. The suite asserts shape (no undefined/null, sections present, lengths) — it cannot assert that a composed sentence is TRUE. Truth checks on derived prose need either a targeted invariant test (added) or human/agent eyes on the rendered artifact.
- Wrote the new test as a whole-registry invariant plus one pinned regression case, so the seo-price-refresh agent's future string edits are also guarded.

## Related
- Same diagnostic family as docs/learnings 2026-07-11 "prod-row read-back diagnostic" and the vision-verify lesson: green code gates ≠ correct observable output; read the thing the user will actually see.
- Never-lies content rules header in packages/crm/src/lib/seo/best-pages.ts.

## The reusable rule, one line
Any string COMPOSED from other strings by keyword matching can assert the opposite of its source (keyword-inside-a-negation); before shipping a new instance of a composed surface, render it and read it — and guard truth claims with an invariant test, because shape tests can't catch a lie.
