"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { BorderBeam } from "@/components/ui/border-beam";

type BillingPeriod = "monthly" | "yearly";

type PlanCard = {
  id: "self_host" | "builder" | "workspace" | "agency";
  name: string;
  monthly: number;
  yearly: number;
  /** Tier id passed to /api/stripe/checkout. The server reads this and
   *  builds the per-tier base line item + metadata from
   *  `lib/billing/checkout-items.ts`. */
  tier: "builder" | "workspace" | "agency" | null;
  cta?: "checkout" | "github" | "signup";
  features: string[];
  badge?: string;
  tagline: string;
};

const PLANS: PlanCard[] = [
  {
    id: "self_host",
    name: "Self-Host",
    monthly: 0,
    yearly: 0,
    tier: null,
    cta: "github",
    tagline: "Deploy on your infra",
    features: ["Unlimited workspaces", "BYOK API", "Community support"],
  },
  {
    id: "builder",
    name: "Builder",
    monthly: 19,
    yearly: 0,
    tier: "builder",
    cta: "checkout",
    tagline: "Landing pages on your own domain",
    features: [
      "Up to 10 landing pages",
      "Your own custom domain",
      "No SeldonFrame branding",
      "Managed AI page generation",
      "Email support",
    ],
  },
  {
    id: "workspace",
    name: "Workspace",
    monthly: 49,
    yearly: 0,
    tier: "workspace",
    cta: "checkout",
    badge: "Most popular",
    tagline: "One complete business OS",
    features: [
      "1 full client workspace",
      "Website, booking, intake & CRM",
      "AI chatbot included",
      "Custom domain · client portal",
      "Email support",
    ],
  },
  {
    id: "agency",
    name: "Agency",
    monthly: 297,
    yearly: 0,
    tier: "agency",
    cta: "checkout",
    tagline: "White-label for multiple clients",
    features: [
      "10 client workspaces included",
      "+$10/mo per workspace beyond 10",
      "Full white-label platform",
      "Marketplace access",
      "Priority support",
    ],
  },
];

function formatAmount(amount: number, period: BillingPeriod) {
  if (amount === 0) {
    return "Free";
  }

  return period === "monthly" ? `$${amount}/mo` : `$${amount}/yr`;
}

export function LandingPricingSection() {
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

  async function handleSubscribe(tier: "builder" | "workspace" | "agency") {
    setLoadingTier(tier);

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });

      if (res.status === 401) {
        window.location.href = `/signup?plan=${encodeURIComponent(tier)}`;
        return;
      }

      const payload = (await res.json()) as { url?: string; error?: string };

      if (payload.url) {
        window.location.href = payload.url;
        return;
      }

      throw new Error(payload.error || "Checkout URL unavailable");
    } catch {
      window.location.href = "/signup";
    } finally {
      setLoadingTier(null);
    }
  }

  return (
    <section id="pricing" className="py-20 md:py-28">
      <div className="rounded-3xl border border-white/10 bg-[#071216] p-6 md:p-8">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Simple pricing. No surprises.</h2>
        <p className="mt-2 text-[#9fb7bc]">
          One flat monthly price per tier. No metered bills, no surprise fees.
        </p>

        <div className="mt-6 inline-flex rounded-full border border-white/10 bg-[#0a191d] p-1">
          {(["monthly", "yearly"] as const).map((value) => {
            const active = period === value;

            return (
              <button
                key={value}
                type="button"
                onClick={() => setPeriod(value)}
                className="relative px-4 py-2 text-sm font-medium text-[#cce5e8]"
              >
                {active ? (
                  <motion.span
                    layoutId="pricing-period"
                    className="absolute inset-0 rounded-full bg-[#14b8b0]"
                    transition={{ type: "spring", stiffness: 280, damping: 28 }}
                  />
                ) : null}
                <span className={`relative ${active ? "text-[#04302c]" : "text-[#9ab4ba]"}`}>
                  {value === "monthly" ? "Monthly" : "Yearly"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((plan) => {
            const loading = loadingTier === plan.tier;

            return (
              <article
                key={plan.id}
                className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a181d] p-5"
              >
                {plan.id === "workspace" ? (
                  <BorderBeam size={90} duration={7} colorFrom="#16b5ae" colorTo="#89fff8" borderWidth={1.5} />
                ) : null}

                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold text-[#e7fbf8]">{plan.name}</h3>
                  {plan.badge ? (
                    <span className="rounded-full border border-[#41d7cf]/45 bg-[#1ab8b0]/15 px-2.5 py-1 text-xs font-semibold text-[#89fff8]">
                      {plan.badge}
                    </span>
                  ) : null}
                </div>

                <p className="mt-1 text-xs text-[#7ea0a6]">{plan.tagline}</p>

                <p className="mt-4 text-2xl font-semibold text-[#f2fffd]">
                  {formatAmount(period === "monthly" ? plan.monthly : plan.yearly, period)}
                </p>

                <ul className="mt-4 space-y-1.5 text-sm text-[#9fb7bc]">
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>

                <div className="mt-6">
                  {plan.cta === "github" ? (
                    <Link
                      href="https://github.com/seldonframe/crm"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-10 items-center rounded-full border border-white/15 px-4 text-sm font-medium text-[#d7f1ee] hover:border-[#31d8d0]/60"
                    >
                      GitHub ↗
                    </Link>
                  ) : plan.cta === "signup" ? (
                    <Link
                      href="/signup"
                      className="inline-flex h-10 items-center rounded-full border border-white/15 px-4 text-sm font-medium text-[#d7f1ee] hover:border-[#31d8d0]/60"
                    >
                      Start free
                    </Link>
                  ) : plan.tier ? (
                    <button
                      type="button"
                      onClick={() => void handleSubscribe(plan.tier!)}
                      disabled={loading}
                      className="inline-flex h-10 items-center rounded-full bg-[#14b8b0] px-4 text-sm font-semibold text-[#07312d] transition-colors hover:bg-[#26c9c1] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading ? "Redirecting..." : `Start ${plan.name}`}
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>

        <p className="mt-5 text-sm text-[#8faab0]">
          Billed monthly · cancel anytime. Agency includes 10 client workspaces; extra workspaces are $10/mo each.
        </p>
      </div>
    </section>
  );
}
