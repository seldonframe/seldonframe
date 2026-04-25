# How Jordan runs an HVAC business with a chat window

**SLICE 9 PR 2 C8 — prospect-facing walkthrough, ~1,400 words.**

---

Jordan Reyes runs Desert Cool HVAC in Phoenix. Fourteen techs, 1,540
residential accounts, 260 commercial. In summer, the phones light up
at 5am and don't stop until 9pm — Phoenix doesn't do "warm." When the
forecast hits 110°F, an air conditioner failing isn't an
inconvenience, it's a 911 call.

Before SeldonFrame, Jordan ran the business with a $79/month
field-service tool, an outsourced answering service for after-hours,
two dispatchers, and a thick spiral notebook full of tribal knowledge
about which customers had elderly parents on oxygen, which commercial
accounts paid net-15 vs net-30, and which neighborhoods got the worst
pre-monsoon dust storms.

Now he runs it from a chat window.

This is what an actual day looks like.

## 5:02am — the heat advisory fires

Jordan is still asleep. At 5am Phoenix time every day, his SeldonFrame
workspace runs the **Heat Advisory** archetype. It checks the forecast
for the next 36 hours via OpenWeatherMap, and if it sees a high above
110°F, it walks through his customer book looking for the vulnerable
cohort: residential accounts with equipment older than 12 years, no
service in the last 365 days, and any tag for "elderly," "infant," or
"medical equipment."

This morning the forecast says 113°F. Six customers match. Each one
gets a single SMS:

> Hi Mrs. Alvarez — heads up, 110°+ tomorrow. Want a free AC check
> before it hits? Reply YES.

The workflow logs an outreach record under
`workspace.soul.outreach_log.heat_advisory.2026-04-25` so it never
texts the same customer twice on the same day. Jordan sees a green
"5 advisory texts sent · 1 reply" badge on his dashboard when he
opens his laptop at 6:15am with coffee.

**No code. No cron job he set up. No prompts to a generic LLM. He
typed "set up a heat advisory for vulnerable customers" three weeks
ago and the workspace built it.**

## 7:48am — emergency, and the system already knows the answer

A text comes in to Desert Cool's main line: "EMERGENCY — AC dead,
house is 89 inside and my dad is on home oxygen."

The **Emergency Triage** archetype catches it. The trigger is a
regex match on the SMS body — `(?i)(EMERGENCY|URGENT|EMERG)`. The
workflow:

1. Checks the heat advisory state for today (already 113°F predicted)
2. Loads the customer record by phone number
3. Branches on `customer.tier`: this one is `vip-commercial` because
   the dad is on the medical-equipment tag list — Jordan's pre-set
   rule promotes oxygen-dependent residential customers to the same
   priority as commercial accounts
4. Fires the priority acknowledgment SMS:

> We've received your emergency. Tech assigned. ETA: 50 min. We're
> on it.

