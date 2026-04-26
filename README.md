<div align="center">

# SeldonFrame

**The open-source platform to build AI-native Business OS with natural language.**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Discord](https://img.shields.io/badge/Discord-join-5865F2.svg)](https://discord.gg/sbVUu976NW)

[Website](https://seldonframe.com) · [Docs](https://seldonframe.com/docs) · [Discord](https://discord.gg/sbVUu976NW) · [X](https://x.com/seldonframe)

</div>

---

## An alternative to stitching together your stack

An alternative to stitching together Zapier + HubSpot + Twilio + Stripe + Calendly + Notion for each client. SeldonFrame gives you composable primitives, a per-client identity layer, and agents that learn — all from one MCP-native platform you control.

## What is SeldonFrame

SeldonFrame is a Business OS framework. You describe what you want in natural language inside Claude Code; SeldonFrame scaffolds production-ready blocks, archetypes (multi-step agent workflows), and branded customer surfaces. One platform, many clients, fully owned.

## Key features

- 🧱 **Composable primitives** — 10 step types (wait, mcp_tool_call, conversation, await_event, llm_call, branch, request_approval, read_state, write_state, emit_event) that compose into any workflow.
- 🎨 **Per-client branding** — every workspace gets its own theme, copy, voice, and customer portal.
- 🧠 **Agents with memory (Soul)** — single source of truth that personalizes every block and remembers across runs.
- 📊 **Closed-loop attribution** — every LLM call tracked and attributed to the workflow run that triggered it.
- 💬 **Natural language scaffolding** — describe a block, an archetype, or a workspace; SeldonFrame generates code, admin UI, and tests.
- 🛂 **Approval gates** — pause workflows for human review before sending or charging.
- 🔌 **MCP-native** — install once with `claude mcp add seldonframe`, then drive everything from your IDE.
- 🔑 **BYO LLM keys** — bring your own Anthropic / OpenAI key. We don't margin on tokens.
- 🆓 **Open source, no lock-in** — MIT licensed. Self-host or run on our cloud.
- 🧪 **Test mode** — exercise archetypes against simulated triggers before going live.

## Quick start

```bash
claude mcp add seldonframe
```

```bash
seldon init "my-workspace"
```

```bash
seldon scaffold block customer-intake
```

```bash
seldon agent create emergency-triage
```

Three minutes from install to a working Business OS. Full walkthrough in the [docs](https://seldonframe.com/docs/quickstart).

## Screenshots

> Demo video and screenshots coming soon. In the meantime, see the live [demo walkthrough](https://seldonframe.com/demo).

## Who is it for

**Build for yourself** — solo operators and indie founders who want a CRM, booking, intake, and agent automation without subscribing to six SaaS products.

**Build for your clients** — agencies, consultants, and freelancers shipping branded Business OS deployments to multiple clients from one codebase.

## Architecture

Five primitives compose every workflow:

- **Triggers** — events that start a run (SMS, form submit, schedule, webhook).
- **Steps** — atomic operations (10 types) that move the workflow forward.
- **Soul** — the workspace's memory and identity layer.
- **Subscriptions** — long-lived event listeners that fan out to handlers.
- **Blocks** — installable capability bundles (CRM, booking, intake, payments, etc.).

Read the full [architecture overview](https://seldonframe.com/docs).

## Infrastructure

SeldonFrame integrates with the providers you already use:

- **Twilio** — SMS and voice
- **Resend** — transactional email
- **Stripe** — payments and subscriptions
- **Anthropic / OpenAI** — LLM calls (BYO key)

## Pricing

- **First workspace** — free forever, self-hosted or on our cloud.
- **Additional workspaces** — $9/month each, hosted.

Self-hosters pay nothing to SeldonFrame.

## Contributing

PRs welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening one.

## Community

- 💬 [Discord](https://discord.gg/sbVUu976NW)
- 🐦 [X / @seldonframe](https://x.com/seldonframe)
- 📚 [Docs](https://seldonframe.com/docs)
- 🌐 [seldonframe.com](https://seldonframe.com)

## License

MIT — see [LICENSE](LICENSE).
