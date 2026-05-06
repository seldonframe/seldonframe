// v1.19.0 — portal client layout themed with --sf-* CSS vars via
// PortalLayout. Pre-1.19 used legacy crm-card / crm-button-secondary /
// crm-button-ghost utility classes that didn't pick up workspace
// branding (every workspace's portal looked like SeldonFrame's blue).
//
// Post-1.19: PortalLayout wraps inner pages in PublicThemeProvider, so
// --sf-primary / --sf-bg / --sf-text / --sf-border / --sf-radius etc.
// resolve to the workspace's theme. Nav links + welcome chrome inline-
// style with --sf-* vars; the workspace's primary color becomes the
// active-link / focus accent automatically.
//
// Auth + data plumbing UNCHANGED — same requirePortalSessionForOrg /
// listPortalMessages / clearPortalSessionAction calls; only the chrome
// is re-themed.

import Link from "next/link";
import { EndClientChat } from "@/components/end-client-chat";
import { PortalLayout } from "@/components/ui-customer/portal-layout";
import { clearPortalSessionAction, requirePortalSessionForOrg } from "@/lib/portal/auth";
import { getUnreadPortalMessageCount } from "@/lib/portal/actions";
import { getHarnessRules } from "@/lib/harness-rules";
import { getPublicOrgThemeBySlug } from "@/lib/theme/actions";

function slugToDisplayName(slug: string): string {
  return slug
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ""))
    .join(" ");
}

export default async function PortalClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const [session, theme] = await Promise.all([
    requirePortalSessionForOrg(orgSlug),
    getPublicOrgThemeBySlug(orgSlug),
  ]);
  const harnessRules = getHarnessRules();
  const unreadMessages = await getUnreadPortalMessageCount(session);
  const displayName = `${session.contact.firstName} ${session.contact.lastName ?? ""}`.trim();
  const orgName = slugToDisplayName(orgSlug);
  const sessionEmail = session.contact.email ?? null;

  return (
    <>
      <PortalLayout
        theme={theme}
        orgName={orgName}
        sessionEmail={sessionEmail}
      >
        <div
          data-portal-client-shell=""
          className="mx-auto w-full max-w-5xl space-y-6 px-6 py-8"
        >
          <section
            data-portal-welcome=""
            className="flex flex-wrap items-center justify-between gap-4 p-5"
            style={{
              backgroundColor: "var(--sf-card-bg)",
              color: "var(--sf-text)",
              border: "1px solid var(--sf-border)",
              borderRadius: "var(--sf-radius)",
            }}
          >
            <div>
              <p
                className="text-xs uppercase tracking-wide"
                style={{ color: "var(--sf-muted)" }}
              >
                Client Portal
              </p>
              <h1
                className="text-xl font-semibold"
                style={{ color: "var(--sf-text)" }}
              >
                Welcome, {displayName || sessionEmail || "Client"}
              </h1>
            </div>

            <nav
              data-portal-nav=""
              className="flex flex-wrap items-center gap-2 text-sm"
            >
              <PortalNavLink href={`/portal/${orgSlug}`}>Overview</PortalNavLink>
              <PortalNavLink href={`/portal/${orgSlug}/pipeline`}>
                My Pipeline
              </PortalNavLink>
              <PortalNavLink href={`/portal/${orgSlug}/bookings`}>
                Bookings
              </PortalNavLink>
              <Link
                href={`/portal/${orgSlug}/messages`}
                className="inline-flex h-9 items-center gap-2 px-3 text-sm font-medium"
                style={{
                  backgroundColor: "transparent",
                  color: "var(--sf-text)",
                  border: "1px solid var(--sf-border)",
                  borderRadius: "var(--sf-radius)",
                }}
              >
                <span>Messages</span>
                {unreadMessages > 0 ? (
                  <span
                    aria-label={`${unreadMessages} unread message${unreadMessages === 1 ? "" : "s"}`}
                    className="inline-flex min-w-[1.25rem] items-center justify-center px-1.5 py-0.5 text-[10px] font-semibold leading-none"
                    style={{
                      backgroundColor: "var(--sf-primary)",
                      color: "var(--sf-bg)",
                      borderRadius: "9999px",
                    }}
                  >
                    {unreadMessages > 99 ? "99+" : unreadMessages}
                  </span>
                ) : null}
              </Link>
              <PortalNavLink href={`/portal/${orgSlug}/resources`}>
                Documents
              </PortalNavLink>
              <form action={clearPortalSessionAction.bind(null, orgSlug)}>
                <button
                  type="submit"
                  className="h-9 px-3 text-sm font-medium"
                  style={{
                    backgroundColor: "transparent",
                    color: "var(--sf-muted)",
                    border: "1px solid transparent",
                    borderRadius: "var(--sf-radius)",
                  }}
                >
                  Logout
                </button>
              </form>
            </nav>
          </section>

          {children}
        </div>
      </PortalLayout>

      {harnessRules.end_client_customization ? <EndClientChat orgSlug={orgSlug} /> : null}
    </>
  );
}

/** Themed portal nav link — matches the buttons in CustomerLogin's
 *  --sf-* style language so the inner area visually descends from the
 *  branded login experience. */
function PortalNavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-9 items-center px-3 text-sm font-medium"
      style={{
        backgroundColor: "transparent",
        color: "var(--sf-text)",
        border: "1px solid var(--sf-border)",
        borderRadius: "var(--sf-radius)",
      }}
    >
      {children}
    </Link>
  );
}
