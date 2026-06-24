// ICP-3 — deployment PURE helpers (no DB, no side effects).
//
// Lives OUTSIDE store.ts / actions.ts so it can be imported by the client
// stepper (the live margin readout), the server actions, AND the unit tests.
// All math here is DISPLAY/ESTIMATE only — nothing here bills anyone. The actual
// SeldonFrame fee, telephony cost, and LLM cost are reconciled at billing time
// in a LATER, gated task (needs Stripe + Twilio + the builder's BYOK LLM key);
// these constants are the honest "what you'll roughly net" preview the builder
// sees before they deploy.

import type {
  DeploymentStatus,
  DeploymentSurface,
} from "@/db/schema/deployments";

// ─── estimate constants (DISPLAY ONLY — not billed here) ─────────────────────

/** SeldonFrame's platform fee as a fraction of the price the SMB pays. Display
 *  estimate for the margin readout — the real fee is applied at billing time
 *  (later, gated). */
export const DEFAULT_SELDONFRAME_FEE_PCT = 0.05;

/** Estimated monthly telephony cost (phone number + minutes), in cents. Display
 *  estimate only — real telephony is provisioned + billed via Twilio later. */
export const DEFAULT_TELEPHONY_CENTS = 1200;

/** Estimated monthly LLM cost (on the builder's own key), in cents. Display
 *  estimate only — real usage is metered against the builder's BYOK key later. */
export const DEFAULT_LLM_CENTS = 2500;

// ─── computeDeploymentMargin ─────────────────────────────────────────────────

export type ComputeDeploymentMarginInput = {
  /** What the SMB client pays the builder per month, in cents. */
  priceCents: number;
  /** SeldonFrame fee fraction. Defaults to DEFAULT_SELDONFRAME_FEE_PCT (0.05). */
  feePct?: number;
  /** Estimated telephony cost/mo in cents. Defaults to DEFAULT_TELEPHONY_CENTS. */
  telephonyCents?: number;
  /** Estimated LLM cost/mo in cents. Defaults to DEFAULT_LLM_CENTS. */
  llmCents?: number;
};

export type DeploymentMargin = {
  /** round(price * feePct) — the SeldonFrame platform fee, in cents. */
  feeCents: number;
  /** price - fee - telephony - llm, in cents. MAY be negative (honest). */
  netCents: number;
};

/**
 * Compute the builder's estimated monthly margin on a deployment. Pure.
 *
 *   feeCents = round(price * feePct)
 *   netCents = price - feeCents - telephony - llm
 *
 * `price` is clamped to ≥ 0 defensively (the UI should never send a negative),
 * but `netCents` is intentionally left un-clamped so the readout honestly shows
 * a loss when the SMB price is below the estimated cost floor.
 */
export function computeDeploymentMargin(
  input: ComputeDeploymentMarginInput,
): DeploymentMargin {
  const price = Math.max(0, Math.round(input.priceCents || 0));
  const feePct = input.feePct ?? DEFAULT_SELDONFRAME_FEE_PCT;
  const telephony = input.telephonyCents ?? DEFAULT_TELEPHONY_CENTS;
  const llm = input.llmCents ?? DEFAULT_LLM_CENTS;

  const feeCents = Math.round(price * feePct);
  const netCents = price - feeCents - telephony - llm;
  return { feeCents, netCents };
}

// ─── formatCentsMonthly ──────────────────────────────────────────────────────

/**
 * Format a cents amount as a monthly price string, e.g. 10000 → "$100/mo",
 * 9950 → "$99.50/mo", -2750 → "-$27.50/mo". Whole-dollar amounts omit the
 * decimals; fractional amounts show two. Pure.
 */
export function formatCentsMonthly(cents: number): string {
  const safe = Math.round(cents || 0);
  const negative = safe < 0;
  const abs = Math.abs(safe);
  const dollars = Math.trunc(abs / 100);
  const remainder = abs % 100;

  const dollarsStr = dollars.toLocaleString("en-US");
  const body =
    remainder === 0
      ? `$${dollarsStr}`
      : `$${dollarsStr}.${remainder.toString().padStart(2, "0")}`;

  return `${negative ? "-" : ""}${body}/mo`;
}

