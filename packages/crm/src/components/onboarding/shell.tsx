// packages/crm/src/components/onboarding/shell.tsx
//
// 2026-05-27 — Unified onboarding shell — header strip rendered above
// the content of each of the three onboarding step pages. The shell is
// a thin presentational wrapper, NOT a layout — each step page still
// composes its own page chrome (auth layout for step 1, dashboard
// layout for steps 2-3). The shell just renders the progress bar +
// step counter at the top so the operator sees momentum.
//
// Design borrows from Calendly's onboarding pattern: the moment a user
// lands on step 1, the progress bar shows ~33% filled — the "endowed
// progress effect". They get credit for signing up. The bar fills
// smoothly on each step transition (~400ms CSS width animation) so the
// progression feels earned rather than discrete.
//
// Why a single component shared by all three pages (vs a layout):
//   - Layouts in Next.js wrap a route subtree. Our three pages live in
//     two different layouts (/signup/connect-ai is auth-layout;
//     /clients/new + /clients/[slug]/ready are dashboard-layout). A
//     shared layout segment isn't an option without restructuring the
//     route tree, which would conflict with the existing dashboard
//     sidebar.
//   - A component lets each page conditionally render the shell only
//     when the user is mid-onboarding. Already-onboarded users see
//     their normal pages without a stray header.
//
// Server component — no client state, no event handlers. The progress
// fill is pure CSS (Tailwind width class + transition). If the parent
// page wants to render a celebration pulse after a successful step,
// that's the parent's job — the shell stays static so it can be
// rendered from a server component without a "use client" boundary.

import Link from "next/link";

import type { OnboardingStep } from "@/lib/onboarding/state";

export type OnboardingShellProps = {
  /** The step the user is currently ON (NOT the step they're heading
   *  toward). Drives both the "Step N of 3" text and the progress fill
   *  percentage. */
  step: OnboardingStep;
  /** Short title shown next to the step counter. Mirrors what the
   *  page itself says is happening — "Connect AI", "Build your first
   *  workspace", "Make it yours". The shell is just the chrome; the
   *  page body has the longer headline + form. */
  title: string;
  /** When false, the brand mark is omitted (the host layout already
   *  renders one). Defaults to true. Step 1 of the arc lives inside
   *  the auth layout which already shows a centered wordmark above the
   *  card; rendering a second mark in the shell on that surface would
   *  look redundant. Steps 2 and 3 live in the dashboard layout where
   *  the brand-mark space is part of the sidebar, so the shell adds
   *  its own to keep the strip visually anchored. */
  showLogo?: boolean;
};

// Percentage fill for each step. Step 1 starts at 33% (endowed progress —
// they signed up, they get credit for one third). Step 2 is 67%
// (build is the magic-moment step, halfway through visually). Step 3
// is 100% — they're on the final action; we want it to feel completable.
//
// Why not 0/50/100? A 0% bar on step 1 reads "haven't started yet" and
// kills momentum. Calendly's research showed visible initial progress
// drove the largest conversion lift in their onboarding flow.
const STEP_FILL_PERCENT: Record<OnboardingStep, number> = {
  1: 33,
  2: 67,
  3: 100,
};

export function OnboardingShell({ step, title, showLogo = true }: OnboardingShellProps) {
  const fillPercent = STEP_FILL_PERCENT[step];

  return (
    <div
      className="w-full border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      role="banner"
      aria-label="Onboarding progress"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
        {/* Left: logo + wordmark. Reuses the same mark the marketing
            site nav renders so the onboarding shell visually ties back
            to the brand surface the operator just came from. Kept link
            rather than plain svg so a confused operator can click out to
            the homepage at any point (the shell doesn't trap them). */}
        {showLogo ? (
          <Link
            href="/"
            aria-label="SeldonFrame — home"
            className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold leading-none tracking-tight text-foreground"
          >
            <svg width="18" height="18" viewBox="0 0 100 100" fill="none" aria-hidden>
              <line x1="22" y1="22" x2="58" y2="22" stroke="#14b8a6" strokeWidth="3" strokeLinecap="round" />
              <line x1="78" y1="42" x2="78" y2="78" stroke="#14b8a6" strokeWidth="3" strokeLinecap="round" />
              <line x1="78" y1="78" x2="22" y2="78" stroke="#14b8a6" strokeWidth="3" strokeLinecap="round" />
              <line x1="22" y1="78" x2="22" y2="22" stroke="#14b8a6" strokeWidth="3" strokeLinecap="round" />
              <circle cx="22" cy="22" r="6" fill="#14b8a6" />
              <circle cx="78" cy="22" r="6" fill="none" stroke="#14b8a6" strokeWidth="3" />
              <circle cx="78" cy="78" r="6" fill="#14b8a6" />
              <circle cx="22" cy="78" r="6" fill="#14b8a6" />
            </svg>
            <span className="hidden sm:inline">
              Seldon<span className="font-medium text-muted-foreground">Frame</span>
            </span>
          </Link>
        ) : null}

        {/* Middle: progress bar. The fill width is keyed off the step
            number; the transition makes the jump between step pages
            feel like the operator earned the new percentage rather than
            it appearing fully formed. ~400ms is long enough to register
            but short enough not to slow page navigation. */}
        <div className="flex flex-1 items-center gap-3">
          <div
            className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={fillPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Onboarding progress: ${fillPercent}%`}
          >
            <div
              className="h-full rounded-full bg-[#14b8a6] transition-[width] duration-[400ms] ease-out"
              style={{ width: `${fillPercent}%` }}
            />
          </div>
          <span className="shrink-0 whitespace-nowrap text-xs font-medium text-muted-foreground sm:text-[13px]">
            <span className="text-foreground">Step {step} of 3</span>
            <span className="mx-1.5 text-muted-foreground/60">·</span>
            <span>{title}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
