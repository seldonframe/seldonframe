// April 30, 2026 — Stripe meter event reporting.
//
// Two meters are configured in the live Stripe account:
//   `seldonframe_agent_runs` — sum aggregation, billed via the agent
//      runs metered prices on growth + scale subscriptions
//   `seldonframe_contacts`   — last aggregation, billed via the
//      growth contacts metered price (scale has unlimited contacts so
//      no metered line is attached but reporting the count is still
//      useful for usage display)
//
// Reporting model:
//   - Agent runs: emit ONE meter event per workflow_runs row creation
//     (not per step). Called from the dispatcher right after
//     `startRun()` succeeds.
//   - Contacts:  emit ONE meter event per workspace per night with the
//     CURRENT contact count (last aggregation = Stripe stores the
//     latest value). Called from the daily cron.
//
// Both calls are best-effort — failure must NOT block the agent run or
// the cron sweep. Stripe accepts meter events for customers without an
// active metered price (it just logs them); we lean on that so the
// reporting wiring works even before the metered prices exist in the
// Stripe Dashboard.

import Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts, organizations } from "@/db/schema";

let cachedStripe: Stripe | null = null;
function getStripeClient(): Stripe | null {
  if (cachedStripe) return cachedStripe;
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) return null;
  cachedStripe = new Stripe(secretKey, { apiVersion: "2025-08-27.basil" });
  return cachedStripe;
}

async function loadStripeCustomerId(orgId: string): Promise<string | null> {
  const [row] = await db
    .select({ subscription: organizations.subscription })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const sub = row?.subscription;
  if (!sub) return null;
  return typeof sub.stripeCustomerId === "string" && sub.stripeCustomerId
    ? sub.stripeCustomerId
    : null;
}

async function emitMeterEvent(params: {
  stripe: Stripe;
  customerId: string;
  eventName: string;
  value: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    // The Stripe SDK exposes meter events under `billing.meterEvents`.
    // Type cast because some SDK versions name the namespace
    // `meterEvents` and others `meter_events`; the runtime API path is
    // stable. We pass the raw payload Stripe expects (event_name +
    // payload object with stripe_customer_id + value as string).
    const stripeAny = params.stripe as unknown as {
      billing: { meterEvents: { create: (input: unknown) => Promise<unknown> } };
    };
    await stripeAny.billing.meterEvents.create({
      event_name: params.eventName,
      payload: {
        stripe_customer_id: params.customerId,
        value: params.value,
      },
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "unknown_meter_error",
    };
  }
}

/**
 * Report ONE agent run for an org. Called once per workflow_runs row
 * creation — the meter is sum-aggregated so emitting once per run gives
 * Stripe the monthly total automatically.
 *
 * Best-effort: returns silently if (a) no Stripe key is set,
 * (b) the org has no Stripe customer (free tier), or (c) the Stripe
 * API rejects the call. Reporting must never break a workflow run.
 */
export async function reportAgentRunUsage(orgId: string): Promise<void> {
  if (!orgId) return;
  const stripe = getStripeClient();
  if (!stripe) return;

  const customerId = await loadStripeCustomerId(orgId);
  if (!customerId) return; // free tier or unclaimed workspace

  const result = await emitMeterEvent({
    stripe,
    customerId,
    eventName: "seldonframe_agent_runs",
    value: "1",
  });
  if (!result.ok) {
    console.warn(
      `[billing.meters] agent_runs meter event failed for org=${orgId} customer=${customerId}: ${result.reason}`
    );
  }
}

/**
 * Report the current contact count for an org. Meter uses last
 * aggregation, so each event overwrites the stored value — that's why
 * the cron emits once per night with the full current count.
 */
export async function reportContactCount(orgId: string): Promise<{ count: number; reported: boolean }> {
  if (!orgId) return { count: 0, reported: false };
  const stripe = getStripeClient();
  if (!stripe) return { count: 0, reported: false };

  const customerId = await loadStripeCustomerId(orgId);
  if (!customerId) return { count: 0, reported: false };

  const [countRow] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(contacts)
    .where(eq(contacts.orgId, orgId));

  // Neon HTTP returns aggregates as strings — coerce defensively.
  const raw = countRow?.value as unknown;
  const count = Math.max(0, Number(raw ?? 0));
  if (Number.isNaN(count)) {
    console.warn(`[billing.meters] contact count NaN for org=${orgId}`);
    return { count: 0, reported: false };
  }

  const result = await emitMeterEvent({
    stripe,
    customerId,
    eventName: "seldonframe_contacts",
    value: String(Math.floor(count)),
  });
  if (!result.ok) {
    console.warn(
      `[billing.meters] contacts meter event failed for org=${orgId} customer=${customerId}: ${result.reason}`
    );
    return { count, reported: false };
  }
  return { count, reported: true };
}