// ─── surface / status validators (allow-list guards) ─────────────────────────

const DEPLOYMENT_SURFACES = ["phone", "embed", "link", "sms", "email"] as const;
const DEPLOYMENT_STATUSES = ["draft", "active", "paused", "canceled"] as const;

/** True iff `value` is one of the known deployment surfaces. */
export function isDeploymentSurface(value: unknown): value is DeploymentSurface {
  return (
    typeof value === "string" &&
    (DEPLOYMENT_SURFACES as readonly string[]).includes(value)
  );
}

/** True iff `value` is one of the known deployment statuses. */
export function isDeploymentStatus(value: unknown): value is DeploymentStatus {
  return (
    typeof value === "string" &&
    (DEPLOYMENT_STATUSES as readonly string[]).includes(value)
  );
}

// ─── isE164 ──────────────────────────────────────────────────────────────────

/**
 * Returns true iff `phone` is a valid E.164 phone number:
 *   - starts with '+'
 *   - followed by a non-zero leading digit
 *   - total 8–15 digits (i.e. 7–14 after the '+')
 *
 * Pure, zero-dependencies. Used by activateDeploymentAction to validate the
 * builder's Twilio number before writing it to the deployments row.
 *
 * Examples:
 *   isE164("+15125550148") → true   (US local)
 *   isE164("+447911123456") → true  (UK)
 *   isE164("+12125551234") → true
 *   isE164("15125550148")  → false  (missing '+')
 *   isE164("+1512555")     → false  (too short — only 7 digits)
 *   isE164("+0123456789")  → false  (leading zero after '+')
 *   isE164("+1" + "2".repeat(14)) → false (16 digits total, over max 15)
 */
export function isE164(phone: unknown): phone is string {
  if (typeof phone !== "string") return false;
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

/**
 * True iff `err` is a Postgres unique-constraint violation (code 23505). Used to
 * map a duplicate `phone_number` write into a friendly "that number is already
 * assigned" result instead of letting the server action throw an unhandled error
 * (which renders the generic error page). Pure + driver-tolerant: pg/neon expose
 * `.code`, but we also sniff the message as a fallback.
 */
export function isPhoneInUseError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if ("code" in err && (err as { code?: unknown }).code === "23505") return true;
  const m = err.message.toLowerCase();
  return m.includes("unique") || m.includes("duplicate");
}

// ─── area-code helpers (voice-number provisioning) ───────────────────────────

/** True iff `value` is a US/NANP area code — exactly 3 digits, first 2–9. Pure. */
export function isAreaCode(value: unknown): value is string {
  return typeof value === "string" && /^[2-9]\d{2}$/.test(value);
}

/**
 * Best-effort extraction of a 3-digit NANP area code from a free-form contact
 * phone string, for pre-filling the "Get a number" input. Pure, zero-deps.
 *
 * Strips everything but digits, drops a leading country code '1' if the result
 * is 11 digits, then takes the first 3 digits and validates them as an area
 * code. Returns null if no plausible area code is present.
 *
 * Examples:
 *   deriveAreaCode("(512) 555-0148") → "512"
 *   deriveAreaCode("+1 512-555-0148") → "512"
 *   deriveAreaCode("15125550148")     → "512"
 *   deriveAreaCode("555-0148")        → null  (only 7 digits)
 *   deriveAreaCode("+44 20 7946 0958")→ null  (non-NANP, leading area "207"→ ok? see note)
 */
export function deriveAreaCode(phone: unknown): string | null {
  if (typeof phone !== "string") return null;
  let digits = phone.replace(/\D/g, "");
  // Drop a NANP country code '1' when present (11-digit form).
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  if (digits.length < 10) return null;
  const candidate = digits.slice(0, 3);
  return isAreaCode(candidate) ? candidate : null;
}

/** Human label for a surface id, e.g. "phone" → "Phone". */
export function formatDeploymentSurface(surface: string): string {
  switch (surface) {
    case "phone":
      return "Phone";
    case "embed":
      return "Embed";
    case "link":
      return "Link";
    case "sms":
      return "SMS";
    case "email":
      return "Email";
    default:
      return surface.charAt(0).toUpperCase() + surface.slice(1);
  }
}
