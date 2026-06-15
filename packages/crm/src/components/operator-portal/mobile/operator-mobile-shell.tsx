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
  const brandName = branding?.is_white_label ? branding.brand_name : "SeldonFrame";
  const logoUrl = branding?.logo_url ?? null;
  const activeColor =
    (branding?.is_white_label && branding.primary_color) || "#5b21b6";
  const scope = `/portal/${orgSlug}/`;

  return (
    <div
      data-operator-mobile-shell=""
      data-white-label={branding?.is_white_label ? "true" : "false"}
      className="mx-auto flex min-h-[100dvh] max-w-[640px] flex-col"
      style={{
        backgroundColor: "#F7F7F5",
        color: "#111",
        fontFamily:
          "var(--sf-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif)",
      }}
    >
      <header
        className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-3"
        style={{ backgroundColor: "#FFFFFF", borderBottom: "1px solid #E5E5E1" }}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={brandName}
              className="h-7 w-7 shrink-0 rounded-md object-cover"
            />
          ) : null}
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[14px] font-semibold tracking-tight" style={{ color: "#111" }}>
              {orgName}
            </span>
            {branding?.is_white_label ? (
              <span className="truncate text-[11px]" style={{ color: "#999" }}>
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

      {/* Content. Bottom padding clears the fixed nav (56px) + safe area. */}
      <main
        className="flex flex-1 flex-col"
        style={{ paddingBottom: "calc(56px + env(safe-area-inset-bottom, 0px))" }}
      >
        {children}
      </main>

      <OperatorMobileNav orgSlug={orgSlug} activeColor={activeColor} />
      <ServiceWorkerRegister scope={scope} />
    </div>
  );
}
