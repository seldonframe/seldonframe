"use client";

// Marketplace buyer surface — the setup wizard (client island).
//
// A one-thing-per-screen wizard ported from the Claude Design onboarding export,
// re-skinned to the real brand (teal `#1F2B24`, cream paper, mono numbers). It
// drives the buyer through the ordered steps the engine produced for THEIR agent:
//
//   • a slim progress bar + "Step N of M" counter (the "endowed progress effect"
//     — step 1 already reads as real progress),
//   • a switch keyed on `step.kind` that renders the right screen; the rich
//     screens (business_info, go_live in P1; connect_tool, phone in P2;
//     connect_openai_voice in P4/Task 9) ship in this build, the rest render a
//     quiet "coming in this build" placeholder,
//   • Back / Continue nav; each completed step saves via a buyer action so the
//     wizard is RESUMABLE (close + return to the exact step).
//
// Footer model: a SIMPLE step (placeholder, test/preview) uses the wizard's
// generic Back + Continue footer (renders nothing itself + sets ownsFooter
// false). A RICH step (business_info, go_live, connect_tool, phone,
// connect_openai_voice) owns its OWN footer — its primary action validates/
// connects/activates, then calls back into the wizard to record progress +
// advance. The switch returns `ownsFooter` so the wizard knows to suppress the
// generic footer for those kinds.
//
// The server page resolves the agent + the saved progress and passes a
// serializable view; this island only renders + calls the buyer actions.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { OnboardingStep, OnboardingStepKind } from "@/lib/marketplace/onboarding/steps";
import { BUYER } from "@/components/buyer/theme";
import { markStepDoneAction } from "@/app/(buyer)/agent/actions";
import { StepPlaceholder } from "@/components/buyer/steps/step-placeholder";
import {
  BusinessInfoStep,
  type BusinessInfoSeed,
} from "@/components/buyer/steps/business-info-step";
import {
  GoLiveStep,
  type GoLiveSummaryRow,
} from "@/components/buyer/steps/go-live-step";
import {
  ConnectToolStep,
  type ConnectToolSeed,
} from "@/components/buyer/steps/connect-tool-step";
import { PhoneStep, type PhoneSeed } from "@/components/buyer/steps/phone-step";
import {
  ConnectOpenAiVoiceStep,
  type ConnectOpenAiVoiceSeed,
} from "@/components/buyer/steps/connect-openai-voice-step";
import { TestStep, type TestStepSeed } from "@/components/buyer/steps/test-step";

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
  /** Prefill for the business_info step (services + what-you-do + hours window). */
  businessInfoSeed: BusinessInfoSeed;
  /** Per-toolkit connected state for connect_tool steps (toolkit slug → connected).
   *  Consumed by the connect_tool step in Task 8. */
  connectedToolkits: Record<string, boolean>;
  /** Current phone state for the phone step. */
  phoneSeed: PhoneSeed;
  /** Seed for the connect_openai_voice step (Tier 2 opt-in) — this org's
   *  webhook URL + whether they've already connected. */
  openAiVoiceSeed: ConnectOpenAiVoiceSeed;
  /** Seed for the test ("hear it work") step — test-line number + greeting. */
  testStepSeed: TestStepSeed;
  /** Recap rows for the go_live step (business name, phone, calendar). */
  goLiveSummary: GoLiveSummaryRow[];
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

  /** Advance to the next step (clamped). */
  function advance() {
    setIndex((i) => Math.min(steps.length - 1, i + 1));
  }

  /** Jump to a specific step by kind (go_live "Fix it" → the blocking step). */
  function jumpToKind(kind: OnboardingStepKind) {
    setError(null);
    const i = steps.findIndex((s) => s.kind === kind);
    if (i >= 0) setIndex(i);
  }

  /** Mark the current step done locally + persist, then advance. Used by the
   *  generic Continue AND by rich steps that have already done their own work
   *  (connect/phone) and just need progress recorded. The business_info + go_live
   *  actions persist their OWN progress, so for those we record locally + advance
   *  without a second write (markLocalAndAdvance). */
  function completeAndAdvance(kind: OnboardingStepKind) {
    setError(null);
    startSaving(async () => {
      const result = await markStepDoneAction(props.deploymentId, kind);
      if (!result.ok) {
        setError("Couldn’t save your progress. Please try again.");
        return;
      }
      setDone(new Set(result.progress.doneKinds));
      advance();
    });
  }

  /** Record a step done in LOCAL state only (the step's own action already
   *  persisted progress) + advance. Avoids a redundant write. */
  function markLocalAndAdvance(kind: OnboardingStepKind) {
    setError(null);
    setDone((prev) => {
      const next = new Set(prev);
      next.add(kind);
      return next;
    });
    advance();
  }

  if (!step) {
    // No steps (shouldn't happen — go_live is always last). Bail to the home.
    router.push(props.homeHref);
    return null;
  }

  const body = renderStep({
    step,
    index,
    props,
    saving,
    onBack: goBack,
    onGenericComplete: () => completeAndAdvance(step.kind),
    onSelfPersistedComplete: () => markLocalAndAdvance(step.kind),
    onJumpToStep: jumpToKind,
    doneKinds: [...done],
  });

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
        {body.node}

        {error ? (
          <p
            role="alert"
            style={{ margin: "16px 0 0", fontSize: 13.5, color: "#B4302A", fontWeight: 550 }}
          >
            {error}
          </p>
        ) : null}
      </div>

      {/* Generic footer — only for SIMPLE steps that don't own their own footer.
          Rich steps (business_info / go_live / connect_tool / phone) render their
          own Back + primary action inside the card. */}
      {body.ownsFooter ? null : (
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
      )}
    </div>
  );
}

