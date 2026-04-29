# Operator Journey Audit — pre-launch state of the world

**Branch:** `claude/operator-journey-audit`
**Audit date:** 2026-04-28
**Scope:** What an operator actually experiences after `create_workspace` and the admin-token paste, end-to-end across CRM / settings / billing / domains / branding / portal / agents / extensibility.
**Methodology:** 8 parallel codebase explorations, no live HTTP probing, no behavior-changing edits.

---

## Summary table

| # | Area | State | Launch Priority | Effort | Why |
|---|------|-------|-----------------|--------|-----|
| 1 | CRM functionality | **Partially works** | **P0** | 1–1.5 days | Intake submissions completely invisible to operators (data lands in `intake_submissions`, no UI surfaces it; no contact auto-creation either). Bookings flow is solid. |
| 2 | Settings + integrations | **Mostly works** | **P0** for timezone, **P1** for rest | 1–2 days | 9/10 pages exist, AES-256-GCM encryption is solid. Missing: timezone UI (operators stuck on UTC), API-key generate/revoke UI, account/password page. Two storage layers (`organizations.integrations` JSONB vs `workspace_secrets` table) — inconsistent. |
| 3 | Stripe billing | **Works for signed-up users; broken for guest workspaces** | **P0** | 0.5 day | Pricing IDs wired, webhook works, plan-gate works for real users. **But admin-token guest workspaces (the C6 bearer-token path) cannot upgrade — checkout endpoint 401s because the synthetic nil-UUID user isn't in `users`. The first thing the operator wants to do (pay) doesn't work.** |
| 4 | Custom domain | **UI works, MCP broken** | **P1** | 2–3 hrs | `/settings/domain` page is complete + Vercel API integration works. `connect_custom_domain` MCP tool 404s — points at a non-existent `/api/v1/domains/connect` route. |
| 5 | White-labeling | **Half-built (wrapping badge only)** | **P0 if marketed as paid-tier feature** | 0.5 day | `PoweredByBadge` component conditionally hides for paid tiers ✓. But renderers (`general-service-v1`, `calcom-month-v1`, `formbricks-stack-v1`) hardcode "Powered by SeldonFrame" into the rendered HTML footer. Paying customers still see the text in their rendered page. |
| 6 | Client portal magic links | **Implemented, MCP wrapper missing** | **P2** unless promised | 2–3 hrs | Full magic-link infra + scoped portal routes ship. `/api/v1/portal/invite` endpoint exists. No `send_portal_link` MCP tool. |
| 7 | Agents / automations | **Real but operator-constrained** | **P1 messaging only** | 0 dev / 1 day copy | Workflow runs UI + approval gates + 6 pre-built archetypes (Speed-to-Lead, Win-Back, etc.) ALL functional. **No archetype-editor UI** — operators toggle pre-built ones, can't author new ones from the dashboard. |
| 8 | Block scaffolding | **Tool stubs only — pre-alpha for visual integration** | **P2** (don't market as "build via LLM") | post-launch | `pnpm scaffold:block` produces BLOCK.md + tools.ts stubs. New blocks DO NOT inherit blueprint visual language. Vertical-pack synthesis produces JSON metadata, not UI code. Marketplace "build a block in a sentence" claim would overpromise. |

**P0 blockers count:** 4 (CRM intake-submissions, Settings timezone, Stripe guest-upgrade, White-label rendered HTML)
**Total P0 effort:** ~3 days
**Total launch-week (P0+P1) effort:** ~5–6 days

---

## 1. CRM functionality

### State: Partially works

### What works
- **`/dashboard`** — `src/app/(dashboard)/dashboard/page.tsx` (1,295 lines) — real DB-backed widgets, no mock data. KPI cards, deals kanban embed, revenue flow chart, lead-source donut, upcoming sessions, top deals table.
- **`/contacts`** — list view with search/filter/sort + `[id]/page.tsx` detail page (profile, custom fields, activity timeline, email-template send form). `/contacts/new` create route exists.
- **`/deals`** — list + `/deals/pipeline` kanban with drag-drop, stage colors from pipeline schema, value-by-stage chart, filter by value range.
- **`/bookings`** — appointment-types list + scheduled-bookings list + create form + Google Calendar connect.
- **`/activities`** — log + table view, real `listActivities()` data.
- **Booking → contact auto-create** — `submitPublicBookingAction` in `lib/bookings/actions.ts:27-42` creates contact if email is new, sets `status: "lead"`, `source: "booking"`, emits `contact.created` event. Solid.

### What's broken / missing (P0)
- **🔴 Intake submissions are invisible.** `/api/v1/public/intake` writes to `intake_submissions` table, but **no dashboard UI lists them.** A customer fills out a form → operator never knows. The form-detail page `/forms/[id]/page.tsx` is a stub showing only name + field count.
- **🔴 Intake → no contact auto-create.** Bookings get this; intake doesn't. Operator can't see submissions and can't even fall back to the contacts list.
- 🟡 No inline create/edit/delete UI for contacts (must navigate to `/contacts/new`). No bulk operations.
- 🟡 Bookings list has no detail / reschedule / cancel UI from this page.

### Files involved
- `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/(dashboard)/contacts/page.tsx`, `[id]/page.tsx`, `[id]/edit/page.tsx`
- `src/app/(dashboard)/deals/page.tsx`, `pipeline/page.tsx`
- `src/app/(dashboard)/bookings/page.tsx`
- `src/app/(dashboard)/forms/[id]/page.tsx` ← stub
- `src/app/api/v1/public/intake/route.ts` ← writes submission, doesn't create contact
- `src/lib/bookings/actions.ts:27-42` ← good auto-create reference for intake to copy

### Operator experience today
> Customer submits intake form → confirmation page renders → operator gets zero feedback (no email, no dashboard entry, no contact). They'd assume the form is broken. **This is exactly the kind of bug that kills first-week activation.**

### Launch priority: **P0**
### Effort: **1–1.5 days** (build intake-submissions inbox + contact auto-create)

---

## 2. Settings + integrations panel

### State: Mostly works

### What works (this is the strong part)
- **`/settings/profile`** — name, industry, description, offer type, custom context. Server action persists to `organizations.soul`.
- **`/settings/theme`** — color pickers, font selector, mode toggle. Persists to `organizations.theme`.
- **`/settings/integrations`** — Twilio, Resend, Kit/Mailchimp/Beehiiv, Google Calendar. All use **AES-256-GCM encryption** with random per-value IV + auth tag (`lib/encryption.ts`).
- **`/settings/payments`** — Stripe Connect OAuth (operator's own Stripe for collecting payments).
- **`/settings/billing`** — current plan, trial state, "Manage subscription" → Stripe portal.
- **`/settings/domain`** — full custom-domain UI (Vercel API integration ships, see §4).
- **`/settings/webhooks`**, **`/settings/test-mode`**, **`/settings/team`** — all built.
- **MCP tools `store_secret` / `list_secrets` / `rotate_secret`** wrap a thin REST API; encrypt on insert, decrypt on read, list returns metadata only.

### What's broken / missing
- **🔴 P0 — No timezone UI.** `organizations.timezone` column exists (default `UTC`), drives scheduled-trigger fire times, but **there's no settings page to change it.** Scheduled automations + business hours computation will be wrong for every workspace outside UTC.
- **🔴 P0 — No account settings.** `/settings/team` is read-only. Real signed-up users can't change password or set up MFA. Admin-token operators don't have user accounts at all. Account recovery flow doesn't exist.
- **🔴 P0 — `/settings/api` lists API keys but has no Generate / Revoke buttons.** Operators can't mint a `SELDONFRAME_API_KEY` from the UI.
- 🟡 **No Anthropic BYOK.** `ANTHROPIC_API_KEY` is server-side env only. If launch positioning includes "your own LLM key for cost control" — no UI for it.
- 🟡 **Two storage layers.** New `workspace_secrets` table (`lib/secrets.ts`) supports encryption + key rotation + audit trail, but settings UI still writes to `organizations.integrations` JSONB. Migration unclear; key rotation impossible for existing integrations.

### Files involved
- `src/app/(dashboard)/settings/*/page.tsx` (10 sub-pages)
- `src/lib/encryption.ts` — AES-256-GCM (read this — security is genuinely good)
- `src/lib/secrets.ts` — workspace_secrets handlers
- `src/db/schema/workspace-secrets.ts`
- `src/db/schema/organizations.ts` (the `integrations` JSONB)

### Launch priority: **P0** for timezone + account settings + API-key UI; **P1** for the rest
### Effort: **1–2 days** combined

---

## 3. Stripe billing + upgrade flow

### State: Works for signed-up users; broken for guest workspaces

### What works
- **All three target price IDs are wired** in `lib/billing/plans.ts:28,46,64`:
  - `price_1TQzh7JOtNZA0x7xLOTicHkW` ($49 Cloud Starter)
  - `price_1TNY81JOtNZA0x7xsulCSP6x` ($99 Cloud Pro)
  - `price_1TQzjrJOtNZA0x7xV4UFxWrH` ($149 Pro 3)
- **`/pricing` (public)** — 4-tier grid, CTAs route to `/settings/billing` or `/signup`.
- **`/settings/billing` (in-app)** — current plan, "Manage subscription" → Stripe portal session.
- **Checkout endpoint** `src/app/api/stripe/checkout/route.ts` validates auth + price-ID allowlist + creates `mode: "subscription"` session.
- **Webhook handler** `src/app/api/stripe/webhook/route.ts` handles `checkout.session.completed`, `customer.subscription.updated/deleted`, `invoice.payment_failed/paid`. Updates both `organizations.plan` + `organizations.subscription` JSONB.
- **Plan-gate** `src/middleware/plan-gate.ts` redirects unpaid to `/pricing`, sets read-only on canceled. (Already touched in C6 to skip for admin-token sessions.)
- **Entitlements** `lib/billing/entitlements.ts` — `canInstallBlocks`, `canSeldonIt`, `canRemoveBranding` per plan.

### What's broken
- **🔴 P0 — Admin-token guest workspaces cannot upgrade.** This is the worst bug surfaced.

  Trace:
  1. Operator runs `create_workspace` via MCP → gets bearer token
  2. Pastes admin URL → lands on `/dashboard` via the synthetic nil-UUID user (per C6)
  3. Clicks "Manage subscription" on `/settings/billing` → POST to `/api/stripe/checkout`
  4. **Route lookup at line 112-124 does `SELECT id, email, orgId FROM users WHERE id = '00000000-…'`**
  5. Sentinel UUID isn't in `users` table → returns `undefined`
  6. Returns **401 Unauthorized**
  
  Net: the workspace creation flow is "no signup needed" but the upgrade flow demands signup. The pitch breaks at the point of payment.

### Files involved
- `src/lib/billing/plans.ts:28,46,64` — price IDs
- `src/lib/billing/price-ids.ts` — checkout-specific IDs
- `src/app/pricing/page.tsx` + `src/app/(dashboard)/settings/billing/page.tsx`
- `src/app/api/stripe/checkout/route.ts:112-124` ← **the 401 origin**
- `src/app/api/stripe/webhook/route.ts`
- `src/middleware/plan-gate.ts`
- `src/lib/billing/entitlements.ts`
- `src/lib/billing/orgs.ts:277` — `listManagedOrganizations` returns `[]` for sentinel user (related issue)

### Operator experience today
> "I want to upgrade to keep this workspace alive past my free quota → click Manage Subscription → 401. I have no idea how to fix this."

### Fix shape (for budgeting)
- Detect admin-token session in `/api/stripe/checkout` (cookie present + nil UUID)
- Resolve target org via `sf_active_org_id` cookie instead of `users` table
- Use org's `ownerId` (or create a fresh user if none) to associate the Stripe customer
- Or: prompt admin-token operators to "claim this workspace" via signup before checkout (UX tax but simpler)

### Launch priority: **P0**
### Effort: **0.5–1 day**

---

## 4. Custom domain support

### State: UI fully works, MCP tool 404s

### What works
- **`/settings/domain`** — full UI: domain input, "Check Status", "Remove Domain", DNS instructions (CNAME → cname.vercel-dns.com), real-time verification state.
- **`UpgradeGate`** — feature gated to `cloud` tier (`features.customDomains: true`).
- **Vercel API integration** — `lib/domains/vercel-domains.ts` calls `POST /v10/projects/{id}/domains` (add), `GET /v10/projects/{id}/domains/{domain}` + `GET /v6/domains/{domain}/config` (verify), DELETE (remove). Requires `VERCEL_API_TOKEN` + `VERCEL_PROJECT_ID` env.
- **DB storage** — `organizations.settings.customDomain` + `domainVerified` + `domainStatus`.
- **Routing** — `src/proxy.ts:317-392` calls `/api/v1/public/domain?host={host}` per request to resolve custom domains → workspace slug.
- **Plan gating** — only `cloud` tier+ shows the form.

### What's broken
- **🟡 P1 — `connect_custom_domain` MCP tool 404s.** `skills/mcp-server/src/tools.js:501-522` posts to `/api/v1/domains/connect` — **that route doesn't exist.** The action handler `saveCustomDomainAction` exists in `lib/domains/actions.ts:159-288` but is only wired to the form server action, not an HTTP route.
  - Risk: operators trying to set up a domain via Claude Code see an opaque 404. Fine if launch positioning is "configure domains in the dashboard"; broken if "tell Claude to connect your domain".

### Files involved
- `src/app/(dashboard)/settings/domain/page.tsx`
- `src/lib/domains/actions.ts:159-288` — action handler
- `src/lib/domains/vercel-domains.ts` — Vercel SDK wrapper
- `src/app/api/v1/public/domain/route.ts` — host → org lookup
- `src/proxy.ts:317-392` — middleware host resolution
- `skills/mcp-server/src/tools.js:501-522` — broken tool
- **MISSING:** `src/app/api/v1/domains/connect/route.ts`

### Launch priority: **P1**
### Effort: **2–3 hours** (write the missing route handler — copy from `saveCustomDomainAction`)

---

## 5. White-labeling

### State: Half-built — paying customers still see "Powered by" in their rendered HTML

### What works
- `PoweredByBadge` component (`packages/core/src/virality/powered-by-badge.tsx`) — renders `null` when `removeBranding: true`.
- `shouldShowPoweredByBadgeForOrg(orgId)` (`lib/billing/public.ts`) — checks plan tier via `canRemoveBranding(plan)` from entitlements.
- Cloud Pro ($99) and Pro 3 ($149) have `removeBranding: true`; Cloud Starter ($49) doesn't.
- Public pages (`/s/<slug>/<page>`, `/book/...`, `/forms/...`) consult this and hide the wrapping badge on paid tiers.

### What's broken
- **🔴 The blueprint renderers ALL hardcode "Powered by SeldonFrame" into the rendered HTML.** All three:
  - `general-service-v1.ts:795` (footer)
  - `calcom-month-v1.ts:472` (footer)
  - `formbricks-stack-v1.ts:420` (footer)
- **The Blueprint type doesn't carry a `removeBranding` flag.** Renderers take a `Blueprint` and have no plan/entitlement context. They always emit the text.
- **No re-render trigger on upgrade.** Even if we added a flag, when a workspace upgrades to $99:
  1. Webhook fires, `subscription.tier = "pro"`, `canRemoveBranding(pro) = true`
  2. Wrapping `PoweredByBadge` hides ✓
  3. **But the rendered HTML stored in `landing_pages.contentHtml` (and now `bookings.contentHtml` + `intake_forms.contentHtml`) still has the text** — no code re-renders the blueprint after upgrade.

### Net experience for a paying customer
> Pay $99/mo for "remove SeldonFrame branding" → wrapping badge disappears, but the footer of every public page still says "Powered by SeldonFrame". Looks like the upgrade didn't apply. **Refund risk.**

### Files involved
- `packages/core/src/virality/powered-by-badge.tsx`
- `src/lib/billing/public.ts` — `shouldShowPoweredByBadgeForOrg`
- `src/lib/billing/entitlements.ts` — `canRemoveBranding`
- `src/lib/blueprint/renderers/general-service-v1.ts:795`
- `src/lib/blueprint/renderers/calcom-month-v1.ts:472`
- `src/lib/blueprint/renderers/formbricks-stack-v1.ts:420`
- `src/lib/blueprint/types.ts:324` — `Blueprint` interface (needs `branding?: { removePoweredBy?: boolean }`)

### Fix shape
1. Add `branding.removePoweredBy?: boolean` to `Blueprint.workspace` (or new `Blueprint.branding`)
2. Each renderer's `renderFooter` checks the flag and skips the powered-by element
3. On Stripe webhook → `customer.subscription.updated` → if `canRemoveBranding(newPlan) !== canRemoveBranding(oldPlan)`: load every blueprint-rendered surface (`landing_pages` + `bookings` + `intake_forms` for the org), mutate the flag, re-render via existing `renderBlueprint` / `renderCalcomMonthV1` / `renderFormbricksStackV1`, save.

### Launch priority: **P0** (if "white-label" is in the $99 tier's marketed feature list)
### Effort: **0.5 day**

---

## 6. Client portal access (magic links)

### State: Implemented, MCP wrapper missing

### What works (more than I expected)
- **Magic-link infra** — `src/lib/auth/magic-link.ts` (generic, used for NextAuth sign-in) + `src/lib/portal/auth.ts` (dedicated portal auth, dual-layer):
  - **OTC flow** — 6-digit codes via `portalAccessCodes` table, 15-min TTL → mints 7-day JWT
  - **Programmatic magic-link** — `createPortalMagicLink(orgSlug, contactId)` returns invite URL + token + expiry
- **Workflow approval magic links** — `workflow_approvals.magicLinkTokenHash` + `/api/v1/approvals/magic-link/[token]/resolve/route.ts`
- **Client portal routes**:
  - `/portal/[orgSlug]/login` — OTC entry
  - `/portal/[orgSlug]/magic?token=...` — magic-link claim
  - `/portal/[orgSlug]/(client)/page.tsx` — overview
  - `/portal/[orgSlug]/(client)/messages/page.tsx` — message threads
  - `/portal/[orgSlug]/(client)/resources/page.tsx` — shared resources
- **Scoped data access** — `listPortalMessages` filters by `orgId AND contactId = session.contact.id`. Clients see only their own data.
- **Operator-side API** — `POST /api/v1/portal/invite` mints a magic link for an operator-supplied contact. Gated by `assertSelfServiceEnabled(workspace)`.

### What's missing
- **🟡 No `send_portal_link` MCP tool.** Operator can hit `/api/v1/portal/invite` directly but Claude Code has no wrapper. Trivial to add (2-3 hrs).
- **🟡 No auto-send of invite emails.** API returns the URL; operator must paste it themselves into their own email/SMS to the client. Could be wired through the existing Resend integration.

### Files involved
- `src/lib/auth/magic-link.ts`
- `src/lib/portal/auth.ts` (278 LOC — dedicated portal auth)
- `src/app/portal/[orgSlug]/...` (routes)
- `src/app/api/v1/portal/invite/route.ts`
- `src/app/api/v1/approvals/magic-link/[token]/resolve/route.ts`
- `src/db/schema/workflow-approvals.ts:128-129,155` — magic-link columns + index

### Launch priority
- **P2** if portal isn't mentioned in launch marketing
- **P1** if marketing copy includes "give your clients a portal"

### Effort: **2–3 hours** for the MCP tool wrapper

---

## 7. Agent / automation features

### State: Real but operator-constrained

### What works
- **`/agents/runs`** — server-rendered table of workflow runs, polls every 2s for live updates. Shows step-level outcomes, durations, cost (input/output tokens, USD estimate). Drawer for step trace inspection. Approval-resolution UI inline.
- **`/automations`** — Soul-aware automation suggestions per industry framework (coaching/agency/SaaS). Toggle UI per automation ID, persisted to `org.settings.enabledAutomations`. Links to integration prerequisites.
- **Workflow tables** — `workflow_runs`, `workflow_waits`, `workflow_step_results`, `workflow_approvals` all populated. Cost observability + wait events + approval gates all functional.
- **Approval gates (SLICE 10)** — `/api/v1/approvals/[approvalId]/resolve` works end-to-end. Magic-link path also live. UI in `runs-client.tsx` shows approver context, timeout behavior, approve/reject buttons gated to correct identity.
- **Pre-built archetypes (6)** — `speed-to-lead`, `win-back`, `review-requester`, `daily-digest`, `weather-aware-booking`, `appointment-confirm-sms`. All in `lib/agents/archetypes/`. Production-ready.
- **`.agent` export** — `lib/ai/export-workspace-as-agent.ts` produces a zipped directory (memory/episodic, semantic wiki, skills/blocks, SOUL.md, protocols).

### What's missing / aspirational
- **🟡 No archetype editor UI.** Operators can toggle pre-built archetypes via `/automations` but cannot author or edit one from the dashboard. Synthesis happens server-side via Claude in response to NL prompts; no exposed builder.
- **🟡 `list_automations` MCP tool not implemented.** No API route. Client reads frameworks directly. (Tool exists in `tools.js` but the route is missing — same shape as the custom-domain bug.)
- **🟡 `.agent` import is a stub** (`lib/ai/export-workspace-as-agent.ts:549` — "not implemented yet").

### Marketing risk
**The "agent" pitch has to match what's actually built**:
- ✓ "6 production-ready automations: Speed-to-Lead, Win-Back, Review Requester, Daily Digest, Weather-Aware Booking, Appointment Confirm" → true and ships
- ✓ "Live observability: every workflow run, every step, every cost" → true and ships
- ✓ "Approval gates: hold any automation step for human review via dashboard or magic-link email" → true and ships
- ✗ "Build your own agent in plain English from the dashboard" → **not built** — the synthesis happens via Claude Code (MCP) but there's no in-dashboard builder
- ✗ "Edit any archetype yourself" → not built

### Files involved
- `src/app/(dashboard)/agents/runs/page.tsx` + `runs-client.tsx`
- `src/app/(dashboard)/automations/page.tsx`
- `src/app/api/v1/approvals/[approvalId]/resolve/route.ts`
- `src/app/api/v1/approvals/magic-link/[token]/resolve/route.ts`
- `src/lib/agents/archetypes/index.ts` + JSON specs
- `src/db/schema/workflow-runs.ts`, `workflow-approvals.ts`, etc.

### Launch priority
- **P1 messaging** — adjust marketing copy to emphasize the shipped archetype library + observability, NOT "build your own agent"
- **P2** for archetype-editor UI (post-launch)

### Effort: **0 dev / ~1 day messaging review**

---

## 8. Block scaffolding

### State: Soft-launch ready (works for developers, pre-alpha for marketing)

### What works
- **`pnpm scaffold:block`** — `scripts/scaffold-block.impl.ts` produces:
  - `<id>.block.md` (manifest + composition contract)
  - `<id>.tools.ts` (Zod schemas, mock returns, TODO markers)
- **AI-driven generation** — `lib/ai/generate-block.ts` turns a description into a BLOCK.md spec via Claude.
- **Vertical-pack synthesis** — `/api/v1/verticals/generate` produces a strict JSON `VerticalPack` schema (objects, relations, views, permissions, workflows) validated against 9 hard rules. One built-in pack (`real-estate-agency`) proves the contract.
- **Block registry** — `lib/blocks/registry.ts` + `packages/core/src/blocks/registry.ts` — `BUILT_IN_BLOCKS` array (9 entries) + `enabledBlocks` array on organizations.

### What's broken / what scaffolded blocks can't do
- **New blocks DO NOT inherit blueprint visual language.** The Blueprint type covers landing/booking/intake/admin only. A scaffolded `/quotes` page would be a plain Tailwind page disconnected from Cal Sans / sf-frame / `--sf-accent` unless the developer manually wires `useTheme()` and reproduces the styling.
- **Scaffolded tools are stubs.** Output has TODO markers. Developer must:
  1. Write the actual tool handler logic
  2. Add the route under `app/(dashboard)/<block>/`
  3. Manually theme it
  4. Edit `BUILT_IN_BLOCKS` array (no dynamic registration)
  5. Add sidebar nav entry (sidebar is hardcoded)
  6. Write DB migrations if needed
- **Vertical-pack synthesis produces JSON metadata, not code.** It's stored in `organizations.settings.verticalPacks`. No DDL, no UI generation. Operator never sees a "real estate" workspace look different from a "general" one — just the schema metadata is there.

### What a developer actually gets today
> Run `pnpm scaffold:block --spec quote-block.json` → get two files (BLOCK.md + tools.ts). Then spend ~1-2 hours wiring routes, theme tokens, sidebar nav, server actions, schema. The block exists in the registry but doesn't auto-render anywhere.

### Marketing risk
**"Build a block in a sentence" would dramatically overpromise.** What's true:
- ✓ "Vertical packs are AI-synthesized from one prompt" → true (JSON metadata)
- ✓ "Pre-built blocks ship with the platform" → true (caldiy-booking, formbricks-intake, hvac-service-calls, real-estate, dental, legal in template form)
- ✗ "New blocks render in the same visual language automatically" → **not yet**
- ✗ "Block scaffolder produces production-ready UI" → not yet

### Files involved
- `scripts/scaffold-block.impl.ts` — CLI
- `src/lib/ai/generate-block.ts` — LLM-driven BLOCK.md generation
- `src/app/api/v1/verticals/generate/route.ts` — pack synthesis
- `src/lib/openclaw/vertical-packs.ts` — pack schema validation
- `src/blocks/*/BLOCK.md` + `*.tools.ts` — existing patterns
- `src/lib/blocks/registry.ts` + `packages/core/src/blocks/registry.ts`
- `src/lib/blueprint/types.ts:324` — Blueprint covers 5 surfaces only

### Launch priority: **P2** (post-launch polish; marketing should de-emphasize "build a block via LLM" until visual integration ships)
### Effort: **post-launch milestone** (block-renderer pattern parallel to general-service-v1, plus dynamic registry — multi-week)

---

## Recommended launch sequence

If shipping in 1 week:

**Day 1 (P0 cluster):**
- Fix Stripe checkout for admin-token sessions (~0.5 day) — operator can pay
- Add Powered-by removal flag through blueprint renderers + re-render trigger on upgrade (~0.5 day)
- Build intake-submissions inbox UI + contact auto-create on intake submit (~1 day, possibly overflow to Day 2)

**Day 2 (more P0):**
- Add `/settings/timezone` UI (~0.25 day) — operators on non-UTC time zones don't get broken automations
- Account / password / API-key generate UIs (~0.5 day)
- Spot-check: trigger a real test from `create_workspace` to `/dashboard` to upgrade to white-labeled paid tier — full E2E

**Day 3 (P1 cluster):**
- Add missing `/api/v1/domains/connect` route for the MCP tool (~2 hrs)
- `send_portal_link` MCP tool wrapper (~2 hrs)
- Marketing copy review: messaging on agents (emphasize shipped library) + block scaffolding (de-emphasize "build via LLM")

**Day 4 (P1/P2 polish):**
- `list_automations` MCP route (~2 hrs)
- Secret-storage migration plan (move integrations from JSONB → `workspace_secrets`) — write the plan, defer execution

**Day 5 (launch content rewrite):**
- Item #21 from the launch checklist — unified pass across all marketing surfaces, informed by what actually ships

**Day 6–7:** Demo video + announcement.

---

## What NOT to fix before launch

These are real gaps but launching with them is fine if marketing aligns:

- **No archetype-editor UI** — pre-built library is enough story for v1
- **No `.agent` import** — export-only is fine for v1
- **Block scaffolder visual integration** — internal/dev tool, not customer-facing
- **Two-tier secret storage migration** — works for now, fix in v1.1
- **`/settings/api` generate/revoke buttons** — operators with `claude mcp add` flow don't need a UI for this in week 1; can use `revoke_bearer` MCP

---

## What to test live before flipping launch

1. Fresh `create_workspace` → admin URL → dashboard renders ✓
2. Submit a test booking via `/book` → contact appears in `/contacts`, booking appears in `/bookings`
3. **Submit a test intake via `/intake` → submission visible in dashboard inbox** ← will fail today, must pass post-fix
4. **Click "Upgrade to $49" from `/settings/billing` on the admin-token session → Stripe checkout opens** ← will fail today (401)
5. Pay with a Stripe test card → webhook fires → plan updates → `/settings/billing` shows new plan
6. **On the upgraded workspace, refresh `/` → "Powered by SeldonFrame" is GONE from rendered HTML** ← will fail today
7. Operator changes timezone → scheduled trigger fires at correct local time
8. Add custom domain via `/settings/domain` → DNS instructions clear → domain verifies after CNAME → `crm.example.com` resolves to workspace

If all 8 pass → launch.
If any fail → block.
