---
name: youtube-video-kit
description: Produce the complete publishing kit for one keyword-targeted YouTube video (script, thumbnail, title/description/chapters/pinned comment) from its matching SEO page, and wire the videoId back into the page after publish. Invoke with a /best or /tools slug, or a keyword.
---

# youtube-video-kit — one keyword, one video, one kit

Max records the face; everything else is produced here. The video targets the SAME
keyword as an existing page (usually a `/best/<slug>` page) so the two boost each
other: the page embeds the video (videoId seam already live in
`lib/seo/best-pages.ts` + `components/seo/lite-youtube.tsx` + VideoObject JSON-LD),
and the video description links the page.

## Inputs
- A slug (e.g. `crm-for-small-business`) or keyword. Resolve the matching page +
  registry data (`best-pages.ts` contenders / `competitor-pricing.ts` numbers).

## Produce (write everything to `docs/strategy/video-kits/<slug>/`)

1. **script.md** — 6-9 minutes spoken (~950-1400 words), structured:
   - COLD OPEN (first 15s): the pain number, not the topic ("A missed call costs a
     plumber about $120. Here's the CRM setup that stops that.")
   - The honest framing sentence early: "I build one of these tools, so I'm biased —
     I'll tell you exactly when the others win." (never-lies ON camera too)
   - One chapter per contender, EXACTLY the facts from the registry (same numbers,
     same hedges — the video must never contradict the page), each with the honest
     watchOut.
   - SeldonFrame's chapter states the flat price + the free build-before-signup.
   - CLOSE: "full written breakdown + the calculator is linked below."
   - Short sentences, spoken register, grade-6. Mark [B-ROLL: show <page URL>]
     cues where screen-recording the live page fits.
2. **thumbnail.png** — pull from the live OG endpoint (it IS a thumbnail generator):
   `https://www.seldonframe.com/api/og?kind=best&title=...&aud=...&n=...`
   (or kind=tool for calculator videos). Download it; if a stronger hook exists,
   note alternate param text. 1200x630 upscales fine for YT.
3. **metadata.md** —
   - 3 title options, keyword-FIRST ("Best CRM for Small Business in 2026 —
     honest ranking (I build one)"), ≤60 chars preferred.
   - Description: keyword in the first sentence, then the page link, the matching
     calculator link, timestamp chapters, and the standing disclosure line.
   - Chapters (from the script sections, MM:SS placeholders).
   - Pinned comment draft: the one-line honest summary + page link.
   - 10-15 tags.
4. **shorts.md** — 3 clip specs (start/end cue by script section, the hook line,
   vertical caption text) for the repurpose pass. No native shorts content.

## After Max publishes
Given the videoId: set `videoId` (+ `videoUploadDate` YYYY-MM-DD) on the matching
`BEST_PAGES` entry in `lib/seo/best-pages.ts`, run the seo specs, commit, push,
merge per the house merge method. The page then renders the lite embed + VideoObject
schema automatically.

## Rules
- Facts come ONLY from the registries — if the script needs a number the registry
  lacks, flag it, don't invent it.
- The disclosure line is non-negotiable and appears in script + description.
- One video = one keyword = one kit dir. Don't bundle.
