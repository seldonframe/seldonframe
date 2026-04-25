# SLICE 8 Audit — workspace test mode

**Date:** 2026-04-25
**Predecessor:** SLICE 7 (message triggers + L-27 fix arc), closed in commit `712f2a91`.
**Drafted by:** Claude Opus 4.7 against HEAD (branch `claude/fervent-hermann-84055b`).

---

## §1 Problem statement + strategic context

### 1.1 Why test mode is launch-blocking

SeldonFrame is multi-tenant: every workspace dispatches real SMS, real emails, and real payment intents through its own provider credentials. There is **no safe way** for an agency operator (or a builder iterating on their own workflow) to test an agent end-to-end without risking real-customer side effects:

- A confirmation SMS sent during testing reaches a real patient
- A booking-completed email fires to a real attendee
- A Stripe invoice creates a real charge attempt

Today the only "safe" testing options are:
1. Manually swap the workspace's Twilio/Resend/Stripe credentials to test ones (loses real config; brittle)
2. Test in a separate "scratch" workspace (fragments Soul state, breaks observability continuity)
3. Don't test (causes the real-customer accidents this slice prevents)

### 1.2 Concrete examples this slice unblocks

- **Testing the SLICE 7 appointment-confirm-sms archetype:** builder texts "CONFIRM" from their own phone, agent replies — but reply goes to a Twilio test number, not a real customer
- **Testing a payment flow:** builder configures a Stripe-driven follow-up; runs it end-to-end against `tok_visa` test card, no real card charge
- **Testing scheduled triggers (SLICE 5):** builder sets a daily-digest schedule, fires it on demand against the test email domain, verifies content + render
- **Testing message triggers (SLICE 7) before publishing:** builder validates pattern matching + loop guard with a buddy, no production-customer dispatch

### 1.3 Relationship to dev/staging/prod environments

SeldonFrame is **multi-tenant on a single Vercel deployment** — there is no per-workspace staging environment. The architectural fit is **per-workspace test mode**: a single boolean flag that workspaces toggle to route external API dispatch to provider-side test endpoints / sandbox keys.

This slice is **NOT** about:
- Multi-environment workspaces (test/staging/prod as separate workspaces — different architecture entirely)
- Test-data import/export tools (out of scope per Max's spec)
- Test mode for SLICE 6's external_state HTTP fetcher (builders configure their own endpoints; SeldonFrame doesn't auto-route)

### 1.4 Distinction from existing "demo mode"

Ground-truth confirms (`packages/crm/src/lib/demo/server.ts`): **demo mode is a deployment-level read-only flag**. `assertWritable()` blocks all POST/PUT/PATCH/DELETE when `NEXT_PUBLIC_DEMO_READONLY=true`. Demo mode is for the *public Vercel demo deployment* (forking on GitHub messaging) — it does NOT route external APIs anywhere different. It just blocks all writes.

**Test mode is fundamentally different:** writes still happen, but external dispatches route to provider test endpoints. The two concepts can coexist (a demo workspace is read-only; a real workspace can be in test mode and still write).

---

## §2 Ground-truth findings at HEAD

Verified by direct inspection at commit `712f2a91`. Ten dimensions covered. **The audit's headline finding: SeldonFrame has zero test-mode awareness anywhere in the stack. SLICE 8 is largely net-new, with one notable architectural complication (Stripe is platform-keyed, not workspace-keyed).**

### §2.1 Outbound dispatch entry points — all three providers

Three canonical send functions exist; each reads workspace-scoped credentials from `organizations.integrations.{provider}` and dispatches to the real third-party endpoint. None has any test-mode awareness today.

| Provider | Send function | File:line | Provider HTTP call | Credential source |
|---|---|---|---|---|
| Twilio SMS | `sendSmsFromApi` | [sms/api.ts:43-186](packages/crm/src/lib/sms/api.ts:43) | [providers/twilio.ts:72-80](packages/crm/src/lib/sms/providers/twilio.ts:72) (POST `https://api.twilio.com/.../Messages.json`) | `integrations.twilio.{accountSid,authToken,fromNumber}` |
| Resend email | `sendEmailFromApi` | [emails/api.ts:25-125](packages/crm/src/lib/emails/api.ts:25) | [providers/resend.ts:52-67](packages/crm/src/lib/emails/providers/resend.ts:52) (POST `https://api.resend.com/emails`) | `integrations.resend.{apiKey,fromEmail,fromName}` |
| Stripe payments | `createInvoiceFromApi` etc. | [payments/api.ts:40-220](packages/crm/src/lib/payments/api.ts:40) | [providers/stripe.ts:97+](packages/crm/src/lib/payments/providers/stripe.ts:97) (Stripe SDK with `stripeAccount` header) | **Platform env var** (`STRIPE_SECRET_KEY`/`STRIPE_LIVE_SECRET_KEY`/`STRIPE_TEST_SECRET_KEY`) + per-workspace `stripeConnections.stripeAccountId` |

**Critical asymmetry:** Twilio + Resend store credentials per-workspace. Stripe stores ONLY the connected-account ID per workspace; the secret key itself is global platform config (`packages/payments/src/stripe-client.ts:5-16`). This is **the single biggest architectural complication** for SLICE 8 — see G-8-2.

### §2.2 organizations.integrations JSONB shape — typed but unvalidated

