"use server";

// Autopay console Task 2 — the agency-facing server actions for the client
// card's "Billing & retainer" editor. Org-scoped: the caller's OWN builder
// org must resolve (via resolveBuilderAgency — the SAME lookup the deploy-to-
// client flow + the usage-cap editor already use) to the SAME agency the
// target client org is attached to. Mirrors setSubAccountUsageCapAction's
// shape exactly (lib/deployments/actions.ts:1084).

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema/organizations";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { resolveBuilderAgency } from "@/lib/deployments/store";
import {
  createClientRetainer,
  cancelClientRetainer,
  defaultCancelRetainerDeps,
  type CreateClientRetainerCheckoutResult,
  type CancelClientRetainerResult,
} from "@/lib/payments/retainer";
import { sendEmailFromApi } from "@/lib/emails/api";
import { logEvent } from "@/lib/observability/log";

/** Org-scoped authz: does callerOrgId's agency own targetClientOrgId? Mirrors
 *  authorizeUsageCapSetterForOrg's shape (lib/billing/usage-cap.ts) but
 *  inlined here since it's a 2-line check and this module already imports
 *  resolveBuilderAgency directly. Fail-closed on any error. */
async function authorizeRetainerCaller(callerOrgId: string, targetClientOrgId: string): Promise<boolean> {
  try {
    const [callerAgencyId, targetOrg] = await Promise.all([
      resolveBuilderAgency(callerOrgId),
      db
        .select({ parentAgencyId: organizations.parentAgencyId })
        .from(organizations)
        .where(eq(organizations.id, targetClientOrgId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
    ]);
    if (!callerAgencyId || !targetOrg?.parentAgencyId) return false;
    return callerAgencyId === targetOrg.parentAgencyId;
  } catch {
    return false;
  }
}

// ── create-retainer-checkout-link ────────────────────────────────────────

type CreateRetainerCheckoutFailureReason = Extract<CreateClientRetainerCheckoutResult, { ok: false }>["reason"];

export type CreateRetainerCheckoutLinkActionResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; error: "unauthorized" | "invalid_input" | CreateRetainerCheckoutFailureReason };

export async function createRetainerCheckoutLinkAction(input: {
  clientOrgId: string;
  contactEmail: string;
  contactName: string;
  monthlyPriceCents: number;
  setupFeeCents?: number;
}): Promise<CreateRetainerCheckoutLinkActionResult> {
  assertWritable();

  const callerOrgId = await getOrgId();
  if (!callerOrgId) return { ok: false, error: "unauthorized" };

  if (!input.clientOrgId || typeof input.clientOrgId !== "string") {
    return { ok: false, error: "invalid_input" };
  }
  const email = input.contactEmail?.trim();
  const name = input.contactName?.trim();
  if (!email || !name) return { ok: false, error: "invalid_input" };
  if (
    typeof input.monthlyPriceCents !== "number" ||
    !Number.isFinite(input.monthlyPriceCents) ||
    input.monthlyPriceCents <= 0
  ) {
    return { ok: false, error: "invalid_input" };
  }
  if (
    input.setupFeeCents !== undefined &&
    (typeof input.setupFeeCents !== "number" || !Number.isFinite(input.setupFeeCents) || input.setupFeeCents < 0)
  ) {
    return { ok: false, error: "invalid_input" };
  }

  const authorized = await authorizeRetainerCaller(callerOrgId, input.clientOrgId);
  if (!authorized) return { ok: false, error: "unauthorized" };

  const result = await createClientRetainer({
    builderOrgId: callerOrgId,
    clientOrgId: input.clientOrgId,
    contact: { email, name },
    monthlyPriceCents: input.monthlyPriceCents,
    setupFeeCents: input.setupFeeCents,
  });

  if (!result.ok) return { ok: false, error: result.reason };

  revalidatePath("/studio/clients");
  return { ok: true, checkoutUrl: result.checkoutUrl };
}

// ── send-link — composes the existing email rail ──────────────────────────

export type SendRetainerLinkActionResult = { ok: true } | { ok: false; error: "unauthorized" | "invalid_input" | "send_failed" };

export async function sendRetainerLinkAction(input: {
  clientOrgId: string;
  contactEmail: string;
  contactName: string;
  checkoutUrl: string;
}): Promise<SendRetainerLinkActionResult> {
  assertWritable();

  const callerOrgId = await getOrgId();
  if (!callerOrgId) return { ok: false, error: "unauthorized" };

  const email = input.contactEmail?.trim();
  const url = input.checkoutUrl?.trim();
  if (!email || !url || !input.clientOrgId) return { ok: false, error: "invalid_input" };

  const authorized = await authorizeRetainerCaller(callerOrgId, input.clientOrgId);
  if (!authorized) return { ok: false, error: "unauthorized" };

  try {
    await sendEmailFromApi({
      orgId: callerOrgId,
      userId: null,
      contactId: null,
      toEmail: email,
      subject: "Set up your monthly retainer",
      body: `Hi ${input.contactName || "there"},\n\nSet up your monthly retainer payment here: ${url}\n\nThis takes about a minute — enter your card once and you're all set for automatic monthly billing.`,
      ctaLabel: "Set up autopay →",
      ctaHref: url,
    });
    return { ok: true };
  } catch (err) {
    logEvent("retainer_link_send_failed", {
      clientOrgId: input.clientOrgId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: "send_failed" };
  }
}

// ── cancel-retainer ─────────────────────────────────────────────────────

type CancelRetainerFailureReason = Extract<CancelClientRetainerResult, { ok: false }>["reason"];

export type CancelRetainerActionResult =
  | { ok: true }
  | { ok: false; error: "unauthorized" | "invalid_input" | CancelRetainerFailureReason };

export async function cancelRetainerAction(input: { clientOrgId: string }): Promise<CancelRetainerActionResult> {
  assertWritable();

  const callerOrgId = await getOrgId();
  if (!callerOrgId) return { ok: false, error: "unauthorized" };
  if (!input.clientOrgId || typeof input.clientOrgId !== "string") {
    return { ok: false, error: "invalid_input" };
  }

  const result = await cancelClientRetainer(
    { builderOrgId: callerOrgId, clientOrgId: input.clientOrgId },
    defaultCancelRetainerDeps((cancelInput) => authorizeRetainerCaller(cancelInput.builderOrgId, cancelInput.clientOrgId)),
  );

  if (!result.ok) return { ok: false, error: result.reason };

  revalidatePath("/studio/clients");
  return { ok: true };
}
