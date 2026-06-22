# SeldonFrame Front-Office Roadmap (ICP-3 deploy arc) — Status @ 2026-06-21

Consolidated "where we stand" for the build-and-sell-a-voice-agent → whitelabel-front-office arc.
Strategy detail in memory: `seldonframe-positioning-synthesis`, `agent-builder-primitives`, `seldonframe-shopify-vision`.

## 0. Locked strategy (the frame)
- **Positioning:** *never-lies* (grounded + read-back + guardrails + auto-evals = fat skills) · *never-taxes* (flat $29, owned/portable, no lock-in) · *never-goes-stale* (thin harness rides every model gain free). **BYOK demoted to plumbing.**
- **Integration posture:** SeldonFrame is the **source of truth that pushes outward** (ICS + MCP-native) — **no Zapier**. Own the ~6-category Pareto natively + vetted MCP broker + BYO-MCP tail.
- **Calendar/connectors:** **BYO-OAuth-app** — the builder registers their *own* OAuth app once, SF reuses it per client → SF never does Google CASA. Makes Nylas / Cal.com / self-hosted cal.diy unnecessary.
- **Deliverable:** a **whitelabel AI front office per client** (agent + CRM + calendar + dashboard + portal, under the agency's brand). **Agency operates it + shares a portal.** Provisioning = **Model C** (below).

## 1. ✅ Shipped to main (this arc)
| Build | What it does | Commit | Migration |
|---|---|---|---|
| Per-client persona | deployed agent speaks the **client's** services/FAQ (not generic) | `b27201ff` | 0026 (additive) |
| Calendar-provider abstraction | `bookingMode` = native / external_link / api_mcp / cal_com + deploy-wizard chooser | `37903b80` | 0027 (additive) |
| ICS-push | every booking emails an `.ics` → lands in the **owner's + customer's** real calendar (zero OAuth) | `c526ebbb` | none |

*Earlier this session, already merged:* the agent builder (describe→generate→test→deploy), the Builder Fix Pass (persona isolation + UX), and telephony 2.2 (BYO-Twilio number provisioning on deploy). The full describe→deploy→get-a-number loop is live.

## 2. ✅ Decided, not yet built
- **Bridge provisioning = Model C:** every deployment **isolates** into its own client org from day one (leads/bookings land in the *client's* workspace, portal-ready, no later migration); the **client portal login is opt-in** (agency flips it on when ready); the agency operates it throughout. **Billing:** front office folded into the deployment price (no separate per-client workspace charge).
- **BYO-OAuth-app** is the real two-way calendar/connector path (premium tier).
- **MCP posture:** own-Pareto + vetted-broker + BYO-MCP; no Zapier.

## 3. 🔜 Remaining (sequenced)
1. **THE BRIDGE → whitelabel front office (NOW — mid-brainstorm).** Model C locked. Open brainstorm questions:
   - **Q2:** v1 front-office scope — CRM + calendar + portal only, or also landing + reviews on day one?
   - **Q3:** client portal-login UX — how/where the agency flips on the client's magic-link access.
   - **Q4:** the **agent-writes-to-client-org rewiring** — today the deployed agent's bookings/leads target `builderOrgId`; Model C means they must target the new `clientOrgId`. (Composes with the per-client persona + bookingMode already shipped.)
   - Then **spec → build:** `deployments.clientOrgId` FK · auto-provision a client org on deploy · attach to the builder's agency (`parentAgencyId`) · seed the portal template + branding · retarget the agent's CRM/booking writes · opt-in portal-login toggle.
2. **BYO-OAuth-app relay** — Connections page (builder registers their OAuth app once, reused per client) + SF consent flow + encrypted token store + direct Google/MS Calendar API calls. The real two-way calendar upgrade. *Build when two-way is demanded.*
3. **MCP connector layer** — vetted broker (OAuth-scoped, hosted-not-stdio) + BYO-MCP. Composes on #2.
4. **Deferred:** ICS reschedule/cancel (`SEQUENCE`+1 / `METHOD:CANCEL`) + the `webcal` subscribe feed; a managed two-way broker (Nylas/cal.diy) as an optional premium if BYO-OAuth-app proves too much for some builders.

## 4. 🧪 Live smoke gates (need Max + a phone / preview)
- **Telephony:** set `voiceTrunkSid` (839 `TK…`) in Settings → deploy → Get a number → call → answers as client + books → 839 line still works → cancel releases the number.
- **Persona:** deploy with a client description → Auto-fill → call → agent speaks the client's services/FAQ.
- **Booking chooser:** deploy → pick "their own booking link" → call → agent hands off the link.
- **ICS-push:** place a booking on a preview → `.ics` lands in a real Google/Outlook calendar (owner + customer).

## 5. Other open tracks (not this arc)
- **#139** Pricing backend (Stripe $19/$49/$297 per-workspace billing) — in progress, separate track.
- **#131** operator-portal design-system Wave 2 · **#135** recurring appointments · **#124/#125** SMB-pivot / Seldon-Studio go-live.

---

# UPDATE — end of 2026-06-21 (bridge shipped)

## ✅ Now shipped to main (the whole arc)
| Build | Commit |
|---|---|
| Per-client persona | `b27201ff` (0026) |
| Calendar-provider menu | `37903b80` (0027) |
| ICS-push | `c526ebbb` |
| **Front-office bridge** (deploy→activate spins an isolated agency-branded client workspace; agent writes everything there; portal opt-in; archive-on-cancel) | `07a298ce` (0028) |

**The deliverable is complete:** a builder describes an agent → tests → deploys → gets a number → and the client automatically receives a full **whitelabel AI front office** (agent + CRM + calendar + portal + landing + reviews), agency-branded, that the agent writes into and the agency operates.

## 🔓 What the bridge unlocks
- **A 10× deliverable vs Vapi/Retell** — they hand over an agent + raw transcripts; we hand over a running business front office under the agency's brand.
- **True per-client isolation + multi-tenancy** — every deployment is its own workspace; the "agency-of-agencies" topology is real.
- **The native calendar is now real** — `bookingMode: native` books into the client's *own* workspace calendar + ICS-pushes outward (no vendor, no CASA).
- **The portal = the recurring-revenue hook** — the client logs into a branded system their leads/bookings live in (sticky).
- **The agency dashboard already aggregates it** (MRR rollup, operate-via-support-session) — the resale business runs on existing rails.

## 🔜 Remaining
1. **Live smoke** (deploy→activate→branded workspace→call→data in client org→cancel→archived).
2. **BYO-OAuth-app relay** (real two-way calendar; premium) — when demanded.
3. **MCP connector layer** (vetted-broker + BYO-MCP) — composes on #2.
4. Deferred: ICS reschedule/cancel + webcal feed; reactivation-from-archive; backfill legacy deployments; chat-deploy parity.

## 🎯 Clean positioning (vs what exists, against ICP pain)
**One-liner:** *SeldonFrame is the AI front office that never lies, never taxes your work, and never goes stale — live in 60 seconds, yours to keep, and (for agencies) yours to resell under your brand.*

| Alternative | Their pain | SeldonFrame |
|---|---|---|
| **Vapi / Retell** (voice toolkits) | agent + API + you duct-tape CRM/calendar/site; per-minute bill-shock; lock-in | the *whole* front office, flat-priced, owned, never-lies |
| **GoHighLevel** (all-in-one) | 6–8wk learning curve; surprise SMS/AI bills; $497 white-label paywall; Frankenstein; robotic bots | live in 60s; flat; white-label included; grounded + never-double-books |
| **Human receptionist / answering service** | $400–$4,000/mo; business hours; sick days; misses calls | a fraction of the cost; 24/7; never misses; books into the real calendar |
| **DIY on model APIs** | months of OAuth/CASA/evals/glue; goes stale as models change | antifragile thin harness — rides every model gain for free |

## 💯 Hormozi $100M-Offer evaluation

**The Value Equation** — Value = (Dream Outcome × Perceived Likelihood) ÷ (Time Delay × Effort/Sacrifice). SeldonFrame maxes the numerator AND crushes the denominator:
- **Dream Outcome ↑↑** — "never miss a job again" (SMB) / "a resellable product that prints recurring revenue under your brand" (agency).
- **Perceived Likelihood ↑** — never-lies (grounded + read-back + no double-book), the *call-it-yourself* live demo, books into *their* real calendar (proof). *Gap: no explicit guarantee yet.*
- **Time Delay ↓↓ (the killer lever)** — live in **60 seconds** vs GHL's 6–8 weeks.
- **Effort/Sacrifice ↓↓** — one English sentence; no rebuild; no keys to babysit; agency-branded out of the box; flat price (no bill-shock anxiety); owned (no lock-in fear).
→ **Structurally a Grand Slam Offer.** The denominator (60s + one sentence) is where it dominates every alternative.

**Escape the commodity war:** never sell "a voice agent" (compared on per-minute price). Sell "a complete white-label AI front office, live in 60 seconds, that never lies." Uncompared → no price-shopping.

**Problem → Solution stack** (every ICP pain has a deliverable): miss calls→24/7 agent; cold leads→speed-to-lead + missed-call text-back; robotic/hallucinating bot→grounded + read-back + get_quote_range; bookings not in my calendar→native + ICS-push; weeks to set up→60s from a sentence; surprise bills→flat $29; lock-in→owned/portable; goes stale→antifragile; (agency) can't resell profitably→white-label front office, no paywall, agency operates + portal; duct-taped stack→one connected system.

**Guarantees to ADD (Hormozi's highest-leverage missing piece):**
- *Reliability:* "Your agent never quotes a wrong price or double-books — or we make it right."
- *Speed:* "A live front office in 60 seconds — or it's free."
- *Keep-the-asset:* first workspace **free forever** (already true → an implied guarantee; make it explicit).
- *Agency risk-reversal (already baked in):* "We only take our cut when YOU get paid (GMV fee). We don't tax your work." — a Hormozi-grade reversal; lead with it.

**Pricing read:** $29 flat + GMV (5→3→2%) + marketplace fee. The "we only win when you win" GMV alignment is excellent risk-reversal. Watch-out: $29 flat may *under-price* perceived value (it replaces a $4k/mo receptionist + a $300/mo GHL stack) — so **never sell on the $29; value-anchor** ("one booked job pays for it 10× over"). The $29 is the land-and-expand wedge; the GMV is the upside — sound, *as long as SF is genuinely the sales channel* often enough for the GMV to fire (else it's under-monetized).
