"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Copy, Lock, Mail, ShieldCheck, Sparkles } from "lucide-react";
import {
  sendPortalInviteAction,
  setContactPortalAccessAction,
} from "@/lib/portal/admin-actions";

/**
 * May 1, 2026 — Client Portal V1: Operator-side toggle.
 *
 * Lives in the aside of the contact record's Overview tab. Lets the
 * operator:
 *   - Flip portalAccessEnabled on/off (gated to Growth/Scale plans)
 *   - Send a magic-code invite email (reuses requestPortalAccessCodeAction)
 *   - Copy the public portal login URL for the workspace
 *
 * Plan gate is server-resolved and passed in as `planAllowed`. When
 * false we render a disabled toggle + an upgrade callout instead of
 * the normal controls. Disabling is always allowed regardless of plan
 * (so an operator who downgraded can still revoke portal access).
 */

export interface PortalAccessCardProps {
  contactId: string;
  contactEmail: string | null;
  orgId: string;
  orgSlug: string | null;
  initialEnabled: boolean;
  lastLoginAt: string | null;
  /** Server-resolved: false on Free tier, true on Growth/Scale. */
  planAllowed: boolean;
  /** Operator-facing message when planAllowed === false. */
  planReason?: string | null;
  /**
   * Public URL origin to use when building the portal login link
   * (e.g. https://app.seldonframe.com). Falls back to window.location
   * if not provided so we still work in dev / preview.
   */
  appOrigin?: string | null;
}

function relativeFromNow(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return null;
  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

export function PortalAccessCard({
  contactId,
  contactEmail,
  orgId,
  orgSlug,
  initialEnabled,
  lastLoginAt,
  planAllowed,
  planReason,
  appOrigin,
}: PortalAccessCardProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();
  const [inviteState, setInviteState] = useState<
    | { kind: "idle" }
    | { kind: "sending" }
    | { kind: "sent" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [error, setError] = useState<string | null>(null);

  const lastSeen = relativeFromNow(lastLoginAt);

  // Free-tier: render the disabled, upgrade-CTA variant. Operators
  // who already had it enabled (e.g. downgraded from Growth) keep
  // the disable affordance so they can revoke.
  const togglePermitted = planAllowed || enabled;

  function buildPortalLoginUrl() {
    if (!orgSlug) return null;
    const origin =
      (appOrigin && appOrigin.trim()) ||
      (typeof window !== "undefined" ? window.location.origin : "");
    if (!origin) return null;
    return `${origin}/portal/${orgSlug}/login`;
  }

  function handleToggle(next: boolean) {
    if (!togglePermitted && next) return;
    setError(null);
    // Optimistic — flip locally, revert on server error.
    setEnabled(next);
    startTransition(async () => {
      const res = await setContactPortalAccessAction({
        orgId,
        contactId,
        enabled: next,
      });
      if (!res.ok) {
        setEnabled(!next);
        setError(humanizeReason(res.reason));
      }
    });
  }

  function handleSendInvite() {
    if (!orgSlug || !contactEmail) {
      setInviteState({
        kind: "error",
        message: !orgSlug
          ? "Workspace slug missing"
          : "Add an email to this contact to send an invite",
      });
      return;
    }
    setInviteState({ kind: "sending" });
    startTransition(async () => {
      const res = await sendPortalInviteAction({
        orgSlug,
        email: contactEmail,
      });
      if (res.ok) {
        setInviteState({ kind: "sent" });
        // Reset the visual confirmation after a few seconds.
        setTimeout(() => setInviteState({ kind: "idle" }), 4000);
      } else {
        setInviteState({
          kind: "error",
          message: humanizeReason(res.reason),
        });
      }
    });
  }

  async function handleCopyLink() {
    const url = buildPortalLoginUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      // Older browsers — fall back to a transient prompt the operator
      // can manually copy from. Better than silent failure.
      window.prompt("Copy the portal link:", url);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-5">
      <header className="flex items-center justify-between gap-2 pb-3 border-b">
        <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <ShieldCheck className="size-3.5 text-muted-foreground" />
          Portal access
        </h3>
        <ToggleSwitch
          checked={enabled}
          disabled={pending || !togglePermitted}
          onChange={handleToggle}
          label="Toggle portal access"
        />
      </header>

      <div className="mt-3 space-y-2.5 text-xs">
        {!planAllowed ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
            <div className="space-y-1.5">
              <p className="font-medium text-foreground">
                Client portal is a Growth or Scale feature
              </p>
              <p className="text-muted-foreground">
                {planReason ??
                  "Upgrade your workspace to let clients log in to their own portal."}
              </p>
              <a
                href="/settings/billing"
                className="inline-flex items-center gap-1 font-medium text-amber-700 underline-offset-4 hover:underline dark:text-amber-400"
              >
                View billing →
              </a>
            </div>
          </div>
        ) : enabled ? (
          <p className="text-muted-foreground">
            <CheckCircle2 className="mr-1 inline size-3 text-emerald-600" />
            This client can sign in to{" "}
            {orgSlug ? (
              <span className="font-mono text-[11px] text-foreground">
                /portal/{orgSlug}
              </span>
            ) : (
              "their portal"
            )}
            .
          </p>
        ) : (
          <p className="text-muted-foreground">
            <Lock className="mr-1 inline size-3" />
            Portal access disabled. Toggle on to invite this client.
          </p>
        )}

        {lastSeen ? (
          <p className="text-muted-foreground">Last seen: {lastSeen}</p>
        ) : null}

        {error ? <p className="text-destructive">{error}</p> : null}
      </div>

      {planAllowed && enabled ? (
        <div className="mt-3 flex flex-col gap-1.5 border-t pt-3">
          <button
            type="button"
            disabled={pending || inviteState.kind === "sending" || !contactEmail}
            onClick={handleSendInvite}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Mail className="size-3.5" />
            {inviteState.kind === "sending"
              ? "Sending…"
              : inviteState.kind === "sent"
                ? "Invite sent ✓"
                : "Send invite email"}
          </button>
          <button
            type="button"
            disabled={!orgSlug}
            onClick={handleCopyLink}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Copy className="size-3.5" />
            {copyState === "copied" ? "Copied ✓" : "Copy portal link"}
          </button>
          {inviteState.kind === "error" ? (
            <p className="text-[11px] text-destructive">{inviteState.message}</p>
          ) : null}
          {!contactEmail ? (
            <p className="text-[11px] text-muted-foreground">
              Add an email to this contact to enable invites.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function humanizeReason(reason: string): string {
  switch (reason) {
    case "unauthorized":
      return "You don't have permission to do that.";
    case "org_not_found":
      return "Workspace not found.";
    case "contact_not_found":
      return "Contact not found.";
    case "missing_email":
      return "This contact needs an email to receive an invite.";
    case "plan_gate_denied":
      return "Client portal is a Growth or Scale feature.";
    default:
      // Pass server-supplied messages straight through when they're
      // already human-readable (the plan-gate helper returns full
      // sentences for the upgrade nudge).
      return reason;
  }
}

/* ───────────────────────── toggle switch ───────────────────────── */

function ToggleSwitch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 " +
        (checked ? "bg-primary" : "bg-muted")
      }
    >
      <span
        className={
          "inline-block size-4 transform rounded-full bg-background shadow-sm transition-transform " +
          (checked ? "translate-x-4" : "translate-x-0.5")
        }
      />
    </button>
  );
}
