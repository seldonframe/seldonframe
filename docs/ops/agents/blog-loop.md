# blog-loop — daily long-form article from a YouTube founder story (headless agent prompt)

Runs DAILY. Invocation: `claude -p "$(cat docs/ops/agents/blog-loop.md)"` from the repo root (via `~/agents/run-agent.sh blog-loop`).

This is the **information-gain** article loop — the counterpart to the weekly `content-loop` (which writes keyword-first `/guides`). This loop writes ONE **long-form prose article** per day, built around an **original founder story mined from a YouTube transcript** — the non-commodity material that ranks on *information gain* and reads like a person wrote it, not AI slop. It is NOT a `/guides` entry and does NOT use the guide template.

**Draft-first by default (the never-lies safety).** A daily loop publishing *specific founder numbers* pulled from video is the single riskiest thing to auto-publish. So this loop opens a **PR and STOPS** — Max reviews and merges. Auto-merge is OFF until Max explicitly flips it (see Step 5). The verification gate (Step 4) is what makes even the draft trustworthy.

**Preconditions — if any is missing, STOP and report which one:**
1. `docs/strategy/youtube-sources.md` exists (the curated channel list) AND either the transcript script works OR `docs/strategy/youtube-transcripts/` has an unused human-dropped transcript.
2. `gh auth status` shows a valid token (to open the PR).
3. Repo root is a clean checkout of `origin/main`.

**Hard caps (never exceed):**
- **1 article per run.** Quality over quota — information gain is the constraint, not word count.
- Never publish an article whose core claims aren't traceable to a real transcript (Step 4 is sacred).
- No sub-agents.

---

## Step 1 — Source (information gain first, keyword second)
Invoke the **`information-gain` skill** (`.claude/skills/information-gain`):
1. Read `docs/strategy/youtube-sources.md` and pick a channel/cluster with fresh, specific founder stories.
2. Check `docs/strategy/youtube-transcripts/` FIRST — if a human dropped a transcript, use it (the first line is the source URL).
3. Otherwise fetch one: `node scripts/youtube-transcript.mjs "<video-url>" --json`.
4. Pick the ONE video with the richest original material (real numbers, a real decision, a real failure).

**If no real transcript is available today** (fetch blocked AND nothing in the drop folder): STOP. Send the recap email saying "no source today — no article" and exit 0. **Never invent a transcript or write a sourceless "founder story."** A dry day is a correct outcome, not a failure to paper over.

## Step 2 — Mine the non-commodity material
From the transcript, extract ONLY what exists nowhere else in writing — for each, keep the **exact transcript snippet** it came from (you'll need it in Step 4):
- Real numbers (revenue, MRR, ad spend, timelines, prices) in the speaker's framing.
- The specific decision / pivot / origin moment.
- The failure and what it cost. (Highest information gain — lead with it when it's strong.)
Skip anything generic. If the video yields nothing specific, go back to Step 1 for a different video (still within the 1-article cap — you publish at most one, but you may reject a dud source).

## Step 3 — Write the article (long-form PROSE, not a guide)
Write a genuine long-form article (~900–1,400 words) in `docs/strategy/blog-articles/YYYY-MM-DD-<slug>.md` — narrative prose with `##` subheads, NOT the typed guide format (no diagram/callout/FAQ scaffolding). Shape:
- A hook built on the most surprising real specific (the number or the failure).
- The story in the founder's actual arc, faithfully paraphrased, quoting sparingly and exactly.
- One honest tie-back to the reader's situation (what a service business / agency / builder takes from it) — earned, not shoehorned. A single natural internal link to the most relevant `/tools/...` or `/guides/...` page is fine; never more than two.
- **Embed the source video** (the URL, and the approximate `mm:ss` for the key claims). This is both the honesty contract and *why* it ranks — Google sees an original primary source.
- Front-matter block at the top: `title`, `dek` (a 2-sentence direct summary for GEO), `source_video`, `date`, `author: Max Houle`.
Voice: plain, specific, a person telling you what someone actually did. No "in today's fast-paced world" AI-preamble. No fabricated numbers, ever.

## Step 4 — Verification gate (sacred — never-lies)
This is the whole reason a daily YouTube loop is safe. For **every specific claim** in the article (each number, quote, named fact):
- Point to the exact transcript snippet that supports it. Put the snippet in the run manifest next to the claim.
- If a number in the draft doesn't match the transcript verbatim, FIX the draft to match the transcript (never the other way). A "$75K" that the transcript says is "$7.5K" is a lie — correct it.
- Drop any claim you cannot trace to a transcript line. If the article's CORE depends on an untraceable claim, drop the whole article and STOP (recap email says why).
Then a machine-spun check: read it aloud in your head — if it reads like generic AI filler rather than a specific story, it fails; rewrite or drop.

## Step 5 — Draft-first publish (PR, do NOT auto-merge)
The `/blog` surface is the data-driven article engine (mirrors `/guides`): a `BlogArticle` registry entry + one shared template + a `.md` twin, not hand-coded React. Instead of a bare markdown draft, this step publishes the article INTO the engine:
1. Write `packages/crm/src/lib/seo/blog/<slug>.ts` exporting `article: BlogArticle` (see `packages/crm/src/lib/seo/blog/types.ts`). `sourceVideo` is **REQUIRED** for loop articles (the information-gain citation) — never omit it here (the omission is only valid for hand-authored, non-video posts like the seed article).
2. Add the `.md` twin route folder `packages/crm/src/app/blog/<slug>.md/route.ts` (mirror an existing one, e.g. `why-original-content-wins-seo.md/route.ts`).
3. Wire the new article into `packages/crm/src/lib/seo/blog/index.ts` (import + add to `BLOG_ARTICLES`).
4. Commit all three files on `chore/blog-loop-YYYY-MM-DD`, push, `gh pr create` with a body that includes the source video + the Step-4 claim→snippet table. **STOP there — do not merge.** Max reviews the PR (a ~30-second glance at the claim→snippet table) and merges himself.
- **Auto-merge flip (Max only):** once Max trusts the loop, he can change this step to `gh pr merge <n> --merge` for hands-off publishing. Until this line is edited, the loop never merges itself.

## Step 6 — Recap email (Max's review channel)
Send a recap via Resend on EVERY run — published-draft, dry-day, or gate-stopped (silence is the only failure Max can't see). Read `RESEND_SENDING_KEY` from `packages/crm/.env.local` (if missing, skip + say so). POST https://api.resend.com/emails, `Authorization: Bearer <key>`:
- from: `SeldonFrame <welcome@seldonframe.com>` · to: `maximehoule100@gmail.com`
- subject: `blog-loop <date>: draft ready — <title>` (or `blog-loop <date>: no source today` / `GATE STOPPED`).
- html body, skimmable: (1) the source video (title, channel, link); (2) the **claim→transcript-snippet table** from Step 4 (this IS the trust signal — every number next to the words that back it); (3) the PR link to review + merge; (4) one line on what to check.
Keep it honest: the email must match the manifest exactly — never round a number the transcript didn't say.

## Step 7 — Summary
Print ~5 lines: source video (or "no source today"), the article title + slug, claims verified / dropped, PR link, email sent yes/no. If a dry day or the gate stopped you, say exactly what unblocks tomorrow's run (e.g. "drop a transcript in docs/strategy/youtube-transcripts/").

Rules: honest > voluminous; a real story beats a daily streak. No transcript → no article. The verification gate is sacred — when a number can't be traced, fix it to the transcript or drop it. Never fabricate a source, a quote, or a figure.
