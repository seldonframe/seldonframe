# X Vault — evidence corpus for the build-in-public engine

Feeds `x-post-engine` (the skill reads ONLY the Patterns section below when
drafting). Corpus = raw evidence, mined for STRUCTURE never voice — Max's voice
+ real build receipts stay the differentiator. Weekly distill ritual: re-derive
Patterns from Corpus + Performance; prune patterns that stop earning.

How entries arrive: `node scripts/x-bookmarks-pull.mjs` pulls Max's X bookmarks
via the API and appends them to Corpus as UNDISTILLED. The distill pass turns
each into a one-line structural note (hook mechanic, format, why it worked) and
tags it. Bookmark on X as you scroll = zero-cost capture.

---

## Patterns (what x-post-engine reads — keep under ~20 lines, distilled only)

<!-- Re-derived weekly from Corpus + Performance. One line per pattern:
     PATTERN — evidence (corpus ids / own-post ids). Delete patterns whose
     evidence goes stale. Nothing speculative lands here. -->

1. **One concrete number in the first line** — money or scale before any explanation ("We raised $136M to kill Slack" 2.9M views; "$750,000 a year" 37k). Number + named enemy is the strongest opener in the corpus.
2. **Negation triple** sharpens what a thing IS ("Not prompt engineers. Not fine-tuners. Not RAG specialists." / "No designer. No agency. No brief.") — two corpus posts >1k likes use it.
3. **Protagonist story**: unlikely specific person + mundane tool + fast receipt ("18-year-old found a 4.9-star roofing company with no website… 2 minutes later, a complete brief" — 7.5M views, corpus best). SF's client-build stories fit this exactly.
4. **Replace-the-tool frame**: "how I run X with [AI] instead of paying for [incumbent]" (@shannholmberg SEO-tool post) — the X-native twin of the GHL-intercept SEO engine.
5. **Borrowed authority in line 1** (YC playbook, Karpathy's CLAUDE.md, Anthropic salaries) + an artifact the reader can take.
6. **Arithmetic-of-the-model**: spell the unit math out loud ("$3k/mo × 3 sales = $9k MRR compounding") — replies argue the math, arguing = distribution.
7. **Priced list** of systems ("Missed call text-back: $2k · Speed-to-lead: $2k · Appointment setter: $4k") — maps 1:1 onto SF's SMB agent catalog; a natural recurring format for us.
8. **Pain → mechanism swap → number** ("30 demos a day nearly killed me → one group webinar → 40 people in 30 minutes") — the scar format with a receipt at the end.
9. **The visual IS the post**: most 1M+ view bookmarks are a video/screenshot with one line of text. Confirms the receipt format; invest in the asset, not the caption.
10. **Self-surprise build log**: "I thought this must be hard — vibecoded in 15 minutes" + a runnable command (@levelsio) — credibility through the artifact, not the claim.
11. **Anti-pattern for us**: income-porn persona posts ("girl makes $9,000/mo by the pool") pull millions of views but poison trust. SF sells *never-lies* — keep the specificity, skip the get-rich frame.

## Performance (our own posts — the compounding half of the loop)

<!-- One row per posted draft: date · format · keyword? · link · impressions @1wk
     · replies · what the numbers say. Update weekly; feed conclusions to Patterns. -->

| date | format | post | impressions @1wk | replies | note |
|------|--------|------|------------------|---------|------|
| 2026-05-13 | contrast (reply) | [opensource alt to GHL reply](https://x.com/themaxthule/status/2054541238351626447) | 89 | 0 | baseline: reply-guy posts don't carry; needs own thread + visual |

## Corpus (raw evidence — append-only, newest first)

<!-- Entry shape:
### YYYY-MM-DD · @author · [link]
> full text (or the hook + shape if long)
- metrics: (as visible: likes/reposts/replies/views)
- format: build log · scar · value · receipt · contrast · milestone · other
- why it worked: ONE structural line (hook mechanic, pacing, number use)
- status: UNDISTILLED | distilled
-->

### 2026-07-09 · @humzaakhalid · https://x.com/humzaakhalid/status/2075154136321167548
> https://t.co/SKZ5JXy2Z2
- metrics: 122 likes · 22 reposts · 12 replies · 115651 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-03-22 · @zarazhangrui · https://x.com/zarazhangrui/status/2035758067116359902
> https://t.co/JRzfzDanIw
- metrics: 943 likes · 71 reposts · 100 replies · 218381 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-07-08 · @tanmaigo · https://x.com/tanmaigo/status/2074909177449947198
> We raised $136M to kill Slack.
> 
> Introducing PromptQL: The first AI version of Slack.
> 
> Here’s how it works: https://t.co/PakqoBog3o
- metrics: 4074 likes · 434 reposts · 734 replies · 2880578 views
- format: contrast hook
- why it worked: raise-number + named enemy in seven words; 734 replies = people arguing the claim
- status: distilled

### 2025-08-05 · @levelsio · https://x.com/levelsio/status/1952861177731793324
> I thought this must be hard to build
> 
> LLM-over-DNS
> 
> A real DNS server that you can send LLM queries and it replies
> 
> Vibecoded on my server again 15 minutes!
> 
> So now you can open your terminal and type: 
> 
> dig @llm.pieter.com -p 9000 "what is the meaning of life" TXT +short
> 
> And it https://t.co/85wBnQXtMk https://t.co/rfcF22ZpFd
- metrics: 2127 likes · 110 reposts · 109 replies · 581665 views
- format: build log
- why it worked: self-surprise ("I thought this must be hard") + 15-min receipt + a command the reader can run right now
- status: distilled

### 2026-06-29 · @0xMassi · https://x.com/0xMassi/status/2071692848542703770
> .@levelsio I code from my phone now because of your post. Wrapped the whole setup into one command.
> 
> pocketdev:
> • Hetzner box running your AI CLI (Claude Code, Codex, Cursor, Gemini…) on your own subscription
> • Tailscale-only, empty Hetzner firewall, nothing inbound
> • code https://t.co/sMDQn9Pkgd
- metrics: 559 likes · 20 reposts · 52 replies · 69320 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-07-08 · @shannholmberg · https://x.com/shannholmberg/status/2074897027746742671
> how I run my SEO vertical with Fable 5, instead of paying for an SEO tool
> 
> Fable 5 is very capable, it plans the entire funnel, then hands the build to sonnet, opus and GPT sub agents
> 
> an SEO tool largely sells you keyword data, SERP scraping, and content gap analysis, then hands https://t.co/rElvXNs4Ij
- metrics: 90 likes · 3 reposts · 11 replies · 4592 views
- format: value post
- why it worked: replace-the-tool frame ("with Fable 5, instead of paying for an SEO tool") — names the incumbent category, then shows the workflow
- status: distilled

### 2026-07-08 · @cyrilXBT · https://x.com/cyrilXBT/status/2074669139730284735
> https://t.co/XiwUABYZE1
- metrics: 426 likes · 68 reposts · 22 replies · 655813 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-07-06 · @EXM7777 · https://x.com/EXM7777/status/2074158459545854232
> https://t.co/BNuZ1GirbS
- metrics: 2011 likes · 164 reposts · 55 replies · 672853 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-07-06 · @Zephyr_hg · https://x.com/Zephyr_hg/status/2074109356300521852
> Jacob Bank, former Google product lead: 
> 
> "I built up this team of 40 AI marketing agents to work with me. I'm the only marketing person."
> 
> In a 15-minute talk, he shows what one person now runs with nobody on payroll.
> 
> Forty agents. One human. His AI bill is $500 a month, https://t.co/Bh7S6uKsbt https://t.co/bBBXVeTAB0
- metrics: 216 likes · 28 reposts · 6 replies · 28761 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-07-06 · @RoundtableSpace · https://x.com/RoundtableSpace/status/2074127475442069698
> 16 MINUTES TO LEARN THE 9-DAY YOUTUBE MONETIZATION PLAYBOOK.
> 
> SAVE IT FOR LATER.
> 
>  https://t.co/C1bohCHQHX
- metrics: 217 likes · 26 reposts · 8 replies · 51781 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-07-07 · @Jasperli0122 · https://x.com/Jasperli0122/status/2074322267224539518
> Every founder should know how to use Reddit. It's the fastest, cheapest way to validate a startup idea.
> 
> Because the vertical communities are already there, already talking. 
> 
> Here is all u need: Reddit Operating Playbook 2026 https://t.co/I4Pa2ZaPk0
- metrics: 100 likes · 10 reposts · 12 replies · 11489 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-07-06 · @pirroh · https://x.com/pirroh/status/2074118901143679414
> https://t.co/3BAeQ795hm
- metrics: 1197 likes · 121 reposts · 27 replies · 869497 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-07-06 · @cyrilXBT · https://x.com/cyrilXBT/status/2074006684952141913
> this is f*cking gold
> 
> Andrej Karpathy came over to Anthropic just five weeks back.
> 
> Someone on his team pulled up the actual Claude.md they run day to day and showed it to me.
> 
> I plugged it straight into my workflow. Claude’s next reply wasn’t just improved.
> 
> It felt like a https://t.co/zbVXbYAgxw https://t.co/hkmnyM0K8q
- metrics: 1050 likes · 138 reposts · 29 replies · 192092 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-06-11 · @0xCodez · https://x.com/0xCodez/status/2065089060104720776
> https://t.co/hmpJtXuXCq
- metrics: 2269 likes · 356 reposts · 56 replies · 5147480 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-07-01 · @humzaakhalid · https://x.com/humzaakhalid/status/2072251637742137799
> https://t.co/g6ET3CTrxp
- metrics: 314 likes · 63 reposts · 14 replies · 513616 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-06-12 · @marclou · https://x.com/marclou/status/2065385672991752210
> https://t.co/Yju8RrWuOV
- metrics: 4501 likes · 328 reposts · 189 replies · 1387538 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-06-27 · @pierreeliottlal · https://x.com/pierreeliottlal/status/2070770088911732861
> A hack for founders drowning in demos:
> 
> At one point I was doing 30+ demos a day. 
> 
> Same pitch, over and over. It nearly killed me, and it didn't scale.
> 
> Then I replaced most of them with one group webinar. 
> Now I talk to 40+ people in 30 minutes instead of 40 separate calls. https://t.co/K4mz5PoWHd
- metrics: 83 likes · 7 reposts · 13 replies · 8665 views
- format: scar
- why it worked: pain with a number (30+ demos/day, "nearly killed me") → one mechanism swap → outcome number (40 people / 30 min)
- status: distilled

### 2026-06-26 · @0xSero · https://x.com/0xSero/status/2070603243797844338
> https://t.co/mCKYSBtzne
- metrics: 1594 likes · 204 reposts · 64 replies · 525905 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-06-17 · @0xMovez · https://x.com/0xMovez/status/2067291911468044494
> https://t.co/OMBzNQETKM
- metrics: 1967 likes · 255 reposts · 46 replies · 2210641 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-06-20 · @AnatoliKopadze · https://x.com/AnatoliKopadze/status/2068328135611822149
> https://t.co/eq0oL4fIaR
- metrics: 6612 likes · 1001 reposts · 180 replies · 15893267 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-06-18 · @lmrankhan · https://x.com/lmrankhan/status/2067718954705915993
> https://t.co/enI6gtoa7M
- metrics: 1181 likes · 124 reposts · 78 replies · 470808 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-06-17 · @cyrilXBT · https://x.com/cyrilXBT/status/2067051333576724525
> Anthropic pays $750,000 a year for engineers who can build LLMs from scratch.
> 
> Not prompt engineers. Not fine-tuners. Not RAG specialists.
> 
> Engineers who understand the architecture well enough to build the thing from zero.
> 
> Stanford just put a 2-hour lecture on exactly that on https://t.co/5WAfPuKaPP https://t.co/aYd07SXOAV
- metrics: 258 likes · 29 reposts · 17 replies · 36674 views
- format: value post
- why it worked: salary number hook + negation triple ("Not prompt engineers. Not fine-tuners.") + free artifact payoff
- status: distilled

### 2026-06-16 · @zodchiii · https://x.com/zodchiii/status/2066882971374678057
> https://t.co/acOU3wFtkX
- metrics: 731 likes · 109 reposts · 18 replies · 1627326 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-06-15 · @fin465 · https://x.com/fin465/status/2066589201085370482
> in @ycombinator they have a playbook on how to get customers ASAP for your startup.
> 
> if you follow this, you’ll brute force your way to 100 customers, almost no matter what your product is.
> 
> Here it is:
> 
> 1/ launch-max.
> 
> product hunt, hackerNews, devhunt, betalist, peerlist, indie
- metrics: 3698 likes · 249 reposts · 108 replies · 302256 views
- format: value post
- why it worked: borrowed authority (YC) + brute-force promise ("almost no matter what your product is") + numbered playbook
- status: distilled

### 2026-05-04 · @timbidefi · https://x.com/timbidefi/status/2051219084092506144
> https://t.co/s7LhfL22CP
- metrics: 1302 likes · 147 reposts · 26 replies · 5443051 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-05-06 · @ericosiu · https://x.com/ericosiu/status/2052091708826063284
> https://t.co/Cbl7y6YtNA
- metrics: 452 likes · 42 reposts · 16 replies · 527559 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-01-22 · @BasedBiohacker · https://x.com/BasedBiohacker/status/2014479926959743474
> https://t.co/pjvbSoGFOr
- metrics: 5784 likes · 415 reposts · 63 replies · 2386247 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-05-04 · @exploraX_ · https://x.com/exploraX_/status/2051240544043504028
> https://t.co/WQbNyZaIra
- metrics: 276 likes · 30 reposts · 12 replies · 283826 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-06-01 · @athcanft · https://x.com/athcanft/status/2061478690589225166
> https://t.co/oSvT5QUgv9
- metrics: 293 likes · 12 reposts · 36 replies · 211594 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-05-31 · @0xCodez · https://x.com/0xCodez/status/2061107447482237324
> https://t.co/zCuvtRzera
- metrics: 267 likes · 39 reposts · 10 replies · 146017 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-05-26 · @DenisKursakov · https://x.com/DenisKursakov/status/2059342997209194946
> https://t.co/DJPOpBLNZG
- metrics: 11 likes · 1 reposts · 2 replies · 9238 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-05-21 · @liu8in · https://x.com/liu8in/status/2057525027545981348
> https://t.co/PIpX2MehsX
- metrics: 65 likes · 9 reposts · 13 replies · 22340 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-05-21 · @sairahul1 · https://x.com/sairahul1/status/2057376104072298855
> https://t.co/QmXyhXYTto
- metrics: 518 likes · 75 reposts · 13 replies · 7595477 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-05-21 · @sairahul1 · https://x.com/sairahul1/status/2057377170851512775
> 18-year-old American found a roofing company on Google Maps with 4.9 stars and no website, copied their reviews and pasted them into ChatGPT 5.5.
> 
> 2 minutes later - a complete brief. 
> 
> Pasted it into AI and just waited while the system built a full website with all pages, reviews https://t.co/4ndcrcN4oA https://t.co/vzM7tg8nFc
- metrics: 9654 likes · 1025 reposts · 201 replies · 7533420 views
- format: other (protagonist story)
- why it worked: corpus best (7.5M views) — unlikely specific person + mundane detail (4.9 stars, no website) + 2-minute receipt; SF client-build stories fit this shape
- status: distilled

### 2026-05-21 · @w1nklerr · https://x.com/w1nklerr/status/2057451768879956035
> A girl makes $9,000 a month sitting by the pool with just a tablet
> 
> She finds a viral kids song like Baby Shark or Surprise Symphony.
> 
> Copies the info and asks AI to build a prompt for a show just like it.
> 
> One message back and a full video concept is ready.
> 
> She drops it into https://t.co/anaiY9d9Y5 https://t.co/hayVJqXCxe
- metrics: 6443 likes · 822 reposts · 156 replies · 3391298 views
- format: other (income-porn persona)
- why it worked: ANTI-PATTERN for us — persona + income claim pulls millions of views but poisons trust; keep the specificity, never the get-rich frame (SF sells never-lies)
- status: distilled

### 2026-05-17 · @coreyganim · https://x.com/coreyganim/status/2056055763471139205
> Someone’s gonna make $1,000,000 in 2026 with this AI business model
> 
> (Full model explained + how to find clients) 👇 https://t.co/cqZwQdYUfu
- metrics: 1254 likes · 87 reposts · 44 replies · 123616 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-05-19 · @mattgittleson · https://x.com/mattgittleson/status/2056872413854654625
> https://t.co/ledaiBQRaO
- metrics: 1086 likes · 61 reposts · 52 replies · 702891 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-05-19 · @jn_jackk · https://x.com/jn_jackk/status/2056525554699141383
> Cold email 1,000 restaurants per day offering to build them a ready-made app
> 
> For every interested reply:
> 
> Have claude vibe-code the app in 20min
> 
> Sell it to each of them for $3,000 per month
> 
> Make 3 sales per month and make $9,000 MRR compounding https://t.co/R4xR2aSlZy
- metrics: 169 likes · 9 reposts · 30 replies · 37466 views
- format: value post
- why it worked: arithmetic-of-the-model spelled out ($3k × 3 = $9k MRR); 30 replies on 169 likes = the math invites argument
- status: distilled

### 2026-05-19 · @ErnestoSOFTWARE · https://x.com/ErnestoSOFTWARE/status/2056740238890766383
> https://t.co/UVi5HEaz1e
- metrics: 195 likes · 7 reposts · 5 replies · 104634 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-05-18 · @VadimStrizheus · https://x.com/VadimStrizheus/status/2056410757063950634
> https://t.co/Nmh9l0tVtB
- metrics: 1636 likes · 106 reposts · 56 replies · 2536838 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-05-18 · @subahwadhwani · https://x.com/subahwadhwani/status/2056384331762090026
> https://t.co/20PPSqAWRA
- metrics: 1069 likes · 222 reposts · 79 replies · 824903 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-05-16 · @IAmAaronWill · https://x.com/IAmAaronWill/status/2055611452803735716
> AI systems businesses are buying right now:
> 
> → Missed call text-back: $2k
> → Proposal auto-drafter: $3k
> → Onboarding flow builder: $3k
> → Invoice follow-up system: $2k
> → Lead qualification scorer: $3k
> → Speed-to-lead responder: $2k
> → Appointment setter agent: $4k
> → Review
- metrics: 507 likes · 31 reposts · 23 replies · 30263 views
- format: value post
- why it worked: priced list — each system gets a $ tag; concrete price = credibility; maps 1:1 to SF's SMB agent catalog (recurring format candidate for us)
- status: distilled

### 2026-05-12 · @w1nklerr · https://x.com/w1nklerr/status/2054253509155922219
> https://t.co/qVlSyWCYsM
- metrics: 1137 likes · 147 reposts · 28 replies · 12274433 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-05-15 · @chrisgirbu · https://x.com/chrisgirbu/status/2055294015268942297
> https://t.co/8OIJwYA9Oc
- metrics: 392 likes · 19 reposts · 16 replies · 203826 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-05-13 · @themaxthule · https://x.com/themaxthule/status/2054541238351626447
> @mchulet Building the opensource alternative to GoHighLevel
> 
> CRM, booking page, intake forms, agents, all wired up in 3 minutes per client using natural language in Claude Code
> 
> https://t.co/j7LB1fxfcD
- metrics: 1 likes · 0 reposts · 0 replies · 89 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-05-13 · @simonecanciello · https://x.com/simonecanciello/status/2054635189670904209
> https://t.co/gCTUCkse4H
- metrics: 376 likes · 15 reposts · 16 replies · 296710 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-05-11 · @spect3ral · https://x.com/spect3ral/status/2053882872679797129
> I built a Claude workflow that spits out 5 winning ads from one URL.
> 
> No designer.
> No agency.
> No brief.
> 
> Here's how it works:
> 
> 1. It eats your product page
> URL in.
> Claude extracts benefits, audience, positioning, price.
> Creative brief auto-built.
> No forms.
> No calls.
> 
> 2. It spawns https://t.co/Vti0WOpPyv
- metrics: 1100 likes · 143 reposts · 901 replies · 110040 views
- format: value post
- why it worked: "I built X that does Y from one URL" + negation triple ("No designer. No agency. No brief.") + numbered pipeline; 901 replies = the workflow itself is the lead magnet
- status: distilled

### 2026-05-11 · @elisenda_bou · https://x.com/elisenda_bou/status/2053870857349480776
> We can finally say it! https://t.co/1bWHY5PuIS is launching today!
> We  spent a year building the data substrate for the agent economy, one MCP that allows your agents to query the world as a DB, so you can skip the data and focus on building what matters! @GetCala https://t.co/j9NACZW6Wv
- metrics: 119 likes · 14 reposts · 17 replies · 18684 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2026-05-11 · @anvisha · https://x.com/anvisha/status/2053914822736003303
> Launching today: make any PDF beautiful.
> 
> It's 2026 - there's no excuse to have ugly resumes, invoices or client proposals.
> 
> Just upload a PDF -&gt; Get back a polished, professionally designed version in minutes.
> 
> Works with docs of any complexity👇 https://t.co/9cQCtk27HM
- metrics: 3101 likes · 167 reposts · 117 replies · 440709 views
- format: 
- why it worked: 
- status: UNDISTILLED

### 2023-01-04 · @zenorocha · https://x.com/zenorocha/status/1610655123063336961
> Personal update:
> 
> I'm leaving my job to start my own company.
> 
> https://t.co/mczfF5uWxj
> 
> Why am I doing this? What problem are we solving? Why now? https://t.co/isTROkbXwC
- metrics: 5002 likes · 311 reposts · 290 replies · 1286049 views
- format: milestone
- why it worked: personal stake ("leaving my job") + question stack the reader wants answered ("Why now?") — the milestone chapter format at its cleanest
- status: distilled

