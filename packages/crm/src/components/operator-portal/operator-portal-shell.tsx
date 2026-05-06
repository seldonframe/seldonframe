// v1.20.0 — operator-portal themed shell
//
// Wraps operator-portal pages in:
//   1. PublicThemeProvider (workspace 9-var theme override)
//   2. Twenty-CRM-style header chrome (light mode default, agency-
//      branded when partner-agency is active + verified)
//   3. <main> landmark for content
//
// L-17: pure composition. Props drive rendering; no internal state.
//
// Design language: Twenty CRM's clean light aesthetic — neutral grays
// (#F7F7F5 bg, #E5E5E1 borders, #111 text), Inter-style sans, 1px
// hairline borders, 12-16px padding, dense rows. Agency-branded
// chrome inserts the agency name + logo at the top; the workspace
// theme drives content area accent (primary color on buttons /
// active states inside the dashboard).

import type { ReactNode } from "react";

import { PublicThemeProvider } from "@/components/theme/public-theme-provider";
import type { OrgTheme } from "@/lib/theme/types";
import type { EffectiveBranding } from "@/lib/partner-agencies/branding";

export type OperatorPortalShellProps = {
  theme: OrgTheme;
  orgName: string;
  branding: EffectiveBranding | null;
  children: ReactNode;
};

export function OperatorPortalShell({
  theme,
  orgName,
  branding,
  children,
}: OperatorPortalShellProps) {
  // Light-mode override on the operator portal: even if the
  // workspace theme is configured for dark, operator surfaces want
  // the spreadsheet-style light aesthetic per Twenty-CRM design
  // language. We clone the theme with mode: "light" forced.
  const operatorTheme: OrgTheme = { ...theme, mode: "light" };

  const brandName = branding?.is_white_label
    ? branding.brand_name
    : "SeldonFrame";
  const logoUrl = branding?.logo_url ?? null;
  const showPoweredByBadge = branding?.show_powered_by_badge ?? true;

  return (
    <PublicThemeProvider theme={operatorTheme}>
      <div
        data-operator-portal-shell=""
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
          data-operator-portal-header=""
          className="flex items-center justify-between gap-4 px-6 py-3"
          style={{
            backgroundColor: "#FFFFFF",
            borderBottom: "1px solid #E5E5E1",
          }}
        >
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img
                data-operator-portal-logo=""
                src={logoUrl}
                alt={brandName}
                className="h-7 w-7 rounded-md object-cover"
              />
            ) : null}
            <div className="flex flex-col leading-tight">
              <span
                className="text-[13px] font-semibold tracking-tight"
                style={{ color: "#111" }}
              >
                {orgName}
              </span>
              {branding?.is_white_label ? (
                <span
                  className="text-[11px]"
                  style={{ color: "#888" }}
                >
                  on {brandName}
                </span>
              ) : null}
            </div>
          </div>

          <nav
            data-operator-portal-header-nav=""
            className="flex items-center gap-3 text-[12px]"
            style={{ color: "#666" }}
          >
            <span>Operator portal</span>
          </nav>
        </header>

        <main className="flex-1 flex flex-col">{children}</main>

        {showPoweredByBadge ? (
          <footer
            data-operator-portal-footer=""
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
