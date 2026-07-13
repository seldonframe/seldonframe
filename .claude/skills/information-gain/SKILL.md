---
name: information-gain
description: The non-commodity sourcing step for any SEO/content loop — find niche YouTube videos, pull their transcripts, and mine ORIGINAL founder stories / real numbers / failures into cited source briefs that exist nowhere else in writing. Google's helpful-content system ranks information gain; this is how a loop produces it instead of commodity AI text. Invoke as a sub-step from x-post-engine, content-loop, or youtube-engine (or standalone with a topic).
---

# information-gain — mine original source material, never commodity

## Why this exists

Google is burying commodity content: AI articles that restate what every other
page already says. What ranks now is **information gain** — facts, numbers, and
stories that exist *nowhere else in writing*. The cheapest large supply of that
raw material is **spoken**: founder interviews, podcasts, and case-study videos
on YouTube where someone says "we hit $75K/month" or "here's the exact mistake
that cost us 6 months" — and no one has ever written it down.

This skill turns that spoken material into **cited source briefs** a content
loop writes from. The article becomes an *original source* (Google sees novel
information), not the 400th rewrite of a listicle.

**This is a SOURCING step, not a publishing step.** It returns briefs; the
calling loop (x-post-engine / content-loop / youtube-engine) writes and
publishes. Drafts only — Max makes the angle call.

## The one hard rule (never-lies)

Everything here is worthless the moment it fabricates. So:

- **Never invent a transcript, a quote, a number, or a story.** If the transcript
  can't be fetched, you have NO brief for that video — say so, move on.
- **Every brief cites its source video** (title + channel + URL + the
  approximate spoken timestamp when you can). The published article must embed
  or link the original video — this is both the honesty contract and *why* it
  ranks (Google sees the primary source).
- **Only claim what was actually said.** "$75K/month" goes in a brief only if the
  speaker said it. Paraphrase faithfully; quote sparingly and exactly.
- A brief with a number you can't point to a transcript line for is a **defect**,
  not a draft. Drop it.

## Inputs

- A **topic / keyword cluster** (from the calling loop — e.g. "SaaS mastermind",
  "AI receptionist for clinics", "speed to lead").
- Optionally, a **channel or creator list** in the niche (better yield than open
  search — recurring founder-interview channels are goldmines).

## The loop (per topic)

### 1. Find candidate videos
Search YouTube for the topic + intent terms ("interview", "how I built",
"$ /month", "case study", "what I'd do differently"). Prefer:
- founder interviews / solo build-in-public retrospectives (dense with real
  numbers + failures),
- videos with **specific figures in the title or first minute**,
- recent (fresher information gain) but evergreen stories are fine.

Collect 3–6 URLs per topic. Use `WebSearch` (site:youtube.com) or a known
channel list. Record `{ title, channel, url }` for each.

### 2. Pull the transcript
Run the helper (fail-soft, honest):

```
node scripts/youtube-transcript.mjs "<url>" --json
```

- **Exit 0 + JSON** → you have `{ videoId, url, chars, transcript }`. Use it.
- **Exit 1 (`[no-transcript]`)** → captions are blocked/disabled for that video.
  Either skip it, or take the **manual route the script prints**: paste the URL
  into <https://notegpt.io/youtube-transcript-generator>, copy the transcript,
  and save it next to the working file. Do NOT proceed without a real transcript.

(The helper reuses the same programmatic caption source as the Soul-wiki
ingester and adds honest failure signaling — a service error body is treated as
*no transcript*, never as content.)

### 3. Mine the non-commodity material
Read the transcript and extract ONLY what's original and load-bearing:
- **Real numbers** — revenue, MRR, conversion %, headcount, timelines, ad spend,
  prices. The exact figure, in the speaker's framing.
- **Founder stories** — the specific decision, the pivot, the origin moment.
- **Failures** — what broke, what it cost, what they'd do differently. (Failure
  stories are the rarest-in-writing and the highest information gain.)
- **Contrarian specifics** — a tactic that contradicts the generic advice.

Skip anything generic ("focus on your customer") — that's commodity; it adds no
gain. If a video yields nothing specific, it yields no brief. That's fine.

### 4. Emit source briefs
Return, per usable video, a brief in this shape (the calling loop consumes it):

```
### Source brief — <video title> (<channel>)
- URL: <youtube url>  (cite this in the article; embed the video)
- Extracted facts (each traceable to the transcript):
  - <real number / story / failure, faithfully paraphrased> [~mm:ss if known]
  - ...
- Best exact quote (≤ 25 words, verbatim): "<quote>" — <speaker>
- Angle: <one line — how this becomes a non-commodity section/article>
```

If zero videos yielded briefs for a topic, return `NO BRIEFS — <topic>: no
transcript-backed original material found` so the loop doesn't invent filler.

## How the calling loops use this

- **x-post-engine** (long-form X articles): run this between Inputs and Produce.
  Weave 1–2 briefs into the article as an original "here's what a founder
  actually did" section; embed the video; the receipts are the transcript facts,
  not `[FILL]` placeholders.
- **content-loop** (guides): run after keyword research. Each brief becomes a
  `GuideSource` (`{ label, url }` with the video URL) plus an original passage.
  This is the "information gain" that separates a guide from the listicles it
  competes with.
- **youtube-engine** (weekly pack): extend the MINE step — mine transcripts of
  *this week's* niche videos for founder stories that match the real work, so
  the pack's ideas carry original hooks.

## SERP check first (borrowed from the playbook)

Before writing to a keyword, glance at the live SERP. If every result is a
listicle (Feedspot / Goodpods / "top 10" roundups), do BOTH: publish your own
roundup **and** mine a founder story none of them have. The roundup wins the
head term; the information-gain story wins the long tail and the AI-Overview
citation. Don't out-commodity the commodity — out-*original* it.

## Definition of done

- N cited source briefs (or an explicit `NO BRIEFS` line), each fact traceable
  to a real transcript, each video cited. Zero fabricated numbers. The calling
  loop takes it from here.
