# Proposal Builder — design

**Date:** 2026-05-19
**Author:** dogfood-driven iteration on the agency revenue stack
**Status:** Draft for review

## Goal

Agencies can send a branded, AI-generated proposal to a prospect, with a **live working workspace already built** as part of the pitch. Prospect clicks Accept → Stripe Checkout → recurring subscription begins on the AGENCY's Stripe account (SeldonFrame takes 0% platform fee) → workspace flips from preview to live → onboarding email fires.

**Success criterion (one sentence):** an agency operator goes from "I want to pitch Roofs by Shiloh" to "Roofs by Shiloh is paying me $497/mo and using their live workspace" in **under 5 minutes of operator effort**, with **0% taken by SeldonFrame**.

## Non-goals

- Cold-outreach lead-generation flow (deferred — separate Lead Finder spec, skipped for now per operator)
- Multi-party / contract negotiation (this is a fixed-price recurring proposal, not a back-and-forth contract)
- Custom payment terms beyond monthly recurring (no net-30 invoicing, no annual prepay discounts in v1)
- Proposal versioning beyond the existing config-history pattern (Phase 7.3 of RunContext already gives us this primitive)
- Replacing the existing operator-portal Stripe integration (Proposal Builder uses Stripe Connect Express on TOP of the existing direct-charge platform billing — two distinct Stripe surfaces)

## The single architectural principle

**Send a working system, not a static PDF.** Spawnly's pitch is "AI-generated proposal." Ours is "AI-generated proposal that includes the live workspace we already built for you." The prospect clicks around the actual booking page + chatbot in their proposal — interactive, real, theirs the moment they click Accept.

This is only possible because SeldonFrame already has the URL→workspace pipeline. Every other "AI proposal builder" sends a deck. We send a product.

## Locked decisions (to be approved before plan writing)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Stripe model | **Connect Express + direct charges** | Agency does ~5 min Stripe onboarding; charges run on their account; we never touch the money. Clean "0% platform fee" positioning. |
| 2 | Workspace provisioning timing | **At send time, full provision** | The killer differentiator is "we already built it." Cost (LLM calls) is bounded by per-tier proposal limits. |
| 3 | Live preview embedding | **iframe of booking page + screenshots of CRM/chatbot/forms** | Interactive booking page is the most demo-worthy surface; the rest as snapshots keeps the proposal page lean. |
| 4 | Proposal storage | **Dedicated `proposals` table** | Clean queries for CRM surface, status transitions, audit. |
| 5 | Public proposal URL | **UUID + DB lookup + signed token** | Matches existing booking-manage URL pattern. Easy to revoke. |
| 6 | Proposal template editability | **Per-agency in `agency_profile.proposalTemplate`** | Mirrors how `agentConfig.placeholders` work. Operator edits at `/proposals/template`. |
| 7 | Pricing tiers | **Three presets (Starter $297 / Growth $497 / Pro $997) + custom override per proposal** | Defaults from Spawnly research; operator overrides per-prospect. |
| 8 | Acceptance flow | **Stripe Checkout (hosted) → success URL → workspace activation → portal redirect** | Hosted Checkout = least PCI surface for us. Standard pattern. |
| 9 | SeldonFrame revenue model | **Base subscription tier includes Proposal Builder; 0% cut on agency's billings** | "We don't take a cut" is the marketing anchor. Revenue comes from agency's $99/mo Scale subscription. |
| 10 | Acceptance idempotency | **Stripe Checkout session ID as natural key** | Stripe guarantees session uniqueness; we use it for "have we already provisioned for this proposal?" |

## Data model

### New table: `proposals`

```sql
CREATE TABLE proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Prospect identity
  prospect_url TEXT NOT NULL,           -- The URL the operator pasted
  prospect_name TEXT NOT NULL,          -- e.g. "Roofs by Shiloh" (extracted from soul)
  prospect_email TEXT NOT NULL,         -- Where the proposal email goes
  prospect_first_name TEXT,
  prospect_phone TEXT,
  -- The provisioned preview workspace
  preview_workspace_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  -- Proposal contents
  pricing_tier TEXT NOT NULL,           -- 'starter' | 'growth' | 'pro' | 'custom'
  monthly_price_cents INT NOT NULL,     -- e.g. 49700 for $497.00
  generated_html TEXT NOT NULL,         -- AI-generated proposal copy + agency chrome
  scope_items JSONB NOT NULL DEFAULT '[]'::jsonb, -- editable line items
  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'draft', -- draft | sent | viewed | accepted | declined | expired
  signed_token TEXT NOT NULL UNIQUE,    -- For public URL signing
  sent_at TIMESTAMPTZ,
  first_viewed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  -- Stripe integration
  stripe_checkout_session_id TEXT,      -- Set when prospect clicks Accept; idempotent
  stripe_subscription_id TEXT,          -- Set after Checkout success webhook
  stripe_customer_id TEXT,              -- The prospect's Stripe customer on the agency's account
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX proposals_agency_status_idx ON proposals(agency_org_id, status, created_at DESC);
CREATE INDEX proposals_signed_token_idx ON proposals(signed_token);
```

