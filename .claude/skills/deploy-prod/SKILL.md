---
name: deploy-prod
description: Deploy main to Vercel production the safe way (clean worktree, env baked in) and smoke it with Reelier at Level 0 — zero tokens. Use after any merge to main; Vercel git integration does NOT reliably auto-deploy main.
---

# deploy-prod — clean-worktree deploy + Reelier smoke

Vercel's git integration does not reliably auto-deploy main (verified 2026-07-18), and
deploying from the dirty local checkout is forbidden. This is the canonical sequence.

## Steps

1. Get the merge sha: `git fetch origin main` and note the commit to deploy.
2. Clean worktree deploy (env vars are baked at build, so this also picks up flag changes):
   ```powershell
   git worktree add "$env:TEMP\sf-main-deploy" <sha>
   Copy-Item .vercel "$env:TEMP\sf-main-deploy\.vercel" -Recurse -Force
   Set-Location "$env:TEMP\sf-main-deploy"; npx vercel deploy --prod
   ```
3. Verify: `npx vercel inspect <deployment-url>` → `target production` + `status Ready`.
4. **Smoke with Reelier (default — NOT the smoke-runner agent):**
   ```powershell
   Set-Location C:\Users\maxim\CascadeProjects\reelier
   node dist/cli.js run skills/sf-post-deploy-smoke.skill.md
   ```
   Level-0 deterministic replay: ~1-3s, 0 LLM tokens, per-step receipts in `.reelier/runs/`.
   Exit 0 = deploy smoked. This replaces a ~35-60k-token smoke-runner agent dispatch.
5. **Escalation only on divergence:** if a step fails, do NOT immediately re-run — a failed
   sentinel usually means the page copy changed (update the skill's assert) or the deploy
   is genuinely broken (check `npx vercel logs`). Dispatch the smoke-runner agent ONLY when
   the reelier failure needs judgment (e.g. deciding whether copy drift is intentional).
6. If the deploy touched migrations: verify on Neon that the new table/column exists
   (`information_schema`) — the build runs `db:migrate`, but confirm, don't assume.
7. Clean up: `git worktree remove "$env:TEMP\sf-main-deploy" --force; git worktree prune`.

## Why Reelier-first

Deterministic replay with assertions IS the smoke test: same checks every time, receipts
written, zero spend. The agent is the escalation path, not the default — the same
L0-first/escalate-on-divergence ladder the replay product itself uses. When the smoke
skill's sentinels drift because marketing copy changed, updating the assert line in
`reelier/skills/sf-post-deploy-smoke.skill.md` is the fix (and gets a changelog line).
