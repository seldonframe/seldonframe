<div align="center">

<img src="https://seldonframe.com/brand/seldonframe-icon.svg" width="80" height="80" alt="SeldonFrame" />

# SeldonFrame

**The open-source alternative to GoHighLevel. A pre-wired client ops stack agencies deploy per client in minutes.**

SeldonFrame generates a complete client operations stack — CRM, booking page, intake form, AI chatbot — already connected on the first generation. The chatbot books against the real calendar. The intake form writes to the real CRM. The booking page respects the client's hours and timezone. No Zapier, no integration work, no duct tape. Built for freelance web designers and small agencies (1-5 people) serving local service businesses.

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
| **Pricing** | $97-$497/month per agency. White-label costs extra | Free tier with no credit card. $29/$99 paid plans. AGPL-3.0 — self-host for $0 |
| **Integration work** | Reduced vs. separate tools, but still significant per-client configuration | Zero. CRM, booking, intake, chatbot are pre-wired on generation |
| **Open source** | No | Yes. AGPL-3.0. Fork it, extend it for your vertical, self-host it |
| **MCP-native** | No | Yes. Drives end-to-end from Claude Code, Cursor, Cline, or any MCP client |

---

## What's pre-wired (zero glue work)

Every generated client workspace ships with all four surfaces connected to one workspace database:

- **CRM** — contacts, deals, custom fields per vertical, kanban pipeline, customer portal
- **Booking page** — source-of-truth scheduling. The customer books on the client's branded SeldonFrame page; the appointment lands in the CRM AND syncs to Google Calendar in real time. SeldonFrame is the authority; Google Calendar is a downstream view.
- **Intake forms** — multi-step, vertical-specific fields, auto-CRM routing
- **AI chatbot** — embeds on any site, eval-gated, BYOK, books appointments against the real calendar, refuses to invent prices outside the operator's configured rates
- **Email + SMS** — Resend (email) + Twilio (SMS), templated, automation-ready
- **Durable workflows** — Vercel Workflows powering reminders, follow-ups, sequences
- **Eval gate** — chatbots run an 8-scenario suite before going live (≥87.5% to publish)
- **Brand theme** — single primary color cascades to all surfaces, instantly

No Zapier configuration. No webhook plumbing. No "and then connect tool A to tool B." The data graph is single-source by design.

---

## Quick start

Two paths. Same source code. Pick based on whether you want SeldonFrame to host the database or whether you self-host.

### Hosted (recommended for most agencies)

SeldonFrame runs the Postgres database, the Next.js app, and the durable workflows on its own infrastructure (Vercel + Neon). You bring your LLM key, your clients, and (optionally) your domain. Free tier; no credit card.

```bash
# Drive it from Claude Code:
claude mcp add seldonframe -- npx -y @seldonframe/mcp
```

Then in Claude Code:

```
> Build a client workspace for [client name]. [city, state]. [services].
  [phone, optional email].
```

Or skip the IDE and sign up at the dashboard: [app.seldonframe.com/signup](https://app.seldonframe.com/signup) — free tier, no credit card. Both flows hit the same hosted backend; switch between them anytime.

Pricing for paid tiers: $29/mo (3 client workspaces) or $99/mo (unlimited, white-label). See [seldonframe.com/#pricing](https://seldonframe.com/#pricing).

### Self-host

Run the entire stack on your own infrastructure. AGPL-3.0 source code, full control over data, deploy target, and customization. If you modify SeldonFrame and run it as a network service, your modifications must be shared under AGPL terms — see [LICENSING.md](LICENSING.md). For closed-source embedding or commercial SaaS without the copyleft requirement, the hosted Scale tier is the commercial license alternative.

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
SeldonFrame is the open-source alternative to GoHighLevel. Both bundle CRM, booking, and chatbot for agencies serving local service businesses. The difference is deployment time, cost, and openness. GoHighLevel requires days-to-weeks of configuration per client and costs $97-$497/month per agency before white-label. SeldonFrame generates the pre-wired equivalent in about 3 minutes from one Claude Code prompt, ships a free tier with no credit card, and is AGPL-3.0 if you want to self-host.

### How long does it take to deploy a client ops stack?
Approximately 3 minutes from a single Claude Code prompt. The MCP server generates a CRM with vertical-specific pipeline stages, a booking page wired to the client's hours and timezone, an intake form with vertical-specific fields, and an AI chatbot that books against the real calendar. All four surfaces share one workspace database; nothing needs to be wired by you after generation.

### Can I white-label SeldonFrame for my agency clients?
Yes. Each workspace runs on its own subdomain (`client-slug.app.seldonframe.com`) or a custom domain on the Growth/Scale tiers. Per-workspace branding includes logo, colors, hero copy, and the chatbot's voice. Self-host under AGPL-3.0 if you want full visual control without any SeldonFrame chrome.

### Is SeldonFrame really free?
The Free tier covers 1 complete client workspace (CRM + booking + intake + chatbot), no credit card. Growth at $29/month covers 3 client workspaces. Scale at $99/month is unlimited workspaces. You bring your own LLM key (BYOK) — typically $3-$15/month per active workspace, with no SeldonFrame token margin. Or self-host for $0 under AGPL-3.0.

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
│  Operator-owned providers (BYOK)                                     │
│  Anthropic · OpenAI · Stripe · Twilio · Resend · Google Calendar     │
└──────────────────────────────────────────────────────────────────────┘
```

The agency owns every layer: SeldonFrame is AGPL-3.0; the LLM key is yours; the database is yours; the client's customer data is yours; the deployed code is yours.

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

## Three install paths, same product

| | Self-host | Hosted free | Hosted paid |
|---|---|---|---|
| Cost | $0 | $0 | $29 / $99 mo + usage |
| Client workspaces | unlimited | 1 | 3 / unlimited |
| Custom domain | yes (you bring) | no | yes |
| White-label | full | with badge | full |
| BYOK (LLM) | yes | yes | yes |
| Source code | full | same | same |
| Updates | `git pull` | automatic | automatic |
| Support | community | community | email + Discord priority |

Self-hosted and hosted run identical code. No features gated behind the paywall — we charge for hosting and support.

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

If you self-host SeldonFrame, your modifications stay open under AGPL terms. If you want to embed SeldonFrame in a closed-source product or run a hosted SaaS without the copyleft requirement, our **hosted Scale tier** is the commercial license alternative — see [LICENSING.md](LICENSING.md) for details.

This is the same dual-license model used by [Postiz](https://github.com/gitroomhq/postiz-app), [Mattermost](https://github.com/mattermost/mattermost), and [Plausible](https://github.com/plausible/analytics). It keeps the platform genuinely open, protects against closed-source clones, and creates a real commercial path for agencies who need it.

The architectural bet — thin platform, fat skill, antifragile to LLM improvements — only works if everything's open. So everything is.

<div align="center">

Built for agencies who'd rather generate than configure.

</div>
