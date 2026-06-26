// ICP-3 Task 2.2 + Telephony Phase 2 — Activate / Pause affordance for a
// deployment card.
//
// "use client" — this component owns the inline form state + server-action
// calls. The parent page (page.tsx) is a Server Component; it passes the
// deployment id, current status, and (for the area-code default) the client's
// contact phone as props.
//
// draft → Activate, two paths:
//   PRIMARY  "Get a number": the builder enters a 3-digit area code and we
//     provision a REAL Twilio number in their account + attach it to their
//     voice SIP trunk (provisionDeploymentNumberAction → provisionVoiceNumber
//     state machine), then flip the deployment to Active and show the live
//     E.164. The area code defaults from the client's contact phone when one
//     is derivable.
//   SECONDARY "Use a number I already own": the original paste-a-number flow
//     (activateDeploymentAction) — collapsed by default.
//
// active → Pause: one-button confirm (no extra input needed).
//
// Mirror the card / button chrome from the Studio Agents screen — same
// crm-button-* classes, same muted text sizes.

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Phone, Pause, Loader2, ChevronDown, ChevronUp, Sparkles, KeyRound, Trash2, CalendarClock, Link2, Check, SlidersHorizontal, Send } from "lucide-react";
import {
  activateDeploymentAction,
  activateOutboundDeploymentAction,
  pauseDeploymentAction,
  provisionDeploymentNumberAction,
  cancelDeploymentAction,
  inviteClientToPortalAction,
} from "@/lib/deployments/actions";
import {
  startCalendarConnect,
  type CalendarToolkit,
} from "@/lib/deployments/connect-calendar";
import { deriveAreaCode } from "@/lib/deployments/margin";
import { BookingPolicyEditor } from "./booking-policy-editor";
import { DeploymentCustomizationEditor } from "./deployment-customization-editor";
import type { BookingPolicy } from "@/lib/agents/booking/booking-policy";
import type { DeploymentCustomization } from "@/lib/agents/persona/deployment-customization";

type ProvisionErrorCode =
  | "unauthorized"
  | "not_found"
  | "invalid_area_code"
  | "needs_telephony"
  | "no_numbers_available"
  | "provisioning_unavailable"
  | "attach_failed"
  | "deployment_not_found"
  | "phone_in_use";

// ─── ActivateForm ─────────────────────────────────────────────────────────────

type ActivateFormProps = {
  deploymentId: string;
  /** The client's contact phone, if any — used to pre-fill the area code. */
  contactPhone?: string | null;
};

