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
import { Phone, Pause, Loader2, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import {
  activateDeploymentAction,
  pauseDeploymentAction,
  provisionDeploymentNumberAction,
} from "@/lib/deployments/actions";
import { deriveAreaCode } from "@/lib/deployments/margin";

type ProvisionErrorCode =
  | "unauthorized"
  | "not_found"
  | "invalid_area_code"
  | "needs_telephony"
  | "no_numbers_available"
  | "provisioning_unavailable"
  | "attach_failed"
  | "deployment_not_found";

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
        setActiveNumber(result.phoneNumber);
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
              to your voice agent automatically.
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
