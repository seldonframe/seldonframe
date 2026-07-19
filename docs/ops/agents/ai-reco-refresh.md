# ai-reco-refresh — monthly AI Recommendation Index snapshot (headless agent prompt)

Runs MONTHLY (2nd of the month, 12:00 UTC) via `~/agents/run-agent.sh ai-reco-refresh`. Regenerates the snapshot behind https://www.seldonframe.com/charts/ai-recommendation-index so the page stays a living dataset.

**Preconditions — if missing, STOP and email why (Step 5 still runs):**
1. `packages/crm/scripts/ai-reco-snapshot.mjs` exists on origin/main (the generator; read it first — it IS the methodology).
2. `DATAFORSEO_AUTH_B64` in `packages/crm/.env.local` (for the Google AI Overviews attempt).
3. `gh auth status` valid (PR flow).

**Hard caps:** DataForSEO spend ≤ $0.50 · no sub-agents · the 10-question prompt set is FROZEN (changing it breaks month-over-month comparability — if a question must change, that's a Max decision, flag it in the email instead).

## Step 1 — Regenerate
Run the generator per its own docs: the Claude column via `claude -p` per question (same model tier as the script specifies), and RETRY the Google AI Overviews column via DataForSEO SERP (it was absent at v1 in July 2026 — if AI Overview blocks now render, the column ships; if not, it stays deferred honestly). Write raw outputs to `docs/strategy/ai-reco-index/YYYY-MM-DD-raw.md`. Never fabricate an engine column or a brand mention; every scored point needs a receipt in the raw file.

## Step 2 — Update the registry
Regenerate the snapshot const in `packages/crm/src/lib/seo/ai-reco-index-data.ts` (new snapshotDate, scores, engine list). PRESERVE prior snapshots if the data module supports history (if it holds only one snapshot, add month-over-month movement fields only if the type already has them — do NOT redesign the type; propose changes in the email instead).

## Step 3 — Gate
```
cd packages/crm
node --import tsx --test tests/unit/seo/ai-reco-index.spec.ts   # all green
NODE_OPTIONS="--max-old-space-size=6144" pnpm typecheck          # no NEW errors
NODE_OPTIONS="--max-old-space-size=6144" pnpm build              # exit 0
```
Circuit breaker: any failure → push branch `chore/ai-reco-YYYY-MM`, open a DRAFT PR, stop, email the failure.

## Step 4 — Publish
Green gate → branch `chore/ai-reco-YYYY-MM`, push, `gh pr create`, `gh pr merge --merge`. Ping IndexNow for /charts/ai-recommendation-index and its .md twin (key + helper in `packages/crm/src/lib/seo/indexnow.ts`).

## Step 5 — Recap email (EVERY run)
Resend (`RESEND_SENDING_KEY` in packages/crm/.env.local) → maximehoule100@gmail.com, subject `ai-reco-index <month>: <headline>`. Body: the new top-10 with movement vs last month (↑↓ per brand, verbatim from the data — never smoothed), whether SeldonFrame appeared (this line is mandatory every month, present or absent), Google AI Overviews column status, spend, merge SHA, raw-file link. If SeldonFrame ENTERS the leaderboard for the first time, say so plainly — that's the milestone this whole index quietly tracks.

Rules: frozen prompt set · receipts for every point · absence is a publishable result · honest > voluminous.
