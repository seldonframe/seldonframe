// packages/crm/src/app/pricing/page.tsx
//
// 2026-05-17 — Postiz-inspired redesign (Commit 1: visual only).
//
// Two-column desktop layout that mirrors how Postiz, Cal.com, and Linear
// position their pricing-as-checkout pages:
//
//   LEFT  — hero copy + trust signals + "what you get" callout. Commit 2
//           drops in a Stripe Payment Element (SetupIntent so Free also
//           collects a card on file, never charged). For now the column
//           is filled with proof so it doesn't look empty next to the
//           plans on the right.
//
//   RIGHT — Monthly/Yearly toggle (deferred until we ship yearly SKUs),
//           three big plan cards (Free / Growth / Scale), a features
//           callout grid, and a FAQ accordion.
//
//   BOTTOM — Sticky CTA bar so the operator can commit from any scroll
//            position without hunting for the button.
//
// Server actions intentionally unchanged from the previous round so this
// is a pure UI/CSS commit — Free still goes through selectFreeTierAction
// (stamps planId='free' + redirects to /dashboard), paid tiers still
// redirect to /settings/billing or /signup. Embedded Stripe + card-on-
// file for Free are next commit, after smoke test.

import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { Check, ShieldCheck } from "lucide-react";

import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { assertWritable } from "@/lib/demo/server";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// ---------------------------------------------------------------------------
// Pricing data
// ---------------------------------------------------------------------------

type TierId = "free" | "growth" | "scale";

type Tier = {
  id: TierId;
  name: string;
  price: string;
  cadence?: string;
  badgeNote: string;
  featured?: boolean;
  features: string[];
};

