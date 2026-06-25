# Per-Deployment Agent Customization — Design

**Date:** 2026-06-25
**Status:** Approved (design)
**Author:** brainstormed with Max

## Problem

A builder should create **ONE** agent (e.g. "AI Phone Receptionist"), sell/deploy it, and have each client/buyer **customize their own copy** — greeting, voice, prompt, FAQ, services, business info, booking rules — without the builder cloning the agent per client. Today the agent **template** holds client-specific fields (the greeting reads "Thanks for calling Max ABC"), so to give each client their own greeting the builder clones the whole template. Result: the `/studio/agents` list shows several identical "AI Phone Receptionist" templates, each secretly wired to one client — confusing, and a violation of product-vs-config separation. (It also causes the literal "thanks for calling BUSINESS NAME" leak when a deployment's business name is blank.)

## First Principle (same as the Booking Policy)

| Layer | Table | Owner | Holds |
|---|---|---|---|
| **Agent template** = the *product* | `agent_templates` | builder | skill/tools/guardrails + **default** greeting/prompt/voice/FAQ (with `{placeholders}`) |
| **Deployment** = the *tenant instance* | `deployments` | the client/buyer | per-client **overrides** of every client-facing field + booking policy |

The agent is a SaaS app; each client is a tenant who fills the product's configurable surface. The builder builds once and sells; the buyer customizes their instance. Booking rules already work this way (P1, `deployments.booking_policy`); this generalizes the pattern to **all** client-facing fields.

## Customizable fields (per Max: everything client-facing)

greeting · voice (TTS voice id) · prompt/script · FAQ · services · business info (name, hours, address, etc.) · booking rules (already shipped).

## Mechanism: smart placeholders + full override (per Max)

1. **Template defaults carry `{placeholders}`** — e.g. greeting default `"Thanks for calling {business_name}! How can I help?"`, script references `{services}`, `{hours}`.
2. **`resolveDeploymentPersona(template, deployment)`** (pure) produces the EFFECTIVE persona used at runtime:
   - For each field: if the deployment has a **full override** → use it verbatim; else take the **template default** and **fill `{placeholders}`** from the deployment's business info (`clientContext` / the new customization).
   - Unknown/blank placeholders are **dropped cleanly** (never read a literal `{token}` aloud — this also fixes the "BUSINESS NAME" goodbye leak).
3. The voice (`deployment-voice.ts`) and chat (`run-channel-turn.ts`) persona builders call `resolveDeploymentPersona` so the agent speaks AS the client.

## Data model (additive)

- Extend `deployments` with a `customization` jsonb (or extend the existing `client_context`) holding optional overrides:
  `{ greeting?, voiceId?, script?, faq?, services?, businessInfo? }`. Booking rules stay in `deployments.booking_policy`.
- Template blueprint already holds the defaults (the agent editor's greeting/script/FAQ/voice) — relabel them in the UI as **defaults with `{placeholders}`**.

## Editing surfaces — one reusable `DeploymentCustomizationEditor`

The SAME editor (folding in the existing `BookingPolicyEditor`) renders in four places writing `deployments.customization` + `booking_policy`:
1. **Deploy flow** — a "Customize for this client" step.
2. **Clients card** (`/studio/clients`) — edit any client's customization (pre-filled from intake).
3. **Client portal** — self-serve (the existing no-login portal).
4. **Marketplace-buyer setup** — right after install/rent.

(This subsumes Booking Policy P2/P3 — same surfaces, same editor.)

## UX clarity — the agents list

- **Agents tab = your products.** Copy + affordances make clear: *"Build once, deploy to many clients — each client customizes their own copy."* Surface deployment count + client names per template.
- Template editor fields (greeting/script/voice/FAQ) are labeled **"Default — each client customizes this"**, with `{placeholder}` hints and a live preview.
- All client-specifics live on the deployment, so the builder never clones a template per client → the duplicate-list confusion disappears.

## Architecture / components

```
deployment-customization.ts   DeploymentCustomization type + resolveDeploymentPersona (pure) + fillPlaceholders
deployments schema            + customization jsonb (additive)
template blueprint            greeting/script/faq/voice already there → treated as defaults w/ {placeholders}
deployment-voice.ts /         persona builders call resolveDeploymentPersona(template, deployment)
run-channel-turn.ts
DeploymentCustomizationEditor reusable editor (deploy step · Clients card · portal · marketplace) — absorbs BookingPolicyEditor
setDeploymentCustomizationAction  org-guarded persist
agents list copy/UX           "products you build once + deploy many" + per-template client list
```

## Phasing

- **P1 (highest value + fixes a live bug):** `customization` schema + `resolveDeploymentPersona` (greeting + voice + businessInfo + placeholder-fill) wired into voice+chat + the customize editor on the Clients card + deploy step. *After P1: each client's agent greets correctly in their own voice, and the placeholder-leak goodbye is fixed.*
- **P2:** prompt/script + FAQ + services overrides; the template editor "defaults + {placeholder}" relabel + live preview.
- **P3:** client portal + marketplace-buyer customization surfaces (reuse the editor; subsumes Booking-Policy P2/P3).
- **P4:** agents-list UX clarity (copy + per-template client list).

## Non-goals (YAGNI for now)

- Per-field permissioning (builder locks specific fields from client edits) — revisit if a builder asks.
- Versioning/inheritance (re-pull template default after a client override) — later.

## Related

- Booking Policy spec `2026-06-25-per-client-booking-policy-design.md` (P1 shipped; its P2/P3 fold into this editor).
- Per-day booking hours (Max request) → evolve `BookingPolicy` weekday window into a per-day map; tracked under the booking policy, surfaced in this editor.
