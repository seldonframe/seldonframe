// The deploy verb's CORE ORCHESTRATION — extracted from
// app/api/v1/build/deploy/route.ts so it is testable with FAKE deps (no real
// Twilio/Composio/DB). This is what let the C-1 (go-live always "blocked" once
// a number is attached) and C-2 (chat template wrongly demanding a phone)
// regressions through: the route composed its seams inline with no DI seam, so
// there was no way to unit-test the orchestration without a live Postgres +
// Twilio. `runDeploy` is byte-for-byte the same control flow the route used to
// inline in its POST handler; `route.ts` now wires the REAL deps (the DB-backed
// resolveSource, the live resolveDeployReadiness, the Twilio-backed applyPhone,
// the store-backed applyGoLive) and calls this function. The route's JSON
// contract (the DeployResult shapes below) is UNCHANGED — the CLI + MCP tool
// depend on it byte-for-byte.
//
// Auth (guardApiRequest / orgId resolution) stays in route.ts — it reads HTTP
// headers directly and returns a NextResponse, which is a route-level concern,
// not orchestration. `runDeploy` receives the already-resolved `orgId`.

import type { AgentBlueprint } from "@/db/schema/agents";
import type { Deployment } from "@/db/schema/deployments";
import type { DeployReadiness } from "@/lib/deployments/deploy-readiness";

// ─── the four public DeployResult shapes (route's JSON contract) ────────────

export type DeployResultDisabled = { ok: true; status: "disabled" };

export type DeployResultSourceError = {
  ok: false;
  reason: "invalid_source" | "template_not_found" | "listing_not_found" | "invalid_input";
};

export type DeployResultNeedsConnect = {
  ok: true;
  status: "needs_connect";
  deploymentId: string;
  requirements: DeployReadiness["requirements"];
  missing: DeployReadiness["missing"];
  wizardUrl: string;
};

export type DeployResultPhoneRequired = { ok: false; reason: "phone_required" };

export type DeployResultPhoneError = {
  ok: false;
  reason: string;
  missing?: ("twilio" | "trunk")[];
};

export type DeployResultGoLiveError = { ok: false; reason: string };

export type DeployResultLive = {
  ok: true;
  status: "live";
  deploymentId: string;
  phoneNumber: string | null;
};

export type DeployResult =
  | DeployResultDisabled
  | DeployResultSourceError
  | DeployResultNeedsConnect
  | DeployResultPhoneRequired
  | DeployResultPhoneError
  | DeployResultGoLiveError
  | DeployResultLive;

/** The HTTP status the route should respond with for a given result. Mirrors
 *  the status codes route.ts used to inline at each NextResponse.json call. */
export function statusForDeployResult(result: DeployResult): number {
  if (!result.ok) {
    if (result.reason === "invalid_source" || result.reason === "invalid_input") return 400;
    if (result.reason === "template_not_found" || result.reason === "listing_not_found") return 404;
    // phone_required / phone errors / go-live errors all mapped to 400.
    return 400;
  }
  return 200;
}

// ─── input ───────────────────────────────────────────────────────────────────

export type RunDeployInput = {
  orgId: string;
  body: {
    source?: { templateId?: string; listingSlug?: string };
    phone?: { mode: "forward"; number: string } | { mode: "provision"; areaCode: string };
  };
};

// ─── injectable deps (the seams the route wires for real; tests fake) ───────

export type ResolvedSource =
  | { ok: true; deployment: Deployment; templateType: string; blueprint: AgentBlueprint }
  | {
      ok: false;
      reason: "invalid_source" | "template_not_found" | "listing_not_found" | "invalid_input";
    };

export type ApplyPhoneResult =
  | { ok: true; deployment: Deployment; outbound?: true }
  | { ok: false; reason: string; missing?: ("twilio" | "trunk")[] };

export type ApplyGoLiveResult =
  | { ok: true; deployment: Deployment }
  | { ok: false; reason: string };

