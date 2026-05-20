// packages/crm/src/app/(dashboard)/proposals/stripe-pending-banner.tsx
// 2026-05-20 — Amber banner shown while Stripe is verifying the agency's
// Connect account (chargesEnabled = false but a row exists). Also used for
// the ?status=pending flash after the Stripe return redirect.

export function StripePendingBanner() {
  return (
    <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
      <div className="flex-1">
        <p className="text-sm font-medium text-amber-700">Stripe is verifying your account</p>
        <p className="text-xs text-muted-foreground mt-1">
          Usually 10–30 minutes. You can draft proposals now; the Send button unlocks once Stripe
          verifies (charges enabled).
        </p>
      </div>
    </section>
  );
}
