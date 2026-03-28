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
      className="crm-card grid gap-3 p-4 md:grid-cols-5 md:items-end"
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
      <div>
        <label htmlFor="cf-first" className="mb-1 block text-sm text-[hsl(var(--muted-foreground))]">First name</label>
        <input id="cf-first" className="crm-input h-10 w-full px-3" name="firstName" placeholder="Jane" required />
      </div>
      <div>
        <label htmlFor="cf-last" className="mb-1 block text-sm text-[hsl(var(--muted-foreground))]">Last name</label>
        <input id="cf-last" className="crm-input h-10 w-full px-3" name="lastName" placeholder="Doe" />
      </div>
      <div>
        <label htmlFor="cf-email" className="mb-1 block text-sm text-[hsl(var(--muted-foreground))]">Email</label>
        <input id="cf-email" className="crm-input h-10 w-full px-3" name="email" type="email" placeholder="jane@example.com" />
      </div>
      <div>
        <label htmlFor="cf-status" className="mb-1 block text-sm text-[hsl(var(--muted-foreground))]">Status</label>
        <select id="cf-status" className="crm-input h-10 w-full px-3" name="status" defaultValue="lead">
          <option value="lead">Lead</option>
          <option value="customer">Customer</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <button type="submit" className="crm-button-primary h-10 px-4" disabled={pending}>
        {pending ? "Adding..." : "Add"}
      </button>
    </form>
  );
}
