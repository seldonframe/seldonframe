"use client";

// Marketplace buyer surface — the not-yet-built step placeholder.
//
// The step engine can emit kinds whose full screens land in later phases
// (connect_tool + phone in P2, test/preview in P3, brand_info + cadence with the
// social poster). Rather than crash or silently skip them, the wizard renders
// THIS honest placeholder for any such kind: it names the step, reassures the
// buyer it's coming, and lets them Continue (the wizard still records the step as
// done so the flow stays walkable end-to-end). Brand-themed (teal + paper).

import type { OnboardingStep } from "@/lib/marketplace/onboarding/steps";
import { BUYER } from "@/components/buyer/theme";

export function StepPlaceholder({ step }: { step: OnboardingStep }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        aria-hidden
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 56,
          height: 56,
          borderRadius: 16,
          background: BUYER.accentSoft,
          color: BUYER.accent,
          marginBottom: 16,
          fontSize: 24,
        }}
      >
        ✦
      </div>
      <h2
        style={{
          margin: "0 0 8px",
          fontSize: 21,
          fontWeight: 650,
          letterSpacing: "-0.018em",
        }}
      >
        {step.label}
      </h2>
      <p
        style={{
          margin: "0 auto",
          maxWidth: 380,
          fontSize: 15,
          color: BUYER.ink2,
          lineHeight: 1.5,
        }}
      >
        This step is coming in this build. You can continue for now — we’ll guide
        you through it shortly.
      </p>
    </div>
  );
}
