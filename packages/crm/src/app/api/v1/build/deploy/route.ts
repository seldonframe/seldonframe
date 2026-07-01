// POST /api/v1/build/deploy — the deploy verb. Bearer-authed (wst_). Resolves/
// creates a builder-owned deployment (idempotent), computes readiness, and
// either hands back the Wizard link for the human-only connect steps or
// applies the phone + goes live. Money-safe: BYO Twilio/BYOK, no charge path;
// flag-gated; inert without the builder's own creds (readiness simply reports
// unmet).
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
  resolveUniqueTemplateSlug,
  type AgentTemplateType,
} from "@/lib/agent-templates/store";
import { getDeployment, createDeployment, updateDeployment } from "@/lib/deployments/store";
import { isE164, isAreaCode, isPhoneInUseError, deploymentNeedsNumber } from "@/lib/deployments/margin";
import { resolveBuilderTelephony } from "@/lib/telephony/config";
import { createTwilioTelephonyClient } from "@/lib/telephony/twilio-client";
import { provisionVoiceNumber } from "@/lib/telephony/provision-voice-number";
import {
  resolveOrCreateBuyerDeployment,
  buildDefaultResolveBuyerDeploymentDeps,
  type BuyerListing,
} from "@/lib/marketplace/buyer/buyer-deployment";
import { buildInstalledAgentTemplate, type AgentListingForBuyer } from "@/lib/marketplace/agent-listings";
import { goLiveBlockers } from "@/lib/marketplace/buyer/buyer-onboarding";
import { normalizeBlueprintForOnboarding, buildOnboardingSteps } from "@/lib/marketplace/onboarding/steps";
import { markStepDone, emptyProgress } from "@/lib/marketplace/onboarding/progress";

function deployEnabled(): boolean {
  return process.env.SF_DEPLOY_ENABLED === "1" || process.env.SF_DEPLOY_ENABLED === "true";
}

// ─── source resolution (idempotent) ─────────────────────────────────────────

type ResolvedSource =
  | { ok: true; deployment: Deployment; templateType: string; blueprint: AgentBlueprint }
  | {
      ok: false;
      reason: "invalid_source" | "template_not_found" | "listing_not_found" | "invalid_input";
    };

/** Self-built path: an existing agent_templates row the caller already owns.
 *  Idempotent — reuses any non-canceled deployment already resolved for
 *  (orgId, templateId) instead of creating a second one on every call. */
async function resolveTemplateSource(orgId: string, templateId: string): Promise<ResolvedSource> {
  const template = await getAgentTemplate(templateId);
  if (!template || template.builderOrgId !== orgId) {
    return { ok: false, reason: "template_not_found" };
  }

  const [existing] = await db
    .select()
    .from(deployments)
    .where(
      and(
        eq(deployments.builderOrgId, orgId),
        eq(deployments.agentTemplateId, templateId),
        ne(deployments.status, "canceled"),
      ),
    )
    .limit(1);

  if (existing) {
    return { ok: true, deployment: existing, templateType: template.type, blueprint: template.blueprint };
  }

  const created = await createDeployment({
    builderOrgId: orgId,
    agentTemplateId: templateId,
    clientName: template.name,
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

type ApplyPhoneResult =
  | { ok: true; deployment: Deployment; outbound?: true }
  | { ok: false; reason: string; missing?: ("twilio" | "trunk")[] };

async function applyForwardedNumber(
  deployment: Deployment,
  templateType: string,
  blueprint: AgentBlueprint,
  phoneNumber: string,
): Promise<ApplyPhoneResult> {
  if (!isE164(phoneNumber)) return { ok: false, reason: "invalid_phone" };

  const needsNumber = deploymentNeedsNumber(blueprint.trigger, templateType);
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

  const needsNumber = deploymentNeedsNumber(blueprint.trigger, templateType);
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

// ─── go-live (mirrors app/(buyer)/agent/actions.ts:goLiveAction,
//     org-parameterized) ─────────────────────────────────────────────────────

async function applyGoLive(
  deployment: Deployment,
  templateType: string,
  blueprint: AgentBlueprint,
): Promise<{ ok: true; deployment: Deployment } | { ok: false; reason: string }> {
  const normalized = normalizeBlueprintForOnboarding(templateType, blueprint);
  const steps = buildOnboardingSteps(normalized);
  const progress = deployment.customization?.onboardingProgress ?? emptyProgress();
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

// ─── the route ───────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;
  const orgId = guard.orgId;
  if (!orgId) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  if (!deployEnabled()) return NextResponse.json({ ok: true, status: "disabled" });

  const body = (await request.json().catch(() => ({}))) as {
    source?: { templateId?: string; listingSlug?: string };
    phone?: { mode: "forward"; number: string } | { mode: "provision"; areaCode: string };
  };

  const templateId = body.source?.templateId?.trim();
  const listingSlug = body.source?.listingSlug?.trim();

  let resolved: ResolvedSource;
  if (templateId) {
    resolved = await resolveTemplateSource(orgId, templateId);
  } else if (listingSlug) {
    resolved = await resolveListingSource(orgId, listingSlug);
  } else {
    return NextResponse.json({ ok: false, reason: "invalid_source" }, { status: 400 });
  }

  if (!resolved.ok) {
    const status =
      resolved.reason === "invalid_source" || resolved.reason === "invalid_input" ? 400 : 404;
    return NextResponse.json({ ok: false, reason: resolved.reason }, { status });
  }

  let { deployment } = resolved;
  const { templateType, blueprint } = resolved;

  // 2. Readiness.
  const readiness = await resolveDeployReadiness({
    orgId,
    templateType,
    blueprint,
    deployment,
  });
  if (!readiness.ready) {
    const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.seldonframe.com";
    return NextResponse.json({
      ok: true,
      status: "needs_connect",
      deploymentId: deployment.id,
      requirements: readiness.requirements,
      missing: readiness.missing,
      wizardUrl: `${base}${readiness.wizardPath}`,
    });
  }

  // 3. Ready → apply phone (forward → paste-a-number; provision → get-a-number)
  //    then go live. A deployment that already has its number (or needs none)
  //    can skip straight to go-live even with no `phone` in the body.
  const needsNumber = deploymentNeedsNumber(blueprint.trigger, templateType);
  if (needsNumber && !deployment.phoneNumber) {
    if (!body.phone) {
      return NextResponse.json({ ok: false, reason: "phone_required" }, { status: 400 });
    }
    const phoneResult =
      body.phone.mode === "forward"
        ? await applyForwardedNumber(deployment, templateType, blueprint, body.phone.number)
        : await applyProvisionedNumber(orgId, deployment, templateType, blueprint, body.phone.areaCode);

    if (!phoneResult.ok) {
      return NextResponse.json(
        { ok: false, reason: phoneResult.reason, missing: phoneResult.missing },
        { status: 400 },
      );
    }
    deployment = phoneResult.deployment;
  }

  const goLive = await applyGoLive(deployment, templateType, blueprint);
  if (!goLive.ok) {
    return NextResponse.json({ ok: false, reason: goLive.reason }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    status: "live",
    deploymentId: goLive.deployment.id,
    phoneNumber: goLive.deployment.phoneNumber ?? null,
  });
}
