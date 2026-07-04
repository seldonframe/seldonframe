// packages/crm/src/app/pricing/page.tsx
//
// 2026-05-17 — Thin Server Component shell. Does two things:
//
//   1. Reads the auth session (Server-only API).
//   2. Renders <PricingShell> (full interactive 2-column layout owns
//      hero + trust signals + single plan card + sticky CTA) and the
//      static FAQ accordion below it.
//
// 2026-07-04 /pricing truth pass (Task 11): the platform sells exactly
// ONE plan — $29/mo flat, unlimited workspaces, 14-day free trial. The
// old Builder $19 / Workspace $49 / Agency $297 ladder in pricing-shell
// is gone. There is no free tier, so the page still doesn't provision a
// Stripe SetupIntent for a "save a card on Free" form — checkout flows
// through Stripe-hosted Checkout from the shell.
//
// 2026-07-04 Task 11b: the FAQS array below has been rewritten to match
// the single-plan reality (it used to describe the old Builder/Workspace/
// Agency ladder). Every FAQ claim here is a strict subset of what
// pricing-shell.tsx's card + sticky bar already state, or is backed by
// /api/stripe/checkout (trial_period_days: 14) or the Settings → Billing
// "Manage subscription" button (Stripe's standard billing portal).
//
// All interactive UI lives in pricing-shell.tsx.

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { auth } from "@/auth";
import { PricingShell } from "./pricing-shell";

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "How many client workspaces can I run?",
    a: "As many as you want. SeldonFrame is one flat $29/mo plan with unlimited workspaces — no per-workspace charge, no tier to upgrade into for more.",
  },
  {
    q: "Can I white-label SeldonFrame for my clients?",
    a: "Yes. Whitelabel and resell each workspace to clients is included in the plan.",
  },
  {
    q: "How does the 14-day trial work?",
    a: "Start your trial from this page — you'll check out through Stripe, but you won't be charged until the trial ends 14 days later. After that it's $29/mo flat. Cancel anytime from Settings → Billing before or after the trial and you won't be billed again.",
  },
  {
    q: "What about self-hosting?",
    a: "Fully supported. The full source is AGPL-licensed on GitHub — self-host and own + export everything with no per-workspace charge.",
  },
];

type PricingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const session = await auth();
  if (searchParams) await searchParams; // keep Next.js happy if callers pass params

  const isAuthed = Boolean(session?.user);

  return (
    <main className="crm-page">
      {/* pb-28 reserves room for the sticky CTA so the last FAQ row
          never hides behind it. */}
      <section className="mx-auto max-w-6xl px-4 pb-28 pt-10 sm:px-6 sm:pt-14">
        <PricingShell isAuthed={isAuthed} />

        <div className="mt-16">
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
      </section>
    </main>
  );
}
