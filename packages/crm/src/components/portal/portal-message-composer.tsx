"use client";

import { useTransition } from "react";
import { sendPortalMessageAction } from "@/lib/portal/actions";

export function PortalMessageComposer({ orgSlug }: { orgSlug: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="crm-card grid gap-3 p-4"
      action={(formData) => {
        startTransition(async () => {
          await sendPortalMessageAction(orgSlug, formData);
          window.location.reload();
        });
      }}
    >
      <input className="crm-input h-10 px-3" name="subject" placeholder="Subject (optional)" />
      <textarea className="crm-input min-h-24 p-3" name="body" placeholder="Write your message..." required />
      <div className="grid gap-2 md:grid-cols-2">
        <input className="crm-input h-10 px-3" name="attachmentName" placeholder="Attachment name (optional)" />
        <input className="crm-input h-10 px-3" name="attachmentUrl" placeholder="Attachment URL (optional)" />
      </div>
      <button type="submit" className="crm-button-primary h-10 px-4" disabled={pending}>
        {pending ? "Sending..." : "Send Message"}
      </button>
    </form>
  );
}
