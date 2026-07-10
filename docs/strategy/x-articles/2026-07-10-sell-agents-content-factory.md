# X Article draft — 2026-07-10 (3 of 3)
Format: build log at essay length · Keyword: sell AI agents
Target: X Article (Premium+) · ~1,600 words

---

# Everyone writes content for people BUYING AI agents. So we shipped 32 guides for the people selling them.

### One planning session, seven agent waves, two days — and the moment my reviewer agent accused my writer agent of fabricating a statistic it had actually verified.

Here's a gap hiding in plain sight: search for advice on *buying* AI automation and you'll drown in it. Search for how to *sell* an AI agent — how to price it, where to list it, what marketplace fees actually run, how to white-label one build across ten clients — and it goes quiet fast.

We noticed because we audited our own SEO estate this week: 300+ pages talking to buyers, approximately zero talking to the builders who create supply. For a marketplace, that's a store with a beautiful front door and no vendor entrance.

So we spent two days fixing it. 32 guides, live, every claim traced to a primary source. This is how the factory ran, including the part where quality control turned on itself.

## The plan came first, and it was the slow part

The tempting move was "generate 40 articles, publish, done." That's how you get the gray sludge choking search results — and sludge would be fatal for us specifically, because our positioning is that we never lie to you. AI-generated filler under a never-lies banner isn't just bad content, it's a contradiction that kills the brand.

So the human hours went into a plan of record: 40 articles across 8 waves, each wave a coherent cluster — pricing, marketplaces and fees, white-labeling, client acquisition for agent builders. Every article got an intent statement (what the searcher actually needs), a keyword, and a source requirement: numbers come from primary sources or they get cut.

One wave got frozen before it started. Wave 8 is case studies, and we have opinions but only a handful of closed deals. The rule we wrote into the plan: **case studies wait until ten real closes exist.** No composite customers, no "imagine a plumber named Dave." The gap on the sitemap is the receipt that the others aren't invented.

## Then the waves ran

Wave 1: six guides, one pull request, reviewed and merged. Then waves 2 through 7 in quick succession — write, review, revise, merge, next. Each wave was drafted by a writer agent, checked by an independent reviewer agent (never the same one — the maker never grades its own homework), then spot-checked by me at the merge gate.

The rhythm is the point. Not "AI wrote my blog" — a production line with stations: plan (human) → draft (agent) → adversarial review (different agent) → merge call (human). My actual hands-on time per wave was minutes, spent on judgment: does this cluster hold together, is this claim sourced, does the tone drift.

By the end: 32 guides live, IndexNow pinged so the search engines know, and a queue file that tells next week's session exactly where the line stopped.

## The reviewer that cried wolf

Best moment of the build, and I'm still thinking about it.

Mid-wave, the reviewer agent flagged a guide with a BLOCKING verdict: "97% of consumers read reviews, 85% influenced by positive ones, attributed to a 2026 survey — classic hallucination fingerprint." Textbook catch. Suspiciously round numbers, convenient year, exactly the shape of stat LLMs invent.

Except I opened the primary source, and every number was on the page. Literally, including the year. The writer agent had fetched the source live *before* citing it. The reviewer — pattern-matching on what fabricated stats usually look like — was the one guessing.

Sit with that: the fabrication detector fabricated a fabrication.

I kept the reviewer. In the same batch it caught two real problems, and an over-suspicious checker beats a credulous one every day of the week. But the incident wrote a new rule into our build system: **verify the verifier before acting on its verdict.** When a reviewer claims a source problem, the merge gate checks the source, not the reviewer's confidence. Trust in either direction — believing the writer OR the reviewer on faith — is the same bug wearing different clothes.

## What the two days cost and bought

Bought: a supply-side moat that compounds. Guides for sellers attract sellers; sellers stock the marketplace; a stocked marketplace gives buyers a reason to arrive. Content that recruits vendors is distribution infrastructure, not blogging.

Cost: honestly, mostly attention. The agent time is cheap. The scarce resource was the judgment at the gates — plan approval, merge calls, the reviewer incident. That's the founder time worth protecting, and the factory design (agents do volume, human does verdicts) is what keeps it to hours instead of weeks.

## What I don't know yet, honestly

**Zero ranking data exists.** The guides went live this week; indexing takes weeks, ranking takes months. "32 guides live" is a shipping receipt, not a traffic receipt. The GSC graph will tell the real story and I'll post it either way — that's the monthly receipt series.

**The gap I can't fill with agents:** Wave 8 stays empty until ten real closes happen, and closes come from selling, not writing. The content factory is idle capacity against my hardest bottleneck, which is the founder actually doing sales. The machine ships guides; it can't ship proof.

**CI is red and it isn't the waves' fault** — a pre-existing date-dependent test in an unrelated corner failed the same day. Flagging it because "everything's green" would be a small lie, and small lies are how the big ones get in.

## What's next

The queue file says Wave 8 is gated, so next is the unglamorous part: close ten deals, then write the case studies that are currently forbidden. The factory did its job. Now the founder has to do his.

---

*The guides are free at seldonframe.com/guides — the "Building & selling AI agents" cluster. If you build agents for clients, that's your section of the store.*

---

## FORMATTING MAP (X Article editor)

**Cover image:** GENERATED — a "32 guides · 7 waves · 2 days" stat card (make with
scripts/x-creative-shot.mjs when posting; HTML template pattern in
docs/strategy/x-creatives/2026-07-10/draft2-vault-loop-card.html).

**Bold:** "a store with a beautiful front door and no vendor entrance" · "case
studies wait until ten real closes exist" · "the maker never grades its own
homework" · "the fabrication detector fabricated a fabrication" · "verify the
verifier before acting on its verdict" · "The machine ships guides; it can't
ship proof."

**Italic:** *buying* / *sell* (opening paragraph contrast) · *before* ("fetched the
source live *before* citing it") · the closing seldonframe.com paragraph (signature note).

**Inline images:**
1. CAPTURE — seldonframe.com/guides scrolled to the "Building & selling AI agents"
   cluster, heading + article list visible, crop to cluster. After "Then the waves ran".
2. CAPTURE — the reviewer's actual BLOCKING verdict text from the session/PR review
   (crop to the verdict block, blur nothing else). Inside "The reviewer that cried wolf".
3. CAPTURE — the queue file showing Wave 8 marked GATED. In the honest-limits section.

## SUPPORTING TWEETS (quote-reposts of this article across the week)

**T1 — number hook (day 2, morning):**
```
𝟯𝟮 𝗴𝘂𝗶𝗱𝗲𝘀 in two days: how to price an AI agent, where to sell it, what marketplace fees actually run.

Everyone writes for the people buying agents. Nobody writes for the people selling them.

The whole build, including the QA incident ↓
```

**T2 — scar (day 4, evening):**
```
My reviewer agent flagged my writer agent for fabricating a statistic. BLOCKING verdict, "classic hallucination fingerprint."

I checked the primary source. Every number was on the page.

The fabrication detector fabricated a fabrication. Full story in the article ↓
```

**T3 — contrarian (day 6, midday):**
```
We froze an entire content wave on purpose.

Case studies don't get written until 10 real closes exist. No composite customers. No imaginary plumber named Dave.

The empty slot on the sitemap is the receipt that the other 32 aren't invented.
```
