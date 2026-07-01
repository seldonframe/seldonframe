# Builder Onboarding — the Builder Lens (Design)

**Date:** 2026-06-30
**Status:** Approved (brainstorm). Next: implementation plan.
**Related:** the builder marketplace (`docs/superpowers/specs/2026-06-30-builder-marketplace-design.md` + the shipped P0–P2 loop), the SKILL.md funnel (`src/lib/build/skill-md.ts`), `get_workspace_state` (`src/app/api/v1/workspace-state/route.ts`), the buyer wizard's pure step-engine (`src/lib/marketplace/onboarding/steps.ts` — the pattern we mirror), the eval harness (`agentEvals`, `eval_meets_publish_gate`).

## The one line
**When a builder connects the MCP, the very first response should say "you're building an agent to *sell* — here's where you are, here's the one next thing," not dump the SMB operator dashboard.** We do it with a *builder lens* on the existing entry point — thin harness, fat SKILL, Brain-connected — reusing the caliber of the shipped buyer wizard, but conversational/IDE-native.

## The problem (the smoking gun)
`get_workspace_state` is the first tool the connected agent calls. Its `composeNextSteps()` (`src/app/api/v1/workspace-state/route.ts:272`) is 100% operator-framed — verbatim:
- *"No agents yet — call **build_website_chatbot** to create your first **chatbot**…"*
- *"Workspace is healthy. Use **update_website_chatbot** … or **tail_agent_conversations**…"*

So a builder is told to run an SMB chatbot, never "build an agent to sell." Plus the response foregrounds **operator furniture** (contacts/bookings/deals counts, Twilio-not-configured nags) that a builder does not care about. Result: "am I creating a chatbot? … this is an onboarding, right?" Secondary friction: **two divergent connect recipes** (hosted HTTP `--header` vs local `npx … -e SELDONFRAME_API_KEY`) + the 401-stale-process dance.

## Decisions (locked)
1. **Approach B — reframe the entry.** A `lens: "builder"` branch in `get_workspace_state` returns a builder-framed `next_steps` (the build→sell ladder) and hides operator furniture. No new MCP tool, no migration, no persisted workspace flag. The lens is **ephemeral/per-session**, set by the SKILL passing the hint. (Rejected: a dedicated `start_building` tool = net-new surface; pure-skill = leaves the misleading operator `next_steps` firing.)
2. **Thin harness + fat skills + Brain (Karpathy).** The only harness change is one **pure** ladder function + a small branch in the existing route. The SKILL.md is the *director* — it carries the narration, the one-rung-at-a-time discipline, and the "ignore CRM" instruction. The Brain (evals + loop-memory + lessons) is already the learning substrate; we make it a *visible rung*.
3. **Eval / test / logs are visible rungs**, not afterthoughts — the exact gap the builder felt.
4. **One workspace, first free, single Soul** — the lens reframes; it does not create a separate builder workspace.
5. **One canonical connect.** Standardize on **hosted HTTP** (`--transport http https://mcp.seldonframe.com/v1 --header "Authorization: Bearer wst_…"`) as the single documented recipe (nothing to install, no stale local process). The npx/stdio form is demoted to a fallback note. `get_workspace_state` doubles as the **key preflight**: if it 401s, the SKILL tells the agent to reconnect — no new whoami tool.

## The builder ladder
A single pure function computes where the builder is and the one next action. Six rungs; each carries a plain-language `nextAction` and the exact MCP tool. The **current rung = the first not-`done` rung** (mirrors `firstIncompleteStep` in the buyer engine).

| # | Rung | `done` when (deterministic signal) | Next action (narrated) | Tool |
|---|------|-----------------------------------|------------------------|------|
| 1 | **Build** | the workspace has ≥1 agent | "Describe the agent you want to sell (e.g. a 24/7 receptionist that books jobs). I'll build it from one sentence." | `create_agent` |
| 2 | **Test** | *soft* — marked done once evals have run (you test before you eval); always shown as a recommended action | "Try it like a customer before you sell it." | `send_conversation_turn` |
| 3 | **Eval** | the agent's latest eval run `eval_meets_publish_gate` (≥87.5%) | "Run its evals — publishing a live agent needs ≥87.5%." | `run_agent_evals` |
| 4 | **List** | the agent has a marketplace listing | "List it on the marketplace so buyers and other agents can find it." | `publish_agent` |
| 5 | **Price** | the listing has a usage price | "Set your price — per call or per outcome. Listing is free; you keep 95%." | `set_usage_price` |
| 6 | **Observe & earn** | terminal / ongoing | "Live at seldonframe.com/marketplace/&lt;slug&gt;. Watch runs with `tail_agent_conversations`, earnings at /build/wallet. The Brain logs every run and feeds the lessons into your next build." | `tail_agent_conversations` |

Notes:
- **Current-rung logic is driven by the hard gates** (hasAgent → evalPassesGate → hasListing → hasPrice). "Test" (rung 2) is soft: it never *blocks* progression — it's surfaced as the recommended action between Build and Eval, and reported `done` once an eval has run. This keeps the ladder deterministic while honoring "test must be visible."
- The ladder **self-adapts to existing state**: a workspace that already has agents (e.g. Seldon Studio) lands on "List it," not "Build one." An empty free workspace lands on rung 1.

