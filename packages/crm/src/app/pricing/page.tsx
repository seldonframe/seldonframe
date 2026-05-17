import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { assertWritable } from "@/lib/demo/server";

// Public pricing page. Mirrors the marketing landing's #pricing section.
//
// April 30, 2026 — usage-based pricing migration. Tiers are Free / Growth /
// Scale. Self-host (open-source MIT) is mentioned in the footer CTA so it
// doesn't take a whole card slot from the three hosted tiers operators are
// actually deciding between.
//
// 2026-05-17 — "Self-host Free" tier card removed (info dupes the footer
// CTA) so the three hosted tiers (Free / Growth / Scale) get equal visual
// weight and the operator's eye lands on Growth without the Self-host
// option competing for attention as a $0 alternative.

type Tier = {
  id: "free" | "growth" | "scale";
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
    badgeNote: "Free forever — upgrade when you grow",
    features: [
      "1 workspace",
      "50 contacts",
      "100 agent runs / mo",
      "All core blocks (landing, booking, intake, CRM, pipeline, agents)",
      "BYO LLM keys",
      "Community support",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    price: "$29/mo",
    badgeNote: "+ usage · for operators with paying clients",
    featured: true,
    features: [
      "3 workspaces",
      "500 contacts included, then $0.02 / contact",
      "1,000 agent runs included, then $0.03 / run",
      "Custom domain",
      "Remove SeldonFrame branding",
      "Client portal · email support",
    ],
  },
  {
    id: "scale",
    name: "Scale",
    price: "$99/mo",
    badgeNote: "+ usage · for agencies serving multiple clients",
    features: [
      "Unlimited workspaces",
      "Unlimited contacts",
      "Agent runs $0.02 each (all metered)",
      "Full white-label",
      "Client portal with custom branding",
      "Brain Layer 2 · priority support",
    ],
  },
];

type PricingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Server action: pick the Free tier in one click. Stamps users.planId =
 * 'free' on the signed-in user (only if currently NULL) and redirects to
 * /dashboard. Without this action, clicking "Go to dashboard" on the Free
 * card sent the user to /dashboard, where plan-gate.ts:74 saw !planId and
 * 307'd them straight back to /pricing in an infinite loop.
 *
 * 2026-05-17 fix — surfaced from user smoke test on prod ("i tried clicking
 * on the free workspace option... but nothing happens").
 */
async function selectFreeTierAction() {
  "use server";

  assertWritable();

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signup");
  }

  await db
    .update(users)
    .set({ planId: "free", updatedAt: new Date() })
    .where(and(eq(users.id, session.user.id), isNull(users.planId)));

  redirect("/dashboard");
}

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
            Open source. Self-host for free. Hosted tiers scale with your usage —
            pay only for what you use. Your first workspace is always free.
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-3">
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
                    Recommended
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
                {/* Free tier is a Server Action form — clicking the button
                    must stamp planId='free' on the user record so the
                    plan-gate stops 307'ing /dashboard back to /pricing.
                    Other tiers are plain links to /signup or
                    /settings/billing where Stripe checkout takes over. */}
                {tier.id === "free" && session?.user ? (
                  <form action={selectFreeTierAction}>
                    <button
                      type="submit"
                      className="crm-button-secondary inline-flex h-11 w-full items-center justify-center px-4 text-sm font-medium"
                    >
                      Go to dashboard
                    </button>
                  </form>
                ) : (
                  <Link
                    href={
                      tier.id === "free"
                        ? "/signup"
                        : session?.user
                          ? `${ctaHref}?plan=${tier.id}`
                          : `/signup?plan=${tier.id}`
                    }
                    className={`${
                      tier.featured ? "crm-button-primary" : "crm-button-secondary"
                    } inline-flex h-11 w-full items-center justify-center px-4 text-sm font-medium`}
                  >
                    {tier.id === "free"
                      ? "Start for $0"
                      : session?.user
                        ? `Upgrade to ${tier.name}`
                        : `Start ${tier.name}`}
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-card/50 p-6 text-sm text-muted-foreground">
          <p className="mb-2 font-medium text-foreground">How billing works</p>
          <ul className="space-y-1.5">
            <li>· The first workspace on your account is always free. No trial clock.</li>
            <li>· Hosted tiers charge a flat monthly base + metered usage. No per-workspace charge.</li>
            <li>· Free is hard-capped (50 contacts, 100 agent runs/mo). Paid tiers overflow into metered usage.</li>
            <li>· You bring your own Claude / OpenAI key — we don&apos;t mark up inference.</li>
            <li>· Every LLM call is tracked, attributed to the workflow run, and visible in your admin dashboard.</li>
          </ul>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Developers?{" "}
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
