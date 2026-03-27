"use client";

import { useTransition } from "react";
import { sendEmailAction } from "@/lib/emails/actions";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

type ContactOption = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
};

export function SendEmailForm({
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

            await sendEmailAction(formData);
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
        <select className="crm-input h-10 px-3" name="contactId" defaultValue="">
          <option value="">No linked contact</option>
          {contacts.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {`${contact.firstName} ${contact.lastName ?? ""}`.trim()} {contact.email ? `(${contact.email})` : ""}
            </option>
          ))}
        </select>

        <input className="crm-input h-10 px-3" name="toEmail" type="email" placeholder="recipient@email.com" required />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <input className="crm-input h-10 px-3" name="subject" placeholder="Subject" required />
        <select className="crm-input h-10 px-3" name="provider" defaultValue="">
          <option value="">Default (Resend)</option>
          {providers.map((provider) => (
            <option key={provider} value={provider}>
              {provider}
            </option>
          ))}
          <option value="manual">manual</option>
        </select>
      </div>

      <textarea className="crm-input min-h-24 p-3" name="body" placeholder="Write your message..." required />

      <div className="grid gap-3 md:grid-cols-2">
        <input className="crm-input h-10 px-3" name="ctaLabel" placeholder="CTA label (optional)" />
        <input className="crm-input h-10 px-3" name="ctaHref" placeholder="https://example.com (optional)" />
      </div>

      <button type="submit" className="crm-button-primary h-10 px-4" disabled={pending}>
        {pending ? "Sending..." : "Send Email"}
      </button>
    </form>
  );
}
