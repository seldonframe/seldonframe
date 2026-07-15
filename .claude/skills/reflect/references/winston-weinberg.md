---
name: winston-weinberg
source: https://fs.blog/knowledge-project-podcast/winston-weinberg/
fetched: true
fetched_on: 2026-07-15
---
# Winston Weinberg — Validate against expert judgment, then move at two-way-door speed

## Core idea
Weinberg built Harvey (legal AI) on two coupled moves. First, a brutal validation
test before building anything: feed real legal questions through the raw model and
ask three experienced attorneys whether they'd send the answers unchanged — the
model cleared "86 out of 100 questions" unanimously. The product bet was only made
after domain experts, not founders, judged the output shippable. Second, once
validated, operate at maximum decision speed: treat most choices as reversible
two-way doors, decide fast, and reserve deliberation for the few one-way doors.
The connective tissue is his paradox of AI-era value — as routine work gets
automated, human judgment becomes MORE valuable, not less. So the scarce input to
protect is judgment (yours and your domain experts'), and the scarce output to
optimize is decision throughput. Supporting practices: use stress deliberately to
build resilience to failure, ruthlessly prioritize the single most important focus
area at any time, run operations out of shared Google Docs instead of heavy
process, and take asymmetric shots (his cold email to Sam Altman changed the
company's trajectory — tiny cost, unbounded upside).

## When it bites
- You're about to build an AI product for a conservative, expertise-heavy industry
  (legal, medical, finance) and haven't yet put raw model output in front of real
  practitioners with a would-you-ship-this-unchanged bar.
- You're agonizing over a product/architecture choice that is actually reversible
  — a feature flag, a pricing test, a copy change — as if it were a one-way door.
- Constant model/platform change is flooding you with options and you've lost the
  single most important focus area.
- You're deciding whether automation replaces the expert or amplifies the
  expert's judgment — the answer changes the whole product shape.
- A high-status person could unblock you and you're not sending the cold email
  because the ask feels presumptuous.

## How to run it
- What is my "86 out of 100" test — the concrete experiment where domain experts
  judge raw output against a ship-it-unchanged bar, before I build the wrapper?
- Is this decision a two-way door? If I can cheaply reverse it, why am I still
  deliberating instead of deciding today?
- If it's genuinely one-way (data model, pricing structure, trust-breaking
  failure in front of a conservative buyer), have I slowed down proportionally?
- What is the ONE most important thing right now — and does my calendar/backlog
  actually reflect it, or am I spreading across five?
- Where does human judgment stay in the loop in my product, and am I pricing/
  positioning that judgment as the value, not the automated routine work?
- What's the cold-email-to-Sam-Altman move available to me this week — the
  low-cost, high-asymmetry ask I'm avoiding?
- Am I using this stressful stretch to build resilience, or just absorbing damage?
  What's the lesson I'd extract if this failure happened to someone else?

## Failure modes
- Validation theater: asking experts "is this impressive?" instead of "would you
  send this unchanged?" — the softer bar passes everything and proves nothing.
- Two-way-door label abuse: calling a trust decision reversible. In conservative
  industries, a hallucinated answer in front of a buyer is a one-way door.
- Speed without a focus: deciding fast on twenty fronts is thrash, not velocity —
  the prioritization half of the frame is load-bearing.
- Automating the judgment instead of the routine: building the product that
  replaces the expert's call rather than clearing the grunt work beneath it.
- Doc-driven ops decaying into doc sprawl — the Google Doc works because it's the
  single live surface, not because documents are inherently good.
- Treating resilience talk as license to ignore failure signals instead of
  metabolizing them into changed behavior.

## When building, reach for this when…
- Deciding whether an AI feature is good enough to ship to a skeptical,
  expertise-heavy audience (design the expert ship-it-unchanged test first).
- Stuck deliberating on a reversible choice — classify the door, then decide
  same-day if it's two-way.
- Roadmap has ballooned during a platform shift and you need to collapse it back
  to the single most important bet.
- Choosing between automating an expert's judgment vs. the routine work around
  it — default to amplifying judgment.
- Facing a blocker a well-placed cold ask could remove — send the asymmetric
  email before building the workaround.
