// POST /api/v1/build/deploy — the deploy verb. Bearer-authed (wst_). Resolves/
// creates a builder-owned deployment (idempotent), computes readiness, and
// either hands back the Wizard link for the human-only connect steps or
// applies the phone + goes live. Money-safe: BYO Twilio/BYOK, no charge path;
// flag-gated; inert without the builder's own creds (readiness simply reports
// unmet) — EXCEPT for the Task 10 Tier-0 path (applyTier0IfAvailable), which
// is the intentional, wallet-metered exception: a funded wallet lets a voice
// deploy go live with ZERO connects by provisioning an SF-owned number
// (rent-before-buy via provisionSfManagedNumber — see its own money-safety
// invariants). Tier-0 itself stays inert without SF_VOICE_MANAGED + master
// Twilio creds configured, exactly like every other seam here.
//
// Composition note: the brief's reference snippet called the interactive
// wizard's session-authed "use server" actions directly (activateDeployment-
// Action / provisionDeploymentNumberAction / goLiveAction). Those all resolve
// their org via getOrgId() (@/lib/auth/helpers, the cookie/session chain) with
// NO override seam — they would silently 401 for every bearer/CLI caller,
// which is exactly who this route serves. So this route instead composes the
// same STORE-LEVEL primitives those actions call internally
// (getDeployment/updateDeployment/resolveBuilderTelephony/
// createTwilioTelephonyClient/provisionVoiceNumber/deploymentNeedsNumber/
// isPhoneInUseError), passing the bearer-resolved orgId explicitly. This is
// byte-for-byte the same business logic (ownership guard, needs-number gate,
// phone-in-use mapping) — only the org-resolution seam differs.
//
// Orchestration: the core control flow (flag gate → resolve source → readiness
// → phone → go-live) lives in `runDeploy` (@/lib/deployments/deploy-orchestrator),
// DI'd over the seams below, so it's unit-testable with fakes. This file wires
// the REAL deps (this DB, this Twilio, this store) and maps the result to the
// route's JSON contract, UNCHANGED from before the extraction.

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { deployments } from "@/db/schema/deployments";
import { agentTemplates } from "@/db/schema/agent-templates";
import { marketplaceListings } from "@/db/schema/marketplace";
import type { AgentBlueprint } from "@/db/schema/agents";
import type { Deployment } from "@/db/schema/deployments";

import { guardApiRequest } from "@/lib/api/guard";
import { resolveDeployReadiness } from "@/lib/deployments/deploy-readiness-deps";
import {
  getAgentTemplate,
  resolveAgentAsTemplate,
  resolveUniqueTemplateSlug,
  surfaceForType,
  type AgentTemplateType,
} from "@/lib/agent-templates/store";
import { getDeployment, createDeployment, updateDeployment } from "@/lib/deployments/store";
import { isE164, isAreaCode, isPhoneInUseError, deploymentNeedsNumber, deriveAreaCode } from "@/lib/deployments/margin";
import { resolveBuilderTelephony } from "@/lib/telephony/config";
import { createTwilioTelephonyClient } from "@/lib/telephony/twilio-client";
import { provisionVoiceNumber } from "@/lib/telephony/provision-voice-number";
import {
  provisionSfManagedNumber,
  buildDefaultProvisionSfManagedDeps,
} from "@/lib/telephony/provision-sf-managed";
import {
  resolveOrCreateBuyerDeployment,
  buildDefaultResolveBuyerDeploymentDeps,
  surfaceForAgentType,
  type BuyerListing,
} from "@/lib/marketplace/buyer/buyer-deployment";
import { buildInstalledAgentTemplate, type AgentListingForBuyer } from "@/lib/marketplace/agent-listings";
import { goLiveBlockers } from "@/lib/marketplace/buyer/buyer-onboarding";
import { normalizeBlueprintForOnboarding, buildOnboardingSteps } from "@/lib/marketplace/onboarding/steps";
import { markStepDone, emptyProgress } from "@/lib/marketplace/onboarding/progress";
import {
  runDeploy,
  statusForDeployResult,
  type ResolvedSource,
  type ApplyPhoneResult,
  type ProvisionSfManagedIfAvailableResult,
  type RunDeployDeps,
} from "@/lib/deployments/deploy-orchestrator";
import { buildShareCard, type ShareCardKind } from "@/lib/build/share-card";

