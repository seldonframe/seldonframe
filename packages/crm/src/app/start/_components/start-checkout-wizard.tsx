"use client";
// packages/crm/src/app/start/_components/start-checkout-wizard.tsx
// Orchestrates the two-step live-sell checkout flow.
// Step 1: client details form (Step1Form)
// Step 2: Stripe Embedded Checkout (Step2Checkout)
// The left panel (ValuePanel) is fixed across both steps.

import { useState } from "react";
import { ValuePanel } from "./value-panel";
import { Step1Form } from "./step1-form";
import { Step2Checkout } from "./step2-checkout";
import type { LiveSellCheckoutResult } from "../actions";

type Workspace = { id: string; name: string; slug: string };

type StartCheckoutWizardProps = {
  workspaces: Workspace[];
  agencyName: string;
  primaryColor: string | null;
};

type WizardStep = "step1" | "step2";

export function StartCheckoutWizard({
  workspaces,
  agencyName,
  primaryColor,
}: StartCheckoutWizardProps) {
  const [step, setStep] = useState<WizardStep>("step1");
  const [checkout, setCheckout] = useState<LiveSellCheckoutResult | null>(null);

  const accent = primaryColor ?? "#B26B49";

  function handleCheckoutReady(result: LiveSellCheckoutResult) {
    setCheckout(result);
    setStep("step2");
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Left: fixed value panel */}
      <div className="w-full lg:w-96 xl:w-[420px] flex-shrink-0">
        <ValuePanel agencyName={agencyName} primaryColor={primaryColor} />
      </div>

      {/* Right: form side */}
      <div className="flex-1 flex items-start justify-center py-10 px-6 bg-[#F6F2EA] min-h-screen">
        <div className="w-full max-w-xl">
          {/* Step indicator */}
          <div className="flex items-center gap-3 mb-8">
            <StepDot n={1} active={step === "step1"} done={step === "step2"} color={accent} />
            <div className="h-px flex-1 bg-border" />
            <StepDot n={2} active={step === "step2"} done={false} color={accent} />
          </div>

          {step === "step1" && (
            <Step1Form
              workspaces={workspaces}
              onCheckoutReady={handleCheckoutReady}
              accentColor={accent}
            />
          )}
          {step === "step2" && checkout && (
            <>
              <button
                onClick={() => setStep("step1")}
                className="mb-4 text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 flex items-center gap-1"
              >
                ← Back to details
              </button>
              <Step2Checkout checkout={checkout} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StepDot({
  n,
  active,
  done,
  color,
}: {
  n: number;
  active: boolean;
  done: boolean;
  color: string;
}) {
  return (
    <div
      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold border-2 transition-colors"
      style={{
        backgroundColor: done || active ? color : "transparent",
        borderColor: done || active ? color : "#ccc",
        color: done || active ? "#fff" : "#999",
      }}
    >
      {done ? "✓" : n}
    </div>
  );
}
