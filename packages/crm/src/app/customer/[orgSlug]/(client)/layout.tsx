// v1.21.0 — customer portal layout (light Twenty-CRM, agency-branded)
//
// Pre-1.21 this was a workspace-themed dark layout with operator-
// jargon nav (Overview / My Pipeline / Bookings / Messages / Documents).
// v1.21 rewrites top-to-bottom for the END CUSTOMER audience:
//   - light mode forced (matches operator portal — Twenty-CRM
//     light is SeldonFrame's customer-facing design language)
//   - agency-branded chrome via CustomerPortalShell + EffectiveBranding
//   - sidebar nav with end-customer-focused tabs:
//       Home / Appointments / Documents / Messages / Account
//     "Pipeline" tab DROPPED — meaningless to customers
//
// Auth + data plumbing UNCHANGED — same requirePortalSessionForOrg /
// clearPortalSessionAction; only the chrome + nav structure changes.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { CustomerPortalShell } from "@/components/customer-portal/customer-portal-shell";
import { EndClientChat } from "@/components/end-client-chat";
import { getEffectiveBrandingForWorkspace } from "@/lib/partner-agencies/branding";
import {
  clearPortalSessionAction,
  requirePortalSessionForOrg,
} from "@/lib/portal/auth";
import { getHarnessRules } from "@/lib/harness-rules";
import { getPublicOrgThemeBySlug } from "@/lib/theme/actions";
import { isAutopayConsoleOn } from "@/lib/web-build/policy";

export default async function CustomerPortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;

  const session = await requirePortalSessionForOrg(orgSlug);
  const harnessRules = getHarnessRules();

  const [orgRow, theme, branding] = await Promise.all([
    db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, session.orgId))
      .limit(1)
      .then((r) => r[0] ?? null),
    getPublicOrgThemeBySlug(orgSlug),
    getEffectiveBrandingForWorkspace(session.orgId),
  ]);

  const orgName = orgRow?.name ?? slugToDisplayName(orgSlug);
  const customerEmail = session.contact.email ?? null;

  return (
    <>
      <CustomerPortalShell
        theme={theme}
        orgName={orgName}
        orgSlug={orgSlug}
        branding={branding}
        customerEmail={customerEmail}
        signOutAction={clearPortalSessionAction.bind(null, orgSlug)}
        showBilling={isAutopayConsoleOn({ SF_AUTOPAY_CONSOLE: process.env.SF_AUTOPAY_CONSOLE })}
      >
        {children}
      </CustomerPortalShell>

      {harnessRules.end_client_customization ? (
        <EndClientChat orgSlug={orgSlug} />
      ) : null}
    </>
  );
}

function slugToDisplayName(slug: string): string {
  return slug
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
    .join(" ");
}