[`packages/crm/src/db/schema/organizations.ts:7-40`](packages/crm/src/db/schema/organizations.ts:7) defines `OrganizationIntegrations`:

```typescript
export type OrganizationIntegrations = {
  twilio?: { accountSid; authToken; fromNumber; connected: boolean };
  resend?: { apiKey; fromEmail; fromName; connected: boolean };
  kit?: { apiKey; connected: boolean };
  newsletter?: { provider; apiKey; connected; ... };
  google?: { calendarConnected; accessToken; ... };
};
```

**Critical for SLICE 8:** the update path is **entirely unvalidated**. [`integrations/actions.ts:147-235`](packages/crm/src/lib/integrations/actions.ts:147) accepts `Record<string, string>` and merges into JSONB without Zod validation. Adding new fields (e.g., `testFromNumber`) is structurally trivial; the type is the only contract.

### §2.3 organizations.settings JSONB — available but unused for cross-cutting flags

The table has a separate `settings: Record<string, unknown>` column ([organizations.ts:66](packages/crm/src/db/schema/organizations.ts:66)). Used for:
- Anonymous workspace `source` tag
- Soul compiler metadata (`soulCompiler.sourceType`, etc.)

**Pattern:** workspace-level configuration **does not live in `settings`** today. The convention is dedicated columns (`plan`, `timezone`, `enabledBlocks`, `soulCompletedAt`) or specific JSONB objects (`subscription`, `theme`, `integrations`). Adding a top-level `testMode` boolean column is more idiomatic than nesting in `settings.testMode`.

### §2.4 No existing test/sandbox/dry-run scaffolding for provider dispatch

Searches across `packages/crm/src/`:
- `testMode | sandbox | dryRun | isTest | STRIPE_TEST` → **only** `dryRun` in scaffolding/writer.ts (code generation, not provider dispatch — orthogonal)
- No `is_test` / `test_mode` / `environment` columns on any DB table
- No provider-aware test branching in send functions
- No test-event tagging in `workflow_event_log`

**Conclusion:** SLICE 8 is **almost entirely net-new** at the dispatch layer.

### §2.5 Stripe `livemode` field parsed but unused

[`packages/payments/src/types.ts`](packages/payments/src/types.ts) defines `StripeWebhookEvent` with a `livemode: boolean` field. The webhook handler at [`app/api/stripe/webhook/route.ts`](packages/crm/src/app/api/stripe/webhook/route.ts) parses it but **does not branch** on it. Implication: test events received via webhook are processed identically to real events — a bug-shaped gap that SLICE 8 may want to address.

### §2.6 Conversation runtime — no test-mode threading

[`lib/conversation/runtime.ts:242-351`](packages/crm/src/lib/conversation/runtime.ts:242) — `handleIncomingTurn(input: RuntimeInput)`. Generates a Soul-aware reply, then immediately dispatches via `sendSmsFromApi()` at line 300. The `RuntimeInput` type carries `orgId`, `contactId`, `channel`, `incomingMessage` — but **no test-mode parameter**. SLICE 8 must thread this through.

### §2.7 SLICE 7 message-trigger dispatcher — no test-mode awareness

[`lib/agents/message-trigger-dispatcher.ts`](packages/crm/src/lib/agents/message-trigger-dispatcher.ts) and [`lib/agents/message-trigger-wiring.ts`](packages/crm/src/lib/agents/message-trigger-wiring.ts) operate on inbound messages without any test-mode flag. The eventual `send_sms` MCP tool call inside an agent run will hit `sendSmsFromApi` — that's the choke point where test routing happens.

### §2.8 SLICE 5 scheduled trigger dispatcher — no test-mode awareness

[`lib/agents/schedule-dispatcher.ts`](packages/crm/src/lib/agents/schedule-dispatcher.ts) fires archetype runs on cron tick without consulting any test flag. Same pattern: routing happens at the leaf send functions, not at the dispatcher.

### §2.9 Admin UI surface — workspace settings hub exists, no Switch primitive

- Settings hub: [`app/(dashboard)/settings/page.tsx`](packages/crm/src/app/(dashboard)/settings/page.tsx) renders cards for each section (Profile, Integrations, Branding, Webhooks, etc.).
- No `<Switch>` component shipped — only [`components/ui/checkbox.tsx`](packages/crm/src/components/ui/checkbox.tsx) (Base-UI). For test-mode toggle, Checkbox is sufficient (or we add a Switch in 4-6 LOC).
- Server-action update pattern is shipped: [`integrations/actions.ts:374-404`](packages/crm/src/lib/integrations/actions.ts:374) `updateIntegrationAction` (assertWritable + getOrgId + DB update + revalidate paths + redirect with feedback).
- No `useWorkspace` client hook — settings pages are server components reading `getOrgId()` directly.

### §2.10 Demo mode — reusable banner shape only

[`components/layout/demo-banner.tsx`](packages/crm/src/components/layout/demo-banner.tsx) is the canonical model for a top-of-dashboard banner ("You are in test mode — provider dispatches route to test endpoints"). Same pattern: env-flag-conditional render in [layout.tsx:7](packages/crm/src/app/(dashboard)/layout.tsx:7). For test mode, the trigger is workspace state (not env), so the banner needs a workspace-context prop or hook.

