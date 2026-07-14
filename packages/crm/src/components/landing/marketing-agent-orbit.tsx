// packages/crm/src/components/landing/marketing-agent-orbit.tsx
//
// Hero breadth-proof animation (2026-07-13): one agent — the SeldonFrame
// mark at the center — orbited by the real tools it works through. Inner
// ring: the model providers you can bring a key for (Anthropic, OpenAI,
// Gemini, Grok). Outer ring: a sample of the Composio-bound apps agents
// act on (Gmail, Calendar, Stripe, Slack, HubSpot…). The Postiz move —
// "see the scope in one glance" — but drawn as the agent AT WORK rather
// than a static logo wall.
//
// Motion contract (cross-surface Adaptation Contract):
//  - Rides the vendored OrbitingCircles, which already renders a complete
//    static state under prefers-reduced-motion / forceStatic.
//  - No new keyframes here — the orbit keyframes are co-located in the
//    vendored component.
//
// All logos are static assets under /brand/{models,integrations}/ —
// vendored SVGs (simple-icons + svgl), no external requests.

"use client";

import { OrbitingCircles } from "@/components/ui/magic/orbiting-circles";

type Logo = { src: string; alt: string };

const MODEL_LOGOS: Logo[] = [
  { src: "/brand/models/anthropic.svg", alt: "Anthropic Claude" },
  { src: "/brand/models/openai.svg", alt: "OpenAI" },
  { src: "/brand/models/gemini.svg", alt: "Google Gemini" },
  { src: "/brand/models/grok.svg", alt: "Grok" },
];

const OUTER_LOGOS: Logo[] = [
  { src: "/brand/integrations/gmail.svg", alt: "Gmail" },
  { src: "/brand/integrations/google-calendar.svg", alt: "Google Calendar" },
  { src: "/brand/integrations/stripe.svg", alt: "Stripe" },
  { src: "/brand/integrations/slack.svg", alt: "Slack" },
  { src: "/brand/integrations/hubspot.svg", alt: "HubSpot" },
  { src: "/brand/integrations/notion.svg", alt: "Notion" },
  { src: "/brand/integrations/google-sheets.svg", alt: "Google Sheets" },
  { src: "/brand/integrations/instagram.svg", alt: "Instagram" },
  { src: "/brand/integrations/supabase.svg", alt: "Supabase" },
  { src: "/brand/integrations/github.svg", alt: "GitHub" },
];

// The rest of the vendored set — shown as a static chip row under the
// orbit so the breadth claim stays concrete without crowding the rings.
const MORE_LOGOS: Logo[] = [
  { src: "/brand/integrations/outlook.svg", alt: "Microsoft Outlook" },
  { src: "/brand/integrations/teams.svg", alt: "Microsoft Teams" },
  { src: "/brand/integrations/google-drive.svg", alt: "Google Drive" },
  { src: "/brand/integrations/google-docs.svg", alt: "Google Docs" },
  { src: "/brand/integrations/youtube.svg", alt: "YouTube" },
  { src: "/brand/integrations/x.svg", alt: "X" },
  { src: "/brand/integrations/firecrawl.svg", alt: "Firecrawl" },
];

function LogoTile({ logo, size = 40 }: { logo: Logo; size?: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-full border border-[rgba(34,29,23,.10)] bg-[#FFFDFA] shadow-[0_1px_2px_rgba(34,29,23,.06),0_4px_10px_rgba(34,29,23,.06)]"
      style={{ width: size, height: size }}
      title={logo.alt}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static vendored SVG, no optimization needed */}
      <img
        src={logo.src}
        alt={logo.alt}
        width={Math.round(size * 0.52)}
        height={Math.round(size * 0.52)}
        loading="lazy"
        className="block"
      />
    </span>
  );
}

export function MarketingAgentOrbit() {
  return (
    <section
      aria-label="One agent working across your tools"
      className="flex w-full flex-col items-center px-5 pb-6 pt-4 md:px-8"
    >
      <p className="inline-flex items-center gap-2.5 font-sans text-[12.5px] tracking-[0.04em] text-[#6E665A]">
        <span className="inline-block h-px w-4 bg-[#9A9183]" aria-hidden />
        <span className="inline-block size-1.5 rounded-full bg-[#1F2B24]" aria-hidden />
        One agent — your whole stack
      </p>

      {/* The orbit: agent at the center, models close in, apps around. */}
      <div className="relative mt-2 flex h-[340px] w-full max-w-[440px] items-center justify-center overflow-hidden">
        {/* Center: the agent */}
        <span className="z-10 flex size-[64px] items-center justify-center rounded-[18px] border border-[rgba(34,29,23,.10)] bg-[#1F2B24] shadow-[0_2px_6px_rgba(34,29,23,.18),0_14px_34px_rgba(34,29,23,.16)]">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
          <img
            src="/brand/seldonframe-icon-white.svg"
            alt="SeldonFrame agent"
            width={34}
            height={34}
            className="block"
          />
        </span>

        <OrbitingCircles radius={78} iconSize={40} speed={1} path>
          {MODEL_LOGOS.map((logo) => (
            <LogoTile key={logo.src} logo={logo} size={40} />
          ))}
        </OrbitingCircles>

        <OrbitingCircles radius={148} iconSize={44} speed={1} reverse path>
          {OUTER_LOGOS.map((logo) => (
            <LogoTile key={logo.src} logo={logo} size={44} />
          ))}
        </OrbitingCircles>
      </div>

      {/* Static remainder + the honest breadth line */}
      <ul className="mt-1 flex flex-wrap items-center justify-center gap-2">
        {MORE_LOGOS.map((logo) => (
          <li key={logo.src}>
            <LogoTile logo={logo} size={34} />
          </li>
        ))}
        <li className="ml-1 text-[13px] font-[500] text-[#6E665A]">
          + 1,000 more apps via Composio
        </li>
      </ul>
    </section>
  );
}