## Architecture (thin harness)
Four focused units:

1. **`src/lib/build/builder-ladder.ts` (NEW, pure).** `buildBuilderLadder(signals): BuilderLadder` — takes a small signal object (agent count, per-agent eval-gate booleans, listing+price presence per the builder's listings, wallet balance, marketplace base URL) and returns `{ rungs: BuilderRung[], currentRung, nextActions: string[], progress: {done, total} }`. No I/O, no clock, no `"use server"`. Unit-tested exhaustively (each rung transition). This is the analogue of `buildOnboardingSteps`.
2. **`get_workspace_state` lens branch** (`src/app/api/v1/workspace-state/route.ts`, small edit). Accept `?lens=builder`. The **MCP tool `get_workspace_state` gains an optional `lens` arg** that maps to the query param (wherever the MCP tool schema is defined — the `@seldonframe/mcp` server / tool registry; the plan locates it), so the SKILL can pass `get_workspace_state({ lens: "builder" })`. When `lens=builder`:
   - Gather the builder signals (reuse the agent+eval data already computed; add a cheap `list_my_listings`-style read for listing/price presence + wallet balance).
   - Replace `next_steps` with `buildBuilderLadder(...).nextActions`.
   - Add a `builder` block: the ladder rungs with status + progress, the wallet balance, and listing links.
   - **Hide operator furniture:** omit `counts.{contacts,bookings,deals}` and the operator-only integration nags (Twilio/Kit/Mailchimp); keep only builder-relevant integrations (anthropic/openai for running/voice, composio for tools). Non-builder callers are unchanged.
3. **`src/lib/build/skill-md.ts` rewrite** (the fat director). Reframe SKILL.md so the agent: (a) calls `get_workspace_state({ lens: "builder" })` **first** and treats a 401 as "reconnect, your key didn't load"; (b) acts as the onboarding host — states the goal ("build an agent to **sell**"), walks the ladder **one rung at a time**, narrates each step + its cost/earn; (c) **ignores CRM/bookings/contacts tools unless explicitly asked**; (d) explicitly names the test/eval/observe tools at their rungs. The build→test→eval→list→price→observe arc is the spine.
4. **Connect consolidation** (SKILL.md + `/build` + `src/app/docs/getting-started/connect-claude-code`). One canonical hosted-HTTP recipe; npx/stdio demoted to a footnote.

No migration. No new MCP tool. No persisted flag.

## Data flow
`set up SKILL.md` → agent reads the (rewritten) SKILL → calls `get_workspace_state({ lens: "builder" })` → gets the ladder + the one next action + a clean builder view → guides the human through that rung → the rung's tool call advances state → agent re-calls `get_workspace_state({ lens: "builder" })` to re-orient → … → rung 6 (observe & earn).

## Error handling
- **401 on `get_workspace_state`** → the SKILL instructs: "your key didn't load into the MCP process — reconnect (`/mcp` → reconnect, or restart), then retry." (Fixes the stale-process confusion deterministically.)
- **Empty workspace** (no agents) → rung 1 (Build); the response never shows an empty CRM.
- **Eval below gate** → current rung stays Eval with "fix what failed, re-run"; the ladder surfaces the failing scenarios already in the agent stats.
- **No listings yet but agents exist** → rung 4 (List) — the self-adapt case.

## Reused vs net-new
- **Reuse:** `get_workspace_state` + its agent/eval computation, the eval publish-gate (`eval_meets_publish_gate`), the buyer wizard's pure-step-engine pattern, the build/test/eval/publish/price/wallet/tail tools, the marketplace listing + wallet reads.
- **Net-new (small):** `builder-ladder.ts` (pure), the `lens=builder` branch, the SKILL.md rewrite, the connect-doc consolidation. All additive.

## Testing
- **`builder-ladder.spec.ts`:** each rung transition (empty → Build; agent-no-eval → Eval; eval-pass-no-listing → List; listed-no-price → Price; priced → Observe); the self-adapt case (existing agents → List); progress counts; determinism.
- **workspace-state lens test:** `lens=builder` returns builder `next_steps` (mentions build/sell + the ladder tools), includes the `builder` block, and **omits** `counts.contacts/bookings/deals`; default (no lens) is byte-for-byte unchanged.
- **SKILL.md pins:** names `get_workspace_state({ lens: "builder" })` as step one, the one-canonical hosted-HTTP connect, the 401-reconnect instruction, and the test/eval/logs tools at their rungs; deterministic output.

## Out of scope
- A persisted "builder workspace" type or a web builder dashboard (this is IDE/MCP-native).
- The Connect **payout** (sellers cashing out earnings) — a separate money-build; earnings still accrue as ledger rows today.
- A dedicated `start_building` tool (rejected in favor of B).
- Auto-detecting builder-intent from key origin (possible future; the SKILL passing `lens` is enough now).

## Open items (resolve in the plan)
- Exact shape of the cheap listing/price/wallet read added to the lens branch (reuse `list_my_listings` internals vs a direct query).
- Whether the `builder` block should include a short "earnings so far" line (nice-to-have) or defer to `/build/wallet`.
- Copy pass on the six `nextAction` strings (they're load-bearing — pin them in the pure module + tests).
