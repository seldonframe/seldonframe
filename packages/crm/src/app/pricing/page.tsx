// packages/crm/src/app/pricing/page.tsx
//
// 2026-05-17 — Thin Server Component shell. Does three things:
//
//   1. Reads the auth session (Server-only API).
//   2. Provisions a Stripe SetupIntent for the embedded card-on-file
//      form when the operator is authed AND publishable + secret keys
//      are configured. Silent fallback to no-card 1-click Free when
//      either is missing — see lib/billing/setup-intent.ts for the
//      contract.
//   3. Renders <PricingShell> (full interactive 2-column layout owns
//      hero + trust signals + picker + embedded payment + sticky CTA)
//      and the static FAQ accordion below it.
//
// All interactive UI now lives in pricing-shell.tsx. This file is
// intentionally tiny so future redesigns only touch the shell and the
// Server Action layer in _actions.ts.

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { auth } from "@/auth";
import { provisionSetupIntent } from "@/lib/billing/setup-intent";
import { PricingShell } from "./pricing-shell";

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "How many client workspaces can I run?",
    a: "One on Free, three on Growth, unlimited on Scale. Workspaces are the only thing tiers gate on count — features like custom domains, white-label, and AI agents stack on top per tier.",
  },
  {
    q: "Can I white-label SeldonFrame for my clients?",
    a: "Yes, from Growth up. Growth removes SeldonFrame branding from your client portal; Scale adds custom branding (your agency logo + colors) across every surface your client sees.",
  },
  {
    q: "Do I need a credit card to get started?",
    a: "No — you can start free with no card. If you'd like one-click upgrades later, you can save a card on file at signup (never charged on Free). Cancel anytime from Settings → Billing.",
  },
  {
    q: "Whose Claude / OpenAI key gets used?",
    a: "Yours. SeldonFrame doesn't mark up inference. You bring your own key once, we encrypt it, and every LLM call is billed against your account. You see every invocation in the admin dashboard.",
  },
  {
    q: "What about self-hosting?",
    a: "Fully supported. The full source is MIT-licensed on GitHub. Self-host runs everything you see on Scale with no per-workspace charge — you only pay your own infra and your own LLM bill.",
  },
];

type PricingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const session = await auth();
  if (searchParams) await searchParams; // keep Next.js happy if callers pass params

  const isAuthed = Boolean(session?.user);

  // Provision SetupIntent ONCE per page load when authed. Silent
  // fallback on `not_configured` (missing publishable key in env).
  let stripeBundle: { publishableKey: string; clientSecret: string } | null = null;
  if (isAuthed && session?.user?.id) {
    const result = await provisionSetupIntent(session.user.id);
    if (result.ok) {
      stripeBundle = {
        publishableKey: result.data.publishableKey,
        clientSecret: result.data.clientSecret,
      };
    } else if (result.reason === "stripe_error") {
      console.warn(
        JSON.stringify({
          event: "pricing_setup_intent_provision_failed",
          user_id: session.user.id,
          detail: result.detail ?? null,
        }),
      );
    }
  }

  return (
    <main className="crm-page">
      {/* pb-28 reserves room for the sticky CTA so the last FAQ row
          never hides behind it. */}
      <section className="mx-auto max-w-6xl px-4 pb-28 pt-10 sm:px-6 sm:pt-14">
        <PricingShell isAuthed={isAuthed} stripe={stripeBundle} />

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
