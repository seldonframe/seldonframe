// v1.20.0 — operator portal layout (sub-tenant operator dashboard chrome)
//
// Wraps inner /portal/<orgSlug>/(operator)/* pages in a Twenty-CRM-
// inspired layout: sidebar nav (Dashboard / Contacts / Deals /
// Bookings — only Dashboard active in v1.20; rest are placeholders
// for v1.21 mirror), agency-branded top header (via OperatorPortalShell),
// light-mode neutral palette.
//
// Auth: requires an operator session for this orgSlug. Unauthenticated
// users get redirected to /portal/<orgSlug>/login.
//
// Agency-impersonation note: when session.supportOriginUserId is set,
// we surface a banner ("You are signed in as <email> on behalf of
// <agency>"). v1.21 will add audit logging + revoke flow.

import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { OperatorPortalShell } from "@/components/operator-portal/operator-portal-shell";
import { getEffectiveBrandingForWorkspace } from "@/lib/partner-agencies/branding";
import {
  clearOperatorSessionAction,
  requireOperatorSessionForOrg,
} from "@/lib/operator-portal/auth";
import { getPublicOrgThemeBySlug } from "@/lib/theme/actions";

export default async function OperatorPortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;

  // Auth gate first — redirects to /portal/<slug>/login if no session.
  const session = await requireOperatorSessionForOrg(orgSlug);

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
  const isSupportSession = Boolean(session.supportOriginUserId);

  return (
    <OperatorPortalShell theme={theme} orgName={orgName} branding={branding}>
      {isSupportSession ? (
        <div
          data-operator-portal-support-banner=""
          className="px-6 py-2 text-[12px]"
          style={{
            backgroundColor: "#FEF3C7",
            color: "#78350F",
            borderBottom: "1px solid #FDE68A",
          }}
        >
          Agency support session active — you are signed in as{" "}
          <strong>{session.email}</strong>. All actions are audit-logged.
        </div>
      ) : null}

      <div className="flex flex-1">
        <aside
          data-operator-portal-sidebar=""
          className="w-56 shrink-0 px-3 py-4"
          style={{
            backgroundColor: "#FFFFFF",
            borderRight: "1px solid #E5E5E1",
          }}
        >
          <nav className="flex flex-col gap-0.5 text-[13px]">
            <SidebarLink href={`/portal/${orgSlug}`} active>
              Dashboard
            </SidebarLink>
            <SidebarLink
              href={`/portal/${orgSlug}/contacts`}
              comingSoon
            >
              Contacts
            </SidebarLink>
            <SidebarLink
              href={`/portal/${orgSlug}/deals`}
              comingSoon
            >
              Deals
            </SidebarLink>
            <SidebarLink
              href={`/portal/${orgSlug}/bookings`}
              comingSoon
            >
              Bookings
            </SidebarLink>
          </nav>

          <div className="mt-6 pt-4" style={{ borderTop: "1px solid #E5E5E1" }}>
            <p
              className="px-2 text-[10px] uppercase tracking-wide"
              style={{ color: "#999" }}
            >
              Account
            </p>
            <div className="px-2 mt-1 text-[12px] truncate" style={{ color: "#444" }}>
              {session.email}
            </div>
            <form
              action={clearOperatorSessionAction.bind(null, orgSlug)}
              className="px-2 mt-3"
            >
              <button
                type="submit"
                className="text-[12px] underline"
                style={{ color: "#666" }}
              >
                Sign out
              </button>
            </form>
          </div>
        </aside>

        <section className="flex-1 px-8 py-6">{children}</section>
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

function SidebarLink({
  href,
  active,
  comingSoon,
  children,
}: {
  href: string;
  active?: boolean;
  comingSoon?: boolean;
  children: React.ReactNode;
}) {
  if (comingSoon) {
    return (
      <span
        className="flex items-center justify-between px-2 py-1.5 cursor-not-allowed"
        style={{
          color: "#BBB",
        }}
      >
        <span>{children}</span>
        <span
          className="text-[10px] font-medium"
          style={{ color: "#BBB" }}
        >
          v1.21
        </span>
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="flex items-center px-2 py-1.5 font-medium"
      style={{
        backgroundColor: active ? "#F0F0EC" : "transparent",
        color: active ? "#111" : "#444",
        borderRadius: "6px",
      }}
    >
      {children}
    </Link>
  );
}
