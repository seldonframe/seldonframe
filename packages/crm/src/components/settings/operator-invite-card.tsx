// v1.20.0 — operator invite card on /settings/team
//
// Mints a magic-link sign-in to /portal/<orgSlug> for the supplied
// email. The recipient becomes an "operator" of this workspace —
// they can manage contacts/deals/bookings via the branded admin
// portal. Magic link is single-use, 15-min TTL.
//
// Optional "invited by" name surfaces in the email so the recipient
// recognizes the sender. Defaults to the workspace name when blank.

"use client";

import { useState, useTransition } from "react";
import { Copy, Mail, ShieldCheck } from "lucide-react";

import { requestOperatorMagicLinkAction } from "@/lib/operator-portal/auth";

export type OperatorInviteCardProps = {
  orgSlug: string;
  orgName: string;
};

export function OperatorInviteCard({ orgSlug, orgName }: OperatorInviteCardProps) {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [invitedByName, setInvitedByName] = useState("");
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "sent"; sentTo: string; expiresAt: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  const portalLoginUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/portal/${orgSlug}/login`
      : `/portal/${orgSlug}/login`;

  function handleSend() {
    if (!email.trim()) {
      setState({ kind: "error", message: "Enter an email." });
      return;
    }
    startTransition(async () => {
      const res = await requestOperatorMagicLinkAction({
        orgSlug,
        email: email.trim(),
        invitedByName: invitedByName.trim() || undefined,
      });
      if (res.ok) {
        setState({ kind: "sent", sentTo: res.sentTo, expiresAt: res.expiresAt });
        setEmail("");
      } else {
        setState({ kind: "error", message: humanizeReason(res.reason) });
      }
    });
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(portalLoginUrl);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      window.prompt("Copy the operator portal URL:", portalLoginUrl);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <header className="flex items-start gap-3 pb-3 border-b">
        <ShieldCheck className="size-4 mt-0.5 text-muted-foreground" />
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">Invite a workspace operator</h2>
          <p className="text-xs text-muted-foreground">
            Send a single-use magic link to a person you want to manage{" "}
            {orgName}. They&apos;ll get full access to the branded admin portal
            (contacts, deals, bookings — all scoped to this workspace).
          </p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-xs font-medium">
          <span>Operator email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
            placeholder="owner@cypress-pine-hvac.com"
            autoComplete="email"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1.5 text-xs font-medium">
          <span>Your name (optional)</span>
          <input
            type="text"
            value={invitedByName}
            onChange={(e) => setInvitedByName(e.target.value)}
            disabled={pending}
            placeholder="Maxime at Acme AI"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
      </div>

      {state.kind === "error" ? (
        <p className="text-xs text-destructive">{state.message}</p>
      ) : null}
      {state.kind === "sent" ? (
        <p className="text-xs text-emerald-700 dark:text-emerald-400">
          ✓ Magic link sent to <strong>{state.sentTo}</strong>. The link
          expires in 15 minutes.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleSend}
          disabled={pending || !email}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground px-4 text-xs font-semibold text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Mail className="size-3.5" />
          {pending ? "Sending…" : "Send invite"}
        </button>
        <button
          type="button"
          onClick={handleCopyLink}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted/50"
        >
          <Copy className="size-3.5" />
          {copyState === "copied" ? "Copied ✓" : "Copy operator portal URL"}
        </button>
      </div>

      <div
        className="rounded-md border border-dashed px-3 py-2 text-[11px] text-muted-foreground"
      >
        <span className="font-mono break-all">{portalLoginUrl}</span>
      </div>
    </div>
  );
}

function humanizeReason(reason: string): string {
  switch (reason) {
    case "missing_required_field":
      return "Email is required.";
    case "email_send_failed":
      return "We couldn't send the invite. Please try again in a moment.";
    default:
      return reason;
  }
}
