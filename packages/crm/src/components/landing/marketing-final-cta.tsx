// packages/crm/src/components/landing/marketing-final-cta.tsx
//
// Redesign 2026-06-18 — warm light aesthetic.
// Final CTA: deep green (--lp-cta-slab) slab, matching seldonstudio.com's
// .final section. Paper-colored CTA button, dual audience paths.
//
// Token migration + `variant` prop (Task 8, 2026-07-13): this section
// renders on both the build-mode page (light) and the record-mode page
// (dark) — colors go token-native so both render correctly. `variant`
// defaults to "build" and its output stays byte-identical to before;
// "record" swaps the headline + primary CTA to the record-mode framing
// (same button classes, different copy/href).
//
// Vision-gate fix (2026-07-13): the slab itself (section bg + its text)
// uses --lp-cta-slab/--lp-cta-slab-ink, NOT --lp-cta-bg/--lp-cta-ink.
// --lp-cta-bg/ink is an INVERTING pair meant for buttons that sit on the
// page background (light button on a dark page, dark button on a light
// page) — nav/footer/hero "Build it free" pills use it correctly. This
// slab is deep-green in both modes (its sage-green eyebrow rule and
// parchment text assume that), so it needs the theme-invariant pair
// instead. The primary CTA button inside the slab is the inverse of the
// slab pair (parchment bg / deep-green text in both modes).

import Link from "next/link";

export function MarketingFinalCta({
  variant = "build",
}: {
  variant?: "build" | "record";
} = {}) {
  return (
    <section
      id="get-started"
      aria-label="Get started"
      className="border-t border-[var(--lp-border-soft)] bg-[var(--lp-cta-slab)] px-5 py-24 text-center md:px-8 md:py-36 lg:px-12"
    >
      <div className="mx-auto max-w-[880px]">
        <div className="inline-flex items-center justify-center gap-2.5 text-[12px] font-[600] uppercase tracking-[0.09em] text-[rgba(111,194,143,.8)]">
          <span className="h-px w-4 bg-[rgba(111,194,143,.5)]" aria-hidden />
          Last thing
          <span className="h-px w-4 bg-[rgba(111,194,143,.5)]" aria-hidden />
        </div>

        {variant === "record" ? (
          <h2 className="mx-auto mt-4 max-w-[18ch] text-[clamp(30px,5.2vw,54px)] font-[500] leading-[1.05] tracking-[-0.03em] text-[var(--lp-cta-slab-ink)]">
            Show Seldon how you work.
          </h2>
        ) : (
          <h2 className="mx-auto mt-4 max-w-[18ch] text-[clamp(30px,5.2vw,54px)] font-[500] leading-[1.05] tracking-[-0.03em] text-[var(--lp-cta-slab-ink)]">
            Your front office is{" "}
            <em className="font-[Newsreader,Georgia,serif] font-normal not-italic text-[color-mix(in_oklab,var(--lp-cta-slab-ink)_75%,transparent)]">
              3 minutes away.
            </em>
          </h2>
        )}

        <p className="mx-auto mt-5 max-w-[50ch] text-[16.5px] leading-[1.55] text-[color-mix(in_oklab,var(--lp-cta-slab-ink)_74%,transparent)]">
          Paste a URL or describe your business. We build the website, booking,
          AI receptionist, intake, and CRM — all wired together and live in 3 minutes.
          For your business, or your clients&rsquo;.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
          {variant === "record" ? (
            <a
              href="#record-top"
              className="inline-flex items-center gap-2.5 rounded-full bg-[var(--lp-cta-slab-ink)] px-7 py-4 text-[15px] font-[500] text-[var(--lp-cta-slab)] shadow-[0_1px_2px_rgba(0,0,0,.2),0_12px_30px_rgba(0,0,0,.25),inset_0_1.5px_0_rgba(255,255,255,.6)] transition-all hover:-translate-y-[1.5px] active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-accent)]"
            >
              <span className="size-[7px] rounded-full bg-[var(--lp-accent)]" aria-hidden />
              Record your first run →
            </a>
          ) : (
            <Link
              href="/signup"
              className="inline-flex items-center gap-2.5 rounded-full bg-[var(--lp-cta-slab-ink)] px-7 py-4 text-[15px] font-[500] text-[var(--lp-cta-slab)] shadow-[0_1px_2px_rgba(0,0,0,.2),0_12px_30px_rgba(0,0,0,.25),inset_0_1.5px_0_rgba(255,255,255,.6)] transition-all hover:-translate-y-[1.5px] active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-accent)]"
            >
              <span className="size-[7px] rounded-full bg-[var(--lp-accent)]" aria-hidden />
              Build it free →
            </Link>
          )}
          <Link
            href="/agencies"
            className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,255,255,.16)] bg-transparent px-6 py-4 text-[15px] font-[500] text-[color-mix(in_oklab,var(--lp-cta-slab-ink)_88%,transparent)] transition-all hover:bg-[rgba(255,255,255,.08)] active:translate-y-px"
          >
            For agencies →
          </Link>
        </div>

        <p className="mt-6 font-sans text-[13px] text-[color-mix(in_oklab,var(--lp-cta-slab-ink)_45%,transparent)]">
          Build it free · $29/mo · unlimited workspaces · cancel anytime · your data exports as JSON
        </p>
      </div>
    </section>
  );
}