/** A well-known, always-serviced NANP area code (Austin, TX) — the zero-
 *  connect Tier-0 fallback's last resort when a deployment has no client
 *  contact phone to derive an area code from (deriveAreaCode returns null). */
const DEFAULT_TIER0_AREA_CODE = "512";

function deployEnabled(): boolean {
  return process.env.SF_DEPLOY_ENABLED === "1" || process.env.SF_DEPLOY_ENABLED === "true";
}

// ─── source resolution (idempotent) ─────────────────────────────────────────

/** Self-built path: an existing agent_templates row the caller already owns,
 *  OR (product-gap fix) a workspace agent converted into one on the fly.
 *
 *  `POST /api/v1/build/deploy` only ever accepted a marketplace TEMPLATE
 *  source. When a Claude Code session builds a workspace AGENT (the `agents`
 *  table — createAgent / the Studio generator) and says "deploy it", the id
 *  it has is an `agents.id`, not an `agent_templates.id` — the ONLY id-shaped
 *  field on the wire is `source.templateId` (there is no separate `agentId`
 *  field; see docs/superpowers/specs/2026-07-01-self-serve-agent-deployment-
 *  design.md Part C), so that call used to 404 with `template_not_found`, the
 *  session pivoted to `publish_agent`, and the Tier-0 instant-phone path was
 *  never reached (observed twice in prod logs).
 *
 *  Fix: when `templateId` doesn't resolve to an owned agent_templates row,
 *  additively try resolveAgentAsTemplate (agent-templates/store.ts) —
 *  resolves the id as a workspace agent IN THE CALLER'S OWN ORG (org-scoped;
 *  a cross-org id resolves to null, identical to a nonexistent id) and
 *  converts it into an agent_templates row via buildTemplateFromAgent (same
 *  mapper style as buildInstalledAgentTemplate), resolve-or-reuse idempotent
 *  on `blueprint.sourceAgentId` (mirrors resolveListingSource's
 *  `sourceListingId` idiom). A miss (no template AND no agent by this id in
 *  this org) preserves the EXACT pre-existing `template_not_found` outcome.
 *
 *  Either way, the rest of this function (idempotent deployment lookup,
 *  surfaceForAgentType, error mapping) is UNCHANGED — it's keyed off the
 *  resolved template's own id, so readiness/phone/go-live/Tier-0 all come
 *  free regardless of which path produced the template. */
async function resolveTemplateSource(orgId: string, templateId: string): Promise<ResolvedSource> {
  let template = await getAgentTemplate(templateId);
  if (!template || template.builderOrgId !== orgId) {
    template = await resolveAgentAsTemplate(orgId, templateId);
    if (!template) {
      return { ok: false, reason: "template_not_found" };
    }
  }
  // IMPORTANT: from here on, key every lookup/write off the RESOLVED
  // template's own id, never the raw `templateId` param — on the agent-bridge
  // path above, `templateId` is actually an `agents.id`, which is NOT a valid
  // agentTemplateId (a different table's PK). Using the raw param here would
  // silently create a deployment pointing at a nonexistent template id.
  const resolvedTemplateId = template.id;

  const [existing] = await db
    .select()
    .from(deployments)
    .where(
      and(
        eq(deployments.builderOrgId, orgId),
        eq(deployments.agentTemplateId, resolvedTemplateId),
        ne(deployments.status, "canceled"),
      ),
    )
    .limit(1);

  if (existing) {
    return { ok: true, deployment: existing, templateType: template.type, blueprint: template.blueprint };
  }

  const created = await createDeployment({
    builderOrgId: orgId,
    agentTemplateId: resolvedTemplateId,
    clientName: template.name,
    // Without this, createDeployment defaults surface to "phone" even for a chat
    // template (I-1) — reuse the SAME agentType→surface mapping the buyer path
    // uses so a self-built chat deployment is correctly reached via "embed".
    surface: surfaceForAgentType(template.type),
  });
  if (!created.ok) {
    // "unauthorized" can't happen (orgId is already verified non-empty above);
    // the only realistic miss is invalid_input (e.g. a near-empty template
    // name) or the ownership guard re-tripping under a race — report faithfully.
    return {
      ok: false,
      reason: created.error === "invalid_input" ? "invalid_input" : "template_not_found",
    };
  }
  return { ok: true, deployment: created.deployment, templateType: template.type, blueprint: template.blueprint };
}

