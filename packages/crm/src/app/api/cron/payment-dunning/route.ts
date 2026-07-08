// Autopay console (2026-07-08) — Task 4: the daily dunning-notification
// sweep. Copies the shape of api/cron/usage-caps/route.ts: CRON_SECRET
// fail-closed auth, ?dryRun=1, registered in vercel.json alongside the other
// crons. All business logic lives in lib/payments/dunning.ts::runPaymentDunningSweep
// (unit-tested with DI fakes, no DB) — this route only wires the real DB
// reads + the real email sends.
//
// MONEY-SAFETY: THE CRON NEVER CALLS STRIPE. Stripe's own smart retries
// handle re-charging the card on file; this route only notifies.

import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts, paymentRecords } from "@/db/schema";
import { runPaymentDunningSweep, type FailedPaymentRow } from "@/lib/payments/dunning";
import { resolveAgencyNotifyTarget } from "@/lib/billing/usage-cap";
import { sendPaymentFailedAlert } from "@/lib/notifications/ops-notifications";
import { sendEmailFromApi } from "@/lib/emails/api";

export const runtime = "nodejs";

let warnedMissingSecret = false;

function isAuthorized(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;

  if (!configuredSecret) {
    if (!warnedMissingSecret) {
      console.warn(
        "[payment-dunning] CRON_SECRET is unset — fail-closed, denying all requests. This route reads billing data and sends emails and must not run unauthenticated."
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

function parseDryRun(request: Request): boolean {
  const url = new URL(request.url);
  const value = url.searchParams.get("dryRun");
  return value === "1" || value === "true";
}

// Only rows this cron could possibly act on: status "failed", sourceBlock
// "retainer", notifyStage below the cap (2) — filtered at the SQL layer via
// the jsonb path so the sweep never pages through resolved/capped rows.
async function listFailedPaymentsReal(): Promise<FailedPaymentRow[]> {
  const rows = await db
    .select({
      id: paymentRecords.id,
      orgId: paymentRecords.orgId,
      contactId: paymentRecords.contactId,
      amount: paymentRecords.amount,
      currency: paymentRecords.currency,
      metadata: paymentRecords.metadata,
    })
    .from(paymentRecords)
    .where(
      and(
        eq(paymentRecords.status, "failed"),
        eq(paymentRecords.sourceBlock, "retainer"),
        lt(sql`coalesce((${paymentRecords.metadata}->'dunning'->>'notifyStage')::int, 0)`, 2),
      ),
    );
  return rows as FailedPaymentRow[];
}

async function resolveContactEmailReal(contactId: string): Promise<string | null> {
  const [row] = await db.select({ email: contacts.email }).from(contacts).where(eq(contacts.id, contactId)).limit(1);
  return row?.email ?? null;
}

async function stampDunningReal(paymentId: string, metadata: Record<string, unknown>): Promise<void> {
  await db.update(paymentRecords).set({ metadata, updatedAt: new Date() }).where(eq(paymentRecords.id, paymentId));
}

async function run(request: Request) {
  const dryRun = parseDryRun(request);

  return runPaymentDunningSweep(
    {
      listFailedPayments: listFailedPaymentsReal,
      resolveContactEmail: resolveContactEmailReal,
      resolveAgencyNotifyTarget: async (agencyOrgId) => {
        const target = await resolveAgencyNotifyTarget(agencyOrgId);
        if (!target?.toEmail) return null;
        return { agencyName: target.agencyName ?? "Your agency", toEmail: target.toEmail };
      },
      sendClientEmail: async (params) => {
        const payLink = params.hostedInvoiceUrl;
        const amountDisplay = `$${Number(params.amount).toFixed(2)} ${params.currency}`;
        await sendEmailFromApi({
          orgId: params.orgId,
          userId: null,
          contactId: null,
          toEmail: params.toEmail,
          subject: `Your retainer payment didn't go through`,
          body: `We tried to charge your card on file for ${amountDisplay} and it didn't go through.\n\n${
            payLink
              ? `You can update your payment method or pay this invoice directly here: ${payLink}`
              : "Please reach out to update your payment method."
          }`,
          ctaLabel: payLink ? "Update payment →" : undefined,
          ctaHref: payLink ?? undefined,
        });
      },
      sendAgencyAlert: async (params) => {
        await sendPaymentFailedAlert(params);
      },
      stampDunning: stampDunningReal,
      now: () => new Date(),
    },
    { dryRun },
  );
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(await run(request));
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(await run(request));
}
