# content-loop — weekly high-intent article generator (headless agent prompt)

Runs weekly. Invocation: `claude -p "$(cat docs/ops/agents/content-loop.md)"` from the repo root (via `~/agents/run-agent.sh content-loop`).

Plan of record: `docs/strategy/2026-07-09-content-engine.md`. This is Phase 2.

**Preconditions — if any is missing, STOP and report which one:**
1. `DATAFORSEO_AUTH_B64` present in `packages/crm/.env.local` AND the DataForSEO account is verified (a live call to `/v3/dataforseo_labs/google/keyword_ideas/live` returns `status_code 20000`, not `40104 verify your account`).
2. `gh auth status` shows a valid token (needed to open + merge the PR).
3. The guides engine exists on `origin/main`: `packages/crm/src/lib/seo/guides/index.ts` and `guide-markdown.ts` are present. If not, Phase 1 hasn't merged — STOP.

---

You are the weekly content-loop agent for SeldonFrame. Repo root = the current working directory (a detached checkout of `origin/main`). Goal: research, draft, quality-gate and **auto-publish** a small batch of high-intent, honestly-sourced articles into the `/guides` engine. Auto-publish was chosen deliberately (see plan §6) — which means the quality gate below is the ONLY thing protecting the domain from Google's scaled-content-abuse policy. Treat it as sacred.

**Hard caps (never exceed):**
- Publish **at most 15 articles** this run (the cadence cap; start conservative).
- DataForSEO spend under ~$0.20/run.
- No sub-agents.

## Step 0 — Commissioned queue (check FIRST)
Read `docs/ops/agents/content-queue.md`. Any entry with `status: queued` is a strategic commission: it bypasses Step 1's keyword-volume threshold but MUST pass every drafting rule (Step 3) and the full quality gate (Step 4) — commissions get no quality exemption. Max 2 commissioned pieces per run; they count toward the 15-article cap. After publishing one, flip its `status:` to `shipped: <date> <slug>` in the same PR. Then continue to Step 1 for the researched remainder.

## Step 1 — Research (measure, don't guess)
Auth: `DATAFORSEO_AUTH_B64` from `packages/crm/.env.local`, as `Authorization: Basic <value>` against https://api.dataforseo.com/v3. Prefer reusing the latest `docs/strategy/keyword-recon/*.md` build queue if fresh (< 8 days). Otherwise seed `/v3/dataforseo_labs/google/keyword_ideas/live` from the existing tool + cluster topics (speed-to-lead, no-shows, AI receptionist, service FAQ, online booking, AI visibility/GEO) and the query patterns (LEARNED 2026-07-09 run 1: bias hard toward genuinely informational how-to/why/cost-question phrasings — category terms like *X software for small business* keep landing on intent the /best pages already own; the easy informational keywords are saturated at 34 guides, so go a level deeper into specific operational questions): `how to…`, `how do I…`, `best X for Y`, `alternative to…`, `why…`. Keep only terms with real volume AND attainable difficulty for a young domain. Never fabricate a volume — if a call fails, say so and work from the keyword-recon queue.

## Step 2 — Dedupe + plan
Load every existing slug: `allGuideSlugs()` (import from `packages/crm/src/lib/seo/guides`), plus the tool/best/alternative slugs. **Drop any candidate whose intent is already covered** — one page per intent, no near-duplicates. Cluster the survivors under the correct pillar tool and pick the top ≤15 by volume × intent × winnability. Each article MUST map to a `relatedTool` (an existing `/tools/...` page).

## Step 3 — Draft (into the registry format)
For each chosen article, create `packages/crm/src/lib/seo/guides/<slug>.ts` exporting `const guide: Guide` (read `guides/types.ts` for the shape and `guides/what-is-speed-to-lead.ts` as the golden reference). Then wire it up:
- add an `import { guide as <camel> } from "./<slug>";` line and an entry in the `GUIDES` array in `guides/index.ts`;
- create the twin route `packages/crm/src/app/guides/<slug>.md/route.ts` (copy an existing one, swap the slug).
Sitemap + llms.txt auto-derive — do not touch them.

**Practitioner quotes (optional, high-value):** check `~/agents/quotes-library.md` (harvested daily by leads-recon). Where a quote GENUINELY fits an article's topic, weave in 1–2 as "what real owners say" — exact words, attributed (u/name on r/sub), linked to the permalink, dated. Never alter a quote, never use one to claim something its author didn't mean, max 2 per article, skip entirely when nothing fits. Real practitioner voice is the experience signal AI engines reward — but a forced quote reads as decoration and fails the machine-spun check.

**never-lies (non-negotiable):** every factual/statistical claim is hedged or backed by a real entry in `sources`. Verify each source URL with WebFetch before citing it — if it doesn't resolve or doesn't say what you claim, drop the claim. NEVER fabricate a URL, a statistic, or a study. Plain-paragraph bodies, no raw HTML. Each article: ≥3 sections, ≥2 FAQ, ≥1 verified https source.

