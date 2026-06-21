# Deployment → Whitelabel Front Office Bridge — Design Spec (2026-06-21)

## Goal
A builder/agency deploys a voice agent; the agent's client automatically gets a **full, isolated, agency-branded SeldonFrame workspace** (the whitelabel front office: CRM + calendar + portal + landing + reviews + web chatbot). The voice agent becomes the **phone surface** of that client workspace, writing **all** of its output — bookings, leads/contacts, messages, transcripts — into the **client** org, not the builder's. The agency operates it; the client gets portal access on opt-in.

This is the keystone that unifies the already-shipped per-client persona + `bookingMode` calendar abstraction: once the agent writes to a real client workspace, "speak as the client" and "book into the client's own calendar (native + ICS-push)" become literally true.

## Approach (confirmed in brainstorm)
- **Provisioning = Model C:** every deployment **isolates** into its own client org from day one (no later data migration); the **client portal login is opt-in** (agency flips it on); the agency operates throughout.
- **The front office is a standard workspace** — reuse the existing workspace-creation pipeline, seeded from the **client context already captured** at deploy (name/services/FAQ/hours). We do **not** build a new "front office" surface.
- **Retarget scope = everything** — bookings + leads/contacts + messages + transcripts all land in the client org.
- **On cancel = archive** — the client workspace is archived (data kept; agency can reactivate / hand off), never deleted. The phone number is released (existing behavior).
- **Billing** — the client workspace is agency-managed (`parentAgencyId` set) and **folded into the deployment** (no separate per-client workspace subscription/charge).

## Architecture & data flow

### On deploy (provisioning)
1. The deploy flow (today: `createDeploymentAction` → `createDeployment`) creates the `deployments` row as it does now (builder-owned: number, agent, `clientContext`, `bookingMode`).
2. **New:** `provisionClientWorkspaceForDeployment(deps, deployment)`:
   - **Idempotent guard:** if `deployment.clientOrgId` is already set, no-op.
   - Call **`createFullWorkspace(input)`** (`lib/workspace/create-full.ts:187`) — the atomic core that the URL/paste flows use *after* extraction. It takes **structured** `CreateFullWorkspaceInput` (`business_name, city, state, phone, services[], business_description` + optional `email/address/weekly_hours/testimonials/...`) and synchronously creates org + soul + pipeline + booking-template + intake + landing-seed + theme, **skipping URL extraction/Firecrawl entirely** — exactly our case. Slug + collision are handled inside (`resolveUniqueSlug`).
   - **Map** `clientContext` + `deployment.clientContact` → `CreateFullWorkspaceInput`: `businessName→business_name`, `services→services`, `business_description` from the description, `phone/email/address` from `clientContact`, `weekly_hours` from the captured hours, FAQ → soul. Required `city/state/phone` that `clientContext` may lack → derive from `clientContact.address` or pass safe defaults (the mapper owns this).
   - **Attach to agency:** set `organizations.parentAgencyId = <builder's agency>` via a **store-level update** (not the user-facing `attachWorkspaceToAgency`, which is Scale-tier-gated + validates interactive ownership) — so it inherits agency branding. If the builder has **no** agency, leave unattached (SF-default branding) and attach later.
   - **Billing is a non-issue:** `createFullWorkspace` creates the org with `plan: "free"` and triggers **no Stripe charge** — free until an explicit upgrade. So "folded into the deployment" needs no special flag; it's free + agency-managed by default.
   - **Skip** the orchestrator-only steps (`markOperatorOnboarded`, operator linking). **Defer/best-effort async:** `createWebsiteChatbot` + `runR1LandingStep` (LLM landing enrichment) — non-fatal, never block go-live.
   - Persist `deployments.clientOrgId = <new org id>`.
   - **Sync vs async:** the org + soul + booking config + CRM are created **synchronously** (the agent must be able to write the moment the first call lands). The slow enrichment (landing page generation, web chatbot) is **best-effort / async** and never blocks the deployment going live.
3. The voice number provisioning (telephony 2.2) is unchanged.

### On call (retarget — the one load-bearing change)
- `loadDeploymentVoiceContext` currently sets `ctx.orgId = ctx.orgSlug = builderOrgId` and `transcriptOrgId = builderOrgId`. **New:** when `deployment.clientOrgId` is set, resolve the client org's id+slug and set `ctx.orgId/orgSlug` **and** `transcriptOrgId` to the **client** org. Fallback to `builderOrgId` when `clientOrgId` is null (legacy deployments — unchanged behavior).
- Because every agent write (booking via `ctx.orgSlug`, contact/lead via `ctx.orgId`, message/transcript via `transcriptOrgId`) keys off these fields, this single retarget routes **all** output to the client org. The persona (`clientContext`) and `bookingMode` already thread through the same function — they compose cleanly.

### Portal login (opt-in)
- A deployment-level flag (e.g. `deployments.portalInvitedAt` / a `portalAccess` boolean) + an action that sends the client a **magic-link** via the existing portal auth (`lib/portal/auth.ts`). Default off. The agency flips it on from the deployment's management UI when ready to hand the client a window.

