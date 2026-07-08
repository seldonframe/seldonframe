// Autopay console (2026-07-08) — Task 2: the "Billing & retainer" collapsible
// editor on the /studio/clients client card. Mirrors UsageCapEditor's shape
// (controlled field state + useTransition + a transient "Saved ✓" flash),
// collapsed by default. Flag-gated: only rendered when SF_AUTOPAY_CONSOLE is
// on (the page.tsx caller checks the flag before mounting this at all).
//
// Status (none / pending-link / active / past_due / canceled) is passed in
// as a prop, ALREADY derived server-side via deriveRetainerStatus — this
// component never calls Stripe and never guesses status from local state.

"use client";

import { useState, useTransition, useEffect } from "react";
import { Check, Loader2, CreditCard, ChevronDown, ChevronUp } from "lucide-react";
import {
  createRetainerCheckoutLinkAction,
  sendRetainerLinkAction,
  cancelRetainerAction,
} from "@/lib/payments/retainer-actions";
import type { RetainerStatus } from "@/lib/payments/retainer";

const STATUS_LABEL: Record<RetainerStatus, string> = {
  none: "No retainer",
  active: "Active",
  past_due: "Past due",
  canceled: "Canceled",
};

const STATUS_CLASS: Record<RetainerStatus, string> = {
  none: "bg-muted text-muted-foreground",
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  past_due: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  canceled: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

type BillingRetainerEditorProps = {
  clientOrgId: string;
  status: RetainerStatus;
  /** Prefilled from the client's known contact, if one exists — the operator
   *  can still edit before sending. */
  defaultEmail?: string;
  defaultName?: string;
};

export function BillingRetainerEditor({
  clientOrgId,
  status,
  defaultEmail = "",
  defaultName = "",
}: BillingRetainerEditorProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail);
  const [name, setName] = useState(defaultName);
  const [monthlyDollars, setMonthlyDollars] = useState("");
  const [setupDollars, setSetupDollars] = useState("");
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [isCreating, startCreate] = useTransition();
  const [isSending, startSend] = useTransition();
  const [isCanceling, startCancel] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(t);
  }, [saved]);

  const monthly = Number(monthlyDollars.trim());
  const validMonthly = Number.isFinite(monthly) && monthly > 0;
  const validEmail = email.trim().length > 0 && name.trim().length > 0;

  const createLink = () => {
    setError(null);
    if (!validMonthly || !validEmail) {
      setError("Enter the client's name, email, and a monthly amount.");
      return;
    }
    startCreate(async () => {
      const setup = setupDollars.trim() ? Number(setupDollars.trim()) : undefined;
      const result = await createRetainerCheckoutLinkAction({
        clientOrgId,
        contactEmail: email.trim(),
        contactName: name.trim(),
        monthlyPriceCents: Math.round(monthly * 100),
        setupFeeCents: setup !== undefined && Number.isFinite(setup) ? Math.round(setup * 100) : undefined,
      });
      if (result.ok) {
        setCheckoutUrl(result.checkoutUrl);
      } else {
        setError(
          result.error === "stripe_not_connected"
            ? "Connect a Stripe account before setting up a retainer."
            : "Couldn't create the checkout link — try again.",
        );
      }
    });
  };

  const sendLink = () => {
    if (!checkoutUrl) return;
    setError(null);
    startSend(async () => {
      const result = await sendRetainerLinkAction({
        clientOrgId,
        contactEmail: email.trim(),
        contactName: name.trim(),
        checkoutUrl,
      });
      if (result.ok) {
        setSaved(true);
      } else {
        setError("Couldn't send the link — copy it and send manually.");
      }
    });
  };

  const cancel = () => {
    setError(null);
    startCancel(async () => {
      const result = await cancelRetainerAction({ clientOrgId });
      if (!result.ok) {
        setError(
          result.error === "no_active_subscription"
            ? "No active retainer to cancel."
            : "Couldn't cancel the retainer — try again.",
        );
      }
    });
  };

  return (
    <div className="border-t border-border px-5 py-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="crm-pressable inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
      >
        <CreditCard className="size-3.5" aria-hidden />
        Billing &amp; retainer
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[status]}`}>
          {STATUS_LABEL[status]}
        </span>
        {open ? <ChevronUp className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-[11px] text-muted-foreground">
            Set up an automatic monthly retainer for this client — a checkout link they open once to put a
            card on file, then it bills every month on its own.
          </p>

          {status === "active" || status === "past_due" ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancel}
                disabled={isCanceling}
                className="crm-button inline-flex h-8 items-center gap-1.5 px-3 text-xs text-rose-600 disabled:opacity-50 dark:text-rose-400"
              >
                {isCanceling ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Cancel retainer
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Client name
                  </span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="crm-input h-8 w-40 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Client email
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="crm-input h-8 w-48 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Monthly ($)
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={monthlyDollars}
                    onChange={(e) => setMonthlyDollars(e.target.value)}
                    aria-invalid={!validMonthly}
                    className="crm-input h-8 w-24 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Setup fee ($)
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    placeholder="None"
                    value={setupDollars}
                    onChange={(e) => setSetupDollars(e.target.value)}
                    className="crm-input h-8 w-24 text-sm"
                  />
                </label>
                <button
                  type="button"
                  onClick={createLink}
                  disabled={isCreating}
                  className="crm-button-primary inline-flex h-8 items-center gap-1.5 px-3 text-xs disabled:opacity-50"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Creating…
                    </>
                  ) : (
                    "Create checkout link"
                  )}
                </button>
              </div>

              {checkoutUrl && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <code className="max-w-xs truncate text-[11px] text-muted-foreground">{checkoutUrl}</code>
                  <button
                    type="button"
                    onClick={sendLink}
                    disabled={isSending}
                    className="crm-button inline-flex h-7 items-center gap-1.5 px-2 text-xs disabled:opacity-50"
                  >
                    {isSending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    Email link to client
                  </button>
                  {saved && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      <Check className="size-3.5" aria-hidden /> Sent
                    </span>
                  )}
                </div>
              )}
            </>
          )}

          {error && <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
