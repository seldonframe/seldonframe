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
// ONE plan — $29/mo flat, unlimited workspaces, cancel anytime. The
// old Builder $19 / Workspace $49 / Agency $297 ladder in pricing-shell
// is gone. There is no free tier, so the page still doesn't provision a
// Stripe SetupIntent for a "save a card on Free" form — checkout flows
// through Stripe-hosted Checkout from the shell.
//
// 2026-07-04 Task 11b: the FAQS array below has been rewritten to match
// the single-plan reality (it used to describe the old Builder/Workspace/
// Agency ladder). Every FAQ claim here is a strict subset of what
// pricing-shell.tsx's card + sticky bar already state, or is backed by
// /api/stripe/checkout or the Settings → Billing "Manage subscription"
// button (Stripe's standard billing portal).
//
// 2026-07-05 — trial removed (founder decision): the free ungated
// build→claim→use experience already IS the trial, so checkout charges
// immediately. No money-back guarantee; "cancel anytime" is the only
// safety line (a standard Stripe subscription, cancelable from the
// billing portal).
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

/** SF_TIER_LADDER (2026-07-08) — same strict-"1" contract as the other
 *  dark-by-default flags in lib/web-build/policy.ts (isWinLadderOn,
 *  isSimpleHomeOn). Read server-side here rather than adding a new
 *  export to policy.ts (kept out of this task's touched-files list). */
function isTierLadderOn(env: { SF_TIER_LADDER?: string | undefined }): boolean {
  return env.SF_TIER_LADDER?.trim() === "1";
}

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "How many client workspaces can I run?",
    a: "As many of your own as you want, on the flat $29/mo Builder plan — no per-workspace charge. Running CLIENT sub-accounts under your own brand is the agency ladder, starting at $99/mo (Agency Starter includes 10 sub-accounts).",
  },
  {
    q: "Can I white-label SeldonFrame for my clients?",
    a: "Yes — whitelabel and resell to clients is included on every agency plan (Agency Starter $99/mo and up). The flat $29/mo Builder plan is for your own workspaces, not whitelabel resale.",
  },
  {
    q: "Is there a free trial?",
    a: "You're charged $29/mo flat when you connect through Stripe from this page — there's no separate trial period. You can cancel anytime from Settings → Billing and you won't be billed again.",
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
  const tierLadderOn = isTierLadderOn({ SF_TIER_LADDER: process.env.SF_TIER_LADDER });

  return (
    <main className="crm-page">
      {/* pb-28 reserves room for the sticky CTA so the last FAQ row
          never hides behind it. */}
      <section className="mx-auto max-w-6xl px-4 pb-28 pt-10 sm:px-6 sm:pt-14">
        <PricingShell isAuthed={isAuthed} tierLadderOn={tierLadderOn} />

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
