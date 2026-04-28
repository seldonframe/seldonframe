import Link from "next/link";
import { auth } from "@/auth";

// Public pricing page. Mirrors the marketing landing's #pricing section
// (3 tiers — Starter $49, Operator $99, Agency $149). The first workspace
// remains free forever. Self-hosting is also free.
//
// This page lives in the CRM app shell so it's reachable from both
// `seldonframe.com/pricing` (marketing host) and
// `app.seldonframe.com/pricing` (in-app shell). Logged-in users get a CTA
// to /settings/billing; logged-out users get /signup.

type Tier = {
  id: string;
  name: string;
  price: string;
  badgeNote: string;
  featured?: boolean;
  features: string[];
};

const TIERS: Tier[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    badgeNote: "Start here",
    features: [
      "One fully-featured workspace on <slug>.app.seldonframe.com",
      "CRM, Cal.diy booking, Formbricks intake, Brain v2",
      "MCP + Claude Code integration",
      "Community support",
      "BYO LLM keys",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    price: "$49",
    badgeNote: "Per workspace / month",
    features: [
      "Full primitive surface",
      "Up to 100 workflow runs/mo",
      "500 MB database",
      "Custom domain",
      "Branded customer portal",
      "Community support",
      "BYO LLM keys",
    ],
  },
  {
    id: "operator",
    name: "Operator",
    price: "$99",
    badgeNote: "Per workspace / month",
    featured: true,
    features: [
      "Everything in Starter",
      "Up to 5,000 workflow runs/mo",
      "2 GB database",
      "Brain Layer 1 (workspace insights)",
      "Approval gates",
      "Email support",
    ],
  },
  {
    id: "agency",
    name: "Agency",
    price: "$149",
    badgeNote: "Per workspace / month",
    features: [
      "Everything in Operator",
      "Unlimited workflow runs",
      "10 GB database",
      "Brain Layer 2 (cross-workspace niche insights)",
      "White-label option",
      "Priority support",
    ],
  },
];

type PricingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const session = await auth();
  if (searchParams) await searchParams; // keep Next.js happy if callers pass params

  const ctaHref = session?.user ? "/settings/billing" : "/signup";

  return (
    <main className="crm-page">
      <section className="mx-auto max-w-6xl space-y-10 py-12">
        <header className="space-y-4 text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1 text-xs font-medium text-muted-foreground">
            No credit card to start
          </p>
          <h1 className="text-page-title">Simple pricing. You own the rest.</h1>
          <p className="mx-auto max-w-2xl text-base text-muted-foreground">
            Your first workspace is free, forever. Paid tiers unlock more workflow runs, Brain
            intelligence, and (on Agency) white-label branding. Self-host for free.
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {TIERS.map((tier) => (
            <article
              key={tier.id}
              className={`crm-card relative flex flex-col gap-5 overflow-hidden p-6 ${
                tier.featured ? "border-primary/60" : ""
              }`}
            >
              {tier.featured ? (
                <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-primary/60" />
              ) : null}
              <div className="flex items-center justify-between">
                <h2 className="text-card-title">{tier.name}</h2>
                {tier.featured ? (
                  <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
                    Most popular
                  </span>
                ) : null}
              </div>
              <div>
                <p className="text-4xl font-semibold tracking-tight">{tier.price}</p>
                <p className="mt-1 text-sm text-muted-foreground">{tier.badgeNote}</p>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {tier.features.map((feat) => (
                  <li key={feat}>· {feat}</li>
                ))}
              </ul>
              <div className="mt-auto">
                <Link
                  href={tier.id === "free" ? (session?.user ? "/dashboard" : "/signup") : ctaHref}
                  className={`${
                    tier.featured ? "crm-button-primary" : "crm-button-secondary"
                  } inline-flex h-11 w-full items-center justify-center px-4 text-sm font-medium`}
                >
                  {tier.id === "free"
                    ? session?.user
                      ? "Go to dashboard"
                      : "Start free"
                    : session?.user
                      ? "Manage billing"
                      : "Start free"}
                </Link>
              </div>
            </article>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-card/50 p-6 text-sm text-muted-foreground">
          <p className="mb-2 font-medium text-foreground">How billing works</p>
          <ul className="space-y-1.5">
            <li>· The first workspace on your account is always free. No trial clock.</li>
            <li>· Paid tiers are billed per workspace per month.</li>
            <li>· Delete a workspace and the charge stops on your next billing cycle.</li>
            <li>· You bring your own Claude / OpenAI key — we don&apos;t mark up inference.</li>
            <li>· Every LLM call is tracked, attributed to the workflow run, and visible in your admin dashboard.</li>
          </ul>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Self-host for free. No limits. Deploy on your own infrastructure.{" "}
          <a
            href="https://github.com/seldonframe/seldonframe"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline underline-offset-4"
          >
            View on GitHub
          </a>
        </p>
      </section>
    </main>
  );
}
