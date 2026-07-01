---
name: seldonframe-agent-business
description: Use when a builder working in an IDE agent (Claude Code, Cursor, Codex) wants to build, test, deploy, sell, or get paid for an AI agent on SeldonFrame — e.g. "build me a receptionist agent and sell it", "deploy my agent to a real phone number", "list my agent on the marketplace", "run my agent's evals", "withdraw my agent earnings" — or when the SeldonFrame MCP (@seldonframe/mcp) is connected and the user asks what to do next.
---

# SeldonFrame — build an agent, sell it, get paid (without leaving your IDE)

SeldonFrame is a platform for building **revenue-generating AI agents for real businesses** (receptionists, chatbots, follow-up bots) — each backed by a real hosted workspace (CRM, booking, intake, landing page) on `<slug>.app.seldonframe.com`. This skill teaches the full builder loop:

> **build → test → deploy → sell → get paid**

Everything below is grounded in the real `@seldonframe/mcp` tool surface. **Never invent a SeldonFrame tool name** — if a tool isn't named in this file, check the live `tools/list` before calling it (see the grounding table near the end for the names agents commonly guess wrong).

## The 5 verbs at a glance

| Verb | Surface | The call |
|---|---|---|
| 1. Build | MCP | `get_workspace_state` → `build_website_chatbot` (or `create_agent` + `update_agent_blueprint`) |
| 2. Test | MCP | `publish_agent({status:"test"})` → sandbox at `/agents/[id]/test` → `run_agent_evals` |
| 3. Deploy | MCP or CLI | `deploy_agent({source:{template_id \| listing_slug}, phone?})` — relay `wizardUrl` for the human-only connect step |
| 4. Sell | Dashboard + API | Studio → "List on the marketplace" (human) → `set_usage_price` op on `POST /api/v1/build/listings` |
| 5. Get paid | API or CLI | `list_my_listings` op → `seldonframe payout` / `POST /api/v1/build/payout` |

Each verb's surface is labeled **[MCP]** (a real MCP tool), **[API/CLI]** (bearer-authed REST op / `@seldonframe/cli` command), or **[human]** (a dashboard step only the human can do). Never present an [API/CLI] op as an MCP tool, and never claim you can click a [human] step yourself.

## 0. Prerequisites — connect the MCP, keys come later

Install the MCP server (Node ≥ 18). In Claude Code, one line:

```bash
claude mcp add seldonframe -- npx -y @seldonframe/mcp
```

Any other MCP client: command `npx`, args `["-y", "@seldonframe/mcp"]` (stdio). Then **restart the IDE or reconnect MCP** — connectors are read at session start, so the tools are not callable in the session that added them.

**No API key upfront.** The first workspace is free forever: the first `create_full_workspace` call mints a real hosted workspace plus a device token (stored in `~/.seldonframe/device.json`) that authenticates every later call. Keys are asked for **progressively**, only when a verb actually needs one:

| When you hit… | Get… | From |
|---|---|---|
| A `402` — second workspace, custom domain, full Brain v2, publishing/exporting | `SELDONFRAME_API_KEY` (env var, then restart the MCP) | `app.seldonframe.com/settings/api` |
| The **sell / get-paid** verbs (`/api/v1/build/*` ops, `@seldonframe/cli`) | A `wst_…` workspace bearer key (revealed **once** — env or secrets manager) | `app.seldonframe.com/build/keys` |
| Agent LLM calls (BYOK) | `ANTHROPIC_API_KEY` — `build_website_chatbot` auto-detects it from env | The builder already has one |
| Phone provisioning on deploy | The workspace's **own Twilio creds** (BYO-Twilio; surfaced as a `telephony` requirement) | Twilio console |

Optional CLI twin for the sell/payout verbs: `npm i -g @seldonframe/cli`, then `seldonframe login` (or `seldonframe keys add --label main --key wst_…`).

