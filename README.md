<div align="center">

<img src="https://seldonframe.com/brand/seldonframe-icon.svg" width="80" height="80" alt="SeldonFrame" />

# SeldonFrame

**An open-source AI front office for local-service businesses — and the white-label stack agencies resell. Website + booking + AI receptionist + intake + CRM + chatbot, wired together and live in 60 seconds from a URL.**

SeldonFrame stands up a complete front office — a website, a booking page, an AI receptionist, an intake form, a CRM, and a website chatbot — already connected on the first generation. The chatbot books against the real calendar. The intake form writes to the real CRM. Missed-call text-back fires when you can't pick up, so you never lose a lead. You edit your whole site just by chatting — no code, not technical. No Zapier, no integration work, no duct tape.

It's open-source and self-hostable, and you can drive the whole thing from Claude Code over MCP. SMBs run it as their own front office; agencies white-label it and resell it to clients. (If you've shopped GoHighLevel, [there's a comparison below](#seldonframe-vs-gohighlevel).)

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-1FAE85.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@seldonframe/mcp.svg?color=1FAE85)](https://www.npmjs.com/package/@seldonframe/mcp)
[![GitHub stars](https://img.shields.io/github/stars/seldonframe/seldonframe?color=1FAE85)](https://github.com/seldonframe/seldonframe/stargazers)
[![Discord](https://img.shields.io/badge/Discord-join-5865F2.svg)](https://discord.gg/sbVUu976NW)
[![X](https://img.shields.io/badge/follow-%40seldonframe-1d9bf0.svg)](https://x.com/seldonframe)

[Website](https://seldonframe.com) · [Docs](https://seldonframe.com/docs) · [Demo](https://seldonframe.com/demo) · [Blog](https://seldonframe.com/blog) · [Discord](https://discord.gg/sbVUu976NW)

</div>

---

## What your agency ships in 5 minutes

```
> Build a client workspace for Acme HVAC. Phoenix, AZ. AC repair and install.
  Phone (602) 555-0188.

  ● build_landing_page          200 ok
  ● build_booking_page          200 ok
  ● build_intake_form           200 ok
  ● build_website_chatbot       200 ok

  ✓ Live at acme-hvac.app.seldonframe.com
```

One prompt in Claude Code. A complete client ops stack — CRM with HVAC-specific pipeline stages, booking page wired to the actual hours and timezone, intake form with HVAC-specific fields, and a published AI chatbot that books appointments against the real calendar. All pre-wired, all branded the same, all live in under five minutes.

The agency-tier alternative builds this exact stack in **GoHighLevel**: days to weeks of per-client configuration, $97-$497/month per agency before white-label, and a real learning curve. SeldonFrame ships it in minutes.

> Live demo workspace: [phoenix-ac-air-conditioning-heating-inc.app.seldonframe.com](https://phoenix-ac-air-conditioning-heating-inc.app.seldonframe.com). Generated 2026-05-10 from a public Google Maps paste — the chatbot bottom-right books real appointments in `America/Phoenix` time.

---

## SeldonFrame vs GoHighLevel

| | GoHighLevel | SeldonFrame |
|---|---|---|
| **What it is** | All-in-one agency platform: CRM, funnels, automations, SMS/email, booking | Pre-wired client ops stack: CRM, booking, intake, chatbot — deployed per client in minutes |
| **Setup time per client** | Days to weeks. Full builds quoted at $3,500-$6,000 | Approximately 3 minutes via Claude Code MCP. One prompt generates the entire stack |
| **Learning curve** | Steep. Cited consistently as the #1 complaint in agency communities | Minimal. The agency describes the client in natural language; the stack generates |
| **Pricing** | $97-$497/month per agency. White-label costs extra | Builder $19 / Workspace $49 / Agency $297 per month (white-label, 10 client workspaces included). AGPL-3.0 — self-host for $0 |
| **Integration work** | Reduced vs. separate tools, but still significant per-client configuration | Zero. CRM, booking, intake, chatbot are pre-wired on generation |
| **Open source** | No | Yes. AGPL-3.0. Fork it, extend it for your vertical, self-host it |
| **MCP-native** | No | Yes. Drives end-to-end from Claude Code, Cursor, Cline, or any MCP client |

---

## What's pre-wired (zero glue work)

Every generated workspace ships with all surfaces connected to one workspace database:

- **AI receptionist** — answers the phone, qualifies the caller, and books straight into the calendar. Optional white-label add-on for agencies (per voice agent).
- **Missed-call text-back** — when a call comes in that nobody picks up, the caller gets a friendly text within seconds. The lead never goes cold. Wired by default to the workspace's branded sender.
- **AI chatbot** — embeds on any site, eval-gated, books appointments against the real calendar, refuses to invent prices outside the operator's configured rates. Managed AI on hosted (no key); your own key when you self-host.
- **CRM** — contacts, deals, custom fields per vertical, kanban pipeline, customer portal
- **Booking page** — source-of-truth scheduling. The customer books on the branded SeldonFrame page; the appointment lands in the CRM AND syncs to Google Calendar in real time. SeldonFrame is the authority; Google Calendar is a downstream view.
- **Intake forms** — multi-step, vertical-specific fields, auto-CRM routing
- **Edit by chatting** — change copy, prices, sections, hours — describe it in natural language and the wired graph updates. No code, no admin wizard.
- **Agent archetypes** — 7 production archetypes ship out of the box: `speed-to-lead`, `win-back`, `review-requester`, `daily-digest`, `weather-aware-booking`, `appointment-confirm-sms`, `missed-call-text-back`. Event-triggered automations on the SeldonEvent bus — configure once per workspace; the archetype fires on every matching event (e.g., a missed call texts the caller back within 30 seconds, with the agency's branded sender)
- **Partner-agency white-label** — register an agency once, attach client workspaces, and the brand chrome (logo, colors, support email, verified sender domain, optional custom domain, hide-powered-by-badge on the Agency plan) substitutes everywhere the agency operator sees the product. Driven by 5 MCP tools (`register_partner_agency`, `register_partner_agency_sender_domain`, `verify_partner_agency_sender_domain`, `attach_workspace_to_partner_agency`, `detach_workspace_from_partner_agency`)
- **Email + SMS** — Resend (email) + Twilio (SMS), templated, automation-ready
- **Durable workflows** — Vercel Workflows powering reminders, follow-ups, sequences
- **Eval gate** — chatbots run an 8-scenario suite before going live (≥87.5% to publish)
- **Brand theme** — single primary color cascades to all surfaces, instantly

No Zapier configuration. No webhook plumbing. No "and then connect tool A to tool B." The data graph is single-source by design.

---

## Quick start

Two paths. Same source code. Pick based on whether you want SeldonFrame to host the database or whether you self-host.

### Hosted (recommended for most operators and agencies)

SeldonFrame runs the Postgres database, the Next.js app, and the durable workflows on its own infrastructure (Vercel + Neon). **AI is managed and included** — no key to paste, no per-token markup, no metered usage wallet. You bring your clients and (optionally) your own domain and Twilio number.

```bash
# Drive it from Claude Code:
claude mcp add seldonframe -- npx -y @seldonframe/mcp
```

Then in Claude Code:

```
> Build a workspace for [business name]. [city, state]. [services].
  [phone, optional email].
```

Or skip the IDE and sign up at the dashboard: [app.seldonframe.com/signup](https://app.seldonframe.com/signup). Both flows hit the same hosted backend; switch between them anytime.

Hosted plans: **Builder $19/mo** (up to 10 landing pages, your domain + branding) · **Workspace $49/mo** (one full front office: website + booking + intake + CRM + chatbot, managed AI included) · **Agency $297/mo** (white-label; 10 client workspaces included, +$10/mo each beyond; optional AI voice receptionist +$99/mo per agent). Flat, seat-based, no contract. See [seldonframe.com/#pricing](https://seldonframe.com/#pricing).

### Self-host

Run the entire stack on your own infrastructure. AGPL-3.0 source code, full control over data, deploy target, and customization. If you modify SeldonFrame and run it as a network service, your modifications must be shared under AGPL terms — see [LICENSING.md](LICENSING.md). For closed-source embedding or commercial SaaS without the copyleft requirement, the hosted Agency plan is the commercial license alternative.

```bash
git clone https://github.com/seldonframe/seldonframe
cd seldonframe
pnpm install
pnpm dev      # → http://localhost:3000
```

Requires: Node 20+, Postgres 15+, an Anthropic or OpenAI API key. See [docs/getting-started/connect-claude-code](https://seldonframe.com/docs/getting-started/connect-claude-code) for the full setup.

---

## FAQ

### How does SeldonFrame compare to GoHighLevel?
SeldonFrame is the open-source alternative to GoHighLevel. Both bundle CRM, booking, and chatbot for businesses and the agencies that serve them. The difference is deployment time, cost, and openness. GoHighLevel requires days-to-weeks of configuration per client and costs $97-$497/month per agency before white-label. SeldonFrame stands up the pre-wired equivalent in about 3 minutes from one Claude Code prompt, runs on flat seat-based pricing (Builder $19 / Workspace $49 / Agency $297) with managed AI included, and is AGPL-3.0 if you want to self-host for $0.

### How long does it take to deploy a client ops stack?
Approximately 3 minutes from a single Claude Code prompt. The MCP server generates a CRM with vertical-specific pipeline stages, a booking page wired to the client's hours and timezone, an intake form with vertical-specific fields, and an AI chatbot that books against the real calendar. All four surfaces share one workspace database; nothing needs to be wired by you after generation.

### Can I white-label SeldonFrame for my agency clients?
Yes — that's the Agency plan ($297/mo): white-label brand everywhere, 10 client workspaces included (+$10/mo each beyond), and an optional AI voice receptionist (+$99/mo per agent). Each workspace runs on its own subdomain (`client-slug.app.seldonframe.com`) or a custom domain. Per-workspace branding includes logo, colors, hero copy, and the chatbot's voice. Self-host under AGPL-3.0 if you want full visual control without any SeldonFrame chrome.

### Is SeldonFrame free?
The code is. SeldonFrame is AGPL-3.0, so you can **self-host the entire stack for $0** — you just supply your own Anthropic or OpenAI key for the AI. The hosted product is paid and flat: **Builder $19/mo** (up to 10 landing pages, your domain + branding), **Workspace $49/mo** (one full front office: website + booking + intake + CRM + chatbot), **Agency $297/mo** (white-label; 10 client workspaces included, +$10/mo each beyond). Managed AI is included on every hosted plan — no key to paste, no per-token markup, no metered usage wallet. No contract.

### What verticals does SeldonFrame support?
20+ vertical archetypes ship out of the box. Trades use bold-urgency (HVAC, plumbers, electricians, roofers, locksmiths). Medical and legal use clinical-trust (dental, chiropractors, attorneys, accountants). Beauty verticals use cinematic-aspirational (medspas, salons). Creative verticals use editorial-warm (real estate, photographers). The MCP detects the right archetype from the client's business description; each archetype changes hero copy, intake fields, pipeline stages, and chatbot tone.

### Do I need to know how to code?
No. The agency uses Claude Code with the SeldonFrame MCP server — describe the client in natural language and the workspace generates. No integration code, no Zapier wiring. A web dashboard exists for non-Claude-Code users at app.seldonframe.com, though the Claude Code workflow is 5-10x faster for multi-surface structural changes.

---

## Architecture at a glance

```
┌──────────────────────────────────────────────────────────────────────┐
│  Agency / freelancer                                                 │
│  Designs, sells, and maintains client ops stacks                     │
└──────────────────────────────────────────────────────────────────────┘
                                  ↕  natural language
┌──────────────────────────────────────────────────────────────────────┐
│  IDE-resident agent                                                  │
│  Claude Code · Cursor · Windsurf · Devin · custom MCP clients        │
└──────────────────────────────────────────────────────────────────────┘
                                  ↕  Model Context Protocol
┌──────────────────────────────────────────────────────────────────────┐
│  SeldonFrame MCP server  ────────────────────────────  thin harness  │
│  Typed tool surface · workspace state · capability map               │
└──────────────────────────────────────────────────────────────────────┘
                                  ↕
┌──────────────────────────────────────────────────────────────────────┐
│  Skill-pack registry  ────────────────────────────────  fat skill    │
│  Markdown · per-archetype · runtime-composed into the system prompt  │
└──────────────────────────────────────────────────────────────────────┘
                                  ↕
┌──────────────────────────────────────────────────────────────────────┐
│  Runtime                                                             │
│  Next.js 16 · Postgres (Drizzle) · Vercel Workflows · AGPL-3.0       │
│  Eval gate (8-scenario suite, ≥87.5% to publish, regen on critical)  │
└──────────────────────────────────────────────────────────────────────┘
                                  ↕
┌──────────────────────────────────────────────────────────────────────┐
│  Managed AI (hosted) / your own key (self-host)                      │
│  Anthropic · OpenAI · Stripe · Twilio · Resend · Google Calendar     │
└──────────────────────────────────────────────────────────────────────┘
```

You own every layer: SeldonFrame is AGPL-3.0; the customer data is yours; the deployed code is yours. On hosted, AI is managed for you (no key to bring); when you self-host, the database and the LLM key are yours too.

---

## The architectural bet

SeldonFrame is built on one decision: **the LLM is the application layer, the platform is plumbing.**

Most AI tools wrap a chatbot UI around an LLM, then hardcode the "intelligence" into TypeScript heuristics that get worse every time the model gets better. SeldonFrame inverts this:

- **Thin platform** — the harness is intentionally simple. A typed MCP tool surface, a block manifest, durable workflows, an eval runtime. None of it tries to be smart.
- **Fat skill** — every behavioral decision lives in markdown skill-packs the prompt composer reads at runtime. Edit a skill, ship intelligence. No code change.
- **Antifragile** — when Claude / GPT / Gemini get better, every SeldonFrame workspace gets better. We don't rewrite the platform; we let the model do more of the work.

The result for agencies: a client's chatbot in 2027 will be measurably better than its 2026 version, on the same SeldonFrame code, because the model improved. Your existing clients benefit without you re-shipping anything.

---

## Examples — typical agency prompts

```js
// Build the entire client stack from one sentence
> Build a client workspace for Acme Dental. Boston, MA.
  Cleanings ($120), fillings ($200-450), whitening ($350).
  Phone (617) 555-0100. We do same-day emergencies.

// Add a chatbot to an existing workspace
> Build a website chatbot for Acme Dental that books cleanings,
  refuses to quote prices outside the configured list, and escalates
  broken-tooth calls to (617) 555-0100. Use the workspace's LLM key.

// Update without breaking the wired graph
> Raise the cleaning price from $120 to $135. Add a "before-and-after
  photos" FAQ pointing to /gallery. Re-run evals.

// Bring your own design system
> Apply this DESIGN.md to the Acme Dental workspace.

// Tune motion intensity
> Make the Acme Dental pages feel more editorial. Counters on the
  stats, magnetic CTAs, slower reveals.
```

Each prompt resolves to 1-6 MCP tool calls. No clicking through admin wizards. No Zapier glue.

---

## What's interesting to contribute to

If you want to read or hack on the codebase, these are the parts where the architectural bets are most visible:

| Area | Path | What's interesting |
|------|------|--------------------|
| **MCP tool registry** | `skills/mcp-server/src/tools.js` | The typed tool surface and `USE-WHEN` triggers. Adding a new capability = one entry. |
| **Agent archetypes** | `packages/crm/src/lib/agents/archetypes/` | Event-triggered agent definitions, one TypeScript file each. Adding a new archetype = new file + one import in `index.ts`. The thin-harness side of the agent loop. |
| **Skill packs** | `packages/crm/src/lib/agents/skills/` | Agent intelligence as markdown. Edit prose, ship behavior. The fat-skill layer. |
| **Eval gate** | `packages/crm/src/lib/agents/eval-runner.ts` + `fallbacks.ts` | LLM regeneration on critical-fail. The runtime that catches its own hallucinations. |
| **Block library** | `packages/crm/src/components/landing/sections/` | The user-facing page primitives. New verticals = new blocks here. |
| **Motion primitives** | `packages/crm/src/components/motion/primitives.tsx` | Thin wrappers over `motion/react`. Composable, theme-aware, antifragile. |
| **Workflows** | `packages/crm/src/lib/workflows/` | Vercel Workflows (`"use workflow"`) for durable, sleep-without-burning-compute flows. |

**Not interesting**: the routing scaffolding, the auth boilerplate, the env-var wiring. Standard Next.js. Skip those if you're contributing intelligence, not infrastructure.

---

## Tech stack

- **Frontend**: Next.js 16 (Turbopack) · React 19 · Tailwind v4 · [motion](https://github.com/motiondivision/motion) · shadcn/ui
- **Backend**: Next.js API routes · Postgres (Neon) · Drizzle ORM · Vercel Workflows
- **AI**: Anthropic SDK · OpenAI SDK · Vercel AI SDK · MCP (TypeScript SDK)
- **Integrations**: Stripe · Twilio · Resend · Google Calendar (more via MCP servers)
- **Deploy**: Vercel · Docker · self-host

The full stack is described in our [stack](https://seldonframe.com/docs) docs. Open-source dependencies; no proprietary infrastructure required.

---

## Two install paths, same product

| | Self-host | Hosted |
|---|---|---|
| Cost | $0 (self-host) | $19 / $49 / $297 (hosted) |
| Plans | run it yourself | Builder / Workspace / Agency |
| Client workspaces | unlimited | 1 (Workspace) · 10+ (Agency, +$10/mo each) |
| Custom domain | yes (you bring) | yes |
| White-label | full | full (Agency) |
| AI | yes (your own key) | managed (hosted) / yes (self-host) |
| Source code | full | same |
| Updates | `git pull` | automatic |
| Support | community | email + Discord priority |

Self-hosted and hosted run identical code. The difference is who runs the database and the AI: self-host and you bring your own key for $0; go hosted and AI is managed for you on a flat, predictable plan.

---

## Bring your own design tools

SeldonFrame is **MCP-native and design-tool-agnostic**. Bring whatever you already use:

- **Anthropic Claude Design** — `import_claude_design_handoff({ bundle })` parses the handoff bundle, applies tokens, surfaces components for review.
- **Google Labs DESIGN.md** — `apply_design_md({ design_md_content })` parses YAML front matter and applies tokens to your workspace theme.
- **v0 / Lovable / Cursor / Windsurf** — generated React/Tailwind drops directly into the block library. Wire via `update_landing_page` or paste into Puck (the visual editor — already integrated).
- **Direct fork** — AGPL-3.0. Edit any block component, add custom blocks, deploy.

The architecture lets every AI design tool feel like a first-class extension. We don't compete with their UX — we accept their output.

---

## Roadmap

The bets we're making, in rough order. Each is contributor-friendly — drop into Discord or open a GitHub Discussion to claim a piece.

### Soon

- **Voice + SMS transports** — same chatbot, three channels. The chatbot you build today answers the phone tomorrow. Twilio + Vapi/Retell on the voice side; Twilio + WhatsApp Business on messaging. Eval-gated per channel (different scenarios for "phone interruptions" vs "late-night SMS").
- **Self-improving agents** — runtime telemetry feeds back into skill-pack proposals. After 100 conversations, an agent can say *"I noticed customers ask about X 30 times — here's a draft skill addition. Approve or reject?"* Operator stays in the loop; agent does the work.
- **Renderer-level motion preset gating** — `minimal` short-circuits motion entirely; `editorial` adds Counter, MagneticButton, TextReveal.

### Mid-term — where the architecture starts to compound

- **Multi-agent orchestration** — agents that hire other agents. The booking agent calls a fraud-detection agent for high-value bookings. The intake-form agent calls a pricing-quote agent that calls a calendar-availability agent. Each agent has its own eval gate and its own MCP tool surface. Composing them is one prompt.
- **Skill-pack marketplace with revenue share** — community contributors publish vertical-specific skill packs ("Ambulance dispatch flow," "Real estate showing scheduling," "Wedding-photography pre-shoot intake"). The marketplace handles discovery, eval verification, and payouts. Skill packs are markdown — barrier to entry is *writing*, not engineering.
- **Vertical templates marketplace** — pre-built workspaces for industries beyond the current archetypes. Community-curated, eval-verified. *"Start a yoga studio"* → instant Business OS with vertical-tuned chatbot, intake fields, pipeline stages.

### Long-term — the agent era

- **Federated agent network** — agents from different SeldonFrame workspaces can negotiate. Your booking agent talks to a vendor's quote agent. A real-estate agent talks to a mortgage-lender agent. Agent-to-agent commerce as an emergent capability of the open MCP surface.
- **Long-running agency agents** — an agent that operates a client workspace for a week and reports back. *"I closed 12 deals, escalated 3, refunded 2, scheduled 47 appointments. Here's the trail."*
- **Agent fleet operations** — agencies running 100+ client workspaces from one console. Bulk skill-pack deployment, fleet-wide eval rollouts, comparative analytics across client agents.

Comment on what's missing or vote on priorities in [GitHub Discussions](https://github.com/seldonframe/seldonframe/discussions). The most interesting issues get labeled `architecture` and `help wanted`.

---

## Why open source

Three reasons we ship the entire platform under AGPL-3.0:

1. **The customer wins.** No vendor lock-in. If we ever get acquihired, shut down, or pivot, every client workspace keeps running on your infrastructure. Forever.
2. **The architecture wins.** Open-source pressure forces clean abstractions. We can't hide complexity behind a closed binary; the codebase has to make sense to a stranger.
3. **The community wins.** Vertical-specific skill packs (HVAC, dental, legal, real estate) are easier to contribute than to centralize. The marketplace is the moat.

Inspired by the open-source approach of [Twenty](https://github.com/twentyhq/twenty), [Postiz](https://github.com/gitroomhq/postiz-app), and [Cal.com](https://github.com/calcom/cal.com).

---

## Contributing

The fastest path:

1. Pick something from the **What's interesting to contribute to** table above
2. Read [CONTRIBUTING.md](CONTRIBUTING.md) for our PR conventions
3. Open a discussion before starting non-trivial work — saves you from rewriting after review
4. Tests: write eval scenarios for any agent-behavior change, write Vitest for runtime changes
5. Style: we use Prettier + ESLint; CI fails the PR if formatting drifts

We mark issues with `good first issue`, `help wanted`, and `architecture` labels — check those first.

---

## Community

- 💬 [Discord](https://discord.gg/sbVUu976NW) — fastest way to get help, feedback, or just say hi
- 🐦 [@seldonframe on X](https://x.com/seldonframe) — release notes, tips, dogfood notes
- 📚 [Docs](https://seldonframe.com/docs) — operator-facing guides, deeper than this README
- 🐛 [GitHub Issues](https://github.com/seldonframe/seldonframe/issues) — bugs and feature requests
- 📡 [GitHub Discussions](https://github.com/seldonframe/seldonframe/discussions) — architecture talk, roadmap voting, "is this a good idea" threads
- ✉️ Sponsorships and partnerships: [hello@seldonframe.com](mailto:hello@seldonframe.com)

## Sponsors

Sponsorship slots open. If your tool fits agencies and operators (Twilio, Resend, Stripe, Anthropic, Postgres providers, deploy platforms, etc.) and you want a logo on this README + docs surface, [reach out](mailto:hello@seldonframe.com).

---

## License

[AGPL-3.0](LICENSE) — for the platform, the MCP server, the docs, the marketing site, the eval suite, the skill packs. The whole monorepo.

If you self-host SeldonFrame, your modifications stay open under AGPL terms. If you want to embed SeldonFrame in a closed-source product or run a hosted SaaS without the copyleft requirement, our **hosted Agency plan** is the commercial license alternative — see [LICENSING.md](LICENSING.md) for details.

This is the same dual-license model used by [Postiz](https://github.com/gitroomhq/postiz-app), [Mattermost](https://github.com/mattermost/mattermost), and [Plausible](https://github.com/plausible/analytics). It keeps the platform genuinely open, protects against closed-source clones, and creates a real commercial path for agencies who need it.

The architectural bet — thin platform, fat skill, antifragile to LLM improvements — only works if everything's open. So everything is.

<div align="center">

Built for agencies who'd rather generate than configure.

</div>
