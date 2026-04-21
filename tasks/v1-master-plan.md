# SeldonFrame v1 — Master Plan

**Date written:** 2026-04-20
**Canonical inputs:** `CLAUDE.md` + strategic update message of 2026-04-20 (per user confirmation — `MASTER-CONTEXT.md` was a mis-reference; no such file in repo).
**Mode:** Plan only, no implementation. Phase 0 may resume in parallel with review of this doc.
**Ship discipline:** "Product ships when it's actually good" — no fixed date. Complexity reported as LOC / files / external deps / unknown-unknowns, not time estimates.

## §0 — Headline differentiator reframe *(2026-04-20 strategic update)*

Pre-2026-04-20 the v1 headline differentiator was **(b) customization via conversation** — "type to Claude Code, your CRM changes."

Post-2026-04-20 that framing is subsumed by the real bet: **(g) agent synthesis — Claude Code synthesizes complete personalized agents from Soul + blocks**. "Customization via conversation" is one side effect of the same underlying capability; agent synthesis is the categorical moat.

**Differentiator list, updated rank order:**

| # | Differentiator | Pre-reframe framing | Now |
|---|---|---|---|
| **g** | **Agent synthesis** | "AI-native foundation" | **Headline — #1 moat.** Builder picks an archetype (speed-to-lead, welcome series, dunning, etc.), adds one-sentence NL customization; Claude Code + Soul + block registry fill in a working personalized agent in <60s. No competitor does this. Delivered by Phase 7 Agent Engine. Framing updated 2026-04-21 after the 7.a spike — original "one sentence → working agent from scratch" was honest only for archetypal prompts; "archetype + NL customization" is the correct product UX and stronger PMF for agency / solopreneur builders. |
| c | Legible + testable automations | GHL has silent misfires | Strong #2. Phase 7 canvas makes every agent visually inspectable. |
| d | Snapshots updatable + forkable | Static snapshots vs living | Strong #3. Phase 9. |
| a | Transparent pricing | No agency-wallet surprise | Strong #4. Already shipped in 0.5. |
| e | Data ownership + full export | No lock-in | Phase 9 snapshots. |
| f | White-label public URLs | GHL agency-only | Phase 8 custom domains. |
| h | Zero-friction first workspace | GHL $97/mo paywall | Already shipped (v0.x). |
| b | Conversation-driven customization | Was headline | **Subsumed by (g).** Same underlying tech, sharper name. |

**Vocabulary locked (2026-04-20):**
- `/automations` route → **`/agents`** (rename applied in Phase 7.a).
- "Automation engine" → **"Agent engine"**.
- "Soul-generated automations" → **"Soul-generated agents"**.
- "Automation Marketplace" (future v1.1+) → **"Agent Marketplace"**.
- Be disciplined on the distinction: *agent* = multi-turn / reasoning / conversation; *workflow* (or *recipe*) = simple trigger→action. Both live under /agents but internal copy respects the line.

**Secondary ICP noted (not a phase):** external AI-agent frameworks (CrewAI, LangGraph, OpenAI Agents SDK) will want SeldonFrame as their memory-and-action layer via the MCP surface. Same product, second GTM track. The technical work is already planned (MCP tools + Soul + blocks); positioning + docs work slots into Phase 12.

---

## Preamble — Status truthing

The strategic brief was written against an earlier session state. Current truth on `origin/main`:

| Work | Briefing said | Actually on main |
|---|---|---|
| 0b — orphan deletion | "committed locally as fc3060b6, not pushed (network)" | **Pushed.** `fc3060b6` landed. |
| 0c — shadcn primitives | "pending" | **Shipped** as `03420988`. |
| 0d — drawer standardization | "pending" | **Shipped** as `e3b42c96`. |
| 0a — oklch token unification | "pending" | **On preview branch** `preview/tokens-oklch` at `6d7fe25d`. Awaiting your visual sign-off on 7 pages. Not on main. |
| 0.5 — "truthing pass" (not in briefing) | n/a | **Shipped.** Blank landing seed fix + repair hook, `/pricing` rewrite, `/settings/billing` rewrite, stale `seldon-it-50-limit` removed, 6 intake form templates. Commits `ec58dda7`, `150ba951`, `29a24b36`, `ea706162`, `739ae8cb`. |
| Phase 1.a — TableView Twenty polish | n/a | **Shipped** as `036b2e9a` — before the strategic update arrived. Assumption: kept as-is (it directly serves the now-explicit Phase 1 "Twenty-grade first-impression polish" goal). If the brief intended to redirect this, say so; I'll revert or redirect. |

**Net state (updated 2026-04-21 after Phase 3 ship):**
- Phase 0: ✅ **Complete.** 0a merged to main as `5dd33c68`. Tokens unified on oklch.
- Phase 0.5 (truthing): ✅ **Complete.** Landing seed fix + repair hook, /pricing rewrite, /settings/billing rewrite, stale seldon-it limit removed, 6 form templates.
- Phase 1 (CRM / Booking / Intake polish): ✅ **Complete.** 1.a TableView + 1.b KanbanView + 1.c booking admin + 1.d booking public (react-day-picker) + 1.e intake Typeform-style + 1.f intake admin editor.
- Phase 2 (MCP surface for existing blocks): ✅ **Complete.** 2.a audit + 2.b 12 CRM tools + 2.c 4 booking tools + appointment-type CRUD + 2.d 7 intake tools + forms CRUD. Tool count: 22 → 43.
- Phase 2.5 (substrate audits): ✅ **Partial / Complete as scoped.** 2.5.a event-bus audit shipped (Verdict A). 2.5.d secrets audit shipped (solid). 2.5.b deferred (near-no-op). 2.5.c deferred into Phase 3.
- Phase 2.75 (BLOCK.md composition contract): ✅ **Shipped** as `447ffec8`. Parser extension (+170 LOC) + backfill of caldiy-booking + formbricks-intake + net-new crm.block.md + L-15 lessons entry. Validator surfaces 5 warning codes (empty_contract, no_verbs, malformed_produces, unknown_compose_with, verbose_verb); non-fatal today, CI-gating in Phase 12.
- Phase 3 (Email + Conversation Primitive): ✅ **Shipped 2026-04-21** across 10 commits (`9ee1f2ea` → `87a7efc9`). All build-green.
- Phase 4+ : not started. **Phase 4 gated on this amendment approval** — contract schema is locked by Phase 3 authoring, and the SMS block writes against the same format.

---

## A. Workstream map

### Phase 0 — Substrate
**Status:** ~95% done. Remaining: 0a preview merge after visual sign-off.
**Dependencies:** none (foundational).
**GHL differentiators served:** (h) zero-friction first workspace — correct CSS substrate is prerequisite to "feels magical".
**Journey stages served:** Stage 2 (hero moment requires correct color rendering).
**Complexity:** 1 remaining merge commit (oklch). Done.

### Phase 0.5 — Truthing pass *(absorbed into Phase 0; ship-complete)*
**Status:** Done.
**Why it exists:** Pre-launch correctness issues discovered during visual review — blank landing, pricing page advertising stale $49–$449 tiers, billing UI using old plan labels, BYO-API-key model not reflected in UI, no starter form templates.
**GHL differentiators served:** (a) transparent pricing, (h) zero-friction first workspace.
**Journey stages served:** 1, 2, 4.
**Complexity:** 5 commits shipped, ~600 LOC net changed.

### Phase 1 — CRM + Booking + Intake first-impression polish
**Status:** ~10% (1.a TableView shipped).
**Dependencies:** Phase 0 substrate (correct tokens + primitives).
**Scope:** Twenty-grade for CRM, Cal.com-grade for Booking, Typeform-grade for Intake public flow. Explicitly **deferred to v1.1**: column resize, density toggle, URL filter state, bulk edit UI, keyboard shortcuts, view duplication, multi-select, segment builder.
**GHL differentiators served:** (b) conversation-driven customization indirectly — polished surfaces make "it's already beautiful, just tell Claude what to change" convincing. (h) first-impression quality.
**Journey stages served:** 2, 3, 4, 5.
**Complexity:**
- CRM: ~8 files (`components/crm/table-view.tsx` ✅, `kanban-view.tsx`, `record-page.tsx`, `activity-timeline.tsx`, `contacts-crm-surface.tsx`, `deals-crm-surface.tsx`, `custom-object-crm-surface.tsx`, `utils.ts`).
- Booking admin: ~4 files (`components/bookings/bookings-page-content.tsx`, admin routes).
- Booking public: ~3 files (`components/bookings/public-booking-form.tsx`, `app/book/[orgSlug]/[bookingSlug]/page.tsx`).
- Intake public: Typeform-style rewrite of `components/forms/public-form.tsx` + supporting.
- Intake admin: light polish of `components/forms/form-editor.tsx`.
- **External deps:** none new. React Flow not used here.
- **Unknowns:** Booking public form may need a new calendar picker — react-big-calendar? Or hand-rolled? Decision deferred to slice 1.c.

### Phase 2 — MCP tool surface expansion (existing blocks)
**Dependencies:** Phase 0. Not blocked by Phase 1.
**Scope:** For CRM, Booking, Intake, ensure every dashboard action is mirrored as an MCP tool so the "customize via conversation" promise is real. Audit current tools in `skills/mcp-server/src/tools.js` (currently ~21) and close the gap. Focus on write-path actions: create contact / update stage / configure booking / add form field / send test submission / etc.
**GHL differentiators served:** (b) conversation-driven customization, (g) AI-native.
**Journey stages served:** 3, 5.
**Complexity:**
- Audit: ~1 file (the MCP tools registry + a compare doc against dashboard surfaces).
- New tools: estimated 15–25 tools × ~30 LOC each ≈ 500–750 LOC in tools.js + matching server-side `/api/v1/*` endpoints for any not yet exposed.
- **External deps:** none.
- **Unknowns:** Do we need a "dry-run" mode for write tools so Claude can preview without mutating? Probably yes — tracked as risk D-7 below.

