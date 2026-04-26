# repo-polish — launch-prep polish across landing, docs, and OSS surface

## Summary

Five small commits that close the last cosmetic + OSS-hygiene gaps before launch:

1. **C1** `65b4efa6` — Landing "How it works" went from 3 steps to **4 steps** with `claude mcp add seldonframe` as step 1 (the install primitive was implicit before). Grid responsive breakpoint updated to `md:grid-cols-2 lg:grid-cols-4` and subtitle copy updated to "Four steps."
2. **C2** `b1f2f8fa` — `/docs` sticky "On this page" sidebar was 75% translucent, causing scrolled content to bleed through. Made fully opaque (`bg-[#0a0a0a]` matching the page background) and added `lg:z-10` so it always sits above scrolling content. Inline comment explains the intentional divergence from the surrounding `bg-zinc-950/65` convention.
3. **C3** `11728b01` — Replaced the framework-era README.md with a launch-ready, positioning-led, scannable rewrite. 11 sections: hero, alternative-to positioning, what-is, key features (10 bullets with emojis), 3-min quickstart, screenshots placeholder, who-it's-for, 5-primitive architecture, infrastructure, pricing, contributing/community/license. All URLs point to `github.com/seldonframe/seldonframe` + the permanent Discord invite + `seldonframe.com`.
4. **C4** `5ae7fb31` — Rewrote CONTRIBUTING.md around the actual contribution flow: welcome, ways to contribute, dev setup, workflow (TDD reference + lint/typecheck/test commands), code style (TS strict, conventional commits, tenant scoping invariant), PR guidelines, and where to ask questions.
5. **C5** `688b4aac` — Added the OSS hygiene set GitHub expects on a launching repo:
   - `.github/ISSUE_TEMPLATE/bug_report.md`
   - `.github/ISSUE_TEMPLATE/feature_request.md`
   - `.github/PULL_REQUEST_TEMPLATE.md`
   - `CODE_OF_CONDUCT.md` — adopts Contributor Covenant 2.1 by reference; enforcement contact `max@seldonframe.com`
   - `SECURITY.md` — private disclosure to `max@seldonframe.com`, 72h ack / 7d remediation plan

## Verification

- `pnpm --filter @seldonframe/crm typecheck` — clean
- `pnpm test:unit` — **1858 pass / 0 fail / 12 todo** (same baseline as SLICE 11 close-out — no regression)
- C1 + C2 are markup-only inside existing components; no schema, no behavior change.
- C3 + C4 + C5 are pure docs / repo-meta, no executable code.

## What this does NOT touch

- No code in `packages/crm/src/lib/**`
- No schema migrations
- No env vars
- No agent / workflow runtime
- No marketing copy outside the landing "How it works" section + the README

## Vercel preview

Branch: `claude/repo-polish` at HEAD `688b4aac`. Preview will be available at the standard Vercel branch URL once the deploy completes.

## Suggested merge

Standard merge commit (consistent with SLICE 9, 10, 11, marketing-website pattern). No squash.

## After merge

Branch cleanup as usual:

```bash
cd "C:/Users/maxim/CascadeProjects/Seldon Frame"
git fetch origin --prune
git worktree remove .claude/worktrees/repo-polish
git branch -D claude/repo-polish
git push origin --delete claude/repo-polish
```
