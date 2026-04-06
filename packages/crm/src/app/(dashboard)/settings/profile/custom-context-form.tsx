"use client";

import { useMemo, useState, useTransition } from "react";
import { updateSoulCustomContextAction } from "@/lib/soul/actions";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

const MAX_CUSTOM_CONTEXT = 2000;

export function CustomContextForm({ initialValue }: { initialValue: string }) {
  const [value, setValue] = useState(initialValue);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();
  const { showDemoToast } = useDemoToast();

  const remaining = useMemo(() => MAX_CUSTOM_CONTEXT - value.length, [value.length]);

  function onSave() {
    if (isDemoReadonlyClient) {
      showDemoToast();
      return;
    }

    startTransition(async () => {
      try {
        const result = await updateSoulCustomContextAction({
          customContext: value.slice(0, MAX_CUSTOM_CONTEXT),
        });
        setValue(result.customContext);
        setStatus("saved");
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
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <div className="space-y-1">
        <h2 className="text-sm font-medium text-foreground">Anything else Seldon should know?</h2>
        <p className="text-sm text-muted-foreground">
          Tell Seldon about your unique business rules, preferences, or edge cases.
        </p>
      </div>

      <textarea
        className="crm-input min-h-[180px] w-full p-3 text-sm"
        maxLength={MAX_CUSTOM_CONTEXT}
        placeholder={`Tell Seldon about your unique business rules, preferences, or edge cases. Examples:
• "I use sliding scale pricing from $75-$200 based on income"
• "Never use the word 'coaching' — I call it 'strategic partnership'"
• "All new clients must sign an NDA before onboarding"
• "I only work with founders who have 2+ years of experience"
• "My discovery calls are always free but require a pre-call questionnaire"`}
        value={value}
        onChange={(event) => {
          setStatus("idle");
          setValue(event.target.value.slice(0, MAX_CUSTOM_CONTEXT));
        }}
      />

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{remaining} characters remaining</p>
        <button type="button" className="crm-button-primary h-9 px-4" disabled={pending} onClick={onSave}>
          {pending ? "Saving..." : "Save Context"}
        </button>
      </div>

      {status === "saved" ? <p className="text-xs text-positive">Saved.</p> : null}
      {status === "error" ? <p className="text-xs text-negative">Could not save context.</p> : null}
    </div>
  );
}