/** Marketplace path: clone a published kind:'agent' listing into the caller's
 *  own org, then resolve-or-create the buyer-owned deployment of it.
 *  Idempotent at the deployment layer (mirrors the existing purchase/webhook
 *  install seam in lib/marketplace/actions.ts — resolveOrCreateBuyerDeployment
 *  matches on the cloned template's stamped sourceListingId). */
async function resolveListingSource(orgId: string, listingSlug: string): Promise<ResolvedSource> {
  const [listing] = await db
    .select({
      id: marketplaceListings.id,
      slug: marketplaceListings.slug,
      name: marketplaceListings.name,
      kind: marketplaceListings.kind,
      agentType: marketplaceListings.agentType,
      agentBlueprint: marketplaceListings.agentBlueprint,
      isPublished: marketplaceListings.isPublished,
    })
    .from(marketplaceListings)
    .where(eq(marketplaceListings.slug, listingSlug))
    .limit(1);

  if (!listing || !listing.isPublished || listing.kind !== "agent") {
    return { ok: false, reason: "listing_not_found" };
  }

  const buyerListing: BuyerListing = {
    id: listing.id,
    slug: listing.slug,
    name: listing.name,
    kind: listing.kind,
    agentType: listing.agentType,
    agentBlueprint: listing.agentBlueprint,
  };

  // Resolve-or-reuse: a repeated deploy call for the same listing must not
  // pile up orphaned clones. Look for a template THIS org already cloned from
  // THIS listing (the same sourceListingId jsonb-stamp match
  // findExistingForListing uses in buyer-deployment.ts, but queried directly
  // against agentTemplates alone — we need the template BEFORE a deployment
  // necessarily exists, so we can't join through deployments here).
  const [existingTemplate] = await db
    .select()
    .from(agentTemplates)
    .where(
      and(
        eq(agentTemplates.builderOrgId, orgId),
        sql`${agentTemplates.blueprint} ->> 'sourceListingId' = ${listing.id}`,
      ),
    )
    .limit(1);

  let ownedTemplate: { id: string; type: string; blueprint: AgentBlueprint };
  if (existingTemplate) {
    ownedTemplate = existingTemplate;
  } else {
    // Clone the listing's blueprint into a fresh draft template owned by the
    // caller (mirrors lib/marketplace/actions.ts:cloneAgentListingIntoOrg — that
    // helper is module-private, so this reuses the same exported primitives).
    const args = buildInstalledAgentTemplate(buyerListing satisfies AgentListingForBuyer, orgId);
    const blueprint: AgentBlueprint = { ...(args.blueprint ?? {}), sourceListingId: listing.id };
    const existingSlugs = await db
      .select({ slug: agentTemplates.slug })
      .from(agentTemplates)
      .where(eq(agentTemplates.builderOrgId, orgId));
    const slug = resolveUniqueTemplateSlug(args.name, existingSlugs.map((r) => r.slug));

    const [createdTemplate] = await db
      .insert(agentTemplates)
      .values({ ...args, blueprint, slug })
      .returning();
    if (!createdTemplate) {
      return { ok: false, reason: "listing_not_found" };
    }
    ownedTemplate = createdTemplate;
  }

  const result = await resolveOrCreateBuyerDeployment(
    { buyerOrgId: orgId, listing: buyerListing, agentTemplateId: ownedTemplate.id },
    buildDefaultResolveBuyerDeploymentDeps(),
  );
  if (!result.ok) {
    // invalid_input / not_agent_listing can't happen here (orgId + listing.kind
    // are already validated above) — defensive fallback only.
    return { ok: false, reason: "invalid_input" };
  }
  return {
    ok: true,
    deployment: result.deployment,
    templateType: ownedTemplate.type,
    blueprint: ownedTemplate.blueprint,
  };
}

// ─── phone application (mirrors activateDeploymentAction /
//     provisionDeploymentNumberAction, org-parameterized instead of session-
//     gated — see the file-header note) ──────────────────────────────────────