### §2.11 Inbound webhooks — read-only, no dispatch insertion needed

All three webhook routes (`/api/webhooks/twilio/sms`, `/api/webhooks/resend`, `/api/webhooks/stripe`) only **receive** events. No outbound dispatch happens at the webhook boundary — so test mode logic for inbound is passthrough. Stripe webhook events with `livemode: false` already arrive correctly tagged from Stripe; SeldonFrame just needs to start consulting the field (G-8-5 below).

### §2.12 Summary: inherited vs. net-new

| Surface | Status | Notes |
|---|---|---|
| `organizations.integrations` JSONB | **Inherited** | Loosely typed, unvalidated; safe to extend |
| `organizations.settings` JSONB | **Inherited** | Available but unused for cross-cutting flags |
| Send functions (Twilio/Resend) | **Inherited (extension point)** | Insertion point: after suppression check, before provider call |
| Stripe send functions | **Inherited (architectural gap)** | Per-workspace test key requires new storage |
| Workflow runtime / dispatchers | **Inherited (extension point)** | Test mode read at leaf, not threaded through |
| Settings UI shell | **Inherited** | Add toggle card via existing pattern |
| Banner shape | **Inherited (DemoBanner pattern)** | Adapt to workspace-state instead of env |
| `<Switch>` primitive | **Net new (or use Checkbox)** | Trivial |
| `testMode` column / flag | **Net new** | Per G-8-1 |
| Per-provider test endpoints / credentials | **Net new** | Per G-8-3 |
| Provider routing logic | **Net new** | Per provider, orthogonal — see L-17 hypothesis check |
| Test-mode banner + workspace-context wiring | **Net new** | Composition over `DemoBanner` pattern |
| Conversation runtime test-mode threading | **Net new** | Add to `RuntimeInput` |
| Workflow_event_log test tagging | **Net new (gate decision)** | G-8-5 |
| Stripe webhook livemode branching | **Net new (could defer)** | Out-of-band to test mode core scope |

---

## §3 Schema extension

### 3.1 Top-level workspace flag — `organizations.testMode boolean`

```sql
ALTER TABLE organizations ADD COLUMN test_mode boolean NOT NULL DEFAULT false;
```

Rationale per §2.3: workspace-level booleans live as columns, not nested in `settings` JSONB. Mirrors the existing `plan`, `timezone`, `soulCompletedAt` convention.

### 3.2 Per-provider test config — `integrations.{provider}.test`

Each provider gets a nested `test?: { ... }` sub-object with its test-mode credentials. When `organizations.testMode = true`, send functions read from `integrations.{provider}.test` instead of the top-level fields:

```typescript
export type OrganizationIntegrations = {
  twilio?: {
    accountSid: string;        // live
    authToken: string;          // live
    fromNumber: string;         // live
    connected: boolean;
    test?: {
      accountSid: string;       // test (AC...test prefix)
      authToken: string;        // test (auth_test...)
      fromNumber: string;       // test ($15005550006 or builder's choice)
    };
  };
  resend?: {
    apiKey: string;             // live (re_live_...)
    fromEmail: string;
    fromName: string;
    connected: boolean;
    test?: {
      apiKey: string;           // test (re_test_...)
      fromEmail: string;        // typically @example.com
    };
  };
  // stripe: see G-8-2 for separate handling
};
```

**Cross-ref Zod validator** (per L-17 calibration): if SLICE 8 ships a `TestModeConfigSchema` validating these sub-objects, edges:
1. `test.accountSid` regex check (Twilio test-credential format)
2. `test.authToken` non-empty refine
3. `test.fromNumber` E.164 refine
4. `test.apiKey` regex check (Resend test-key prefix)
5. `test.fromEmail` email refine
6. (optional) `connected ⇒ test.* required` superRefine when `testMode = true`

**Edge count: 5-6, single gate** (test-credential validation). Per L-17 4-datapoint hypothesis: predicted multiplier `2.5-3.0x × 1.0 (single gate) = 2.5-3.0x`. **This is the audit's L-17 control candidate** — a 5-6 edge schema with single-gate breadth, validating the gate-breadth confound from MessageTriggerSchema (4.87x at 6 edges + 4 gates).

### 3.3 Stripe — special case (gate G-8-2)

Stripe test mode is currently **platform-wide**: `STRIPE_TEST_SECRET_KEY` env var. Three options for per-workspace Stripe test:

- **Option A (defer):** SLICE 8 v1 doesn't address Stripe. Test mode for Twilio + Resend ships; Stripe stays platform-keyed (test transactions still possible globally, just not per-workspace).
- **Option B (workspace-keyed):** Add `integrations.stripe.testSecretKey` field. Test mode reads workspace test key; production reads platform key.
- **Option C (Stripe Connect test accounts):** Each workspace has both a live and a test connected-account ID; `stripeConnections` table gets a sibling `stripeTestConnections` table.

**Recommendation: Option A (defer Stripe to SLICE 8b).** Per ground-truth §2.1, Stripe's per-workspace credential model is fundamentally different from Twilio/Resend (platform-keyed via env, not workspace-keyed via integrations). Bundling Stripe into SLICE 8 doubles the schema work and forces a per-workspace credential migration. Twilio + Resend alone unblock the most common test scenarios (SMS confirmation, email reply); Stripe test transactions can use the platform `sk_test_` for the duration of v1.

