# x402/AP2 Metered Rental Rail (v1: protocol + meter, no live settlement) — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`. **PAYMENT-SENSITIVE.** v1 moves NO real money — the settlement verifier is a pluggable DEV stub. **Do NOT merge** without Max (the live Coinbase x402 facilitator + a USDC pay-to address are his setup). Prefer NO migration (reuse the `agent_rental_call` event log); if a paid-call ledger is cleaner, an additive migration → Max's gate.

**Goal:** Make the MCP rental rail **x402-native from day one** — meter every rental call, enforce the confirmed **three-lane pricing**, and return **HTTP 402** with the standard **x402 payment-requirements** when payment is due. The actual on-chain USDC settlement is a pluggable verifier (DEV stub now → Coinbase facilitator later).

**The three lanes (confirmed by Max):**
1. **SeldonFrame first-party agents** — FREE up to a monthly allowance (e.g. `SF_FREE_CALLS = 100`/renter/listing), then a low floor (`SF_FLOOR_CENTS_PER_CALL`, e.g. 2¢). SF keeps 100% (it's SF's own agent).
2. **Builders' agents** — the builder's `priceModel` (per_usage `perCallPriceCents` / per_outcome `perOutcomePriceCents` / monthly) **+ SF 5%** (`computeMarketplaceFeeCents`).
3. **Deploy-into-workspace** — NOT this rail (it's the $29/mo workspace on the renter's BYOK; no per-call meter).

**Architecture (from recon):** the rail = `/api/v1/agents/[slug]/mcp` → `lib/marketplace/agent-mcp-handler.ts` (JSON-RPC; `tools/call` runs deterministic tools + the optional `ask`). Usage is already logged as `agent_rental_call` events (orgId=creator, properties.listing_id). The pricing fields (`priceModel`, `perCallPriceCents`, `perOutcomePriceCents`) exist on `marketplace_listings` (the pricing-menu build). The 5% fee = `computeMarketplaceFeeCents` (`lib/billing/gmv.ts`). x402 spec: server replies `402` + `{ x402Version, accepts:[{scheme,network,maxAmountRequired,resource,payTo,asset,...}] }`; client retries with an `X-PAYMENT` header (a base64 signed payment); server verifies via a facilitator.

**Tech Stack:** Next.js 16, `node:test`+`tsx`. Conventions: tests `cd packages/crm && node --import tsx --test`; tsc 0-new; `bash scripts/check-use-server.sh src`; TDD the pure logic.

---

## Task 1: Metering + lane resolution (pure, TDD)
**Files:** Create `lib/marketplace/rental-pricing.ts`; Test `…/rental-pricing.spec.ts`.
- [ ] Constants: `SF_FREE_CALLS = 100`, `SF_FLOOR_CENTS_PER_CALL = 2` (export — UI/copy never hardcodes).
- [ ] `resolveRentalCharge({ listing, isFirstParty, renterCallsThisMonth })` → `{ lane: "sf_free"|"sf_floor"|"builder"|"free", amountCents, requiresPayment, feeCents }`. Rules: first-party + under allowance → `sf_free` (0, no pay); first-party + over → `sf_floor` (floor, pay, fee=full to SF); builder paid → `builder` (the priceModel amount, pay, `feeCents = computeMarketplaceFeeCents(amount)`); builder free / no price → `free` (0). `isFirstParty` = listing.creatorOrgId === the SeldonFrame house org (a configured `SELDONFRAME_HOUSE_ORG_ID` env, with a safe default).
- [ ] TDD: each lane; allowance boundary (call 100 free, 101 floor); builder per-call fee = 5%; non-finite/negative guarded. **Commit** `feat(x402): three-lane rental charge resolver (pure, TDD)`.

