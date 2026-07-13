"use client";

// IntegrationBeam — "SF is the source of truth that pushes outward" (CLAUDE.md
// §1b): a bounded figure showing SeldonFrame beaming OUT to the client's real
// tools, never pulling through middleware (the no-Zapier architecture claim).
//
// Self-contained: owns its own container + node refs so callers just drop
// `<IntegrationBeam />` in. Uses the vendored `AnimatedBeam` (packages/crm/src
// /components/ui/magic/animated-beam.tsx), which is itself reduced-motion-safe
// and SSR-safe (empty path until refs resolve client-side).
//
// Static state (SSR / reduced-motion): the center node + tool nodes and their
// resting connector lines are always present in the DOM — this is what a
// crawler or a reduced-motion user sees, not a blank canvas that only
// "arrives" once JS animates it in.
//
// This section is buildStack/light-only (mirrors marketing-ide-strip.tsx),
// so it intentionally keeps hardcoded parchment/teal hex values instead of
// the `--lp-*` tokens — those values ARE the build-mode palette and this
// component never renders in "record" mode.

import { useRef } from "react";
import { Phone } from "lucide-react";

import { AnimatedBeam } from "@/components/ui/magic/animated-beam";

type ToolNode = {
  id: string;
  label: string;
  /** Real brand logo under /public; `phone` has no brand mark so it renders
   *  a lucide glyph instead. */
  logo?: string;
};

const TOOLS: readonly ToolNode[] = [
  { id: "calendar", label: "Calendar", logo: "/brand/integrations/google-calendar.svg" },
  { id: "gmail", label: "Gmail", logo: "/brand/integrations/gmail.svg" },
  { id: "phone", label: "Phone" },
  { id: "slack", label: "Slack", logo: "/brand/integrations/slack.svg" },
];

export function IntegrationBeam() {
  const containerRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const gmailRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const slackRef = useRef<HTMLDivElement>(null);

  const toolRefs = {
    calendar: calendarRef,
    gmail: gmailRef,
    phone: phoneRef,
    slack: slackRef,
  } as const;

  return (
    <div
      ref={containerRef}
      className="relative flex min-h-[220px] w-full items-center justify-between overflow-hidden rounded-[10px] border border-[rgba(34,29,23,.08)] bg-[#F6F2EA] px-6 py-8"
    >
      {/* Center: SeldonFrame node (the source of truth) */}
      <div className="relative z-10 flex flex-col items-center gap-1.5">
        <div
          ref={centerRef}
          className="flex size-12 items-center justify-center rounded-full bg-[#00897B] shadow-[0_2px_8px_rgba(0,137,123,.35)]"
          aria-hidden
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
          <img src="/brand/seldonframe-icon-white.svg" alt="" width={24} height={24} className="block" />
        </div>
        <span className="text-[11px] font-[600] text-[#221D17]">SeldonFrame</span>
      </div>

      {/* Outward: real integration targets, arranged in a column so each beam
          fans out from the center node. */}
      <div className="relative z-10 flex flex-col items-end gap-3">
        {TOOLS.map((tool) => (
          <div key={tool.id} className="flex items-center gap-2">
            <span className="text-[11px] font-[500] text-[#6E665A]">{tool.label}</span>
            <div
              ref={toolRefs[tool.id as keyof typeof toolRefs]}
              className="flex size-9 items-center justify-center rounded-[8px] border border-[rgba(34,29,23,.10)] bg-[#FFFDFA] text-[#221D17] shadow-[0_1px_2px_rgba(34,29,23,.05)]"
            >
              {tool.logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- static vendored SVG
                <img src={tool.logo} alt="" width={18} height={18} className="block" aria-hidden="true" />
              ) : (
                <Phone className="size-[17px] text-[#00897B]" aria-hidden="true" />
              )}
            </div>
          </div>
        ))}
      </div>

      {TOOLS.map((tool) => (
        <AnimatedBeam
          key={tool.id}
          containerRef={containerRef}
          fromRef={centerRef}
          toRef={toolRefs[tool.id as keyof typeof toolRefs]}
          curvature={0}
          duration={4}
          gradientStartColor="#00897B"
          gradientStopColor="#4DB6AC"
        />
      ))}
    </div>
  );
}