### On cancel (archive)
- **Recon gap found:** `organizations` has **no** archive/paused/suspended/soft-delete column today (only `previewMode` + `plan`). So archiving needs a **new additive `organizations.archivedAt` timestamp** column + excluding archived orgs from active workspace lists/queries.
- `cancelDeploymentAction` (exists) gains: if `clientOrgId` is set, stamp `organizations.archivedAt = now` (data retained), in addition to releasing the provisioned number. `deployments.clientOrgId` is kept (reactivation path). Never delete.

## Components

**New:**
- `deployments.clientOrgId` (uuid, nullable, FK → organizations.id) + `organizations.archivedAt` (timestamp, nullable) — one additive migration.
- `deployments.portalInvitedAt` (timestamp, nullable) — portal opt-in state.
- `lib/deployments/provision-client-workspace.ts` — `provisionClientWorkspaceForDeployment(deps, deployment)`; idempotent; calls `createFullWorkspace` + store-level `parentAgencyId` attach; DI'd create + DB so it's unit-testable offline.
- `lib/deployments/client-workspace-seed.ts` — pure `clientContext (+ clientContact) → CreateFullWorkspaceInput` mapper (handles required `city/state/phone` defaults); TDD.
- Filter `archivedAt IS NULL` in active-workspace lists/queries.
- Portal-invite action + a toggle in the deployment management UI.

**Reused (already built — do NOT rebuild):**
- The workspace-creation pipeline (CRM + calendar + portal + landing + reviews + chatbot).
- `partner_agencies` + `parentAgencyId` + `getEffectiveBrandingForWorkspace` (agency white-label).
- The portal + magic-link auth.
- The per-client persona / `clientContext` (seeds the workspace).
- The `bookingMode` chooser (now naturally scoped to the client org).
- `cancelDeploymentAction` + number release (extend, don't replace).

## Confirmed decisions
- Model C (isolate always, portal opt-in). Retarget = everything. Cancel = archive. Billing folded into the deployment. Seed from `clientContext`. Essentials sync, enrichment async.

## Pipeline grounding (resolved 2026-06-21 recon of `/clients/new`)
- **§A — Entry point → RESOLVED.** `createFullWorkspace(input: CreateFullWorkspaceInput)` (`lib/workspace/create-full.ts:187`) is the atomic core; it takes structured input, skips extraction, and seeds org + soul + pipeline + booking + intake + landing + theme synchronously. We call it directly with a `clientContext`-derived input. (The `runCreateFromUrl/Paste` orchestrators wrap it with extraction + operator-onboarding + chatbot — steps we skip or defer.)
- **§B — Billing → RESOLVED (non-issue).** Org is created `plan: "free"`, no Stripe trigger. No special "not-billed" flag needed. Agency attach is a store-level `parentAgencyId` update (bypass the Scale-tier-gated interactive `attachWorkspaceToAgency`).
- **§C — Slug → RESOLVED.** `resolveUniqueSlug` (`billing/anonymous-workspace.ts:117`) slugifies the business name + handles reserved/collision with a UUID suffix, inside `createFullWorkspace`. Nothing to build.
- **§D — Archive → GAP FOUND, now in scope.** No archive status exists on `organizations`. Add an additive `organizations.archivedAt` timestamp + filter archived orgs from active lists (see On-cancel above).
- **Sync/slow note:** `createFullWorkspace` is ~200ms except personality resolution (LLM on cache-miss, with a keyword fallback) — acceptable for a deploy-time action (a few seconds; not on a live call's critical path). R1 landing enrichment + chatbot are the slow/deferred bits.

## Edge cases
- **Idempotency:** re-running provisioning (deploy retries) must not create duplicate orgs — guard on `clientOrgId`.
- **Provisioning failure:** if workspace creation fails, the deployment must still be creatable (voice can run, writing to `builderOrgId` as a fallback) and provisioning is retryable — soft-fail + a retry path, mirroring the number-provisioning state machine.
- **Legacy deployments (no `clientOrgId`):** unchanged — keep writing to `builderOrgId`. A backfill action to provision orgs for them is **deferred**.
- **Enrichment lag:** if a call lands before async landing/chatbot enrichment completes, the agent still works (it only needs the org + soul + booking, which are created sync).
- **Agency not registered:** if the builder has no `partner_agencies` row yet, either auto-register a default agency or create the client org unbranded + attachable later (decide in plan; lean: create unattached, attach when the agency exists).

## Testing approach
- Pure mapper (`clientContext → workspace seed`) — TDD.
- `provisionClientWorkspaceForDeployment` — unit test with DI'd create+DB: asserts idempotency (clientOrgId set → no-op), `parentAgencyId` set, `clientOrgId` persisted, soft-fail on create error.
- Retarget — bug-catch test on `loadDeploymentVoiceContext`: with `clientOrgId` set, `ctx.orgId/orgSlug` + `transcriptOrgId` = client org; without, = builderOrgId (unchanged).
- Cancel — archives the client org + keeps `clientOrgId`.
- Regression: workspace/operator + existing deployment flows unaffected; `tsc` 0 new; `check-use-server` clean; migration additive + journal-clean.

## Deferred / out of scope
- Backfill provisioning for existing deployments.
- Reactivation flow from an archived client workspace.
- Separate billing/tiering of client workspaces (folded into the deployment for now).
- Chat/web-deploy parity (deployed surface remains voice).
- BYO-OAuth-app real two-way calendar (its own arc) — native + ICS-push already cover the client calendar here.
