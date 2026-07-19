# Video 2 — "The 1-Person Agency Article, Speedrun" (screen-share build-along)

**Format:** live screen share + your webcam PiP (bottom-left, small), one continuous take
feel with a visible timer. YouTube-first (~8 min) + a 2:30 X cut of segments 1–3.
**Thesis:** the viral article is right — but its delivery stack is ~9 tools and weeks of
plumbing. You run the article's entire delivery playbook live, in one platform, without
leaving Claude Code (SF is an MCP — the article's own OS stays the OS).
**Device:** on-screen chapter cards that tick off the ARTICLE's sections as you go
("LEVEL 1: WEBSITES ✓"). The article is the checklist; SF is the speedrun.

---

## Hook (0:00–0:45) — face on camera or article on screen

> "This article taught a few million people how to run a one-person agency with Claude
> Code. It's genuinely good — the playbook works. But look at the stack it hands you:
> [scroll the article's tool list fast] a website skill, trigger.dev, Composio, MongoDB,
> Vercel, magic-link auth, a dashboard you build yourself… that's weeks before your first
> client sees anything.
>
> I'm going to run the article's entire delivery playbook — websites, the four automations,
> the client dashboard, the whole thing — live, in one open-source platform, without
> leaving Claude Code. Timer starts now."

Start a visible stopwatch overlay. It stays for the whole video.

## Segment 1 — LEVEL 1: Websites (0:45–2:15)

**Do:** in Claude Code, via the SeldonFrame MCP: type the sentence — "a front office for
[niche business] in [city]" → workspace builds → open the live subdomain.
**Say:** the article's own quality bar, ticked live: "Bold CTA above the fold — there.
Click-to-call — there. Contact form wired to a CRM — not to an inbox, to an actual CRM,
watch. Mobile — [toggle device view]. The article says this is a $500 first sale and
$3–10k with proof. It just took [timer check]."
**Card:** LEVEL 1: WEBSITES ✓ (article: 10 min on localhost → here: live + hosted + CRM-wired)

## Segment 2 — The Demo-First Close (2:15–3:30)

**Do:** the article's "smart sell" play, for real: pick a real local business with a dated
site → paste their URL → SF rebuilds with THEIR real photos + logo (harvester) → before/after
side by side on screen.
**Say:** "The article's best sales move: rebuild their homepage before they ever answer you,
then send the link. Notice what I didn't do — deploy anything, buy hosting, or connect a
domain. The demo IS already live on a subdomain. This link goes in the cold email as the
tangible asset the article talks about. Keep Instantly and Apollo for sending — this is the
payload." ← the honest boundary, stated as a strength.
**Card:** THE SMART SELL ✓

## Segment 3 — LEVEL 2: The Four Automations (3:30–5:00)

**Do:** open /automations. The article says "it's the same 4 automations in every niche:
instant follow-up, review collection, reminders, dead-lead reactivation." Show the template
gallery: Speed-to-Lead, Review Requester, Appointment Confirm, Win-Back — plus Missed-Call
Text Back. Toggle them on. Then show the booking cadence = the article's show-up guilt
cadence (confirmations + reminders) already wired to the calendar.
**Say:** "The article tells you to build these once, skill-ify them, and deploy per niche
forever. Look at the names. They're already here. The article's $1–5k setup + $200–500 a
month retainer? This toggle. That toggle."
**Card:** LEVEL 2: AUTOMATIONS ✓ (this is the money segment — slow down, let names be read)

## Segment 4 — LEVEL 3: The Full AI System (5:00–6:30)

**Do:** the client-facing layer: portal login (magic link), the dashboard the client sees,
agent conversations with receipts (executions/activity — the article's "client sees
executions, hours saved"), the website chatbot answering grounded questions, escalation.
White-label: your agency's name on it, not ours.
**Say:** "Level 3 in the article is a $10–20k build: Next.js, Mongo, auth, RAG inbox,
analytics. Here's the part that matters — the client logs into a product with your brand
on it, and every AI answer ships with receipts. The article's right that the dashboard is
what makes a retainer feel like software. You just didn't have to build the software."
**Card:** LEVEL 3: FULL AI SYSTEM ✓

## Segment 5 — "Skill-ify it" → clone (6:30–7:00)

**Do:** the article's biggest idea (BUILD ONCE, DELIVER FOREVER): clone/template the
workspace for a second niche in ~30 seconds.
**Say:** "The article's core principle — build once, deliver forever. Watch: same system,
next niche, thirty seconds." [timer check]
**Card:** BUILD ONCE. DELIVER FOREVER ✓

## Segment 6 — The money math (7:00–7:45)

**Do:** open the agency margin calculator (/tools/agency-margin-calculator) or a simple
on-screen card.
**Say:** "The article's 5x rule: give clients 5x the value of what they pay. Here's your
side of the math: your whole platform cost is $99 a month flat — not per client, and the AI
runs on your own keys at wholesale, so a $300-a-month client is margin, not meter food.
Ten clients at the article's own retainer numbers and you're at its $2–3k-a-month
'stay alive' milestone with one tool bill."
**Card:** THE 5X RULE ✓

## Close (7:45–8:15) — face on camera

> "The article ends with 'get good before you get rich' — and that's still true. Nothing
> here closes a client for you; you still do the outreach, the calls, the reps. This just
> deletes the three weeks of plumbing between you and your first demo. It's open source,
> it's free to start, link below. Total time: [timer]."

Stop the timer on screen. Hard cut.

---

## Claims guards (never-lies)

- NEVER say SF replaces the article's outreach stack (Instantly/Apollo/verifier) or
  freelance profiles — say "everything after the reply" / "the payload, not the sender."
- The 4-automations match is real (template names on screen) — let the UI make the claim.
- Retainer/ticket figures ($500 site, $200–500/mo, $2–15k jobs) are THE ARTICLE'S numbers —
  always attribute ("the article prices this at…"), never state as SF results.
- No "$40k MRR" — that's the author's claim about themselves.
- If the live build stutters, timelapse it and label it "sped up ×4" on screen. Never cut
  to a pre-built workspace and present it as the live one.

## Prep checklist (do the day before)

1. Dry-run the full flow twice; note real timings (the timer is a promise — know it).
2. Pick the demo niche + the real business for segment 2; verify harvester pulls their
   photos cleanly. Have a second business as backup.
3. Fresh test workspace deleted/reset so the build starts cold on camera.
4. Verify on prod: MCP build path, /automations templates visible, portal magic-link,
   clone flow, margin calculator route. (Any of these red = reorder or cut the segment.)
5. Clean OS: hide bookmarks bar, notifications off, 1920×1080 recording at 4K if possible,
   font size bumped in terminal, personal email/accounts out of frame (the dresslikeag
   lesson — check every sidebar before hitting record).
6. OBS: screen + webcam PiP bottom-left + mic. Record system audio muted (no notification
   dings). Timer overlay (OBS stopwatch plugin or phone in frame corner).

## Packaging

- **YouTube title:** "I speedran the viral '1-person AI agency' playbook in one tool
  (live, timer on)" · thumbnail: article headline screenshot + stopwatch + "9 tools → 1".
- **X cut (2:30):** hook + segment 1 + segment 3 (the four-automations reveal is the
  strongest 30 seconds — end the cut there) + "full run on YouTube."
- Quote/link the article in the post — it's the audience's shared context and the author
  engaging is upside. Frame as tribute-plus-shortcut, never a takedown.
- End screen reuses the Remotion end card (Type a sentence. Ship a business.) — export a
  5s render from the launch-video project for a consistent outro across all videos.
