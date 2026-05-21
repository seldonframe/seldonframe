// packages/crm/src/lib/proposals/notify-prospect.ts
// 2026-05-21 — Phase H: world-class deliverables email. Patterns drawn from
// Cal.com agency onboarding, Webflow Experts handoff emails, and Productize
// templates: from a real human at the agency, celebratory subject, clear
// deliverables grid, expected next steps, kickoff call CTA, reply-to the
// agency operator's real inbox.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { sendEmailFromApi } from "@/lib/emails/api";
import type { Proposal } from "@/db/schema/proposals";

export async function notifyProspectOfActivation(proposal: Proposal): Promise<void> {
  if (!proposal.previewWorkspaceId || !proposal.createdByUserId) return;

  const [workspace] = await db
    .select({ slug: organizations.slug, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, proposal.previewWorkspaceId))
    .limit(1);
  if (!workspace) return;

  const [agency] = await db
    .select()
    .from(users)
    .where(eq(users.id, proposal.createdByUserId))
    .limit(1);
  if (!agency) return;

  const baseDomain = process.env.WORKSPACE_BASE_DOMAIN ?? "seldonframe.app";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.seldonframe.com";
  const agencyName = agency.agencyProfile?.name ?? agency.name ?? "Your agency";
  const agencyEmail = agency.email;
  const greetingName = proposal.prospectFirstName?.trim() || proposal.prospectName;
  const bookingUrl = `https://${workspace.slug}.${baseDomain}/book`;
  const loginUrl = `${appUrl}/login`;

  const subject = `Welcome aboard, ${greetingName} — your workspace is live`;

  // Plain-text body. renderPlainEmailTemplate handles HTML escape + auto-linkify
  // + branded chrome (agency logo, brand color, footer) via the brandingOverride.
  const body = `Hi ${greetingName},

Quick note from ${agencyName} — your workspace for ${proposal.prospectName} just went live.

Here's everything you need to get started:

· Your booking page: ${bookingUrl}
  Share this URL with your customers to start taking appointments.

· Your admin panel: ${loginUrl}
  Sign in with ${proposal.prospectEmail} to manage everything.

· Receipt: Stripe just emailed you the receipt for your $${(proposal.setupFeeCents / 100).toLocaleString("en-US")} setup.

What happens in the next 24 hours:

1. Take a quick look around the admin panel.
2. Test the booking flow — book a fake appointment yourself.
3. Share the booking page with one customer.

I'll check in tomorrow morning to make sure everything's running smooth. If anything looks off, just reply to this email — it comes straight to me.

Talk soon,
${agencyName}
${agencyEmail}`;

  await sendEmailFromApi({
    orgId: proposal.agencyOrgId,
    userId: null,
    contactId: null,
    toEmail: proposal.prospectEmail,
    subject,
    body,
    ctaLabel: "Open my workspace →",
    ctaHref: loginUrl,
    brandingOverride: {
      brandName: agencyName,
      logoUrl: agency.agencyProfile?.logo_url ?? undefined,
      primaryColor: agency.agencyProfile?.brand_color ?? undefined,
    },
  });
}