// ─── the step switch ─────────────────────────────────────────────────────────
//
// Keyed on `step.kind`. Returns the rendered node + whether the step OWNS its
// footer (rich steps render their own Back + primary action; simple steps reuse
// the wizard's generic footer). business_info / connect_tool / phone / test /
// go_live ship rich screens; the social kinds (brand_info, cadence, preview)
// still render the honest StepPlaceholder with the generic footer (later phases).

type RenderArgs = {
  step: OnboardingStep;
  index: number;
  props: SetupWizardClientProps;
  saving: boolean;
  onBack: () => void;
  /** Persist `markStepDone` + advance (the generic path). */
  onGenericComplete: () => void;
  /** The step already persisted its own progress — just record locally + advance. */
  onSelfPersistedComplete: () => void;
  onJumpToStep: (kind: OnboardingStepKind) => void;
  doneKinds: OnboardingStepKind[];
};

function renderStep(args: RenderArgs): { node: React.ReactNode; ownsFooter: boolean } {
  const { step, index, props } = args;
  const canGoBack = index > 0;

  switch (step.kind) {
    case "business_info":
      return {
        ownsFooter: true,
        node: (
          <BusinessInfoStep
            deploymentId={props.deploymentId}
            seed={props.businessInfoSeed}
            canGoBack={canGoBack}
            onBack={args.onBack}
            onSaved={args.onSelfPersistedComplete}
          />
        ),
      };

    case "connect_tool": {
      const toolkit = step.toolkit ?? "";
      const seed: ConnectToolSeed = {
        toolkit,
        connected: Boolean(props.connectedToolkits[toolkit]),
      };
      return {
        ownsFooter: true,
        node: (
          <ConnectToolStep
            deploymentId={props.deploymentId}
            seed={seed}
            canGoBack={canGoBack}
            onBack={args.onBack}
            onContinue={args.onGenericComplete}
          />
        ),
      };
    }

    case "phone":
      return {
        ownsFooter: true,
        node: (
          <PhoneStep
            deploymentId={props.deploymentId}
            seed={props.phoneSeed}
            canGoBack={canGoBack}
            onBack={args.onBack}
            onContinue={args.onGenericComplete}
          />
        ),
      };

    case "connect_openai_voice":
      return {
        ownsFooter: true,
        node: (
          <ConnectOpenAiVoiceStep
            seed={props.openAiVoiceSeed}
            canGoBack={canGoBack}
            onBack={args.onBack}
            onContinue={args.onGenericComplete}
          />
        ),
      };

    case "test":
      return {
        ownsFooter: true,
        node: (
          <TestStep
            deploymentId={props.deploymentId}
            seed={props.testStepSeed}
            canGoBack={canGoBack}
            onBack={args.onBack}
            onContinue={args.onGenericComplete}
          />
        ),
      };

    case "go_live":
      return {
        ownsFooter: true,
        node: (
          <GoLiveStep
            deploymentId={props.deploymentId}
            agentName={props.agentName}
            homeHref={props.homeHref}
            steps={props.steps}
            doneKinds={args.doneKinds}
            summary={props.goLiveSummary}
            canGoBack={canGoBack}
            onBack={args.onBack}
            onJumpToStep={args.onJumpToStep}
          />
        ),
      };

    case "brand_info":
    case "cadence":
    case "preview":
    default:
      return { ownsFooter: false, node: <StepPlaceholder step={step} /> };
  }
}

// ─── inline nav button styles (generic footer) ───────────────────────────────

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
