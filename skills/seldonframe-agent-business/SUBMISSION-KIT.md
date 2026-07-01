# Submission kit — listing `seldonframe-agent-business` on the Claude-skills ecosystem lists

Maintainer-facing. Nothing here has been submitted; every step below is a manual action for the repo owner. Mirror of the style in [`skills/mcp-server/DISTRIBUTION.md`](../mcp-server/DISTRIBUTION.md) (the MCP-server channels); this kit covers the **skills** lists.

**Skill URL (used in every entry below):**
`https://github.com/seldonframe/seldonframe/tree/main/skills/seldonframe-agent-business`

---

## 0. Pre-flight — must be true BEFORE any submission

1. **Merge `feature/agent-business-skill-pack` to `main` and push to GitHub.** Every entry links to `main`; submitting first means 404s in the PR review.
2. **Republish `@seldonframe/mcp` ≥ 1.57.0 to npm.** The skill documents `deploy_agent`, which is in-repo but not on npm until the republish (npm latest is 1.56.0, and `skills/mcp-server/package.json` is still `1.56.0` in-repo — bump it to `1.57.0` first, keep `server.json` in sync per the MCP-registry rule in `DISTRIBUTION.md`, then `npm publish`). Publishing the skill before the tool ships would make the skill's deploy verb a lie — against the whole never-lies positioning.
3. **Add GitHub topics to the repo:** `claude-skills`, `agent-skills`, `claude-code`, `mcp`, `ai-agents`. This is what the auto-ingesting lists and aggregators key on.
4. **Smoke the install command once:** `npx skills add seldonframe/seldonframe --skill seldonframe-agent-business` from a clean directory, and a manual copy into `~/.claude/skills/` — confirm Claude Code triggers the skill on "build me an agent to sell on seldonframe".
5. Optional: set `SF_DEPLOY_ENABLED` in the production environment when ready to open deploys — the skill handles `status: "disabled"` honestly either way, so this does not block submission.

---

## Canonical copy (reuse verbatim)

**One-liner (for list bullets):**

> Build, eval-gate, deploy, and sell revenue-generating AI agents for real businesses from your IDE via the SeldonFrame MCP — the full build → test → deploy → sell → get-paid loop.

**One paragraph (for PR bodies and submission forms):**

> `seldonframe-agent-business` teaches an IDE agent (Claude Code, Cursor, Codex) the complete agent-business loop on SeldonFrame: build an AI agent for a real business from one sentence, test it against the 8-scenario eval suite that gates publishing at ≥ 87.5%, deploy it to a real channel with the human-only connect step handled honestly, list it on the marketplace with per-call or per-outcome usage pricing, and withdraw the earnings. Every tool name is grounded in the real `@seldonframe/mcp` tool surface — no invented tools — including a table of the names agents typically guess wrong. Guardrails: the agent never collects secret keys in chat and never moves real money (payouts, phone provisioning, price changes) without an explicit human ask. First workspace is free with no API key; keys are requested progressively only when a verb needs them.

**Suggested PR title (all lists):** `Add seldonframe-agent-business (build → sell → get paid for AI agents)`

---

## 1. travisvn/awesome-claude-skills

- **Repo:** <https://github.com/travisvn/awesome-claude-skills>
- **Where it goes:** *Community Skills → Individual Skills* (a two-column markdown table: Skill | Description).
- **Category fit:** Development (business/automation workflow driven from the IDE).
- **Entry row (paste into the table):**

```markdown
| [seldonframe-agent-business](https://github.com/seldonframe/seldonframe/tree/main/skills/seldonframe-agent-business) | Build, eval-gate, deploy, and sell revenue-generating AI agents for real businesses from your IDE via the SeldonFrame MCP — the full build → test → deploy → sell → get-paid loop. |
```

- **Steps:** fork → read their `CONTRIBUTING.md` (referenced from the README) → add the row alphabetically/appropriately in the Individual Skills table → PR with the canonical paragraph as the body.

## 2. BehiSecc/awesome-claude-skills

