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

  await sendEmailFromApi({
    orgId: proposal.agencyOrgId,
    userId: null,
    contactId: null,
    toEmail: agency.email,
    subject,
    body: `<p>${proposal.prospectName} accepted your proposal.</p>
<p>Monthly: $${dollars}<br/>
Stripe subscription: ${proposal.stripeSubscriptionId ?? "(pending)"}</p>
<p>Their workspace is live now. <a href="${appUrl}/proposals/${proposal.id}">View proposal</a></p>`,
  });
}
