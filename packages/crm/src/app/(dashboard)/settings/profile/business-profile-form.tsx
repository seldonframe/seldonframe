"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState, useTransition } from "react";
import { useDemoToast } from "@/components/shared/demo-toast-provider";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { updateSoulBusinessProfileAction } from "@/lib/soul/actions";

type BusinessProfileFormProps = {
  initialBusinessName: string;
  initialIndustry: string;
  initialBusinessDescription: string;
  initialOfferType: string;
  initialCustomContext: string;
};

export function BusinessProfileForm({
  initialBusinessName,
  initialIndustry,
  initialBusinessDescription,
  initialOfferType,
  initialCustomContext,
}: BusinessProfileFormProps) {
  const [businessName, setBusinessName] = useState(initialBusinessName);
  const [industry, setIndustry] = useState(initialIndustry);
  const [businessDescription, setBusinessDescription] = useState(initialBusinessDescription);
  const [offerType, setOfferType] = useState(initialOfferType);
  const [customContext, setCustomContext] = useState(initialCustomContext);
  const [status, setStatus] = useState<"idle" | "error">("idle");
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [pending, startTransition] = useTransition();
  const { showDemoToast } = useDemoToast();

  function onSave() {
    if (isDemoReadonlyClient) {
      showDemoToast();
      return;
    }

    startTransition(async () => {
      try {
        const result = await updateSoulBusinessProfileAction({
          businessName,
          industry,
          businessDescription,
          offerType,
          customContext,
        });

        setBusinessName(result.soul.businessName);
        setIndustry(result.soul.industry);
        setBusinessDescription(result.soul.businessDescription);
        setOfferType(result.soul.offerType);
        setCustomContext(result.soul.customContext);
        setStatus("idle");
        setShowSavedToast(true);
        window.setTimeout(() => setShowSavedToast(false), 2500);
      } catch (error) {
        if (isDemoBlockedError(error)) {
          showDemoToast();
          return;
        }

        setStatus("error");
      }
    });
  }

  return (
    <>
      <form
        className="rounded-xl border bg-card p-5 space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <div className="space-y-2">
          <label htmlFor="profile-business-name" className="text-sm font-medium text-foreground">
            Business name
          </label>
          <input
            id="profile-business-name"
            value={businessName}
            onChange={(event) => {
              setStatus("idle");
              setBusinessName(event.target.value);
            }}
            maxLength={120}
            className="crm-input h-10"
            placeholder="Your business name"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="profile-industry" className="text-sm font-medium text-foreground">
            Industry / niche
          </label>
          <input
            id="profile-industry"
            value={industry}
            onChange={(event) => {
              setStatus("idle");
              setIndustry(event.target.value);
            }}
            maxLength={120}
            className="crm-input h-10"
            placeholder="Coaching, consulting, agency..."
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="profile-offer-type" className="text-sm font-medium text-foreground">
            Offer type
          </label>
          <input
            id="profile-offer-type"
            value={offerType}
            onChange={(event) => {
              setStatus("idle");
              setOfferType(event.target.value);
            }}
            maxLength={120}
            className="crm-input h-10"
            placeholder="Services, program, product..."
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="profile-description" className="text-sm font-medium text-foreground">
            Business description
          </label>
          <textarea
            id="profile-description"
            value={businessDescription}
            onChange={(event) => {
              setStatus("idle");
              setBusinessDescription(event.target.value);
            }}
            maxLength={1000}
            rows={5}
            className="crm-input w-full p-3 text-sm"
            placeholder="Describe what you do in one or two sentences."
          />
        </div>

        <div className="space-y-2 pt-6 border-t border-zinc-800">
          <label htmlFor="profile-custom-context" className="text-sm font-medium text-zinc-200">
            Anything else Seldon should know?
          </label>
          <p className="text-xs text-zinc-500">
            Tell Seldon about your unique business rules, pricing, terminology, or preferences. This shapes everything Seldon creates for
            you.
          </p>
          <textarea
            id="profile-custom-context"
            value={customContext}
            onChange={(event) => {
              setStatus("idle");
              setCustomContext(event.target.value.slice(0, 2000));
            }}
            maxLength={2000}
            rows={5}
            placeholder={"Examples:\n• \"I use sliding scale pricing $75-$200 based on income\"\n• \"Never say 'coaching' — I call it 'strategic partnership'\"\n• \"All new clients must sign an NDA before onboarding\"\n• \"Discovery calls are always free but require a pre-call questionnaire\""}
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 resize-y"
          />
          <div className="text-xs text-zinc-600 text-right">{customContext.length} / 2,000</div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          {status === "error" ? <p className="text-xs text-negative">Could not save profile. Please try again.</p> : <span />}
          <button type="submit" className="crm-button-primary h-9 px-4" disabled={pending}>
            {pending ? "Saving..." : "Save"}
          </button>
        </div>
      </form>

      <AnimatePresence>
        {showSavedToast ? (
          <motion.div
            key="business-profile-saved"
            initial={{ opacity: 0, y: 24, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: 16, height: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="crm-toast fixed bottom-4 right-4 z-70 w-full max-w-sm overflow-hidden border border-border bg-card p-4 text-sm"
          >
            <p className="text-label text-foreground">Business profile updated</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
