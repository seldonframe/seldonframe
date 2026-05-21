// packages/crm/src/lib/proposals/notify-agency.ts
// 2026-05-19 — Proposal Builder. "X just signed up at $Y/mo" email to the
// agency operator. Sent from the agency's Resend (this is platform email
// routed through the agency's orgId → uses their Resend key).
// Canonical email helper: sendEmailFromApi from @/lib/emails/api (same
// path used by proposals/actions.ts and the outbound messaging dispatcher).

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { sendEmailFromApi } from "@/lib/emails/api";
import type { Proposal } from "@/db/schema/proposals";
import type { AgencyProfile } from "@/db/schema/agency-profile";

export async function notifyAgencyOfAcceptance(proposal: Proposal): Promise<void> {
  if (!proposal.createdByUserId) return;
  const [agency] = await db
    .select()
    .from(users)
    .where(eq(users.id, proposal.createdByUserId))
    .limit(1);
  if (!agency) return;

  const dollars = (proposal.monthlyPriceCents / 100).toLocaleString("en-US");
  const subject = `${proposal.prospectName} just signed up — $${dollars}/mo`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.seldonframe.com";
  const profile = agency.agencyProfile as AgencyProfile;
  const agencyName = profile.name ?? agency.name;

  const body = `${proposal.prospectName} accepted your proposal.

Monthly: $${dollars}
Stripe subscription: ${proposal.stripeSubscriptionId ?? "(pending)"}
Their workspace is live now.`;

  await sendEmailFromApi({
    orgId: proposal.agencyOrgId,
    userId: null,
    contactId: null,
    toEmail: agency.email,
    subject,
    body,
    ctaLabel: "View proposal",
    ctaHref: `${appUrl}/proposals/${proposal.id}`,
    brandingOverride: {
      brandName: agencyName,
      logoUrl: profile.logo_url ?? undefined,
      primaryColor: profile.brand_color ?? undefined,
    },
  });
}
