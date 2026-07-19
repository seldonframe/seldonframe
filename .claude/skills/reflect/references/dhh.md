---
name: dhh
source: https://corecursive.com/045-david-heinemeier-hansson-software-contrarian/ + https://solanojuan.medium.com/david-heinemeier-shares-some-principles-to-go-against-the-grain-1ca5c0032f2c
fetched: true
fetched_on: 2026-07-15
---
# DHH — simplicity as a strategy

## Core idea
DHH's whole stance compresses to one move: refuse complexity that isn't paying rent. Rails won by turning thousands of low-level decisions into strong conventions — the framework decides the boring things so the builder spends judgment only where their app is actually different. The enemy is the "merchants of complexity": vendors, architectures, and fashions (microservices, SPA+Redux everywhere, Google-scale infrastructure for a 10-user app) that sell you layers whose main output is more layers. Rails itself started as roughly 2,000 lines; the lesson is that most problems are smaller than the tooling sold to solve them.

A corollary he leans on: the web is the freest platform precisely because nobody can see your stack. You get to pick tools by personal fit and productivity rather than by app-store mandate or hiring-market fashion — so pick the ones that make you fast and happy, and ignore the popularity contest.

The same compression logic runs his business philosophy. Bootstrapped and profitable beats venture-funded and obligated: a business clearing $1M/year is a wildly better bet than lottery-ticket unicorn hunting, and it keeps you free to say no. Constraints are treated as a feature — limited money, limited headcount, limited hours force sharper decisions. And most value creation is recombination: the overwhelming majority of a product is existing pieces assembled differently, so novelty budget should be spent on the few places customers actually feel it.

Third pillar: flow is the scarce resource. Creative work needs long uninterrupted stretches, so 37signals runs calm — few managers, async writing over standups and chat, 6-8 week cycles, ~40 focused hours over 60 fragmented ones. Clearing "mental barnacles" (the thousand inconsequential open loops) is maintenance work, not procrastination. When stuck, he powers through with routine tasks until flow returns. Notably, he adopted AI-first coding not to work less but to attempt more ambitious projects — new leverage goes to ambition, not slack.

He's blunt about the alternative: "I would rather retire and fucking make weaved baskets" than maintain a trend-driven microservices/SPA sprawl.

## When it bites
- **Stack choice.** You're picking between a boring, batteries-included framework and a trendy composition of ten libraries. DHH says the convention-heavy default wins because it deletes decisions, not because it's fashionable.
- **Adding a dependency, service, or layer.** Every addition is a purchase from a complexity merchant. The question is whether it delivers direct user/business value or just architectural prestige.
- **Splitting the monolith.** Team-of-five reaching for microservices, Kubernetes, or an event bus because "that's how real companies do it."
- **Raising money.** VC converts your company into an obligation to chase outlier outcomes. If the honest ambition is a great profitable business, funding is a tax, not fuel.
- **Process and hiring creep.** Adding managers, standups, sprints, and dashboards to feel in control — each one fragments the maker time that produces the product.
- **Tool-chasing.** Rewriting or re-platforming because the ecosystem moved, not because users complained.
- **Interruption-heavy defaults.** Real-time chat culture, always-on notifications, and daily syncs adopted as "communication" when they're actually flow taxes on every maker.

## How to run it
Ask, in order:
1. **"What would the boring default be?"** Name the convention-heavy, well-trodden option first. Deviating from it requires a stated, app-specific reason — not vibes.
2. **"Is this layer delivering value or selling me complexity?"** Trace the layer to a user-visible or revenue-visible outcome. If the chain of benefit runs through "best practice" or "when we scale," it's a merchant.
3. **"Are we solving our problem or Google's?"** Estimate actual scale honestly. Most systems fit in one process, one database, one deploy.
4. **"Does this decision buy flow or fragment it?"** For any process/tool/meeting: does it protect long uninterrupted stretches for the people building, or slice them up?
5. **"What does this obligate us to?"** For money, dependencies, and integrations alike: what growth rate, upgrade treadmill, or maintenance burden are we signing?
6. **"Can I combine existing pieces instead?"** Roughly 99% of value is existing parts assembled differently. Look for the assembly before the invention.
7. **"What constraint would make this better?"** If the plan only works with more people/time/budget, tighten the scope until it works without them.
8. **"Would I still choose this if nobody could see my stack?"** Strip the resume-driven and status motives; keep only what makes the product better or you faster.

## Failure modes
- **Contrarianism as identity.** DHH is right often because he argues from first principles; copying his conclusions ("monolith always," "VC never," "TDD is dead") without the reasoning is just a different cargo cult.
- **Under-investing when scale is real.** Some domains genuinely need the complexity — multi-region compliance, hard isolation boundaries, teams of hundreds. "You're not Google" is false for the occasional builder who is, and late re-architecture is expensive.
- **Monolith dogma.** A well-factored service split along a true organizational or fault boundary can be the simple option. The rule is minimal total complexity, not maximal co-location.
- **Bootstrap absolutism.** Winner-take-most markets with real network effects can punish the patient; sometimes capital is the moat and calm loses.
- **Calm as an excuse for drift.** No managers and long cycles work at 37signals because standards and taste are brutal. Without that, "calm" decays into slow.
- **Survivorship framing.** Basecamp had a hit product early; its constraints were chosen, not imposed. A pre-revenue builder quoting DHH to avoid hustle is misreading the lesson.
- **Boring-default worship.** Conventions are a means to deleted decisions, not an end; clinging to a default that no longer fits your actual problem is its own complexity.

## When building, reach for this when…
- Choosing a framework or stack and feeling pulled toward the newer, more "serious" architecture over the boring default.
- Auditing dependencies or infrastructure: any review where the layer count grew faster than the feature count.
- Deciding VC vs. bootstrap, or any deal that trades control for speed.
- Noticing process creep — more meetings, standups, or coordination roles appearing while maker output stalls.
- Getting new leverage (AI tooling, a hire, a windfall) and deciding whether it funds ambition or just padding.
- Scoping a feature that only seems feasible with more time, people, or infrastructure — the constraint is the design tool.
