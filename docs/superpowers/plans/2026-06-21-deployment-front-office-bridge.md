# Deployment → Whitelabel Front Office Bridge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** When a deployed voice agent is activated, auto-provision an isolated, agency-branded client workspace (the full front office), and route **all** the agent's writes — bookings, contacts, messages, transcripts — into that client org. Portal login opt-in; archive (not delete) on cancel.

**Architecture:** Reuse `createFullWorkspace()` (the structured-input core of `/clients/new`) seeded from the already-captured `clientContext`. One retarget line in `loadDeploymentVoiceContext` routes every write to the client org. `deployments.clientOrgId` links them; `organizations.archivedAt` (new) supports archive-on-cancel. Spec: `docs/superpowers/specs/2026-06-21-deployment-front-office-bridge-design.md`.

**Tech Stack:** Next.js 16 / React 19, Drizzle/Neon, `node:test` + `tsx`. Conventions: tests `cd packages/crm && node --import tsx --test <files>`; tsc `packages/crm/node_modules/.bin/tsc -p packages/crm/tsconfig.json --noEmit` (0 NEW errors; the ~10 `.next/types` React-19 artifacts are pre-existing/ignored); `bash scripts/check-use-server.sh src` clean; plain modules vs `"use server"` (async-only); DI network/DB in unit tests; DI clocks (`now`); TDD pure logic; commit per task.

**Provisioning trigger (decision):** provision at **activation** (the existing "Get a number" / activate path — `provisionDeploymentNumberAction` or equivalent), not at draft-create — so abandoned drafts don't spawn orphan workspaces. Idempotent + soft-fail (never block activation).

---

## Task 1: Schema + additive migration

**Files:** Modify `packages/crm/src/db/schema/deployments.ts`, `packages/crm/src/db/schema/organizations.ts`; generate `packages/crm/drizzle/0028_*.sql`.

- [ ] **Step 1:** In `deployments.ts` add:
```typescript
clientOrgId: uuid("client_org_id").references(() => organizations.id),
portalInvitedAt: timestamp("portal_invited_at", { withTimezone: true }),
```
In `organizations.ts` add:
```typescript
archivedAt: timestamp("archived_at", { withTimezone: true }),
```
(Match the file's existing import style for `uuid`/`timestamp`/`organizations`. If `deployments.ts` can't import `organizations` without a cycle, use `uuid("client_org_id")` without `.references()` and document the FK in the migration SQL — check how other cross-table refs are done in this schema dir first.)

