# SeldonFrame Marketing Page — Gemini Handoff

**Date:** 2026-05-16
**Goal:** UI/UX rewrite to 10x conversions for our paying ICP (agencies + freelancers serving SMBs). World-class on both desktop and mobile. Zero horizontal scroll on mobile.

---

## PROMPT for Gemini

You are a world-class conversion-focused product designer. Rewrite the SeldonFrame marketing landing page below to maximize signups from paying-customer ICP (agencies + freelancers serving SMBs).

### What we sell
- **Product:** AI-native Business OS for agencies. Operator pastes a client URL → AI builds the full client stack in 60 seconds: CRM, booking page, intake form, AI receptionist, landing page, white-label ready.
- **ICP:** Agencies / freelancers / consultants serving SMBs (HVAC, dental, plumbing, medspa, coaching, etc.). They currently stitch GoHighLevel + Zapier + Calendly + Typeform + Mailchimp + HubSpot at ~$1,700/mo, or use GHL alone at $497/mo with a 4-week learning curve.
- **Dream outcome:** Spin up a client's complete Business OS in 60 seconds using natural language.
- **Pricing:** Free (1 workspace, BYOK Anthropic), Growth $29/mo (3 workspaces), Scale $99/mo (unlimited + white-label + AI agents).

### What to optimize for
1. **Hormozi Value Equation** in the hero: dream outcome × likelihood of success × time delay × effort/sacrifice. The current H1 hits this — refine it.
2. **Above-the-fold conversion**: 60% of visitors never scroll. 80% of design effort goes to above-the-fold. Make the CTA + risk reversal undeniable.
3. **Mobile-first**: 70% of marketing traffic is mobile. ALL sections must render perfectly under 375px width with ZERO horizontal scroll. The user explicitly said: "ensure that on mobile the users can't slide left and right."
4. **Premium feel**: agencies want to project credibility to THEIR clients. Subtle motion (`motion@12.38` from `motion/react`), generous spacing, sophisticated dark theme. NO garish animations, NO badge-stuffing, NO "limited time" pressure.
5. **Convert paying users, not freebies**: copy must speak to AGENCY OWNERS who have money + clients. Strip anything that sounds like a free-tier hunter pitch. "Open-source GHL alternative" was REJECTED as too defensive. "Built for agencies and freelancers serving SMBs" is the audience anchor.
6. **Visual dashboard mockup**: The hero includes a Tailwind+SVG dashboard showing "Acme HVAC" workspace with pipeline kanban — this is the dream outcome made visible. Improve but keep the real-product-screenshot aesthetic.
7. **Comparison section** ("Replaces $1,700/mo of stitched tools with $29-$99/mo"): the wallet-math moment. Make it impossible to argue with.