> Alternative transport: a hosted Streamable-HTTP MCP lives at `https://mcp.seldonframe.com/v1` (header `Authorization: Bearer <wst_ key>`). Same platform; the npm stdio server above is the zero-key-first-run path.

## 1. Build

**Step zero, always:** `get_workspace_state({ workspace_id })` **[MCP]**. One call returns workspace identity, integrations status as booleans (never keys), existing agents with health stats (status, eval pass rate, validator pass rate), counts, and a `builder` block — the build→sell ladder (`build → test → eval → list → price → observe`) with your **current rung and the one next action**, plus per-template `deploy_readiness`. Follow `builder.nextAction`; ignore the operator furniture (contacts/bookings/deals counts). This also prevents the classic mistakes: asking "is the Anthropic key configured?" (the response says), and creating a duplicate agent (the response lists what exists).

No workspace yet? `create_full_workspace` **[MCP]** mints one, then `finalize_workspace({ workspace_id, email })` sends the human their admin magic link.

**Default build — one call:** `build_website_chatbot({ workspace_id, name, faq, pricing_facts, greeting })` **[MCP]**. It configures the LLM key (auto-detects `ANTHROPIC_API_KEY`), creates a website-chatbot agent, publishes it to `test`, and returns the embed snippet + dashboard URL.

**Custom build — the primitives:** `configure_llm_provider` → `create_agent({ workspace_id, name, archetype, channel, faq, pricing_facts, greeting, capabilities })` **[MCP]**. The `archetype` values are the starter shapes: `website-chatbot` (shipping), `voice-receptionist` and `sms-followup-bot` (queued — **not yet creatable via this tool**; a phone-answering agent today starts from an existing receptionist template or a marketplace listing and goes live via `deploy_agent`). `pricing_facts` is the **only** money the agent may quote — response validators (pricing-grounding, prompt-injection echo, PII leak) run on every turn and block critical failures. `capabilities` restricts the agent's typed tools (e.g. omit `book_appointment` for a read-only agent).

**Refine:** `update_agent_blueprint({ workspace_id, agent_id, patch })` **[MCP]**. Patchable fields: `faq`, `pricing_facts`, `greeting`, `capabilities`, `archetype`. Patch semantics: **arrays REPLACE, not merge** — to add one FAQ pair, fetch the current blueprint via `list_agents`, append, and submit the full array. Every update bumps the version (rollback-able) — re-run evals before going live again.

## 2. Test

- `publish_agent({ workspace_id, agent_id, status: "test" })` **[MCP]** — sandboxed: the human chats with it at `app.seldonframe.com/agents/[id]/test`. Not customer-facing.
- `run_agent_evals({ workspace_id, agent_id })` **[MCP]** — the 8-scenario safety + behavior suite: prompt-injection probes ×2, PII leak, pricing discipline ×2 (refuses invented prices / competitor match), scope refusal, greeting, escalation. Returns a pass-rate summary; results persist.

**The gate:** flipping to `live` requires **≥ 87.5%** on that suite — `publish_agent({status:"live"})` auto-runs it and rejects with `error: "eval_gate_failed"` plus an `evalSummary` naming the failed scenarios. Fix the blueprint, re-run, retry. Dry-run with `run_agent_evals` before publishing.

**Testing is sandbox + evals — never real messages.** `send_sms`, `send_email`, and `send_conversation_turn` are production surfaces that hit real CRM contacts. They are not test harnesses.

## 3. Deploy

`deploy_agent({ workspace_id, source, phone? })` **[MCP]** (requires `@seldonframe/mcp` ≥ 1.57; CLI twin: `seldonframe deploy`) turns a template into a **real, answering agent**. `source` is exactly one of:

- `{ template_id }` — an agent template this workspace built, or
- `{ listing_slug }` — a purchased/installed marketplace listing to run for a client.

It is **idempotent**: re-calling with the same source resumes the same deployment. Read the returned `status`:

