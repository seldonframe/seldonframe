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
2. **New:** `provisionClientWorkspaceForDeployment(deployment)`:
   - **Idempotent guard:** if `deployment.clientOrgId` is already set, no-op.
   - Create a **client `organizations` row** via the existing workspace-creation building blocks, **seeded from `clientContext`** (businessName → org name/slug + soul; services → services + booking appointment type; FAQ + hours → soul/booking config). No URL/extraction — the data is already structured.
   - Set `organizations.parentAgencyId = <builder's agency>` so the client workspace inherits agency branding automatically (logo/colors/sender-domain/custom-domain — all existing).
   - Mark the org **agency-managed / not-separately-billed** (plan/flag — see Recon §B).
   - Persist `deployments.clientOrgId = <new org id>`.
   - **Sync vs async:** the org + soul + booking config + CRM are created **synchronously** (the agent must be able to write the moment the first call lands). The slow enrichment (landing page generation, web chatbot) is **best-effort / async** and never blocks the deployment going live.
3. The voice number provisioning (telephony 2.2) is unchanged.

### On call (retarget — the one load-bearing change)
- `loadDeploymentVoiceContext` currently sets `ctx.orgId = ctx.orgSlug = builderOrgId` and `transcriptOrgId = builderOrgId`. **New:** when `deployment.clientOrgId` is set, resolve the client org's id+slug and set `ctx.orgId/orgSlug` **and** `transcriptOrgId` to the **client** org. Fallback to `builderOrgId` when `clientOrgId` is null (legacy deployments — unchanged behavior).
- Because every agent write (booking via `ctx.orgSlug`, contact/lead via `ctx.orgId`, message/transcript via `transcriptOrgId`) keys off these fields, this single retarget routes **all** output to the client org. The persona (`clientContext`) and `bookingMode` already thread through the same function — they compose cleanly.

### Portal login (opt-in)
- A deployment-level flag (e.g. `deployments.portalInvitedAt` / a `portalAccess` boolean) + an action that sends the client a **magic-link** via the existing portal auth (`lib/portal/auth.ts`). Default off. The agency flips it on from the deployment's management UI when ready to hand the client a window.

### On cancel (archive)
- `cancelDeploymentAction` (exists) gains: if `clientOrgId` is set, **archive** the client org (set its status to an archived/paused state — data retained), in addition to releasing the provisioned number. `deployments.clientOrgId` is kept (reactivation path). Never delete.

## Components

**New:**
- `deployments.clientOrgId` (uuid, nullable, FK → organizations.id) + additive migration.
- `deployments.portalInvitedAt` (timestamp, nullable) — portal opt-in state (or a boolean; finalize in plan).
- `lib/deployments/provision-client-workspace.ts` — `provisionClientWorkspaceForDeployment(deps, deployment)`; idempotent; DI'd workspace-create + DB so it's unit-testable offline.
- A `clientContext → workspace seed` mapper (reuses the SoulV4 shape; inverse of the persona build's `mapSoulToClientContext`).
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

## Recon-dependent — to ground in the plan (flagged, not guessed)
- **§A — Workspace-creation entry point.** Identify the leanest reusable seam to create a client org seeded from structured `clientContext` (vs a URL): candidates include the `create_full_workspace` / `create_workspace_v2` internals and the soul/booking seeders. Decide call-the-pipeline vs compose-the-essentials. The plan's first task is this recon.
- **§B — Billing/plan mechanics.** How to create an org that is agency-managed and **not** separately billed (a plan value, a `parentAgencyId`-implies-included rule, or a flag). Confirm against the pricing/subscription model so provisioning doesn't trigger a charge.
- **§C — Slug/naming + collision.** Client workspace slug derived from `clientName`; collision handling (suffix).
- **§D — Org status vocabulary for "archived"** (reuse the existing org status enum).

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
