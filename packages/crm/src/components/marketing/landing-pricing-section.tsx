"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { BorderBeam } from "@/components/ui/border-beam";

type BillingPeriod = "monthly" | "yearly";

type PlanCard = {
  id: string;
  name: string;
  monthly: number;
  yearly: number;
  lookupMonthly: string;
  lookupYearly: string;
  cta?: "checkout" | "github";
  features: string[];
  badge?: string;
};

const PLANS: PlanCard[] = [
  {
    id: "self_host",
    name: "Self-Host",
    monthly: 0,
    yearly: 0,
    lookupMonthly: "",
    lookupYearly: "",
    cta: "github",
    features: ["Unlimited workspaces", "BYOK API", "Community support"],
  },
  {
    id: "starter",
    name: "Starter",
    monthly: 49,
    yearly: 470,
    lookupMonthly: "starter_monthly",
    lookupYearly: "starter_yearly",
    cta: "checkout",
    features: ["1 workspace", "Seldon It (BYOK)", "All blocks", "Email support"],
  },
  {
    id: "cloud_pro",
    name: "Cloud Pro",
    monthly: 99,
    yearly: 950,
    lookupMonthly: "cloud_pro_monthly",
    lookupYearly: "cloud_pro_yearly",
    cta: "checkout",
    features: ["1 workspace", "Unlimited Seldon It", "All blocks", "Priority support", "Managed email delivery"],
  },
  {
    id: "pro_3",
    name: "Pro 3",
    monthly: 149,
    yearly: 1430,
    lookupMonthly: "pro_3_monthly",
    lookupYearly: "pro_3_yearly",
    cta: "checkout",
    badge: "Recommended",
    features: ["3 client workspaces", "Unlimited Seldon It", "AI Framework Generator", "Custom domains", "Managed email"],
  },
  {
    id: "pro_5",
    name: "Pro 5",
    monthly: 249,
    yearly: 2390,
    lookupMonthly: "pro_5_monthly",
    lookupYearly: "pro_5_yearly",
    cta: "checkout",
    features: ["5 client workspaces", "Everything in Pro 3 +", "White-label", "Framework library"],
  },
  {
    id: "pro_10",
    name: "Pro 10",
    monthly: 349,
    yearly: 3350,
    lookupMonthly: "pro_10_monthly",
    lookupYearly: "pro_10_yearly",
    cta: "checkout",
    features: ["10 client workspaces", "Everything in Pro 5 +", "Custom domains", "Full white label", "Marketplace publishing"],
  },
];

function formatAmount(amount: number, period: BillingPeriod) {
  if (amount === 0) {
    return "Free forever";
  }

  return period === "monthly" ? `$${amount}/mo` : `$${amount}/yr`;
}

export function LandingPricingSection() {
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [loadingLookupKey, setLoadingLookupKey] = useState<string | null>(null);

  const cards = useMemo(() => PLANS, []);

  async function handleSubscribe(lookupKey: string) {
    if (!lookupKey) {
      return;
    }

    setLoadingLookupKey(lookupKey);

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billingPeriod: lookupKey }),
      });

      if (res.status === 401) {
        window.location.href = `/signup?plan=${encodeURIComponent(lookupKey)}`;
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
      setLoadingLookupKey(null);
    }
  }

  return (
    <section id="pricing" className="py-20 md:py-28">
      <div className="rounded-3xl border border-white/10 bg-[#071216] p-6 md:p-8">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Simple pricing. No surprises.</h2>

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
                  {value === "monthly" ? "Monthly" : "Yearly — save 20%"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((plan) => {
            const lookupKey = period === "monthly" ? plan.lookupMonthly : plan.lookupYearly;
            const loading = loadingLookupKey === lookupKey;

            return (
              <article key={plan.id} className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a181d] p-5">
                {plan.id === "pro_3" ? (
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

                <p className="mt-4 text-2xl font-semibold text-[#f2fffd]">{formatAmount(period === "monthly" ? plan.monthly : plan.yearly, period)}</p>

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
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleSubscribe(lookupKey)}
                      disabled={loading}
                      className="inline-flex h-10 items-center rounded-full bg-[#14b8b0] px-4 text-sm font-semibold text-[#07312d] transition-colors hover:bg-[#26c9c1] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading ? "Redirecting..." : "Start Free"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-5 rounded-xl border border-white/10 bg-[#0a181d] px-4 py-3 text-sm text-[#c0dbdf]">
          Pro 20: <span className="font-semibold text-[#e7fbf8]">{period === "monthly" ? "$449/mo" : "$4,310/yr"}</span> — 20
          workspaces, everything in Pro 10 + dedicated support + early access. {" "}
          <a href="mailto:support@seldonframe.com" className="text-[#80f2ea] hover:text-[#aefaf5]">
            Contact us
          </a>
        </div>

        <p className="mt-4 text-sm text-[#8faab0]">
          All paid plans include 14-day free trial. No credit card required to start.
        </p>
      </div>
    </section>
  );
}