- **`needs_connect`** — not live. `requirements`/`missing` list what's unmet (calendar OAuth, a connector, a phone number, business info) and `wizardUrl` is a one-time, **human-only** link (OAuth and Twilio connects cannot be done by an agent). Relay it **verbatim**: *"Open this once to connect your calendar / phone number: `<wizardUrl>`"* — then, after the human confirms, call `deploy_agent` again with the same source.
- **`live`** — deployed and answering right now. Real calls, real bookings, real revenue — say so plainly.
- **`disabled`** — the deploy verb isn't enabled in this environment (the platform's `SF_DEPLOY_ENABLED` flag is off). Report it and stop; do not work around it.

**Phone** (only when a `telephony` requirement is reported): `phone: { mode: "forward", number: "+1…" }` points an existing line at the agent; `phone: { mode: "provision", area_code: "512" }` **buys a real Twilio number on the workspace's own Twilio creds** — only on an explicit human ask.

## 4. Sell

1. `publish_agent({ status: "live" })` **[MCP]** — eval-gated, as above.
2. **List it on the marketplace** **[human]**: the Studio agent editor (`app.seldonframe.com/studio/agents`) has a "List on the marketplace" panel — category, tagline, tags, free or one-time install price, with a live preview of the storefront card. A **paid** listing requires the seller's Stripe Connect account; the panel surfaces that onboarding. Send the human there; you cannot click it for them.
3. **Set the usage price** **[API/CLI]** — op on `POST /api/v1/build/listings` (bearer `wst_` key):
   - `{ "op": "set_usage_price", "listingId": "…", "model": "per_call", "amountCents": 10 }` — $0.10 per call, or
   - `{ "op": "set_usage_price", "listingId": "…", "model": "per_outcome", "amountCents": 1000, "outcomeType": "booking" }` — $10 per booking.

   `set_usage_price` **sets a price; it charges no one** — listing is free, and the builder earns only on real usage. SeldonFrame's disclosed fee is 5% on usage; the builder keeps the rest.

Buyers find the listing on the public marketplace, via the discover → inspect → run catalog API (`POST /api/v1/build/{discover,inspect,run}`, CLI: `seldonframe discover / inspect / run`), or deploy it for a client with `deploy_agent({ source: { listing_slug } })`.

## 5. Get paid

- **Earnings:** `{ "op": "list_my_listings" }` on `POST /api/v1/build/listings` **[API/CLI]** — the seller's listings with net earnings after the disclosed fee. Wallet: `seldonframe wallet balance` or `GET /api/v1/build/wallet/balance`.
- **Payout:** `seldonframe payout` or `POST /api/v1/build/payout` **[API/CLI]** — withdraws accrued earnings to the builder's bank (Stripe Connect transfer). It is the **only** money-out endpoint; call it only when the human explicitly asks. Statuses: `paid` (money moving, ~2 business days) · `connect_required` (relay the `onboardingUrl` — bank connection is human-only; falls back to `app.seldonframe.com/build/wallet`) · `disabled` (payouts not enabled in this environment — report and stop).
- **Observe & improve** **[MCP]**: `tail_agent_conversations` (newest-first, with cost + first-message previews) → `get_agent_conversation` (full transcript) → `replay_conversation` (debug a turn); `get_agent_metrics` for health at a glance. Log what you learn with `write_brain_note` / read it back with `read_brain_path` — lessons feed the next build.

## Grounding table — the names agents guess vs. what exists

