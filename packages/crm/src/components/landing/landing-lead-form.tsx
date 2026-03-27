"use client";

import { useState, useTransition } from "react";
import { submitLandingLeadAction } from "@/lib/landing/actions";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

export function LandingLeadForm({
  orgSlug,
  pageSlug,
}: {
  orgSlug: string;
  pageSlug: string;
}) {
  const [pending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const { showDemoToast } = useDemoToast();

  return (
    <form
      className="crm-card space-y-3 p-4"
      action={(formData) => {
        startTransition(async () => {
          try {
            if (isDemoReadonlyClient) {
              showDemoToast();
              return;
            }

            await submitLandingLeadAction({
              orgSlug,
              pageSlug,
              fullName: String(formData.get("fullName") ?? ""),
              email: String(formData.get("email") ?? ""),
            });

            setSuccess(true);
          } catch (error) {
            if (isDemoBlockedError(error)) {
              showDemoToast();
              return;
            }

            throw error;
          }
        });
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <input className="crm-input h-10 px-3" name="fullName" placeholder="Your name" required />
        <input className="crm-input h-10 px-3" name="email" type="email" placeholder="you@example.com" required />
      </div>
      <button type="submit" className="crm-button-primary h-10 px-4" disabled={pending}>
        {pending ? "Submitting..." : "Get Started"}
      </button>
      {success ? <p className="text-sm text-green-600">Thanks! We will reach out shortly.</p> : null}
    </form>
  );
}
