---
name: x-post-engine
description: Mine the current work session (or a named event) into 2-3 draft X posts using the 6 founder-content formats, keyword-first. Drafts only — Max makes the angle call and posts. Invoke at the end of a build session or with a topic.
---

# x-post-engine — session receipts → post drafts

The playbook (docs/strategy/founder-content — the 6 formats): build log ·
documented failure · value post · receipt · contrast hook · milestone chapter.
Formats are commodity; the INVENTORY is the moat. This skill's job is extracting
the inventory from real work and drafting; **the angle call stays with Max** — that
is the one non-delegable step. Never post anything.

## Inputs
The current session's events, or a named event/topic. Best sources: what shipped,
what broke, what a number proves, what an agent did that humans find surprising.

Before drafting, read the **Patterns** section of `docs/strategy/x-vault.md` if it
exists (only Patterns — the corpus below it is raw evidence, skip it). Patterns are
market-validated structure (hooks, pacing, number use); apply them to the framing,
never let them override Max's voice or the format rules below.

## Produce (append to `docs/strategy/x-drafts/YYYY-MM-DD.md`)

2-3 drafts, each tagged with its format + the target keyword. Rules per draft:

1. **Keyword-first when the post has one** (the GSC hack: X posts rank in Google —
   "GoHighLevel pricing —" as the opening words, not buried). Not every post has a
   keyword; build-logs and scars often don't. Never force it.
2. **One number with context beats three numbers.** "113 SEO pages in one day" is
   noise; "I typed 'build #1-8' and twelve AI agents shipped 113 pages to
   production before dinner" is a post.
3. **Formats guide:**
   - Build log: what happened today, present tense, unpolished, ends with what's
     next (people invest in unfinished things).
   - Scar: the failure with the embarrassing specifics kept in; the fix in one line
     at the end; never explain the lesson — let the reader get it.
   - Value post: steps + the WHY behind each step (advice without reasoning is a
     list); specific beats general ("how I got X" > "how to X").
   - Receipt: the screenshot IS the post — one line of text max. GSC/Bing graphs,
     revenue, the OG-card images from the calculators all qualify. Same graph
     monthly = a series people follow.
   - Contrast hook: two facts side by side, no explanation ("Solo founder. 12 AI
     agents. 113 pages shipped today."), reader resolves the gap.
   - Milestone: only with history to quote — quote the old post, add the new
     number. Flag candidates for later, don't force early.
4. **Attach the visual** when one exists — every draft gets a CREATIVE block,
   one of two types (never blur the line between them):
   - **GENERATED** — concept cards the loop renders itself (quote card, stat
     card, loop diagram): write a dark-themed HTML card at exactly 1200x675 in
     `docs/strategy/x-creatives/YYYY-MM-DD/<slug>.html`, render it (browser
     screenshot of the card region), save the image next to it. NEVER generate
     anything that imitates an authentic capture — no fake terminal windows,
     no fake analytics UIs, no fabricated numbers. Fabricated receipts break
     never-lies; that rule outranks engagement.
   - **CAPTURE** — real receipts only Max can take (terminal output, GSC/Bing
     graphs, Stripe, the product). Spec it exactly: which app/window, which
     content must be visible, what to crop, light/dark, and WHERE it goes
     (image 1 / image 2 / cover). "Plainness is the receipt" — no beautifying.
5. **Paste-ready block** — after each draft, a `PASTE-READY` fenced block Max
   can copy straight into X: Unicode sans-serif bold (𝗯𝗼𝗹𝗱) applied to AT MOST
   the hook line or the one key number — never whole sentences (screen readers
   read Unicode bold as garbage; sparing use is both taste and accessibility).
   NEVER bold the keyword line — Unicode chars aren't ASCII, bolding the
   keyword breaks its Google indexing. No underline in posts (renders
   unreliably). Line breaks exactly as they should post.
6. Plain words. No hashtags. No "excited to announce". No em-dash chains — X
   posts read spoken.
7. End the file with: "Pick one, adjust the angle, post. Repost winners in 6-8
   weeks with updated numbers; quote-tweet anything that runs."

## Long-form mode (X Article / blog, 1,500-2,000 words)
When invoked with "article" (or by the weekly loop), ALSO produce ONE long-form
draft in `docs/strategy/x-articles/YYYY-MM-DD-<slug>.md`. Rules:

1. **One article = one build with its receipts.** Never a listicle of tips; the
   piece walks through something real we shipped, numbers kept in, failures kept
   in. The short-post formats scale up: a scar or value post at essay length.
2. **Structure:** hook (a number or a contradiction, first two sentences) → the
   problem as lived → the build in chronological order → what the numbers say →
   honest limits (what didn't work / what we don't know yet) → what's next.
   The honest-limits section is mandatory — it's the never-lies positioning in
   long form and the section readers quote.
3. Vault Patterns apply to the hook, the section openers, and every number
   (one number with context per point). Plain words, spoken rhythm, short
   paragraphs (X Articles render wide — 2-3 sentences per paragraph max).
4. **Keyword-first title when one exists** (X Articles rank in Google like
   posts do); subtitle carries the contrast.
5. End with one line pointing at SeldonFrame only if the article earned it —
   the build IS the pitch; never bolt on a CTA.
6. Word count 1,500-2,000. Under 1,200 = make it a post instead; over 2,400 =
   cut the weakest section. Drafts only — Max posts manually (X Articles need
   Premium+ and his editorial pass).
7. **Formatting map + creatives:** X Articles have a real rich-text editor, so
   no Unicode tricks — end the article file with a FORMATTING MAP (exact lines
   to bold / italicize / underline in the editor, cover image, and where each
   inline image goes) plus CREATIVE blocks per the post rules above (GENERATED
   cards rendered to docs/strategy/x-creatives/, CAPTURE specs for receipts).

## Cadence memory
Track (top of the drafts file) which formats ran recently — rotate; the receipt
series (GSC/Bing graph) is monthly, anchored to real data only. Articles are
weekly at most — skip the week if no build earned one; a forced article reads
forced.