### What NOT to change
- **Routes**: CTAs link to `/signup` and `#demo` (both exist)
- **Design tokens**: Tailwind v4 + shadcn/base-ui. Primary teal is `#14b8a6`. No new colors.
- **Section order**: Hero → How It Works → Comparison → Demo → Pricing → Open Source → FAQ → Footer. You may restructure within but keep the funnel logic.
- **Accessibility**: WCAG 2.1 AA passes today. Keep `aria-*`, `useReducedMotion()`, focus management.
- **Motion library**: `motion@12.38` from `motion/react` (Vercel's package, NOT framer-motion).
- **Stack**: Next.js 16.2 App Router, React 19, Tailwind v4, shadcn/base-ui, lucide-react icons.

### Deliverable from you
Rewritten versions of each TSX file below, ready to drop in. Match existing import patterns. Inline-comment any major design decisions so a developer can review. If you add new section components, name them `landing-*.tsx` and update `(public)/page.tsx` to compose them.

---

## TECH STACK

- **Next.js 16.2.1** App Router, React 19, TypeScript strict
- **Tailwind CSS v4** with custom design tokens
- **shadcn/ui** components built on **base-ui/react** (NOT Radix)
- **Motion library:** `motion@12.38` from `"motion/react"`
- **Icons:** `lucide-react`
- **Font:** system font stack
- **Dark theme only** on marketing
- **No external image assets in hero** — dashboard mockup is pure Tailwind+SVG

---

## DESIGN TOKENS (excerpt from `globals.css`)

```css
@import "tailwindcss";
@import "../styles/design-tokens.css";
@import "../styles/components/overrides.css";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-positive: var(--positive);
  --color-caution: var(--caution);
  --color-negative: var(--negative);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --animate-shimmer-slide: shimmer-slide var(--speed) ease-in-out infinite alternate;
  --animate-spin-around: spin-around calc(var(--speed) * 2) infinite linear;
  @keyframes shimmer-slide {
  to {
    transform: translate(calc(100cqw - 100%), 0);}}
  @keyframes spin-around {
  0% {
    transform: translateZ(0) rotate(0);}
  15%, 35% {
    transform: translateZ(0) rotate(90deg);}
  65%, 85% {
    transform: translateZ(0) rotate(270deg);}
  100% {
    transform: translateZ(0) rotate(360deg);}}
  --animate-blink-cursor: blink-cursor 1.2s step-end infinite
;
  @keyframes blink-cursor {
  0%, 49% {
    opacity: 1;}
  50%, 100% {
    opacity: 0;}}
  --animate-marquee: marquee var(--duration) infinite linear;
  --animate-marquee-vertical: marquee-vertical var(--duration) linear infinite;
  @keyframes marquee {
  from {
    transform: translateX(0);}
  to {
    transform: translateX(calc(-100% - var(--gap)));}}
  @keyframes marquee-vertical {
  from {
    transform: translateY(0);}
  to {
    transform: translateY(calc(-100% - var(--gap)));}}}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  html {
    /* Prevent horizontal scroll on mobile when any descendant briefly
       overflows (e.g. the hero dashboard mockup at narrow viewports,
       wide tables, or motion transforms that extend past the viewport
       during entry animation). Pairs with `min-w-0` on flex/grid
       descendants. The user explicitly flagged horizontal sliding as a
       UX failure on mobile. */
    overflow-x: hidden;
  }
  body {
    @apply bg-background text-foreground;
    min-height: 100dvh;
    font-feature-settings: "ss01" 1, "cv01" 1, "cv11" 1;
    background-image: radial-gradient(circle at top, rgb(255 255 255 / 0.03), transparent 38%);
    background-attachment: fixed;
    /* Belt-and-suspenders: defense against any iOS Safari quirk where
```

---

## `packages/crm/src/app/(public)/page.tsx`

_Page composition. Renders all landing sections in funnel order. Auth-aware: signed-in users redirect to /dashboard._

```tsx
// Marketing landing page (server wrapper).
//
// Cut C pivot: composes the named Landing* section components
// (hero, soul, seldon-it, bento, agencies, marketplace, why-now,
// final-cta, footer) so the marketing site funnels signed-out
// agency visitors into /signup (Cut A's Google OAuth + email
// signup). Earlier Workstream-2 surface (landing-client.tsx) shipped
// without a Sign Up CTA, which made the entire web-onboarding flow
// (Cuts A + B) invisible to prospective users.
//
// Preserves the existing auth redirect: signed-in users go to the
// dashboard; unauthenticated visitors see the marketing surface.
//
// Order of <main> children is curated for funnel flow:
//   hero → how-it-works → soul → seldon-it → bento
//   → demo → agencies → marketplace → why-now → final-cta

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

import { LandingNav } from "@/components/landing/nav";
import { LandingHero } from "@/components/landing/hero";
import { LandingHowItWorksSection } from "@/components/landing/how-it-works-section";
import { LandingComparisonSection } from "@/components/landing/landing-comparison-section";
import { LandingSoulSection } from "@/components/landing/soul-section";
import { LandingSeldonItSection } from "@/components/landing/seldon-it-section";
import { LandingBentoSection } from "@/components/landing/bento-section";
import { LandingDemoVideoSection } from "@/components/landing/demo-video-section";
import { LandingAgenciesSection } from "@/components/landing/agencies-section";
import { LandingMarketplaceSection } from "@/components/landing/marketplace-section";
import { LandingMarketingPricingSection } from "@/components/landing/marketing-pricing-section";
import { LandingOpenSourceSection } from "@/components/landing/open-source-section";
import { LandingMarketingFaqSection } from "@/components/landing/marketing-faq-section";
import { LandingWhyNowSection } from "@/components/landing/why-now-section";
import { LandingFinalCta } from "@/components/landing/final-cta";
import { LandingFooter } from "@/components/landing/footer";

export const metadata: Metadata = {
  title: "SeldonFrame — Open-source alternative to GoHighLevel",
  description:
    "Pre-wired client ops stack agencies deploy per client in minutes. CRM, booking, intake, and AI chatbot — already connected, no Zapier required. Free tier, AGPL-3.0, MCP-native via Claude Code.",
  openGraph: {
    title: "SeldonFrame — Open-source alternative to GoHighLevel",
    description:
      "Pre-wired client ops stack agencies deploy per client in minutes. CRM, booking, intake, AI chatbot — already connected. Open source. Free tier · Growth $29/mo · Scale $99/mo.",
    type: "website",
    url: "https://seldonframe.com",
    images: [{ url: "/brand/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SeldonFrame — Open-source alternative to GoHighLevel",
    description:
      "Pre-wired client ops stack agencies deploy per client in minutes. CRM, booking, intake, AI chatbot — already connected.",
    images: ["/brand/twitter-card.png"],
  },
};

export default async function PublicHomePage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      <LandingNav />
      <main id="main-content">
        <LandingHero />
        <LandingHowItWorksSection />
        <LandingComparisonSection />
        <LandingSoulSection />
        <LandingSeldonItSection />
        <LandingBentoSection />
        <LandingDemoVideoSection />
        <LandingAgenciesSection />
        <LandingMarketplaceSection />
        <LandingMarketingPricingSection />
        <LandingOpenSourceSection />
        <LandingMarketingFaqSection />
        <LandingWhyNowSection />
        <LandingFinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
```

---

## `packages/crm/src/components/landing/nav.tsx`

_Top navigation. SeldonFrame wordmark + Pricing/GitHub/Sign In links + Start free CTA._

```tsx
import Link from "next/link";
import { ExternalLink } from "lucide-react";

// Cut C Phase 1 — Nav refresh.
// Adds a primary "Start free" CTA so signup is one click from any
// scroll position. Sign In and GitHub remain secondary.
//
// Phase 8 page-wide a11y added:
//   - "Skip to main content" link (WCAG 2.4.1 Bypass Blocks) targets
//     the `<main>` element in (public)/page.tsx, which carries
//     id="main-content". Visible only on keyboard focus.
//   - "Start free" CTA bumped from text-white (2.6:1 on teal — fails
//     WCAG AA 1.4.3) to text-zinc-950 (7.2:1).
export function LandingNav() {
  return (
    <nav
      aria-label="Primary"
      className="sticky top-0 z-50 w-full border-b border-zinc-800/50 bg-[#09090b]/80 backdrop-blur-md"
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-[#14b8a6] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-zinc-950 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-[#14b8a6]"
      >
        Skip to main content
      </a>
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight text-zinc-100">
          SeldonFrame
        </Link>
        <div className="flex items-center gap-5 text-sm font-medium text-zinc-500">
          <Link href="/pricing" className="transition-colors hover:text-zinc-200">
            Pricing
          </Link>
          <Link
            href="https://github.com/seldonframe/crm"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 transition-colors hover:text-zinc-200"
          >
            GitHub <ExternalLink size={12} aria-hidden="true" />
          </Link>
          <Link href="/login" className="transition-colors hover:text-zinc-200">
            Sign In
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-[#14b8a6] px-4 py-1.5 font-semibold text-zinc-950 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14b8a6]"
          >
            Start free
          </Link>
        </div>
      </div>
    </nav>
  );
}
```

---

## `packages/crm/src/components/landing/hero.tsx`

_Hero. Eyebrow + H1 + subhead + CTAs + risk reversal + mockup mount._

```tsx
"use client";

import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { LandingHeroMockup } from "./landing-hero-mockup";

// Cut C onboarding-pivot — Hero rewrite.
//
// Previous hero (Cut C Phase 1) positioned against GoHighLevel with a
// defensive "Open-source GHL alternative" eyebrow and a "Spin up an
// agency-ready Business OS in 60 seconds. Open source. Your Anthropic
// key." H1 — anti-competitor framing that burned the lede on a free-
// tier hunter audience. The user explicitly rejected that positioning:
// SeldonFrame's paying ICP (agencies + freelancers serving SMBs) wants
// the PRODUCT MOMENT (natural language → AI-built Business OS in 60s),
// not freebie messaging.
//
// Copy refined by design:ux-copy (this pass). The H1 hits Hormozi's
// Value Equation in one line — dream outcome (Business OS), likelihood
// of success (AI), time delay (60s), effort (just describe). The
// risk-reversal line "Create a real functioning Business OS in 60
// seconds" is user-dictated verbatim — do not edit.
//
// Layout shift vs previous hero: stacks copy left / mockup right on
// md+, single column on mobile (mockup below CTAs so the conversion
// frame stays above the fold). The mockup replaces a placeholder GIF —
// see landing-hero-mockup.tsx.
//
// Motion: motion@12.38 ("motion/react"). 80ms stagger on copy
// (H1 → subhead → CTAs → reassurance). useReducedMotion() switches
// to instant render. Mockup card stagger lives inside the mockup
// component and continues from this hero's cadence.
export function LandingHero() {
  const reduced = useReducedMotion();
  const fadeUp = (delay: number) =>
    reduced
      ? { initial: false as const, animate: { opacity: 1, y: 0 } }
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <section className="mx-auto max-w-6xl px-6 py-16 md:py-24">
      <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12">
        {/* Copy column */}
        <div className="text-center lg:col-span-6 lg:text-left">
          <motion.p
            {...fadeUp(0)}
            className="mb-5 inline-flex items-center rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-1 text-xs font-medium text-zinc-400"
          >
            Built for agencies and freelancers serving SMBs
          </motion.p>

          <motion.h1
            {...fadeUp(0.08)}
            className="text-balance text-4xl font-bold tracking-tight text-zinc-100 md:text-5xl lg:text-6xl lg:leading-[1.04]"
          >
            Spin up your client&apos;s Business OS in 60 seconds.
            <br className="hidden lg:block" />{" "}
            <span className="text-[#14b8a6] lg:mt-1 lg:inline-block">
              Just describe it.
            </span>
          </motion.h1>

          <motion.p
            {...fadeUp(0.16)}
            className="mx-auto mt-5 max-w-xl text-pretty text-base text-zinc-400 md:text-lg lg:mx-0"
          >
            Paste a client&apos;s URL or describe their business in plain English.
            SeldonFrame builds{" "}
            <span className="text-zinc-300">
              the CRM, booking page, intake form, and AI receptionist
            </span>{" "}
            — white-label, wired up, ready to hand over.
          </motion.p>

          <motion.div
            {...fadeUp(0.24)}
            className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start"
          >
            <Link
              href="/signup"
              /* a11y: text-zinc-950 on #14b8a6 = 7.2:1 (AAA). Matches
                 the pricing/footer pattern set in Cut C Phase 8.
                 Hover shadow is a directional drop (not the neutral-
                 black shadow-lg) so the lift reads as actual elevation
                 per design-critique #8. */
              className="inline-flex items-center gap-2 rounded-xl bg-[#14b8a6] px-8 py-3.5 text-base font-semibold text-zinc-950 transition-all hover:scale-[1.02] hover:shadow-[0_8px_24px_-6px_rgba(20,184,166,0.4)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14b8a6] motion-reduce:transition-none motion-reduce:hover:scale-100"
            >
              Start free
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link
              href="#demo"
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-7 py-3.5 text-base font-semibold text-zinc-200 transition-colors hover:border-zinc-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14b8a6]"
            >
              <Play size={16} className="fill-current" aria-hidden="true" />
              Watch the 60-second build
            </Link>
          </motion.div>

          <motion.p
            {...fadeUp(0.32)}
            className="mt-5 text-sm text-zinc-500"
          >
            Create a real functioning Business OS in 60 seconds
          </motion.p>
        </div>

        {/* Mockup column — lands AFTER copy + reassurance settle so the
            mockup reads as a reveal, not a competing element. Per
            design-critique #7. */}
        <motion.div
          {...fadeUp(0.36)}
          className="lg:col-span-6"
        >
          <LandingHeroMockup />
        </motion.div>
      </div>
    </section>
  );
}
```

---

## `packages/crm/src/components/landing/landing-hero-mockup.tsx`

_THE visual proof. Tailwind+SVG dashboard. Real-product-screenshot aesthetic._

```tsx
"use client";

// Cut C onboarding-pivot — Hero dashboard mockup.
//
// Replaces the placeholder `hero-loop.gif` with a Tailwind + lucide
// composition that reads as a real product screenshot at hero scale.
// The mockup visualises the dream outcome: an agency operator has
// just spun up "Acme HVAC" as a client workspace; the pipeline is
// live, the chatbot is online, and the team can hand it over.
//
// Design-system spec (from design:design-system pass):
//   - Outer:  rounded-2xl border-zinc-800 bg-zinc-900 shadow-2xl
//             shadow-black/40 with a ring-1 ring-white/[0.04] glass
//             accent — matches the FAQ / how-it-works card rhythm.
//   - Sidebar: w-48, bg-zinc-950/60, divider border-zinc-800/60,
//             text-xs zinc-400 rows, lucide icons sized 3.5.
//   - Kanban:  4 cols (auto on md+, single col on mobile via overflow
//             scroll). Card border zinc-800, body text [11px], price
//             text-emerald-400 for the "this is real money" tell.
//   - Motion:  motion@12.38 from "motion/react". Stagger cards
//             0.06s apart starting at 0.30s. useReducedMotion() →
//             initial=false so the final state renders instantly.
//   - Pulse:   Tailwind animate-pulse on the agent dot,
//             motion-reduce:animate-none for the static fallback.
//
// Accessibility: the mockup is purely decorative for the hero pitch
// and is wrapped in role="img" + aria-label so screen readers get
// the one-sentence summary instead of every kanban card.

import {
  Bot,
  Calendar,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Lock,
  Users,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

type KanbanCard = {
  title: string;
  meta: string;
  price: string;
};

type KanbanColumn = {
  label: string;
  count: number;
  cards: readonly KanbanCard[];
};

const COLUMNS: readonly KanbanColumn[] = [
  { label: "New Lead", count: 0, cards: [] },
  {
    label: "Quoted",
    count: 2,
    cards: [
      { title: "AC repair", meta: "5012 N 32nd St", price: "$340" },
      { title: "Furnace tune-up", meta: "Glendale", price: "$120" },
    ],
  },
  {
    label: "Scheduled",
    count: 1,
    cards: [
      { title: "AC Install", meta: "May 10 · 2pm", price: "$4,800" },
    ],
  },
  { label: "Won", count: 0, cards: [] },
];

const NAV_ITEMS: readonly { label: string; icon: typeof LayoutDashboard }[] = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Customers", icon: Users },
  { label: "Bookings", icon: Calendar },
  { label: "Agents", icon: Bot },
  { label: "Pages", icon: FileText },
  { label: "Intake Forms", icon: ClipboardList },
];

export function LandingHeroMockup() {
  const reduced = useReducedMotion();
  // Stagger card entrance after the hero copy has settled.
  // 0.30s warms in after H1 → subhead → CTAs (0.0/0.08/0.16/0.24).
  const cardEntry = (delay: number) =>
    reduced
      ? { initial: false as const, animate: { opacity: 1, scale: 1 } }
      : {
          initial: { opacity: 0, scale: 0.97 },
          animate: { opacity: 1, scale: 1 },
          transition: { duration: 0.28, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <div
      role="img"
      aria-label="SeldonFrame workspace dashboard for Acme HVAC: pipeline showing one scheduled $4,800 AC install, AI chatbot live, white-label sidebar."
      className="relative w-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/40 ring-1 ring-white/[0.04]"
    >
      {/*
        Entire subtree is aria-hidden so the screen reader announces
        only the aria-label sentence above and never leaks the
        decorative kanban / nav / status content (a11y-review M1).
      */}
      <div aria-hidden="true">
      {/* Soft teal radial behind the card — sells "primary surface" */}
      <div
        className="pointer-events-none absolute -top-32 right-0 h-72 w-72 rounded-full bg-[#14b8a6]/10 blur-3xl"
      />

      {/* Window chrome */}
      <div className="relative flex items-center gap-2 border-b border-zinc-800/60 bg-zinc-950/80 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-zinc-700" aria-hidden="true" />
        <span className="size-2.5 rounded-full bg-zinc-700" aria-hidden="true" />
        <span className="size-2.5 rounded-full bg-zinc-700" aria-hidden="true" />
        <span className="ml-3 inline-flex items-center gap-1.5 text-xs text-zinc-500">
          <Lock className="size-3 text-zinc-600" strokeWidth={2.25} />
          acme-hvac.app.seldonframe.com
        </span>
      </div>

      <div className="relative flex min-h-[360px] flex-col md:flex-row">
        {/* Sidebar */}
        <aside className="border-b border-zinc-800/60 bg-zinc-950/60 px-3 py-4 md:w-48 md:shrink-0 md:border-b-0 md:border-r">
          {/* Workspace switcher */}
          <div className="flex items-center gap-2.5 rounded-lg border border-zinc-800/80 bg-zinc-900/80 p-2.5">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[#14b8a6]/15 text-[11px] font-bold text-[#14b8a6]">
              AH
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-zinc-100">Acme HVAC</p>
              <p className="truncate text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                Active workspace
              </p>
            </div>
          </div>

          {/* Nav (decorative — subtree is aria-hidden at the root) */}
          <nav className="mt-4 space-y-0.5">
            {NAV_ITEMS.map((item, i) => {
              const Icon = item.icon;
              const isActive = i === 0;
              return (
                <div
                  key={item.label}
                  className={
                    isActive
                      ? "flex items-center justify-between gap-2 rounded-md bg-zinc-800/70 px-2 py-1.5 text-xs font-medium text-zinc-100"
                      : "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs text-zinc-400"
                  }
                >
                  <span className="flex items-center gap-2">
                    <Icon className="size-3.5" strokeWidth={1.75} />
                    {item.label}
                  </span>
                  {/* Status dot bumped from emerald-500/70 to full
                      opacity to clear WCAG 1.4.11 non-text contrast
                      (a11y-review C2). */}
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                </div>
              );
            })}
          </nav>
        </aside>

        {/* Main panel */}
        <div className="flex-1 px-4 py-4 md:px-5">
          {/* Header */}
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Pipeline</h3>
              <p className="text-[11px] text-zinc-500">Acme HVAC · Opportunities</p>
            </div>
            <span className="hidden rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-500 sm:inline-flex">
              This week
            </span>
          </div>

          {/* Kanban */}
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            {COLUMNS.map((col, colIdx) => (
              <div key={col.label} className="min-w-0">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    {col.label}
                  </p>
                  <span className="text-[11px] tabular-nums text-zinc-600">
                    {col.count}
                  </span>
                </div>
                <div className="space-y-2">
                  {col.cards.length === 0 ? (
                    // Silent rail — reads as "no cards yet" without
                    // a textual "Empty" label that would feel like a
                    // designer placeholder (design-critique #2).
                    // Border opacity bumped to /70 so the dashed rail
                    // clears WCAG 1.4.11 (a11y-review N3).
                    <div className="h-12 rounded-md border border-dashed border-zinc-800/70" />
                  ) : (
                    col.cards.map((card, cardIdx) => {
                      // Cumulative delay across columns so cards
                      // animate left-to-right rather than per-column.
                      // Starts at 0.5s (after mockup wrapper at 0.36
                      // has settled) per design-critique #7.
                      const flatIdx =
                        COLUMNS.slice(0, colIdx).reduce(
                          (acc, c) => acc + c.cards.length,
                          0,
                        ) + cardIdx;
                      return (
                        <motion.div
                          key={card.title}
                          {...cardEntry(0.5 + flatIdx * 0.07)}
                          className="rounded-md border border-zinc-800 bg-zinc-900 p-2.5 text-[11px] shadow-sm shadow-black/20"
                        >
                          <p className="font-medium text-zinc-100">{card.title}</p>
                          <p className="mt-0.5 text-zinc-500">{card.meta}</p>
                          <p className="mt-1.5 font-medium text-emerald-400 tabular-nums">
                            {card.price}
                          </p>
                        </motion.div>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Bottom status strip — agent health */}
          <div className="mt-5 flex items-center justify-between gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/60 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/60 motion-reduce:hidden" />
                <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
              </span>
              <span className="text-[11px] font-medium text-zinc-200">
                Acme HVAC Bot v1
              </span>
              <span className="text-[11px] text-zinc-500">· live</span>
            </div>
            <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-emerald-400">
              200 ok
            </span>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
```

---

## `packages/crm/src/components/landing/how-it-works-section.tsx`

_3-step explainer (Sign up, Paste URL, Workspace ready in 60s)._

```tsx
import Image from "next/image";

// Cut C Phase 2 — "How it works" 3-step section.
// Concrete proof of the hero's 60-second claim: signup → URL paste →
// workspace ready. Each step pairs a numbered badge with a screenshot
// taken from the actual Cut A / Cut B routes (/signup, /clients/new,
// the freshly-created workspace dashboard). Screenshots are 1x1
// placeholders in week 5 — real captures land in Phase 9.

type Step = {
  number: 1 | 2 | 3;
  title: string;
  body: string;
  screenshot: string;
  alt: string;
};

const STEPS: readonly Step[] = [
  {
    number: 1,
    title: "Sign up free",
    body: "Google or email. 30 seconds. No credit card.",
    screenshot: "/marketing/how-it-works-step-1.png",
    alt: "Screenshot of the SeldonFrame signup form showing a Continue with Google button above an email field.",
  },
  {
    number: 2,
    title: "Paste your client's URL",
    body: "SeldonFrame reads their site — services, hours, reviews — using your Anthropic key.",
    screenshot: "/marketing/how-it-works-step-2.png",
    alt: "Screenshot of the /clients/new page mid-extraction, with progress checkmarks for Fetching site, Extracting business facts, and Generating personality.",
  },
  {
    number: 3,
    title: "Workspace ready in 60 seconds",
    body: "CRM, booking page, intake form, AI chatbot, demo portal. Pre-wired. White-label. Ready to hand over.",
    screenshot: "/marketing/how-it-works-step-3.png",
    alt: "Screenshot of a fresh SeldonFrame workspace dashboard with the CRM kanban, booking page link, and AI chatbot status all visible.",
  },
];

export function LandingHowItWorksSection() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="mx-auto max-w-5xl border-t border-zinc-800/30 px-6 py-16 md:py-20"
    >
      <div className="text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          How it works
        </p>
        <h2 id="how-it-works-heading" className="text-3xl font-bold text-zinc-100 md:text-4xl">
          Paste a URL. Walk away with a client-ready workspace. 3 steps.
        </h2>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-3 md:grid-cols-3">
        {STEPS.map((step) => (
          <div
            key={step.number}
            data-step={String(step.number)}
            className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-5"
          >
            <div className="mb-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#14b8a6]/15 text-sm font-bold text-[#14b8a6]">
              {step.number}
            </div>
            <h3 className="text-lg font-semibold text-zinc-100">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{step.body}</p>
            <div className="mt-5 overflow-hidden rounded-lg border border-zinc-800">
              <Image
                src={step.screenshot}
                alt=""
                role="presentation"
                width={640}
                height={400}
                className="h-auto w-full"
                unoptimized
              />
              <p className="border-t border-zinc-800 bg-zinc-950 px-3 py-2 text-center text-[10px] uppercase tracking-widest text-zinc-400">
                Real screenshot lands in week 6
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

---

## `packages/crm/src/components/landing/landing-comparison-section.tsx`

_Wallet-math. Two columns: what you're renting now vs what you ship with SeldonFrame._

```tsx
// Cut C onboarding-pivot — "Stop renting 5 tools" comparison section.
//
// Sits between the How-It-Works step trio and the Soul section, so the
// dream-outcome (paste a URL → workspace ready) gets followed
// immediately by the wallet math (~$1,744/mo of stitched SaaS vs.
// $29-$99/mo of SeldonFrame). The comparison is the agency-decisive
// frame: the four artifacts the workspace ships are the same four
// artifacts buyers are currently renting on five different invoices.
//
// Design-system spec (from design:design-system pass):
//   - Mirrors the FAQ / how-it-works / hero rhythm: rounded-xl,
//     border-zinc-800, bg-zinc-900 cards, zinc text scale, eyebrow
//     letter-spacing 0.2em on zinc-500.
//   - LEFT column ("escape"):  bg-zinc-900/40, border-zinc-800/60,
//     body text-zinc-400, strikethrough on the line totals via
//     <del> with decoration-rose-500/70 — keeps WCAG AA contrast
//     (zinc-400 on zinc-900 = ~7:1) while signalling "you escape
//     this."
//   - RIGHT column ("destination"): bg-zinc-900, border-[#14b8a6]/30,
//     text-zinc-100, with a soft teal glow shadow that lifts the
//     card off the page — sells "primary surface."
//   - Central arrow: lucide ArrowRight in a teal-tinted bubble,
//     absolutely positioned at the col seam on md+, hidden on
//     mobile (stacked layout makes the arrow redundant).
//
// Copy refined by design:ux-copy. H2 is action-first
// ("Stop renting 5 tools"), columns headed by the rent/ship pair
// that mirrors the operator's gut metaphor. Subtotals are explicit
// so the visual delta hits before the buyer has to do the math.

import { ArrowRight, Check, X } from "lucide-react";

type LineItem = {
  label: string;
  price?: string; // omitted for the emotional / "no dollar amount" item
  struck?: boolean; // applies strikethrough to the price on the LEFT col
};

const ESCAPE_ITEMS: readonly LineItem[] = [
  { label: "GoHighLevel Agency Pro", price: "$497/mo", struck: true },
  { label: "Zapier (15k tasks)", price: "$847/mo", struck: true },
  {
    label: "Calendly + Typeform + Mailchimp + HubSpot",
    price: "$400/mo",
    struck: true,
  },
  { label: "Tool churn, broken zaps, 5-tab context switching" },
];

const DESTINATION_ITEMS: readonly LineItem[] = [
  { label: "Growth", price: "$29/mo (3 client workspaces)" },
  { label: "Scale", price: "$99/mo (unlimited workspaces)" },
  { label: "CRM, booking, intake, chatbot, white-label", price: "included" },
  { label: "One dashboard. Zero tab-switching." },
];

export function LandingComparisonSection() {
  return (
    <section
      id="replaces"
      aria-labelledby="replaces-heading"
      className="mx-auto max-w-6xl border-t border-zinc-800/30 px-6 py-16 md:py-24"
    >
      <div className="mx-auto max-w-3xl text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          What it replaces
        </p>
        <h2
          id="replaces-heading"
          className="text-balance text-3xl font-bold text-zinc-100 md:text-4xl"
        >
          Stop renting 5 tools. Build the OS your client needs in 60 seconds.
        </h2>
      </div>

      <div className="relative mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-8">
        {/* LEFT — what you're renting now */}
        <div
          aria-labelledby="escape-heading"
          className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-6 md:p-7"
        >
          <h3
            id="escape-heading"
            className="text-sm font-semibold uppercase tracking-wider text-zinc-400"
          >
            What you&apos;re renting now
          </h3>
          <ul className="mt-5 space-y-3">
            {ESCAPE_ITEMS.map((item) => (
              <li
                key={item.label}
                className="flex items-start justify-between gap-3 border-b border-zinc-800/40 pb-3 last:border-b-0 last:pb-0"
              >
                <span className="flex items-start gap-2.5">
                  <X
                    className="mt-0.5 size-4 shrink-0 text-zinc-600"
                    strokeWidth={2.25}
                    aria-hidden="true"
                  />
                  <span className="text-sm text-zinc-400">{item.label}</span>
                </span>
                {item.price ? (
                  item.struck ? (
                    // Text steps from zinc-500 to zinc-400 (drops the
                    // opacity-80 modifier) so the struck price meets
                    // WCAG AA 4.5:1 against bg-zinc-900/40 over body.
                    // The rose decoration still carries the "this is
                    // dying" frame (a11y-review C1). The visually-
                    // hidden suffix carries the same frame to SR users
                    // whose verbosity setting skips <del> announcement
                    // (a11y-review M4).
                    <del className="shrink-0 text-sm font-medium tabular-nums text-zinc-400 decoration-rose-500/80 decoration-[1.5px]">
                      {item.price}
                      <span className="sr-only"> — no longer needed</span>
                    </del>
                  ) : (
                    <span className="shrink-0 text-sm font-medium tabular-nums text-zinc-400">
                      {item.price}
                    </span>
                  )
                ) : null}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex items-baseline justify-between border-t border-zinc-800 pt-4">
            <span className="text-xs uppercase tracking-wider text-zinc-500">
              Subtotal
            </span>
            <del className="text-2xl font-bold tabular-nums text-zinc-300 decoration-rose-500/80 decoration-2">
              ~$1,744/mo
              <span className="sr-only"> — what you stop paying</span>
            </del>
          </div>
        </div>

        {/* Visually-hidden bridge — gives screen reader users the
            same comparison frame the central arrow gives sighted
            users (a11y-review M2). The visual arrow stays purely
            decorative. */}
        <p className="sr-only">
          Instead of all of the above, with SeldonFrame you ship:
        </p>

        {/* Central arrow — desktop only.
            z-10 to lift above the cards on the seam; size-14 + size-6
            icon + stronger glow per design-critique #4 so the arrow
            reads as the intentional "transition" rather than an
            afterthought. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 md:block"
        >
          <div className="flex size-14 items-center justify-center rounded-full border border-[#14b8a6]/40 bg-zinc-900 shadow-[0_0_40px_-5px_rgba(20,184,166,0.45)]">
            <ArrowRight className="size-6 text-[#14b8a6]" strokeWidth={2.25} />
          </div>
        </div>

        {/* RIGHT — what you ship with SeldonFrame.
            border opacity lifted to /40 per design-critique #5 so the
            destination card has clearly higher border presence than
            the LEFT/60 escape card. */}
        <div
          aria-labelledby="destination-heading"
          className="rounded-xl border border-[#14b8a6]/40 bg-zinc-900 p-6 shadow-[0_0_60px_-15px_rgba(20,184,166,0.25)] md:p-7"
        >
          <h3
            id="destination-heading"
            className="text-sm font-semibold uppercase tracking-wider text-[#14b8a6]"
          >
            What you ship with SeldonFrame
          </h3>
          <ul className="mt-5 space-y-3">
            {DESTINATION_ITEMS.map((item) => (
              <li
                key={item.label}
                className="flex items-start justify-between gap-3 border-b border-zinc-800/60 pb-3 last:border-b-0 last:pb-0"
              >
                <span className="flex items-start gap-2.5">
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-[#14b8a6]"
                    strokeWidth={2.25}
                    aria-hidden="true"
                  />
                  <span className="text-sm text-zinc-100">{item.label}</span>
                </span>
                {item.price ? (
                  <span className="shrink-0 text-sm font-medium tabular-nums text-zinc-300">
                    {item.price}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex items-baseline justify-between border-t border-[#14b8a6]/20 pt-4">
            <span className="text-xs uppercase tracking-wider text-[#14b8a6]">
              Total
            </span>
            <span className="text-2xl font-bold tabular-nums text-zinc-100">
              $29<span className="text-zinc-500">–</span>$99
              <span className="text-base font-medium text-zinc-400">/mo</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
```

---

## `packages/crm/src/components/landing/demo-video-section.tsx`

_Demo video placeholder. Week-6 swap-in for the real 60-sec build screencast._

```tsx
import Image from "next/image";
import { Play } from "lucide-react";

// Cut C Phase 3 — Demo video section (week-5 placeholder).
//
// The marketing plan calls for a 60-second narrated demo as the
// centerpiece, but the recording happens in week 6 (Phase 9) once
// Cuts A + B are shipped to prod and the real product flow can be
// captured. Week 5 ships this shell with a placeholder GIF so the
// real video can swap in by replacing /marketing/demo-video.mp4 +
// flipping a couple of lines here.
export function LandingDemoVideoSection() {
  return (
    <section
      id="demo"
      // tabIndex=-1 makes the section a programmatic focus target so
      // the hero's "Watch the 60-second build" CTA (href="#demo")
      // moves focus here on jump for screen reader announcement
      // (a11y-review N2). Does not enter the natural Tab order.
      tabIndex={-1}
      aria-labelledby="demo-heading"
      className="mx-auto max-w-5xl border-t border-zinc-800/30 px-6 py-16 outline-none md:py-20"
    >
      <div className="text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          See it in action
        </p>
        <h2 id="demo-heading" className="text-3xl font-bold text-zinc-100 md:text-4xl">
          60 seconds. Paste to live workspace.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-zinc-400">
          Sign up, paste a client URL, and watch the CRM, booking page, intake form, AI chatbot, and demo
          portal build themselves — narrated, end-to-end, in one minute.
        </p>
      </div>

      <div className="mx-auto mt-10 w-full max-w-4xl overflow-hidden rounded-xl border border-zinc-800/50 bg-zinc-900">
        {/* Week 5: placeholder frame with centered Play affordance so the empty
            box reads as "video placeholder", not "broken image". Week 6 swaps
            in the real demo asset and removes the Play icon overlay. */}
        <div className="relative aspect-video w-full motion-reduce:hidden">
          <Image
            src="/marketing/demo-placeholder.gif"
            alt=""
            role="presentation"
            fill
            className="object-cover"
            unoptimized
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3"
          >
            <Play size={64} className="text-[#14b8a6] opacity-40" />
            <p className="text-sm text-zinc-500">Walkthrough recording in progress</p>
          </div>
        </div>
        <div className="hidden h-[60px] items-center justify-center bg-zinc-900 px-6 text-sm text-zinc-500 motion-reduce:flex">
          Animated preview hidden because you prefer reduced motion. Full narrated demo lands soon.
        </div>
        <p className="border-t border-zinc-800/50 bg-zinc-950 px-6 py-3 text-center text-xs text-zinc-400">
          Polished 60-second walkthrough lands in week 6.
        </p>
      </div>
    </section>
  );
}
```

---

## `packages/crm/src/components/landing/marketing-pricing-section.tsx`

_3-column Free/Growth/Scale pricing matrix with feature comparison._

```tsx
// Cut C Phase 4 — Marketing pricing section (Free / Growth / Scale).
//
// This is the 3-column MARKETING pricing surface on the public landing
// page. It is intentionally separate from the in-product 6-tier pricing
// component at `components/marketing/landing-pricing-section.tsx` which
// is shown to signed-in users browsing the in-product upgrade modal.
// Don't merge the two — different audiences, different copy contracts.
//
// Source of truth for the FEATURES matrix is spec §Cut B (Phase 1).
// FEATURE_FLAGS shipped by Cut B (lib/billing/feature-flags.ts):
//   - branding_hidden, custom_domain, client_portal  (Growth+)
//   - ai_agents, white_label_portal, priority_support  (Scale only)
// Workspace caps and BYOK are not feature flags — they're tier limits
// resolved at runtime from TIER_FEATURES in lib/billing/features.ts.
//
// Copy: refined by design:ux-copy (Phase 4 Task 4.3, May 2026). The
// audience is an agency owner deciding whether $29 is worth it; we
// surface what they save by upgrading (no branding shown, custom
// domain per client) without sounding pushy. CTAs say "Upgrade to X"
// rather than "Start free trial" because we have not yet committed
// to a trial length — see TRIAL_LENGTH judgment call in the Cut C
// final report.

import Link from "next/link";
import { Check, Minus } from "lucide-react";

type TierKey = "free" | "growth" | "scale";

type Tier = {
  key: TierKey;
  name: string;
  price: string;
  period: string;
  tagline: string;
  ctaLabel: string;
  ctaHref: string;
  highlighted?: boolean;
};

type FeatureRow = {
  label: string;
  values: Readonly<Record<TierKey, string | boolean>>;
};

// Tagline copy: from design:ux-copy output, May 2026. Each tagline is
// one sentence long and answers "what do I get for this price?" in
// the agency owner's own terms.
const TIERS: readonly Tier[] = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    tagline: "1 workspace. Your Anthropic key. The whole product, free forever.",
    ctaLabel: "Start free",
    ctaHref: "/signup",
  },
  {
    key: "growth",
    name: "Growth",
    price: "$29",
    period: "/month",
    tagline: "Run 3 clients without SeldonFrame branding showing anywhere.",
    ctaLabel: "Upgrade to Growth",
    ctaHref: "/signup?plan=growth",
    highlighted: true,
  },
  {
    key: "scale",
    name: "Scale",
    price: "$99",
    period: "/month",
    tagline: "Unlimited clients. AI agents working leads while you sleep.",
    ctaLabel: "Upgrade to Scale",
    ctaHref: "/signup?plan=scale",
  },
];

// Source of truth: spec §Cut B tier features table. Each row label is
// the refined marketing copy from design:ux-copy; the corresponding
// Cut B feature flag (where one exists) is named in the trailing
// comment so a future flag rename is obvious to the grep-er.
const FEATURES: readonly FeatureRow[] = [
  { label: "Client workspaces", values: { free: "1", growth: "3", scale: "Unlimited" } },
  { label: "Bring your own Anthropic key", values: { free: true, growth: true, scale: true } },
  { label: "Unlimited contacts per client", values: { free: true, growth: true, scale: true } },
  // Cut B flag: branding_hidden
  {
    label: "No SeldonFrame branding shown to clients",
    values: { free: false, growth: true, scale: true },
  },
  // Cut B flag: custom_domain
  {
    label: "Custom domain per client (theirs, not yours)",
    values: { free: false, growth: true, scale: true },
  },
  // Cut B flag: client_portal
  { label: "Branded client portal", values: { free: false, growth: true, scale: true } },
  // Cut B flag: ai_agents
  {
    label: "AI agents: Speed-to-Lead, Win-Back, Reviews",
    values: { free: false, growth: false, scale: true },
  },
  // Cut B flag: white_label_portal
  {
    label: "Full white-label (your logo, your domain)",
    values: { free: false, growth: false, scale: true },
  },
  // Cut B flag: priority_support — dropped the SLA promise from the
  // copy since no SLA is committed yet (see SLA judgment call in
  // Cut C final report).
  { label: "Priority support", values: { free: false, growth: false, scale: true } },
  { label: "Claude Code MCP (power-user CLI)", values: { free: true, growth: true, scale: true } },
];

function renderCell(value: string | boolean) {
  if (value === true) {
    return <Check size={16} className="mx-auto text-[#14b8a6]" aria-label="Included" />;
  }
  if (value === false) {
    // a11y May 2026: bumped from zinc-700 (1.5:1) to zinc-500 (3.1:1)
    // to clear WCAG 2.1 AA 1.4.11 non-text contrast on zinc-900 +
    // zebra-strip rows. Label switched from "Not included" to "Not
    // available" — clearer inside a feature comparison row.
    return (
      <Minus
        size={16}
        className="mx-auto text-zinc-500"
        aria-label="Not available"
      />
    );
  }
  return <span className="text-sm text-zinc-200">{value}</span>;
}

export function LandingMarketingPricingSection() {
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="mx-auto max-w-5xl border-t border-zinc-800/30 px-6 py-16 md:py-20"
    >
      <div className="text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Pricing
        </p>
        <h2
          id="pricing-heading"
          className="text-3xl font-bold text-zinc-100 md:text-4xl"
        >
          Start free. Charge $29 the day you land your second client.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-zinc-400">
          One workspace per client. Unlimited contacts, bookings, and AI chat on every tier —
          running on your Anthropic key.
        </p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
        {TIERS.map((tier) => {
          // design-critique May 2026: Scale cannot visually compete
          // with Growth (the "obvious next step"). Free and Scale both
          // run at slightly demoted background opacity so the eye
          // catches Growth's teal border first; Growth stays at full
          // opacity to anchor the row.
          const cardSurface = tier.highlighted
            ? "border-[#14b8a6]/60 bg-zinc-900 shadow-lg shadow-[#14b8a6]/5"
            : "border-zinc-800/80 bg-zinc-900/60";
          // a11y May 2026: chain the article → badge so SRs announce
          // "Growth tier, Recommended" instead of just "Growth tier"
          // (the visual-only badge is otherwise invisible to AT).
          const badgeId = `pricing-tier-${tier.key}-badge`;
          const nameId = `pricing-tier-${tier.key}-name`;
          return (
            <article
              key={tier.key}
              data-tier={tier.key}
              aria-labelledby={
                tier.highlighted ? `${nameId} ${badgeId}` : nameId
              }
              className={`relative flex flex-col rounded-xl border p-6 ${cardSurface}`}
            >
              {tier.highlighted ? (
                // Lifted above the card top edge so it reads as a
                // stamp, not part of the H3. ring of page-bg color
                // creates a punch-through effect.
                <span
                  id={badgeId}
                  className="absolute -top-2.5 right-4 rounded-full border border-[#14b8a6]/50 bg-[#14b8a6]/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#14b8a6] ring-2 ring-[#09090b]"
                >
                  Recommended
                </span>
              ) : null}
              <h3 id={nameId} className="text-lg font-semibold text-zinc-100">
                {tier.name}
              </h3>
              {/* min-h holds the price baseline aligned across all 3
                  cards even when one tagline wraps to 2 lines. */}
              <p className="mt-1 min-h-[2.5rem] text-sm text-zinc-400">{tier.tagline}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-zinc-100">{tier.price}</span>
                <span className="text-sm text-zinc-500">{tier.period}</span>
              </div>
              <Link
                href={tier.ctaHref}
                data-tier-cta={tier.key}
                /* a11y May 2026: white-on-teal #14b8a6 was 2.6:1 — fails
                   WCAG 2.1 AA 1.4.3 (4.5:1 normal text). zinc-950 on
                   teal is ~7.2:1, well clear. Outline tier CTA stays
                   zinc-200 on dark which already passes. */
                className={`mt-6 inline-flex items-center justify-center rounded-xl px-6 py-3 font-semibold transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14b8a6] ${
                  tier.highlighted
                    ? "bg-[#14b8a6] text-zinc-950 hover:opacity-90"
                    : "border border-zinc-700 text-zinc-200 hover:border-zinc-500"
                }`}
              >
                {tier.ctaLabel}
              </Link>
            </article>
          );
        })}
      </div>

      <div className="mt-10 overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">Tier feature comparison</caption>
          <thead>
            <tr className="bg-zinc-900/50">
              <th scope="col" className="p-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Feature
              </th>
              {TIERS.map((tier) => (
                <th
                  key={tier.key}
                  scope="col"
                  className="p-4 text-center text-xs font-semibold uppercase tracking-wider text-zinc-500"
                >
                  {tier.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Zebra-stripe rows so the eye tracks horizontally without
                losing the row at 1366px on long feature labels. */}
            {FEATURES.map((row) => (
              <tr
                key={row.label}
                className="border-t border-zinc-800/60 odd:bg-zinc-900/30"
              >
                <th scope="row" className="p-4 text-left font-normal text-zinc-200">
                  {row.label}
                </th>
                {TIERS.map((tier) => (
                  <td key={tier.key} className="p-4 text-center">
                    {renderCell(row.values[tier.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

---

## `packages/crm/src/components/landing/marketing-faq-section.tsx`

_8 agency-focused FAQs covering white-label/domain/BYOK/workspace count/Claude Code/data isolation/GHL compare/Zapier replace._

```tsx
// Cut C Phase 6 — Marketing landing FAQ section.
//
// REPLACES the older `components/marketing/faq.tsx` MarketingFaq on
// the public home page. Different audience: the older variant was
// agency-vs-GoHighLevel positioning; this one is the final due-
// diligence objection-handler that sits between the open-source
// section and the why-now / final-CTA closer. The older component
// file is kept (other surfaces may import it later) — only the home-
// page mount swaps to this new section in `(public)/page.tsx`.
//
// Copy refined by design:ux-copy (May 2026). Each answer leads with
// Yes/No then layers proof — the agency buyer's due-diligence pattern.
// On-page answer text MUST match the FAQPage JSON-LD schema verbatim
// (mismatch drops the Google rich result), so the FAQS array is the
// canonical source for both surfaces.
//
// Design pattern: stacked individual <details> cards (not a single
// divided container) — matches the home-page card rhythm and lets
// each closed Q feel weighty. Open-state accent is a teal border on
// the active card (NOT teal summary text) — calmer animation, no
// text-color flicker on toggle.

type FaqItem = { question: string; answer: string };

// Question order is intentional, refined by design-critique (May 2026):
//   1. workspace count — the upgrade-trigger question; first thing the
//      buyer's mind goes to after seeing pricing two sections above.
//   2. white-label — second-most-frequent agency objection.
//   3. domain — completes the "what does my client see?" arc.
//   4. Anthropic key — addresses "is my bill predictable?"
//   5. Claude Code — power-user reassurance, smaller audience but
//      load-bearing for the segment that cares.
//   6. data isolation — closing trust-builder, the question buyers
//      don't ask out loud but want answered.
//
// Q7/Q8 (onboarding-pivot, May 2026): added after the new comparison
// section ships above. Buyers who scrolled past "Stop renting 5 tools"
// reach the FAQ already asking "ok, but how does this really compare
// to GHL?" and "do I really not need Zapier?" — Q7/Q8 answer those
// directly, factual-first, with the same numbers the comparison
// section displays so the two surfaces never drift.
const FAQS: readonly FaqItem[] = [
  {
    question: "How many client workspaces can I run?",
    answer:
      "One on Free, three on Growth, unlimited on Scale. The workspace cap is the only thing tiers gate on count — features like custom domains, white-label, and AI agents stack on top per tier.",
  },
  {
    question: "Can I white-label this for my clients?",
    answer:
      "Yes. Growth ($29/mo) hides all SeldonFrame branding from your client's landing page, portal, and emails. Scale ($99/mo) adds full white-label of the client-facing dashboard — your logo on every surface they see.",
  },
  {
    question: "What if a client wants their own domain?",
    answer:
      "Each workspace can map to its own domain on Growth and Scale. Your client visits booking.theirbusiness.com, not theirbusiness.app.seldonframe.com.",
  },
  {
    question: "Does it work with my Anthropic key?",
    answer:
      "Yes. Bring-your-own Anthropic key is supported on every tier including Free. You pay Anthropic directly, we never charge a token margin, and the key is encrypted at rest with no plaintext logs.",
  },
  {
    question: "Can I use Claude Code instead of the web app?",
    answer:
      "Yes. Both surfaces share the same backend, and Claude Code (via our MCP server) stays available on every tier including Free. Most agencies use the web for onboarding non-technical staff and Claude Code for bulk operations.",
  },
  {
    question: "Is each client's data isolated from the others?",
    answer:
      "Yes. Every workspace is a separate org with its own CRM contacts, booking calendar, intake submissions, and chatbot transcripts. No cross-workspace read path exists in the codebase.",
  },
  {
    question: "How does this compare to GoHighLevel?",
    answer:
      "SeldonFrame builds your client's CRM, booking page, intake form, and AI chatbot in 60 seconds from a URL or a plain-English description — no 2-4 week onboarding curve. Pricing starts at $29/mo per agency vs. GoHighLevel Agency Pro at $497/mo. SeldonFrame is open source under AGPL-3.0, so you can self-host or use SeldonFrame Cloud. Email deliverability is wired by default — no manual DNS setup.",
  },
  {
    question: "Do I still need Zapier, Calendly, Typeform, Mailchimp, or HubSpot?",
    answer:
      "No. CRM, scheduling, intake forms, email broadcasts, and contact management are native — no Zapier task fees, no broken integrations, no 5-tool tab switching. Bring your Anthropic key, paste your client's URL, and the stack assembles itself.",
  },
];

// Google FAQPage rich result — text MUST mirror the on-page <p>
// answers verbatim. Build from the same FAQS const so the two can
// never drift.
const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  })),
};

export function LandingMarketingFaqSection() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="mx-auto max-w-3xl border-t border-zinc-800/30 px-6 py-16 md:py-20"
    >
      <div className="text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Before you sign up
        </p>
        <h2
          id="faq-heading"
          className="text-3xl font-bold text-zinc-100 md:text-4xl"
        >
          Last 8 questions agencies ask
        </h2>
      </div>

      <div className="mt-10 space-y-3">
        {FAQS.map((faq) => (
          <details
            key={faq.question}
            className="group rounded-xl border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:border-zinc-700 open:border-[#14b8a6]/40"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-zinc-100 [&::-webkit-details-marker]:hidden">
              <span>{faq.question}</span>
              <span
                aria-hidden="true"
                className="text-2xl leading-none text-zinc-500 transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">{faq.answer}</p>
          </details>
        ))}
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
    </section>
  );
}
```

---

## `packages/crm/src/components/landing/footer.tsx`

_Footer with GitHub callout + AGPL-3.0 badge + legal links._

```tsx
// Cut C Phase 7 — Footer refresh.
//
// Two-tier layout: (a) a prominent "Open source on GitHub" call-to-
// arms block at the top of the footer — last chance to capture
// developer-curious agency owners before they leave the page; (b) a
// real Product / Resources / Legal link grid replacing the prior
// stub's `href="#"` placeholders.
//
// License string is AGPL-3.0-or-later (verified against repo LICENSE
// file May 2026). The prior footer said "MIT" — drift, fixed here.
// Cut A + Cut B + Cut C all share this footer; the AGPL-3.0 badge
// also satisfies the open-source positioning the marketing page now
// leans on (open-source section above, FAQ §6 isolation answer, the
// pricing page's "BYOK on all tiers" rail).
//
// GitHub repo: seldonframe/crm (matches nav.tsx and the rest of Cut C).

import Link from "next/link";
import { GitFork, ExternalLink } from "lucide-react";
// lucide-react@1.7 doesn't export a Github icon — GitFork pairs with
// the "fork it" CTA copy.

type FooterLink = { label: string; href: string; external?: boolean };

const PRODUCT_LINKS: readonly FooterLink[] = [
  { label: "Pricing", href: "#pricing" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Open source", href: "#open-source" },
  { label: "FAQ", href: "#faq" },
];

const RESOURCE_LINKS: readonly FooterLink[] = [
  {
    label: "Claude Code MCP",
    href: "https://github.com/seldonframe/crm#claude-code-mcp",
    external: true,
  },
  {
    label: "GitHub Issues",
    href: "https://github.com/seldonframe/crm/issues",
    external: true,
  },
  {
    label: "Changelog",
    href: "https://github.com/seldonframe/crm/releases",
    external: true,
  },
];

const LEGAL_LINKS: readonly FooterLink[] = [
  { label: "Privacy", href: "https://app.seldonframe.com/policy", external: true },
  { label: "Terms", href: "https://app.seldonframe.com/terms", external: true },
];

function renderLinkList(links: readonly FooterLink[]) {
  return links.map((link) => (
    <Link
      key={link.label}
      href={link.href}
      target={link.external ? "_blank" : undefined}
      rel={link.external ? "noopener noreferrer" : undefined}
      className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
    >
      {link.label}
    </Link>
  ));
}

export function LandingFooter() {
  return (
    <footer
      aria-labelledby="footer-heading"
      className="border-t border-zinc-800/30 py-12"
    >
      <h2 id="footer-heading" className="sr-only">
        Footer
      </h2>
      <div className="mx-auto max-w-5xl px-6">
        {/* GitHub call-to-arms block. Last surface before the visitor
            leaves the page — the buyer who scrolled this far is either
            committed or just-looking; this gives the just-looking
            segment one more reason to bookmark us. */}
        <div className="mb-10 flex flex-col items-start justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-5 md:flex-row md:items-center">
          <div>
            <p className="text-sm font-semibold text-zinc-100">
              Open source on GitHub
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Star the repo, file an issue, or fork it. PRs welcome — see CONTRIBUTING.md.
            </p>
          </div>
          <Link
            href="https://github.com/seldonframe/crm"
            target="_blank"
            rel="noopener noreferrer"
            // a11y: zinc-950 on teal #14b8a6 = 7.2:1 (white-on-teal
            // was 2.6:1 — fails WCAG AA). Matches the pricing CTA fix.
            className="inline-flex items-center gap-2 rounded-lg bg-[#14b8a6] px-4 py-2 text-sm font-semibold text-zinc-950 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14b8a6]"
          >
            <GitFork size={16} aria-hidden="true" />
            View on GitHub
            <ExternalLink size={12} aria-hidden="true" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <span className="text-sm font-semibold text-zinc-100">SeldonFrame</span>
            <p className="mt-4 text-xs leading-relaxed text-zinc-500">
              © 2026 SeldonFrame.
              <br />
              Open source under{" "}
              <Link
                href="https://github.com/seldonframe/crm/blob/main/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-zinc-300 hover:decoration-zinc-500"
              >
                AGPL-3.0-or-later
              </Link>
              .
            </p>
          </div>

          <nav aria-label="Product" className="flex flex-col gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              Product
            </span>
            {renderLinkList(PRODUCT_LINKS)}
          </nav>

          <nav aria-label="Resources" className="flex flex-col gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              Resources
            </span>
            {renderLinkList(RESOURCE_LINKS)}
          </nav>

          <nav aria-label="Legal" className="flex flex-col gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              Legal
            </span>
            {renderLinkList(LEGAL_LINKS)}
          </nav>
        </div>
      </div>
    </footer>
  );
}
```
