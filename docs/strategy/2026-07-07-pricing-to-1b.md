# Pricing to $1B — first-principles pricing architecture (2026-07-07)

Status: PROPOSAL (cofounder recommendation). Companion to
`2026-07-07-wedge-to-1m-arr.md` (the GTM wedge); this doc is the pricing +
enterprise-value architecture. Research: live-sourced 2026-07-07 (Shopify
10-K/Q1-26, ServiceTitan FY26, Grand View/Fortune BI TAM reports, SaaS-multiple
trackers, Fin/Agentforce pricing). Key figures cited inline; ⚠ = verify before
investor use.

## 1. What SeldonFrame IS and ISN'T (pricing follows identity)

IS: (a) the **system of record** for a local business's front office (CRM,
calendar, site — the data agents act on); (b) the **rails** (payments,
telephony, agent marketplace); (c) **distribution + trust** (agencies,
never-lies verification, the comparison/GEO surface). ISN'T: a model company,
a reseller of marked-up tokens/minutes, a marketing-automation suite, or an
internal-productivity tool. Every pricing decision below monetizes what we ARE
and refuses to monetize what we AREN'T.

## 2. Bezos: what will NOT change by 2036

1. **SMBs will want more booked jobs and hate missing calls.** Demand for the
   outcome is eternal; only the mechanism changes.
2. **Customers will want to pay less.** Price pressure is permanent — so never
   build the revenue line on a cost that deflates (compute) or a markup a
   competitor can undercut to zero.
3. **Businesses will transact, and whoever moves the money earns a slice.**
   Shopify FY2025: subscriptions are only ~24% of revenue; merchant solutions
   ~76%, with Payments attached to 67-68% of GMV and a blended take ~3%
   (10-K FY2025; Q1-26 8-K). ServiceTitan moves $82B/yr of GTV for just 10.8k
   customers. Payments outlive every software fashion.
4. **Trust gets scarcer as agents multiply.** When anyone can prompt up an
   agent, verified/accountable agents command the premium — never-lies is a
   compounding moat, not a feature.
5. **Owners want predictability and ownership.** Flat, legible pricing and
   portable data never go out of style (it's why the $29 flat position works
   as marketing on 15 comparison pages today).
6. **Intelligence gets cheaper.** Per-token prices have deflated ~10x every
   1-2 years ⚠. Corollary: every per-minute/per-credit vendor's revenue line
   deflates with it; a flat + BYOK platform's COST line deflates instead.
   We are structurally LONG the deflation curve; Synthflow/Retell/Chatbase
   pricing models are short it.

## 3. Where the market goes, 2026 → 2030

- **Software TAM (narrow):** AI voice agents ~$3.5B (2026) → ~$13-15B (2030)
  at ~39% CAGR (Grand View); conversational AI $18B → $41B+ (Fortune BI/GVR).
- **Labor TAM (the honest frame):** ~1.0M US receptionists × ~$37k ≈ **$37B/yr
  in wages** (BLS ⚠), plus office clerks, plus the $2.5-3B answering-services
  market, plus missed-call opportunity cost. SeldonFrame at $29-49/mo prices at
  ~1% of a loaded human receptionist. Category leaders get valued on the labor
  frame, tools on the software frame — the entire multiple delta lives here.
- **Penetration:** deployed AI receptionists in local services ≈ 2-5% today ⚠;
  Gartner predicts agentic AI autonomously resolves 80% of common service
  issues by 2029. The adoption curve is almost entirely ahead of us.
- **Agent pricing is converging on OUTCOMES.** Fin: $0.99 per resolved
  outcome; Agentforce: $2/conversation → flex credits (widely criticized as
  illegible); Salesforce paid **$3.6B for Fin (June 2026)** — the market just
  priced "packaged, outcome-billed agents for smaller teams" as the winning
  shape. Per-conversation billing (pay even when the AI fails) is getting
  buyer backlash; per-outcome is winning hearts.
- **By 2030 some buyers are agents.** Procurement via LLMs/agent-to-agent (our
  llms.txt/.md/MCP-rental surface is the early bet); "clients" = humans AND
  agents renting agents.

## 4. The valuation math ($1B at $50M ARR = 20x)

2026 reality: median SaaS trades 3.8-5.5x ARR; the AI-native band is 25-30x;
20x requires **~100% growth at $50M, NRR >120%, GM 75%+, and the labor-story
category position** (SaaS-multiple trackers, SEG ⚠). The same $50M ARR priced
as "cheap GHL alternative" is a $200-250M company. Comps: ServiceTitan trades
~7.8x at 24% growth / NDR ~110% — good business, tool multiple. GoHighLevel:
2M+ businesses served, ~$1-1.3B valuation ⚠ — distribution monster, priced as
SaaS. The multiple is won by revenue MIX + NRR, not by ARR alone.