async function applyForwardedNumber(
  deployment: Deployment,
  templateType: string,
  blueprint: AgentBlueprint,
  phoneNumber: string,
): Promise<ApplyPhoneResult> {
  if (!isE164(phoneNumber)) return { ok: false, reason: "invalid_phone" };

  const needsNumber = deploymentNeedsNumber(blueprint.trigger, surfaceForType(templateType as AgentTemplateType));
  try {
    const result = await updateDeployment({
      id: deployment.id,
      patch: needsNumber ? { phoneNumber, status: "active" } : { status: "active" },
    });
    if (!result.ok) return { ok: false, reason: result.error };
    return needsNumber
      ? { ok: true, deployment: result.deployment }
      : { ok: true, deployment: result.deployment, outbound: true };
  } catch (err) {
    if (isPhoneInUseError(err)) return { ok: false, reason: "phone_in_use" };
    throw err;
  }
}

async function applyProvisionedNumber(
  orgId: string,
  deployment: Deployment,
  templateType: string,
  blueprint: AgentBlueprint,
  areaCode: string,
): Promise<ApplyPhoneResult> {
  if (!isAreaCode(areaCode)) return { ok: false, reason: "invalid_area_code" };

  const needsNumber = deploymentNeedsNumber(blueprint.trigger, surfaceForType(templateType as AgentTemplateType));
  if (!needsNumber) {
    const activated = await updateDeployment({ id: deployment.id, patch: { status: "active" } });
    if (!activated.ok) return { ok: false, reason: activated.error };
    return { ok: true, deployment: activated.deployment, outbound: true };
  }

  const telephony = await resolveBuilderTelephony(orgId);
  if (!telephony.ok) {
    return { ok: false, reason: "needs_telephony", missing: telephony.missing };
  }

  const client = createTwilioTelephonyClient({
    accountSid: telephony.accountSid,
    authToken: telephony.authToken,
  });
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.seldonframe.com";

  let result: Awaited<ReturnType<typeof provisionVoiceNumber>>;
  try {
    result = await provisionVoiceNumber(
      {
        client,
        loadDeployment: (id) => getDeployment(id),
        updateDeployment: async (id, patch) => {
          const res = await updateDeployment({ id, patch });
          return res.ok ? res.deployment : null;
        },
        friendlyName: (d) => d.clientName,
        smsUrl: `${appBaseUrl}/api/webhooks/twilio/sms`,
      },
      { deploymentId: deployment.id, areaCode, trunkSid: telephony.voiceTrunkSid },
    );
  } catch (err) {
    if (isPhoneInUseError(err)) return { ok: false, reason: "phone_in_use" };
    throw err;
  }
  if (!result.ok) return { ok: false, reason: result.error };

  const fresh = (await getDeployment(deployment.id)) ?? deployment;
  return { ok: true, deployment: fresh };
}

// ─── Tier-0 (SF-managed) fallback — Task 10, the deploy-verb payoff ─────────
//     "seldonframe deploy" with a funded wallet ⇒ instant SF number ⇒ live,
//     with ZERO connects. Tried by runDeploy exactly where BYO Twilio is
//     missing (no `phone` in the body at all, or applyPhone's needs_telephony
//     failure) — see deploy-orchestrator.ts's RunDeployDeps doc comment.

/**
 * Wraps provisionSfManagedNumber (real deps) as the RunDeployDeps
 * `provisionSfManagedIfAvailable` seam: `not_configured` (the feature is off,
 * or SF has no master Twilio creds) maps to `available:false` — a pure
 * no-op the orchestrator falls through from to its pre-Task-10 behavior.
 * Every OTHER provisionSfManagedNumber failure (insufficient_balance /
 * twilio_error / no_numbers_available) is a REAL attempt that failed, so it
 * reports `available:true` with the reason — the orchestrator surfaces this
 * directly rather than masking it behind phone_required/needs_telephony.
 *
 * Area code (T10 review F1): the caller's explicit `requestedAreaCode` (from
 * `body.phone.areaCode` when `phone.mode==="provision"`) wins when present —
 * a caller who typed an area code should get THAT area code even on the
 * Tier-0 rescue path, not a silently-substituted one. Absent (forward mode,
 * or the true zero-connect 4a path with no `phone` in the body at all) falls
 * back to the same best-effort chain as before: derive it from the
 * deployment's own client contact phone (deriveAreaCode — the SAME extractor
 * the buyer wizard's "Get a number" pre-fill uses), then a well-known
 * always-serviced NANP area code (512, Austin TX) — Twilio's search still
 * returns candidates nationally-adjacent to a real area code, and a genuine
 * `no_numbers_available` still surfaces honestly rather than being swallowed.
 */
