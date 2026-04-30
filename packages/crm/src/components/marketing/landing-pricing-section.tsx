"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { BorderBeam } from "@/components/ui/border-beam";

type BillingPeriod = "monthly" | "yearly";

type PlanCard = {
  id: "self_host" | "free" | "growth" | "scale";
  name: string;
  monthly: number;
  yearly: number;
  /** Tier id passed to /api/stripe/checkout. The server reads this and
   *  builds the multi-price subscription (base + metered overages)
   *  from `lib/billing/checkout-items.ts`. */
  tier: "growth" | "scale" | null;
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
    id: "free",
    name: "Free",
    monthly: 0,
    yearly: 0,
    tier: null,
    cta: "signup",
    tagline: "Free forever — upgrade when you grow",
    features: [
      "1 workspace",
      "50 contacts",
      "100 agent runs / mo",
      "All core blocks (landing, booking, intake, CRM, agents)",
      "SeldonFrame branding on surfaces",
      "Community support",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    monthly: 29,
    yearly: 0,
    tier: "growth",
    cta: "checkout",
    badge: "Recommended",
    tagline: "For operators with paying clients",
    features: [
      "3 workspaces",
      "500 contacts included (then $0.02 / contact)",
      "1,000 agent runs included (then $0.03 / run)",
      "Custom domain",
      "No SeldonFrame branding",
      "Client portal access",
    ],
  },
  {
    id: "scale",
    name: "Scale",
    monthly: 99,
    yearly: 0,
    tier: "scale",
    cta: "checkout",
    tagline: "For agencies building for multiple clients",
    features: [
      "Unlimited workspaces",
      "Unlimited contacts",
      "Agent runs $0.02 / run (all metered)",
      "Full white-label",
      "Client portal with custom branding",
      "Priority support",
    ],
  },
];

function formatAmount(amount: number, period: BillingPeriod) {
  if (amount === 0) {
    return "Free forever";
  }

  return period === "monthly" ? `$${amount}/mo + usage` : `$${amount}/yr + usage`;
}

export function LandingPricingSection() {
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

  async function handleSubscribe(tier: "growth" | "scale") {
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
          Free forever to start. Pay base + usage as you scale. No per-workspace charge.
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
                {plan.id === "growth" ? (
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
          Billed monthly · cancel anytime. No per-workspace charge — Scale ships with unlimited workspaces.
        </p>
      </div>
    </section>
  );
}
