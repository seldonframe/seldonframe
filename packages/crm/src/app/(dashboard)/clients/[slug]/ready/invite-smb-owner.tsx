"use client";

// 2026-05-17 — "Invite SMB owner" action for the Ready hub.
//
// Surfaces the existing /portal/<slug>/login magic-link flow to the
// agency operator so they can hand off the client workspace to the
// actual business owner (HVAC owner, dentist, etc.) without copy-
// pasting URLs. Two paths:
//
//   1. "Send magic link" — collect the SMB's email, fire
//      requestOperatorMagicLinkAction, SMB gets a branded sign-in
//      email and lands in their workspace's operator portal.
//   2. "Copy sign-in URL" — for agencies that want to send via their
//      own channel (Slack, Loom recording, in-person handoff).
//
// Both paths target the SAME login URL (/portal/<slug>/login); the
// SMB enters their email there to receive a magic link. The "send
// magic link" path just pre-fires the email on the agency operator's
// behalf so the SMB's first interaction is "open email, click, sign
// in" instead of "visit URL, type email, wait for email, click,
// sign in."

import { useState, useTransition } from "react";
import { Copy, Check, Mail, ExternalLink } from "lucide-react";
import { requestOperatorMagicLinkAction } from "@/lib/operator-portal/auth";

export function InviteSmbOwner({
  workspaceSlug,
  workspaceName,
  portalLoginUrl,
  invitedByName,
}: {
  workspaceSlug: string;
  workspaceName: string;
  /** Full https://… URL the SMB visits to sign in. Shown in the
   *  "Copy sign-in URL" affordance and embedded in the magic-link
   *  email branded as the agency. */
  portalLoginUrl: string;
  /** Optional display name of the agency operator sending the invite,
   *  surfaced in the email body so the SMB knows who invited them. */
  invitedByName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const copyUrl = () => {
    void navigator.clipboard.writeText(portalLoginUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const sendMagicLink = () => {
    if (!email.trim()) return;
    setError(null);
    setSentTo(null);
    startTransition(async () => {
      try {
        const result = await requestOperatorMagicLinkAction({
          orgSlug: workspaceSlug,
          email: email.trim(),
          invitedByName,
        });
        if ("ok" in result && result.ok) {
          setSentTo(result.sentTo || email.trim());
          setEmail("");
        } else {
          setError(("reason" in result && result.reason) || "send_failed");
        }
      } catch {
        setError("send_failed");
      }
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="crm-pressable inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 text-xs font-medium text-emerald-700 transition-[background-color,transform] duration-150 ease-out hover:bg-emerald-500/20 dark:text-emerald-300"
      >
        <Mail className="size-3.5" />
        Invite SMB owner
      </button>
    );
  }

  return (
    <div className="mt-3 w-full space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-foreground">
          Give {workspaceName}'s owner their own login
        </p>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
            setSentTo(null);
          }}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="invite-email"
          className="block text-[11px] text-muted-foreground"
        >
          Send sign-in email
        </label>
        <div className="flex gap-2">
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@business.com"
            className="crm-input h-9 flex-1"
            disabled={isPending}
          />
          <button
            type="button"
            onClick={sendMagicLink}
            disabled={isPending || !email.trim()}
            className="crm-button-primary h-9 px-3 text-xs disabled:opacity-50"
          >
            {isPending ? "Sending…" : "Send"}
          </button>
        </div>
        {sentTo ? (
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
            ✓ Sign-in email sent to {sentTo}. Link expires in 15 minutes.
          </p>
        ) : null}
        {error ? (
          <p className="text-[11px] text-rose-600">
            Couldn't send. {error === "email_send_failed" ? "Email provider error." : "Try again."}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5 border-t border-border/60 pt-3">
        <p className="text-[11px] text-muted-foreground">
          Or share this URL via your own channel:
        </p>
        <div className="flex items-center gap-2 rounded-md border border-border bg-background/40 px-2 py-1.5">
          <code className="min-w-0 flex-1 truncate font-mono text-[10px] text-foreground">
            {portalLoginUrl}
          </code>
          <button
            type="button"
            onClick={copyUrl}
            className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
            aria-label="Copy sign-in URL"
          >
            {copied ? (
              <Check className="size-3 text-emerald-600" />
            ) : (
              <Copy className="size-3" />
            )}
          </button>
          <a
            href={portalLoginUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
            aria-label="Open sign-in URL"
          >
            <ExternalLink className="size-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
