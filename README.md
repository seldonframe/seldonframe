<div align="center">

<img src="https://seldonframe.com/brand/seldonframe-icon.svg" width="80" height="80" alt="SeldonFrame" />

# SeldonFrame

**The open-source Business OS you build by typing.**

CRM, public site, AI agents, calendar, intake forms — wired together, branded the same, customizable to your edge cases. Not a chatbot. Not a CRM. The whole stack, built and updated through natural language in your IDE.

[![License: MIT](https://img.shields.io/badge/License-MIT-1FAE85.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@seldonframe/mcp.svg?color=1FAE85)](https://www.npmjs.com/package/@seldonframe/mcp)
[![GitHub stars](https://img.shields.io/github/stars/seldonframe/seldonframe?color=1FAE85)](https://github.com/seldonframe/seldonframe/stargazers)
[![Discord](https://img.shields.io/badge/Discord-join-5865F2.svg)](https://discord.gg/sbVUu976NW)
[![X](https://img.shields.io/badge/follow-%40seldonframe-1d9bf0.svg)](https://x.com/seldonframe)

[Website](https://seldonframe.com) · [Docs](https://seldonframe.com/docs) · [Demo](https://seldonframe.com/demo) · [Blog](https://seldonframe.com/blog) · [Discord](https://discord.gg/sbVUu976NW)

</div>

---

## What you build in 5 minutes

```
> Build a website for Acme HVAC. Phoenix, AZ. AC repair and install.
  Phone (602) 555-0188.

  ● build_landing_page          200 ok
  ● build_booking_page          200 ok
  ● build_intake_form           200 ok
  ● build_website_chatbot       200 ok

  ✓ Live at acme-hvac.app.seldonframe.com
```

Public landing page, booking calendar, intake form, CRM with HVAC-specific fields, and a published AI chatbot that books appointments — all wired together, all branded the same, all live in under five minutes.

> A 5-second demo GIF lives [on the marketing site](https://seldonframe.com). Embed coming with the launch video.

---

## The bet: thin harness, fat skill

SeldonFrame is built on one architectural decision: **the LLM is the application layer, the platform is plumbing.**

Most AI tools wrap a chatbot UI around an LLM, then hardcode the "intelligence" into TypeScript heuristics that get worse every time the model gets better. SeldonFrame inverts this:

- **Thin harness** — The platform is dumb. 140+ MCP tools, a block manifest, durable workflows, an eval runtime. None of it tries to be smart.
- **Fat skill** — Every behavioral decision lives in markdown skill-packs the prompt composer reads at runtime. Edit a skill, ship intelligence. No code change.
- **Antifragile** — When Claude / GPT / Gemini get better, every SeldonFrame workspace gets better. We don't rewrite the platform; we let the model do more of the work.

The result: an HVAC contractor's chatbot in 2027 will be measurably better than its 2026 version, on the same SeldonFrame code, because the model improved. The platform doesn't compete with model judgment — it amplifies it.

---

## Architecture at a glance

```
┌──────────────────────────────────────────────────────────────────────┐
│  Operator                                                            │
│  HVAC contractor · dental practice · agency-of-one · solopreneur     │
└──────────────────────────────────────────────────────────────────────┘
                                  ↕  natural language
┌──────────────────────────────────────────────────────────────────────┐
│  IDE-resident agent                                                  │
│  Claude Code · Cursor · Windsurf · Devin · custom MCP clients        │
└──────────────────────────────────────────────────────────────────────┘
                                  ↕  Model Context Protocol
┌──────────────────────────────────────────────────────────────────────┐
│  SeldonFrame MCP server  ────────────────────────────  thin harness  │
│  140+ typed tools · workspace state · capability map                 │
└──────────────────────────────────────────────────────────────────────┘
                                  ↕
┌──────────────────────────────────────────────────────────────────────┐
│  Skill-pack registry  ────────────────────────────────  fat skill    │
│  markdown · per-archetype · runtime-composed into the system prompt  │
└──────────────────────────────────────────────────────────────────────┘
                                  ↕
┌──────────────────────────────────────────────────────────────────────┐
│  Runtime                                                             │
│  Next.js 16 · Postgres (Drizzle) · Vercel Workflows · motion · MIT   │
│  Eval gate (8-scenario suite, ≥87.5% to publish, regen on critical)  │
└──────────────────────────────────────────────────────────────────────┘
                                  ↕
┌──────────────────────────────────────────────────────────────────────┐
│  Operator-owned providers (BYOK)                                     │
│  Anthropic · OpenAI · Stripe · Twilio · Resend · Google Calendar     │
└──────────────────────────────────────────────────────────────────────┘
```

You own every layer. SeldonFrame is MIT-licensed; the LLM key is yours; the database is yours; the customer data is yours; the deployed code is yours.

---

## Quick start

Two paths. Same source code. Pick based on whether you want to host the database yourself or let SF host it.

### Hosted (recommended for most operators)

SF runs the Postgres database, the Next.js app, and the durable workflows on its own infrastructure (Vercel + Neon). You bring your LLM key, your customers, and your domain. Free tier; no credit card.

You get to pick the **chrome** — SF's hosted backend is identical either way:

```bash
# Drive it from Claude Code:
claude mcp add seldonframe -- npx -y @seldonframe/mcp
```

Then in Claude Code:

```
> Build a Business OS for [your business]. [city, state]. [services].
  [phone, optional email].
```

Or skip the IDE entirely and sign up at the dashboard: [app.seldonframe.com/signup](https://app.seldonframe.com/signup) — free tier, no credit card. Both flows hit the same hosted backend; you can switch between them anytime.

Pricing for paid tiers: $29/mo (Pro) or $99/mo (Agency, white-label). See [seldonframe.com/#pricing](https://seldonframe.com/#pricing).

### Self-host

Run the entire stack on your own infrastructure. MIT-licensed source code; full control over data, deploy target, and customization.

```bash
git clone https://github.com/seldonframe/seldonframe
cd seldonframe
pnpm install
pnpm dev      # → http://localhost:3000
```

Requires: Node 20+, Postgres 15+, an Anthropic or OpenAI API key. See [docs/getting-started/connect-claude-code](https://seldonframe.com/docs/getting-started/connect-claude-code) for the full setup.

---

## What's wired up by default

Every workspace ships with:

- **CRM** — contacts, deals, custom fields, kanban pipeline, customer portal
- **Public site** — landing page, services pages, blog (under your subdomain or custom domain)
- **Booking** — source-of-truth scheduling. Customers book on your branded SF page; the appointment lands in your CRM AND syncs out to your Google Calendar in real time. SF is the authority — Google Calendar is a downstream view.
- **Intake forms** — multi-step, lead-routing, auto-CRM
- **AI chatbot** — eval-gated, BYOK, embed-on-any-site
- **Email + SMS** — Resend (email) + Twilio (SMS), templated, automation-ready
- **Durable workflows** — Vercel Workflows powering reminders, follow-ups, sequences
- **Eval gate** — agents run an 8-scenario suite before going live (≥87.5% to publish)
- **Motion polish** — every page ships with scroll-reveal, stagger on grids, hover-lift on CTAs (the *balanced* preset; tunable via `apply_motion_preset`)
- **Brand theme** — single primary color cascades to all surfaces, instantly

---

## Examples — typical operator prompts

```js
// Build the entire stack from one sentence
> Build me a Business OS for Acme Dental. Boston, MA.
  Cleanings ($120), fillings ($200-450), whitening ($350).
  Phone (617) 555-0100. We do same-day emergencies.

// Add a chatbot to an existing workspace
> Build me a website chatbot for Acme Dental that books cleanings,
  refuses to quote prices outside our list, and escalates broken-tooth
  calls to (617) 555-0100. Use my Anthropic key.

// Update without breaking
> Raise cleaning price from $120 to $135. Add a "before-and-after photos"
  FAQ pointing to /gallery. Re-run evals.

// Bring your own design system
> Apply my DESIGN.md to the workspace.

// Tune motion intensity
> Make my pages feel more editorial. Counters on the stats, magnetic
  CTAs, slower reveals.
```

Each prompt resolves to 1–6 MCP tool calls. No clicking through admin wizards. No Zapier glue.

---

## What's interesting to contribute to

If you want to read or hack on the codebase, these are the parts where the architectural bets are most visible:

| Area | Path | What's interesting |
|------|------|--------------------|
| **MCP tool registry** | `skills/mcp-server/src/tools.js` | The 140+ tools and their `USE-WHEN` triggers. Adding a new capability = adding one entry. |
| **Skill packs** | `packages/crm/src/lib/agents/skills/` | Agent intelligence as markdown. Edit prose, ship behavior. The fat-skill layer. |
| **Eval gate** | `packages/crm/src/lib/agents/eval-runner.ts` + `fallbacks.ts` | LLM regeneration on critical-fail. The runtime that catches its own hallucinations. |
| **Block library** | `packages/crm/src/components/landing/sections/` | The user-facing page primitives. New verticals = new blocks here. |
| **Motion primitives** | `packages/crm/src/components/motion/primitives.tsx` | 8 thin wrappers over `motion/react`. Composable, theme-aware, antifragile. |
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
| Workspaces | unlimited | 1 | 3 / unlimited |
| Custom domain | yes (you bring) | no | yes |
| White-label | full | with badge | full |
| BYOK (LLM) | yes | yes | yes |
| Source code | full | same | same |
| Updates | `git pull` | automatic | automatic |
| Support | community | community | email + Discord priority |

Self-hosted and hosted run identical code. We don't gate features behind the paywall — we charge for hosting + support.

---

## Bring your own design tools

SeldonFrame is **MCP-native and design-tool-agnostic**. Bring whatever you already use:

- **Anthropic Claude Design** — `import_claude_design_handoff({ bundle })` parses the handoff bundle, applies tokens, surfaces components for review.
- **Google Labs DESIGN.md** — `apply_design_md({ design_md_content })` parses YAML front matter and applies tokens to your workspace theme.
- **v0 / Lovable / Cursor / Windsurf** — generated React/Tailwind drops directly into the block library. Wire via `update_landing_page` or paste into Puck (the visual editor — already integrated).
- **Direct fork** — MIT licensed. Edit any block component, add custom blocks, deploy.

The architecture lets every AI design tool feel like a first-class extension. We don't compete with their UX — we accept their output.

---

## Roadmap

The bets we're making, in rough order. Each is contributor-friendly — drop into Discord or open a GitHub Discussion to claim a piece.

### Soon

- **Voice + SMS transports** — same Soul, three channels. The chatbot you build today answers the phone tomorrow. Twilio + Vapi/Retell on the voice side; Twilio + WhatsApp Business on messaging. Eval-gated per channel (different scenarios for "phone interruptions" vs "late-night SMS").
- **Self-improving agents** — runtime telemetry feeds back into skill-pack proposals. After 100 conversations, an agent can say *"I noticed customers ask about X 30 times — here's a draft skill addition. Approve or reject?"* Operator stays in the loop; agent does the work.
- **Renderer-level motion preset gating** — `minimal` short-circuits motion entirely; `editorial` adds Counter, MagneticButton, TextReveal. The intent is already stored (v1.34.0); wiring is mechanical.

### Mid-term — where the architecture starts to compound

- **Multi-agent orchestration** — agents that hire other agents. Your booking agent calls a fraud-detection agent for high-value bookings. The intake-form agent calls a pricing-quote agent that calls a calendar-availability agent. Each agent has its own Soul, its own eval gate, and its own MCP tool surface. Composing them is one prompt.
- **Skill-pack marketplace with revenue share** — community contributors publish vertical-specific skill packs ("Ambulance dispatch flow," "Real estate showing scheduling," "Wedding-photography pre-shoot intake"). The marketplace handles discovery, eval verification, and payouts. Contributors earn from operators who deploy their packs. The skill packs are markdown — barrier to entry is *writing*, not engineering.
- **Vertical templates marketplace** — pre-built Souls for industries beyond the current 6 templates (HVAC, dental, coach, agency, e-commerce, consultant). Community-curated, eval-verified. *"Start a yoga studio"* → applies the yoga-studio Soul, instant Business OS with vertical-tuned chatbot, intake fields, pipeline stages.

### Long-term — the agent era

- **Federated agent network** — agents from different SF workspaces can negotiate. Your booking agent talks to a vendor's quote agent. A real-estate agent talks to a mortgage-lender agent. Agent-to-agent commerce as an emergent capability of the open MCP surface.
- **Long-running operator agents** — an agent that operates your business for a week and reports back. *"I closed 12 deals, escalated 3, refunded 2, scheduled 47 appointments. Here's the trail."* This is what "AI-native Business OS" looks like at the limit.
- **Agent fleet operations** — agencies running 100+ workspaces from one console. Bulk skill-pack deployment, fleet-wide eval rollouts, comparative analytics across client agents.

Comment on what's missing or vote on priorities in [GitHub Discussions](https://github.com/seldonframe/seldonframe/discussions). The most interesting issues get labeled `architecture` and `help wanted`.

---

## Why open source

Three reasons we ship the entire platform under MIT:

1. **The customer wins.** No vendor lock-in. If we ever get acquihired, shut down, or pivot, your business OS keeps running on your infrastructure. Forever.
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

Sponsorship slots open. If your tool fits operators (Twilio, Resend, Stripe, Anthropic, Postgres providers, deploy platforms, etc.) and you want a logo on this README + docs surface, [reach out](mailto:hello@seldonframe.com).

---

## License

[MIT](LICENSE) — for the platform, the MCP server, the docs, the marketing site, the eval suite, the skill packs. The whole monorepo.

The architectural bets here — thin harness, fat skill, antifragile to LLM improvements — only work if everything's open. So everything is.

<div align="center">

Built for operators who'd rather type than click.

</div>