const TIERS: Tier[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    cadence: "forever",
    badgeNote: "Your first workspace, always free",
    features: [
      "1 client workspace",
      "50 contacts",
      "100 agent runs / mo",
      "All core blocks (CRM, booking, intake, agents)",
      "BYO LLM keys",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    price: "$29",
    cadence: "/ mo",
    badgeNote: "For operators with paying clients",
    featured: true,
    features: [
      "3 client workspaces",
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
    price: "$99",
    cadence: "/ mo",
    badgeNote: "For agencies serving multiple clients",
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

// Trust signals row under the hero. Three items mirrors Postiz's pattern.
// Copy reflects the CURRENT business model (no card required on Free); when
// Commit 2 lands and Free collects a card-on-file via SetupIntent, the
// middle item flips to "Card on file, never charged on Free."
const TRUST_SIGNALS: Array<{ icon: typeof Check; text: string }> = [
  { icon: Check, text: "First workspace always free" },
  { icon: ShieldCheck, text: "No card required to start" },
  { icon: Check, text: "Cancel anytime in Settings" },
];

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "How many client workspaces can I run?",
    a: "One on Free, three on Growth, unlimited on Scale. The workspace cap is the only thing tiers gate on count — features like custom domains, white-label, and AI agents stack on top per tier.",
  },
  {
    q: "Can I white-label SeldonFrame for my clients?",
    a: "Yes, from the Growth tier up. Growth removes the SeldonFrame branding from your client portal; Scale adds custom branding (your agency logo + colors) across every surface your client sees.",
  },
  {
    q: "Do I need a credit card to get started?",
    a: "No. Free signup, first workspace is free forever. You only enter a card when you upgrade to Growth or Scale, and you can cancel anytime from Settings → Billing.",
  },
  {
    q: "Whose Claude / OpenAI key gets used?",
    a: "Yours. SeldonFrame doesn't mark up inference. You bring your own key once, we encrypt it, and every LLM call is billed against your account. You see every invocation in the admin dashboard.",
  },
  {
    q: "What about self-hosting?",
    a: "Fully supported. The full source is MIT-licensed on GitHub. Self-host runs everything you see on Scale with no per-workspace charge — you only pay your own infra + your own LLM bill.",
  },
];

// ---------------------------------------------------------------------------
// Server actions
// ---------------------------------------------------------------------------

/**
 * Pick the Free tier in one click. Stamps users.planId='free' on the
 * signed-in user (only if currently NULL) and redirects to /dashboard.
 * Without this, the plain <Link href="/dashboard"> on the Free card sent
 * the user into an infinite /dashboard ↔ /pricing loop (plan-gate.ts:74
 * sees !planId and 307s back here).
 *
 * Commit 2 will replace this with a Stripe SetupIntent flow that
 * additionally attaches a card-on-file so future upgrades are one-click.
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type PricingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const session = await auth();
  if (searchParams) await searchParams; // keep Next.js happy if callers pass params

  const isAuthed = Boolean(session?.user);

  return (
    <main className="crm-page">
      {/* Bottom CTA bar reserves ~80px; pad the inner page so the last FAQ
          item isn't hidden behind it. */}
      <section className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-12">
          {/* =============== LEFT COLUMN: hero + proof =============== */}
          <div className="space-y-8">
            <header className="space-y-5">
              <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1 text-xs font-medium text-muted-foreground">
                Built for agencies and freelancers
              </p>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
                Spin up a client&apos;s{" "}
                <span className="text-primary">Business OS</span>{" "}
                <span className="text-muted-foreground">in 60 seconds.</span>
              </h1>
              <p className="text-base text-muted-foreground sm:text-lg">
                Paste a URL. We&apos;ll build their CRM, booking page, intake
                form, and AI chatbot in one pass. Your first workspace is free
                forever — no card to start.
              </p>
            </header>

            <ul className="space-y-2.5">
              {TRUST_SIGNALS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-sm">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Icon className="size-3" aria-hidden="true" />
                  </span>
                  <span className="text-foreground">{text}</span>
                </li>
              ))}
            </ul>

            {/* "What you get" callout — fills the left column so it doesn't
                look empty next to the three plan cards on the right. Commit 2
                replaces this with the embedded Stripe Payment Element. */}
            <div className="rounded-2xl border border-border/70 bg-card/50 p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                What you get on every plan
              </p>
              <ul className="mt-4 space-y-2.5 text-sm">
                {[
                  "CRM with contacts, deals, pipelines, activities",
                  "Booking page that syncs to Google Calendar",
                  "Intake forms with branded confirmation pages",
                  "AI chatbot grounded in your client's own data",
                  "Client portal at their own subdomain",
                  "Real-time agent metrics + replay",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="text-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-sm text-muted-foreground">
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
          </div>

          {/* =============== RIGHT COLUMN: plans + features + FAQ =============== */}
          <div className="space-y-10">
            {/* Cadence toggle. Yearly SKU isn't wired yet — Monthly is the
                active selection and the Yearly chip is presentational. When
                we ship yearly SKUs we'll flip this to a real client toggle. */}
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight">Choose a plan</h2>
              <div
                role="tablist"
                aria-label="Billing cadence"
                className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 p-1"
              >
                <span
                  role="tab"
                  aria-selected="true"
                  className="rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background"
                >
                  Monthly
                </span>
                <span
                  role="tab"
                  aria-selected="false"
                  className="cursor-not-allowed rounded-full px-3 py-1 text-xs font-medium text-muted-foreground/80"
                  title="Yearly billing coming soon"
                >
                  Yearly · 20% off
                </span>
              </div>
            </div>

            {/* Plans — three big cards. Vertically stacked at mobile,
                horizontal three-up at desktop. The featured (Growth) card
                gets a primary border so the eye lands there first. */}
            <div className="grid gap-4 sm:grid-cols-3">
              {TIERS.map((tier) => (
                <article
                  key={tier.id}
                  data-featured={tier.featured ? "true" : "false"}
                  className={`relative flex flex-col gap-5 overflow-hidden rounded-2xl border bg-card/60 p-5 transition-all hover:border-border ${
                    tier.featured
                      ? "border-primary/60 shadow-(--shadow-md)"
                      : "border-border/70"
                  }`}
                >
                  {tier.featured ? (
                    <>
                      <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-primary" />
                      <span className="absolute right-4 top-4 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">
                        Recommended
                      </span>
                    </>
                  ) : null}

                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      {tier.name}
                    </h3>
                    <p className="mt-3 flex items-baseline gap-1.5">
                      <span className="text-4xl font-semibold tracking-tight text-foreground">
                        {tier.price}
                      </span>
                      {tier.cadence ? (
                        <span className="text-sm text-muted-foreground">{tier.cadence}</span>
                      ) : null}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">{tier.badgeNote}</p>
                  </div>

                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    {tier.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-primary/80" aria-hidden="true" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto pt-2">
                    {tier.id === "free" && isAuthed ? (
                      <form action={selectFreeTierAction}>
                        <button
                          type="submit"
                          className="crm-button-secondary inline-flex h-10 w-full items-center justify-center px-4 text-sm font-medium"
                        >
                          Continue with Free
                        </button>
                      </form>
                    ) : (
                      <Link
                        href={
                          tier.id === "free"
                            ? "/signup"
                            : isAuthed
                              ? `/settings/billing?plan=${tier.id}`
                              : `/signup?plan=${tier.id}`
                        }
                        className={`${
                          tier.featured ? "crm-button-primary" : "crm-button-secondary"
                        } inline-flex h-10 w-full items-center justify-center px-4 text-sm font-medium`}
                      >
                        {tier.id === "free"
                          ? "Start for $0"
                          : isAuthed
                            ? `Upgrade to ${tier.name}`
                            : `Start ${tier.name}`}
                      </Link>
                    )}
                  </div>
                </article>
              ))}
            </div>

            {/* Billing mechanics box. Keeps the same five points from the
                previous design but presented as a compact info row instead
                of a heavyweight callout. */}
            <div className="rounded-2xl border border-border/70 bg-card/40 p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                How billing works
              </p>
              <ul className="mt-4 grid gap-2.5 text-sm text-muted-foreground sm:grid-cols-2">
                <li>· First workspace is always free. No trial clock.</li>
                <li>· Flat monthly base + metered usage. No per-workspace charge.</li>
                <li>· Free is capped (50 contacts, 100 agent runs/mo).</li>
                <li>· Paid tiers overflow capped quotas into metered usage.</li>
                <li>· BYO Claude / OpenAI key — we don&apos;t mark up inference.</li>
                <li>· Every LLM call is tracked + visible in your admin dashboard.</li>
              </ul>
            </div>

            {/* FAQ accordion. Uses the shared @/components/ui/accordion
                primitive so styling matches the rest of the app. */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Frequently asked
              </p>
              <Accordion className="mt-3" defaultValue={[FAQS[0].q]}>
                {FAQS.map((faq) => (
                  <AccordionItem key={faq.q} value={faq.q}>
                    <AccordionTrigger>{faq.q}</AccordionTrigger>
                    <AccordionContent>
                      <p className="text-sm text-muted-foreground">{faq.a}</p>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </div>
      </section>

      {/* =============== STICKY BOTTOM CTA BAR =============== */}
      {/* Pulled out of the section grid so it spans the full viewport width.
          For unauthed visitors → "Start free" CTA. For authed users on
          /pricing (typically because plan-gate sent them here) → one-click
          Free path so they don't have to scroll back up to the Free card. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
        <div className="pointer-events-auto border-t border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-3 sm:flex-row sm:px-6">
            <p className="text-center text-sm text-muted-foreground sm:text-left">
              Your first workspace is{" "}
              <span className="font-medium text-foreground">always free</span> —
              no credit card to start. Cancel anytime from Settings.
            </p>
            {isAuthed ? (
              <form action={selectFreeTierAction}>
                <button
                  type="submit"
                  className="crm-button-primary inline-flex h-10 items-center justify-center px-5 text-sm font-medium"
                >
                  Continue to dashboard →
                </button>
              </form>
            ) : (
              <Link
                href="/signup"
                className="crm-button-primary inline-flex h-10 items-center justify-center px-5 text-sm font-medium"
              >
                Start free in 60 seconds →
              </Link>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
