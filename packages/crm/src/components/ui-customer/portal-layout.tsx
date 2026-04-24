// <PortalLayout> — top-level wrapper for customer portal routes.
// Applies workspace branding via PublicThemeProvider, renders nav
// chrome (orgName + optional logo + optional session indicator +
// optional sign-out link), renders children inside a <main>
// landmark, and optionally renders a footer slot.
//
// Shipped in SLICE 4b PR 1 C1 per audit §5.1.
//
// Scope for v1:
//   - PublicThemeProvider integration: all customer surfaces
//     under <PortalLayout> inherit the workspace's 9-var theme
//     override (--sf-primary / --sf-accent / --sf-font /
//     --sf-radius / --sf-bg / --sf-text / --sf-card-bg /
//     --sf-muted / --sf-border).
//   - Fonts: PublicThemeProvider loads the workspace's Google Font
//     via a <link> tag — consumed downstream by all typography.
//   - Pure composition (L-17 0.94x). Props drive rendering; no
//     internal state.
//   - Session state is passed from the route's server component
//     via props; <PortalLayout> doesn't read cookies or verify
//     JWTs itself (separation of auth plumbing from UI chrome).
//
// What this doesn't do (deferred):
//   - Session-expiry redirect UX — belongs in the route handler
//     that wraps each customer page (not at the layout level).
//     Follow-up ticket if/when a cross-surface session-refresh
//     pattern emerges.
//   - Portal-specific nav items beyond "Sign out" — blocks add
//     their own nav via children composition for v1.

import type { ReactNode } from "react";
import Link from "next/link";

import { PublicThemeProvider } from "@/components/theme/public-theme-provider";
import type { OrgTheme } from "@/lib/theme/types";

export type PortalLayoutProps = {
  theme: OrgTheme;
  orgName: string;
  /** Optional — renders an <img> in the header when present. */
  logoUrl?: string | null;
  /** Optional — renders the "signed in as …" block when present. */
  sessionEmail?: string | null;
  /** Optional — paired with sessionEmail to render a Sign out link. */
  signOutHref?: string;
  /** Optional footer slot — e.g., legal copy, copyright, helpdesk link. */
  footer?: ReactNode;
  children: ReactNode;
};

export function PortalLayout({
  theme,
  orgName,
  logoUrl,
  sessionEmail,
  signOutHref,
  footer,
  children,
}: PortalLayoutProps) {
  return (
    <PublicThemeProvider theme={theme}>
      <div
        data-portal-layout=""
        className="min-h-[100dvh] flex flex-col"
        style={{
          // Inherit --sf-text / --sf-bg from PublicThemeProvider via
          // the provider's wrapping div (already set).
          color: "var(--sf-text)",
        }}
      >
        <header
          className="flex items-center justify-between gap-4 px-6 py-4 border-b"
          style={{ borderColor: "var(--sf-border)" }}
        >
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img
                data-portal-logo=""
                src={logoUrl}
                alt={orgName}
                className="h-8 w-8 rounded-md object-cover"
                style={{ borderRadius: "var(--sf-radius)" }}
              />
            ) : null}
            <span className="text-lg font-semibold" style={{ color: "var(--sf-text)" }}>
              {orgName}
            </span>
          </div>

          {sessionEmail ? (
            <div
              data-portal-session=""
              className="flex items-center gap-3 text-sm"
              style={{ color: "var(--sf-muted)" }}
            >
              <span>{sessionEmail}</span>
              {signOutHref ? (
                <Link
                  href={signOutHref}
                  className="underline hover:no-underline"
                  style={{ color: "var(--sf-primary)" }}
                >
                  Sign out
                </Link>
              ) : null}
            </div>
          ) : null}
        </header>

        <main className="flex-1 flex flex-col">{children}</main>

        {footer ? (
          <footer
            data-portal-footer=""
            className="px-6 py-4 border-t text-sm"
            style={{
              borderColor: "var(--sf-border)",
              color: "var(--sf-muted)",
            }}
          >
            {footer}
          </footer>
        ) : null}
      </div>
    </PublicThemeProvider>
  );
}
