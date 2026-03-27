import Link from "next/link";
import { requireCloudAuth } from "@/lib/auth/actions";
import { activateProTierAction, createBillingCheckoutAction, getCurrentTier } from "@/lib/cloud/actions";

export default async function CloudBillingPage() {
  await requireCloudAuth();
  const tier = await getCurrentTier();

  return (
    <main style={{ padding: 24, display: "grid", gap: 16 }}>
      <header>
        <h1 style={{ margin: 0 }}>Billing</h1>
        <p style={{ margin: "6px 0 0", color: "#94a3b8" }}>Current tier: {tier}</p>
      </header>

      <section style={{ border: "1px solid #1e293b", borderRadius: 12, padding: 16, background: "#111827", display: "grid", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Upgrade with Stripe</h2>
        <p style={{ margin: 0, color: "#94a3b8" }}>Launch checkout to upgrade this workspace to Pro.</p>
        <form action={createBillingCheckoutAction}>
          <button type="submit" style={{ height: 36, padding: "0 12px" }}>Open Stripe Checkout</button>
        </form>
        <form action={activateProTierAction}>
          <button type="submit" style={{ height: 36, padding: "0 12px" }}>Mark Pro Active (Post-Checkout)</button>
        </form>
      </section>

      <Link href="/dashboard" style={{ color: "#67e8f9" }}>
        Back to dashboard
      </Link>
    </main>
  );
}
