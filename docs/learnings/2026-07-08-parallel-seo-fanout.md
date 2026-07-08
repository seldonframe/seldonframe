# 2026-07-08 — Shipping a ~5k-line static content engine via 4-way parallel fan-out in one shared worktree

## The problem, in one line
Build ~90 files of registry-driven SEO surface (10 competitor registry entries, 30 stamped
route folders, a new 37-page listicle engine, 4 client-island tools) in one session without
agents trampling each other or the coordinator losing the thread.

## The approach
1. Research FIRST, in parallel, before any design: 3 background agents (codebase scout +
   2 web researchers) while the coordinator reads nothing but their summaries.
2. Read the shipped pattern files from `origin/main` via `git show` (the current checkout was
   a stale branch — never trust the working tree to represent main).
3. Write the design doc INCLUDING the researched facts pack (competitor pricing, hedging
   instructions) into the worktree — subagents read the doc, not the conversation.
4. Fan out 4 implementers over ONE shared worktree with **disjoint file ownership declared in
   each prompt**: A owns the 2 registry files, B creates only new route folders (slugs fixed
   upfront by the coordinator so B never waits on A), C creates only new engine files, D only
   new tool files. The coordinator personally owns every SHARED file (sitemap, llms.txt,
   hubs) — integration edits can even be written before the imported modules exist, since
   editing isn't compiling.
5. Gate independently (maker ≠ checker): registry spec + full-suite tsc judged by DELTA
   against the ambient junctioned-node_modules baseline (436→436, zero in touched files) +
   opus reviewer on the full diff + review-fix commit.

Dead end worth keeping: a scratch `.mts` script importing the new registry failed with
"does not provide an export named X" while tsc and the test harness were both green. That is
Node's ESM named-export lexer failing on the CJS-transpiled `.ts` (no `"type": "module"`),
NOT a real missing export — rename the scratch script to `.ts` (CJS context, same as the
specs) and it works. Don't "fix" the registry when only an `.mts` consumer complains.

## Judgment calls
- Did NOT create per-agent worktrees: disjoint ownership in one worktree is cheaper and the
  merge is free. Isolation is only worth it when two agents must edit the SAME files.
- Did NOT split "-free" keywords into separate thin pages: folded them as an `id="free"` H2
  into the small-business pages (doorway-page risk beats keyword exactness).
- Did NOT let agents guess prices to look complete: the design doc carried per-vendor hedge
  instructions ("quote-gated — say so", "listed at ~") per the never-lies rule.
- Did NOT claim a build pass: local `next build` is impossible in this env (`workflow/next`
  is uninstalled everywhere locally, pre-existing) — said so and made the pushed branch's
  Vercel preview the real build gate instead of quietly skipping.

## The reusable rule, one line
Parallelize by declaring file ownership in the prompts (fixed slugs/new-files-only for the
mechanical agents, shared files reserved for the coordinator), and judge tsc by delta against
a recorded ambient baseline — also appended as lessons L-09/L-10 for the two environment
traps hit (moving origin/main poisons `origin/main..HEAD` greps; PS5.1 `Set-Content` writes
BOM + mojibake into generated source).
