// packages/crm/src/components/dashboard/agency-key-banner.tsx
//
// 2026-07-08 pricing ladder (Task 5) — advisory launch-window banner
// for sub-account workspaces still running on SeldonFrame's platform
// key. Purely presentational: every gating decision (flag on? org has
// a parentAgencyId? no BYOK key set? older than 14 days?) is computed
// SERVER-SIDE by the dashboard layout and passed down as `show` — this
// component has no data-fetching of its own, so it stays trivially
// testable and never causes an extra DB round trip on pages that don't
// need it.
//
// v1 is advisory only (spec D3, soft launch window — no hard cutoff):
// the sub-account keeps working on the platform key indefinitely; this
// is a nudge, not a block.

import Link from "next/link";

export type AgencyKeyBannerProps = {
  show: boolean;
};

export function AgencyKeyBanner({ show }: AgencyKeyBannerProps) {
  if (!show) return null;

  return (
    <div className="crm-card flex flex-wrap items-center justify-between gap-3 border-caution/40 bg-caution/10 p-3 text-sm">
      <p className="text-[hsl(var(--color-text-secondary))]">
        This sub-account is running on SeldonFrame&apos;s keys — add your agency AI key so
        client agents run at your raw cost.
      </p>
      <Link
        href="/settings/integrations"
        className="crm-button-primary h-8 px-3 text-xs"
      >
        Add agency key
      </Link>
    </div>
  );
}