async function applyTier0IfAvailable(
  // Unused: the RunDeployDeps signature mirrors applyPhone's (orgId,
  // deployment) shape for consistency, but provisionSfManagedNumber reads
  // deployment.builderOrgId internally (the deploy verb already guarantees
  // orgId === deployment.builderOrgId — see resolveTemplateSource /
  // resolveListingSource, both of which stamp builderOrgId from this same
  // bearer-resolved orgId).
  _orgId: string,
  deployment: Deployment,
  requestedAreaCode: string | undefined,
): Promise<ProvisionSfManagedIfAvailableResult> {
  const areaCode =
    requestedAreaCode ?? deriveAreaCode(deployment.clientContact?.phone) ?? DEFAULT_TIER0_AREA_CODE;

  const result = await provisionSfManagedNumber(
    { deployment, areaCode },
    buildDefaultProvisionSfManagedDeps(),
  );

  if (result.ok) {
    const fresh = (await getDeployment(deployment.id)) ?? deployment;
    return { ok: true, deployment: fresh };
  }
  if (result.error === "not_configured") {
    return { ok: false, available: false };
  }
  return { ok: false, available: true, reason: result.error };
}

// ─── go-live (mirrors app/(buyer)/agent/actions.ts:goLiveAction,
//     org-parameterized) ─────────────────────────────────────────────────────

async function applyGoLive(
  deployment: Deployment,
  templateType: string,
  blueprint: AgentBlueprint,
): Promise<{ ok: true; deployment: Deployment } | { ok: false; reason: string }> {
  const normalized = normalizeBlueprintForOnboarding(templateType, blueprint);
  const steps = buildOnboardingSteps(normalized);
  let progress = deployment.customization?.onboardingProgress ?? emptyProgress();
  // This route never routes through the buyer wizard's markStepDoneAction("phone")
  // — applyForwardedNumber/applyProvisionedNumber attach deployment.phoneNumber
  // directly. So an attached number must count as the `phone` step being done for
  // THIS go-live check, or goLiveBlockers wrongly reports it unmet (C-1: a voice
  // deploy with a freshly-attached number was permanently stuck "blocked"). Mirror
  // the wizard's markStepDone mechanism rather than special-casing the blocker
  // list — chat-only deploys never populate phoneNumber, so they're unaffected.
  if (deployment.phoneNumber) {
    progress = markStepDone(progress, "phone");
  }
  const blockers = goLiveBlockers(steps, progress);
  if (blockers.length > 0) {
    return { ok: false, reason: "blocked" };
  }

  const customization = {
    ...(deployment.customization ?? {}),
    onboardingProgress: markStepDone(progress, "go_live"),
  };
  const result = await updateDeployment({
    id: deployment.id,
    patch: { status: "active", customization },
  });
  if (!result.ok) return { ok: false, reason: result.error };
  return { ok: true, deployment: result.deployment };
}

// ─── share card (virality pack, Task 2 — additive, success-only) ───────────
//
// "I just shipped a 24/7 AI agent from my IDE" growth loop: the success
// response gains a `share: { card_url, post_url, text }` field so a builder
// can post about the deploy immediately. Deliberately NOT threaded through
// `runDeploy`/`DeployResult` (deploy-orchestrator.ts) — that type is the
// CLI/MCP tool's byte-for-byte JSON contract (see its own file header) and
// only carries `deploymentId`/`phoneNumber` on a live result, not the
// business name or a start timestamp. Instead this re-fetches the
// deployment row (already-imported `getDeployment`) purely to read
// `clientName` (→ businessName) and `createdAt` (→ startedAt for the
// "shipped in N minutes" copy) — a cheap, read-only lookup keyed off the
// `deploymentId` the route already has in scope, with zero impact on the
// existing control flow or fields.
//
// `kind` is derived from the deployment's own `surface` column rather than
// re-deriving templateType (which isn't in `POST`'s scope after `runDeploy`
// returns) — "phone" is the voice-reachable surface, everything else
// (embed/link/sms/email) reads as a generic "agent" per buildShareCard's own
// voice/non-voice split (nounForKind).
//
// Fail-soft: this is a nice-to-have on top of an already-successful deploy.
// Any error while building the share card (a race where the deployment row
// vanished between go-live and this lookup, etc.) must never turn a genuine
// "live" deploy into a failed HTTP response — the field is simply omitted.
function shareKindForSurface(surface: string): ShareCardKind {
  return surface === "phone" ? "voice" : "chat";
}