/**
 * Task 10 — the Tier-0 (SF-managed, zero-connect) fallback's result. Three
 * shapes, not two, because "not offered" and "offered but failed" must be
 * handled differently by the caller:
 *   - `available:false`  → Tier-0 isn't configured/offered at all (the
 *     `provisionSfManagedNumber` `not_configured` case) — a pure no-op the
 *     orchestrator falls through from, straight to the pre-Task-10 behavior
 *     (`phone_required` or the original applyPhone failure), byte-identical.
 *   - `available:true, reason:…` → Tier-0 WAS attempted (it's configured/
 *     offered) but failed for a real reason (insufficient balance, a Twilio-
 *     side error, no numbers in the area) — this is a genuine failure the
 *     caller must see, not something to silently paper over with
 *     phone_required.
 *   - `ok:true` → Tier-0 provisioned a number; the returned deployment has it
 *     attached (mirrors ApplyPhoneResult's ok:true shape).
 */
export type ProvisionSfManagedIfAvailableResult =
  | { ok: true; deployment: Deployment }
  | { ok: false; available: false }
  | { ok: false; available: true; reason: string };

export type RunDeployDeps = {
  /** SF_DEPLOY_ENABLED flag check. */
  deployEnabled: () => boolean;
  /** Resolve (or idempotently create) the deployment from the request body's
   *  `source` (templateId | listingSlug). */
  resolveSource: (orgId: string, body: RunDeployInput["body"]) => Promise<ResolvedSource>;
  /** Compute what's still needed before the deployment can go live. */
  resolveDeployReadiness: (args: {
    orgId: string;
    templateType: string;
    blueprint: AgentBlueprint;
    deployment: Deployment;
  }) => Promise<DeployReadiness>;
  /** Whether this template+blueprint needs its own phone number (the
   *  surface-correct check — callers must resolve the SURFACE, not pass the
   *  raw templateType, per the C-2 fix). */
  deploymentNeedsNumber: (blueprint: AgentBlueprint, templateType: string) => boolean;
  /** Attach a phone number per the body's `phone` mode (forward | provision). */
  applyPhone: (
    orgId: string,
    deployment: Deployment,
    templateType: string,
    blueprint: AgentBlueprint,
    phone: NonNullable<RunDeployInput["body"]["phone"]>,
  ) => Promise<ApplyPhoneResult>;
  /**
   * Task 10 — the deploy-verb Tier-0 payoff. Tried whenever a number is
   * needed, none is attached, and the flow would otherwise fall back on
   * missing BYO Twilio creds (no `phone` in the body at all, OR `applyPhone`
   * failing specifically because BYO creds are missing) — i.e. exactly the
   * "no BYO creds" gap Tier-0 exists to fill. The real wiring
   * (buildDefaultProvisionSfManagedDeps) checks voiceManagedEnabled + master
   * creds + wallet balance internally and reports `available:false` with
   * ZERO side effects when Tier-0 isn't a live option for this deploy.
   */
  provisionSfManagedIfAvailable: (
    orgId: string,
    deployment: Deployment,
  ) => Promise<ProvisionSfManagedIfAvailableResult>;
  /** Compute the go-live wizard URL base for a `needs_connect` response. */
  wizardUrlFor: (wizardPath: string) => string;
  /** Flip the deployment live, gated on onboarding completeness. */
  applyGoLive: (
    deployment: Deployment,
    templateType: string,
    blueprint: AgentBlueprint,
  ) => Promise<ApplyGoLiveResult>;
};

// ─── runDeploy — the extracted orchestration ─────────────────────────────────

