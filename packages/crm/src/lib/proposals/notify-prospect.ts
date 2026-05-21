// packages/crm/src/lib/proposals/notify-prospect.ts
// 2026-05-19 — Proposal Builder. Welcome email to the prospect with
// portal/admin link. Sent via the agency's Resend (their branding).
// Canonical email helper: sendEmailFromApi from @/lib/emails/api.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { sendEmailFromApi } from "@/lib/emails/api";
import type { Proposal } from "@/db/schema/proposals";
import type { AgencyProfile } from "@/db/schema/agency-profile";

export async function notifyProspectOfActivation(proposal: Proposal): Promise<void> {
  if (!proposal.previewWorkspaceId || !proposal.createdByUserId) return;

  const [workspace] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, proposal.previewWorkspaceId))
    .limit(1);
  if (!workspace) return;

  const [agency] = await db
    .select()
    .from(users)
    .where(eq(users.id, proposal.createdByUserId))
    .limit(1);

  const baseDomain = process.env.WORKSPACE_BASE_DOMAIN ?? "seldonframe.app";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.seldonframe.com";
  const agencyProfile = agency ? (agency.agencyProfile as AgencyProfile) : null;
  const agencyName = agencyProfile?.name ?? agency?.name ?? "Your agency";
  const bookingUrl = `https://${workspace.slug}.${baseDomain}/book`;
  const loginUrl = `${appUrl}/login`;

  const subject = `${proposal.prospectName} — your workspace is live`;
  const body = `Hi ${proposal.prospectFirstName ?? proposal.prospectName},

Your booking + CRM workspace is live and ready to use.

Booking page: ${bookingUrl}
Admin login: ${loginUrl} (use this email address)

— ${agencyName}`;

  await sendEmailFromApi({
    orgId: proposal.agencyOrgId,
    userId: null,
    contactId: null,
    toEmail: proposal.prospectEmail,
    subject,
    body,
    ctaLabel: "Open your workspace",
    ctaHref: bookingUrl,
    brandingOverride: agencyProfile
      ? {
          brandName: agencyName,
          logoUrl: agencyProfile.logo_url ?? undefined,
          primaryColor: agencyProfile.brand_color ?? undefined,
        }
      : undefined,
  });
}
