// Per-sub-account usage meter (2026-07-08) — Task 3: the cap editor + breach
// banner.
//
// Spec: docs/superpowers/specs/2026-07-08-subaccount-usage-meter-design.md (D4, D5).
// Plan: docs/superpowers/plans/2026-07-08-subaccount-usage-meter.md (Task 3).
//
// "use client" — mirrors BookingPolicyEditor's shape (controlled field state
// + useTransition + a transient "Saved ✓" flash), collapsed by default behind
// a small toggle so it doesn't clutter the client card for agencies that never
// set a cap. Seeded with the parsed EFFECTIVE cap (or blank/unset).

"use client";

import { useState, useTransition, useEffect } from "react";
import { Check, Loader2, Gauge, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { setSubAccountUsageCapAction } from "@/lib/deployments/actions";
import type { UsageCap } from "@/lib/billing/usage-cap";

/** The breach banner — shown on the client card when the resolved cap is
 *  breached this period (spec D5). Pure presentation; the caller (page.tsx)
 *  computes breach via evaluateUsageCap server-side. */
export function UsageCapBreachBanner({
  estCostCents,
  capCents,
  mode,
}: {
  estCostCents: number;
  capCents: number;
  mode: "notify" | "pause";
}) {
  const estDollars = (estCostCents / 100).toFixed(2);
  const capDollars = (capCents / 100).toFixed(2);
  return (
    <div className="mx-5 mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-400">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <p>
        Usage cap reached — ~${estDollars} of ${capDollars} estimated this month.{" "}
        {mode === "pause"
          ? "The agent is sending a holding reply until the cap is raised."
          : "This is a notify-only cap; the agent keeps responding."}
      </p>
    </div>
  );
}

type UsageCapEditorProps = {
  clientOrgId: string;
  /** The currently-set cap, or null when unset. */
  initial: UsageCap | null;
};

export function UsageCapEditor({ clientOrgId, initial }: UsageCapEditorProps) {
  const [open, setOpen] = useState(false);
  const [capDollars, setCapDollars] = useState(
    initial ? (initial.monthlyEstCostCentsCap / 100).toFixed(2) : "",
  );
  const [mode, setMode] = useState<"notify" | "pause">(initial?.mode ?? "notify");
  const [isSaving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  const trimmed = capDollars.trim();
  const parsedDollars = Number(trimmed);
  const isClearing = trimmed === "";
  const validAmount = isClearing || (Number.isFinite(parsedDollars) && parsedDollars >= 0);
  const canSave = validAmount && !isSaving;

  const save = () => {
    setError(null);
    setSaved(false);
    if (!canSave) return;

    startSave(async () => {
      const result = await setSubAccountUsageCapAction({
        clientOrgId,
        monthlyEstCostCentsCap: isClearing ? null : Math.round(parsedDollars * 100),
        mode,
      });
      if (result.ok) {
        setSaved(true);
      } else {
        setError(
          result.error === "unauthorized"
            ? "You don't have access to set a cap for this client."
            : result.error === "not_found"
              ? "Client not found."
              : result.error === "invalid_input"
                ? "Enter a valid dollar amount."
                : "Couldn't save the usage cap — try again.",
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
        <Gauge className="size-3.5" aria-hidden />
        Usage cap
        {initial && (
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
            ${(initial.monthlyEstCostCentsCap / 100).toFixed(0)}/mo
          </span>
        )}
        {open ? <ChevronUp className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-[11px] text-muted-foreground">
            Set a monthly estimated-AI-cost ceiling for this client. Notify emails you when it&apos;s
            crossed; pause additionally has the agent send a holding reply instead of calling the LLM
            until the cap is raised. Costs are estimated — billed by your provider at their rates.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Monthly cap ($)
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                placeholder="No cap"
                value={capDollars}
                onChange={(e) => setCapDollars(e.target.value)}
                aria-invalid={!validAmount}
                className="crm-input h-8 w-32 text-sm"
              />
            </label>
            <div className="flex gap-1.5">
              {(["notify", "pause"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  disabled={isSaving}
                  className={`inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium capitalize transition-colors disabled:opacity-60 ${
                    mode === m
                      ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"
                      : "bg-background text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              className="crm-button-primary inline-flex h-8 items-center gap-1.5 px-3 text-xs disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save cap"
              )}
            </button>
            {saved && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <Check className="size-3.5" aria-hidden /> Saved
              </span>
            )}
          </div>
          {!validAmount && (
            <p className="text-[11px] text-rose-600 dark:text-rose-400">Enter a valid dollar amount, or leave blank to clear the cap.</p>
          )}
          {error && <p className="text-[11px] text-rose-600 dark:text-rose-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