async function buildShareForLiveDeployment(
  deploymentId: string,
): Promise<{ cardUrl: string; text: string; postUrl: string } | null> {
  try {
    const deployment = await getDeployment(deploymentId);
    if (!deployment) return null;
    const share = buildShareCard({
      businessName: deployment.clientName,
      startedAt: deployment.createdAt ?? null,
      now: new Date(),
      kind: shareKindForSurface(deployment.surface),
    });
    return share;
  } catch {
    return null;
  }
}

// ─── the route ───────────────────────────────────────────────────────────────

/** Wire the REAL seams (this DB, this Twilio, this store) for `runDeploy`. */
function buildRealRunDeployDeps(): RunDeployDeps {
  return {
    deployEnabled,
    resolveSource: async (orgId, body) => {
      const templateId = body.source?.templateId?.trim();
      const listingSlug = body.source?.listingSlug?.trim();
      if (templateId) return resolveTemplateSource(orgId, templateId);
      if (listingSlug) return resolveListingSource(orgId, listingSlug);
      return { ok: false, reason: "invalid_source" };
    },
    resolveDeployReadiness: ({ orgId, templateType, blueprint, deployment }) =>
      resolveDeployReadiness({ orgId, templateType, blueprint, deployment }),
    deploymentNeedsNumber: (blueprint, templateType) =>
      deploymentNeedsNumber(blueprint.trigger, surfaceForType(templateType as AgentTemplateType)),
    applyPhone: (orgId, deployment, templateType, blueprint, phone) =>
      phone.mode === "forward"
        ? applyForwardedNumber(deployment, templateType, blueprint, phone.number)
        : applyProvisionedNumber(orgId, deployment, templateType, blueprint, phone.areaCode),
    // T10 review F2 — gate BOTH Tier-0 entry points on BYO telephony being
    // absent. resolveBuilderTelephony is the exact primitive
    // applyProvisionedNumber's own needs_telephony check already uses; this
    // is a read-only success/failure probe (no side effects either way).
    hasByoTelephony: async (orgId) => (await resolveBuilderTelephony(orgId)).ok === true,
    provisionSfManagedIfAvailable: (orgId, deployment, areaCode) =>
      applyTier0IfAvailable(orgId, deployment, areaCode),
    wizardUrlFor: (wizardPath) => {
      const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.seldonframe.com";
      return `${base}${wizardPath}`;
    },
    applyGoLive: (deployment, templateType, blueprint) =>
      applyGoLive(deployment, templateType, blueprint),
  };
}

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;
  const orgId = guard.orgId;
  if (!orgId) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    source?: { templateId?: string; listingSlug?: string };
    phone?: { mode: "forward"; number: string } | { mode: "provision"; areaCode: string };
  };

  const result = await runDeploy({ orgId, body }, buildRealRunDeployDeps());

  // Additive only: a successful "live" deploy gains a `share` field for the
  // deploy share-card growth loop. Every other result shape (disabled,
  // needs_connect, any error) is returned completely unchanged — see the
  // "share card" section above for why this isn't threaded through
  // `runDeploy` itself.
  if (result.ok && result.status === "live") {
    const share = await buildShareForLiveDeployment(result.deploymentId);
    if (share) {
      return NextResponse.json(
        {
          ...result,
          share: { card_url: share.cardUrl, post_url: share.postUrl, text: share.text },
        },
        { status: statusForDeployResult(result) },
      );
    }
  }

  return NextResponse.json(result, { status: statusForDeployResult(result) });
}