## Task 2: x402 protocol (pure, TDD)
**Files:** Create `lib/marketplace/x402.ts`; Test `…/x402.spec.ts`.
- [ ] `buildPaymentRequired({ amountCents, resource, payTo, network })` → the x402 `402` body: `{ x402Version: 1, error: "payment_required", accepts: [{ scheme: "exact", network: network ?? "base", maxAmountRequired: <amount in asset base units>, resource, payTo, asset: "<USDC contract>", maxTimeoutSeconds: 60, description }] }`. (USDC has 6 decimals — convert cents→USDC base units carefully + test.)
- [ ] `parseXPaymentHeader(headerValue)` → decode base64 JSON → validate shape `{ x402Version, scheme, network, payload }` → typed result or `{ ok:false, reason }`. Never throw.
- [ ] The verifier seam: `type SettlementVerifier = (payment, requirements) => Promise<{ ok: true; txRef: string } | { ok: false; reason: string }>`; export `devStubVerifier` (validates shape + amount ≥ required → `{ ok:true, txRef:"dev-<nonce>" }`, **moves no money**) and a documented `// TODO: coinbaseFacilitatorVerifier` seam (POST to the x402 facilitator). 
- [ ] TDD: payment-required body shape + cents→USDC-base-units; header parse valid/garbage; devStub accepts good, rejects underpayment. **Commit** `feat(x402): payment-required builder + X-PAYMENT parser + pluggable verifier (dev stub, no live money)`.

## Task 3: Wire the rail (402 on billable, serve on paid, accrue)
**Files:** `lib/marketplace/agent-mcp-handler.ts` + `app/api/v1/agents/[slug]/mcp/route.ts`.
- [ ] In `tools/call` (and `ask`): before executing a **billable** call, compute the renter's calls-this-month (count `agent_rental_call` events for this renter+listing in the current month — DI a counter fn) → `resolveRentalCharge`. If `requiresPayment`: read `X-PAYMENT`; if missing/invalid → return **HTTP 402** + `buildPaymentRequired(...)` (JSON-RPC-friendly error envelope); if present → `verifier(...)`; on `ok` → execute + log the `agent_rental_call` event with `amount_cents` + `fee_cents` + `tx_ref` (accrual via event properties — NO migration); on fail → 402 again. Free lanes (`sf_free`/`free`) execute + log as today (amount 0).
- [ ] The verifier is injected (`deps.settlementVerifier = devStubVerifier` by default) so prod stays money-safe until the facilitator is wired. The `prompts/*` + `tools/list` discovery calls are NEVER billable (free to inspect).
- [ ] **Commit** `feat(x402): rail returns 402 + settles via pluggable verifier; paid calls accrue (dev-safe)`.

## Task 4: Surface paid rentals in earnings + verify
- [ ] `lib/marketplace/earnings.ts` — sum paid rental calls (events with `amount_cents`) into rental revenue + the 5% (today rentals show count only). The earnings page shows rental $ alongside installs.
- [ ] Verify: suites green; tsc 0-new; `check-use-server` clean.
- [ ] **Report:** the three lanes + the x402 402/header/verifier (file:line), confirmation **no real money moves** (dev stub) + the exact seam to wire the **Coinbase x402 facilitator** + what Max must set (`SELDONFRAME_HOUSE_ORG_ID`, a USDC `payTo` address, the facilitator URL/key), the accrual path, new-test count, and the honest gap — **DO NOT MERGE**: live settlement + a real X-PAYMENT round-trip from an x402 client are untested until the facilitator is wired.

## Self-Review
- Coverage: three-lane resolver (T1) ✓; x402 402 + header + pluggable verifier (T2) ✓; rail wiring 402→verify→accrue (T3) ✓; earnings rental-$ (T4) ✓; money-safe by default (dev stub) ✓; rail is x402-native from day 1 (Max's ask) ✓.
- Deferred (the focused follow-on, Max's setup): the real **Coinbase x402 facilitator** verifier + USDC pay-to + AP2 mandate support + a live end-to-end paid call. Per-outcome settlement (per booking/review) reuses the same path keyed on the outcome event.
