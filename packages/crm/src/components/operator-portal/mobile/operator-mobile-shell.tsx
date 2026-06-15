// v1 PWA — operator mobile shell.
//
// Branded header (logo + brand name) + scrollable content + fixed
// bottom-tab nav + service-worker registration + install affordance.
// Light-mode inline-style aesthetic matching the customer portal.
// min-h-[100dvh] so it fills the standalone viewport; bottom padding
// reserves space for the fixed nav (+ iOS safe area).
//
// Pure composition: all data (branding, orgSlug) is passed in by the
// layout. No internal state.

import type { ReactNode } from "react";

import type { EffectiveBranding } from "@/lib/partner-agencies/branding";
import { OperatorMobileNav } from "./operator-mobile-nav";
import { OperatorSearch } from "./operator-search";
import { ServiceWorkerRegister } from "@/components/operator-portal/pwa/sw-register";
import { InstallButton } from "@/components/operator-portal/pwa/install-button";

export function OperatorMobileShell({
  orgSlug,
  orgName,
  branding,
  children,
}: {
  orgSlug: string;
  orgName: string;
  branding: EffectiveBranding | null;
  children: ReactNode;
}) {
  const brandName = branding?.brand_name || "SeldonFrame";
  const logoUrl = branding?.logo_url ?? null;
  const accentColor =
    (branding?.is_white_label && branding.primary_color) || "#7c3aed";
  // accent-strong: ~15% darker via color-mix (CSS) — set as inline var so any
  // child can use var(--accent-strong) without knowing the raw color.
  const accentStrong = `color-mix(in srgb, ${accentColor} 85%, black)`;
  const scope = `/portal/${orgSlug}/`;

  // Keep a stable alias for the existing nav (activeColor) until we restyle it
  const activeColor = accentColor;

  return (
    <div
      // .sf-portal is the DS scope root — all token vars are declared here.
      // Inline CSS vars wire the agency accent so the whole subtree re-skins.
      className="sf-portal mx-auto flex min-h-[100dvh] max-w-[640px] flex-col"
      data-operator-mobile-shell=""
      data-white-label={branding?.is_white_label ? "true" : "false"}
      style={
        {
          "--accent": accentColor,
          "--accent-strong": accentStrong,
          backgroundColor: "var(--surface-app)",
          color: "var(--text-primary)",
          fontFamily: "var(--font-sans)",
        } as React.CSSProperties
      }
    >
      <header
        className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-3"
        style={{
          backgroundColor: "var(--surface-card)",
          borderBottom: "1px solid var(--border-hairline)",
          height: "var(--header-h)",
        }}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={brandName}
              style={{ width: 30, height: 30, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
            />
          ) : (
            /* Accent monogram if no logo */
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 30,
                height: 30,
                borderRadius: 8,
                background: "var(--accent)",
                color: "var(--text-on-accent)",
                fontSize: 15,
                fontWeight: "var(--weight-heavy)",
                flexShrink: 0,
              }}
            >
              {orgName.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="flex min-w-0 flex-col leading-tight">
            <span
              className="truncate"
              style={{
                fontSize: "var(--type-heading)",
                fontWeight: "var(--weight-bold)",
                letterSpacing: "var(--track-tight)",
                color: "var(--text-primary)",
              }}
            >
              {orgName}
            </span>
            {branding?.is_white_label ? (
              <span
                className="truncate"
                style={{ fontSize: "var(--type-micro)", color: "var(--text-muted)" }}
              >
                on {brandName}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <OperatorSearch orgSlug={orgSlug} activeColor={activeColor} />
          <InstallButton brandColor={activeColor} />
        </div>
      </header>

      {/* Content. Bottom padding clears the fixed nav + safe area. */}
      <main
        className="flex flex-1 flex-col"
        style={{ paddingBottom: "calc(var(--tabbar-h) + var(--safe-bottom))" }}
      >
        {children}
      </main>

      <OperatorMobileNav orgSlug={orgSlug} activeColor={activeColor} />
      <ServiceWorkerRegister scope={scope} />
    </div>
  );
}
