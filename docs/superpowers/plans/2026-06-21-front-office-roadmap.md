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