/**
 * The deploy verb's core orchestration, DI'd over `deps` so it is unit-testable
 * with fakes (no live Postgres/Twilio/Composio). Mirrors route.ts's POST
 * handler control flow exactly (post auth + flag gate):
 *
 *   1. flag off               → {status:"disabled"}
 *   2. resolve source (fails) → the typed source error
 *   3. readiness not ready    → {status:"needs_connect", wizardUrl, …}
 *   4. needs a number + none attached:
 *        4a. no `phone` in body → try Tier-0 FIRST (the "ZERO connects"
 *            payoff: a funded wallet needs no body input at all). Tier-0
 *            unavailable → {reason:"phone_required"}, byte-identical to
 *            pre-Task-10.
 *        4b. `phone` in body → apply it (BYO forward/provision). On failure,
 *            Tier-0 rescues ONLY when it's actually available — an
 *            unavailable Tier-0 surfaces the ORIGINAL applyPhone failure
 *            unchanged (never silently swaps a caller-visible reason).
 *        Either path: a Tier-0 attempt that IS available but fails for a
 *        real reason (insufficient_balance / twilio_error / …) is a hard
 *        failure — it rides the pre-existing `{ok:false,reason}` shape, so
 *        the JSON contract never grows a new top-level field.
 *   5. go live (fails)    → the go-live error (typically {reason:"blocked"})
 *   6. otherwise          → {status:"live", deploymentId, phoneNumber}
 */
export async function runDeploy(
  input: RunDeployInput,
  deps: RunDeployDeps,
): Promise<DeployResult> {
  if (!deps.deployEnabled()) return { ok: true, status: "disabled" };

  const resolved = await deps.resolveSource(input.orgId, input.body);
  if (!resolved.ok) return { ok: false, reason: resolved.reason };

  let { deployment } = resolved;
  const { templateType, blueprint } = resolved;

  // 2. Readiness.
  const readiness = await deps.resolveDeployReadiness({
    orgId: input.orgId,
    templateType,
    blueprint,
    deployment,
  });
  if (!readiness.ready) {
    return {
      ok: true,
      status: "needs_connect",
      deploymentId: deployment.id,
      requirements: readiness.requirements,
      missing: readiness.missing,
      wizardUrl: deps.wizardUrlFor(readiness.wizardPath),
    };
  }

  // 3. Ready → apply phone (forward → paste-a-number; provision → get-a-number;
  //    or Tier-0 → an instant SF-provisioned number, zero connects) then go
  //    live. A deployment that already has its number (or needs none) can
  //    skip straight to go-live even with no `phone` in the body.
  const needsNumber = deps.deploymentNeedsNumber(blueprint, templateType);
  if (needsNumber && !deployment.phoneNumber) {
    if (!input.body.phone) {
      // No phone input at all — the deploy-verb Tier-0 payoff (Task 10):
      // try SF's zero-connect instant number BEFORE demanding one from the
      // caller. Unavailable (not configured / wallet not funded) → the
      // pre-Task-10 behavior, byte-identical.
      const tier0 = await deps.provisionSfManagedIfAvailable(input.orgId, deployment);
      if (tier0.ok) {
        deployment = tier0.deployment;
      } else if (tier0.available) {
        return { ok: false, reason: tier0.reason };
      } else {
        return { ok: false, reason: "phone_required" };
      }
    } else {
      const phoneResult = await deps.applyPhone(
        input.orgId,
        deployment,
        templateType,
        blueprint,
        input.body.phone,
      );
      if (phoneResult.ok) {
        deployment = phoneResult.deployment;
      } else {
        // BYO failed — Tier-0 rescues ONLY when it's a live option; an
        // unavailable Tier-0 must not mask the original, caller-supplied
        // phone mode's real failure reason.
        const tier0 = await deps.provisionSfManagedIfAvailable(input.orgId, deployment);
        if (tier0.ok) {
          deployment = tier0.deployment;
        } else if (tier0.available) {
          return { ok: false, reason: tier0.reason };
        } else {
          return { ok: false, reason: phoneResult.reason, missing: phoneResult.missing };
        }
      }
    }
  }

  const goLive = await deps.applyGoLive(deployment, templateType, blueprint);
  if (!goLive.ok) {
    return { ok: false, reason: goLive.reason };
  }

  return {
    ok: true,
    status: "live",
    deploymentId: goLive.deployment.id,
    phoneNumber: goLive.deployment.phoneNumber ?? null,
  };
}
