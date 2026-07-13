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

import { useRef } from "react";

import { AnimatedBeam } from "@/components/ui/magic/animated-beam";

type ToolNode = {
  id: string;
  label: string;
};

const TOOLS: readonly ToolNode[] = [
  { id: "calendar", label: "Calendar" },
  { id: "gmail", label: "Gmail" },
  { id: "phone", label: "Phone" },
  { id: "slack", label: "Slack" },
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
          className="flex size-12 items-center justify-center rounded-full bg-[#00897B] text-[13px] font-[700] text-white shadow-[0_2px_8px_rgba(0,137,123,.35)]"
          aria-hidden
        >
          SF
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
              className="flex size-9 items-center justify-center rounded-[8px] border border-[rgba(34,29,23,.10)] bg-[#FFFDFA] text-[10px] font-[600] text-[#221D17] shadow-[0_1px_2px_rgba(34,29,23,.05)]"
            >
              {tool.label.slice(0, 2)}
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
