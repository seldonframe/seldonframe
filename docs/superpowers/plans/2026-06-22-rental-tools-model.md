# MCP Rental → Tools Model + Pricing Menu — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`. Build #1 (rental refactor) has NO migration → branch `feature/rental-tools-model`. Build #2 (pricing menu) has a migration → its own branch, Max's gate.

**Goal (from research-validated design):** Make the MCP rental "the renter brings the fuel" — expose the agent's **skill as an MCP prompt** + its **deterministic tools**, so the RENTER's own LLM orchestrates them with **zero compute cost to the seller/platform**. Today the rental's single `ask` tool runs the agent loop on the CREATOR's key (recon: `agent-mcp-handler.ts` → `runStatelessAgentTurn`) — that's the thing to flip.

**Architecture (from recon):** The rental endpoint `/api/v1/agents/[slug]/mcp` + `lib/marketplace/agent-mcp-handler.ts` (JSON-RPC: `initialize`/`ping`/`tools/list`/`tools/call`) + `agent-mcp-rpc.ts` (the `ask` descriptor). MCP `prompts/list`+`prompts/get` are **NET-NEW**. Agent tools (`lib/agents/tools.ts`) are workspace-bound (orgId from runtime), BUT some are **blueprint-carried + deterministic** (`get_quote_range`←`blueprint.quoteRanges`, `provide_faq_answer`←`blueprint.faq`) — those are portable + safe to rent with **no LLM**. Workspace-stateful tools (book/CRM-write) stay **install-only** (they'd write to the creator's workspace).

**Tech Stack:** Next.js 16, `node:test`+`tsx`. Conventions: tests `cd packages/crm && node --import tsx --test <files>`; tsc 0-new; `bash scripts/check-use-server.sh src`; TDD the pure logic. **No migration in this build.**

---

## BUILD #1 — Rental tools model (this branch, no migration)

### Task 1: Expose the agent's skill as an MCP prompt (pure + handler, TDD)
**Files:** `lib/marketplace/agent-mcp-rpc.ts` (pure descriptor builders + parser), `lib/marketplace/agent-mcp-handler.ts` (route the methods). Test `agent-mcp-rpc.spec.ts`.
- [ ] Pure: `buildPromptsListResult(agent)` → MCP `prompts/list` shape — ONE prompt `{ name: "act_as_<slug>", description: "Act as the <name> agent — <summary of capabilities>.", arguments: [] }`. `buildPromptGetResult(agent)` → MCP `prompts/get` shape: a single `user`/`assistant`-role message whose text is the agent's **`blueprint.customSkillMd`** (the playbook) + a one-line framing ("You are <name>. Follow this skill exactly. Tools available: <names>."). Parser: `parsePromptsGetParams(params)` → `{ name }` (validate).
- [ ] Handler: add `prompts/list` + `prompts/get` cases (auth-gated like tools). `prompts/get` for an unknown name → JSON-RPC invalid-params.
- [ ] TDD: prompts/list returns the act-as prompt; prompts/get returns the customSkillMd; unknown prompt name errors. **Commit** `feat(rental): expose agent skill as an MCP prompt (prompts/list + prompts/get, TDD)`.

### Task 2: Expose deterministic tools; renter's LLM drives (zero creator compute)
**Files:** `agent-mcp-rpc.ts` (tool descriptors from the blueprint), `agent-mcp-handler.ts` (`tools/call` dispatch).
- [ ] Build `tools/list` from the agent's **deterministic, blueprint-carried** capabilities ONLY: `get_quote_range` (args: service → returns the blueprint's quote range) + `provide_faq_answer` (args: question → returns the best blueprint FAQ match). These execute **server-side with NO LLM** (pure lookups over `blueprint.quoteRanges` / `blueprint.faq`). Each gets a real MCP `inputSchema`.
- [ ] **Keep the existing `ask` tool BUT relabel + gate it:** rename its description to make clear it "delegates to the live agent (uses the agent owner's compute)" — it's the optional agent-as-a-service path. The DEFAULT rental value is now the **prompt + deterministic tools** (renter's LLM + zero creator cost). Do NOT expose workspace-stateful tools (book/availability/CRM) — those are install-only (note why in a comment).
- [ ] `tools/call` dispatches the deterministic tools (pure executors) directly; `ask` keeps its current path. Usage logging (`agent_rental_call`) stays.
- [ ] TDD: tools/list includes get_quote_range + provide_faq_answer (not book_appointment); calling get_quote_range returns the blueprint range with no LLM; `ask` still routes. **Commit** `feat(rental): deterministic skill tools (quote/faq) — renter's LLM drives, zero creator compute`.

### Task 3: Verify #1
- [ ] Suites green; tsc 0-new; `check-use-server` clean; no migration.
- [ ] **Report:** the new prompt + deterministic-tools surface (file:line), confirmation the default rental no longer requires the creator's LLM (prompt + pure tools), that stateful tools are install-only, the `ask` relabel, the copyable MCP config the listing page should show (`prompts/get` to load the skill + `tools/call` for quote/faq), new-test count, and the honest gap — live: point Claude/Cursor at `…/api/v1/agents/[slug]/mcp`, load the prompt, call a tool.

---

## BUILD #2 — Pricing menu (SEPARATE branch, has migration — Max's gate)

### Task 1: Schema — pricing model (additive migration)
- [ ] `marketplace_listings` add: `priceModel text not null default 'onetime'` (`onetime|monthly|per_usage|per_outcome`), `monthlyPriceCents int`, `perCallPriceCents int`, `perOutcomePriceCents int`, `outcomeType text` (`booking|review|quote|message`). `price` stays (the one-time price). `pnpm drizzle-kit generate` → one additive migration.

### Task 2: Publish flow + audience guidance
- [ ] `seller-actions.ts` `publishOrUpdateAgentListingAction` — accept `{ priceModel, monthlyPriceCents?, perCallPriceCents?, perOutcomePriceCents?, outcomeType? }`; validate the field for the chosen model. Pure validator (TDD).
- [ ] `list-on-marketplace.tsx` — a **pricing-model selector** (Free · One-time · Monthly · Per-usage · Per-outcome) with conditional fields, and an **audience hint** (NOT a hard gate): *"Selling to businesses? Flat or monthly. Selling to other agents/devs? Per-usage or per-outcome."* — 27% of SMBs want outcome pricing, so all models are selectable for anyone. Live listing preview shows the chosen price.

### Task 3: Earnings + verify
- [ ] `earnings.ts` — surface the price model per listing; the 5% fee (`computeMarketplaceFeeCents`, from the fee-split branch) applies to each model's gross. (Per-usage/per-outcome rental billing — the actual metered charge — is the x402/AP2 follow-on; this build sets the price + displays it.)
- [ ] Verify (tests + tsc + check-use-server + migration journal). DO NOT MERGE without Max (migration).

## Self-Review
- #1: skill-as-prompt (T1) ✓; deterministic tools, renter's LLM, zero creator compute (T2) ✓; stateful tools install-only ✓; `ask` retained-but-relabeled ✓; no migration ✓.
- #2: 4-model pricing schema + UI + audience guidance (not gated) ✓; 5% fee reuse ✓; migration → Max's gate ✓.
- Deferred: the actual per-usage/per-outcome metered SETTLEMENT (x402/AP2 rail) — priced now, settled later.
