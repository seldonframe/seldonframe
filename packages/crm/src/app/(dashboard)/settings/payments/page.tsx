import { startStripeConnectAction, getStripeConnectionStatus } from "@/lib/payments/actions";
import { UpgradeGate } from "@/components/upgrade-gate";
import { getOrgFeatures } from "@/lib/billing/features";
import { getOrgId } from "@/lib/auth/helpers";
import { getOrgSubscription } from "@/lib/billing/subscription";

export default async function PaymentsSettingsPage() {
  const status = await getStripeConnectionStatus();
  const orgId = await getOrgId();
  const subscription = await getOrgSubscription(orgId);
  const features = getOrgFeatures(subscription.tier ?? "free");
  const hasCloudAccess = subscription.tier !== "free" && subscription.tier !== "starter";

  return (
    <section className="animate-page-enter space-y-4">
      <div>
        <h1 className="text-page-title">Payments</h1>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">Connect Stripe to accept paid bookings.</p>
      </div>

      <div className="crm-card space-y-3 p-4">
        <p className="text-[11px] uppercase tracking-[0.08em] text-[hsl(var(--color-text-muted))]">Stripe Connect</p>
        <UpgradeGate
          feature="stripe-connect"
          requiredPlan="cloud"
          hasAccess={hasCloudAccess}
          message="Accept payments directly through your pages on Cloud+."
        >
          {status ? (
            <p className="text-label text-[hsl(var(--color-text-secondary))]">
              Connected account: <span className="font-medium text-foreground">{status.stripeAccountId}</span>
            </p>
          ) : (
            <p className="text-label text-[hsl(var(--color-text-secondary))]">No Stripe account connected.</p>
          )}

          <form action={startStripeConnectAction}>
            <button type="submit" className="crm-button-primary h-10 px-4">
              {status ? "Reconnect Stripe" : "Connect Stripe"}
            </button>
          </form>
        </UpgradeGate>
        {!features.managedEmail ? (
          <p className="text-xs text-[hsl(var(--color-text-muted))]">Upgrade to Cloud to unlock platform-managed payment flows and billing tools.</p>
        ) : null}
      </div>
    </section>
  );
}
