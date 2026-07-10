# Mass content rewrite via subagent swarm — the method that held (2026-07-10)

Context: rewrote all 92 /guides pages (walls of text → diagrams + analogies + readable prose)
in one day: engine PR (#55) then 90 parallel rewriters + 3 fact-drift reviewers (PR #56).
Written for a weaker model executing this cold.

## The architecture call that made it tractable
Upgrade the ENGINE, not the pages. Markdown-lite in registry strings (valid markdown → the
GEO twin needs zero changes), typed diagram primitives (flow/loop/compare/bars/stack) rendered
by one shared component, callouts as a typed field, favicons derived from source URLs already
in the data. 92 pages inherited visuals before a single article was rewritten.

## Rules that prevented disasters at N=90
1. **FACTS FROZEN as a named, repeated contract** in every prompt: numbers/hedges/quotes/
   attributions/sources byte-identical in meaning. Rewriters may only restructure prose.
2. **Shared spec file, tiny per-agent prompts.** One rewrite-spec.md in scratchpad; each of 90
   prompts = 3 lines (file + cluster + diagram hint). Consistency comes from the spec + two
   gold exemplars, not from prompt length.
3. **Mechanical self-check in the spec**: compile the file via `npx tsx -e require(...)` and
   print section/diagram/callout counts. Caught escaping errors at the writer, not the gate.
4. **Fact-drift review = numeric fingerprints, not vibes.** Reviewers script a multiset diff of
   number-ish tokens (old vs new per file) and investigate only deltas; sources arrays compared
   byte-for-byte. 90 diffs reviewed rigorously for ~3 agents' effort.
5. **Verify the verifier.** Across the day, reviewer flags were wrong ~40% of the time
   (BrightLocal stats were real; "AppExchange is now AgentExchange" is Salesforce's own banner;
   smoke agent's "no <strong>" grepped the RSC flight payload, not the HTML). Rule: re-verify a
   flag against the primary source/page yourself BEFORE editing. The real catches (nested
   markup, the $50→$970 "flat-rate" chart) were worth the whole gate.

## Deploy-verification traps (cost us two false rounds)
- **Sentinel must come from the NEW content, not the new template.** Polling for engine CSS
  (`sfGd`) matched the PREVIOUS deploy (engine merged earlier). Poll for a content marker
  (e.g. `<strong>` count > threshold) instead.
- **Screenshot services capture the viewport, not the page.** microlink's default height hid
  everything below the fold → two vision FAILs on pages that were fine. Fix: set
  `viewport.height` to article height (5-9k px) and CHECK THE PNG DIMENSIONS before grading.
- Google s2 favicons 301 → gstatic PNG; a bare curl says text/html — follow redirects before
  declaring images broken.

## Numbers
90 rewrites ≈ 78k tokens each; 6 rounds of 12-16 parallel; 2 slugs were silently never
dispatched (round lists drift — reconcile `git status` count against the roster BEFORE gating);
spec suite (834 tests incl. markup-balance + JSON-LD-strip across all guides) caught the one
nested-markup case the writers' self-checks missed.