| You might reach for… | What actually exists |
|---|---|
| `build_agent`, `create_chatbot` | `build_website_chatbot` (bundle) or `create_agent` (primitive) |
| `add_agent_tools`, `create_agent_guardrails`, `configure_voice_channel` | All fields of `create_agent` / `update_agent_blueprint`: `capabilities`, `pricing_facts` + built-in validators, `archetype` + `channel` |
| `test_agent` — or "testing" via `send_sms` / `send_conversation_turn` | `publish_agent({status:"test"})` + the `/agents/[id]/test` sandbox + `run_agent_evals`. `send_conversation_turn` routes a message through a **real CRM contact** on sms/email — production, not a sandbox |
| `submit_soul` for marketplace submission | `submit_soul` persists a **workspace Soul** (business identity). Marketplace listing is the Studio panel + `set_usage_price` op |
| `export_agent` to "package for sale" | `export_agent` is a portable export. Selling is listing + pricing, no packaging step |
| `create_subscription`, `create_invoice` for seller billing | Those are **operator CRM tools** that bill the workspace's own customers. Builder earnings are `list_my_listings` / wallet / payout |
| `configure_payment_receiver`, `setup_stripe` | Stripe Connect onboarding happens in the Studio listing panel or the payout `connect_required` → `onboardingUrl` — human-only |
| `publish_landing_page` to publish the listing | That publishes a **workspace website page**. Listing is the Studio panel |

Full authoritative list: the server's `tools/list` (or `skills/mcp-server/src/tools.js` in the [seldonframe repo](https://github.com/seldonframe/seldonframe)).

## Guardrails — never do these

**Keys.** Never ask the user to paste a secret into chat; never echo, log, or write a key to a file. Keys live in env vars or the platform's masked flows, and the mint pages show them exactly once (`/settings/api`, `/build/keys`). If a key is missing, name the page and the env var — don't collect the value conversationally.

**Money.** No real charges in development, ever:
- `set_usage_price` prices — it never charges. A catalog `run` records cost but is not charged (`billing.charged: false`), and errors are never billed. Do not represent otherwise.
- **Never** call payout, provision a phone number, create or convert a paid listing, or change a live price unless the human explicitly asked for *that specific action this session*.

**The eval gate is the product.** Never pass `force: true` to `publish_agent` — it exists for platform emergencies, is logged, and defeats the "never-lies" guarantee the marketplace sells. `eval_gate_failed` means fix the blueprint, not bypass the gate.

**Human-only steps stay human.** `wizardUrl` (calendar OAuth / Twilio connect), Stripe Connect onboarding, and the Studio listing panel are for the human. Relay links verbatim; never attempt the OAuth flow or claim you completed a dashboard step.

**`disabled` means stop.** A `disabled` status from `deploy_agent` or payout is an environment gate, not an obstacle to route around.

**Stay in your lane.** Builder flow ≠ operator flow: don't touch CRM, booking, campaign, or messaging tools unless the human asks. And SeldonFrame is **hosted** — there is no local project to inspect (`ls`, `cat package.json`, reading `.env` tell you nothing); `get_workspace_state` is the source of truth. Never create local files and call them a workspace; never create a duplicate agent when the state response shows one exists.

| Tempting rationalization | Reality |
|---|---|
| "The user is in a hurry — `force: true` past the gate just this once" | The gate **is** the sale. A failing agent that ships harms the buyer and the builder's reputation. Fix, re-eval, then ship. |
| "I'll send one real SMS to check it works" | That messages a real person from a real business. Sandbox + evals exist precisely so you never have to. |
| "I'll just call payout to verify the pipeline" | Payout moves real money to a bank. Verify with `wallet balance` — it's read-only. |
| "I can complete the OAuth redirect myself" | You can't, and trying leaks the human's session. Relay the `wizardUrl` and wait. |

## Troubleshooting

- **401** — the key didn't load into the MCP process: reconnect (`/mcp` → reconnect, or restart the IDE), then retry. For the CLI: `seldonframe login`.
- **402** — a gated capability without a key: set `SELDONFRAME_API_KEY`, restart the MCP.
- **`eval_gate_failed`** — read `evalSummary`, fix via `update_agent_blueprint`, `run_agent_evals`, retry.
- **A blueprint array "lost" entries** — arrays REPLACE on patch; resubmit the full array.
- **`deploy_agent` → `disabled`** — deploys aren't enabled in this environment; report and stop.

---

Hosted twin of this flow: <https://seldonframe.com/SKILL.md> · Human quickstart: <https://seldonframe.com/build> · Server: [`@seldonframe/mcp`](https://www.npmjs.com/package/@seldonframe/mcp)
