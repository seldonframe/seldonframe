"use client";

// 2026-05-18 — Inline operator reply box for /conversations/[contactId].
//
// Submits to sendOperatorSmsReplyAction (Slice 4). The server action
// revalidates /conversations + /conversations/[contactId] so the new
// outbound row shows up without a manual refresh — we only handle the
// optimistic "submitting" + error toast locally.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendOperatorSmsReplyAction } from "@/lib/sms/actions";

export function ConversationReplyForm({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!body.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const result = await sendOperatorSmsReplyAction({
        contactId,
        body,
      });

      if (!result.ok) {
        setError(result.error);
      } else if (result.suppressed) {
        setNotice(
          `Customer is on the suppression list (${result.reason ?? "suppressed"}). Message not sent.`,
        );
      } else {
        setBody("");
        // Server action already revalidates, but a router.refresh
        // makes the new row render reliably across hot-reload edge
        // cases in dev.
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="crm-card sticky bottom-3 mt-4 flex flex-col gap-2 p-3"
    >
      <textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          if (error) setError(null);
          if (notice) setNotice(null);
        }}
        rows={2}
        maxLength={1000}
        placeholder="Type your reply..."
        disabled={submitting}
        className="w-full resize-none rounded-md border border-border/80 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground">
          {body.length}/1000 · Sends via your Twilio number. STOP footer
          auto-appended for compliance.
        </p>
        <button
          type="submit"
          disabled={!body.trim() || submitting}
          className="crm-button-primary inline-flex h-9 items-center justify-center px-4 text-sm disabled:opacity-50"
        >
          {submitting ? "Sending…" : "Send SMS"}
        </button>
      </div>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : null}
      {notice ? (
        <p className="text-xs text-muted-foreground">{notice}</p>
      ) : null}
    </form>
  );
}
