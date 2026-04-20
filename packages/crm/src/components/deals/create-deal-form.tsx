"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { createDealAction } from "@/lib/deals/actions";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

export function CreateDealForm({ contacts }: { contacts: Array<{ id: string; firstName: string; lastName: string | null }> }) {
  const [pending, startTransition] = useTransition();
  const { showDemoToast } = useDemoToast();
  const router = useRouter();

  return (
    <form
      className="crm-card grid gap-3 p-4 md:grid-cols-4 md:items-end"
      action={(formData) => {
        startTransition(async () => {
          try {
            if (isDemoReadonlyClient) {
              showDemoToast();
              return;
            }

            await createDealAction(formData);
            router.refresh();
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
        <label htmlFor="df-title" className="mb-1 block text-sm text-[hsl(var(--muted-foreground))]">Title</label>
        <input id="df-title" className="crm-input h-10 w-full px-3" name="title" placeholder="Deal title" required />
      </div>
      <div>
        <label htmlFor="df-value" className="mb-1 block text-sm text-[hsl(var(--muted-foreground))]">Value</label>
        <input id="df-value" className="crm-input h-10 w-full px-3" name="value" type="number" placeholder="0" defaultValue="0" />
      </div>
      <div className="min-w-0">
        <label htmlFor="df-contact" className="mb-1 block text-sm text-[hsl(var(--muted-foreground))]">Contact</label>
        <select id="df-contact" name="contactId" className="crm-input h-10 w-full truncate px-3" required>
          <option value="">Select contact</option>
          {contacts.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.firstName} {contact.lastName}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="crm-button-primary h-10 px-4" disabled={pending}>
        {pending ? "Adding..." : "Add"}
      </button>
    </form>
  );
}
