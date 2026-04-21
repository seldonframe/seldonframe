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

      {status ? (
        <div className="crm-card space-y-2 p-4">
          <p className="text-[11px] uppercase tracking-[0.08em] text-[hsl(var(--color-text-muted))]">Connect webhook</p>
          <p className="text-sm text-muted-foreground">
            Register this URL as a <span className="font-medium text-foreground">Connect</span> webhook endpoint in your Stripe dashboard (Developers → Webhooks → Add endpoint → Connect). Subscribe to <code className="text-foreground">payment_intent.*</code>, <code className="text-foreground">charge.refunded</code>, <code className="text-foreground">charge.dispute.*</code>, <code className="text-foreground">invoice.*</code>, and <code className="text-foreground">customer.subscription.*</code> events.
          </p>
          <code className="block break-all rounded bg-muted/40 px-2 py-1 text-[11px] text-foreground">
            {`${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.seldonframe.com"}/api/webhooks/stripe/connect`}
          </code>
          <p className="text-xs text-muted-foreground">
            Set <code className="text-foreground">STRIPE_CONNECT_WEBHOOK_SECRET</code> in your environment to the signing secret Stripe shows after creating the endpoint. This is distinct from the platform webhook used for SeldonFrame&apos;s own billing.
          </p>
        </div>
      ) : null}
    </section>
  );
}