---

## §4 Dispatcher routing

### 4.1 Per-provider test-mode check — orthogonal pattern

Each send function gets one new check, inserted at the same logical point (after suppression, before provider call):

**Twilio:**
```typescript
async function sendSmsFromApi(params) {
  // ... suppression check (existing)
  const config = resolveTwilioConfig(orgId);  // NEW: returns test or live
  // ... existing flow with config
}

async function resolveTwilioConfig(orgId: string): Promise<TwilioConfig> {
  const org = await loadOrg(orgId);
  if (org.testMode && org.integrations.twilio?.test) {
    return mapTestToConfig(org.integrations.twilio.test);
  }
  return mapLiveToConfig(org.integrations.twilio);
}
```

**Resend:** symmetric — `resolveResendConfig(orgId)` selects test vs live.

**Stripe:** per G-8-2 Option A, deferred.

### 4.2 L-17 dispatcher interleaving hypothesis — 3rd datapoint candidate

Per SLICE 7 PR 1 close-out, the dispatcher interleaving hypothesis is at 2 datapoints:
- SLICE 5 schedule dispatcher (interleaved policies): 3.5x
- SLICE 7 message dispatcher (orthogonal policies): 1.75x

**SLICE 8 dispatcher routing is the textbook orthogonal case:** each provider's test-mode check is independent of every other provider's. No decision in axis A affects axis B. Per the hypothesis, multiplier should land at **1.5-2.0x**.

**If it lands in 1.5-2.0x:** validates the orthogonal-vs-interleaved distinction → 3-datapoint hypothesis confirms; promote to settled rule at SLICE 8 close.

**If it lands above 2.0x:** hypothesis needs revision (perhaps test-mode check inadvertently entangles with suppression, retry, or some other policy).

### 4.3 Conversation runtime threading

[`lib/conversation/runtime.ts:242`](packages/crm/src/lib/conversation/runtime.ts:242): add `testMode?: boolean` to `RuntimeInput`. The handler at line 296-313 either:
- Reads `org.testMode` directly (one more DB lookup per inbound; simpler)
- Threads from caller (callers know orgId; lookup cost paid once)

**Recommendation:** read at the send-function boundary (`sendSmsFromApi`), not at the runtime layer. Keeps the runtime test-mode-agnostic; centralizes the routing in `resolveTwilioConfig` / `resolveResendConfig`.

### 4.4 Webhook receivers — passthrough

Inbound paths don't dispatch outbound, so no test-mode logic at the webhook boundary. **Exception**: Stripe's `livemode: false` events, if the workspace expects them to update the test-mode subset of state — gate G-8-5 covers this.

---

## §5 Admin UI

### 5.1 Test mode toggle in workspace settings

New card in [`app/(dashboard)/settings/page.tsx`](packages/crm/src/app/(dashboard)/settings/page.tsx) (or sub-page `/settings/workspace`). Composes existing primitives (Checkbox or new Switch). Server action follows `updateIntegrationAction` pattern (assertWritable + getOrgId + DB update + revalidatePath).

**LOC estimate:** ~120 prod (form + server action + helper). Per L-17 0.94x composition multiplier: ~110 tests. Total: ~230 LOC.

### 5.2 Top-of-dashboard banner

Adapt [`DemoBanner`](packages/crm/src/components/layout/demo-banner.tsx) → `TestModeBanner`. Differences from DemoBanner:
- Conditional on `workspace.testMode` (not env var)
- Message: "Test mode active — outbound SMS / email / payments route to provider test endpoints."
- CTA: "Switch to live mode →" linking to `/settings/workspace`
- Tone: caution (yellow) — not alarm (red); matches DemoBanner's `border-caution/40` style

**Composition over creation.** Per L-17 UI multiplier 0.94x. ~80 prod + ~75 tests.

### 5.3 Customer-facing surfaces — gate decision

Should the public booking page show "This workspace is in test mode" to end-customers? Per G-8-3:

- **Pro show:** prevents real-customer confusion if a builder is testing the booking flow against real-customer phone numbers
- **Pro hide:** customer-facing surfaces should look production-ready; test mode is an internal concern

**Recommendation:** show a discreet "Demo / Test" badge inline with the existing `PoweredByBadge` ([app/book/[orgSlug]/[bookingSlug]/page.tsx:37](packages/crm/src/app/book/[orgSlug]/[bookingSlug]/page.tsx)). Composition over `PoweredByBadge` is ~30 LOC.

### 5.4 Workspace context hook for client components

Currently no `useWorkspace` hook. Add minimal:
```typescript
// packages/crm/src/lib/workspace/context.ts
export const WorkspaceContext = createContext<{ testMode: boolean; ... } | null>(null);
export function useWorkspace() { ... }
```

Server-side, the `(dashboard)/layout.tsx` reads org from `getOrgId()` and passes to a `<WorkspaceProvider>`. ~50 LOC.

### 5.5 SLICE 4a 0.94x composition multiplier

Per the hypothesis: admin UI built on existing patterns (PageShell, EntityFormDrawer, etc.) lands at 0.94x test/prod ratio. SLICE 8's UI is small (toggle card + banner + badge) — the multiplier matters less than for a full table page. Project at 0.9-1.0x for UI components.