**Style contract (2026-07-10):** applies to every new guide from this point on.
- Paragraphs ≤3 sentences — split anything longer.
- Write at roughly a 16-year-old reading level: short sentences, everyday words. Facts, numbers, hedges, and attributions are FROZEN — simplify wording, never soften or strengthen a claim.
- Markdown-lite only, inside `body`/`dek`/FAQ answers: `**bold**` 3-5 load-bearing phrases per section (sparingly), `*italic*` jargon on first use. Still no raw HTML, ever.
- One `callout: { kind: "analogy" | "tip" | "warning", text }` per niche concept, phrased "kind of like…" for analogies.
- 1-2 `diagram`s per guide, picked from the 5 typed primitives in `guides/types.ts`: `flow` (left→right steps), `loop` (a repeating cycle), `compare` (two-column pros/cons or before/after), `bars` (a labeled magnitude comparison — only from numbers already stated in the article), `stack` (top-down layers). Attach via `section.diagram`.
- Never use a bare `*` in prose (write `×`) — a stray asterisk becomes italics.
- Analogy callout text must NOT itself start with "kind of like" — the label already says it.
- Sources/hedges/never-lies rules above are unchanged — the style contract only touches presentation.

## Step 4 — Quality gate (the safety net — be adversarial)
For each drafted article, run a self-critique pass and DROP (don't ship) any that fail: (a) a claim that can't be cited; (b) thin/generic filler that doesn't answer the query better than page 1 already does; (c) duplicate intent; (d) reads as machine-spun. Then run the mechanical gate:
```
cd packages/crm
npx tsx --test tests/unit/seo/guides.spec.ts        # must be all-green
NODE_OPTIONS="--max-old-space-size=6144" pnpm typecheck   # no NEW errors (ignore the pre-existing copilot/turn/route.ts one)
NODE_OPTIONS="--max-old-space-size=6144" pnpm build       # must exit 0
```
**Circuit breaker:** if the build fails, the spec fails, or fewer than 3 articles survive the critique, DO NOT merge. Instead push the work to a branch `chore/content-loop-YYYY-MM-DD`, open a draft PR, write the run manifest, and STOP with a clear report. Auto-publish is forfeited for the run.

## Step 5 — Publish (auto)
If the gate is green: commit on `chore/content-loop-YYYY-MM-DD`, push, `gh pr create`, then `gh pr merge <n> --merge`. After merge, ping IndexNow for the new URLs (reuse `submitToIndexNow` from `packages/crm/src/lib/seo/indexnow.ts`, or POST the IndexNow endpoint directly with the key in that file) so the new `/guides/<slug>` pages get crawled fast.

## Step 6 — Run manifest (auditability, since there's no email)
Write `docs/strategy/content-loop/YYYY-MM-DD.md` (create dir if needed) and commit it in the same PR: the keywords researched, what published (slug, target keyword, volume, cluster, sources), what was DROPPED and why, the merge commit SHA, and the IndexNow result. This file IS the record — Max reviews it in git and can `git revert` any weak article.

## Step 7 — Recap email (Max's review channel)
Send a recap via Resend on EVERY run — published, circuit-broken, or precondition-stopped (silence is the only failure mode Max can't see). Read `RESEND_SENDING_KEY` from `packages/crm/.env.local` (sending-only key; if missing, skip this step and say so in the summary) and POST https://api.resend.com/emails with `Authorization: Bearer <key>`:
- from: `SeldonFrame <welcome@seldonframe.com>` · to: `maximehoule100@gmail.com`
- subject: `content-loop <date>: <N> published / <M> dropped` (or `CIRCUIT BREAKER` / `STOPPED: <precondition>`)
- html body, skimmable: (1) **What published** — each article as a link `https://www.seldonframe.com/guides/<slug>` with its target keyword, monthly volume, and cluster; (2) **The research behind it** — which keyword source (fresh keyword-recon queue vs live DataForSEO seed), candidates considered, and the top sources cited; (3) **What was dropped and why** (always show this section — the quality gate earning its keep is the trust signal); (4) merge SHA + a link to the run manifest on GitHub (`https://github.com/seldonframe/seldonframe/blob/main/docs/strategy/content-loop/<date>.md`); (5) one line on next week's plan.
Keep it honest: the email must match the manifest exactly — never round up.

## Step 8 — Summary
Print ~6 lines: candidates researched, articles published (with slugs), articles dropped, build/gate status, merge SHA, email sent yes/no, next-week note. If a precondition or the circuit breaker stopped you, say exactly what unblocks the next run.

Rules: honest > voluminous; the domain's health beats this week's count. Respect every hard cap. Never fabricate data. Quality gate is sacred — when in doubt, drop the article.
