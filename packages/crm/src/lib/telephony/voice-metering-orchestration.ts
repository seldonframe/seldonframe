// Voice metering orchestration — the DI "money brain" (spec
// 2026-07-01-voice-deploy-metered-billing). Pure decision logic with
// injected I/O: decide whether to accept a metered call and how much to
// debit at hang-up. Never crashes a live call path — balance-read failures
// fail OPEN (accept the call), debit failures fail SOFT (metered:false).

import { voiceRateMicrosPerMin, voiceDebitMicros, shouldAcceptMeteredCall, voiceManagedEnabled } from "./voice-metering";

type Env = Record<string, string | undefined>;

export type GateDeps = { env: Env; getBalanceMicros(orgId: string): Promise<number> };
export type GateResult = { accept: true } | { accept: false; reason: "flag_off_unmetered" | "low_balance" };

/**
 * Assumes metering already applies — the caller only invokes this gate when
 * isMeteredCall() is true. Fails OPEN: a thrown balance read never drops a
 * live call to a metering hiccup.
 */
export async function gateMeteredAccept(orgId: string, deps: GateDeps): Promise<GateResult> {
  let balanceMicros: number;
  try {
    balanceMicros = await deps.getBalanceMicros(orgId);
  } catch {
    return { accept: true };
  }
  return shouldAcceptMeteredCall(balanceMicros) ? { accept: true } : { accept: false, reason: "low_balance" };
}

export type MeterEndDeps = {
  env: Env;
  debitVoiceUsage(a: { orgId: string; callId: string; amountMicros: number }): Promise<{ ok: true; applied: boolean; duplicate: boolean; drainedMicros: number; shortfallMicros: number }>;
  onShortfall(orgId: string): Promise<void>; // suspend/delinquent hook — fail-soft inside
};
export type MeterEndResult = { metered: false } | { metered: true; amountMicros: number; shortfallMicros: number };

export async function meterCallEnd(a: { orgId: string; callId: string; seconds: number }, deps: MeterEndDeps): Promise<MeterEndResult> {
  const amountMicros = voiceDebitMicros(a.seconds, voiceRateMicrosPerMin(deps.env));
  if (amountMicros === 0) return { metered: false };

  let shortfallMicros: number;
  try {
    const result = await deps.debitVoiceUsage({ orgId: a.orgId, callId: a.callId, amountMicros });
    shortfallMicros = result.shortfallMicros;
  } catch {
    return { metered: false };
  }

  if (shortfallMicros > 0) {
    try {
      await deps.onShortfall(a.orgId);
    } catch {
      // fail-soft — never let the suspend/delinquent hook crash the call path
    }
  }

  return { metered: true, amountMicros, shortfallMicros };
}

/**
 * = voiceManagedEnabled(env) && viaDeployment && !perOrgWebhook
 * Legacy workspace path (viaDeployment=false) is never metered.
 * Tier 2 (perOrgWebhook=true, BYO-everything) is never metered.
 */
export function isMeteredCall(a: { env: Env; viaDeployment: boolean; perOrgWebhook: boolean }): boolean {
  return voiceManagedEnabled(a.env) && a.viaDeployment && !a.perOrgWebhook;
}