- **Repo:** <https://github.com/BehiSecc/awesome-claude-skills>
- **Where it goes:** the **🛠 Development & Code Tools** section (alternate: 🔧 Utility & Automation). Entries are one-line bullets.
- **Entry bullet (their exact format `- [name](url) - description.`):**

```markdown
- [seldonframe-agent-business](https://github.com/seldonframe/seldonframe/tree/main/skills/seldonframe-agent-business) - Build, eval-gate, deploy, and sell AI agents for real businesses from your IDE via the SeldonFrame MCP: build → test → deploy → sell → get paid.
```

- **Steps:** fork → add the bullet to the section → PR (no CONTRIBUTING.md; README says fork → change → PR).

## 3. VoltAgent/awesome-agent-skills

- **Repo:** <https://github.com/VoltAgent/awesome-agent-skills>
- **Where it goes:** the list is organized **by source org** in collapsible `<details>` sections. Two options, in order of preference:
  1. Add a new **"SeldonFrame"** section following the existing per-org pattern (`<details>` + `<h3>`), listing this skill — appropriate since it's the platform's official skill.
  2. If the maintainers prefer, the **Community** section.
- **Entry bullet (their format `- **[namespace/skill](url)** - description`):**

```markdown
- **[seldonframe/seldonframe-agent-business](https://github.com/seldonframe/seldonframe/tree/main/skills/seldonframe-agent-business)** - Build, eval-gate, deploy, and sell AI agents for real businesses from your IDE via the SeldonFrame MCP (build → test → deploy → sell → get paid)
```

- **Steps:** fork → check for a `CONTRIBUTING.md` in-repo at PR time (none was visible in the README) → add section/bullet → PR. Note their entries often link via `officialskills.sh`; the GitHub tree URL is accepted for non-aggregated entries.

## 4. Aradotso/trending-skills

- **Repo:** <https://github.com/Aradotso/trending-skills>
- **How it works:** **no manual PR path** — it's an auto-generated daily collection (curated by [ara.so](https://ara.so)) of skills from trending GitHub projects, installable via `npx skills add Aradotso/trending-skills --skill <name>`.
- **Actions that get this skill ingested:**
  1. The pre-flight topics (step 0.3) + this repo layout (`skills/<name>/SKILL.md`) are exactly what its generator scrapes.
  2. The two awesome-list PRs above + the MCP-registry listing drive the stars/trending signal it keys on.
  3. Optional accelerant: contact the curator via ara.so and point at the skill path.
- **Verify later:** search the repo README / claudemarketplaces.com / awesomeskills.dev for `seldonframe` after a week or two of the repo trending.

## 5. Bonus targets — auto-indexers (no action required)

These scrape public GitHub once the repo has the topics + the layout above; check them after the lists land, no submission needed: `claudemarketplaces.com`, `awesomeskills.dev`, `lobehub.com/skills`, `explainx.ai/skills`, and the `skills.sh` registry behind `npx skills`.

---

## The checklist (in order)

- [ ] Merge `feature/agent-business-skill-pack` → `main`, push to GitHub
- [ ] Bump `skills/mcp-server/package.json` (+ `server.json`) to `1.57.0`, then `npm publish` (ships `deploy_agent`)
- [ ] Add repo topics: `claude-skills`, `agent-skills`, `claude-code`, `mcp`, `ai-agents`
- [ ] Smoke: `npx skills add seldonframe/seldonframe --skill seldonframe-agent-business` + manual `~/.claude/skills/` copy triggers on a "build an agent to sell" prompt
- [ ] PR #1 → travisvn/awesome-claude-skills (Individual Skills table row above)
- [ ] PR #2 → BehiSecc/awesome-claude-skills (🛠 Development & Code Tools bullet above)
- [ ] PR #3 → VoltAgent/awesome-agent-skills (SeldonFrame `<details>` section, bullet above)
- [ ] Aradotso/trending-skills: nothing to submit — confirm ingestion after the PRs land (search `seldonframe`)
- [ ] Week-later sweep: check the bonus auto-indexers for the listing
