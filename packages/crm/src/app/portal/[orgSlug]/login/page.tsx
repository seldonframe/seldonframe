// Portal login page — MIGRATED to SLICE 4b composition patterns.
//
// Shipped in SLICE 4b PR 2 C4 per audit §5.4 + G-4b-1.
//
// Pre-migration: PortalLoginForm component using legacy crm-card /
// crm-input / crm-button-primary classes. Rendered unthemed —
// "Client Portal Login" on every workspace regardless of branding.
//
// Post-migration: <PortalLayout> (for workspace branding chrome) wrapping
// <CustomerLogin> (themed OTC form that composes around the unchanged
// requestPortalAccessCodeAction + verifyPortalAccessCodeAction plumbing).
// The workspace's OrgTheme (primary color, font, radius, mode, etc.)
// surfaces on the login page — each workspace's login feels branded.
//
// Auth plumbing unchanged — lib/portal/auth.ts untouched; CustomerLogin
// composes AROUND it.

import { PortalLayout } from "@/components/ui-customer/portal-layout";
import { CustomerLogin } from "@/components/ui-customer/customer-login";
import { getPublicOrgThemeBySlug } from "@/lib/theme/actions";

export default async function PortalLoginPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const theme = await getPublicOrgThemeBySlug(orgSlug);
  const orgName = slugToDisplayName(orgSlug);

  return (
    <PortalLayout theme={theme} orgName={orgName}>
      <div className="flex flex-1 items-center justify-center p-6">
        <CustomerLogin orgSlug={orgSlug} theme={theme} />
      </div>
    </PortalLayout>
  );
}

/** `dental-clinic` → `Dental Clinic`. Placeholder until org.name is
 *  available via a shared public fetcher. */
function slugToDisplayName(slug: string): string {
  return slug
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
    .join(" ");
}
