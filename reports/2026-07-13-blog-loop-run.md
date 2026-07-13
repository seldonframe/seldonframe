# blog-loop run — 2026-07-13

**Source video:** [AI Agents are the new SaaS](https://www.youtube.com/watch?v=83fWzQSWB10) — Greg Isenberg, The Startup Ideas Podcast
**Transcript:** `docs/strategy/youtube-transcripts/greg-isenberg-agents-are-the-new-saas.md` (human-dropped)
**Article slug:** `agents-are-the-new-saas`

## Files changed
- `packages/crm/src/lib/seo/blog/agents-are-the-new-saas.ts` (new) — the `BlogArticle` export
- `packages/crm/src/app/blog/agents-are-the-new-saas.md/route.ts` (new) — Markdown twin route
- `packages/crm/src/lib/seo/blog/index.ts` (modified) — import + registry wiring

## Step 4 verification gate — claim → transcript snippet table

| Claim in article | Transcript snippet | Timestamp |
|---|---|---|
| "SAS sells software, agent SAS sells work" (verbatim quote) | "So the mental model I have for this is SAS sells software, agent SAS sells work." | 01:29 |
| Slang AI: "AI superhost for restaurants," answers inbound calls, handles guest questions, manages reservations, routes VIPs, alerts staff to private dining/complaints, integrates with OpenTable and Yelp | "This is why a company like Slang AI is interesting... it's an AI superhost for restaurants... It answers inbound calls. It handles guest questions. It manages reservations. It routes VIPs. It alerts staff about high priority topics like private dining or guest complaints. And it integrates with systems like Open Table and Yelp." | 01:29 |
| Same Day: home-services AI dispatchers/receptionists that answer calls, respond to texts, book jobs, reschedule | "An example of a startup that's doing this is Same Day. So they focus on home services and then they basically sell these AI dispatchers, sales agents, receptionists that answer calls, respond to texts, book jobs, reschedule." | 03:26 |
| "I handle this one annoying job better than a junior employee, faster than an agency, and it's cheaper than adding headcount" (quote) | Same as above paragraph, closing line. | 03:26 |
| "pick a workflow with a paycheck attached" | "The second step is pick a workflow with a paycheck attached." | 03:59 |
| Five workflow traits (happens all the time/hourly better; clear finish line; touches software already — Gmail/Slack/Shopify/HubSpot/Stripe; edge cases annoying-but-learnable; buyer can feel the loss) | "A good agent workflow has five traits. First, it happens all the time. Daily is good but hourly is better... Second, it has to have a clear finish line... Third, it touches software already — Gmail, Slack, Shopify, HubSpot, Stripe... Fourth, the edge cases are annoying but learnable... Fifth, the buyer can feel the loss..." | 03:59 |
| "pick one niche and write down 20 jobs people complain about" + roofer/med spa examples + five scoring factors | "Pick one niche and write down 20 jobs people complain about. If it's roofers, maybe it's missed calls, financing questions, insurance paperwork... If it's med spas, lead qualification, no-show recovery... Then score each job on five things: how often does it happen, how expensive is the pain, how easy is it to know when the job is done, what tools does it need access to, and who already owns the budget." | 06:24 |
| Shadow the human 10-20 times, screen-record/narrate, restaurant host example (kitchen closes, stroller tables, patio, VIP routing) | "Watch someone do the job 10 to 20 times. Ask them to screen record it. Ask them to narrate what they're doing... For a restaurant host answering 'What time are you open?' the real workflow is deeper — they know when the kitchen closes, which tables are good for strollers, when the patio is closed, how to handle a VIP..." | 07:02 |
| "the detail is the product" (quote) | Same paragraph, closing line. | 07:02 |
| Seven-part agent spec (what wakes it up, context, tools, what it can do itself, approval, escalation, success) | "it should have seven key parts. What wakes the agent up? What context does it need? What tools can it use? What is it allowed to do itself? Where does it need approval? When should it escalate and bring a human in the loop? And what does success look like?" | 08:44 |
| "you're not just going to build agent slop" (quote) | "If you understand all those things, you're not just going to build agent slop." | 08:44 |
| Minimal useful agent (MUA), four types: draft-and-approve, triage, coordinator, bounded-action (refund under $50 example) | "I call it the minimal useful agent, the MUA... First, a draft-and-approve agent... Second, a triage agent... Third, a coordinator agent... Fourth, the bounded-action agent: it can do a specific thing under clear rules — book an appointment, send a follow-up, process a refund under $50." | 09:21 |
| Anthropic's guidance: many agent problems should start as workflows, autonomy earned by starting predictable and adding judgment | "I was looking at Anthropic's agent guidance recently and they made a really important simple point. They said many agent problems should start as workflows... Founders should earn autonomy by starting with a predictable path and adding judgment only when it creates value." | 11:39 |
| "the agent does the work but the wrapper creates the trust" (quote) + logs/approvals/controls/testing, control room, restaurant/property examples | "What separates a cool automation from a real agent-first SAS product is: the agent does the work but the wrapper creates the trust. Customers need to see what happened — logs, approvals, controls, handoff rules — and a way to test the agent before it goes live... The dashboard can be simple but the customer needs the control room. For a restaurant phone agent: call summaries, reservation outcomes, missed human handoffs. For a property maintenance agent: tickets created, vendor routes, tenant updates, owner approvals." | 12:49 |
| Eval example: 50 maintenance requests, routed 42 correctly, flagged 6 for review, made 2 mistakes (quote) | "Imagine telling a property manager: 'We tested this on 50 of your old maintenance requests. It routed 42 correctly, flagged 6 for human review, and made 2 mistakes. Here are the two mistakes and here's how we fix them.'" | 14:01 |
| Sell pilot manually first, 3 customers same niche, sell the outcome plainly | "The fastest path is usually a pilot where you manually do the work with AI and then productize the repeated parts. Start with three customers in one niche... and sell the outcome." | 15:45 |
| Pricing examples: $1,500 setup + $1,000/mo; $2,000 setup + $30/qualified appointment; $3,000/mo up to 500 tickets | "Maybe it's a $1,500 setup and $1,000 a month for one workflow. Or a $2,000 setup plus $30 per qualified appointment... Or $3,000 a month up to 500 handled tickets." | 17:21 |
| "you earn the software by doing the work first" (quote) | Same paragraph, closing line. | 17:21 |
| Outcome pricing as "the future," but earned with patience, not started there | "I'm a huge believer that outcome pricing is the future of how these agent-first businesses get priced... But don't jump there initially; you'll get there with patience." | 15:45 |
| Workflow teardown: old way vs. agent way, "selling painkillers, not vitamins" (quote) | "Workflow teardowns is what I'm seeing work really well in real time. Show the old way... Then show the agent way... You want to be in the business of selling painkillers, not vitamins." | 18:32 |
| Four-week / 30-day plan (day 1-7, week 2-4 breakdown) | "The last step — the 0 to 100 plan. My four-week plan. Day one... Day two... Day three... Day four... Day five... Day six... Day seven... Week two: sell two pilots... Week three: add the product wrapper... Week four: publish workflow teardowns..." | 21:52 |
| Closing thesis: software moving "from 'help me do the work' to 'do the work with me'" (quote) | "software is moving from 'help me do the work' to 'do the work with me.'" | 24:10 |

All claims traced verbatim; nothing was dropped and no number required correction.

## blog.spec results

```
ℹ tests 27
ℹ suites 0
ℹ pass 27
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```
27/27 green (18 pre-existing + 9 new from `agents-are-the-new-saas`).

## Deviations from the loop instructions
- Task instructed to work per `docs/ops/agents/blog-loop.md` Steps 2-5 but skip the git commit/PR (Step 5's commit/push/PR) — per explicit dispatcher instruction, no commit was made; files are left uncommitted in the worktree for the dispatcher to commit and open the PR.
- One internal link included (`/guides/how-to-make-an-ai-agent-reliable`), verified present in `packages/crm/src/lib/seo/guides/index.ts` before linking, tying the "wrapper creates trust / evals as sales asset" material to SF's own reliability thesis — earned, not a pitch.

## Open risks
- None identified. Article is prose-first, markdown-lite balanced, sourceVideo present, single https source (the video itself — no secondary corroboration needed since every claim is a direct paraphrase/quote of the speaker).