### New table: `proposal_events` (for audit + status timeline)

```sql
CREATE TABLE proposal_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,             -- 'created' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'checkout_started' | 'checkout_success' | 'workspace_activated'
  metadata JSONB,
  ip_address TEXT,                       -- For 'viewed' events
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX proposal_events_proposal_idx ON proposal_events(proposal_id, created_at DESC);
```

### Extension to `agency_profile` JSONB (on users table)

```ts
type AgencyProfile = {
  // ... existing fields (name, logo_url, brand_color, website_url) ...
  proposalTemplate?: {
    subject: string;          // Email subject
    introCopy: string;        // First paragraph of the proposal
    scopeCopy: string;        // What's included section
    timelineCopy: string;     // "Here's what happens after you click Accept"
    termsCopy: string;        // Fine print
  };
  stripeConnect?: {
    accountId: string;        // acct_xxx from Stripe Connect Express
    onboardedAt: string;      // ISO
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
  };
};
```

## Architecture flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 1. AGENCY ONBOARDING (one-time, ~5 minutes)                              │
│    GET /proposals/onboarding                                             │
│    → If no agencyProfile.stripeConnect.accountId, render Connect button │
│    → Click "Connect Stripe account" → Stripe-hosted Express onboarding  │
│    → On return, store account_id + chargesEnabled/payoutsEnabled status │
│    → Render template editor (intro, scope, timeline, terms)              │
└──────────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ 2. PROPOSAL CREATION                                                     │
│    POST /api/v1/proposals  { prospect_url, prospect_email, ... }         │
│    a. Extract prospect.soul from URL (existing soul-extractor)          │
│    b. Provision preview workspace via existing /clients/new flow         │
│       (status='preview' — flipped to 'active' on acceptance)            │
│    c. Claude generates proposal HTML:                                    │
│       - Uses agency.soul + agency.proposalTemplate (operator-editable)  │
│       - Personalized with prospect.name + extracted services            │
│       - Embeds workspace preview URLs (booking iframe + screenshots)    │
│    d. Insert into proposals table with status='draft'                   │
│       + log proposal_events row (event_type='created')                  │
│    e. Return proposal_id for operator to review/edit                    │
└──────────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ 3. OPERATOR REVIEW + SEND                                                │
│    GET /proposals/[id]/edit (operator-only)                              │
│    - Live preview of the generated HTML                                  │
│    - Inline edits to scope_items + monthly_price_cents                  │
│    - Click "Send" → POST /api/v1/proposals/[id]/send                    │
│      a. Validate Stripe Connect onboarded                                │
│      b. Set status='sent', sent_at=NOW()                                 │
│      c. Send email via existing send_email flow:                        │
│         - From: agency's Resend sender (already wired)                  │
│         - To: prospect_email                                             │
│         - Subject: agency.proposalTemplate.subject                      │
│         - Body: link to public proposal URL                             │
│      d. Log proposal_events 'sent'                                       │
└──────────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ 4. PROSPECT VIEWS PROPOSAL                                               │
│    GET /p/[signed_token] (public route, no auth)                         │
│    - Render proposal HTML with agency chrome                             │
│    - Embed iframe of booking page (live preview workspace)              │
│    - Show CRM/chatbot/forms screenshots                                  │
│    - Big "Accept & start" button → Stripe Checkout                      │
│    - Log proposal_events 'viewed' (with IP + UA, dedup on same IP/24h)  │
│    - Update first_viewed_at if null                                      │
└──────────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ 5. ACCEPT → STRIPE CHECKOUT                                              │
│    POST /api/v1/proposals/[id]/accept (public, token-verified)           │
│    a. Create Stripe Checkout session on agency's CONNECTED account:     │
│       - mode: 'subscription'                                             │
│       - line_items: 1× monthly_price_cents recurring                    │
│       - customer_email: prospect_email                                   │
│       - success_url: /p/[token]/success?session_id={CHECKOUT_SESSION_ID} │
│       - cancel_url: /p/[token]                                           │
│       - subscription_data: { metadata: { proposal_id, preview_ws_id }} │
│    b. Store stripe_checkout_session_id on proposal                       │
│    c. Log proposal_events 'checkout_started'                             │
│    d. Redirect prospect to session.url                                   │
└──────────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ 6. STRIPE CHECKOUT SUCCESS WEBHOOK                                       │
│    POST /api/webhooks/stripe/connect (Stripe → us)                       │
│    Event: checkout.session.completed                                     │
│    a. Verify webhook signature (Connect endpoint secret)                │
│    b. Look up proposal by stripe_checkout_session_id                    │
│    c. Set status='accepted', accepted_at=NOW(),                          │
│       stripe_subscription_id, stripe_customer_id                         │
│    d. Activate preview_workspace: set status='active',                  │
│       transfer ownership to prospect, send invite email                  │
│    e. Log proposal_events 'checkout_success' + 'workspace_activated'    │
│    f. Send agency notification: "X just signed up at $Y/mo"             │
│    g. Send prospect onboarding email with portal link                   │
└──────────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ 7. RECURRING BILLING (agency keeps 100%)                                 │
│    Stripe automatically charges monthly on agency's account              │
│    Payouts flow to agency's bank per their Stripe settings              │
│    Failed payments → Stripe Smart Retries + agency notification         │
│    No SeldonFrame involvement                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

