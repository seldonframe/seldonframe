"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateSoulPreviewAction, saveSoulAction } from "@/lib/soul/actions";
import type { OrgSoul, SoulWizardInput } from "@/lib/soul/types";
import { SoulReview } from "@/components/soul/soul-review";
import { SoulStepBusiness } from "@/components/soul/soul-step-business";
import { SoulStepClients } from "@/components/soul/soul-step-clients";
import { SoulStepPriorities } from "@/components/soul/soul-step-priorities";
import { SoulStepProcess } from "@/components/soul/soul-step-process";
import { SoulStepVoice } from "@/components/soul/soul-step-voice";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

const initialInput: SoulWizardInput = {
  businessName: "",
  offerType: "services",
  businessDescription: "",
  industry: "coaching",
  clientType: "B2C",
  clientLabel: "Client",
  leadSources: [],
  processDescription: "",
  processDuration: "",
  stages: [],
  communicationStyle: "friendly-professional",
  vocabulary: [],
  avoidWords: [],
  priorities: ["new client acquisition", "pipeline visibility", "task management"],
  painPoint: "",
  clientDescription: "",
};

const steps = ["business", "offer", "clients", "process", "voice", "priorities", "narrative", "review"] as const;

export function SoulWizard({ completionRedirect = "/dashboard" }: { completionRedirect?: string }) {
  const router = useRouter();
  const { showDemoToast } = useDemoToast();
  const [stepIndex, setStepIndex] = useState(0);
  const [input, setInput] = useState<SoulWizardInput>(initialInput);
  const [previewSoul, setPreviewSoul] = useState<OrgSoul | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const step = steps[stepIndex];

  const goNext = () => {
    if (step === "narrative") {
      startTransition(async () => {
        const generated = await generateSoulPreviewAction(input);
        setPreviewSoul(generated);
        setStepIndex((idx) => Math.min(idx + 1, steps.length - 1));
      });
      return;
    }

    setStepIndex((idx) => Math.min(idx + 1, steps.length - 1));
  };

  const goBack = () => setStepIndex((idx) => Math.max(0, idx - 1));

  const save = () => {
    if (!previewSoul) {
      return;
    }

    startTransition(async () => {
      try {
        if (isDemoReadonlyClient) {
          showDemoToast();
          return;
        }

        await saveSoulAction(previewSoul);
        router.push(completionRedirect);
      } catch (error) {
        if (isDemoBlockedError(error)) {
          showDemoToast();
          return;
        }

        setError("Failed to save setup. Please try again.");
      }
    });
  };

  return (
    <section className="crm-card mx-auto w-full max-w-2xl animate-page-enter">
      <div className="mb-4">
        <p className="text-[11px] uppercase tracking-[0.08em] text-[hsl(var(--color-text-muted))]">Step {stepIndex + 1} of {steps.length}</p>
        <h1 className="text-section-title">Soul Setup</h1>
      </div>

      {step === "business" ? <SoulStepBusiness value={input} onChange={(patch) => setInput((current) => ({ ...current, ...patch }))} /> : null}
      {step === "offer" ? (
        <div className="grid gap-3">
          <input
            className="crm-input h-10 px-3"
            value={input.offerType}
            onChange={(event) => setInput((current) => ({ ...current, offerType: event.target.value }))}
            placeholder="Offer type"
          />
          <textarea
            className="crm-input min-h-24 p-3"
            value={input.businessDescription}
            onChange={(event) => setInput((current) => ({ ...current, businessDescription: event.target.value }))}
            placeholder="Describe your offer in one paragraph"
          />
        </div>
      ) : null}
      {step === "clients" ? <SoulStepClients value={input} onChange={(patch) => setInput((current) => ({ ...current, ...patch }))} /> : null}
      {step === "process" ? <SoulStepProcess value={input} onChange={(patch) => setInput((current) => ({ ...current, ...patch }))} /> : null}
      {step === "voice" ? <SoulStepVoice value={input} onChange={(patch) => setInput((current) => ({ ...current, ...patch }))} /> : null}
      {step === "priorities" ? <SoulStepPriorities value={input} onChange={(patch) => setInput((current) => ({ ...current, ...patch }))} /> : null}
      {step === "narrative" ? (
        <div className="grid gap-3">
          <textarea
            className="crm-input min-h-24 p-3"
            value={input.painPoint}
            onChange={(event) => setInput((current) => ({ ...current, painPoint: event.target.value }))}
            placeholder="Biggest pain point you solve"
          />
          <textarea
            className="crm-input min-h-24 p-3"
            value={input.clientDescription}
            onChange={(event) => setInput((current) => ({ ...current, clientDescription: event.target.value }))}
            placeholder="Describe your ideal client"
          />
        </div>
      ) : null}
      {step === "review" && previewSoul ? <SoulReview soul={previewSoul} /> : null}

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      <div className="mt-6 flex justify-between gap-3">
        <button type="button" className="crm-button-secondary h-10 px-4" onClick={goBack} disabled={stepIndex === 0 || pending}>
          Back
        </button>

        {step === "review" ? (
          <button type="button" className="crm-button-primary h-10 px-4" onClick={save} disabled={pending}>
            {pending ? "Saving..." : "Save and continue"}
          </button>
        ) : (
          <button type="button" className="crm-button-primary h-10 px-4" onClick={goNext} disabled={pending}>
            {pending ? "Generating..." : "Next"}
          </button>
        )}
      </div>
    </section>
  );
}