### A $50M ARR construction that earns 20x (illustrative, 2030)

| Stream | Assumption | ARR |
|---|---|---|
| Agency subscriptions | ~6,000 agencies × ~$165/mo avg (99/199/299 ladder) | ~$12M |
| Direct SMB subscriptions | ~30,000 × ~$39/mo avg ($29 BYOK / $49 managed mix) | ~$14M |
| Payments rail | ~18k workspaces processing (≈15% attach) × $40k GMV × 2% | ~$14M |
| Managed telephony margin | ~40k numbers/lines × ~$5/mo net | ~$2.5M |
| Marketplace + agent rentals (5%) | ~$150M agent-economy GMV | ~$7.5M |
| **Total** | ~150k client workspaces · ~300-450k deployed agents | **~$50M** |

Units check: 6k agencies ≈ 0.3% of the footprint GHL already proves exists;
150k SMB endpoints ≈ ~2.5% of US service SMBs in a category headed for
majority adoption. Mix check: ~52% subscriptions / ~33% rails / ~15%
marketplace — Shopify-shaped enough for the take-rate story, subscription-heavy
enough for margin (Shopify: subs GM ~82% vs merchant ~38%).

## 5. The pricing architecture (the recommendations)

1. **Price entry for adoption, not revenue.** $29 BYOK/unlimited stays — it is
   the CAC weapon and the anti-GHL wedge on every comparison page. (Shopify
   has held a $29-39 entry for a decade while making 76% of revenue elsewhere.)
2. **Add $49/mo "Managed" (Max's idea — adopt it):** one workspace on SF keys,
   zero setup. This monetizes CONVENIENCE, not tokens — and as compute
   deflates, its margin structurally GROWS. Kills the #1 activation friction.
3. **Agency ladder on the client-count value metric:** $99 (10 clients) /
   $199 (30 + one-click multi-deploy + white-label ROI reports) / $299
   (unlimited + API/MCP + resale pricing control). Scales with THEIR revenue,
   undercuts GHL's $297/$497 at every rung.
4. **Monetize the rails, never the tokens:** 2% on payments through SF
   (Shopify principle, already the live wording), 5% marketplace, managed
   telephony at honest margin. Make the 2% collect itself by making
   client-billing-through-SF the laziest path (portal autopay, invoicing,
   dunning — mostly built via /start).
5. **Add the OUTCOME lane by 2027:** "$2-3 per booked job, capped at the
   subscription price" for direct SMBs who won't subscribe. Fin's $0.99/
   resolution (and its $3.6B exit) proves the model; the cap makes it converge
   to the subscription, so it's an on-ramp, not a tax — never-taxes survives.
6. **NRR >120% via per-client expansion,** not price hikes: more agents per
   workspace, managed number, premium voice, portal autopay, review volume.
   The runtime advisor-tool pattern (see the managed-agents spike §8) cuts
   builders' model costs ~40-50% ⚠ — hand savings to NRR-driving features,
   not to price cuts.
7. **Profitability is the default, not the goal-tradeoff:** BYOK keeps
   subscription GM ~80%+; agencies + PLG keep CAC low; rails revenue carries
   ~35-40% GM like Shopify's merchant solutions. Rule of 40 stays satisfiable
   even at moderate growth.

## 6. What must be true (probabilities, 2030 horizon)

| Claim | P | Note |
|---|---|---|
| Local-services agent penetration >30% | ~0.7 | Gartner curve; labor economics overwhelming |
| Model-cost deflation continues | ~0.9 | structural tailwind to flat+BYOK |
| Agencies remain a dominant SMB AI channel | ~0.55 | hedged: direct lane exists and strengthens as AI onboarding trivializes |
| Payments attach ≥15% of workspaces | ~0.5 bare / ~0.7 with autopay investment | the single biggest controllable lever for the multiple |
| Marketplace GMV meaningful (≥$100M) | ~0.35 | treat as call option, not base case |
| SF reaches $50M ARR by 2030 (all-in) | ~0.1-0.2 | honest top-decile-execution odds — but the architecture costs nothing extra and maximizes EV in EVERY scenario, incl. the $5-10M profitable-default-alive case |

## 7. Max's decision points

1. Adopt the $49 Managed tier (SF keys) — A/B against $29 on the claim flow?
2. Approve the 99/199/299 agency ladder (supersedes the flat-$29-only line)?
3. Green-light portal-autopay investment (the 2%-attach lever)?
4. Outcome-lane experiment (per-booked-job, capped) — 2027 or sooner?
