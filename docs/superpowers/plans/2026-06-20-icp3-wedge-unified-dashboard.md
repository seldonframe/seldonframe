# ICP-3 Wedge + Unified Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` to execute this plan. Steps use checkbox (`- [ ]`) syntax. **Before Phase 0, run the codebase-recon task** to pin exact file paths against origin/main — this plan is architecture-level because it was authored from a stale worktree.

**Goal:** Ship the smallest end-to-end loop that proves the ICP-3 bet — *a builder configures a cal.diy voice receptionist, tests it, deploys it standalone to an SMB who never logs in, the SMB is billed, the builder gets paid and SeldonFrame takes a cut* — on a unified 6-noun dashboard shell.

**Architecture:** Reuse the existing voice runtime (SIP → OpenAI Realtime), Stripe Connect Express (from Proposals), agents/blueprint infra, cal.diy booking, and the pricing backend (#139). Add three new primitives: a **lite-tenant deployment** model (agent instance for a no-login client), **builder BYOK** key storage, and a **platform `application_fee`** on the builder→client charge. Wrap it all in a unified, adaptive 6-noun dashboard shell (Home · Agents · Customers · Inbox · Money · Clients).

**Tech stack:** Next.js 16 App Router, React 19, Drizzle + Neon Postgres, pnpm, node:test+tsx, Stripe Connect, Twilio (SIP + numbers), OpenAI Realtime (gpt-realtime-2).

**Spec reference:** `docs/strategy/2026-06-20-agents-platform-strategy.md` (§0 thesis, §2 deployable agent, §4 monetization, §9 why-switch) + memory `seldonframe-shopify-vision`.

---

## Definition of done (the vertical slice)
A builder: signs up → adds their LLM key (BYOK) → builds a "voice receptionist" agent (cal.diy) → **tests it** (places a test call, passes a basic eval) → deploys it to "Bella Hair Studio" — a lite tenant who **never logs in** — via a provisioned phone number wired to Bella's calendar → a real inbound call books an appointment on Bella's calendar → Bella is billed $300/mo → the builder is paid via Connect, SeldonFrame takes 5% + telephony. Visible in the builder's **Money** screen; the deployment visible under **Clients**.

---

## Data model (new + extended)

**New:**
- `agent_template` — a builder's reusable, sellable agent (reuse/extend `agents`: add `owner_kind='builder'`, `is_template=true`, `type='voice_receptionist'`, eval status). Holds persona/skill blocks + tool set (cal.diy) + voice.
- `deployment` (the lite tenant) — `id, builder_id, client_name, client_contact, agent_template_id, surface('phone'|'embed'|'link'), phone_number, caldiy_ref, status, price_cents, stripe_subscription_id, created_at`. **No workspace/org/site row.** (Client + deployment are 1:1 to start; keep `client` conceptually separable for future multi-agent clients.)
- `builder_llm_key` — `builder_id, provider, encrypted_key, created_at` (encrypted at rest; per-builder isolation).

**Reuse / extend:**
- Stripe Connect account model (Proposals) → builder onboards once.
- `agentConversations` / `agentTurns` → add `deployment_id` to scope transcripts per lite tenant.
- Pricing backend (#139) tables → telephony usage + the subscription/metering.
- `configure_llm_provider` / per-workspace key path → generalize to per-builder BYOK.

---

## Phase 0 — Codebase recon + unified shell + foundations

**Goal:** Pin reality, stand up the adaptive 6-noun shell, land the new models.

- [ ] **0.0 Codebase recon (do first).** On a fresh worktree off origin/main, map: current dashboard nav/layout files; the `agents` schema + voice webhook (`openai-realtime.ts`, voice persona/tool bridge); Stripe Connect (Proposals) modules; cal.diy install/book modules; pricing-backend (#139) tables + billing; the workspace/org model + workspace switcher. Output: a file-path map appended to this plan.
- [ ] **0.1 Unified shell (TDD where logic exists).** Build the adaptive left-nav: Home · Agents · Customers · Inbox · Money · [Clients] · Settings. `Clients` + workspace switcher render only when tenant-count > 1 (progressive disclosure). Same shell for ICP 1/2/3; data scoped by the switcher.
- [ ] **0.2 New schema + migrations (TDD).** `agent_template` (or `agents` extensions), `deployment`, `builder_llm_key`; add `deployment_id` to conversations/turns. Drizzle migration + journal entry; loud-fail migration guard (per #95).
- [ ] **0.3 Vocabulary fix.** Resolve the "Clients" vs "Customers" vs `/contacts` collision: **Clients = tenants you operate**, **Customers = end-people agents serve**. Rename routes/labels accordingly.

**Exit:** the new shell renders for a solo + a multi-tenant account; new tables exist; migrations green.

---

## Phase 1 — Agent productization + test/eval gate

**Goal:** A builder builds and *trusts* a voice-receptionist template before selling it.

- [ ] **1.1 Agents screen + Agent Builder.** List builder's templates; create/configure a `voice_receptionist`: persona/skill blocks (reuse `update_agent_blueprint`), tools = cal.diy, voice. (The mockup's Agent Builder.)
- [ ] **1.2 Test-before-sell.** A "test" affordance: place a test call / chat the agent in a sandbox (no client, no billing). Reuse the voice path against a scratch calendar.
- [ ] **1.3 Pre-deploy eval gate (from research).** A lightweight eval suite per template: generate realistic tasks → run agentic loops → assert task-completion + tool-call correctness (booking happens, no hallucinated facts). Surface an eval score; gate "deploy" on a pass threshold. (Anthropic agent-driven-eval pattern.)
- [ ] **1.4 Guardrails.** Input/output validation + the existing deterministic-vs-LLM boundary (LLM narrates only constrained tool returns). Carry over the voice anti-hallucination rules.

**Exit:** a builder can build a voice receptionist, test it live, and see an eval score; "deploy" is gated on pass.

---

## Phase 2 — Standalone deployment (lite tenant)

**Goal:** Deploy the agent to a client who never logs in.

- [ ] **2.1 Deploy flow (the 4-step mockup).** Pick agent → client details + connect *their* cal.diy → choose surface (phone first) → review → deploy. Creates a `deployment` row.
- [ ] **2.2 Telephony provisioning (Twilio resale).** Provision a number per deployment; route inbound to the voice webhook. SeldonFrame owns the Twilio relationship + A2P (absorbed for the builder).
- [ ] **2.3 Voice runtime: resolve by deployment.** Webhook resolves `deployment` (by number) → loads the template persona + the client's cal.diy calendar + the **builder's BYOK key** → runs the call → books into the client's calendar → persists transcript scoped to `deployment_id`. (Reuse `openai-realtime.ts`; swap workspace-resolution for deployment-resolution + BYOK key.)
- [ ] **2.4 Clients screen.** The builder's book of deployments: client, agent, status, usage, last activity (the portfolio noun).
- [ ] **2.5 Customers + Inbox (deployment-scoped).** End-customers the agent served + the conversation transcripts, scoped to the deployment.

**Exit:** a real inbound call to the provisioned number books on the client's calendar; the client has no SeldonFrame login.

---

## Phase 3 — Money: BYOK + Connect billing + the cut

**Goal:** Customer → builder → SeldonFrame, with no token COGS on us.

- [ ] **3.1 BYOK setup (Settings).** Builder pastes their LLM key; encrypted store; used by their deployments' runtime. Friendly one-time step.
- [ ] **3.2 Builder Connect onboarding.** Reuse Proposals' Connect Express onboarding for the builder.
- [ ] **3.3 Per-deployment subscription + `application_fee`.** On deploy/activate, create a Stripe subscription on the builder's connected account: the SMB is the customer, the builder is the merchant, SeldonFrame takes `application_fee_percent = 5` (flip on the existing-but-dormant fee). Small monthly minimum. **(Risk task — verify Connect recurring `application_fee` mechanics.)**
- [ ] **3.4 Telephony as metered usage.** Bill number + minutes (reuse #139 metering) at markup; surface as a usage line.
- [ ] **3.5 Money screen.** GMV, SeldonFrame fee, your net, payouts, per-client MRR + the live margin readout from the mockup.

**Exit:** deploying creates a live subscription; a charge routes SMB → builder with SeldonFrame's 5% taken; Money screen reconciles.

---

## Phase 4 — Fold legacy ICP 1/2 screens into the unified IA

**Goal:** The whole app speaks the 6-noun IA (Max's "wedge + unified dashboard" scope).

- [ ] **4.1 Customers** absorbs Bookings + Intake Forms + Contacts (as tabs); Agents owns their *config*.
- [ ] **4.2 Inbox** absorbs Conversations + Messaging.
- [ ] **4.3 Money** absorbs Deals + Proposals (+ the new deployment billing).
- [ ] **4.4 Agents** absorbs Automations.
- [ ] **4.5 Clients** = the portfolio (de-dup "Client workspaces" + "Clients"); ICP 2 = full workspaces, ICP 3 = deployments, same list.
- [ ] **4.6 Regression pass.** Ensure ICP 1/2 flows (existing workspaces, agencies) are unbroken under the new IA.

**Exit:** nav is 6 nouns + system; ICP 1/2/3 all use the same shell; no regressions.

---

## Phase 5 — End-to-end, guardrails, go-live

- [ ] **5.1 Full-loop smoke test:** builder → BYOK → build → test → deploy → real call → booking → billing → payout. (Live; surface to Max for the manual call.)
- [ ] **5.2 Observability:** per-deployment tracing, cost/token tracking (on the builder's key), call/eval logs, alerting on failures.
- [ ] **5.3 Multi-tenancy + security review:** lite-tenant isolation, BYOK key handling, Connect/A2P compliance.
- [ ] **5.4 Rollout doc + tier gate** (builder = $49 lane / $0+% wedge), behind a flag.

---

## What to reuse (do NOT rebuild)
Stripe Connect Express (Proposals) · voice runtime (`openai-realtime.ts`, tool bridge, transcript) · agents/blueprint + `update_agent_blueprint` · cal.diy install/book · Twilio provisioning · pricing backend #139 (metering/billing) · `configure_llm_provider` (→ BYOK) · the existing dashboard layout/components.

## Risks & mitigations
- **Connect recurring `application_fee` mechanics** → spike in Phase 3.3 before building the Money screen.
- **BYOK key security** → encrypt at rest, per-builder isolation, never log; review in 5.3.
- **Legacy migration breaks ICP 1/2** → Phase 4 regression pass; ship behind a flag.
- **Voice cost/latency at scale** → prompt-cache the persona prefix; cap; monitor.
- **A2P for resold numbers at scale** → SeldonFrame holds the Twilio/A2P relationship; gate US-scale outbound.
- **Scope creep** → marketplace, agent-to-agent, managed-key, and 2nd agent type are explicitly OUT.

## Testing strategy
TDD all new models + pure logic (deployment resolution, billing math, eval scoring). Voice path verified by live call (unit tests assert wiring only — per existing voice harness). Eval/guardrail suite per template. End-to-end smoke before go-live.

## Out of scope (later phases)
Marketplace + rev-share · agent-to-agent (MCP endpoints) · managed-key for ICP 1 · additional agent types (review-requester, chat, email) · the 3→2% take-rate tiering.
