# The IDE-Native Builder Lifecycle — Unified Surface + Funding (Design)

**Date:** 2026-07-01
**Status:** Approved (brainstorm). Next: implementation plan.
**Related:** the builder-onboarding lens (`get_workspace_state` `builder` block + `buildBuilderLadder`, on main — spec `2026-06-30-builder-onboarding-lens-design.md`); the prepaid wallet (the wallet-topup Stripe Checkout action + `wallet-ledger` drawdown + `GET /api/v1/build/wallet/balance`); the earnings ledger (`/studio/earnings`, `computeListingEarnings`); `@seldonframe/cli`; `skill-md.ts`. **Fast-follows (separate specs):** the **deploy** verb (agent → phone/channel/client) and the **automated Connect payout** (withdraw earnings to bank).

## The one line
**One surface, two readers.** A human runs `seldonframe status`; an agent reads the `builder` block — both see the WHOLE lifecycle (build → test → eval → run → sell → fund) and the single next action, and either can `wallet topup` from the editor. The IDE becomes the place the whole loop happens, for humans and agents alike.

## Scope (locked — Option A)
This spec = the **unified lifecycle surface + IDE-native funding**. **Out of scope (fast-follows):** the **deploy** verb (deploy to phone/channel/client) and the **automated Connect payout**. **x402 / agent-crypto funding is a deferred frontier — NOT in scope.**

## The money model (the truth the surface tells)
- **Selling → you EARN; no balance needed.** Each paid run credits your **95%** to the earnings ledger instantly, and **SeldonFrame's 5% is split off at that same instant** (renter pays the listed price → 95% to you, 5% to SF). Never a monthly charge, never from a balance.
- **The balance is for CONSUMING** — running *other* marketplace agents/tools or the 1000+ connected actions inside your agent or a test. Your own agent's LLM (BYOK) and SMS/voice (your Twilio) are billed to you directly, not the wallet.
- **Payout:** earnings accrue fee-free; withdrawal is a batched Stripe Connect transfer (≈monthly / on-demand → one payout fee). **Honest state:** earnings are tracked + exact today; the automated withdrawal is a fast-follow money-build — the surface reads **"$X earned · withdrawals coming soon"** until it ships.