## The killer detail: live workspace preview in the proposal

When the prospect opens `/p/[signed_token]`, they don't see a slide deck. They see:

```
┌─────────────────────────────────────────────────────────────────┐
│ [agency logo + brand chrome]                                    │
│                                                                 │
│ Hi Roofs by Shiloh,                                            │
│                                                                 │
│ [AI-generated 2-paragraph intro tailored to their site]        │
│                                                                 │
│ Here's what we built for you:                                   │
│                                                                 │
│ ┌────────────────────────────────────────────────────────────┐│
│ │  [LIVE IFRAME of roofs-by-shiloh.app.seldonframe.com/book] ││
│ │  Click around — pick a date, fill the form. This is yours. ││
│ └────────────────────────────────────────────────────────────┘│
│                                                                 │
│ Plus:                                                           │
│ - CRM + pipeline (screenshot)                                   │
│ - Intake form (screenshot)                                      │
│ - AI chatbot (screenshot)                                       │
│ - Automation engine (screenshot)                                │
│                                                                 │
│ Investment: $497 / month. We don't charge a setup fee.         │
│                                                                 │
│ [    Accept & start →    ]                                     │
│                                                                 │
│ [agency contact + terms]                                        │
└─────────────────────────────────────────────────────────────────┘
```

The booking page iframe IS the prospect's actual workspace (in `status='preview'`). When they click Accept, the same workspace flips to `status='active'` and ownership transfers. The system they clicked through IS the system they're paying for. No bait and switch.

## Phases (mirror the RunContext approach)

### Phase 0 — Schema + types (~1 day)

- Migration 0049: `proposals` + `proposal_events` tables, agency_profile JSONB extension
- TypeScript types for `Proposal`, `ProposalEvent`, `AgencyProposalTemplate`, `StripeConnectStatus`
- Backfill drizzle tracker so `pnpm db:migrate` is a no-op
- Unit tests for pure helpers (signed token generation, status transition validation)

### Phase 1 — Stripe Connect Express onboarding (~1.5 days)

- New env vars: `STRIPE_CONNECT_CLIENT_ID`, `STRIPE_CONNECT_WEBHOOK_SECRET`
- `/proposals/onboarding` page
- `POST /api/v1/proposals/connect/start` → creates Stripe Connect Account, returns onboarding URL
- `GET /api/v1/proposals/connect/return` → handles return URL, syncs account status
- Persist `agency_profile.stripeConnect.{ accountId, chargesEnabled, payoutsEnabled }`
- Unit tests with mocked Stripe SDK

### Phase 2 — Proposal creation (~1.5 days)

- `POST /api/v1/proposals` endpoint
- Soul extraction from prospect URL (reuse existing extractor)
- Preview workspace provisioning (reuse existing `createFullWorkspace` from /clients/new)
  - **Modify**: add `status: 'preview'` flag that limits the workspace's surfaces (no agent runs, no billing) until activated