5. Pages the on-call senior tech (Marcus, who's already up because
   he's a senior tech in Phoenix in summer)
6. Logs the high-priority dispatch event for the dashboard

Jordan sees this happen on his phone — a single line in the agent runs
view: `hvac-emergency-triage · running · current step: log_high_priority`.
He doesn't need to do anything. Marcus is already pulling out of the
shop.

The whole sequence took 3.2 seconds. The customer's anxiety just
dropped.

## 11:30am — the workspace runs itself

Most of the morning, Jordan doesn't touch the system. He's quoting a
commercial chiller replacement at a Tempe office park. His phone is
silent because the system is doing what it's supposed to do.

By lunch, the daily numbers on his dashboard read:
- 17 service calls dispatched
- 6 heat advisory texts sent (1 reply, 1 booking added to tomorrow's
  schedule)
- 1 emergency handled (~50 min on-site)
- 2 maintenance follow-ups completed

He didn't write the workflows. He didn't approve a single SMS. He
opened his laptop, looked at the dashboard, and went back to quoting.

## 4:15pm — payment lands, follow-up starts ticking

Marcus closes out the morning emergency call. Customer's check ran
through Stripe at 4:15pm. The payment block emits a `payment.completed`
event.

The **Post-Service Follow-Up** archetype subscribes to that event. It
waits 24 hours (Phoenix convention — texting too soon feels rushed),
then:

1. Sends a satisfaction SMS:
   > Hi Maria, how was your service today? Reply 1-5 stars or any
   > feedback.
2. Waits up to 48 hours for a reply
3. If the reply is "5" or "5 stars" or "4" or "4 stars" → asks for
   a Google review with a one-click link
4. Anything else (3 stars, "good but the tech was late," "STOP",
   nothing in 48 hours) → escalates to Jordan's operator dashboard
   instead of risking a tone-deaf review request

The boundary at 3 stars is intentional. Jordan would rather see ten
"meh" replies on his desk and call those customers personally than
auto-pester one unhappy customer for a Google review.

## 6:30pm — Jordan checks the books

Jordan opens his SeldonFrame dashboard one more time before dinner.
He sees the new **Cost** column on the agent runs view:

| Archetype | Status | Cost |
|---|---|---|
| hvac-emergency-triage | completed | — |
| hvac-heat-advisory-outreach | completed | — |
| hvac-post-service-followup | waiting | — |
| ... | ... | ... |

Em-dash on every row. Why? **Because none of these workflows called
an LLM.** They're deterministic state machines built from
SeldonFrame's primitives — wait, branch, send-SMS, await-event,
emit-event. The LLM-driven part — Jordan typing "set up a heat
advisory for vulnerable customers" — happened once, in his Claude
Code session, three weeks ago. After that the workspace runs purely
on code paths.

That's the architecture choice that lets a 14-tech HVAC contractor
run on SeldonFrame instead of a $400/month all-in-one platform.
Workflows are predictable. Costs are predictable. When a workflow
breaks, there's a step trace, not a 4,000-token model response to
debug.

## 9:00pm — the system goes to sleep with him

The on-call rotation is automated. The heat advisory is queued for
5am. The post-service follow-ups for today's three other completed
jobs are ticking quietly in the workflow_runs table, waiting for
their 24h-then-SMS sequence.

Jordan's spiral notebook is in a drawer. The customer-tagging
intelligence ("Mrs. Alvarez has an elderly mother on oxygen,
prioritize her on heat days") lives in the customer Soul record —
a typed, queryable structure that every workflow reads from. The
"don't text Hugo Martinez before 10am, he works graveyard shift"
preference is a contact-level field. The neighborhood-level dust
storm risk maps onto the predictive maintenance window. None of it
is in his head anymore.

He closes the laptop.

## What he typed, three weeks ago

This is the entire setup conversation:

> create a workspace for Desert Cool HVAC
> install hvac-arizona vertical pack
> set up the heat advisory for vulnerable customers, threshold 110°F
> set up emergency SMS triage with 4-hour SLA on priority customers
> set up the post-service follow-up — 24h delay, 4-5 stars asks for
>   Google review, anything else escalates to me

Five lines. The workspace built four archetypes, wired them to the
SMS block, the payments block, the weather API, and the customer
Soul. It seeded the brand voice from his website ("we'll get a tech
out today" — direct, reassuring) and shaped every outbound text in
that voice.

The four archetypes ship in a workspace-scoped registry — they don't
pollute the global archetype baseline used for synthesis testing.
That isolation matters because it means SeldonFrame can ship
vertical packs (HVAC, real-estate agency, dental, fitness studio)
without each pack stepping on the others.

## Why it works

Three things, in order:

**1. The workspace is the unit of intelligence, not the model.**
Jordan's customer book, his brand voice, his SLA tiers, his
seasonal rhythm — these are the Soul. Every workflow reads from
the Soul, not from a prompt. That's why the same English sentence
("set up a heat advisory") produces a Phoenix-shaped workflow for
Jordan and a Seattle-shaped workflow for a different operator
(low-temp threshold, different vulnerability cohort, different
copy register).

**2. Archetypes compose primitives, not models.**
Heat advisory uses: schedule trigger + external_state branch +
mcp_tool_call + predicate branch + write_state. Five primitives.
Zero LLM calls at runtime. That's why Jordan's monthly cost on
SeldonFrame is the workspace fee plus SMS pass-through, not a
metered LLM bill.

**3. The chat surface is the only "configuration UI" he uses.**
He never touched a settings page. He never wrote JSON. He never
even saw the workflow editor — though it's there in the dashboard
if he wants to peek. He talked to Claude Code, and Claude Code
talked to SeldonFrame's MCP, and his business got built.

This is what a Business OS looks like when it's done right.
