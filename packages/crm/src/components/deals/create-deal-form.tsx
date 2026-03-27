"use client";

import { useTransition } from "react";
import { createDealAction } from "@/lib/deals/actions";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

export function CreateDealForm({ contacts }: { contacts: Array<{ id: string; firstName: string; lastName: string | null }> }) {
  const [pending, startTransition] = useTransition();
  const { showDemoToast } = useDemoToast();

  return (
    <form
      className="crm-card grid gap-3 p-4 md:grid-cols-4"
      action={(formData) => {
        startTransition(async () => {
          try {
            if (isDemoReadonlyClient) {
              showDemoToast();
              return;
            }

            await createDealAction(formData);
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
      <input className="crm-input h-10 px-3" name="title" placeholder="Deal title" required />
      <input className="crm-input h-10 px-3" name="value" type="number" placeholder="Value" defaultValue="0" />
      <select name="contactId" className="crm-input h-10 px-3" required>
        <option value="">Select contact</option>
        {contacts.map((contact) => (
          <option key={contact.id} value={contact.id}>
            {contact.firstName} {contact.lastName}
          </option>
        ))}
      </select>
      <button type="submit" className="crm-button-primary h-10 px-4" disabled={pending}>
        {pending ? "Adding..." : "Add"}
      </button>
    </form>
  );
}
