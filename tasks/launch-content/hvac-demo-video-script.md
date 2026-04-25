# SLICE 9 demo video script — Desert Cool HVAC

**SLICE 9 PR 2 C9 — timestamped script for a 5–8 min demo, ~750 words.**

---

## Scope + tone

- **Length target:** 6 min ± 1
- **Voice:** Jordan-as-narrator, then product demo voice
- **Visuals:** screen recording of Claude Code session + SeldonFrame
  dashboard split-view; cuts to a Phoenix HVAC truck b-roll for the
  emergency segment
- **Audio:** dry, no music bed during demo cuts; a soft pad for the
  intro + outro

---

## 0:00 — Cold open (15s)

**VISUAL:** Phoenix skyline, 5am, sun cresting over Camelback. A
weather widget reads 113°F forecast.
**VO (Jordan):** "I run an HVAC company in Phoenix. When the
forecast says 113, an AC failing isn't an inconvenience. It's a
911 call."

---

## 0:15 — Cut to Jordan in his shop (20s)

**VISUAL:** Jordan walking past trucks being loaded.
**VO:** "I have 14 techs, sixteen hundred customers, and an answering
service that costs me four grand a month. I used to run all of it
out of a notebook and a $79 field-service tool that only does 60% of
what I need."

---

## 0:35 — Frame the problem (20s)

**VISUAL:** Notebook open, page covered in customer notes.
**ON-SCREEN TEXT:** "What if the OS knew what was in the notebook?"
**VO:** "What if the system knew Mrs. Alvarez's mom is on oxygen?
What if it knew not to text Hugo before 10am because he works
graveyard? What if it acted on that without me telling it twice?"

---

## 0:55 — Setup montage (40s)

**VISUAL:** Screen recording of Claude Code chat. Jordan types five
lines, one at a time, with brief pauses showing the workspace
building each archetype:

```
> create a workspace for Desert Cool HVAC
> install hvac-arizona vertical pack
> set up the heat advisory for vulnerable customers, threshold 110°F
> set up emergency SMS triage with 4-hour SLA on priority customers
> set up the post-service follow-up — 4-5 stars asks for review,
  anything else escalates to me
```

**VO:** "Three weeks ago I sat down for fifteen minutes. I typed
five sentences. The whole thing was built by the time I made
coffee."

---

## 1:35 — Heat Advisory walk-through (60s)

**VISUAL:** Cuts between the workflow diagram on the dashboard and
SMS messages arriving on a customer's iPhone.
**ON-SCREEN TEXT:** "5:02am · Heat Advisory · auto-fired"
**VO:** "Five-oh-two AM. The forecast hits 113. The system pulls my
customer book, finds the six households with elderly residents,
medical equipment, or oxygen — equipment older than 12 years — and
texts each of them. One sentence per text, in our voice, not some
chatbot voice."

**VISUAL:** Zoom on Mrs. Alvarez's text:
> Hi Mrs. Alvarez — heads up, 110°+ tomorrow. Want a free AC check
> before it hits? Reply YES.

**VO:** "She replies YES. The booking gets added to tomorrow's
schedule before I'm out of bed."

---

## 2:35 — Emergency Triage walk-through (75s)

**VISUAL:** Phoenix HVAC truck pulling out of a driveway, lights on.
**ON-SCREEN TEXT:** "7:48am · Emergency · 3.2 sec to dispatch"
**VO:** "Seven forty-eight. Text comes in: 'EMERGENCY, AC dead,
house is 89, dad is on oxygen.'"

**VISUAL:** Workflow trace on the dashboard, steps lighting up in
order:
- check_heat_advisory (advised 113°F today)
- load_customer (Maria Alvarez, residential, oxygen tag)
- check_tier → vip-commercial path
- ack_priority (SMS sent: "Tech assigned. ETA 50 min.")
- page_oncall (Marcus paged)
- log_high_priority

**VO:** "Three-point-two seconds. The customer's anxiety dropped
in three-point-two seconds. I never touched my phone. Marcus —
my senior tech — was already pulling out of the shop because the
system paged him."

---

## 3:50 — Post-Service Follow-Up (45s)

**VISUAL:** Stripe payment notification appears, then 24-hour
fast-forward, then SMS arrives on Maria's phone.
**VO:** "Marcus closes the call. Stripe pings. Twenty-four hours
later — Phoenix convention, you don't text people the same day —
Maria gets a one-line ask: rate your service."

**VISUAL:** Maria types "5 stars," receives a Google review link.
**VO:** "Five stars goes straight to a Google review request. Three
stars or anything weird? It comes to me. I'd rather call ten 'meh'
customers than auto-pester one unhappy one."

---

## 4:35 — The dashboard payoff (50s)

**VISUAL:** SeldonFrame `/agents/runs` page with the **Cost** column
in focus, every row reading em-dash.
**VO:** "Here's the part everyone asks about. The cost column.
Em-dash, em-dash, em-dash. Why? Because none of these workflows
called an AI model. They're built from primitives — wait, branch,
send-text, listen-for-reply. The AI part happened once, when I
typed those five lines."

**ON-SCREEN TEXT:** "Predictable workflows. Predictable costs."

**VO:** "I pay for SMS pass-through and the workspace fee. Not
metered model bills. Not surprise tokens at month-end."

---

## 5:25 — The architecture line (25s)

**VISUAL:** Title card, three lines of text appearing one at a time.
**ON-SCREEN TEXT:**
1. The workspace is the unit of intelligence.
2. Archetypes compose primitives, not models.
3. The chat surface is the only config UI.

**VO (product VO):** "The workspace knows your business. The
archetypes run your business. The chat builds the workspace.
That's it."

---

## 5:50 — Close (15s)

**VISUAL:** Cut back to Phoenix skyline, sun fully up.
**VO (Jordan):** "I closed my laptop at nine last night. The system
ran the morning without me."

**ON-SCREEN TEXT:** seldonframe.com — first workspace free, forever.

**[FADE]**

---

## Production notes

- Total runtime: 6:05.
- Screen captures should be live, not animated mockups, to preserve
  the "this is real, this works today" credibility.
- Jordan's voice is the through-line; the product voice only enters
  for the architecture line at 5:25 to mark the shift from "here's
  the story" to "here's the why."
- Cost-column shot at 4:35 must be a real screenshot of `/agents/runs`
  showing real archetype runs (em-dash on every row proves the
  zero-LLM-runtime claim — that's the moneyshot).
