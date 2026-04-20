import Link from "next/link";
import { auth } from "@/auth";

// Pricing model from CLAUDE.md:
//   "First workspace is free forever. Additional workspaces = $9/month."
//
// The old 6-tier plans.ts ($49/$99/$149/$199/$299/$449) is stale legacy and
// still drives the Stripe checkout flow from selectPlanAction — so /pricing
// needs to tell the TRUTH publicly while /settings/billing still carries the
// old checkout path. 0.5.c will reconcile plans.ts + selectPlanAction with
// this new model. Until then, /pricing routes logged-out users to /signup
// (which is free) and logged-in users to /settings/billing (where they can
// see their current plan — stale labels and all — and eventually buy a seat).

const PRO_PRICE_PER_WORKSPACE = 9; // USD / workspace / month. See CLAUDE.md.

type PricingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const session = await auth();
  if (searchParams) await searchParams; // keep Next.js happy if callers pass params

  const ctaHref = session?.user ? "/settings/billing" : "/signup";
  const ctaLabel = session?.user ? "Add a workspace" : "Start free";

  return (
    <main className="crm-page">
      <section className="mx-auto max-w-4xl space-y-10 py-12">
        <header className="space-y-4 text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1 text-xs font-medium text-muted-foreground">
            No credit card to start
          </p>
          <h1 className="text-page-title">Simple pricing. Built for builders.</h1>
          <p className="mx-auto max-w-2xl text-base text-muted-foreground">
            Your first workspace is free, forever. Spin up additional workspaces for ${PRO_PRICE_PER_WORKSPACE}/month
            each — keep them for a week, keep them for a decade.
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <article className="crm-card flex flex-col gap-5 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-card-title">Free</h2>
              <span className="rounded-full border border-border bg-background/70 px-2.5 py-1 text-xs text-muted-foreground">
                Start here
              </span>
            </div>
            <div>
              <p className="text-4xl font-semibold tracking-tight">$0</p>
              <p className="mt-1 text-sm text-muted-foreground">forever · 1 workspace</p>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>· One fully featured workspace on <span className="text-foreground">&lt;slug&gt;.app.seldonframe.com</span></li>
              <li>· CRM, Cal.diy booking, Formbricks intake, Brain v2</li>
              <li>· MCP + Claude Code integration</li>
              <li>· Public subdomain + shareable booking / intake links</li>
              <li>· Community support</li>
            </ul>
            <div className="mt-auto">
              <Link
                href={session?.user ? "/dashboard" : "/signup"}
                className="crm-button-secondary inline-flex h-11 w-full items-center justify-center px-4 text-sm font-medium"
              >
                {session?.user ? "Go to dashboard" : "Start free"}
              </Link>
            </div>
          </article>

          <article className="crm-card relative flex flex-col gap-5 overflow-hidden p-6">
            <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-primary/60" />
            <div className="flex items-center justify-between">
              <h2 className="text-card-title">Pro</h2>
              <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
                For agencies &amp; operators
              </span>
            </div>
            <div>
              <p className="text-4xl font-semibold tracking-tight">
                ${PRO_PRICE_PER_WORKSPACE}
                <span className="ml-1 text-base font-normal text-muted-foreground">/ workspace / month</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">pay only for what you spin up</p>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>· Everything in Free, per workspace</li>
              <li>· Unlimited additional workspaces — $9/mo each</li>
              <li>· Custom domain on any workspace</li>
              <li>· White-label branding (remove &quot;Powered by SeldonFrame&quot;)</li>
              <li>· Full Brain v2 + publishing to the marketplace</li>
              <li>· Priority support</li>
            </ul>
            <div className="mt-auto">
              <Link
                href={ctaHref}
                className="crm-button-primary inline-flex h-11 w-full items-center justify-center px-4 text-sm font-medium"
              >
                {ctaLabel}
              </Link>
            </div>
          </article>
        </div>

        <div className="rounded-2xl border border-border bg-card/50 p-6 text-sm text-muted-foreground">
          <p className="mb-2 font-medium text-foreground">How billing works</p>
          <ul className="space-y-1.5">
            <li>· The first workspace on your account is always free. No trial clock.</li>
            <li>· Each additional workspace adds $9/mo to your invoice the day you create it.</li>
            <li>· Delete a workspace and the $9/mo charge stops on your next billing cycle.</li>
            <li>· You bring your own Claude API key for MCP + Seldon It — we don&apos;t mark up inference.</li>
          </ul>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Self-host for free. No limits. Deploy on your own infrastructure. {" "}
          <a
            href="https://github.com/seldonframe/crm"
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