### Phase 2.5 — Event bus + unified integration UX *(approved addition)*
**Dependencies:** Phase 2 (audit completes first — identifies MCP patterns worth mirroring in the integration-management MCP tools).
**Scope:** Two cross-cutting foundations that Phases 3–7 depend on:
- **Event bus.** Resolve D-4 first via an investigation slice (2.5.a). If a systematic emit/subscribe pattern already exists in the repo, formalize + document it. If not, build one: lightweight TypeScript emitter + `soul_events` DB table + per-workspace subscriber registry. Every future block (Email / SMS / Payments / Landing / Automation) uses this to emit `email.sent`, `sms.delivered`, `payment.succeeded`, `signature.completed`, etc.
- **Unified integration UX.** Single `/settings/integrations` page replaces today's fragmented per-integration screens. Per-block cards (Stripe, Resend / SendGrid / Postmark, Twilio, Postiz, Documenso, Google Calendar, Kit). Each card: status, last-verified timestamp, "Test connection" button, "Disconnect" button, and in-place "Connect" form. Claude Code counterpart: `connect_integration({ kind, api_key })` MCP tool so the setup happens via conversation. Per-workspace secret encryption audited here (D-10 mitigation) — `packages/crm/src/lib/encryption.ts` + `workspace_secrets` table behavior verified.
**GHL differentiators served:** (c) legible automations (need emit/subscribe), (e) data ownership (secrets are theirs, encrypted), (g) AI-native, (h) zero friction (one setup page instead of six).
**Journey stages served:** 3 (customize — conversational integration setup), 5 (daily — integrations visible + healthy).
**Complexity:**
- Investigation slice (2.5.a) shapes the rest. Output: go / no-go on "existing pattern."
- If existing: ~500 LOC documentation + API formalization + tests.
- If net new: ~1500 LOC (emitter + DB table + subscriber registry + emitter helpers + subscriber helpers + at least 2 example emitters + tests).
- Integration UX: ~600 LOC (settings page + ~6 card components + test-connection flow + connect_integration MCP tool + server endpoint).
- **External deps:** possibly `emittery` (MIT, tiny) if we go minimal; otherwise none (hand-rolled emitter + pg-backed persistence).
- **Unknowns (will resolve in 2.5.a):** existing pattern (D-4); secret encryption-at-rest model (D-10); whether any existing block can serve as a reference emitter (observability `logEvent` helper, shipped in `84069df4`, is a candidate — logs events but doesn't notify subscribers; distinct concern).

### Phase 2.75 — BLOCK.md composition contract *(shipped 2026-04-20 — `447ffec8`)*
**Status:** ✅ Shipped. Parser extension + 3 BLOCK.md backfills + L-15 lesson. See "Composition Contract — observations from Phase 3 authoring" under Decisions locked 2026-04-21 for refinement queue.
**Dependencies:** Phase 2 (audit done). **Was a hard blocker for Phase 3** — email's BLOCK.md had to ship with the new contract fields from day one so the format was locked before more blocks were written against it.
**Why:** Phase 7 "Agent Engine" (see below) generates synthesized agents by composing blocks. Without a machine-readable semantic contract per block — what each block *consumes*, *produces*, which natural-language *verbs* route to it, and which other blocks it *composes cleanly with* — synthesis degrades to "prompt Claude and hope." The contract is the primary mitigation for D-13 (agent synthesis reliability).
**Scope:**
- **Schema extension on BLOCK.md** — formalize a `## Composition Contract` section with four typed fields:
  ```
  produces:     [array of event names this block emits]
  consumes:     [array of Soul / workspace context keys this block reads]
  verbs:        [array of natural-language intents that route to this block]
  compose_with: [array of other block slugs this composes cleanly with]
  ```
- **Parser extension on `lib/blocks/block-md.ts`** — `ParsedBlockMd` gets a `composition` field. `parseBlockMd()` learns to read the new section; missing-section case returns empty arrays, not null, so downstream code treats un-amended blocks as "no known composition" without crashing.
- **Audit + backfill the three existing BLOCK.md files** — CRM, Cal.diy booking, Formbricks intake. Fill in their composition contracts based on the emit-site grep already in the event-bus audit (tasks/event-bus-audit.md).
- **Validation helper** — `validateCompositionContract(parsed)` returns warnings (e.g., "consumes an event no block produces") without blocking install. Becomes a CI check in Phase 12.
- **Lessons entry L-XX** — document the "every new BLOCK.md must include composition contract" rule so future sessions don't skip it.

**Files touched:**
- `packages/crm/src/lib/blocks/block-md.ts` (extend parser + types)
- `packages/crm/src/blocks/caldiy-booking.block.md` (backfill)
- `packages/crm/src/blocks/formbricks-intake.block.md` (backfill)
- New: `packages/crm/src/blocks/crm.block.md` (the CRM block may not have a BLOCK.md file yet — if so, create a minimal one with the composition contract)
- `tasks/lessons.md` (add the rule)

**GHL differentiators served:** (g) agent synthesis (new headline differentiator — see §0).
**Journey stages served:** indirect — unblocks Phase 7 which serves Stages 0, 2, 4, 5.
**Complexity:**
- Parser + types: ~150 LOC.
- Each backfill: ~30 LOC of markdown per BLOCK.md × 3-4 files ≈ 120 LOC.
- Validation helper + tests: ~100 LOC.
- Total: ~400 LOC.
- **External deps:** none.
- **Unknowns:** (resolve in slice kickoff) — does the BLOCK.md parser need ordering guarantees on composition sections? Probably no; single-pass is fine.

**Risks:** Low. Additive to parser (existing BLOCK.md stay valid). Biggest risk is drift — if future blocks don't include the section, agent synthesis gets unreliable. Mitigated by: the validator + CI gate + L-XX lesson.

### Phase 3 — Email sending block *(shipped 2026-04-21 — `9ee1f2ea` → `87a7efc9`)*
**Status:** ✅ Shipped across 10 slices (3.a audit → 3.j UI). Build green on every slice; all pushed to `origin/main`.
- 3.a — audit (`9ee1f2ea`): inventoried existing emails table + lib/emails/* + resolved NextAuth vs per-workspace key coexistence.
- 3.b — DB (`a5bd7365`): 4 tables (`email_events`, `conversations`, `conversation_turns`, `suppression_list`) + migration 0016.
- 3.c — events (`a86f291c`): 6 email events (delivered/bounced/replied/suppressed + conversation.turn.received/sent) added to `SeldonEvent` union; regex widened for 3-segment event names.
- 3.d — providers (`9c64e1e5`): typed `EmailProvider` interface + `providers/resend.ts` extracted from inline fetch in actions.ts.
- 3.e — suppression (`89cf33ae`): pre-send hook + `isEmailSuppressed` + `/api/v1/emails/suppressions` GET/POST/DELETE.
- 3.f — Resend webhook (`382f3741`): `/api/webhooks/resend` with Svix HMAC verify, idempotent via unique(provider, providerEventId), auto-suppress on bounce/complaint.
- 3.g — conversation runtime (`b43e7ae0`): channel-agnostic `handleIncomingTurn` in `lib/conversation/runtime.ts`. Phase 4 SMS reuses verbatim.
- 3.h — MCP tools (`3ec83707`): 7 tools (send_email, list_emails, get_email, list_suppressions, suppress_email, unsuppress_email, send_conversation_turn) + matching v1 endpoints. Tool count: 43 → 50.
- 3.i — BLOCK.md (`a677c28c`): `email.block.md` with composition contract on day 1 (9 produces × 7 consumes × 12 verbs × 7 compose_with).
- 3.j — UI (`87a7efc9`): `/settings/suppression` + Resend webhook URL hint on integrations page. Compose drawer + threaded conversation view deferred to a later slice; `/emails` dashboard + per-contact activity feed cover core flows.

**Dependencies:** Phase 2.5 (event bus exists per audit) + **Phase 2.75 (BLOCK.md composition contract locked, including this block's own contract shipped on day 1)**. Phase 0 substrate.
**Scope:** Two modes share one infrastructure:
1. **Transactional** — send one email to one contact, fire-and-forget. Template variables from Soul + contact context. Emits `email.sent`, and on provider-webhook receipt: `email.delivered`, `email.opened`, `email.clicked`, `email.bounced` through the event bus.
2. **Conversational** — multi-turn with Soul context via the **Conversation Primitive runtime** (also shipped in this phase; see below). Incoming reply + conversation state + Soul → response + state update + Soul events. Reused verbatim by Phase 4 SMS; runtime is built once here.

**Conversation Primitive runtime** (`lib/conversation/runtime.ts`, ~400 LOC, new in Phase 3):
- Input: `{ workspace_id, contact_id, incoming_message, channel: "email" | "sms", conversation_id?, soul }`
- Loads prior turns for `conversation_id` (new table: `conversations` + `conversation_turns`).
- Calls the builder's Claude API key (BYO from secrets store) with Soul system prompt + turn history + incoming message.
- Writes outgoing turn to DB, emits `conversation.turn.received` + `conversation.turn.sent` events.
- Returns `{ response_text, conversation_id, state_update }`.

Transactional mode bypasses the runtime (no reasoning needed). Phase 4 SMS inbound webhook routes through the runtime with `channel: "sms"`.

**Design calls locked** (answers to 2026-04-20 open decisions):
- **Provider priority**: Resend-first. Provider abstraction in `lib/emails/providers/` with one implementation (`resend.ts`) for v1; interface shape designed for easy SendGrid/Postmark later when demand emerges. No premature abstraction with one provider.
- **Inbound email**: send-only in v1. No MX configuration per workspace. Conversational mode uses SMS as the inbound channel (Phase 4). Email replies come back via standard client → recipient email address, tracked as `email.replied` only if the reply-to is a trackable alias (nice-to-have, not v1 core).
- **Tracking pixel**: default-on per send, opt-out available as `track_opens: false` per call. Rationale: agent workflows need reliable open/click signals to route next steps — under the agent framing this is closer to "required" than "optional." Per-send opt-out covers privacy-conscious one-off sends.
- **Unsubscribe**: **separate `suppression_list` table**, not `contacts.status`. Columns: `(org_id, email, reason, created_at, source)`. Pre-send hook: every outbound email checks the list first and skips with `suppressed` event. Survives contact re-imports / merges / status churn.

**GHL differentiators served:** (g) agent synthesis (conversational mode is the key building block), (c) legible + testable automations, (e) data ownership.
**Journey stages served:** 2 (hero moment — first "send a welcome email via one MCP call"), 5 (daily), 6 (second client).
**Complexity:**
- DB: verify `emails` + `email_templates`; add `email_events` + `conversations` + `conversation_turns` + `suppression_list` tables.
- UI: compose drawer, send button, status badge, per-contact email thread view, suppression list manager on `/settings/integrations` card.
- Server: provider abstraction (Resend impl only), webhook receiver, suppression pre-send hook, conversation runtime.
- Events: extend `SeldonEvent` union with `email.replied`, `email.bounced`, `conversation.turn.received`, `conversation.turn.sent`, `email.suppressed` (Phase 2.5.b absorbed here — no separate slice needed).
- BLOCK.md: `packages/crm/src/blocks/email.block.md` ships with the Phase 2.75 composition contract populated on day 1.
- **External deps:** `resend` SDK (already a dep via NextAuth). No new deps for v1 provider.
- **Unknowns:** NextAuth workspace-owner Resend key vs per-workspace builder Resend key — verify at slice kickoff that they can coexist in the same process (different env var vs BYO secret).

### Phase 4 — SMS sending block *(transactional + conversational — reuses Phase 3 runtime)*
**Dependencies:** Phase 3 ✅ shipped — shares secret-storage + events plumbing + the **Conversation Primitive runtime built in Phase 3** (`lib/conversation/runtime.ts::handleIncomingTurn`, already channel-agnostic: pass `channel: "sms"` and it works).
**Gating:** Phase 4 is **gated on this 2026-04-21 amendment approval**. The composition contract schema was locked by Phase 3 authoring; SMS writes against the same format without refinements for v1 (see "Composition Contract — observations" under Decisions locked 2026-04-21).
**Scope:** BYO Twilio key. Same two-mode shape as email: transactional send vs conversational turn. Twilio inbound SMS webhook routes through `lib/conversation/runtime.ts` with `channel: "sms"` — the reasoning layer is reused verbatim, only the provider adapter (Twilio SDK calls) is new. Emits `sms.sent`, `sms.delivered`, `sms.replied`, `sms.failed` events + the same `conversation.turn.*` events as email.
**GHL differentiators served:** (g) agent synthesis (SMS is the primary conversational channel for Corey-Ganim-style speed-to-lead agents), (c) legible automations.
**Journey stages served:** 2 (hero moment for a synthesized speed-to-lead agent: form submission → SMS qualifier chat in minutes), 5, 6.
**Complexity:**
- New: `sms_messages` + `sms_events` tables. Reuses `conversations` + `conversation_turns` from Phase 3.
- UI: compose drawer matching email's pattern.
- Server: Twilio SDK (new dep). Thin adapter — the runtime is shared.
- BLOCK.md: `packages/crm/src/blocks/sms.block.md` with composition contract on day 1.
- **External deps:** `twilio` npm.
- **Unknowns:** Twilio webhooks need a stable URL per workspace — compatible with Phase 8 custom domains? Probably yes; webhook domain is separate from public subdomain. Phone number provisioning: does the builder buy numbers via Twilio directly and paste the SID, or does our UI wrap Twilio's number-search API? V1 answer: builder buys directly in Twilio, pastes number + SID into the integration card; UI wrapping is Phase 12 polish.

### Phase 5 — Payments / invoicing block
**Dependencies:** Phase 0. Overlaps with existing Stripe Connect used for SeldonFrame billing itself (see D-3).
**Scope:** BYO Stripe per workspace (so each SMB's payments route to their own Stripe). Invoice creation, one-time charges, subscriptions. Emit Soul events on `payment.succeeded`, `payment.failed`, `invoice.created`.
**GHL differentiators served:** (e) data ownership (each SMB owns their Stripe), (g) AI-native.
**Journey stages served:** 5 (daily — collect payment), 6 (second client).
**Complexity:**
- DB: verify existing `stripe_connections` + `payment_records` schema. Extend for per-workspace Stripe account storage (vs SeldonFrame platform account).
- UI: invoice composer, invoice list, payment history per contact.
- Server: Stripe Connect onboarding flow per workspace OR direct-integration-per-workspace (D-3 decides).
- **External deps:** `stripe` (already installed for SeldonFrame billing).
- **Unknowns:** Stripe Connect topology — big risk D-3.

### Phase 6 — Landing pages block
**Dependencies:** Phase 0. Puck editor already installed.
**Scope:** Puck editor + 10-15 SMB-vertical templates (dentist, coach, restaurant, realtor, plumber, etc.) + Claude Code generation from Soul context. **Not** multi-page websites. **Not** Firecrawl URL-copying. Existing `landing_pages` table + `/l/[orgSlug]/[slug]` + `/s/[orgSlug]/[...slug]` routes.
**GHL differentiators served:** (h) hero moment on first workspace, (b) conversation-driven via Claude Code generation.
**Journey stages served:** 2 (hero moment), 4 (handoff — client's own Stripe), 5 (daily tweaks).
**Complexity:**
- Templates: 10-15 Puck JSON payloads × ~200 LOC JSON each ≈ 2–3k LOC of pre-built page templates. No code, just data.
- Claude Code generation MCP tool (handled in Phase 2 or 11, but the receiving endpoint lives here).
- UI polish on `app/(dashboard)/landing/*` routes.
- **External deps:** none new; Puck already installed.
- **Unknowns:** D-5 — does Puck's JSON round-trip cleanly with AI-generated content?

### Phase 7 — **Agent Engine** *(renamed 2026-04-20; was "Automation canvas" + "Static preview")*
**Dependencies:** Phases 3, 4, 5, 6 shipped (action primitives exist). **Phase 2.75 BLOCK.md composition contract locked** (synthesis depends on it). Phase 2 MCP tools + Phase 2.5 event bus.

**Phase 6.5 "Static automation preview" is absorbed here.** The read-only visualization is simply the canvas's read-only mode — no separate phase. Ship read-only first in slice 7.a (unblocks Stage 0 viral demos earlier than full edit) then the edit layer in subsequent slices.

**This phase is the categorically-different capability no competitor has.** "Claude-Code-native" means **"Claude Code synthesizes complete personalized agents from Soul + blocks"**, not "Claude Code edits your dashboard." The single biggest technical bet in v1 — see D-13.

**Discipline note on vocabulary:** something with conversational / multi-turn reasoning is an *agent*. A simple trigger→action email is a *workflow* (or *recipe*). The /agents page shows both. Inside the product, language reflects the distinction. Don't dilute the word — "send welcome email on signup" is a workflow, not an agent. "Speed-to-lead SMS qualifier that chats with the lead until they book" is an agent.

**Two capabilities, one engine:**

#### 7a. Agent Synthesis
Given:
- a natural-language prompt ("speed-to-lead agent: form → SMS qualifier → booking")
- the workspace's **Soul** (e.g. dental clinic in Laval, bilingual, family practice)
- the **block registry** with composition contracts (from Phase 2.75)

Produce: a working agent personalized to that workspace in **under 60 seconds**, visible on the canvas, ready to toggle on.

Technical shape:
- **Synthesis pipeline**: Claude Code call with a synthesis system prompt that names the available blocks (via their composition contracts), reads Soul, parses the prompt's intent, selects blocks via `verbs` lookup, sequences them via `produces`→`consumes` chaining, outputs structured JSON (node graph).
- **Structural validation**: output must match the agent JSON schema or synthesis retries / falls back. This is the D-13 reliability path — composition contracts are the primary mitigation, schema validation is the fallback.
- **MCP tool**: `synthesize_agent({ prompt, workspace_id? })` → returns draft agent JSON + preview. Optional `publish: true` installs it immediately; default is draft-for-review.
- **Prompt library**: 3-5 hard-coded example prompts per vertical (dental, coach, restaurant, etc.) surfaced on the canvas's empty state as "Try: speed-to-lead agent / booking reminder chain / review request follow-up." Demonstrates the surface without blank-canvas anxiety.

#### 7b. Agent Canvas
- **React Flow** (MIT) canvas mounted at `/agents` (renamed from `/automations` — see §A Phase 7 rename note below).
- **Read-only first slice** (7.a) — renders Soul-generated agents + synthesized agents as node graphs. No editing layer yet. Unblocks Stage 0 Twitter/demo artifacts immediately.
- **Edit layer** (7.b-c slices) — per-node config panels for light edits (toggle on/off, change copy, adjust timing 24h → 48h, swap channels SMS → email). Complex edits route through Claude Code MCP tools (`edit_agent`, `add_agent_step`, etc.).
- **Execution history** — last N runs per agent, success/fail, per-step status. Phase 7 kickoff re-evaluates persistence (see 2.5.a audit Verdict A: current in-memory bus doesn't persist events; execution history may need its own table or the bus moves to pg-LISTEN).
- **Node types** — trigger, delay, condition (if/else only, no AND/OR trees), send-email (Phase 3), send-sms (Phase 4), create-invoice (Phase 5), conversation-turn (Phase 3 runtime), http-webhook. Exactly matches the v1 block surface.

**GHL differentiators served:** (g) **agent synthesis — headline differentiator, #1 moat** (see §0); (c) legible + testable; (d) snapshots (agents travel in snapshots); (e) data ownership (agent defs are JSON, exportable).

**Journey stages served:** **0 (viral demo — synthesis is the tweet)**, 2 (hero — synthesis *is* the hero moment), 4 (client handoff — "look at the agents your Soul built"), 5 (daily monitor).

**Complexity:**
- Synthesis pipeline + prompt engineering: ~800 LOC + evals. Biggest technical unknown.
- Canvas + read-only render: ~600 LOC (inherits Soul ↔ React Flow mapping design decisions from synthesis output shape).
- Edit layer: ~600 LOC for 6-7 per-node config forms.
- Execution history view + persistence: ~500 LOC + new `agent_runs` + `agent_step_runs` tables.
- Agent authoring MCP tools: ~300 LOC in tools.js.
- Soul generator — creates default agents at workspace-create time based on Soul vertical (dentist, coach, restaurant, realtor, etc.): ~500 LOC + prompt-library JSON per vertical.
- **External deps:** `reactflow` (MIT), `dagre` (MIT) for auto-layout.
- **Slice decomposition** (fleshed out at Phase 7 kickoff):
  - 7.a — `/agents` route + rename `/automations` → `/agents` + read-only canvas (absorbs former Phase 6.5)
  - 7.b — synthesis pipeline + `synthesize_agent` MCP tool + structural validation
  - 7.c — edit layer (per-node config panels)
  - 7.d — execution history + persistence
  - 7.e — Soul-side generator + vertical prompt libraries
  - 7.f — polish + reliability evals

### Phase 8 — Custom domains per workspace
**Dependencies:** Phase 0. Can run in parallel with 3–7.
**Scope:** CNAME verification + SSL provisioning + Claude-Code-driven setup UX. Each workspace can bind a custom domain for public URLs (booking, intake, landing pages).
**GHL differentiators served:** (f) white-label at client-facing public URLs (signature differentiator vs GHL agency-only).
**Journey stages served:** 4 (client handoff — SMB sees their own domain, not `<slug>.app.seldonframe.com`).
**Complexity:**
- DB: `organizations.customDomain` already exists? Verify. If not, migration.
- Vercel domain API integration (add/verify/remove).
- Proxy rule in `packages/crm/src/proxy.ts` to route custom-domain traffic to the right workspace.
- Claude Code MCP tool `connect_custom_domain` already listed in the MCP tools set (guest mode). Verify it works end-to-end.
- **External deps:** Vercel REST API (already authenticated if deploying on Vercel).
- **Unknowns:** D-2 — SSL provisioning approach (Let's Encrypt vs Vercel automatic).

### Phase 9 — Snapshots export/import primitive
**Dependencies:** All blocks 3–7 shipped — snapshots bundle everything.
**Scope:** Export a workspace as a versioned artifact (Soul + schemas + automations + templates + branding + sample data). Import to new workspace. Private/local snapshots in v1; public marketplace deferred to v1.1.
**GHL differentiators served:** (d) snapshots updatable and forkable (vs GHL static), (e) data ownership + full export.
**Journey stages served:** 6 (agency adds second client — the agency aha moment), 7 (tweets about it).
**Complexity:**
- Export format design: JSON bundle with versioned schema + embedded BLOCK.md configs + asset manifest.
- Export server endpoint + UI.
- Import server endpoint + UI with schema-version migration path.
- Versioned snapshot registry table.
- **External deps:** none.
- **Unknowns:** D-1 — schema migration when existing workspaces need a newer snapshot version.

### Phase 10 — Thin integrations: Postiz + e-signature
**Dependencies:** Phase 0. Can run anytime after substrate.
**Scope per brief:** **Not** full Soul blocks. Settings page + API key storage + deep-link + emit minimal Soul event if possible.
- Postiz (MIT) for social media scheduling — deep-link to the builder's Postiz instance.
- **Documenso locked** (MIT, self-hostable, BYO-friendly — matches SeldonFrame's "own your stack" philosophy; rejects DocuSign for this tier). Initiate signing flows, receive webhooks, emit `signature.completed` through Phase 2.5's event bus.
**GHL differentiators served:** (e) data ownership (keys are theirs), (g) AI-native (MCP tool for each).
**Journey stages served:** 5 (daily — social schedule + contract send).
**Complexity:**
- Each integration: ~1 settings-integration card (shared pattern from Phase 2.5) + 1 MCP tool + 1 webhook receiver ≈ 200 LOC × 2 = 400 LOC.
- **External deps:** Postiz REST API, Documenso REST API.
- **Unknowns:** Documenso webhook schema — resolve at Phase 10 kickoff; small.

### Phase 11 — Cross-block MCP expansion (for new blocks)
**Dependencies:** Phases 3–10 shipped. Mirror of Phase 2 but for Email, SMS, Payments, Landing Pages, Automation, Custom Domains, Integrations.
**Scope:** Every block's dashboard action gets an MCP tool counterpart.
**GHL differentiators served:** (b), (g).
**Journey stages served:** 3 (customize).
**Complexity:** Similar shape to Phase 2 — estimate 30–50 new tools in `skills/mcp-server/src/tools.js`.
**Kickoff gate — D-7 re-evaluation:** at Phase 11 planning, tool count will land in the 60–80 range across both phases. Re-evaluate D-7 (Claude picks wrong tool) before shipping new tools:
- Option A — keep single `seldonframe` MCP namespace, tighten naming conventions (`<block>_<verb>_<noun>`), invest in descriptions with examples.
- Option B — split into per-block MCP servers (`seldonframe-email`, `seldonframe-sms`, etc.). Better tool-picker signal, worse setup ergonomics (multiple MCP configs).
- Option C — stay single-namespace but introduce a `list_tools_for_intent` meta-tool that narrows Claude's picker.
- Explicit decision documented in `tasks/lessons.md` before any Phase 11 slice ships.

### Phase 12 — Integration testing + cross-cutting polish pass
**Dependencies:** All prior phases.
**Scope:** End-to-end scenarios (dentist workspace: Soul creates → landing page generated → intake form live → booking works → automation fires on form submit → invoice created on booking → custom domain works → snapshot exports and imports). Fix whatever's broken across the seams. Launch readiness.
**GHL differentiators served:** all 8 — the test confirms the whole product clears the bar.
**Journey stages served:** all.
**Complexity:** Unknowable in advance. Budget 20% of phases 1–11 effort as baseline.

---

## B. Per-phase slice list

**Format note:** Detailed slice-level breakdowns for the next three phases (0 remaining, 1, 2). High-level slice sketches for Phases 3–12 — these get fleshed out when each phase is up next, per the "plan when you're about to build it" discipline in CLAUDE.md §2.1.

### Phase 0 — remaining slice

#### 0a (remaining) — Merge `preview/tokens-oklch` to main
- **Files touched:** none (merge commit).
- **Blast radius:** entire color system theming; 7 validation pages already identified in `tasks/phase-0-plan.md §slice 0a`.
- **Validation:** user visually confirms 7 pages on preview URL before merge.
- **Rollback:** `git revert <merge-sha>`. Safe.
- **Complexity:** 1 fast-forward push. Trivial.

### Phase 1 — detailed slices

#### 1.a — TableView Twenty polish ✅ SHIPPED
- **Commit:** `036b2e9a`.
- **Files:** `packages/crm/src/components/crm/table-view.tsx`.
- **Validation done:** local build green, pushed to main.

#### 1.b — KanbanView polish pass
- **Files touched:** `packages/crm/src/components/crm/kanban-view.tsx`.
- **Scope:** density match with TableView (tighter cards, py-1.5 rows inside cards, smaller card title), row-hover-style reveal of chevron/action affordances on cards, drop "interaction-label" chips, remove "Tip: open the command palette" copy, more legible lane-value chip placement. Keep stage color accent bar from earlier. No schema or prop changes.
- **Blast radius:** `/deals/pipeline`, `/objects/[objectSlug]/pipeline`, dashboard kanban embed.
- **Validation:** `/deals/pipeline` with ≥1 deal (need seed), dashboard embed, custom-object pipeline if any.
- **Rollback:** single-file revert.
- **Complexity:** ~200 LOC changed, 1 file.

#### 1.c — Booking admin page density + drawer content polish
- **Files touched:** `packages/crm/src/components/bookings/bookings-page-content.tsx`.
- **Scope:** match TableView's tighter rhythm; polish the appointment-type cards (current: bare grey boxes); clean up calendar grid day headers; tighten buffer inputs in drawer.
- **Blast radius:** `/bookings` admin only. No public-booking impact.
- **Validation:** `/bookings` list + drawer open + save flow.
- **Rollback:** single-file revert.
- **Complexity:** ~300 LOC changed, 1 file. No external deps.

#### 1.d — Booking public form Cal.com polish
- **Files touched:** `packages/crm/src/components/bookings/public-booking-form.tsx`, `app/book/[orgSlug]/[bookingSlug]/page.tsx`.
- **Scope per audit:** Replace the bare-select date + slot picker with a calendar component.
- **Library locked:** `react-day-picker` (MIT). Well-maintained, accessible out of the box (full keyboard nav + ARIA + screen-reader support), matches Cal.com interaction patterns, ~15KB gzipped. No hand-rolling.
- **Blast radius:** public booking URL on every workspace subdomain.
- **Validation:** curl + browser on `magic-link-test.app.seldonframe.com/book`. Submit test booking. Confirm email fires (if integration connected) + DB row created. Keyboard-only nav through date + time-slot.
- **Rollback:** two-file revert + remove dep from `package.json`.
- **Complexity:** ~400 LOC (calendar integration + time-slot grid + state). 1 new dep (`react-day-picker`). A11y no longer an unknown — library provides it.

#### 1.e — Intake public form Typeform polish (one-question-per-page)
- **Files touched:** `packages/crm/src/components/forms/public-form.tsx`, `app/forms/[id]/[formSlug]/page.tsx`.
- **Scope per audit + brief:** Welcome card → one-question-per-page → progress indicator → ending page. No conditional logic in v1 (deferred).
- **Blast radius:** public intake URL on every workspace.
- **Validation:** submit a form on `magic-link-test.app.seldonframe.com/intake`. Confirm submission lands in `intake_submissions` and emits Soul event.
- **Rollback:** two-file revert.
- **Complexity:** ~500 LOC (Typeform-style is a real UX rewrite). State machine per question. Animation between questions. `framer-motion` already installed.

#### 1.f — Intake admin form editor polish
- **Files touched:** `packages/crm/src/components/forms/form-editor.tsx`, `app/(dashboard)/forms/[id]/edit/page.tsx`.
- **Scope:** keep fields as-is; polish row density, preview pane, field type picker, "Drop fields here" placeholder.
- **Complexity:** ~200 LOC. No schema changes.

### Phase 2 — detailed slices

#### 2.a — MCP tool-surface audit
- **Scope:** Compare current `skills/mcp-server/src/tools.js` (21 tools listed in the MCP `seldonframe` namespace) against every dashboard write-action in CRM, Booking, Intake. Produce a gap list in `tasks/mcp-gap-audit.md`.
- **Output:** document, not code.
- **Complexity:** 1 doc, hours of reading.

#### 2.b — Add missing CRM MCP tools
- **Scope from 2.a gap list:** expected ~8 tools (create_contact, update_contact_stage, delete_contact, create_deal, move_deal_stage, add_contact_note, list_contacts_by_filter, get_contact_activity).
- **Files touched:** `skills/mcp-server/src/tools.js` + matching `packages/crm/src/app/api/v1/*` endpoints.
- **Complexity:** ~400 LOC tools + server.

#### 2.c — Add missing Booking MCP tools
- **Expected:** create_booking, reschedule_booking, cancel_booking, add_appointment_type, update_availability.
- **Complexity:** similar to 2.b.

#### 2.d — Add missing Intake MCP tools
- **Expected:** create_form_from_template, add_form_field, reorder_form_fields, publish_form, list_submissions.
- **Complexity:** similar to 2.b.

#### 2.e — Dry-run mode for write tools *(D-7 mitigation)*
- **Scope:** Every write MCP tool accepts `{ dry_run: true }`. Returns what it WOULD do, no DB changes. Unblocks Claude's "preview before mutating" story.
- **Files:** all new write tools + a wrapper pattern in the MCP server.
- **Complexity:** ~300 LOC wrapper + per-tool implementation.

### Phase 2.5 — detailed slices

#### 2.5.a — D-4 investigation: does an event bus pattern already exist? *(blocks everything downstream)*
- **Scope:** Read-only audit. Produce `tasks/event-bus-audit.md` answering three questions:
  1. **What event-like patterns exist today?** `activities` table (I've seen it used as a unified feed). `organizations.settings.events` JSONB bag. `seldon_it_events` table. `packages/crm/src/lib/observability/log.ts` (`logEvent`, shipped `84069df4` — emits to stdout, not a bus). `packages/crm/src/lib/events/bus.ts` (referenced by `custom-objects.ts:16` — **investigate this file first**; may already be the pattern).
  2. **Do any blocks subscribe today?** Grep for subscribers / handlers / `on(` patterns. List every consumer.
  3. **Does the existing pattern support:** cross-workspace isolation, async delivery, retries on failure, subscriber registration per block, Soul-event vocabulary?
- **Files read:** `packages/crm/src/db/schema/activities.ts`, any `lib/events/*`, `lib/brain/*`, `lib/ai/client.ts`, `lib/observability/log.ts`, plus grep outputs.
- **Files written:** `tasks/event-bus-audit.md` only.
- **Output:** one of three verdicts:
  - **Verdict A — exists + sufficient.** Document it, write integration guide for Phase 3+. ~500 LOC doc + sample subscriber, no new infra.
  - **Verdict B — exists but insufficient.** List gaps; propose extension slices.
  - **Verdict C — nothing systematic.** Commit to building from scratch in slices 2.5.b/c.
- **Blast radius:** none (read-only).
- **Complexity:** ~2 hours of careful code-reading + doc write. No code changes.
- **Unblocks:** 2.5.b, 2.5.c, 2.5.d, Phase 3 kickoff.

#### 2.5.b — Event bus scaffold *(scope determined by 2.5.a verdict)*
- **If Verdict A:** skip; document inherited pattern as the canonical path in `AGENTS.md`.
- **If Verdict B:** ship the specific extensions 2.5.a identified.
- **If Verdict C:** build from scratch:
  - `packages/crm/src/db/schema/soul-events.ts` — per-workspace `(id, org_id, event_name, payload, actor, created_at)` table with `(org_id, event_name, created_at)` index.
  - `packages/crm/src/lib/events/emit.ts` — `emitSoulEvent(orgId, name, payload)` helper. Writes DB row; triggers subscriber fan-out.
  - `packages/crm/src/lib/events/subscribe.ts` — `registerSubscriber(blockSlug, eventName, handler)` registry. In-process for v1; pluggable to pg-LISTEN or queue later.
  - `packages/crm/src/lib/events/types.ts` — Soul event vocabulary (`email.sent`, `email.delivered`, `sms.sent`, `payment.succeeded`, `signature.completed`, `booking.created`, `form.submitted`, etc.).
- **Files touched:** ~3 new files in `lib/events/`, 1 schema file, 1 migration.
- **Blast radius:** net new table + new lib. No existing code calls this until Phase 3.
- **Validation:** unit test that emit → subscriber fires; integration test that a Soul event survives a round-trip.
- **Rollback:** drop the table (reversible migration), revert files.
- **Complexity:** ~800–1500 LOC depending on verdict + tests.

#### 2.5.c — `/settings/integrations` unified page *(replaces fragmented per-integration screens)*
- **Scope:** Single page listing every BYO-key integration with per-card: name, icon, status badge (connected / disconnected / invalid), last-verified timestamp, "Test connection" button, "Connect" or "Disconnect" flow. Claude Code counterpart via `connect_integration({ kind, api_key })` MCP tool + paired server endpoint `POST /api/v1/integrations/:kind/connect`.
- **Files touched:** `packages/crm/src/app/(dashboard)/settings/integrations/page.tsx` (may partially exist — check), `packages/crm/src/components/settings/integration-card.tsx` (new), + MCP tool + endpoint.
- **Blast radius:** `/settings/integrations` page UX. Per-block setup links elsewhere should redirect here (follow-up slice).
- **Validation:** connect a Resend test key → status flips to "connected"; disconnect → flips to "disconnected"; bad key → "invalid" + error hint.
- **Rollback:** single-page-and-component revert; MCP tool removed from registry.
- **Complexity:** ~600 LOC.

#### 2.5.d — Secret encryption-at-rest audit *(D-10 mitigation)*
- **Scope:** Verify `packages/crm/src/lib/encryption.ts` encrypts `workspace_secrets.value` (or whatever field stores the API keys) at rest using a per-workspace DEK or process-level KMS key. If not, ship encryption.
- **Files touched:** possibly `encryption.ts`, `workspace_secrets` schema (add `iv` + `dek_id` if needed), secret-store/fetch helpers.
- **Blast radius:** every existing secret in prod. If encryption is added where there was none, existing plaintext rows need a one-time migration to encrypted form. Flag this before shipping.
- **Complexity:** depends on starting state (TBD from audit read). ~200–800 LOC.

### Phases 3–12 — slice sketches (to be detailed when phase is up next)

Sketches omitted for brevity. Each phase above has a complexity paragraph that shape-sizes it. Fleshing out every slice now would be premature — CLAUDE.md §2.1 discourages speculative detail. At minimum: each phase will itemize slices, files touched, blast radius, validation, rollback, and complexity metrics at kickoff.

---

## C. User journey mapping

Matrix: phase × journey stage. `●` = primarily serves, `◐` = partially serves, blank = does not.

| Phase | 0 Discovery | 1 Install→workspace | 2 Hero moment | 3 Customize in CC | 4 Client handoff | 5 Daily ops | 6 Second client | 7 Tweets |
|---|---|---|---|---|---|---|---|---|
| 0 Substrate | | | ● | | | | | |
| 0.5 Truthing | | ● | ● | | ◐ | ● | | |
| 1 CRM/Booking/Intake polish | ◐ | | ● | ● | ● | ● | | ◐ |
| 2 MCP surface | | | | ● | | ◐ | | |
| 2.5 Event bus + integration UX | | | | ● | | ● | | |
| **2.75 BLOCK.md composition contract** | | | | ◐ | | | | |
| 3 Email *(+ conversation primitive)* | | | ● | | | ● | ● | |
| 4 SMS *(conversational agent channel)* | ◐ | | ● | | | ● | ● | |
| 5 Payments | | | | | | ● | ● | |
| 6 Landing pages | | | ● | ◐ | ● | ● | | ◐ |
| **7 Agent Engine** *(synthesis + canvas — absorbs 6.5)* | **●** | | **●** | ● | ● | ● | | **●** |
| 8 Custom domains | | | | | ● | | | |
| 9 Snapshots | | | | | | | ● | ● |
| 10 Integrations | | | | | | ● | | |
| 11 Cross-block MCP | | | | ● | | | | |
| 12 Testing + polish | ● | ● | ● | ● | ● | ● | ● | ● |

**Stage-coverage check (updated post-reframe; Stage 2 reframed again 2026-04-21 after Phase 7.a spike):**
- **Stage 0 (discovery / Twitter)** and **Stage 2 (hero moment)**: the *headline* demo is agent synthesis — archetype picker + NL customization, not NL-from-scratch. Phase 7 is where that lands. Phase 7.f (read-only canvas) ships the visual artifact. Phase 4 SMS gets a `◐` on Stage 0 because the first viable synthesized-agent demo is SMS-based (speed-to-lead SMS qualifier — Phase 4's conversational mode is the payload).
- **Stage 2 (hero moment)** — reframed 2026-04-21 per the Phase 7.a spike findings. **Old framing:** "watch a dental speed-to-lead agent get built from one sentence in 60 seconds." Phase 7.a evidence says one-sentence-from-blank is unreliable for open-ended prompts. **New framing:** "pick an archetype, customize in Claude Code in real time — from `speed-to-lead` starter template to a dental clinic's working SMS qualifier in 60 seconds." Stronger PMF for agency / solopreneur builders who want starter templates they can tune, not blank-canvas magic. Phase 3 + 4 contribute the send-email / send-SMS primitives; Phase 7.c ships the archetype library; Phase 7.d handles the NL-customization fill-in; Phase 6 (landing) contributes the landing that hosts the intake form that fires the agent. Multi-phase pay-off, not a single surface.
- **Stage 6 (second client)**: still served ONLY by Phase 9 (snapshots). Agency aha moment unchanged.
- **Stage 7 (tweets)**: served by **Phase 7** (synthesis demo — this is THE tweet), Phase 9 (snapshot-deploy video), Phase 12 polish. Dropped the dedicated 6.5 tweet row — same visual, same phase.
- Phase 2.75's `◐` on Stage 3 reflects composition contracts being part of what makes "Claude Code composes blocks" work, though the user doesn't see it directly.

---

## D. Risk register

### D-1 — Snapshot schema migration when the template version bumps
**Context:** Phase 9 exports a versioned artifact. Agencies deploy it to 30 workspaces. Six months later the snapshot schema adds a field. How do the 30 deployed workspaces get the update?
**Options:**
- Migration records per snapshot version + forward-migration functions at import.
- Snapshots live-link to source (deploy is a clone, update is a re-clone with merge).
- Snapshots are one-shot (no live link; update is manual).
**Who resolves:** me, in Phase 9 kickoff. Implications cascade back to Phase 9 slice design.

### D-2 — Custom domain SSL provisioning
**Context:** Phase 8. Each workspace custom domain needs a valid cert.
**Options:**
- Vercel automatic (if we stay on Vercel) — zero-config but coupled to Vercel.
- Let's Encrypt via platform library (`greenlock`, `acme-client`) — portable but more code.
- Custom cert upload flow — enterprise-feel but friction for SMBs.
**Default bet:** Vercel automatic, since we're already Vercel-hosted. Flag if Vercel pricing / rate-limits bite.

### D-3 — Stripe Connect topology for per-workspace payments
**Context:** Phase 5. Each SMB must receive payments into their own Stripe. Two models:
- **Stripe Connect Standard** — SMB creates their own Stripe account, connects to our platform account, we can send them to dashboards + create invoices on their behalf. Standard connect fees apply.
- **Direct BYO** — SMB gives us their Stripe secret key, we write invoices directly against their account. Simpler for us, worse for the SMB (we have their secret key).
**Default bet:** Standard Connect — better for the SMB, matches GHL parity, Stripe's fee model is acceptable at $9/workspace+ usage.
**Risk:** Connect onboarding adds friction. Might need to defer payments block for Phase 5 kickoff.

### D-4 — Event-driven architecture — pattern exists or build new?
**Context:** Brief says "every block emits Soul events; every block subscribes." Repo has `activities` table (unified event feed), `settings.events` JSONB bag on `organizations`, and `seldon_it_events`. I've never seen a single systematic bus pattern.
**Investigation needed:** Phase 0.5 extended with a short "event-plumbing audit" slice, OR absorbed into Phase 3 kickoff.
**Implication:** If building from scratch, Phases 3, 4, 5 all depend on the bus being in place first. Add a "Phase 2.5 — event bus" if needed.

### D-5 — Puck round-trips JSON with AI-generated content?
**Context:** Phase 6. Puck editor expects a specific JSON shape. If Claude Code generates Puck JSON, then a user edits in Puck, then Claude reads back and re-edits — does the shape survive?
**Known:** `grapesjs` is also installed — potential competing editor pattern. Which one is canonical?
**Investigation:** slice 6.a kickoff — build a tiny round-trip test before committing to Puck as the primary.

### D-6 — Automation canvas: Soul schema vs React Flow data model
**Context:** Phase 7. Soul stores automations as sentence strings + structured metadata (saw earlier: `organizations.soul.journey.stages[].autoActions[]`). React Flow wants `{nodes: [], edges: []}`.
**Implication:** The canvas is a VIEW over the Soul schema, not the source of truth. Need a bidirectional mapper. Round-trip edits via MCP must not lose fidelity.
**Investigation:** slice 7.a kickoff — map Soul automation sentences to React Flow node graph and back.

### D-7 — MCP tool overload (Claude picks wrong tool)
**Context:** Phases 2 and 11 add ~50–70 tools total. Claude's tool picker degrades when tool names / descriptions are ambiguous.
**Mitigation:**
- Strict naming conventions (`verb_noun_modifier`).
- Rich descriptions with examples.
- Dry-run mode (slice 2.e) so wrong tool is recoverable.
- Possibly: tool grouping via namespaced MCP servers (one for CRM, one for Email, etc.) — but multi-MCP complexity offsets the gain.
**Default:** keep single MCP server, strict naming, rich descriptions, dry-run.

### D-8 — AGPL contamination enforcement
**Context:** Every Twenty / Formbricks / Automatisch EE design reference. Rule is read-only.
**Mitigation:**
- Never paste code from those repos into prompts or files.
- When borrowing a pattern: clean-room reimplementation against our schema.
- This rule belongs in `CLAUDE.md` §2 so every future session sees it.
**Failure mode:** one accidental copy-paste contaminates the whole codebase.

### D-9 — BYO API key setup UX fragmentation
**Context:** Email, SMS, Payments, Landing-gen, Postiz, DocuSign — each needs a key. User ends up doing 6 separate setup flows.
**Mitigation:** A single `/settings/integrations` page with per-block cards. Each card: "Connect $service", "Enter API key", status + last-verified timestamp, "Test connection" button. Claude Code MCP tool `connect_integration({ kind: 'resend', api_key })` complement for conversation-driven setup.
**Scope of this fix:** crosscutting, should ship in a "Phase 2.5 — unified integration UX" slice before Phase 3 starts. Add to plan.

### D-10 — Per-workspace secret storage security
**Context:** Each workspace stores its own Stripe / Twilio / Resend / etc. keys. If stored in plaintext in `organizations.settings`, a DB leak leaks every SMB's keys.
**Current state:** `workspace_secrets` table exists + `store_secret`/`rotate_secret` MCP tools. Need to verify encryption at rest.
**Action:** Phase 3 kickoff audits `packages/crm/src/lib/encryption.ts` and confirms per-workspace secrets are encrypted with a per-workspace DEK or at minimum a process-level KMS key.

### D-11 — Soul event volume
**Context:** If every block emits events to Soul, and Soul is backed by `activities` or similar, the table grows unboundedly.
**Mitigation:** Sampling for high-volume events (`email.opened` on bulk sends), TTL / cold storage for historical events, indexes on orgId+createdAt.
**Phase:** Address in D-4 investigation.

### D-12 — Dogfooding discipline
**Context:** "Ships when it's good" only works if someone's using it. Max needs to be able to dogfood as early as possible to keep the plan honest.
**Action:** After Phase 5 (payments), Max can invoice clients. That's the first dogfoodable milestone. See §E.

### D-13 — Agent synthesis reliability *(single biggest technical unknown in v1)*
**Context:** Phase 7 Agent Engine is the headline differentiator. The core capability — produce a working personalized agent in <60s from natural-language prompt + Soul + block registry — depends on Claude Code consistently:
1. Picking the right blocks (right-from-registry, not hallucinated)
2. Composing them in a sequence that type-checks (produces→consumes chain is valid)
3. Populating per-step config with workspace-appropriate content (Soul-informed, not generic)
4. Outputting a JSON node graph that renders on the canvas

Any step failing unreliably tanks the demo. Prompt-only approaches drift — Claude sometimes invents a `send_push_notification` block we don't have, or chains blocks in ways that make no sense (e.g., `send_invoice` before `booking.created`).

**Mitigations, in order of priority:**
1. **Phase 2.75 BLOCK.md composition contract** — gives synthesis a machine-readable registry with `produces / consumes / verbs / compose_with`. Claude routes prompt verbs to blocks via the `verbs` array instead of guessing names. Chains validate against `produces→consumes`. **This is the primary mitigation and why 2.75 must ship before Phase 3.**
2. **Structured output schema** — synthesis system prompt demands JSON matching the agent node-graph schema. Structural failures → retry with the error message as feedback; second failure → fallback to a template. This is the safety net.
3. **Prompt library of 3-5 worked examples per vertical** — few-shot examples anchor the output shape. Cheap to maintain, large lift on reliability.
4. **Evals in Phase 7.f** — a corpus of (prompt, expected-agent-shape) pairs. CI check that a fixed model call on each prompt produces a valid agent. Regressions caught before ship.
5. **Composition contract validator in Phase 2.75** — flags invalid synthesized graphs (e.g., "step 3 consumes an event no prior step produces") before they hit the canvas. Turns silent bad output into a surfaced error.

**Failure budget:** synthesis must succeed on ≥90% of prompt-types-in-the-library first try, ≥99% after one retry, on Claude Opus 4.7 with adaptive thinking. Lower-grade models may degrade; the product BYOs the key so it's the builder's call.

**What I'd NOT do yet:** fine-tuning, embedding-based block selection, agent frameworks (LangGraph etc.). Too heavy for v1; the contract + prompt + schema approach covers the common cases.

**Phase 7.b kickoff actions:**
- Build a small eval harness *before* shipping synthesis (5-10 prompts × 3 verticals = 15-30 cases, each with a human-reviewed "expected shape").
- Run the harness against every prompt-library change. Track pass rate over time.
- Any <90% pass rate on Opus 4.7 = don't ship the slice.

---

## E. Dogfooding potential

"When can Max run his own business on SeldonFrame?"

| After Phase | Dogfoodable capability | Missing |
|---|---|---|
| 1 | Pretty CRM + Booking + Intake for demos | Cannot bill, cannot send email, cannot send SMS |
| 2 | + "customize via Claude Code" works via MCP | Cannot bill, cannot send messages |
| 2.5 | + unified integration setup + Soul event bus in place | Blocks use it from here on |
| 2.75 | + BLOCK.md composition contract locked | Phase 7 synthesis unblocked |
| 3 | + email sending + Conversation Primitive runtime built | Cannot SMS, no landing, no agents yet |
| 4 | + SMS (transactional + conversational via shared runtime) | Cannot bill, no landing |
| **5** | **+ payments → first full agency workflow possible** | No landing polish, no custom domain, no agents |
| 6 | + landing pages | No agents yet, no custom domain, no snapshots |
| **7** | **+ Agent Engine (synthesis + canvas) → THE viral demo unlock** | No custom domain, no snapshots |
| 8 | + custom domain → client-facing URLs are white-labeled | No snapshots |
| **9** | **+ snapshots → agency can replicate setup to second client** | — |

**Honest dogfooding milestones (updated post-reframe):**
- **Phase 5** — Max can run ONE client end-to-end (intake → booking → email send → invoice). Internal only. No agents yet.
- **Phase 7** — **The real viral demo unlock.** Max records a 60-second screen capture: picks the `speed-to-lead` archetype in Claude Code, types one sentence to customize it for a dental clinic, watches Soul + archetype + blocks synthesize into a working agent on the canvas, toggles it on, demonstrates the first SMS reply arriving. This is THE tweet. The archetype-picker framing (locked 2026-04-21 per Phase 7.a spike) makes the demo more honest and more sellable than "type one sentence into the void" — every SMB starts from a template.
- **Phase 8** — Max can hand a client a white-labeled OS on their own domain. First shippable agency deliverable.
- **Phase 9** — Max can scale to multiple clients without re-building each one. True agency value. "Dental-clinic snapshot" exported + re-imported shows the agents travel with the config.

**Recommendation:** prioritize Phases 5 and 9 over Phase 10 (integrations) since 5 unlocks single-client dogfooding and 9 unlocks the agency model. Integrations are a rounding error on revenue until Phase 9 is real.

---

## F. Contradictions

### F-1 — Briefing status vs repo state
Already detailed in the preamble. The strategic brief's "Status of prior work" section describes a state multiple commits behind current `origin/main`. Preamble reconciles.

### F-2 — `MASTER-CONTEXT.md` non-existent
Briefing lists it as canonical input #2. Does not exist in worktree. User clarified via path B: CLAUDE.md + strategic-update message are the full context. This plan honors that.

### F-3 — Phase 0.5 not in briefing's phase map
Briefing jumps 0 → 1. The "truthing pass" (blank landing fix, pricing truth, billing truth, seldon-it limit removal, form templates) was surfaced mid-session and shipped before the strategic update arrived. Absorbed into the plan as "Phase 0.5" — it serves differentiators (a) and (h) directly and is now done. No rework proposed.

### F-4 — Phase 1.a shipped before brief
`036b2e9a` landed ~5 commits before this strategic update. The brief does not contradict TableView polish — it demands it under "Twenty-grade first-impression polish." Kept as-is. If the brief intended to redirect, explicit call needed.

### F-5 — "Delight first / magical 60 seconds" vs late automation canvas
`CLAUDE.md` §3 says "the first 60 seconds must feel magical for a new builder." The brief's phase ordering places the visual automation canvas at Phase 7 — AFTER email/SMS/payments/landing. Magic moments in the first 60s will come from landing generation (Phase 6) and CRM polish (Phase 1), not the canvas. **Tension:** Twitter-demo-worthy visuals (Stage 0 of the journey) come primarily from the automation canvas. If the canvas is Phase 7, early Twitter demos are weak. **Options:**
- Accept the trade — v1 doesn't target viral demos.
- Add a "Phase 6.5 — automation preview" slice that renders a static React Flow visual of Soul's auto-generated automations, before the full edit layer lands in Phase 7.
- Bring Phase 7 forward and defer Phases 3–5 block UIs (not recommended — no real automations without action nodes).
**Default bet:** accept the trade. Flag for your decision.

### F-6 — "Customization via conversation" (diff b) vs dashboard-polish phases
Brief elevates conversation-driven customization as a primary differentiator. Phase 1 spends significant effort polishing the dashboard UI for editing. **Tension:** if customization is via Claude Code, the dashboard edit surfaces matter less. **Resolution:** dashboard surfaces still need first-impression polish because a) not every builder uses Claude Code at every moment, b) SMBs handed off to the product won't have Claude Code installed, c) polish is how trust is built visually. Phase 1 stays. BUT: Phase 2 (MCP surface) should ship BEFORE block-level polish phases (3–6) to prevent "we built the UI first, the MCP surface is an afterthought" anti-pattern.
**Resolution in this plan:** Phase 2 is between Phase 1 and Phase 3. Good.

### F-7 — Event bus pattern — exists or new?
Brief assumes event-driven architecture is real; unclear in code. D-4 risk. Needs an investigation slice before Phase 3 starts. Propose adding **Phase 2.5 — event bus + unified integration UX** to absorb D-4 and D-9.

### F-8 — BLOCK.md for Forms is untouched by Phase 0.5.e templates
Brief says "keep BLOCK.md as is or slightly modify to use pre-built templates in code." That's what 0.5.e did (templates in `lib/forms/templates.ts`, BLOCK.md untouched). But if the brief intended BLOCK.md to describe the template registry itself, the current pattern diverges. **Default:** keep templates in code; BLOCK.md is for block contracts, not per-template configs. Flag if intended otherwise.

### F-9 — "No deadline" vs implied urgency in the brief
Brief both says "no fixed ship date, ships when good" and lists 12 phases with dependencies as if shippable in sequence. **Tension:** if there's no deadline, some phases may merge or collapse as we learn. Phase 10 (integrations) is the most deferrable — Postiz/DocuSign don't serve dogfooding milestones until Phase 9 lands. **Recommendation:** treat Phases 10 and 11 as "ship when needed" rather than "ship in order."

---

## Decisions locked

### 2026-04-20 (initial plan review)
1. ✅ **0a merge** — user visually confirmed, merged on main as `5dd33c68` (cherry-pick had conflicts with Phase 0.5.c billing rewrite; re-applied cleanly on current main with same oklch values). Phase 0 complete.
2. ✅ **Phase 1.a TableView polish** kept as-is; Phase 1.b–f (KanbanView, booking admin, booking public, intake Typeform, intake editor) all shipped (commits `b0505763`, `c166f88e`, `91505357`, `c8e91e37`, `9bfc54dd`).
3. ✅ **Phase 2.5 added** between Phase 2 and Phase 3. 2.5.a event-bus audit shipped → **Verdict A: exists + sufficient**. 2.5.d secrets audit shipped → solid, no work needed.
4. ✅ **Phase 10 e-signature** locked to **Documenso**.
5. ✅ **Phase 6.5** — shipped as a separate phase in the first amendment; **re-absorbed into Phase 7 in the 2026-04-20 strategic amendment** below. Read-only canvas is just Phase 7's first slice, not its own phase.
6. ✅ **Automation canvas mental model** — superseded by Phase 7 Agent Engine framing in 2026-04-20 strategic amendment.

### 2026-04-20 (strategic amendment — agent-synthesis reframe)

Per the major strategic conversation summarized at the top of the Phase 7 section:

7. ✅ **Phase 7 renamed + expanded to "Agent Engine"** — two capabilities (Synthesis + Canvas), with former Phase 6.5 absorbed as slice 7.a. **Agent synthesis is the v1 headline differentiator** (§0); replaces "customization via conversation" as the #1 moat framing.
8. ✅ **Phase 2.75 added** — BLOCK.md composition contract schema extension + audit/backfill existing BLOCK.md files. **Hard blocker for Phase 3** — every new block's BLOCK.md ships with the contract populated from day 1.
9. ✅ **Conversation Primitive runtime** noted in Phase 3 scope (build once) and Phase 4 scope (reuse verbatim). Voice is **not** in v1. Chat widget + SMS-conversational cover the use cases.
10. ✅ **Vocabulary rename** — `/automations` → `/agents`, "automation engine" → "agent engine", "Automation Marketplace" → "Agent Marketplace". Discipline: *agent* = multi-turn / conversational; *workflow* = simple trigger→action. Both live under /agents.
11. ✅ **Agent-developer as secondary ICP** — external agent frameworks (CrewAI / LangGraph / OpenAI Agents SDK) use SeldonFrame as their memory-and-action layer via MCP. No new phase; positioning + docs slot into Phase 12.
12. ✅ **D-13 added** — agent synthesis reliability as the single biggest technical unknown in v1. Primary mitigation = composition contract (Phase 2.75); fallback = structural schema validation + eval harness (Phase 7.f).

### Phase 3 email design calls (locked ahead of phase start)

13. ✅ **Provider priority: Resend-first.** Abstraction in `lib/emails/providers/` with one implementation; interface designed for easy SendGrid/Postmark addition but not prematurely abstracted.
14. ✅ **Inbound email: send-only in v1.** Conversational mode uses SMS (Phase 4) as the inbound channel.
15. ✅ **Tracking pixel: default-on, opt-out per send.** Agent workflows need reliable open/click signals under the agent framing — closer to "required" than "optional." Privacy opt-out still available per `track_opens: false` on individual sends.
16. ✅ **Unsubscribe: separate `suppression_list` table.** NOT `contacts.status`. Suppression is a separate concern that must survive contact re-imports, merges, status churn. Pre-send hook checks the list.

### Deferred (with rationale)

| Slice | Status | Rationale |
|---|---|---|
| 2.e — Dry-run wrapper | **Deferred** (confirmed 2026-04-20 by user) | Correct implementation requires server-side per-endpoint work (~15 endpoints). Better as a dedicated slice after Phase 3-5 blocks stabilize. D-7 already partially mitigated via naming conventions + rich descriptions from 2.a. |
| 2.5.b — Event bus scaffold | **Deferred** (confirmed 2026-04-20 by user) | Near-no-op per 2.5.a Verdict A. New event types (`sms.*`, `payment.stripe.*`, `conversation.turn.*`) get added to the `SeldonEvent` union by the phase that needs them, as part of that phase's own scope. Phase 3 already plans to add `email.replied`, `email.bounced`, `email.suppressed`, `conversation.turn.received`, `conversation.turn.sent`. |
| 2.5.c — Unified integration UX | **Deferred** (confirmed 2026-04-20 by user) | Best absorbed into Phase 3 kickoff — Phase 3 is the first block that needs a new integration card (Resend). Building speculative UI for blocks that don't exist yet is premature. |

### 2026-04-21 (Phase 3 ship + composition contract schema lock)

17. ✅ **Phase 3 shipped.** 10 slices (3.a–3.j), 10 commits on `origin/main`, build-green every step. See §A Phase 3 status line for the per-slice table.
18. ✅ **Phase 2.75 shipped** (`447ffec8`) ahead of Phase 3 so the email BLOCK.md was written against a concrete, parser-validated schema rather than a sketch.
19. ✅ **Composition contract schema locked for v1.** Four fields (`produces`, `consumes`, `verbs`, `compose_with`) are final for v1. Phase 4 sms.block.md writes against the exact same format with no refinements. Any additions below are tracked as post-v1 refinements, not v1-blockers.
20. ✅ **Conversation Primitive runtime positioning upgraded.** Built in Phase 3.g at `lib/conversation/runtime.ts` — deliberately **not** inside `lib/emails/`. It's a load-bearing primitive shared by email (today) and SMS (Phase 4 reuse verbatim), and will be the substrate Phase 7 Agent Engine composes conversational agents on top of. Treat it as core infrastructure, not an email-block implementation detail.
21. ✅ **x402 discipline reminder applied to Phase 4+.** Continue building thin HTTP endpoints (no tight coupling between MCP tool and server logic — both hit the same v1 route, which is what Phase 3 shipped). Keep per-endpoint "would cost roughly $X per call" metadata in mind when naming + scoping, even though we don't surface prices until V1.2. See §H V1.1 — x402 readiness design principles.

### Composition Contract — observations from Phase 3 authoring

Authoring `email.block.md` against the Phase 2.75 schema surfaced the following tensions. None block v1 — the schema as-shipped is sufficient. These are queued as **post-v1 refinements** so Phase 4 can write against the locked format without diverging.

| Observation | Impact in v1 | Action for v1 | Action post-v1 |
|---|---|---|---|
| `produces` list gets long (email: 9 events). Single comma-separated line is hard to scan. | Cosmetic only. | Leave as-is — both `key: [a, b, c]` and `key: a, b, c` forms are valid per the parser. | Consider pretty-formatting convention in docs: multi-event producers use bracketed + newline-split form for readability. No parser change needed. |
| `consumes` dot-paths (`workspace.soul.tone`, `contact.firstName`) are un-schema'd. Synthesis has to pattern-match; if the DB column is `contact.first_name` but the contract says `contact.firstName`, synthesis may not connect them. | Low — blocks author against TypeScript types, which are stable. | Document in `email.block.md` Notes that consumes strings match TS property names, not DB column names. | Add optional `consumes_schema_ref` pointing at `packages/core/src/schema/*.d.ts` paths so synthesis can type-check consumes at authoring time. |
| `verbs` mixes single-word tokens (`send`, `reply`) with short phrases (`reach out`, `speed to lead`). Validator `verbose_verb` warning caps at 40 chars multi-word / 30 chars single-word — all email verbs passed. | None — the mix is intentional and useful for routing. | Keep the validator thresholds; document in L-15 that short phrases are fine when they're canonical routing intents. | Potentially split into `verbs` (imperative action tokens) + `intents` (noun phrases) if synthesis routing gets noisy — not needed at current block count. |
| `compose_with` is one-directional. `email.block` lists crm; `crm.block` must independently list email for synthesis to see the pairing as "known-good both ways." Drift possible. | Low — 4 blocks today; manual audit trivial. | Accept asymmetry for v1. | Add a cross-block symmetry check to `validateCompositionContract` in Phase 12 CI gate — warn when A lists B but B doesn't list A. |
| No declarative `requires_secret` field. email.block silently needs `resend` key (or env fallback). Synthesis can't prompt "connect Resend first" before proposing an email-sending agent. | Non-blocking — failed sends surface `no_ai_client` / provider errors through runtime `skipped` field, but the proactive-prompt UX is absent. | Document in `email.block.md` Integration Points that Resend key is required for live sends. | Add `requires_secrets: [resend]` to the contract schema in V1.1. Synthesis checks `workspace_secrets` before proposing the block; if missing, emits a `setup_required` step in the synthesized agent trace. |
| No `cost_signal` field. Blocks don't declare expected cost-per-invocation (Claude calls vs Resend API vs free compute). Relevant for V1.2 Agentic Market x402 pricing. | None for v1 — we don't price anything yet. | Leave unaddressed. | Add `cost_signal: {llm_calls: N, api_calls: [{provider, count}], compute: "cheap" \| "expensive"}` in V1.1, populated from direct measurement. |
| No typed `side_effects` beyond events. `send_email` writes to `emails`, `activities`, and may mutate `suppression_list` — none are "events" in the SeldonEvent sense. Matters for reasoning about rollback in automations. | None for v1 — Phase 7 doesn't attempt rollback. | Leave unaddressed. | Post-v1, when automations gain transactional guarantees. |

**Verdict: schema is frozen for v1.** Phase 4 sms.block.md writes against the exact 4-field format. Refinements above ship in V1.1 or later.

### Phase 3 email design calls (retrospective — locked calls held up)

| Decision | Stated | Held up in Phase 3 ship? |
|---|---|---|
| Provider priority: Resend-first | yes | ✅ `providers/resend.ts` is the only impl; interface designed for SendGrid/Postmark later |
| Inbound email: send-only in v1 | yes | ✅ No MX setup per workspace; runtime channel is wired for email but relies on manual forwarding or agent-paste for now |
| Tracking pixel: default-on | yes | ✅ Every send injects the pixel; webhook path tracks opens too (idempotent via `unique(provider, provider_event_id)`) |
| Unsubscribe: separate `suppression_list` table | yes | ✅ Separate table; pre-send hook; auto-populated by webhook on bounce/complaint |

### Next action gates

- Phase 2.75 (BLOCK.md composition contract) — **✅ shipped** (`447ffec8`).
- Phase 3 (Email) — **✅ shipped** (`9ee1f2ea` → `87a7efc9`).
- **Phase 4 (SMS) — gated on this 2026-04-21 amendment approval.** Composition contract schema is locked; sms.block.md writes against the exact same 4-field format. Runtime already supports `channel: "sms"` with zero changes needed.
- Phase 4 — gates Phase 7 (synthesized-agent demos need SMS as the conversational channel).
- Phase 7 — gates the viral demo milestone.

**Stop. Awaiting approval of the 2026-04-21 amendment before any Phase 4 work starts.**

---

## Post-v1 roadmap — x402 / Agentic Market *(2026-04-20 addition)*

Not a v1 phase. A **design-principles layer** applied during v1 work at near-zero cost, plus a small post-v1 launch slice. The goal is to keep the option open for per-call agent payments via x402 on Base without building anything that competes with v1 priorities.

### V1.1 — x402 readiness design principles

Applied *during* v1 build. Zero extra implementation work; just discipline on four axes as we ship Phases 3–12.

1. **Every MCP tool has a corresponding REST endpoint.** Already true for most tools shipped in Phase 2.b/c/d — the MCP tool is a thin wrapper over `/api/v1/<resource>`. Hold the line: a new MCP tool that can only be called by its handler and has no REST equivalent is a policy violation. Cost today: near-zero (we're doing it anyway). Payoff later: x402 charges per HTTP call, not per MCP call, so REST parity is mandatory.

2. **Each endpoint declares a per-call price in metadata.** Add a `price` field (cents, or micro-USDC, format TBD at V1.2 kickoff) to the endpoint's exported metadata or a central `lib/api/pricing.ts` registry. **Unused today** — no runtime reads it, no bill is generated, no header is returned. Exists purely so the metadata is ready to surface when x402 ships. Cost: ~5 LOC per endpoint + one registry file. No perf impact.

3. **Authentication is pluggable.** Today's auth resolver is `resolveV1Identity(request)` (workspace-bearer → `x-seldon-api-key` → NextAuth session → 401). Design new auth paths to slot into the same resolver's fall-through chain, so adding x402-payment-header later is "add one branch to `resolveV1Identity`, no touches elsewhere." Concretely: **don't** hard-code bearer-only auth in new endpoints — route every new endpoint through the existing helper, even if it feels like overkill.

4. **Per-request logging captures who called what.** Already true via the `logEvent` helper shipped in `84069df4` (Phase 0.5.c observability). Discipline: every v1 endpoint emits an `api_call` event with `{ route, identity_kind, org_id, status, duration_ms }`. For x402 later, add `payment_hash` + `amount` fields to the same event shape. No DB change needed today.

**None of these change v1's critical path.** If an implementer pushes back on one as "extra work," they're right to push back on (2) — but (1), (3), (4) are patterns we should already be following.

### V1.2 — Agentic Market launch

One focused slice, post-v1-ship. Not a phase, because it doesn't gate anything else.

**Scope:**
- Expose 10–15 SeldonFrame endpoints via x402 on Base. Pick the ones that are most agent-useful: Brain v2 queries, agent synthesis (`POST /api/v1/agents/synthesize`), composition-contract manifests (`GET /api/v1/blocks/composition-manifest`), Soul queries, snapshot install. Cheap-to-serve reads get per-call prices in the single-digit cents range; expensive-to-serve writes (synthesize, snapshot install) get priced in the tens of cents.
- List as a coherent service family on **agentic.market** under the SeldonFrame brand. Not individual endpoints — the family narrative is "memory + action layer for AI agents."
- **Single big launch post** — coordinate HN, X, relevant Discords, agent-framework maintainers (CrewAI / LangGraph / OpenAI Agents SDK) in one beat. Not daily micro-launches.
- **Prioritize** (in rough order of per-call agent-market value):
  1. Brain v2 queries — "what does this workspace know?"
  2. Agent synthesis — "build me a speed-to-lead agent for a dental clinic"
  3. Composition-contract manifests — block registry introspection (the 2.75 output surface)
  4. Soul retrieval — workspace-context-as-a-service
  5. Snapshot install — deploy a pre-built vertical to a new workspace

**Explicitly NOT v1 work:**
- No x402 middleware in the v1 endpoint chain.
- No Base wallet integration in v1.
- No paywall on any v1 endpoint.
- No Agentic-Market-specific routing or response shape.

**Prerequisite (admin work, Max's side, not engineering):**
- Set up a **Coinbase Developer Platform (CDP) wallet** to receive x402 payments on Base.
- Set up an **off-ramp** from Base-USDC → fiat. Options: Coinbase Exchange, Privy / Stripe Connect for crypto, or hold in CDP until withdrawal needed.

**Gate for V1.2 launch:** CDP wallet + off-ramp live, v1 shipped + at least 10 real agency workspaces in production using SeldonFrame day-to-day (dogfooding proof), 14-day synthesis-reliability eval pass rate ≥ 95% (Phase 7 D-13 metric — we don't monetize an unreliable endpoint).

**Open decisions parked until V1.2 kickoff** (not v1 concerns):
- Exact price per endpoint type.
- Whether x402-paid calls get faster infra (separate compute pool) or shared.
- Rate limit per payment-header vs per-wallet.
- Whether `agentic.market` hosting is their platform or our page (SEO + branding question).