---

## §6 Gate items

Seven substantive decisions (Max projected 4-6; recommend collapsing G-8-5 + G-8-6 into one "observability + downstream consumers" decision if needed). **Bold = decision blocks PR start.**

### **G-8-1: Storage location for `testMode` flag**

- **Option A:** Top-level column `organizations.test_mode boolean NOT NULL DEFAULT false`
- **Option B:** Inside `organizations.settings` JSONB as `settings.testMode`
- **Option C:** Per-provider in `integrations.{provider}.testMode`

**Recommendation: Option A.** Mirrors existing convention (`plan`, `timezone`, `soulCompletedAt` are all top-level columns). JSONB is unvalidated and harder to index. Per-provider granularity (Option C) is over-engineered for v1 — builders generally want all-or-nothing test mode, not "test SMS but live emails".

### **G-8-2: Stripe per-workspace test credentials approach**

Per §3.3:
- **Option A:** Defer Stripe to SLICE 8b. Twilio + Resend only in v1.
- **Option B:** Add `integrations.stripe.testSecretKey` field. Workspace test mode → workspace test key.
- **Option C:** Stripe Connect test accounts (parallel `stripeTestConnections` table).

**Recommendation: Option A.** Stripe's platform-keyed model is fundamentally different from Twilio/Resend; bundling adds ~400 LOC + a credential migration. SMS confirmation + email reply (the most common test scenarios) ship cleanly with Option A.

### **G-8-3: Test mode visibility scope**

- **Option A:** Admin banner only (top of dashboard)
- **Option B:** Admin banner + customer-facing badge on public surfaces
- **Option C:** Admin banner + customer badge + email/SMS prefix tag (e.g., "[TEST] Confirmed for...")

**Recommendation: Option B.** Customer-facing badge prevents the "real customer accidentally booked through test workflow" failure mode. Email/SMS body tagging (Option C) is over-invasive — provider test endpoints already prefix or sandbox the messages on their side.

### **G-8-4: Test endpoint configuration — required vs optional**

When `testMode = true` but `integrations.twilio.test` is unset, what happens?

- **Option A:** Send fails fast with a clear error ("test mode active but no test credentials configured")
- **Option B:** Send is skipped silently; logged event for observability
- **Option C:** Fall back to platform-default test credentials (e.g., a SeldonFrame-managed Twilio test account)

**Recommendation: Option A.** Fail-fast surfaces config gaps loudly. Option C requires SeldonFrame to maintain shared test credentials, adds operational burden. Option B silently swallows real testing intent.

### **G-8-5: Test data lifecycle — same tables vs filtered**

- **Option A:** Test mode writes to the same DB tables (smsMessages, emails, bookings) as live. No filtering at query layer.
- **Option B:** Tag every test-mode-originated row with `is_test boolean`. Dashboard queries filter by default.
- **Option C:** Separate test schemas / tables.

**Recommendation: Option A.** Simpler, no schema migration on every domain table. The provider-side test endpoints already isolate the *external* dispatch — internal records existing in the same tables is fine. If the dashboard surfaces become noisy with test records over time, a follow-up slice can add filtering. Workflow_event_log tagging (per `payload.testMode = true`) is a cheap observability win without the full schema change.

### **G-8-6: Test mode behavior for scheduled + message triggers**

- **Option A:** Triggers fire normally in test mode; the provider routing handles the test dispatch
- **Option B:** Triggers don't fire in test mode (would prevent unintended scheduled real customer reach)
- **Option C:** Triggers fire only against contacts tagged as test contacts

**Recommendation: Option A.** Composes cleanly with the rest of the design — test mode is purely an external-dispatch routing concern, not a trigger-firing concern. Builder testing a scheduled workflow needs the trigger to fire so they can verify the agent runs. Provider-side test routing prevents real-customer reach.

### **G-8-7: Conversation runtime — explicit param vs implicit DB lookup**

Per §4.3:
- **Option A:** `RuntimeInput` carries `testMode?: boolean` from caller
- **Option B:** Send function (`sendSmsFromApi`) reads workspace test mode at the point of dispatch

**Recommendation: Option B.** Keeps the conversation runtime test-mode-agnostic; centralizes routing in `resolveTwilioConfig` / `resolveResendConfig` (one DB lookup per send, cached if needed). Avoids threading the flag through 5+ call sites.

---

## §7 LOC projection (calibration applied)

### 7.1 Per-component estimates

Production code:

| Component | Prod LOC | Reasoning |
|---|---|---|
| `testMode` column + migration | 30 | Single column add |
| `OrganizationIntegrations` type extension (twilio.test + resend.test) | 30 | Type-only |
| Test-credential Zod schema (`TestModeConfigSchema`) | 80 | 5-6 cross-ref edges, single gate (G-8-3 / G-8-4 condition + format refines) |
| `resolveTwilioConfig` + `resolveResendConfig` helpers | 80 | Per-provider read + select |
| Send-function integration (Twilio + Resend) | 30 | One call per send function |
| Workspace settings test-mode toggle UI + server action | 120 | Composition over existing settings card pattern |
| `WorkspaceContext` + `useWorkspace` hook | 50 | Minimal client context |
| `TestModeBanner` component | 60 | DemoBanner adaptation |
| Customer-facing test badge | 30 | PoweredByBadge composition |
| Stripe webhook `livemode` branching (G-8-5 cheap win) | 20 | One conditional + observability tag |
| **Production subtotal** | **~530** | |

