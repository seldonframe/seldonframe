// packages/crm/src/lib/proposals/notify-prospect.ts
// 2026-05-19 — Proposal Builder. Welcome email to the prospect with
// portal/admin link. Sent via the agency's Resend (their branding).
// Canonical email helper: sendEmailFromApi from @/lib/emails/api.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { sendEmailFromApi } from "@/lib/emails/api";
import type { Proposal } from "@/db/schema/proposals";

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
  const agencyName =
    (agency?.agencyProfile as { name?: string } | null)?.name ?? agency?.name ?? "Your agency";

  await sendEmailFromApi({
    orgId: proposal.agencyOrgId,
    userId: null,
    contactId: null,
    toEmail: proposal.prospectEmail,
    subject: `${proposal.prospectName} — your workspace is live`,
    body: `<p>Hi ${proposal.prospectFirstName ?? proposal.prospectName},</p>
<p>Your booking + CRM workspace is live.</p>
<p>Booking page: <a href="https://${workspace.slug}.${baseDomain}/book">https://${workspace.slug}.${baseDomain}/book</a><br/>
Admin login: <a href="${appUrl}/login">${appUrl}/login</a> (use this email address)</p>
<p>—${agencyName}</p>`,
  });
}
