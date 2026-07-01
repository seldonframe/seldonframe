# seldonframe-agent-business

An [Agent Skill](https://agentskills.io) that teaches your IDE agent (Claude Code, Cursor, Codex) the full **SeldonFrame builder loop**: build an AI agent for a real business, eval-gate it, deploy it to a real channel (web chat / phone), list it on the marketplace, and withdraw the earnings — all grounded in the real [`@seldonframe/mcp`](https://www.npmjs.com/package/@seldonframe/mcp) tool surface, with guardrails so the agent never handles secrets and never moves real money in development.

## Install

**Claude Code (personal):** copy this folder to `~/.claude/skills/seldonframe-agent-business/`
**Claude Code (project):** copy it to `<project>/.claude/skills/seldonframe-agent-business/`
**skills CLI:** `npx skills add seldonframe/seldonframe --skill seldonframe-agent-business`

Then connect the MCP server the skill drives:

```bash
claude mcp add seldonframe -- npx -y @seldonframe/mcp
```

No API key needed for the first workspace — keys are requested progressively, only when a verb needs one (the skill explains exactly when and where).

## What's inside

- [`SKILL.md`](SKILL.md) — the skill: prerequisites, the 5-verb quickstart (build → test → deploy → sell → get paid), a grounding table of commonly-guessed-wrong tool names, guardrails, troubleshooting.
- [`SUBMISSION-KIT.md`](SUBMISSION-KIT.md) — maintainer kit for listing this skill on the Claude-skills ecosystem lists (descriptions, category suggestions, per-list steps).

## Requirements

- Node ≥ 18 (for `npx -y @seldonframe/mcp`)
- `deploy_agent` requires `@seldonframe/mcp` ≥ 1.57

## Links

- Hosted twin of the flow: <https://seldonframe.com/SKILL.md>
- Human quickstart: <https://seldonframe.com/build>
- Platform: <https://seldonframe.com>

License: AGPL-3.0 (repository license — see [`LICENSE`](../../LICENSE)).
