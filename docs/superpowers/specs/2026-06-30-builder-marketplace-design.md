# SeldonFrame for Builders — the Monid-shaped marketplace (Design)

**Date:** 2026-06-30
**Status:** Approved (brainstorm). Next: implementation plan (P0 below).
**Related:** the #139 billing rail (direct charges, metered usage, 5% clean — LIVE), the agent-as-MCP-rental rail (signed keys + `/api/v1/agents/[slug]/mcp`), the SeldonFrame MCP server (149 tools), the agent builder + eval harness (L5), Composio (1000+ tools), the marketplace buyer onboarding (`2504b10f`/`b9e74468`). Reference: monid.ai + docs.monid.ai (the interface + usage model we adapt).

## The one line
**Build, test, and sell an AI agent — from the IDE you already live in. Get paid per use.** Setup is one command: `set up https://seldonframe.com/SKILL.md`. No dashboard, no subscription, no human in the loop.

## Persona
The **agent builder**: indie devs, AI engineers, automation freelancers who live in Claude Code / Cursor / Codex — Monid's ICP. (The non-technical SMB *buyer* keeps the dashboard/wizard already shipped; the builder never sees it. Two surfaces, one brand.)

## Decisions (locked)
1. **Brand/URL:** same brand, distinct surface — `/build` (builder entry) + `/marketplace` (the directory).
2. **Prepaid wallet, 1 balance** (cleaner for agent-to-agent, caps risk). Top up via Stripe; every run draws down.
3. **Our take = 5% application fee on usage** (reuses the live direct-charge metered rail; seller bears Stripe's fee, our 5% is clean). Resold third-party tools instead take a small usage markup over wholesale.
4. **Rent tools/skills/agents — not just full agents.** Three rentable types, one interface → SeldonFrame = Monid + a skill marketplace + an agent marketplace.
5. **Federation order: Composio actions first** (our own agents already use them, no new vendor), Monid data endpoints later.
6. **Two billing modes, same Stripe, picked by surface:** subscription for the SMB dashboard buyer; **prepaid usage wallet** for the dev/agent side.

## The unit: discover → inspect → run (adapt Monid's interface)
Every sellable thing — a full **agent**, a **skill**, or a single **tool** — is discovered, priced, and run through one consistent flow across MCP / Skill / CLI / HTTP API:
- **discover** — natural-language search → ranked results, each with price.
- **inspect** — input schema + pricing (PER_CALL or PER_RESULT) + docs.
- **run** — execute with structured input; return the result; charge the wallet. **Errors are not charged** (only successful runs bill), micro-dollar accounting, async runs return a run id to poll (mirror Monid).

## The three rentable types
1. **Tools** — a single endpoint: native SF tools (booking/SMS/quote), **Composio's 1000+ actions** (P-federation first), later Monid's data endpoints.
2. **Skills** — a reusable `SKILL.md` capability (e.g. "qualify-and-book"); drop into any agent.
3. **Agents** — a whole agent (the receptionist); run over MCP, or a human installs via the buyer dashboard.

One catalog, one wallet, for all three.

## Access surfaces (all four, like Monid)
- **Skill:** `set up https://seldonframe.com/SKILL.md` (headline funnel).
- **MCP:** `https://mcp.seldonframe.com/v1` — add as a connector in Claude/Cursor/Codex (MCP server exists).
- **CLI + HTTP API:** `seldonframe discover/inspect/run` + `POST /v1/run`.
- **The directory** (`/marketplace`) + **`/build`** — human-browsable, Monid-clean, SKILL line in the hero.

## Pricing & wallet
Prepaid Stripe-funded balance → per-call/per-result drawdown via Stripe **meter events** (the basil `reportAgentUsage` rail). Listing is free; you only earn/pay on real usage. The 5% is the `application_fee` on the metered subscription (direct charge). `GET /v1/wallet/balance` mirrors Monid.

## "Build almost any agent + the Brain gets smarter" (the positioning, and it's true)
- **Build any agent from the primitives:** the 6 primitives — **Surface** (voice/chat/sms/email) · **Skill** · **Tools** (native + 1000+ Composio + MCP) · **Knowledge/Brain** · **Guardrails** · **Voice** — compose into a wide class of agents (receptionist, missed-call text-back, speed-to-lead, review requester, social poster, lead qualifier, support chat, research/enrichment via federated tools…). Generated from one English sentence (`generate_agent`).
- **Humans AND agents build:** humans via `/build` or the IDE (MCP/Skill/CLI); agents via the MCP build tools (an agent can build + list an agent). MCP-native end to end.
- **The Brain logs + learns:** conversations/runs are logged (`agent_conversations`, loop-memory); the eval harness records judge findings + post-generate edits as **lessons** that are recalled into the next generation (the self-improving generator). Each build/run/eval makes the next one better. (Honest bound: "smarter" = the eval-lessons + loop-memory feedback loop + Brain v2 knowledge, not autonomous self-rewrite.)

## What's reused vs net-new
- **Reuse:** the agent builder + eval harness, the MCP server, the agent-as-MCP-rental rail + signed keys, Composio, the Stripe metered billing + direct-charge 5%.
- **Net-new (small):** the `SKILL.md`; the unified discover/inspect/run layer over all three types; wrapping build/eval/publish/price as MCP tools; the prepaid wallet (top-up + drawdown over the existing meter); the Composio→catalog federation adapter; the CLI; the `/build` + `/marketplace` reskin.

## Phases
- **P0** — `SKILL.md` + MCP build/eval/publish/price tools → a dev builds + lists an **agent** from Claude Code. (Smallest build, highest leverage.)
- **P1** — unified `discover/inspect/run` over **tools + agents** + per-call billing on the meter.
- **P2** — the **prepaid wallet** (top-up + drawdown + earnings).
- **P3** — **skills** as a first-class rentable type.
- **P4** — **Composio federation** into `discover` (actions first) behind our own run layer; CLI ships.
- **P5** — the `/marketplace` + `/build` directory reskin (Monid-clean) + Monid-as-a-provider (data) as an optional federated source.

## Out of scope
- The SMB front-office product (seldonframe.com dashboard) — unchanged; it's the best *demo* of the marketplace.
- Replacing the buyer dashboard — the wizard stays for non-technical buyers.

## Open items (resolve in the plan)
- The CLI distribution (`npm` vs `curl | bash`).
- Wallet top-up UX (Stripe Checkout one-off top-ups vs auto-reload).
- Whether skills get their own `discover` ranking signal distinct from agents.
