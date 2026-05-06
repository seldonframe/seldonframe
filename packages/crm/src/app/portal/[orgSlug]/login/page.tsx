// v1.20.0 — operator portal login (sub-tenant operator magic-link request)
//
// Audience: HVAC owner / dentist / accountant — the business operator
// running a workspace that an SF agency partner has white-labeled.
// NOT the SF agency operator (they sign in via NextAuth at /login),
// NOT the homeowner customer (they sign in via 6-digit code at
// /customer/<orgSlug>/login).
//
// Flow:
//   1. Operator types email → "Send sign-in link"
//   2. Server action mints magic-link token + emails clickable URL
//   3. Operator clicks link → /portal/<orgSlug>/magic?token=...
//   4. Magic route mints session cookie + redirects to dashboard
//
// Theming: this page wraps in an operator-grade themed shell that
// applies workspace theme + agency branding via PortalLayout. Light
// mode default per Twenty-CRM aesthetic.

import { OperatorLoginForm } from "@/components/operator-portal/operator-login-form";
import { OperatorPortalShell } from "@/components/operator-portal/operator-portal-shell";
import { getEffectiveBrandingForWorkspace } from "@/lib/partner-agencies/branding";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getPublicOrgThemeBySlug } from "@/lib/theme/actions";

export default async function OperatorPortalLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ error?: string; sent_to?: string }>;
}) {
  const { orgSlug } = await params;
  const { error, sent_to: sentTo } = await searchParams;

  const [orgRow, theme] = await Promise.all([
    db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.slug, orgSlug))
      .limit(1)
      .then((r) => r[0] ?? null),
    getPublicOrgThemeBySlug(orgSlug),
  ]);

  // Branding (agency vs SF) — orgRow may be null when slug is bogus;
  // we still render the form (silent-no-op the action behind it).
  const branding = orgRow
    ? await getEffectiveBrandingForWorkspace(orgRow.id)
    : null;
  const orgName = orgRow?.name ?? slugToDisplayName(orgSlug);

  return (
    <OperatorPortalShell theme={theme} orgName={orgName} branding={branding}>
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <OperatorLoginForm
          orgSlug={orgSlug}
          orgName={orgName}
          initialError={readErrorMessage(error)}
          initialSentTo={typeof sentTo === "string" ? sentTo : null}
        />
      </div>
    </OperatorPortalShell>
  );
}

function slugToDisplayName(slug: string): string {
  return slug
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
    .join(" ");
}

function readErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case "missing_magic_link":
      return "Sign-in link missing. Please request a new one below.";
    case "invalid_magic_link":
      return "Sign-in link is invalid or expired. Please request a new one below.";
    default:
      return null;
  }
}
