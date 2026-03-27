"use client";

import { useTransition } from "react";
import { createBookingAction } from "@/lib/bookings/actions";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

type ContactOption = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
};

export function CreateBookingForm({
  contacts,
  providers,
}: {
  contacts: ContactOption[];
  providers: string[];
}) {
  const [pending, startTransition] = useTransition();
  const { showDemoToast } = useDemoToast();

  return (
    <form
      className="crm-card grid gap-3 p-4"
      action={(formData) => {
        startTransition(async () => {
          try {
            if (isDemoReadonlyClient) {
              showDemoToast();
              return;
            }

            await createBookingAction(formData);
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
        <input className="crm-input h-10 px-3" name="title" placeholder="Session title" defaultValue="Consultation" />
        <input className="crm-input h-10 px-3" name="startsAt" type="datetime-local" required />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <select className="crm-input h-10 px-3" name="contactId" defaultValue="">
          <option value="">No linked contact</option>
          {contacts.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {`${contact.firstName} ${contact.lastName ?? ""}`.trim()} {contact.email ? `(${contact.email})` : ""}
            </option>
          ))}
        </select>

        <select className="crm-input h-10 px-3" name="provider" defaultValue="">
          <option value="">Auto provider</option>
          {providers.map((provider) => (
            <option key={provider} value={provider}>
              {provider}
            </option>
          ))}
          <option value="manual">manual</option>
        </select>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <input className="crm-input h-10 px-3" name="durationMinutes" type="number" min={15} step={15} defaultValue={30} />
        <input className="crm-input h-10 px-3" name="bookingSlug" defaultValue="default" placeholder="Booking slug" />
      </div>

      <textarea className="crm-input min-h-20 p-3" name="notes" placeholder="Internal notes" />

      <button type="submit" className="crm-button-primary h-10 px-4" disabled={pending}>
        {pending ? "Scheduling..." : "Schedule booking"}
      </button>
    </form>
  );
}
