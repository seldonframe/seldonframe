// ICP-3 Task 2.2 — Activate / Pause affordance for a deployment card.
//
// "use client" — this component owns the inline form state + server-action
// calls. The parent page (page.tsx) is a Server Component; it passes the
// deployment id + current status as props.
//
// draft → Activate: builder enters their Twilio number in E.164 format.
//   On success: page revalidates (revalidatePath in the action) + a brief
//   success flash is shown.
//   Errors: 'invalid_phone' / 'phone_in_use' are shown inline below the input.
//   The form also shows a guidance note about pointing the number at
//   SeldonFrame's SIP trunk (the inbound-call→deployment wiring is task 2.3).
//
// active → Pause: one-button confirm (no extra input needed).
//
// Mirror the card / button chrome from the Studio Agents screen — same
// crm-button-* classes, same muted text sizes.

"use client";

import { useState, useTransition } from "react";
import { Phone, Pause, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { activateDeploymentAction, pauseDeploymentAction } from "@/lib/deployments/actions";

// ─── ActivateForm ─────────────────────────────────────────────────────────────

type ActivateFormProps = {
  deploymentId: string;
};

export function ActivateForm({ deploymentId }: ActivateFormProps) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await activateDeploymentAction({ deploymentId, phoneNumber: phone.trim() });
      if (result.ok) {
        setSuccess(true);
        setOpen(false);
      } else {
        setError(
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

  if (success) {
    return (
      <span className="rounded-full bg-emerald-500/15 px-3 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
        activated
      </span>
    );
  }

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
        <form
          onSubmit={handleSubmit}
          className="mt-1 flex w-full max-w-sm flex-col gap-2 rounded-xl border bg-card p-4"
        >
          <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Your Twilio number (E.164)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="+15125550148"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="crm-input h-8 flex-1 text-sm"
              disabled={isPending}
              autoFocus
            />
            <button
              type="submit"
              disabled={isPending || phone.trim().length < 8}
              className="crm-button-primary h-8 px-3 text-sm disabled:opacity-50"
            >
              {isPending ? <Loader2 className="size-3.5 animate-spin" /> : "Activate"}
            </button>
          </div>

          {error && (
            <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p>
          )}

          {/* Guidance note — static copy. The actual inbound routing is task 2.3. */}
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Once activated, point this Twilio number&apos;s inbound voice
            webhook at SeldonFrame&apos;s SIP trunk. The exact URL will be shown
            here after activation.
          </p>
        </form>
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