- Claude proposal-HTML generator (new lib/proposals/generate.ts)
  - System prompt: agency.soul + agency.proposalTemplate + prospect.soul
  - Output: HTML with embedded slots for preview iframe + screenshots
- Insert `proposals` row + log `proposal_events` 'created'
- Unit tests for the prompt builder + a snapshot test for generated HTML structure

### Phase 3 — Operator review + edit surface (~1 day)

- `/proposals` list page (similar shape to /clients page after Task 22's redesign)
- `/proposals/[id]` page with:
  - Live HTML preview (server-rendered)
  - Inline editors for scope_items, monthly_price_cents
  - Send button (validates Stripe onboarded)
- Server actions for update + send
- Status pill rendering (draft / sent / viewed / accepted / declined / expired)

### Phase 4 — Public proposal page (~1 day)

- `/p/[signed_token]` public route (no auth)
- Token validation + rate limiting
- Render the proposal's `generated_html` with:
  - iframe of `<preview_workspace>.app.seldonframe.com/book/<bookingSlug>`
  - Screenshot grid (regenerate per workspace on first proposal creation, cache)
  - Big "Accept & start" button → `/p/[token]/accept`
- Track view via `proposal_events 'viewed'` + update first_viewed_at
- Decline flow: `/p/[token]/decline` with optional reason text

### Phase 5 — Acceptance + Stripe Checkout (~1.5 days)

- `POST /api/v1/proposals/[id]/accept` (public, token-verified, no auth)
- Create Stripe Checkout session on agency's connected account:
  - `mode: 'subscription'`
  - `line_items: [{ price_data: { unit_amount, recurring: { interval: 'month' } } }]`
  - Idempotency key from proposal_id
- Redirect prospect to `session.url`
- `/p/[token]/success` page (after Checkout)
- `/p/[token]/cancel` page (Checkout abandoned)

### Phase 6 — Stripe Connect webhook + workspace activation (~1 day)

- `POST /api/webhooks/stripe/connect` endpoint
- Webhook signature verification (Connect endpoint secret)
- Handle `checkout.session.completed`:
  - Update proposal: `status='accepted'`, `stripe_subscription_id`, `stripe_customer_id`
  - Flip preview workspace: `status='active'`
  - Transfer workspace ownership (or invite prospect as primary user)
  - Send agency notification email
  - Send prospect onboarding email with portal link
- Handle `customer.subscription.deleted` (cancellation): mark proposal status, notify agency
- Idempotent via `proposal_events` natural keys

### Phase 7 — Per-agency template editor (~1 day)

- `/proposals/template` page (operator-editable)
- Fields: subject, introCopy, scopeCopy, timelineCopy, termsCopy
- Live preview pane (mirrors `/automations/[id]/configure` live preview from RunContext Phase 7.2)
- Save → write to `agency_profile.proposalTemplate`
- Defaults shipped with the platform if operator hasn't edited

### Phase 8 — Lead-to-Workspace one-click (~0.5 day, mostly wiring)

The "already 80% built" piece. Wire the existing `/clients/new` flow to accept a `?source=proposal` query param + skip the operator-facing onboarding screen when the workspace is being provisioned in proposal-preview mode. Effectively: the proposal-creation flow auto-creates the workspace; the agency operator doesn't manually paste the URL twice.

### Phase 9 — Tests + rollout (~1 day)

- Integration test: full flow from `POST /api/v1/proposals` → email send → public view → Stripe Checkout (mocked) → webhook fired → workspace activated
- E2E smoke: operator dogfoods on a real prospect (their own personal email)
- Rollout doc: `docs/architecture/proposal-builder.md`
- Migration backfill instructions for existing agency_profile rows

**Total: ~10 days end-to-end.**

## Migration risk + rollback

| Risk | Likelihood | Mitigation |
|---|---|---|
| Stripe Connect Express account creation fails for operator's region | Medium | Stripe Connect supports 45+ countries; surface clear error message with the country list. v1 US/CA/UK/EU only. |
| Webhook signature verification breaks on signing-key rotation | Low | Document the env var; surface health check on `/proposals/onboarding` dashboard. |
| Preview workspace provisioning fails mid-proposal | Medium | Wrap in try/catch; if workspace provisioning fails, proposal still creates but `preview_workspace_id` is null. Operator sees a warning + can retry. |
| Prospect accepts but checkout webhook is delayed | Low | Stripe guarantees webhook delivery within seconds. Idempotent handler means duplicate webhooks are safe. |
| Proposal email lands in spam | Medium | Use agency's verified Resend sender + their domain (already wired in existing email infra). |
| Multiple operators on the same agency send conflicting proposals to the same prospect | Low | Per-agency uniqueness check on `(agency_org_id, prospect_email, status IN ('sent','viewed'))`. Block duplicate sends. |
| Migration 0049 fails on prod | Low | `CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS` for the JSONB extension. Rolling back is a `DROP TABLE`. |
| Stripe Connect dashboard balance owed not paid | n/a | We don't take a cut — there's no balance to pay. |

Rollback path: feature-flag the proposal builder via a env var; if any phase breaks, set `PROPOSAL_BUILDER_ENABLED=false` and the UI surfaces stay hidden until we fix forward.

## Operator-facing surfaces summary

| Page | Purpose |
|---|---|
| `/proposals/onboarding` | Stripe Connect onboarding + proposal template setup (one-time) |
| `/proposals/template` | Edit per-agency proposal copy (subject, intro, scope, timeline, terms) — live preview |
| `/proposals` | List of all proposals with status pills + filters (draft / sent / viewed / accepted / declined) |
| `/proposals/new` | Create new proposal: paste prospect URL, pick pricing tier, click Generate |
| `/proposals/[id]` | Review + edit a proposal before sending. Inline scope item editor. Send button. |
| `/proposals/[id]/preview` | Operator-facing preview of what the prospect will see (= `/p/[token]` but with edit chrome) |

## Public surfaces summary

| Route | Purpose |
|---|---|
| `/p/[signed_token]` | The proposal itself. Prospect views, clicks Accept or Decline. |
| `/p/[signed_token]/accept` | Server action: creates Stripe Checkout, redirects to session.url |
| `/p/[signed_token]/decline` | Server action: marks declined, optional reason text |
| `/p/[signed_token]/success` | Post-Checkout success page with portal link |
| `/p/[signed_token]/cancel` | Post-Checkout abandon page |

## What this architecture deliberately does NOT do

- **No SeldonFrame revenue cut** on agency billings. Revenue model = agency pays $99/mo Scale subscription for the Proposal Builder feature; that's it.
- **No in-platform negotiation/redlining**. v1 is "send a proposal, prospect accepts or declines." Custom contract terms = operator handles offline.
- **No multi-currency in v1**. USD only. CAD/EUR/GBP queued for v1.1.
- **No annual prepay or net-30 invoicing**. Monthly recurring only via Stripe Billing.
- **No marketplace of agency templates**. Each agency edits their own. A community template library is queued for v1.2.

## Open questions for review

1. **Connect Express vs Standard**: Express is what I propose because the operator does brief Stripe-hosted onboarding and we manage the API. Standard means the agency creates a fully separate Stripe account and connects via OAuth — more setup for the agency but they own the account entirely. **Lean Express** for v1 (lower friction); revisit Standard if agencies push back.

2. **Preview workspace lifetime when proposal is never accepted**: workspaces accumulate as agencies send proposals. Suggest a 30-day TTL — if `status='preview'` and `proposals.created_at < NOW() - 30d` with no acceptance, auto-archive the workspace. Operator can re-provision if needed.

3. **Decline reasons**: capture as freetext in `proposals.declined_reason TEXT NULL`? Lean yes — useful audit signal for the agency operator.

4. **Email rate-limiting**: cap proposals per agency per day to prevent abuse / spam complaints? Suggest 50/day on Scale tier, 10/day on Growth. Soft-fail at the cap with a clear message ("you've hit your daily proposal limit; resume tomorrow").

5. **Pricing tier enforcement**: should Growth tier ($29/mo) include the Proposal Builder at all, or is it Scale-only ($99/mo)? Spawnly bundles their core features at $39/mo. SeldonFrame's $29/mo Growth covers 3 workspaces + agents — adding Proposal Builder at that tier might be the kill move. **Lean: include in Growth with a 10-proposal/mo cap; unlimited on Scale.**

## Sign-off

Once approved, I'll convert this spec into a step-by-step implementation plan via `superpowers:writing-plans` and execute via `superpowers:subagent-driven-development` (one subagent per task, two-stage review per task — spec compliance + code quality).

Estimated 10 days end-to-end. Phases 0-2 (schema + Stripe Connect + proposal creation) are foundational. Phases 3-8 layer the operator + prospect surfaces. Phase 9 ships it.
