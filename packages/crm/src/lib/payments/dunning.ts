// packages/crm/src/lib/payments/dunning.ts
//
// Autopay console (2026-07-08) — Task 4: dunning NOTIFICATIONS, never
// charges. Stripe's own smart retries handle re-charging the card on the
// connected account; this cron ONLY notifies the client (hosted-invoice pay
// link) and the agency (an alert), escalating once per threshold via
// metadata.dunning.notifyStage on the payment_records row Task 1 already
// writes. Mirrors checkUsageCapBreaches's shape (lib/billing/usage-cap.ts):
// a DI'd sweep, one bad row logged + skipped rather than aborting the whole
// cron, dryRun computes without sending or mutating.
//
// MONEY-SAFETY: THE CRON NEVER CALLS STRIPE. There is no Stripe import, no
// Stripe-shaped dependency anywhere in this file.

const NOTIFY_STAGE_0_AGE_DAYS = 3;
const NOTIFY_STAGE_1_AGE_DAYS = 7;
const MAX_NOTIFY_STAGE = 2;

export type FailedPaymentRow = {
  id: string;
  orgId: string;
  contactId: string | null;
  amount: string;
  currency: string;
  metadata: Record<string, unknown>;
};

type DunningMeta = {
  failedAt: string;
  notifyStage: number;
};

/** Tolerant parse of metadata.dunning — malformed/absent → null (skip). */
function parseDunning(metadata: Record<string, unknown>): DunningMeta | null {
  const raw = metadata?.dunning;
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.failedAt !== "string" || typeof obj.notifyStage !== "number") return null;
  return { failedAt: obj.failedAt, notifyStage: obj.notifyStage };
}

export type DunningSweepDeps = {
  /** Every payment_records row with status "failed" that hasn't hit
   *  MAX_NOTIFY_STAGE yet — the cron's candidate list (filtered at the SQL
   *  layer so this never pages through completed rows). */
  listFailedPayments: () => Promise<FailedPaymentRow[]>;
  resolveContactEmail: (contactId: string) => Promise<string | null>;
  resolveAgencyNotifyTarget: (agencyOrgId: string) => Promise<{ agencyName: string; toEmail: string } | null>;
  sendClientEmail: (params: {
    paymentId: string;
    toEmail: string;
    orgId: string;
    amount: string;
    currency: string;
    hostedInvoiceUrl: string | null;
  }) => Promise<void>;
  sendAgencyAlert: (params: {
    agencyName: string;
    toEmail: string;
    amount: string;
    currency: string;
    stage: number;
  }) => Promise<void>;
  stampDunning: (paymentId: string, metadata: Record<string, unknown>) => Promise<void>;
  now: () => Date;
};

export type DunningSweepResult = {
  scanned: number;
  notified: number;
  skipped: Array<{ id: string; reason: string }>;
};

/** The daily cron body — notify-only, THE CRON NEVER CALLS STRIPE. dryRun
 *  computes the SAME notified count but sends nothing and stamps nothing
 *  (mirrors checkUsageCapBreaches's ?dryRun=1 shape exactly). A single row's
 *  failure is recorded in `skipped` and the sweep continues. */
export async function runPaymentDunningSweep(
  deps: DunningSweepDeps,
  options: { dryRun?: boolean } = {},
): Promise<DunningSweepResult> {
  const now = deps.now();
  const rows = await deps.listFailedPayments();
  const skipped: Array<{ id: string; reason: string }> = [];
  let notified = 0;

  for (const row of rows) {
    try {
      const dunning = parseDunning(row.metadata);
      if (!dunning) {
        skipped.push({ id: row.id, reason: "no_dunning_metadata" });
        continue;
      }

      if (row.metadata.resolvedByLaterPayment === true) {
        skipped.push({ id: row.id, reason: "resolved_by_later_payment" });
        continue;
      }

      if (dunning.notifyStage >= MAX_NOTIFY_STAGE) {
        skipped.push({ id: row.id, reason: "max_notify_stage_reached" });
        continue;
      }

      const failedAt = new Date(dunning.failedAt);
      const ageDays = (now.getTime() - failedAt.getTime()) / (24 * 60 * 60 * 1000);

      const threshold = dunning.notifyStage === 0 ? NOTIFY_STAGE_0_AGE_DAYS : NOTIFY_STAGE_1_AGE_DAYS;
      if (ageDays < threshold) {
        skipped.push({ id: row.id, reason: "age_below_threshold" });
        continue;
      }

      if (!row.contactId) {
        skipped.push({ id: row.id, reason: "no_contact" });
        continue;
      }
      const clientEmail = await deps.resolveContactEmail(row.contactId);
      if (!clientEmail) {
        skipped.push({ id: row.id, reason: "no_client_email" });
        continue;
      }

      const target = await deps.resolveAgencyNotifyTarget(row.orgId);
      if (!target?.toEmail) {
        skipped.push({ id: row.id, reason: "no_agency_email" });
        continue;
      }

      const nextStage = dunning.notifyStage + 1;

      if (options.dryRun) {
        notified += 1;
        continue;
      }

      const hostedInvoiceUrl = typeof row.metadata.hostedInvoiceUrl === "string" ? row.metadata.hostedInvoiceUrl : null;

      await deps.sendClientEmail({
        paymentId: row.id,
        toEmail: clientEmail,
        orgId: row.orgId,
        amount: row.amount,
        currency: row.currency,
        hostedInvoiceUrl,
      });

      await deps.sendAgencyAlert({
        agencyName: target.agencyName,
        toEmail: target.toEmail,
        amount: row.amount,
        currency: row.currency,
        stage: nextStage,
      });

      await deps.stampDunning(row.id, {
        ...row.metadata,
        dunning: { ...dunning, notifyStage: nextStage },
      });

      notified += 1;
    } catch (err) {
      skipped.push({ id: row.id, reason: err instanceof Error ? err.message : "unknown_error" });
    }
  }

  return { scanned: rows.length, notified, skipped };
}