## Locked decisions
1. **No x402/crypto.** Funding = a human tops up via Stripe; agents in the workspace spend from the shared balance. x402 deferred.
2. **Agents are guided, not guessing** — the SKILL.md playbook + the deterministic `builder` block (current rung + next action + exact tool). Thin harness + fat skill + Brain (Karpathy).
3. **Funding is human-triggered.** An agent surfaces the need (a 402, or the surface's low-balance note) and can fetch a Checkout link to hand the human, but never pays.
4. **Additive + money-safe:** reuse the shipped wallet rail (Checkout + ledger); no new charge path; test-mode default, flag-off, inert without keys. No migration.

## The design

### 1. The lifecycle model (pure)
Extend the pure builder logic (`src/lib/build/builder-ladder.ts`):
- Keep `buildBuilderLadder` (the sell ladder: build→test→eval→list→price→observe) as-is.
- Add **`buildLifecycleView(signals)`** → a superset composing: the sell ladder + **earnings** (`accrued_usd`, `payout_status`) + **wallet** (`balance_usd`, plus a **`fund_hint`** ONLY when the balance is low AND the builder is a consumer — a `hasConsumed`/low-balance signal) + a **per-agent lifecycle** array (each agent's rung state: built / tested / eval-gate / listed / priced / live). Pure; no I/O; unit-tested. This is the single source the surface renders.

### 2. The unified surface (one truth, two readers)
- **Extend the `builder` block** in `get_workspace_state` (`src/app/api/v1/workspace-state/route.ts`) to carry the lifecycle view: `agents[]` (lifecycle state + per-agent earnings), `earnings` (`accrued_usd`, `payout_status`), `wallet` (`balance_usd`, `fund_hint`). **Additive** — `next_steps`, `counts`, `integrations`, and the existing `builder` fields are untouched; the operator path is unchanged.
- **New `seldonframe status` CLI command** (`packages/cli/src/commands/status.ts` + dispatch): GET `get_workspace_state`, render the `builder` block for humans — a clean lifecycle view (agents + state · earnings · balance · **the ONE next action**). The agent reads the *same* block over MCP. Same truth, both audiences.

### 3. IDE-native funding
- **New route `POST /api/v1/build/wallet/topup`** — wraps the existing wallet-topup Stripe Checkout action; body `{ amountUsd }`; returns `{ checkoutUrl, sessionId }`. Guarded by the `wst_` bearer (`guardApiRequest`); money-safe (flag-off → an inert stub with a clear message; a test-mode key → a test-mode Checkout). Callable by the CLI **and** by an agent over the HTTP API (so an agent can fetch a link to hand the human — no new MCP tool needed).
- **New `seldonframe wallet topup --amount 20` CLI subcommand**: POST topup → print the Checkout URL → **poll `GET /api/v1/build/wallet/balance` until the balance rises** (or a timeout) → **"✓ funded $20."** The human runs it, pays in the browser once, and sees confirmation in the terminal.

### Honesty
The surface shows earnings truthfully — *"$X earned · withdrawals coming soon"* — until the Connect payout ships. No overclaiming.

## Architecture (thin harness)
- **Pure:** `builder-ladder.ts` gains `buildLifecycleView` + a `fundHint` helper (no I/O, unit-tested).
- **Route (additive):** the `builder` block in `workspace-state/route.ts` gains the lifecycle fields (reuse `computeListingEarnings` for accrued earnings; the wallet balance is already folded into that route's `Promise.all`).
- **New route:** `POST /api/v1/build/wallet/topup` wrapping the existing top-up action.
- **CLI:** `status` command + `wallet topup` subcommand + a small `pollUntilFunded` helper (injectable — unit-tested with a fake fetch). Reuse the `ApiClient`.
- No migration. No new charge path. Deploy + auto-payout are separate specs.

## Data flow
`seldonframe status` (human) or the agent reading the `builder` block → GET `get_workspace_state` → the lifecycle view (agents + earnings + balance + next action). When the builder wants to consume and is low → the surface says *"top up: `seldonframe wallet topup`."* → `POST /wallet/topup` → Checkout link → the human pays → the Stripe webhook credits the ledger → the CLI poll sees the balance rise → **"✓ funded"** → the agent can now run catalog tools drawing that balance.

## Reused vs net-new
- **Reuse:** `buildBuilderLadder`, the `get_workspace_state` `builder` block, the wallet-topup Stripe Checkout action, `GET /wallet/balance`, `computeListingEarnings`, the `ApiClient`, `guardApiRequest`.
- **Net-new (small):** `buildLifecycleView` + `fundHint` (pure); the builder-block lifecycle fields; `POST /wallet/topup`; the `status` + `wallet topup` CLI commands + the poll helper.

## Testing
- **`buildLifecycleView` / `fundHint` (pure):** per-agent lifecycle states; accrued earnings surfaced; low-balance-**and**-consumed → `fund_hint`; no consumption → no hint; determinism.
- **workspace-state builder block:** includes `earnings` + `agents` lifecycle + `wallet.fund_hint`; the operator path (`counts`/`next_steps`/`integrations`) is byte-for-byte unchanged.
- **CLI:** `status` renders the block (fake client); `wallet topup` posts + polls to funded (fake fetch: balance rises on the 2nd poll → "✓ funded"); topup on flag-off → an inert message, no charge.
- **topup route:** flag-off → inert stub; valid → returns `checkoutUrl` (fake Stripe); bad `wst_` bearer → 401.

## Out of scope (explicit)
- The **deploy verb** (agent → phone/channel/client) — the next spec.
- The **automated Connect payout** — a separate money-build; today earnings are tracked and shown honestly.
- **x402 / agent-crypto funding** — deferred frontier.
- Any change to the 95/5 split or the wallet-drawdown mechanics (unchanged).

## Open items (resolve in the plan)
- The exact signature/location of the existing wallet-topup Stripe Checkout action, and whether a topup API route already exists (the plan locates it; reuse, don't duplicate).
- The `status` render format (compact table vs. list) — copy pass in the plan.
- The `fund_hint` trigger threshold (what "low balance" means, and the `hasConsumed` signal — a prior drawdown, or the presence of Composio/catalog usage).
- The poll timeout + the "still processing? see /build/wallet" fallback copy.
