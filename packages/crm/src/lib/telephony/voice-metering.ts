// Voice metering — the PURE math for the 3-tier voice billing (spec
// 2026-07-01-voice-deploy-metered-billing). No I/O. Rates are env-overridable;
// keys mirror the wallet's debit:<runId> idempotency convention. Ceil-to-minute
// matches how Twilio bills SF, so builder-billing and SF COGS use the same unit.

type Env = Record<string, string | undefined>;

export const ACCEPT_FLOOR_MICROS = 1_000_000;       // $1 ≈ 6 min headroom to accept a metered call
export const TIER0_READY_FLOOR_MICROS = 5_000_000;  // $5 to provision an SF-managed number

const DEFAULT_RATE_MICROS_PER_MIN = 150_000;   // $0.15/min
const DEFAULT_RENT_MICROS = 1_500_000;         // $1.50/mo

function envInt(env: Env, key: string, fallback: number): number {
  const v = Number(env[key]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

export function voiceRateMicrosPerMin(env: Env): number {
  return envInt(env, "SF_VOICE_RATE_MICROS_PER_MIN", DEFAULT_RATE_MICROS_PER_MIN);
}
export function numberRentMicros(env: Env): number {
  return envInt(env, "SF_NUMBER_RENT_MICROS", DEFAULT_RENT_MICROS);
}
export function voiceManagedEnabled(env: Env): boolean {
  return env.SF_VOICE_MANAGED === "1" || env.SF_VOICE_MANAGED === "true";
}

/** Whole billed minutes: ceil(seconds/60); 0/negative/NaN → 0 (never charge a non-call). */
export function ceilMinutes(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.ceil(seconds / 60);
}

export function voiceDebitMicros(seconds: number, rateMicros: number): number {
  return ceilMinutes(seconds) * rateMicros;
}

export function voiceDebitKey(callId: string): string {
  return `voice:${callId}`;
}

/** UTC month key for rent idempotency: "YYYY-MM". */
export function rentMonthKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function shouldAcceptMeteredCall(balanceMicros: number): boolean {
  return balanceMicros >= ACCEPT_FLOOR_MICROS;
}