export function ActivateForm({ deploymentId, contactPhone }: ActivateFormProps) {
  const [open, setOpen] = useState(false);
  // PRIMARY: provision a new number.
  const [areaCode, setAreaCode] = useState(() => deriveAreaCode(contactPhone) ?? "");
  const [provisionError, setProvisionError] = useState<ProvisionErrorCode | null>(null);
  const [isProvisioning, startProvision] = useTransition();
  // Live number after a successful provision.
  const [activeNumber, setActiveNumber] = useState<string | null>(null);

  // SECONDARY: paste a number you already own (collapsed).
  const [ownOpen, setOwnOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [isActivating, startActivate] = useTransition();
  const [activated, setActivated] = useState(false);

  function handleProvision(e: React.FormEvent) {
    e.preventDefault();
    setProvisionError(null);
    startProvision(async () => {
      const result = await provisionDeploymentNumberAction({
        deploymentId,
        areaCode: areaCode.trim(),
      });
      if (result.ok) {
        // Inbound get-a-number returns a live phoneNumber; the outbound branch
        // (this form isn't shown for outbound agents, but the action's union
        // includes it) activates with no number — just mark it activated.
        if ("phoneNumber" in result) {
          setActiveNumber(result.phoneNumber);
        } else {
          setActivated(true);
        }
        setOpen(false);
      } else {
        setProvisionError(result.error);
      }
    });
  }

  function handlePaste(e: React.FormEvent) {
    e.preventDefault();
    setPasteError(null);
    startActivate(async () => {
      const result = await activateDeploymentAction({ deploymentId, phoneNumber: phone.trim() });
      if (result.ok) {
        setActivated(true);
        setOpen(false);
      } else {
        setPasteError(
          result.error === "invalid_phone"
            ? "Enter a valid E.164 number — e.g. +15125550148."
            : result.error === "phone_in_use"
              ? "That number is already assigned to another deployment."
              : result.error === "not_found"
                ? "Deployment not found."
                : "Activation failed. Please try again.",
        );
      }
    });
  }

  // ── success: provisioned a live number ──────────────────────────────
  if (activeNumber) {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="rounded-full bg-emerald-500/15 px-3 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
          active
        </span>
        <p className="text-[11px] text-muted-foreground">
          <Phone className="mb-0.5 mr-0.5 inline size-3" />
          {activeNumber}
        </p>
      </div>
    );
  }

  // ── success: activated with a pasted number ─────────────────────────
  if (activated) {
    return (
      <span className="rounded-full bg-emerald-500/15 px-3 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
        activated
      </span>
    );
  }

  const areaCodeValid = /^[2-9]\d{2}$/.test(areaCode.trim());

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="crm-button-primary flex h-8 items-center gap-1.5 px-3 text-sm"
      >
        <Phone className="size-3.5" />
        Activate
        {open ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
      </button>

      {open && (
        <div className="mt-1 flex w-full max-w-sm flex-col gap-3 rounded-xl border bg-card p-4">
          {/* ── PRIMARY: Get a number ───────────────────────────────── */}
          <form onSubmit={handleProvision} className="flex flex-col gap-2">
            <label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Sparkles className="size-3 text-indigo-500 dark:text-indigo-400" />
              Get a number
            </label>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              We&apos;ll buy a local number in your Twilio account and connect it
              to your voice agent automatically. Need to connect Twilio first?{" "}
              <Link
                href="/settings/integrations"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                Open Settings → Integrations
              </Link>
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={3}
                placeholder="512"
                aria-label="Area code"
                value={areaCode}
                onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
                className="crm-input h-8 w-20 text-sm"
                disabled={isProvisioning}
                autoFocus
              />
              <button
                type="submit"
                disabled={isProvisioning || !areaCodeValid}
                className="crm-button-primary inline-flex h-8 flex-1 items-center justify-center gap-1.5 px-3 text-sm disabled:opacity-50"
              >
                {isProvisioning ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Provisioning your number…
                  </>
                ) : (
                  "Get a number"
                )}
              </button>
            </div>
            {provisionError && (
              <p className="text-[11px] text-rose-600 dark:text-rose-400">
                {provisionErrorCopy(provisionError)}
                {provisionError === "needs_telephony" && (
                  <>
                    {" "}
                    <Link
                      href="/settings/integrations"
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      Open Settings
                    </Link>
                  </>
                )}
              </p>
            )}
          </form>

          {/* ── SECONDARY: Use a number I already own (collapsed) ────── */}
          <div className="border-t pt-2">
            <button
              type="button"
              onClick={() => setOwnOpen((v) => !v)}
              className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              {ownOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
              Use a number I already own
            </button>

            {ownOpen && (
              <form onSubmit={handlePaste} className="mt-2 flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="+15125550148"
                    aria-label="Your Twilio number (E.164)"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="crm-input h-8 flex-1 text-sm"
                    disabled={isActivating}
                  />
                  <button
                    type="submit"
                    disabled={isActivating || phone.trim().length < 8}
                    className="crm-button-secondary h-8 px-3 text-sm disabled:opacity-50"
                  >
                    {isActivating ? <Loader2 className="size-3.5 animate-spin" /> : "Use it"}
                  </button>
                </div>
                {pasteError && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400">{pasteError}</p>
                )}
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Point the number&apos;s inbound voice webhook at your SeldonFrame
                  SIP trunk after activating.
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Map a provision-action error code to operator-facing copy. */
function provisionErrorCopy(error: ProvisionErrorCode): string {
  switch (error) {
    case "no_numbers_available":
      return "No numbers free in that area code — try another.";
    case "phone_in_use":
      return "That number is already assigned to another client.";
    case "needs_telephony":
      return "Connect Twilio and set your voice trunk in Settings.";
    case "invalid_area_code":
      return "Enter a 3-digit area code — e.g. 512.";
    case "attach_failed":
    case "provisioning_unavailable":
      return "Couldn't set that up — retry.";
    case "not_found":
    case "deployment_not_found":
      return "Deployment not found.";
    case "unauthorized":
      return "You don't have access to this deployment.";
    default:
      return "Couldn't set that up — retry.";
  }
}

// ─── ActivateOutboundButton ─────────────────────────────────────────────────────
//
// Activate an OUTBOUND agent (event/schedule — review-requester, speed-to-lead,
// digests). These never RECEIVE on a phone; they only SEND, from the CLIENT's
// EXISTING number (sendSmsFromApi, keyed by the client org), so there's no
// get-a-number step and no phone-required input — just a one-click activate. The
// page renders THIS instead of <ActivateForm> when the deployment's agent is
// outbound, so the operator never sees (and can never trip) the phone flow that
// would otherwise collide with the client's receptionist number.

type ActivateOutboundButtonProps = {
  deploymentId: string;
};

export function ActivateOutboundButton({ deploymentId }: ActivateOutboundButtonProps) {
  const [activated, setActivated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleActivate() {
    setError(null);
    startTransition(async () => {
      const result = await activateOutboundDeploymentAction({ deploymentId });
      if (result.ok) {
        setActivated(true);
      } else {
        setError(
          result.error === "needs_phone"
            ? "This agent needs its own number — use the phone activation."
            : result.error === "not_found"
              ? "Deployment not found."
              : "Couldn't activate — please try again.",
        );
      }
    });
  }

  if (activated) {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="rounded-full bg-emerald-500/15 px-3 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
          active
        </span>
        <p className="text-[11px] text-muted-foreground">
          <Send className="mb-0.5 mr-0.5 inline size-3" />
          Sends from the client&apos;s number
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleActivate}
        disabled={isPending}
        title="Activate — this agent sends from the client's existing number"
        className="crm-button-primary flex h-8 items-center gap-1.5 px-3 text-sm disabled:opacity-50"
      >
        {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
        Activate
      </button>
      <p className="max-w-[14rem] text-right text-[11px] text-muted-foreground">
        No number needed — sends from the client&apos;s existing number.
      </p>
      {error && (
        <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p>
      )}
    </div>
  );
}

// ─── PauseButton ──────────────────────────────────────────────────────────────

type PauseButtonProps = {
  deploymentId: string;
  phoneNumber: string | null;
};

export function PauseButton({ deploymentId, phoneNumber }: PauseButtonProps) {
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handlePause() {
    setError(null);
    startTransition(async () => {
      const result = await pauseDeploymentAction({ deploymentId });
      if (result.ok) {
        setPaused(true);
      } else {
        setError("Failed to pause. Please try again.");
      }
    });
  }

  if (paused) {
    return (
      <span className="rounded-full bg-amber-500/15 px-3 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
        paused
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {phoneNumber && (
        <p className="text-[11px] text-muted-foreground">
          <Phone className="mb-0.5 mr-0.5 inline size-3" />
          {phoneNumber}
        </p>
      )}
      <button
        type="button"
        onClick={handlePause}
        disabled={isPending}
        className="crm-button-secondary flex h-8 items-center gap-1.5 px-3 text-sm disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Pause className="size-3.5" />
        )}
        Pause
      </button>
      {error && (
        <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p>
      )}
    </div>
  );
}

// ─── CancelButton ─────────────────────────────────────────────────────────────
//
// Cancel a deployment (active OR paused) and RELEASE its number. For a
// SeldonFrame-provisioned number this frees it from the builder's Twilio account
// (so they stop paying for it AND can reuse it on another client); BYO numbers
// are left untouched. Confirms first — cancel is not reversible. Wraps the
// already-built cancelDeploymentAction (release-on-cancel + client-org archive).

type CancelButtonProps = {
  deploymentId: string;
  /** Shown in the confirm copy so the operator knows which number gets freed. */
  phoneNumber: string | null;
};

export function CancelButton({ deploymentId, phoneNumber }: CancelButtonProps) {
  const [canceled, setCanceled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCancel() {
    const msg = phoneNumber
      ? `Cancel this client and release ${phoneNumber}? The number is freed from your Twilio account and can be reused. This can't be undone.`
      : "Cancel this client deployment? This can't be undone.";
    if (typeof window !== "undefined" && !window.confirm(msg)) return;
    setError(null);
    startTransition(async () => {
      const result = await cancelDeploymentAction({ deploymentId });
      if (result.ok) {
        setCanceled(true);
      } else {
        setError("Couldn't cancel — please try again.");
      }
    });
  }

  if (canceled) {
    return (
      <span className="rounded-full bg-muted px-3 py-0.5 text-[11px] font-medium text-muted-foreground">
        canceled
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleCancel}
        disabled={isPending}
        title={
          phoneNumber
            ? "Cancel this client and release its number"
            : "Cancel this client deployment"
        }
        className="crm-button-secondary flex h-8 items-center gap-1.5 px-3 text-sm text-rose-600 disabled:opacity-50 dark:text-rose-400"
      >
        {isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Trash2 className="size-3.5" />
        )}
        {phoneNumber ? "Cancel & release" : "Cancel"}
      </button>
      {error && (
        <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p>
      )}
    </div>
  );
}

// ─── ConnectCalendarButton ─────────────────────────────────────────────────────
//
// ICP-3 "pluggable booking backend" Task 10 — bind an `api_mcp` deployment's
// calendarRef from the Clients card. Shown ONLY for bookingMode === 'api_mcp'
// (see page.tsx); native / external_link bookings never render it.
//
//   not connected → pick a toolkit (Google / Outlook), then "Connect calendar":
//     startCalendarConnect returns a Composio OAuth URL the AGENCY follows
//     (window.location) — OR "Copy link" to send the client so they authorize
//     their OWN calendar. The callback persists calendarRef + bounces back to
//     /studio/clients?calendar=connected|error.
//   connected (calendarRef.accountId set) → a static emerald pill, no button.
//
// Same chrome as the rest of this file: crm-button-* classes, useTransition,
// inline error/success copy.

/** The toolkit options offered (catalog slugs from connect-calendar.ts). */
const CALENDAR_TOOLKIT_OPTIONS: Array<{ id: CalendarToolkit; label: string }> = [
  { id: "googlecalendar", label: "Google" },
  { id: "outlook", label: "Outlook" },
];

/** Map a startCalendarConnect error code to operator-facing copy. Pure.
 *  `no_client_org` is RETAINED in the union for type-compat with
 *  StartCalendarConnectResult, but the agency-key/per-deployment-entity connect
 *  no longer requires a client workspace, so the action never returns it. */
export function connectCalendarErrorCopy(
  error: "unauthorized" | "not_found" | "no_client_org" | "invalid_toolkit" | "connect_failed",
): string {
  switch (error) {
    case "no_client_org":
      // Unreachable today (connect works without a client org); kept for the
      // exhaustive union. Generic retry copy rather than the old "not ready".
      return "Couldn't start the calendar connection — try again.";
    case "connect_failed":
      return "Couldn't start the calendar connection — try again.";
    case "invalid_toolkit":
      return "Pick Google or Outlook to connect.";
    case "not_found":
      return "Deployment not found.";
    case "unauthorized":
      return "You don't have access to this deployment.";
    default:
      return "Couldn't start the calendar connection — try again.";
  }
}

type ConnectCalendarButtonProps = {
  deploymentId: string;
  /** True once calendarRef.accountId is set — renders the connected pill. */
  connected: boolean;
};

export function ConnectCalendarButton({ deploymentId, connected }: ConnectCalendarButtonProps) {
  const [toolkit, setToolkit] = useState<CalendarToolkit>("googlecalendar");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Already bound — a static pill, no controls.
  if (connected) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
        <CalendarClock className="size-3" />
        Calendar connected
      </span>
    );
  }

  // Redirect the AGENCY through the OAuth flow.
  function handleConnect() {
    setError(null);
    setCopied(false);
    startTransition(async () => {
      const r = await startCalendarConnect({ deploymentId, toolkit });
      if (r.ok) {
        window.location.href = r.redirectUrl;
      } else {
        setError(connectCalendarErrorCopy(r.error));
      }
    });
  }

  // Generate the SAME OAuth link but copy it for the agency to send the client,
  // so the client can authorize their own calendar.
  function handleCopyLink() {
    setError(null);
    setCopied(false);
    startTransition(async () => {
      const r = await startCalendarConnect({ deploymentId, toolkit });
      if (!r.ok) {
        setError(connectCalendarErrorCopy(r.error));
        return;
      }
      try {
        await navigator.clipboard.writeText(r.redirectUrl);
        setCopied(true);
      } catch {
        // Clipboard blocked (no permission / insecure context) — show the link.
        setError(`Copy this link to send the client: ${r.redirectUrl}`);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-1.5">
        {/* Toolkit choice — two compact toggle buttons. */}
        <div className="inline-flex overflow-hidden rounded-md border" role="group" aria-label="Calendar provider">
          {CALENDAR_TOOLKIT_OPTIONS.map((opt) => {
            const active = opt.id === toolkit;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setToolkit(opt.id)}
                aria-pressed={active}
                disabled={isPending}
                className={`px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={handleConnect}
          disabled={isPending}
          title="Connect the client's calendar so the agent books into it"
          className="crm-button-primary flex h-8 items-center gap-1.5 px-3 text-sm disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <CalendarClock className="size-3.5" />
          )}
          Connect calendar
        </button>
      </div>
      <button
        type="button"
        onClick={handleCopyLink}
        disabled={isPending}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        {copied ? <Check className="size-3 text-emerald-600 dark:text-emerald-400" /> : <Link2 className="size-3" />}
        {copied ? "Link copied — send it to the client." : "Copy link to send to the client"}
      </button>
      {error && (
        <p className="max-w-[18rem] break-words text-right text-[11px] text-rose-600 dark:text-rose-400">{error}</p>
      )}
    </div>
  );
}

// ─── PortalInviteButton ────────────────────────────────────────────────────────
//
// Opt-in client portal access (front-office bridge). Disabled until the client
// workspace has been provisioned (clientOrgId set on the deployment). On success
// it surfaces the magic-link URL for the agency to send (the action generates
// the link; it isn't auto-emailed — mirrors the existing portal-invite route).
// Once invited, shows "Invited <date>" but re-invites are still allowed.

type PortalInviteButtonProps = {
  deploymentId: string;
  /** Provisioned client workspace id — gates the button (disabled until set). */
  clientOrgId: string | null;
  /** When the client was previously invited (ISO string) — null = never. */
  portalInvitedAt: string | null;
};

export function PortalInviteButton({
  deploymentId,
  clientOrgId,
  portalInvitedAt,
}: PortalInviteButtonProps) {
  const [invitedAt, setInvitedAt] = useState<string | null>(portalInvitedAt);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const provisioned = Boolean(clientOrgId);

  function handleInvite() {
    setError(null);
    setInviteUrl(null);
    startTransition(async () => {
      const result = await inviteClientToPortalAction({ deploymentId });
      if (result.ok) {
        setInviteUrl(result.inviteUrl);
        setInvitedAt(new Date().toISOString());
      } else {
        setError(
          result.error === "no_contact_email"
            ? "Add a client email first — there's no contact to invite."
            : result.error === "no_client_org"
              ? "The client workspace isn't ready yet."
              : "Couldn't create the invite. Please try again.",
        );
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleInvite}
        disabled={!provisioned || isPending}
        title={
          provisioned
            ? "Send the client a magic link into their portal"
            : "Available once the client workspace is provisioned"
        }
        className="crm-button-secondary flex h-8 items-center gap-1.5 px-3 text-sm disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <KeyRound className="size-3.5" />
        )}
        {invitedAt ? "Re-invite to portal" : "Give portal access"}
      </button>
      {invitedAt && !inviteUrl && (
        <p className="text-[11px] text-muted-foreground">
          Invited {new Date(invitedAt).toLocaleDateString()}
        </p>
      )}
      {inviteUrl && (
        <p className="max-w-[16rem] truncate text-[11px] text-emerald-700 dark:text-emerald-400">
          Magic link ready — send it to the client:{" "}
          <a href={inviteUrl} className="underline" target="_blank" rel="noreferrer">
            open
          </a>
        </p>
      )}
      {error && (
        <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p>
      )}
    </div>
  );
}

// ─── BookingRulesSection ───────────────────────────────────────────────────────
//
// A collapsible "Booking rules" panel wrapping the reusable BookingPolicyEditor,
// shown on a deployment card for every agent that BOOKS (native / api_mcp /
// cal_com). external_link is excluded by the caller (page.tsx) — that agent hands
// the booking off to the client's own page, so there are no rules to tune here.
//
// The panel is collapsed by default (these are advanced, rarely-touched knobs);
// the toggle button mirrors the file's other expandable controls (ChevronDown/Up
// + muted label chrome). The editor is seeded with the EFFECTIVE policy resolved
// server-side in page.tsx, so the operator sees the values actually in force.

type BookingRulesSectionProps = {
  deploymentId: string;
  /** The resolved effective policy (resolveBookingPolicy(...) from page.tsx). */
  initialPolicy: BookingPolicy;
};

export function BookingRulesSection({
  deploymentId,
  initialPolicy,
}: BookingRulesSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 border-t pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        <SlidersHorizontal className="size-3" aria-hidden />
        Booking rules
        {open ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
      </button>
      {open && (
        <div className="mt-3">
          <BookingPolicyEditor deploymentId={deploymentId} initial={initialPolicy} />
        </div>
      )}
    </div>
  );
}

// ─── CustomizationSection ──────────────────────────────────────────────────────
//
// A collapsible "Agent customization" panel wrapping the reusable
// DeploymentCustomizationEditor, shown on a deployment card for every agent that
// SPEAKS (a conversational surface — phone / embed / link). The text-only
// surfaces (sms / email) and non-conversational cases are excluded by the caller
// (page.tsx). Sits NEXT TO "Booking rules" and mirrors its chrome exactly:
// collapsed by default, the same ChevronDown/Up + muted label toggle. The editor
// is seeded with the deployment's stored `customization` (passed from page.tsx).

type CustomizationSectionProps = {
  deploymentId: string;
  /** The deployment's stored customization (sparse Partial) — null = no override
   *  yet (→ the template's defaults). */
  initial: Partial<DeploymentCustomization> | null;
};

export function CustomizationSection({
  deploymentId,
  initial,
}: CustomizationSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 border-t pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        <Sparkles className="size-3" aria-hidden />
        Agent customization
        {open ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
      </button>
      {open && (
        <div className="mt-3">
          <DeploymentCustomizationEditor deploymentId={deploymentId} initial={initial} />
        </div>
      )}
    </div>
  );
}
