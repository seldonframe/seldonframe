// packages/crm/src/app/pricing/page.tsx
//
// 2026-05-17 — Postiz-style declutter pass.
//
// Was: two heavy callout boxes ("What you get on every plan" on left,
//      "How billing works" on right), three info-dense plan cards each
//      stuffed with 6 feature bullets + per-card CTA, plus a sticky
//      bar — 8+ competing surfaces above the fold.
//
// Now: hero + three trust signals on the left (room reserved for the
//      Stripe Payment Element in Commit 2), and on the right a minimal
//      interactive plan picker (3 cards, name + price only) whose
//      "What you get" panel below the cards SWAPS based on the selected
//      tier. The sticky bottom CTA copy + label also update with the
//      selection — single click target, no per-card buttons competing.
//      Hero typography is bigger; eyebrow pill dropped; subhead trimmed
//      to one line.
//
// Surface count went from 8 → 4 above the fold. See pricing-picker.tsx
// for the interactive picker; ./_actions.ts for the Server Action.

import { Check } from "lucide-react";

import { auth } from "@/auth";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PricingPicker } from "./pricing-picker";

const TRUST_SIGNALS = [
  "First workspace always free",
  "No card required to start",
  "Cancel anytime in Settings",
];

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
    a: "No. Signup is free, your first workspace is free forever. You only enter a card when you upgrade to Growth or Scale, and you can cancel anytime from Settings → Billing.",
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

  return (
    <main className="crm-page">
      {/* pb-28 reserves space for the fixed sticky bar so the FAQ never
          hides behind it. */}
      <section className="mx-auto max-w-6xl px-4 pb-28 pt-10 sm:px-6 sm:pt-14">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
          {/* ============= LEFT COLUMN: hero + trust signals ============= */}
          {/* Slim: no callout boxes, no eyebrow pill, single-line subhead.
              Empty space below the trust signals is intentional — Commit 2
              fills it with the embedded Stripe Payment Element. */}
          <div className="space-y-8">
            <header className="space-y-5">
              <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.5rem]">
                Spin up a client&apos;s{" "}
                <span className="text-primary">Business OS</span>{" "}
                <span className="text-muted-foreground">in 60 seconds.</span>
              </h1>
              <p className="text-base text-muted-foreground sm:text-lg">
                Paste a URL. We build the CRM, booking page, intake form, and
                AI chatbot in one pass.
              </p>
            </header>

            <ul className="space-y-2.5">
              {TRUST_SIGNALS.map((text) => (
                <li key={text} className="flex items-center gap-2.5 text-sm">
                  <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="text-foreground">{text}</span>
                </li>
              ))}
            </ul>

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

          {/* ============= RIGHT COLUMN: interactive picker + FAQ ============= */}
          <div className="space-y-10">
            <PricingPicker isAuthed={isAuthed} />

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
      {/* Sticky bottom CTA lives inside <PricingPicker> so it can react
          to the selected tier. Rendered via position: fixed which escapes
          the section grid and spans full viewport width. */}
    </main>
  );
}
