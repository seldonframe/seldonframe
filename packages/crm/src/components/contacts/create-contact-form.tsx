"use client";

import { useTransition } from "react";
import { createContactAction } from "@/lib/contacts/actions";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

export function CreateContactForm() {
  const [pending, startTransition] = useTransition();
  const { showDemoToast } = useDemoToast();

  return (
    <form
      className="crm-card grid gap-3 p-4 md:grid-cols-5"
      action={(formData) => {
        startTransition(async () => {
          try {
            if (isDemoReadonlyClient) {
              showDemoToast();
              return;
            }

            await createContactAction(formData);
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
      <input className="crm-input h-10 px-3" name="firstName" placeholder="First name" required />
      <input className="crm-input h-10 px-3" name="lastName" placeholder="Last name" />
      <input className="crm-input h-10 px-3" name="email" type="email" placeholder="Email" />
      <input className="crm-input h-10 px-3" name="status" placeholder="Status" defaultValue="lead" />
      <button type="submit" className="crm-button-primary h-10 px-4" disabled={pending}>
        {pending ? "Adding..." : "Add"}
      </button>
    </form>
  );
}
