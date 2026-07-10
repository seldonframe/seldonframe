# guide-refresh — monthly guide re-verification (headless agent prompt)

Runs MONTHLY (3rd of the month, 13:00 UTC) via `~/agents/run-agent.sh guide-refresh`. Mission: keep the /guides estate's freshness HONEST — AI engines prefer recently-verified content, but a bumped date without re-verification is a lie. This loop re-verifies, then bumps.

**Preconditions:** guides engine on origin/main (`packages/crm/src/lib/seo/guides/`) · `gh auth status` valid. If missing, STOP and email why.

**Hard caps:** ≤12 guides per run (the oldest `factsChecked`/date-equivalent first) · no sub-agents · never delete a guide (flag for Max instead).

## Step 1 — Pick the batch
List all guides in `packages/crm/src/lib/seo/guides/` with their last-verified date field (read `types.ts` for the exact field name). Take the 12 oldest. Skip any verified within the last 60 days.

## Step 2 — Re-verify each guide
For each: WebFetch every entry in its `sources`. Three outcomes per source:
- **Still live + still supports the claim** → note verified.
- **Dead/moved** → find the same content at a new URL (publisher's own site only) or a genuinely equivalent replacement source; update the entry. If no honest replacement exists, REWRITE the dependent claim to be hedged/source-free or remove it — never leave a claim standing on a dead source.
- **Live but the content changed** (figure updated, price moved, study superseded) → update the guide's claim to match the source TODAY.
Also: fix any internal links that 404 against the current registries (check slugs against the guides/tools/best registries in the repo — do not guess).

## Step 3 — Bump dates honestly
Update the guide's verified-date field ONLY for guides where Step 2 actually ran on every source. A guide whose sources couldn't be checked (fetch blocked etc.) keeps its old date and is listed in the email as "could not re-verify".

## Step 4 — Gate
```
cd packages/crm
node --import tsx --test tests/unit/seo/guides.spec.ts        # all green
NODE_OPTIONS="--max-old-space-size=6144" pnpm typecheck        # no NEW errors
NODE_OPTIONS="--max-old-space-size=6144" pnpm build            # exit 0
```
Circuit breaker: any failure → branch `chore/guide-refresh-YYYY-MM` + draft PR + stop + email.

## Step 5 — Publish
Green → branch, push, `gh pr create`, `gh pr merge --merge`. IndexNow-ping the refreshed guide URLs (helper in `packages/crm/src/lib/seo/indexnow.ts`).

## Step 6 — Recap email (EVERY run)
Resend (`RESEND_SENDING_KEY` in packages/crm/.env.local) → maximehoule100@gmail.com, subject `guide-refresh <month>: <N> re-verified, <M> claims updated`. Body: per guide — sources checked / replaced / claims changed (show old→new for any figure that moved); the "could not re-verify" list; anything flagged for Max (a guide whose whole premise aged out); merge SHA. Never report a date bump the run didn't earn.

Rules: verification before dates · a hedged claim beats a dead citation · honest > voluminous.
