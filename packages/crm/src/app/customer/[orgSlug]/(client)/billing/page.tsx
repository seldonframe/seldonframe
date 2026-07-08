// Autopay console (2026-07-08) — Task 3: the client portal's Billing
// section. Payment history (this client's payment_records, newest first),
// card summary (brand/last4 only, from contacts.customFields.billing), and
// an "Update card" button that opens a Stripe billing-portal session on the
// AGENCY's connected account. Flag-gated: absent + 404s clean when
// SF_AUTOPAY_CONSOLE is off (mirrors the nav tab gating in layout.tsx).
//
// Auth: requirePortalSessionForOrg — the SAME session-scoping every other
// portal page uses. getPortalBillingData is scoped by BOTH orgId AND
// contactId (lib/payments/portal-billing.ts), so a client can never see
// another org's or another contact's payment rows.

import { notFound } from "next/navigation";
import { requirePortalSessionForOrg } from "@/lib/portal/auth";
import { getPortalBillingData } from "@/lib/payments/portal-billing";
import { isAutopayConsoleOn } from "@/lib/web-build/policy";
import { UpdateCardButton } from "./update-card-button";

function formatDollars(amount: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return amount;
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const STATUS_LABEL: Record<string, string> = {
  completed: "Paid",
  failed: "Failed",
  refunded: "Refunded",
  partially_refunded: "Partially refunded",
  disputed: "Disputed",
  pending: "Pending",
};

export default async function CustomerBillingPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;

  if (!isAutopayConsoleOn({ SF_AUTOPAY_CONSOLE: process.env.SF_AUTOPAY_CONSOLE })) {
    notFound();
  }

  const session = await requirePortalSessionForOrg(orgSlug);
  const { payments, card } = await getPortalBillingData({ orgId: session.orgId, contactId: session.contact.id });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: "#111" }}>
          Billing
        </h1>
        <p className="text-[13px]" style={{ color: "#666" }}>
          Your payment history and card on file.
        </p>
      </header>

      <section
        className="px-5 py-4 sm:px-6 sm:py-5"
        style={{ backgroundColor: "#FFFFFF", border: "1px solid #E5E5E1", borderRadius: "12px" }}
      >
        <h2
          className="text-[12px] uppercase tracking-wide pb-3 mb-3"
          style={{ color: "#888", borderBottom: "1px solid #F0F0EC" }}
        >
          Card on file
        </h2>
        {card ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[14px]" style={{ color: "#111" }}>
              {card.brand.charAt(0).toUpperCase() + card.brand.slice(1)} •••• {card.last4}
              <span className="ml-2 text-[12px]" style={{ color: "#888" }}>
                exp {String(card.expMonth).padStart(2, "0")}/{card.expYear}
              </span>
            </p>
            <UpdateCardButton orgSlug={orgSlug} />
          </div>
        ) : (
          <p className="text-[13px]" style={{ color: "#888" }}>
            No card on file yet.
          </p>
        )}
      </section>

      <section
        className="px-5 py-4 sm:px-6 sm:py-5"
        style={{ backgroundColor: "#FFFFFF", border: "1px solid #E5E5E1", borderRadius: "12px" }}
      >
        <h2
          className="text-[12px] uppercase tracking-wide pb-3 mb-3"
          style={{ color: "#888", borderBottom: "1px solid #F0F0EC" }}
        >
          Payment history
        </h2>
        {payments.length === 0 ? (
          <p className="text-[13px]" style={{ color: "#888" }}>
            No payments yet.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "#F0F0EC" }}>
            {payments.map((row) => {
              const hostedUrl =
                typeof row.metadata?.hostedInvoiceUrl === "string" ? row.metadata.hostedInvoiceUrl : null;
              return (
                <li key={row.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium" style={{ color: "#111" }}>
                      {formatDollars(row.amount)}
                    </p>
                    <p className="text-[12px]" style={{ color: "#888" }}>
                      {new Date(row.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}{" "}
                      · {STATUS_LABEL[row.status] ?? row.status}
                    </p>
                  </div>
                  {hostedUrl ? (
                    <a
                      href={hostedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 items-center px-3 text-[12px] font-semibold whitespace-nowrap"
                      style={{ backgroundColor: "#FFFFFF", color: "#111", border: "1px solid #E5E5E1", borderRadius: "6px" }}
                    >
                      View receipt
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