Test code (per L-17 calibrated multipliers):

| Component | Test LOC | Multiplier basis |
|---|---|---|
| Migration smoke test | 30 | 30 prod × 1.0x |
| Type extension tests | 50 | 30 prod × 1.7x |
| `TestModeConfigSchema` (5-6 cross-ref edges, 1 gate) | 230 | 80 prod × 2.85x (L-17 4-6 band midpoint, gate_breadth=1.0) |
| Resolver helpers | 160 | 80 prod × 2.0x (orthogonal — validates dispatcher interleaving hypothesis) |
| Send-function integration | 75 | 30 prod × 2.5x (per-provider × test-mode-on/off matrix) |
| UI toggle + server action | 110 | 120 prod × 0.94x (UI composition multiplier) |
| WorkspaceContext + hook | 80 | 50 prod × 1.6x |
| TestModeBanner | 60 | 60 prod × 1.0x (composition) |
| Customer badge | 30 | 30 prod × 1.0x |
| Stripe webhook livemode | 50 | 20 prod × 2.5x |
| **Test subtotal** | **~875** | |

Documentation / artifacts:

| Item | LOC |
|---|---|
| Audit (this doc) | 800 |
| Close-out report | 200 |
| Integration harness (artifact) | 280 |
| E2E test (artifact) | 220 |
| Probe regression (artifact) | 50 |
| **Doc + artifact subtotal** | **~1,550** |

### 7.2 Total + envelope check

- **Production:** ~530
- **Tests (excl. artifacts):** ~875
- **Code total:** ~1,405
- **+ Artifacts (integration harness + E2E):** ~500
- **+ Docs (audit + close-out):** ~1,000

**Code + artifacts: ~1,905 LOC.**

Comparison to Max's projection (1,800-2,400):

**Lands at the lower end of the projected band.** Drivers:
- Inherited admin UI shell, banner pattern, server-action pattern
- Ground-truth confirmed all three send functions have a clean insertion point
- Stripe deferred per G-8-2 Option A (saves ~400 LOC)

Stop-and-reassess trigger: 3,120 LOC (30% over 2,400). **Code + artifacts at ~1,905 — comfortably 39% under trigger.** No scope tightening required.

### 7.3 Calibration notes for SLICE 8 close-out

- **L-17 cross-ref Zod gate-breadth control datapoint:** `TestModeConfigSchema` is the **5-datapoint hypothesis validation candidate**. Predicted: 2.5-3.0x at 5-6 edges + 1 gate. If actual lands in 2.5-3.0x, hypothesis confirms with 5-datapoint stability + 2 control points (SLICE 7 PR 2 loop-guard at 3 edges + 1 gate landed at 2.79x).
- **L-17 dispatcher interleaving 3rd datapoint:** orthogonal-policy resolver helpers should land at 1.5-2.0x. Validates the SLICE 7 hypothesis.
- **L-23 N/A:** SLICE 8 doesn't ship a new archetype (test mode is config, not capability).
- **L-26 applied:** all probe regressions use canonical `structural-hash.mjs` via `run-regression-3x.mjs`.
- **L-27 critical:** PR close-out MUST include an explicitly-verified "Vercel preview green" row. Run `pnpm typecheck` (now wired) AND observe Vercel deployment status before marking ✅.

---

## §8 Proposed PR split

Code total ~1,405 + artifacts ~500 = ~1,905 LOC. **Single PR fits comfortably** under 2,400 high-end + 3,120 stop trigger.

### Recommended: single PR, 7 mini-commits

- **C0:** Methodology updates (doc-only) — L-17 hypothesis-validation expectations, L-27 audit-time green-bar requirements (~30 LOC)
- **C1:** Migration + `testMode` column + `OrganizationIntegrations` type extension + tests (~110 LOC)
- **C2:** `TestModeConfigSchema` cross-ref Zod validator + tests (~310 LOC)
- **C3:** `resolveTwilioConfig` + `resolveResendConfig` resolver helpers + send-function integration + tests (~345 LOC)
- **C4:** Workspace settings UI (toggle + server action) + WorkspaceContext + TestModeBanner + customer badge + tests (~530 LOC)
- **C5:** Stripe webhook `livemode` branching + workflow_event_log test-mode tag + tests (~70 LOC)
- **C6:** Integration harness + E2E test (~500 LOC)
- **C7:** 18-probe regression + green-bar verification (Vercel observed) + close-out (~50 LOC + report)

### Alternative: 2-PR split (if scope grows)

If gates resolve in a way that pushes scope above 2,200 LOC:
- **PR 1:** Schema + dispatcher routing (C0-C5) — ~1,400 LOC
- **PR 2:** UI + integration + close-out (C4 split + C6+C7) — ~700 LOC

Audit recommendation: **single PR**. The work is cohesive; splitting introduces handoff overhead without a forcing function.

---

## §9 Dependencies

**Blocks SLICE 8:**
- `organizations.integrations` JSONB schema (shipped) ✅
- Twilio + Resend send functions (shipped) ✅
- Workspace settings UI shell + server-action pattern (shipped, SLICE 4a-era) ✅
- DemoBanner pattern (shipped) ✅
- L-26 canonical structural-hash + `pnpm typecheck` script (shipped, SLICE 7 fix arc) ✅
- L-27 verified Vercel discipline (now in lessons.md) ✅

