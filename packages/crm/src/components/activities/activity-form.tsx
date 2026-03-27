"use client";

import { useTransition } from "react";
import { createActivityAction } from "@/lib/activities/actions";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

export function ActivityForm({ userId }: { userId: string }) {
  const [pending, startTransition] = useTransition();
  const { showDemoToast } = useDemoToast();

  return (
    <form
      className="crm-card grid gap-3 p-4"
      action={(formData) => {
        formData.set("userId", userId);
        startTransition(async () => {
          try {
            if (isDemoReadonlyClient) {
              showDemoToast();
              return;
            }

            await createActivityAction(formData);
            window.location.reload();
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
        <input className="crm-input h-10 px-3" name="type" defaultValue="note" placeholder="Type" />
        <input className="crm-input h-10 px-3" name="subject" placeholder="Subject" />
      </div>
      <textarea className="crm-input min-h-20 p-3" name="body" placeholder="Details" />
      <button type="submit" className="crm-button-primary h-10 px-4" disabled={pending}>
        {pending ? "Saving..." : "Log activity"}
      </button>
    </form>
  );
}
