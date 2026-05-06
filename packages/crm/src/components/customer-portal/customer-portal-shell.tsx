// v1.21.0 — customer-portal themed shell
//
// Wraps customer-portal pages in:
//   1. PublicThemeProvider with light-mode override (the customer
//      portal is forcibly light-mode regardless of workspace
//      theme.mode — Twenty-CRM-quality customer experiences are
//      light, dense, neutral, professional)
//   2. Agency-branded chrome via deriveEffectiveBranding (Acme AI's
//      logo + "on Acme AI" subtitle when an active partner agency
//      is wired)
//   3. Sidebar nav (Home / Appointments / Documents / Messages /
//      Account) on desktop, top tabs on mobile
//
// Distinct from OperatorPortalShell (operator surface):
//   - Operator audience = HVAC business owner running their CRM
//   - Customer audience = homeowner who called HVAC
//   - Different copy register (operator: "Dashboard" / "Contacts";
//     customer: industry-aware "Your next service visit")
//   - Different information density (operator: spreadsheet;
//     customer: focused single-task surfaces)
//   - Same Twenty-CRM design language so SeldonFrame's craft level
//     reads consistently across both surfaces

import type { ReactNode } from "react";

import { PublicThemeProvider } from "@/components/theme/public-theme-provider";
import type { OrgTheme } from "@/lib/theme/types";
import type { EffectiveBranding } from "@/lib/partner-agencies/branding";
import { CustomerPortalNav } from "./customer-portal-nav";

export type CustomerPortalShellProps = {
  theme: OrgTheme;
  /** Workspace name (e.g. "Cypress & Pine HVAC"). */
  orgName: string;
  /** Org slug for nav link construction. */
  orgSlug: string;
  /** Active branding (agency or SF defaults). */
  branding: EffectiveBranding | null;
  /** Active customer email — surfaced in chrome as "signed in as". */
  customerEmail: string | null;
  /** Sign-out form action. */
  signOutAction: () => Promise<void>;
  /** Page content. */
  children: ReactNode;
};

export function CustomerPortalShell({
  theme,
  orgName,
  orgSlug,
  branding,
  customerEmail,
  signOutAction,
  children,
}: CustomerPortalShellProps) {
  // Light-mode override — customer portal is always light per design
  // language. Workspace theme.mode is preserved for color/font/radius
  // but mode is forced.
  const customerTheme: OrgTheme = { ...theme, mode: "light" };

  const brandName = branding?.is_white_label
    ? branding.brand_name
    : "SeldonFrame";
  const logoUrl = branding?.logo_url ?? null;
  const showPoweredByBadge = branding?.show_powered_by_badge ?? true;

  return (
    <PublicThemeProvider theme={customerTheme}>
      <div
        data-customer-portal-shell=""
        data-white-label={branding?.is_white_label ? "true" : "false"}
        className="min-h-[100dvh] flex flex-col"
        style={{
          backgroundColor: "#F7F7F5",
          color: "#111",
          fontFamily:
            "var(--sf-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif)",
        }}
      >
        <header
          data-customer-portal-header=""
          className="flex items-center justify-between gap-4 px-4 sm:px-6 py-3"
          style={{
            backgroundColor: "#FFFFFF",
            borderBottom: "1px solid #E5E5E1",
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            {logoUrl ? (
              <img
                data-customer-portal-logo=""
                src={logoUrl}
                alt={brandName}
                className="h-7 w-7 rounded-md object-cover shrink-0"
              />
            ) : null}
            <div className="flex flex-col leading-tight min-w-0">
              <span
                className="text-[14px] font-semibold tracking-tight truncate"
                style={{ color: "#111" }}
              >
                {orgName}
              </span>
              {branding?.is_white_label ? (
                <span
                  className="text-[11px] truncate"
                  style={{ color: "#888" }}
                >
                  on {brandName}
                </span>
              ) : null}
            </div>
          </div>

          {customerEmail ? (
            <div
              data-customer-portal-session=""
              className="hidden sm:flex items-center gap-3 text-[12px]"
              style={{ color: "#888" }}
            >
              <span>{customerEmail}</span>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="text-[12px] underline"
                  style={{ color: "#666" }}
                >
                  Sign out
                </button>
              </form>
            </div>
          ) : null}
        </header>

        <CustomerPortalNav
          orgSlug={orgSlug}
          customerEmail={customerEmail}
          signOutAction={signOutAction}
        />

        <div className="flex flex-1">
          {/* Spacer matching desktop sidebar so content reflow stays
              consistent. CustomerPortalNav renders its own sidebar
              column on sm+ breakpoints. */}
          <div className="hidden sm:block w-52 shrink-0" aria-hidden />

          <section className="flex-1 px-4 py-5 sm:px-8 sm:py-6 max-w-4xl mx-auto w-full">
            {children}
          </section>
        </div>

        {showPoweredByBadge ? (
          <footer
            data-customer-portal-footer=""
            className="flex items-center justify-center gap-2 px-6 py-3 text-[11px]"
            style={{
              color: "#999",
              borderTop: "1px solid #E5E5E1",
              backgroundColor: "#FFFFFF",
            }}
          >
            <span>
              Powered by{" "}
              <a
                href="https://seldonframe.com"
                style={{ color: "#666" }}
                target="_blank"
                rel="noopener noreferrer"
              >
                SeldonFrame
              </a>
            </span>
          </footer>
        ) : null}
      </div>
    </PublicThemeProvider>
  );
}

