"use client";

// 2026-05-17 — Minimal custom-fields editor for /settings/fields.
// Was a 19-line read-only display before; operators can now add /
// rename / remove the suggested fields that appear on contact + deal
// records (and pre-populate the suggested intake form). Persists via
// saveSuggestedFieldsAction → soul.suggestedFields.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SoulField } from "@/lib/soul/types";
import { saveSuggestedFieldsAction } from "@/lib/soul/actions";

const FIELD_TYPES = ["text", "number", "email", "phone", "select", "textarea"] as const;

type Tab = "contact" | "deal";

export function FieldsEditor({
  initialContactFields,
  initialDealFields,
}: {
  initialContactFields: SoulField[];
  initialDealFields: SoulField[];
}) {
  const [tab, setTab] = useState<Tab>("contact");
  const [contact, setContact] = useState<SoulField[]>(initialContactFields);
  const [deal, setDeal] = useState<SoulField[]>(initialDealFields);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const router = useRouter();

  const rows = tab === "contact" ? contact : deal;
  const setRows = (next: SoulField[]) => {
    if (tab === "contact") setContact(next);
    else setDeal(next);
  };

  const update = (idx: number, patch: Partial<SoulField>) => {
    setRows(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveSuggestedFieldsAction({ contact, deal });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    });
  };

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">
          Custom Fields
        </h1>
        <p className="text-sm text-muted-foreground">
          Workspace-specific fields shown on contact and deal records, and
          used as starting points for intake forms.
        </p>
      </div>

      <div className="inline-flex rounded-xl border border-border/80 bg-card p-1 shadow-(--shadow-xs)">
        {(["contact", "deal"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`crm-pressable inline-flex h-8 items-center rounded-md px-3 text-xs font-medium capitalize transition-colors duration-150 ease-out ${
              tab === t
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {t} fields
          </button>
        ))}
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No {tab} fields yet.</p>
        ) : null}
        {rows.map((field, idx) => (
          <div
            key={idx}
            className="grid gap-2 rounded-md border bg-background p-3 sm:grid-cols-[1.2fr_1.4fr_1fr_auto]"
          >
            <input
              type="text"
              value={field.key}
              onChange={(e) => update(idx, { key: e.target.value })}
              placeholder="key (snake_case)"
              className="rounded border bg-background px-2 py-1 font-mono text-xs focus:border-primary focus:outline-none"
            />
            <input
              type="text"
              value={field.label}
              onChange={(e) => update(idx, { label: e.target.value })}
              placeholder="Display label"
              className="rounded border bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none"
            />
            <select
              value={field.type}
              onChange={(e) => update(idx, { type: e.target.value })}
              className="rounded border bg-background px-2 py-1 text-sm focus:border-primary focus:outline-none"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setRows(rows.filter((_, i) => i !== idx))}
              className="text-xs text-rose-600 hover:underline"
            >
              Remove
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() =>
            setRows([...rows, { key: "", label: "", type: "text" }])
          }
          className="crm-button-secondary h-9 px-3 text-sm"
        >
          + Add field
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="crm-button-primary h-10 px-5 text-sm"
        >
          {isPending ? "Saving…" : "Save changes"}
        </button>
        {savedAt ? (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">
            ✓ Saved
          </span>
        ) : null}
        {error ? (
          <span className="text-xs text-rose-600">Error: {error}</span>
        ) : null}
      </div>
    </section>
  );
}
