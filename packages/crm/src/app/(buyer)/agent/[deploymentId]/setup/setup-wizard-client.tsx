"use client";

// Marketplace buyer surface — the setup wizard (client island).
//
// A one-thing-per-screen wizard ported from the Claude Design onboarding export,
// re-skinned to the real brand (teal `#00897B`, cream paper, mono numbers). It
// drives the buyer through the ordered steps the engine produced for THEIR agent:
//
//   • a slim progress bar + "Step N of M" counter (the "endowed progress effect"
//     — step 1 already reads as real progress),
//   • a switch keyed on `step.kind` that renders the right screen; the real
//     screens (business_info, go_live) ship in this build, the rest render a
//     quiet "coming in this build" placeholder (P2/P3 fill them),
//   • Back / Continue nav; each completed step saves via a buyer action so the
//     wizard is RESUMABLE (close + return to the exact step).
//
// The server page resolves the agent + the saved progress and passes a
// serializable view; this island only renders + calls the buyer actions.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { OnboardingStep, OnboardingStepKind } from "@/lib/marketplace/onboarding/steps";
import { BUYER } from "@/components/buyer/theme";
import { markStepDoneAction } from "@/app/(buyer)/agent/actions";
import { StepPlaceholder } from "@/components/buyer/steps/step-placeholder";

export type SetupWizardClientProps = {
  deploymentId: string;
  agentName: string;
  /** The "My Agent" home — where "Finish later" + go-live land. */
  homeHref: string;
  steps: OnboardingStep[];
  /** The step kinds already completed (drives the resume point + progress). */
  doneKinds: OnboardingStepKind[];
  /** The buyer's saved business name (prefills the business_info step). */
  businessName: string;
};

/** Index of the first step whose kind isn't done (the resume point), clamped. */
function resumeIndex(steps: OnboardingStep[], done: Set<OnboardingStepKind>): number {
  const i = steps.findIndex((s) => !done.has(s.kind));
  return i === -1 ? Math.max(0, steps.length - 1) : i;
}

export function SetupWizardClient(props: SetupWizardClientProps) {
  const router = useRouter();
  const [done, setDone] = useState<Set<OnboardingStepKind>>(
    () => new Set(props.doneKinds),
  );
  const [index, setIndex] = useState<number>(() =>
    resumeIndex(props.steps, new Set(props.doneKinds)),
  );
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const steps = props.steps;
  const step = steps[index];
  const total = steps.length;
  const isLast = index >= total - 1;

  // Endowed-progress fill: never 0 on the first screen.
  const fillPercent = useMemo(() => {
    if (total <= 0) return 100;
    const pct = Math.round(((index + 1) / total) * 100);
    return Math.max(8, Math.min(100, pct));
  }, [index, total]);

  function goBack() {
    setError(null);
    setIndex((i) => Math.max(0, i - 1));
  }

  /** Mark the current step done (persist + local), then advance. The go_live
   *  step does NOT route through here — it owns its own activation + redirect. */
  function completeAndAdvance(kind: OnboardingStepKind) {
    setError(null);
    startSaving(async () => {
      const result = await markStepDoneAction(props.deploymentId, kind);
      if (!result.ok) {
        setError("Couldn’t save your progress. Please try again.");
        return;
      }
      setDone(new Set(result.progress.doneKinds));
      setIndex((i) => Math.min(steps.length - 1, i + 1));
    });
  }

  if (!step) {
    // No steps (shouldn't happen — go_live is always last). Bail to the home.
    router.push(props.homeHref);
    return null;
  }

  return (
    <div
      style={{
        width: "min(620px, 100%)",
        margin: "0 auto",
        padding: "clamp(20px,5vw,40px) 20px 36px",
      }}
    >
      {/* Title + step counter */}
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <div
          style={{
            fontFamily: BUYER.fontMono,
            fontSize: 12,
            letterSpacing: "0.04em",
            color: BUYER.accent,
            fontWeight: 500,
            textTransform: "uppercase",
            marginBottom: 9,
          }}
        >
          Step {index + 1} of {total}
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: "clamp(23px,5vw,29px)",
            lineHeight: 1.12,
            letterSpacing: "-0.022em",
            fontWeight: 700,
          }}
        >
          Set up {props.agentName}
        </h1>
      </div>

      {/* Progress bar */}
      <div style={{ margin: "0 auto clamp(24px,5vw,34px)", maxWidth: 520 }}>
        <div
          role="progressbar"
          aria-valuenow={fillPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Setup progress: ${fillPercent}%`}
          style={{
            position: "relative",
            height: 6,
            borderRadius: 999,
            overflow: "hidden",
            background: BUYER.paper2,
            border: `1px solid ${BUYER.line}`,
          }}
        >
          <div
            style={{
              height: "100%",
              borderRadius: 999,
              background: BUYER.accent,
              width: `${fillPercent}%`,
              transition: "width 400ms ease-out",
            }}
          />
        </div>
      </div>

      {/* Step card */}
      <div
        style={{
          background: BUYER.card,
          border: `1px solid ${BUYER.line}`,
          borderRadius: BUYER.radiusLg,
          boxShadow: BUYER.shadowCard,
          padding: "clamp(20px,5vw,36px)",
        }}
      >
        <StepBody step={step} />

        {error ? (
          <p
            role="alert"
            style={{ margin: "16px 0 0", fontSize: 13.5, color: "#B4302A", fontWeight: 550 }}
          >
            {error}
          </p>
        ) : null}
      </div>

      {/* Footer nav — Back + a generic Continue that records the step + advances.
          (Step-specific primary actions for business_info + go_live are wired in
          a later task; for now every step uses the generic Continue.) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginTop: 20,
        }}
      >
        {index > 0 ? (
          <button type="button" onClick={goBack} disabled={saving} style={navBtnGhost}>
            ← Back
          </button>
        ) : (
          <span style={{ flex: 1 }} />
        )}

        <button
          type="button"
          onClick={() => completeAndAdvance(step.kind)}
          disabled={saving}
          style={navBtnPrimary}
        >
          {saving ? "Saving…" : isLast ? "Finish" : "Continue →"}
        </button>
      </div>
    </div>
  );
}

// ─── the step switch ─────────────────────────────────────────────────────────
//
// Keyed on `step.kind`. The rich per-step screens land across phases; until each
// is wired, the kind renders the honest StepPlaceholder so the wizard is walkable
// end-to-end. business_info + go_live get their real screens in the next task.

function StepBody({ step }: { step: OnboardingStep }) {
  switch (step.kind) {
    case "business_info":
    case "brand_info":
    case "connect_tool":
    case "phone":
    case "cadence":
    case "preview":
    case "test":
    case "go_live":
    default:
      return <StepPlaceholder step={step} />;
  }
}

// ─── inline nav button styles ────────────────────────────────────────────────

const navBtnPrimary: React.CSSProperties = {
  fontFamily: BUYER.fontSans,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 48,
  padding: "0 22px",
  borderRadius: 14,
  border: "none",
  background: BUYER.accent,
  color: BUYER.accentContrast,
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
  boxShadow: BUYER.shadowAccent,
};

const navBtnGhost: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "none",
  border: "none",
  cursor: "pointer",
  fontFamily: BUYER.fontSans,
  fontSize: 15,
  fontWeight: 550,
  color: BUYER.ink2,
  padding: "10px 4px",
};
