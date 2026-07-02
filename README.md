<div align="center">

<img src="https://seldonframe.com/brand/seldonframe-icon.svg" width="80" height="80" alt="SeldonFrame" />

# SeldonFrame

**Build an AI agent business — from your IDE.**

The open-source platform where developers build, deploy, and **sell** AI agents that do real work for real businesses: answer the phone, reply on chat and SMS, and book paying jobs into a real calendar. Free to build. **Keep 95% when you sell.**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-1FAE85.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@seldonframe/mcp.svg?color=1FAE85)](https://www.npmjs.com/package/@seldonframe/mcp)
[![GitHub stars](https://img.shields.io/github/stars/seldonframe/seldonframe?color=1FAE85)](https://github.com/seldonframe/seldonframe/stargazers)
[![Discord](https://img.shields.io/badge/Discord-join-5865F2.svg)](https://discord.gg/sbVUu976NW)
[![X](https://img.shields.io/badge/follow-%40seldonframe-1d9bf0.svg)](https://x.com/seldonframe)

[Website](https://seldonframe.com) · [Docs](https://seldonframe.com/docs) · [Marketplace](https://app.seldonframe.com/marketplace) · [Live demo](https://phoenix-ac-air-conditioning-heating-inc.app.seldonframe.com) · [Discord](https://discord.gg/sbVUu976NW)

</div>

---

## Ship your first agent in 60 seconds

```bash
claude mcp add seldonframe -- npx -y @seldonframe/mcp
```

```
> Build me an AI receptionist for an HVAC company in Phoenix.

  ✓ Live at acme-hvac.app.seldonframe.com
```

No API key. No signup form. **Your first workspace is free forever.** That one sentence stands up a hosted front office — website, booking page, intake form, CRM — with an AI agent already answering on chat and booking against the real calendar. Add a phone number and it answers calls too.

**See a real one:** [this HVAC workspace](https://phoenix-ac-air-conditioning-heating-inc.app.seldonframe.com) was generated from a public Google Maps listing in about 3 minutes. The chatbot on it books real appointments.

---

## Use SeldonFrame from any IDE

One npm package — [`@seldonframe/mcp`](https://www.npmjs.com/package/@seldonframe/mcp) — runs as a local MCP server in every major AI-native editor. Pick yours, paste the snippet, and ask your agent to build a workspace. **First workspace is free and needs no API key.**

<details>
<summary><strong>Claude Code</strong></summary>

```bash
claude mcp add seldonframe -- npx -y @seldonframe/mcp
```

</details>

<details>
<summary><strong>Cursor</strong></summary>

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "seldonframe": {
      "command": "npx",
      "args": ["-y", "@seldonframe/mcp"]
    }
  }
}
```

</details>

<details>
<summary><strong>Windsurf</strong></summary>

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "seldonframe": {
      "command": "npx",
      "args": ["-y", "@seldonframe/mcp"]
    }
  }
}
```

</details>

<details>
<summary><strong>VS Code (Copilot agent mode)</strong></summary>

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "seldonframe": {
      "command": "npx",
      "args": ["-y", "@seldonframe/mcp"]
    }
  }
}
```

</details>

<details>
<summary><strong>Zed</strong></summary>

Add to `settings.json`:

```json
{
  "context_servers": {
    "seldonframe": {
      "source": "custom",
      "command": "npx",
      "args": ["-y", "@seldonframe/mcp"]
    }
  }
}
```

</details>

<details>
<summary><strong>Codex CLI</strong></summary>

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.seldonframe]
command = "npx"
args = ["-y", "@seldonframe/mcp"]
```

Or one line: `codex mcp add seldonframe -- npx -y @seldonframe/mcp`

</details>

Once connected, restart your IDE (MCP connectors load at session start), then just say:

```
> Build a workspace for [business name]. [city, state]. [services]. [phone, optional].
```

See the same six snippets, kept in sync, at [seldonframe.com/build](https://seldonframe.com/build#install).

---

---

## Sell what you build

The agents you build aren't locked in your workspace:

- **List them on the [marketplace](https://app.seldonframe.com/marketplace)** — anyone can install your agent into their own business in one click. It re-grounds itself on *their* hours, services, and pricing on install.
- **You keep 95%. You set the price** — monthly, per-call, per-outcome, or one-time.
- **Every agent is rentable over MCP** — any LLM (Claude, ChatGPT, Cursor, an orchestrator) can rent your agent at its signed MCP endpoint and pay you per use. No infrastructure for you to run.
- **We will never compete with you.** We ship the commodity agents (receptionist, review-requester) as the free floor and stay out of vertical niches — and we never use your agent's data, prompts, or performance to build a competing one.

## Pricing — no surprises

| | |
|---|---|
| **Self-host** | $0 — AGPL-3.0, the entire monorepo |
| **Hosted — first workspace** | Free forever, no card |
| **Hosted — unlimited workspaces** | $29/mo flat (white-label + voice included) |
| **Your AI tokens** | Bring your own key — we never mark up usage |
| **When you sell** | 5% only when the marketplace brings the buyer · ~2% through your own storefront · **$0 anywhere else** |

## How it works (for the curious)

Thin platform, fat markdown skills, an owned memory layer (the Brain). An agent is a **Trigger × Skill × Channel** production loop with maker-separate-from-checker verification. The full technical writeup — agent model, pre-wired stack, roadmap: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Contributing

The highest-leverage PR here is **an agent template or a vertical skill-pack** — merged templates ship to the marketplace where every SeldonFrame user can find them, and you can list your own paid variants alongside. Core, connector, and eval PRs are equally welcome.

- Start with [CONTRIBUTING.md](CONTRIBUTING.md), then issues labeled `good first issue` / `help wanted`
- House rule: agent-behavior changes ship with eval scenarios; runtime changes ship with tests

## Community

- 💬 [Discord](https://discord.gg/sbVUu976NW) — fastest way to get help, feedback, or just say hi
- 🐦 [@seldonframe on X](https://x.com/seldonframe) — release notes, tips, dogfood notes
- 📚 [Docs](https://seldonframe.com/docs) — deeper guides than this README
- 🐛 [Issues](https://github.com/seldonframe/seldonframe/issues) · 📡 [Discussions](https://github.com/seldonframe/seldonframe/discussions)
- ✉️ Partnerships: [hello@seldonframe.com](mailto:hello@seldonframe.com)

## License

[AGPL-3.0](LICENSE) for the whole monorepo. Self-host freely; if you modify it and run it as a network service, your modifications stay open. For closed-source embedding, the hosted plan is the commercial alternative — see [LICENSING.md](LICENSING.md). Same dual model as Mattermost, Plausible, and Postiz.

<div align="center">

**Build an agent. Sell it. Get paid. — from your IDE.**

If this is the platform you've been looking for, [⭐ star the repo](https://github.com/seldonframe/seldonframe/stargazers) — it helps more builders find it.

</div>
