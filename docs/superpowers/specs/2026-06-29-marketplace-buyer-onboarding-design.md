# Marketplace Buyer Onboarding — Design

**Date:** 2026-06-29
**Status:** Approved (brainstorm). Next: implementation plan (writing-plans).
**Related:** the marketplace billing rail (#139, direct charges, all 4 price models, LIVE-verified), per-deployment customization (`src/lib/agents/persona/deployment-customization.ts`), per-deployment Composio booking (`src/lib/agents/booking/`), the buy-funnel fix (`21525a9f`, callbackUrl survives signup → `?install=1` finish-checkout). The funnel fix is DONE and out of scope here — this is the AFTER-purchase journey.

## Persona & vision

A **marketplace buyer** is a first-class persona, distinct from the agency operator. They buy ONE agent on the marketplace, get it working by configuring the non-technical parts (business info, hours, connect their calendar, point a phone number), and run it on SeldonFrame infra using their own outside tools (via Composio). **SeldonFrame is where they customize and run their agent.** They never touch the agency app (`/clients/new`, the CRM, the multi-client dashboard).

Success = a non-technical SMB (e.g., a plumber) can go from "just paid" to "my AI receptionist is answering my phone and booking jobs" in a few friction-free minutes.

## Decisions (locked in brainstorm)

1. **Account = a focused "My Agent" home.** The buyer only sees their agent(s), the setup, and the activity (calls/bookings/messages). No agency surfaces.
2. **Phone = offer both** — bring-your-own (forward an existing number) OR provision a fresh one (Twilio), chosen in onboarding.
3. **Pay-first → configure.** Onboarding is POST-purchase. (The funnel fix lands the buyer at checkout; this design starts the moment Stripe succeeds.)
4. **Generic engine from day one.** The onboarding is generated from the agent's needs (its surface + required tools + config fields), not hardcoded per agent. The 24/7 Receptionist is the first/reference agent.
5. **No AI-key step for the buyer.** The AI key is the BUILDER's responsibility, set at the template level in Studio (`/studio/agents`). The buyer's deployment resolves the builder's key. Implication: the builder bears AI COGS for their buyers' usage and prices the agent to cover it (correct marketplace economics). Infra note: voice currently uses the platform OpenAI key — route it to resolve the builder/template key (fail-soft to platform).

## The journey

```
Marketplace listing → Buy (Stripe, direct charge) → SET UP YOUR <AGENT> wizard → MY AGENT home
                                                     (generated, friction-free)   (status · activity · reconfigure · billing)
```

## A. The generic onboarding engine

The core mechanism. A pure function turns an agent's blueprint into an ordered list of wizard steps:

`buildOnboardingSteps(blueprint, deploymentState) -> OnboardingStep[]`

Inputs read from the agent template's `blueprint`:
- **surface** — `voice | chat | sms | email` (drives the phone step + the test step kind).
- **bound connectors/tools** — the Composio toolkits the agent uses (e.g. `googlecalendar`) → an OAuth "Connect <tool>" step each.
- **config fields** — `businessInfo`, `greeting/script`, `faq`, `services`, `booking policy / hours`.

Output steps (ordered, each one-thing-per-screen, smart-defaulted, skippable-but-nudged):
1. **About your business** (always) — name, what you do, services + prices, hours. *Optional accelerator: paste your website → pre-fill via the existing extraction engine.* Writes `deployment.customization.businessInfo` + `services` + `booking_policy.hours`.
2. **Connect <tool>** (one per OAuth connector) — e.g. Google Calendar via Composio → writes `deployment.calendar_ref`.
3. **Your phone** (if surface includes voice) — forward an existing number OR provision a new one. Writes the deployment phone number (+ SIP wiring).
4. **Hear it work** (if testable) — a live test call (voice) or a chat preview (chat) against the configured deployment in `status:test` (money-safe, no live connectors fired beyond the test).
5. **Go live** (always) — activate: forward calls / publish the widget. Flips the deployment to active.

Each step maps to existing deployment config writes — the engine is a thin layer over infra that already exists.

## B. The "Set up your <Agent>" wizard

- A clean, branded, full-screen first-run flow — NOT `/clients/new`. One idea per screen, a slim progress indicator, a persistent "you can finish this later" exit to the home.
- Reads `buildOnboardingSteps()`; renders each step with its own focused control. Saves after every step (resumable — `deployment.onboarding_progress`).
- The "Hear it work" step is the emotional peak (Marc Lou: show, don't tell) — the buyer talks to their agent before going live.
- On "Go live," a celebratory confirmation → routes to the My Agent home.

## C. The "My Agent" home

The focused buyer dashboard (the account from Decision 1). Sections:
- **Agent header** — name, status chip (Live / Setting up / Paused), the phone number / channel.
- **Activity** — recent calls, bookings, messages, take-a-messages (reads the deployment's conversations/bookings). The "is it working?" proof.
- **Configure** — re-open any wizard step (edit business info, greeting, hours, reconnect a tool). Reuses the same step components.
- **Billing** — manage subscription (the buyer billing-portal action), plan, next bill.
- NO agency surfaces. If the buyer somehow lands on `/clients/new` or the agency dashboard, redirect them here.

## Architecture & reuse

- **Buyer's purchase yields a deployment.** Reuse the deployment model (deployment = a template's tenant config + activation: `customization`, `booking_policy`, `calendar_ref`, phone number, status). The key wiring: a marketplace purchase by a buyer creates a **buyer-owned deployment** of the listing's template (today the install clones a *template* into the buyer org — we route the buyer to a deployment instead so the agent is runnable with a phone + calendar + go-live, not just an editable template). The buyer's org owns the deployment.
- **The wizard writes deployment config** via the existing actions (`setDeploymentCustomizationAction`, `setBookingPolicyAction`, the Composio connect step, the number-provisioning action).
- **The home reads the deployment** + its conversations/bookings.
- **AI key** resolves from the builder/template (see Decision 5).
- **The generic engine** (`buildOnboardingSteps`) is the only substantial net-new pure logic.

## Data model (mostly reuse)

- Reuse `deployments` (customization / booking_policy / calendar_ref / phone / status).
- New (additive, jsonb on the deployment): `onboarding_progress` (which steps done, resume point). No new tables expected; confirm in the plan.
- A buyer-scoped read for the home (the deployment + activity), org-scoped to the buyer.

## Edge cases / error handling

- **Resumable:** every step saves; the buyer can close + return to the exact step.
- **Skippable-but-nudged:** non-blocking steps (e.g. connect calendar) can be skipped; go-live is gated only on true blockers (e.g. a voice agent with no phone number).
- **Builder key missing:** if the builder hasn't set an AI key, the agent can't run — surface a clear "this agent isn't ready yet" state to the buyer (and flag the builder), fail-soft to the platform key where allowed for v1.
- **Composio connect failure / fail-soft:** booking falls back to native (existing behavior).
- **Money:** no charge in onboarding (pay already happened); the test step runs in `status:test`.

## Phasing (for the plan)

- **P0** — the generic engine (`buildOnboardingSteps`, pure, TDD) + the buyer→deployment wiring on purchase.
- **P1** — the wizard shell + the "About your business" + "Go live" steps (the minimum to a live receptionist), writing deployment config.
- **P2** — the "Connect calendar" (Composio) + "Your phone" (BYO/provision) steps.
- **P3** — the "Hear it work" test step.
- **P4** — the "My Agent" home (status · activity · reconfigure · billing).
- **P5** — AI-key routing (builder/template key for voice) + the redirect-buyers-away-from-agency-surfaces guard.

## Out of scope

- The buy funnel (done — `21525a9f`).
- The full agency operator app (unchanged).
- A dedicated buyer marketing site (the marketplace listing is the top of funnel).

## Open questions (resolve in the plan)

- Exact buyer↔deployment ownership (buyer org owns the deployment directly vs the `client_org_id` model) — pick the simplest that gives the buyer a runnable, billable, manageable agent.
- Whether the test call consumes the builder's AI key (it should — it's the builder's product) and any guard so a test can't be abused.
