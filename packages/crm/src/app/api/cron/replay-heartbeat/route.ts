// Inbound-chain dead-man's switch (roadmap #7, 2026-07-18) — the daily
// heartbeat that would have caught the 2026-07-16 incident: the email-agent
// chain died silently for two days (canceled deployments upstream) and
// nobody noticed until traces were missing.
//
// PLATFORM-OPERATOR CRON: this route is NOT a per-org dashboard read. It
// sweeps every org's ACTIVE email-surface deployments in one pass — there is
// no request-supplied orgId to scope against (the usual "resolve org from
// host, never from body" invariant doesn't apply here; this route has no
// org-scoped body/host to resolve at all). Auth is CRON_SECRET only, same
// fail-closed pattern as api/cron/usage-caps/route.ts.
//
// Read-only + one optional email send: this route never mutates deployment
// or trace rows. All math lives in lib/deployments/replay/heartbeat.ts
// (computeHeartbeat, unit-tested with DI fakes, no DB) — this route only
// wires the real DB reads + the real email send via
// lib/notifications/ops-notifications.ts::sendReplayHeartbeatAlert.
//
// Email is sent ONLY when at least one deployment is 'silent' (quiet when
// healthy — no email on a clean sweep). Email failures are fail-soft
// (sendReplayHeartbeatAlert never throws — see its header) so a Resend
// outage never turns this cron red. Always returns JSON status for the cron
// log regardless of whether an email was sent.
//
// Schedule: registered in vercel.json at "30 7 * * *" (daily 07:30 UTC) —
// 30 minutes after the usage-caps sweep so the two platform-operator crons
// don't collide.

import { getHeartbeat, type HeartbeatDeploymentResult, type HeartbeatResult } from "@/lib/deployments/replay/heartbeat";
import { sendReplayHeartbeatAlert } from "@/lib/notifications/ops-notifications";

export const runtime = "nodejs";

let warnedMissingSecret = false;

// Exported so the route's auth gate is directly testable without importing
// the whole route module's request-handling path.
export function isAuthorized(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;

  if (!configuredSecret) {
    if (!warnedMissingSecret) {
      console.warn(
        "[replay-heartbeat] CRON_SECRET is unset — fail-closed, denying all requests. This route reads deployments/traces across every org and sends email; it must not run unauthenticated."
      );
      warnedMissingSecret = true;
    }
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${configuredSecret}`) {
    return true;
  }

  const cronHeader = request.headers.get("x-cron-secret");
  return cronHeader === configuredSecret;
}

function toSilentRow(d: HeartbeatDeploymentResult) {
  return {
    deploymentId: d.deploymentId,
    clientName: d.clientName,
    orgName: d.orgName,
    orgId: d.orgId,
    // Guaranteed non-null for status === 'silent' — see heartbeat.ts's
    // computeHeartbeat (only 'never' rows carry a null hoursSinceActivity).
    hoursSinceActivity: d.hoursSinceActivity ?? 0,
  };
}

export type RunHeartbeatCronDeps = {
  getHeartbeat?: () => Promise<HeartbeatResult>;
  sendReplayHeartbeatAlert?: typeof sendReplayHeartbeatAlert;
};

// DI-injectable core so "email sent only when silent exists" and "email
// failure still returns 200" are unit-testable without mocking modules
// (mirrors set-booking-policy.spec.ts's rationale: tsx's CJS interop makes
// mock.module unreliable for @/ imports in this repo — inject instead).
export async function runHeartbeatCron(deps: RunHeartbeatCronDeps = {}) {
  const fetchHeartbeat = deps.getHeartbeat ?? getHeartbeat;
  const sendAlert = deps.sendReplayHeartbeatAlert ?? sendReplayHeartbeatAlert;

  const result = await fetchHeartbeat();
  const silent = result.deployments.filter((d) => d.status === "silent");

  if (silent.length > 0) {
    try {
      await sendAlert({ silentDeployments: silent.map(toSilentRow) });
    } catch (err) {
      // sendReplayHeartbeatAlert already fail-softs internally (never
      // throws — see its header), but guard here too so a future change to
      // that contract can never take this cron down.
      console.warn(
        JSON.stringify({
          event: "replay_heartbeat_email_failed",
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  return {
    generatedAt: result.generatedAt.toISOString(),
    deploymentsChecked: result.deployments.length,
    silentCount: result.silentCount,
    neverCount: result.deployments.filter((d) => d.status === "never").length,
    okCount: result.deployments.filter((d) => d.status === "ok").length,
    lastReceiptAt: result.lastReceiptAt ? result.lastReceiptAt.toISOString() : null,
    emailSent: silent.length > 0,
    silentDeployments: silent.map((d) => ({
      deploymentId: d.deploymentId,
      clientName: d.clientName,
      orgId: d.orgId,
      orgName: d.orgName,
      hoursSinceActivity: d.hoursSinceActivity,
    })),
  };
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(await runHeartbeatCron());
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(await runHeartbeatCron());
}