- [ ] **Step 2:** Generate the migration (the repo's drizzle generate script). VERIFY it is exactly three additive `ADD COLUMN` statements (`deployments.client_org_id`, `deployments.portal_invited_at`, `organizations.archived_at`) and `meta/_journal.json` gained exactly one appended entry (tag `0028_*`, mirroring the 0027 precedent — pure append). Do NOT run any migration against a real DB. Paste the SQL in the commit body.

- [ ] **Step 3:** tsc 0 new errors.

- [ ] **Step 4:** Commit `feat(deploy): client_org_id + portal_invited_at + organizations.archived_at (additive migration)`.

---

## Task 2: `clientContext → CreateFullWorkspaceInput` mapper (pure, TDD)

**Files:** Create `packages/crm/src/lib/deployments/client-workspace-seed.ts`; Test `packages/crm/tests/unit/deployments/client-workspace-seed.spec.ts`.

**Context:** `createFullWorkspace(input)` (`lib/workspace/create-full.ts:187`) REQUIRES `business_name, city, state, phone, services[] (non-empty), business_description` and accepts optional `email, address, weekly_hours, testimonials, preview_mode`. The deployment carries `clientName`, `clientContext` (`{ soul?: { businessName, businessDescription, services: {name,description?}[], business_hours?, voice? }, faq?: {q,a}[] }`), and `clientContact` (`{ phone?, email?, address? }`). **First read `create-full.ts` `CreateFullWorkspaceInput` + its validator (~:190) to confirm exact field names + the non-empty/required rules before writing the mapper.**

- [ ] **Step 1: Failing test** — assert `buildClientWorkspaceInput` always satisfies the required fields (non-empty fallbacks) and maps what's present:
```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClientWorkspaceInput } from "../../../src/lib/deployments/client-workspace-seed.ts";

test("maps a full clientContext", () => {
  const input = buildClientWorkspaceInput({
    clientName: "Acme Plumbing",
    clientContext: {
      soul: { businessName: "Acme Plumbing", businessDescription: "24/7 drain & pipe", services: [{ name: "Drain cleaning" }, { name: "Leak repair" }], business_hours: { monday: { enabled: true, start: "08:00", end: "17:00" } } },
      faq: [{ q: "Hours?", a: "24/7" }],
    },
    clientContact: { phone: "+15125550101", email: "ops@acme.test", address: "12 Main St, Austin, TX" },
  });
  assert.equal(input.business_name, "Acme Plumbing");
  assert.deepEqual(input.services, ["Drain cleaning", "Leak repair"]);
  assert.equal(input.phone, "+15125550101");
  assert.equal(input.email, "ops@acme.test");
  assert.ok(input.business_description.length > 0);
  assert.ok(input.city && input.state); // derived from address or safe default
});

test("guarantees required fields when clientContext is sparse", () => {
  const input = buildClientWorkspaceInput({ clientName: "Bob's Shop", clientContext: null, clientContact: null });
  assert.equal(input.business_name, "Bob's Shop");
  assert.ok(input.services.length >= 1);          // non-empty fallback
  assert.ok(input.business_description.length > 0);
  assert.equal(typeof input.city, "string");
  assert.equal(typeof input.state, "string");
  assert.equal(typeof input.phone, "string");
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** `buildClientWorkspaceInput(args): CreateFullWorkspaceInput`:
  - `business_name = clientContext?.soul?.businessName || clientName`.
  - `services = (clientContext?.soul?.services ?? []).map(s => s.name).filter(Boolean)`; if empty → `[business_name]` (or `["General service"]`) so it's non-empty.
  - `business_description = clientContext?.soul?.businessDescription || \`${business_name} — services\``.
  - `phone = clientContact?.phone ?? ""` (createFullWorkspace requires it; if the validator rejects empty, use a neutral placeholder — confirm in step-0 read).
  - `email = clientContact?.email ?? null`, `address = clientContact?.address ?? null`.
  - `city`/`state`: parse from `address` (split on commas: `…, City, ST`) if present; else safe defaults (`""` if the validator allows, else a neutral value confirmed in step 0).
  - `weekly_hours`: map `clientContext?.soul?.business_hours` to the `Record<day, {enabled,start,end}>` shape `createFullWorkspace` expects (confirm the shape).
  - Import the input type from `create-full.ts`; return a typed object.

- [ ] **Step 4: Run → pass.**

- [ ] **Step 5: Commit** `feat(deploy): clientContext → CreateFullWorkspaceInput seed mapper`.

---

## Task 3: `provisionClientWorkspaceForDeployment` (TDD, DI'd)

**Files:** Create `packages/crm/src/lib/deployments/provision-client-workspace.ts`; Test `packages/crm/tests/unit/deployments/provision-client-workspace.spec.ts`.

**Recon first (report):** how to resolve the builder's agency (a `partner_agencies` row where `ownerWorkspaceId = builderOrgId` OR `ownerUserId = <org owner>`), and the store-level way to set `organizations.parentAgencyId` (a direct update, NOT the Scale-gated interactive `attachWorkspaceToAgency` — but reuse its underlying update if there's a non-gated store fn).

- [ ] **Step 1: Failing tests** (DI everything — no network/DB):
```typescript
// idempotent: clientOrgId already set → no-op
// happy: createFullWorkspace ok → parentAgencyId set (agency found) → clientOrgId persisted
// no-agency: agency null → workspace created UNATTACHED, clientOrgId still persisted
// soft-fail: createFullWorkspace returns {status:"error"} or throws → returns {ok:false}, clientOrgId NOT persisted, no throw
```
Shape: `provisionClientWorkspaceForDeployment(deps, deployment)` where `deps = { createFullWorkspace, buildInput?, resolveBuilderAgency, setParentAgency, updateDeployment }`.

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement:**
```typescript
export async function provisionClientWorkspaceForDeployment(deps, deployment) {
  if (deployment.clientOrgId) return { ok: true, orgId: deployment.clientOrgId, skipped: true };
  const input = (deps.buildInput ?? buildClientWorkspaceInput)({
    clientName: deployment.clientName, clientContext: deployment.clientContext, clientContact: deployment.clientContact,
  });
  let result;
  try { result = await deps.createFullWorkspace(input); }
  catch (e) { return { ok: false, error: "create_threw" }; }
  if (!result || result.status !== "ready" || !result.workspace_id) return { ok: false, error: "create_failed" };
  const orgId = result.workspace_id;
  try {
    const agencyId = await deps.resolveBuilderAgency(deployment.builderOrgId);
    if (agencyId) await deps.setParentAgency(orgId, agencyId);
  } catch { /* branding attach is best-effort; never fail provisioning on it */ }
  await deps.updateDeployment(deployment.id, { clientOrgId: orgId });
  return { ok: true, orgId };
}
```

