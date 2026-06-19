// packages/crm/src/app/pricing/page.tsx
//
// 2026-05-17 — Thin Server Component shell. Does two things:
//
//   1. Reads the auth session (Server-only API).
//   2. Renders <PricingShell> (full interactive 2-column layout owns
//      hero + trust signals + picker + sticky CTA) and the static FAQ
//      accordion below it.
//
// 2026-06-18 pricing migration (Phase 3): the ladder is Builder $19 /
// Workspace $49 / Agency $297 — all paid. There is no free tier, so the
// page no longer provisions a Stripe SetupIntent for a "save a card on
// Free" form; every tier flows through Stripe-hosted Checkout from the
// shell.
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
    a: "Builder is landing pages only (up to 10, no full workspace). Workspace includes one full workspace. Agency includes 10 client workspaces, then $10/mo for each one beyond that. Features like custom domains, white-label, and AI agents stack on top per tier.",
  },
  {
    q: "Can I white-label SeldonFrame for my clients?",
    a: "Yes, on Agency. Agency white-labels the entire platform under your brand — every surface your client sees carries your agency's identity, and you resell at your own markup.",
  },
  {
    q: "Do I need a credit card to get started?",
    a: "Yes — every plan is paid and you check out securely on Stripe. There's no free tier. Pick Builder, Workspace, or Agency and you're billed one flat monthly price. Cancel anytime from Settings → Billing.",
  },
  {
    q: "Whose Claude / OpenAI key gets used?",
    a: "On paid plans, AI generation is managed for you. If you self-host, you bring your own key — every LLM call is billed against your own account, and you see every invocation in the admin dashboard.",
  },
  {
    q: "What about self-hosting?",
    a: "Fully supported. The full source is MIT-licensed on GitHub. Self-host runs everything with no per-workspace charge — you only pay your own infra and your own LLM bill.",
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
