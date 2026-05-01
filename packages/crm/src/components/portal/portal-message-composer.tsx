"use client";

import { useImperativeHandle, useRef, useState, useTransition, type Ref } from "react";
import { useRouter } from "next/navigation";
import { sendPortalMessageAction } from "@/lib/portal/actions";
import type { PortalMessageRow } from "./portal-messages-client";

const BODY_MAX = 5000;

const IMAGE_RX = /\.(png|jpe?g|gif|webp|svg|avif)(\?|#|$)/i;
const PDF_RX = /\.pdf(\?|#|$)/i;

export type PortalMessageComposerHandle = {
  prefillSubject: (value: string) => void;
};

export function PortalMessageComposer({
  orgSlug,
  clientName,
  formRef,
  handleRef,
  addOptimistic,
}: {
  orgSlug: string;
  clientName: string | null;
  formRef: Ref<HTMLFormElement | null>;
  handleRef: Ref<PortalMessageComposerHandle | null>;
  addOptimistic: (row: PortalMessageRow) => void;
}) {
  const router = useRouter();
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(
    handleRef,
    () => ({
      prefillSubject: (value: string) => {
        setSubject(value);
        subjectInputRef.current?.focus();
        const input = subjectInputRef.current;
        if (input) {
          requestAnimationFrame(() => {
            input.setSelectionRange(value.length, value.length);
          });
        }
      },
    }),
    []
  );

  const trimmedBody = body.trim();
  const overLimit = body.length > BODY_MAX;
  const cannotSend = !trimmedBody || overLimit || pending;

  const trimmedUrl = attachmentUrl.trim();
  const isImage = trimmedUrl.length > 0 && IMAGE_RX.test(trimmedUrl);
  const isPdf = trimmedUrl.length > 0 && PDF_RX.test(trimmedUrl);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmedBody) {
      setError("Write a message before sending.");
      return;
    }
    if (overLimit) {
      setError(`Your message is ${(body.length - BODY_MAX).toLocaleString()} characters over the limit.`);
      return;
    }
    setError(null);

    const tempId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimistic: PortalMessageRow = {
      id: tempId,
      subject: subject.trim() || null,
      body: trimmedBody,
      senderType: "client",
      senderName: clientName,
      createdAt: new Date(),
      readAt: null,
      isPinned: "false",
      attachmentUrl: trimmedUrl || null,
      attachmentName: attachmentName.trim() || (trimmedUrl || null),
      pending: true,
    };

    const formData = new FormData();
    formData.set("subject", subject);
    formData.set("body", body);
    formData.set("attachmentUrl", attachmentUrl);
    formData.set("attachmentName", attachmentName);

    startTransition(async () => {
      addOptimistic(optimistic);
      try {
        await sendPortalMessageAction(orgSlug, formData);
        setSubject("");
        setBody("");
        setAttachmentName("");
        setAttachmentUrl("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not send message. Please try again.");
      }
    });
  };

  return (
    <form ref={formRef} className="crm-card grid gap-3 p-4" onSubmit={handleSubmit}>
      <input
        ref={subjectInputRef}
        className="crm-input h-10 px-3"
        name="subject"
        value={subject}
        onChange={(event) => setSubject(event.target.value)}
        placeholder="Subject (optional)"
        maxLength={200}
        disabled={pending}
      />

      <div className="relative">
        <textarea
          className="crm-input min-h-32 w-full p-3 pr-20"
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Write your message..."
          required
          disabled={pending}
        />
        <span
          aria-live="polite"
          className={`pointer-events-none absolute bottom-2 right-3 text-[11px] tabular-nums ${
            overLimit
              ? "font-medium text-[hsl(var(--color-destructive))]"
              : "text-[hsl(var(--color-text-muted))]"
          }`}
        >
          {body.length.toLocaleString()}/{BODY_MAX.toLocaleString()}
        </span>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <input
          className="crm-input h-10 px-3"
          name="attachmentName"
          value={attachmentName}
          onChange={(event) => setAttachmentName(event.target.value)}
          placeholder="Attachment name (optional)"
          disabled={pending}
        />
        <input
          className="crm-input h-10 px-3"
          name="attachmentUrl"
          value={attachmentUrl}
          onChange={(event) => setAttachmentUrl(event.target.value)}
          placeholder="Attachment URL (optional)"
          inputMode="url"
          disabled={pending}
        />
      </div>

      {trimmedUrl ? (
        <div className="rounded-md border border-border bg-muted p-3 text-xs text-[hsl(var(--color-text-secondary))]">
          {isImage ? (
            <div className="flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={trimmedUrl}
                alt={attachmentName || "Attachment preview"}
                className="h-20 w-20 rounded border border-border object-cover"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">{attachmentName || "Image attachment"}</p>
                <p className="truncate text-[11px] text-[hsl(var(--color-text-muted))]">{trimmedUrl}</p>
              </div>
            </div>
          ) : isPdf ? (
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded border border-border bg-background text-[10px] font-bold tracking-wider">
                PDF
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">{attachmentName || "PDF attachment"}</p>
                <p className="truncate text-[11px] text-[hsl(var(--color-text-muted))]">{trimmedUrl}</p>
              </div>
            </div>
          ) : (
            <p className="break-all">
              Attachment link: <span className="font-mono">{trimmedUrl}</span>
            </p>
          )}
        </div>
      ) : null}

      {error ? <p className="text-xs text-[hsl(var(--color-destructive))]">{error}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-[hsl(var(--color-text-muted))]">
          Replies arrive in your account team&apos;s inbox. They typically respond within one business day.
        </p>
        <button
          type="submit"
          className="crm-button-primary h-10 px-4 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={cannotSend}
        >
          {pending ? "Sending…" : "Send message"}
        </button>
      </div>
    </form>
  );
}