- [ ] **Step 4: Run → pass.**

- [ ] **Step 5: Commit** `feat(deploy): provisionClientWorkspaceForDeployment (idempotent, soft-fail)`.

---

## Task 4: Wire provisioning into activation

**Files:** Recon then modify the activation action (`lib/deployments/actions.ts` — `provisionDeploymentNumberAction` or the activate path) + `store.ts` (a `setParentAgency` / `resolveBuilderAgency` store fn if needed) + `lib/workspace/create-full.ts` import wiring for the default deps.

- [ ] **Step 1: Recon (report):** find where a deployment is activated ("Get a number"). Confirm the real deps to inject (`createFullWorkspace` import, the agency resolver, the `updateDeployment`/`setParentAgency` store fns).

- [ ] **Step 2:** After the deployment is activated (number provisioned), call `provisionClientWorkspaceForDeployment(realDeps, deployment)`. It is **idempotent** (re-activation safe) and **soft-fail** — if it returns `{ok:false}`, log + continue; activation must still succeed (the agent runs, falling back to `builderOrgId` writes until provisioning succeeds on a retry). Do NOT block the action's success on it.

- [ ] **Step 3: Test:** the activation action invokes provisioning (DI'd) and still succeeds when provisioning fails. (Follow the repo's existing action-test pattern, or cover the wiring via the store/provision layer as the persona build did if booting the action isn't the pattern.)

- [ ] **Step 4: Commit** `feat(deploy): provision client workspace on activation (soft-fail)`.

---

## Task 5: Retarget the agent's writes to the client org

**Files:** Modify `packages/crm/src/lib/agents/voice/deployment-voice.ts` (`loadDeploymentVoiceContext`), `packages/crm/src/lib/agents/voice/resolve-deployment-by-number.ts`; Test `packages/crm/tests/unit/agents/voice/deployment-voice.spec.ts`.

**Context:** today `ctx.orgId = ctx.orgSlug = builderOrgId` and `transcriptOrgId = builderOrgId` (~:160-170). The booking tools route by `ctx.orgSlug`; contacts/messages by `ctx.orgId`; transcripts by `transcriptOrgId`. Retargeting all three to the client org routes everything. **The booking tools need the client org's SLUG**, so the client org's slug must be available.

- [ ] **Step 1:** In `resolve-deployment-by-number.ts`: add `clientOrgId` to `DeploymentNumberRow` + the `.select` projection, AND join `organizations` to also project the client org's `slug` as `clientOrgSlug` (left join on `deployments.clientOrgId = organizations.id`). (If a join there is awkward, instead add a `deps.loadOrgSlug(orgId)` in `loadDeploymentVoiceContext` — recon which is cleaner.)

- [ ] **Step 2: Failing bug-catch tests** in `deployment-voice.spec.ts`:
```typescript
// clientOrgId + clientOrgSlug present → ctx.orgId === clientOrgId, ctx.orgSlug === clientOrgSlug, transcriptOrgId === clientOrgId
// clientOrgId absent → ctx.orgId/orgSlug/transcriptOrgId === builderOrgId (unchanged behavior)
```
Backfill `clientOrgId: null` into existing Deployment/DeploymentNumberRow fixtures so types compile.

- [ ] **Step 3:** Widen the `loadDeploymentVoiceContext` arg `Pick<Deployment, …>` to include `clientOrgId`. After ctx assembly, if `clientOrgId` is set, set `ctx.orgId = clientOrgId`, `ctx.orgSlug = clientOrgSlug ?? clientOrgId`, and `transcriptOrgId = clientOrgId`. Keep the persona (`clientContext`) + `bookingMode` threading intact — they now describe the client whose org we target (consistent). Fallback to `builderOrgId` when `clientOrgId` is null.

- [ ] **Step 4: Run → pass** (new + existing voice suite green).

- [ ] **Step 5: Commit** `feat(voice): deployed agent writes bookings/leads/messages to the client org`.

---

## Task 6: Archive on cancel + filter archived orgs

**Files:** Modify `cancelDeploymentAction` (`lib/deployments/actions.ts`); recon + modify the active-workspace list queries; Test the cancel + a filter spec.

- [ ] **Step 1: Recon (report):** find the queries that list ACTIVE workspaces an agency/user owns — at least: the `/agency` dashboard child-workspace list (`organizations.parentAgencyId = …`), the main workspace list, `switch_workspace`, and the billing **workspace-count** (`enforceWorkspaceLimit` / `getOwnedWorkspaceCount`). List them.

- [ ] **Step 2:** In `cancelDeploymentAction`: if `deployment.clientOrgId` is set, stamp `organizations.archivedAt = new Date()` for that org (keep `deployments.clientOrgId`; never delete) — in addition to the existing number-release. Add a `now`-injectable seam for the test.

- [ ] **Step 3:** Add `archivedAt IS NULL` (Drizzle `isNull(organizations.archivedAt)`) to each active-workspace query found in Step 1, **especially the billing workspace-count** (an archived client workspace must not count against the builder's workspace limit / billing).

- [ ] **Step 4: Tests:** cancel stamps `archivedAt` + keeps `clientOrgId`; an archived org is excluded from the active-list query (test the query helper or the store fn with a DI'd/fixture row).

- [ ] **Step 5: Commit** `feat(deploy): archive client workspace on cancel + exclude archived from active lists`.

---

## Task 7: Portal-login opt-in toggle

**Files:** Recon then add a portal-invite action (`lib/deployments/actions.ts`) reusing the existing portal magic-link (`lib/portal/auth.ts`) + a toggle in the deployment management UI (the deploy/agent detail client component).

- [ ] **Step 1: Recon (report):** the existing portal magic-link invite flow (`lib/portal/auth.ts` — how an operator invites a client contact) and the deployment management UI component (where "Get a number"/cancel live).

- [ ] **Step 2:** `inviteClientToPortalAction({ deploymentId })` (`"use server"`): org-guard; require `deployment.clientOrgId`; resolve a primary client contact in the client org (or use `deployment.clientContact.email`); send the magic-link via the existing portal auth; stamp `deployments.portalInvitedAt = now`. Idempotent-ish (re-invite allowed; updates the timestamp).

- [ ] **Step 3:** UI: a "Give client portal access" toggle/button in the deployment management view — disabled until `clientOrgId` exists; shows "Invited <date>" once `portalInvitedAt` is set. Keep `"use client"`.

- [ ] **Step 4: Test:** the action requires `clientOrgId`, calls the invite (DI'd), and stamps `portalInvitedAt`.

- [ ] **Step 5: Commit** `feat(deploy): opt-in client portal access (magic-link invite + toggle)`.

---

## Task 8: Verify

- [ ] Suites: `cd packages/crm && node --import tsx --test tests/unit/deployments/*.spec.ts tests/unit/agents/voice/*.spec.ts` → green.
- [ ] `tsc --noEmit` 0 new errors; `bash scripts/check-use-server.sh src` clean; migrations-journaled check (29 journaled, 0 orphans).
- [ ] **Report:** the regression statement (workspace/operator booking + existing deployment flows unchanged; provisioning is soft-fail and off the live-call path; retarget falls back to `builderOrgId` when `clientOrgId` is null) and the honest gap — unit-verified; the live gate is: deploy → activate → confirm a client workspace appears under the agency (branded) → call → booking/lead/transcript land in the **client** workspace → cancel → client workspace archived (not deleted) + excluded from active lists.

---

## Self-Review
- **Spec coverage:** auto-provision via `createFullWorkspace` (T2-4) ✓; retarget everything (T5) ✓; archive-on-cancel + `archivedAt` (T1, T6) ✓; portal opt-in (T1, T7) ✓; agency branding via `parentAgencyId` (T3) ✓; billing-free (createFullWorkspace `plan:free`, no flag) ✓; idempotent + soft-fail (T3, T4) ✓.
- **Deferred (not in plan):** backfill for legacy deployments; reactivation-from-archive; chat-deploy parity; BYO-OAuth-app.
- **Type consistency:** `buildClientWorkspaceInput` returns `create-full.ts`'s `CreateFullWorkspaceInput`; `clientOrgId`/`clientOrgSlug` threaded T1→T5; `archivedAt` defined T1, used T6.
- **Recon-then-implement** is used only where integration points are genuinely unmapped (agency resolver, activation seam, active-list queries, portal invite) — each with a clear contract + a report step, not a guess.
