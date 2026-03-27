"use client";

import { useState, useTransition } from "react";
import { submitPublicBookingAction } from "@/lib/bookings/actions";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

export function PublicBookingForm({
  orgSlug,
  bookingSlug,
}: {
  orgSlug: string;
  bookingSlug: string;
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

            await submitPublicBookingAction({
              orgSlug,
              bookingSlug,
              fullName: String(formData.get("fullName") ?? ""),
              email: String(formData.get("email") ?? ""),
              startsAt: String(formData.get("startsAt") ?? ""),
              notes: String(formData.get("notes") ?? "") || undefined,
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

      <input className="crm-input h-10 w-full px-3" name="startsAt" type="datetime-local" required />
      <textarea className="crm-input min-h-20 w-full p-3" name="notes" placeholder="Anything we should know before the call?" />

      <button type="submit" className="crm-button-primary h-10 px-4" disabled={pending}>
        {pending ? "Booking..." : "Book now"}
      </button>

      {success ? <p className="text-sm text-green-600">Booking confirmed. We will contact you shortly.</p> : null}
    </form>
  );
}