**Independent of:**
- SLICE 6 external_state branching (test mode doesn't affect HTTP fetcher; builders point at test endpoints in their own config)
- SLICE 9 worked-example slice

**Affects (must respect test mode):**
- SLICE 5 scheduled triggers (per G-8-6 Option A: triggers fire normally; routing is at the send-function leaf)
- SLICE 7 message triggers + appointment-confirm-sms archetype (per G-8-6 Option A: same)

**Deferred dependencies (post-launch):**
- Stripe per-workspace test credentials (SLICE 8b per G-8-2 Option A)
- Test data lifecycle filtering (post-launch per G-8-5)

---

## §10 Out of scope (explicit deferrals)

- **Multi-environment workspaces** (test/staging/prod as separate workspaces — different architecture entirely; per Max's spec)
- **Test data import/export tools** (per Max's spec)
- **Bulk test data generation** (per Max's spec)
- **Test mode for SLICE 6 external_state HTTP fetcher** — builders configure test endpoints in their workflow's `external_state.http.url` directly; SeldonFrame doesn't auto-route (per Max's spec)
- **Stripe per-workspace test credentials** — deferred per G-8-2 Option A recommendation. SLICE 8b post-launch fast-follow if/when needed.
- **Test data filtering in dashboards** — per G-8-5 Option A recommendation. Defer to post-launch if surfaces become noisy.
- **Test event tagging in workflow_event_log** — partial: `payload.testMode = true` is cheap (~5 LOC); full schema-level discriminator deferred.
- **Test mode for inbound webhooks** — passthrough; Stripe `livemode` branching is the only minimal addition (G-8-5)
- **Customer-facing test mode email/SMS body prefix** (per G-8-3 Option C — over-invasive)
- **Per-provider test mode granularity** (per G-8-1 Option C — over-engineered for v1)
- **AI-assisted test data generation** — Brain v2 concern, not SLICE 8

---

## §11 Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Workspace stays in test mode accidentally → real customers expect dispatches that go to test endpoint | Medium | High | TestModeBanner persistent at top of dashboard; customer-facing badge per G-8-3 Option B |
| Test endpoint configuration missing when test mode toggled on | Medium | Medium | G-8-4 Option A: fail-fast at send time with clear error; UI prompts builder to configure test creds before enabling test mode |
| Race condition: test mode flips mid-run | Low | Low | Send functions read `org.testMode` at dispatch time, not run start — already-pending operations finish on whichever mode they were dispatched against |
| Test data accumulates in production tables, confusing dashboards | Medium | Low | G-8-5 Option A accepts this; if it becomes a problem, `payload.testMode` tag in workflow_event_log enables retroactive filtering |
| Stripe test transactions hit platform test key (not workspace-isolated) | Medium | Low | Documented limitation per G-8-2 Option A; Stripe per-workspace test in SLICE 8b |
| Stripe webhook delivers test event to live workspace | Low | Medium | G-8-5 cheap win: branch on `livemode: false` and tag as test event in observability |
| Loop guard from SLICE 7 doesn't trigger in test mode (test loops not detected) | Low | Low | Loop guard reads from `messageTriggerFires` table — same table used in test mode. No special-case logic needed |
| Builder forgets to switch back to live before launching | High | High | TestModeBanner CTA "Switch to live mode →"; confirm dialog when toggling off (extra friction by design); checklist item in launch flow (out of scope, but recommended) |
| Customer sees test mode banner on public booking → confusion | Medium | Low | G-8-3 Option B uses discrete "Demo / Test" badge inline with PoweredByBadge — informative without alarming |

---

## §12 §11 End-to-end flow continuity

### 12.1 How agent runs interact with test mode

1. Trigger fires (event / schedule / message) → `startRun` called with `orgId`
2. Run executes as normal — read_state, branch, write_state, etc. all unaffected (these don't dispatch externally)
3. When a step calls `mcp_tool_call` with `tool: "send_sms"` → resolves to `sendSmsFromApi(orgId, ...)`
4. `sendSmsFromApi` → `resolveTwilioConfig(orgId)`:
   - If `org.testMode = true` AND `integrations.twilio.test` set → return test config
   - If `org.testMode = true` AND test config missing → fail fast (G-8-4 Option A)
   - If `org.testMode = false` → return live config
5. Twilio API call uses the resolved config — test or live; same code path
6. SMS event emitted to `workflow_event_log` with `payload.testMode: true` if applicable (G-8-5 cheap tag)

### 12.2 How scheduled + message triggers respect test mode (G-8-6 Option A)

- **Scheduled triggers (SLICE 5):** cron tick fires regardless of test mode. Run executes. Send functions handle test routing at the leaf.
- **Message triggers (SLICE 7):** inbound webhook → dispatcher matches → run starts. Same pattern.
- **No special-case dispatcher logic.** The only place test mode matters is at the send-function boundary.

### 12.3 Observability differences

- **/agents/runs page:** unchanged. Renders all runs regardless of test mode. (Future enhancement: filter toggle.)
- **workflow_event_log:** new optional `payload.testMode: true` tag on test-originated events. /agents/runs detail panel can render a "TEST" badge per event.
- **smsMessages, emails, bookings tables:** no schema change (G-8-5 Option A). Test rows live alongside live rows.

### 12.4 How the webhook receivers integrate

- **Inbound Twilio:** signature verification uses workspace's `authToken`. If test mode active + test credentials configured, signature uses test `authToken`. Verification logic is identical.
- **Inbound Resend:** Resend webhook secret is platform-level (env var) — no per-workspace test variant. Webhook events arrive identically.
- **Inbound Stripe:** events carry `livemode: false`. G-8-5 cheap win: tag in observability + reject (or warn) if workspace is in live mode.

---

## §13 Calibration methodology summary

Per CLAUDE.md and L-17 lineage:

- **Architectural multiplier:** UI + dispatcher work, predominantly composition → 0.9-1.0x admin UI; 1.5-2.0x orthogonal dispatchers; 2.5-3.0x cross-ref Zod (single-gate)
- **Cross-ref Zod edge-count scaling:** 5-6 edges + 1 gate → 2.5-3.0x predicted (5-datapoint validation candidate)
- **Dispatcher interleaving:** orthogonal policies → 1.5-2.0x predicted (3-datapoint validation candidate)
- **Blocked-dep inline budget:** N/A
- **L-23 N/A:** no new archetype this slice
- **L-26 applied:** all regression runs use canonical structural-hash convention
- **L-27 applied:** every PR close requires verified Vercel green (push + observe), `pnpm typecheck` baseline diff, and explicit Vercel-row in green-bar table

---

## §14 Audit-time green-bar requirements (per L-27)

The PR 1 close-out MUST include this explicit table format:

| Check | Command/Source | Result |
|---|---|---|
| `pnpm typecheck` | (run locally) | N errors (matches pre-existing baseline of 4) |
| `pnpm test:unit` | | NNNN/NNNN (X todo, 0 fail) |
| `pnpm emit:blocks:check` | | no drift |
| `pnpm emit:event-registry:check` | | no drift |
| Probe regression | `node scripts/phase-7-spike/run-regression-3x.mjs slice-8-regression` | 18/18 PASS, 26-streak holds |
| **Vercel preview build** | **observe at https://vercel.com/.../{commit-sha}** | **✅ green (verified at <commit-sha>)** OR **🟡 PENDING USER CONFIRMATION** |
| L-17 cross-ref Zod 5-datapoint check | (calculate at close) | actual ratio vs predicted 2.5-3.0x |
| L-17 dispatcher 3rd datapoint check | (calculate at close) | actual ratio vs predicted 1.5-2.0x |

**Vercel row may NOT be marked ✅ via inference.** Push commit, observe Vercel build status (dashboard or status check), only then mark verified.

---

## §15 Stopping point

Per L-21: audit committed + pushed. **Stop. Wait for Max to resolve gates G-8-1 through G-8-7 + scope envelope decision (single PR with 7 commits vs 2-PR split) before any code commits.**

If gates resolve to the audit's recommended Option-A path across the board:
- **Single PR LOC:** ~1,405 code + ~500 artifacts = ~1,905 (lower end of 1,800-2,400 projection)
- Stop-and-reassess trigger: 3,120 (39% headroom)
- L-17 hypothesis validation: cross-ref Zod 5-datapoint check + dispatcher interleaving 3rd datapoint
- L-27 discipline: explicit Vercel green-bar row, observed not inferred

If gates resolve differently (especially G-8-2 selecting Option B/C for Stripe, or G-8-1 selecting Option C per-provider granularity), audit revision in 1-2 rounds before code starts.

---

## Appendix A — Audit-time deviations from Max's pre-audit framing

1. **Stripe is platform-keyed, not workspace-keyed** — Max's spec implied symmetric per-workspace test routing across all three providers. Ground-truth shows Stripe uses platform env vars (`STRIPE_SECRET_KEY`/`STRIPE_LIVE_SECRET_KEY`/`STRIPE_TEST_SECRET_KEY`) with per-workspace `stripeAccountId` only. Bundling Stripe into v1 doubles schema work; G-8-2 recommends defer to SLICE 8b.

2. **No existing test/sandbox/dry-run scaffolding for provider dispatch** — confirms Max's expectation. SLICE 8 is almost entirely net-new at the dispatch layer.

3. **Demo mode is orthogonal** — `demo` in this codebase = read-only deployment via `NEXT_PUBLIC_DEMO_READONLY` env var. Test mode is a different concept (writes happen, external dispatches re-routed). Both can coexist.

4. **Stripe webhook `livemode` field already parsed but unused** — small bonus opportunity per G-8-5 cheap win (~20 LOC).

5. **No `<Switch>` primitive shipped** — Base-UI Checkbox is in the codebase. Either reuse or add a 4-6 LOC Switch wrapper. Doesn't affect scope.

6. **Workspace test mode + scheduled / message triggers** — per G-8-6 Option A, no special-case dispatcher logic needed. The triggers fire normally; routing happens at the leaf send functions. This simplifies SLICE 8 substantially vs. an "trigger gates" approach.

These deviations explain why the audit's LOC projection lands at the lower end of Max's 1,800-2,400 range despite ground-truth confirming SLICE 8 is largely net-new.
