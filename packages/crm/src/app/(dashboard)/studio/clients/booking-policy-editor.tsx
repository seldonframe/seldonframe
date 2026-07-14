// ICP-3 "per-client booking policy" Task 9 — the agency editing surface.
//
// A reusable, controlled editor for a deployment's BookingPolicy: the rules a
// deployed agent obeys when it books (slot length, buffer, lead time, daily cap,
// the PER-DAY business-hours windows, and the fields it must collect). The agency
// tunes these per-client from the Studio client card (activate-form.tsx renders
// it inside a collapsible "Booking rules" section).
//
// "use client" — owns the controlled field state + the save transition. Seeded
// with the EFFECTIVE policy (resolveBookingPolicy(...) computed server-side in
// page.tsx), so the operator sees the values actually in force, not a blank form.
// On Save it builds the policy object (with the per-day `hours` map) from local
// state and persists it verbatim via setBookingPolicyAction; the server resolver
// re-clamps any out-of-range stored value at read time, so light client-side
// validation is enough here.
//
// House chrome matches the rest of this folder: crm-button-* classes, the muted
// label/border styles from activate-form.tsx, useTransition, and the transient
// "Saved ✓" flash mirrored from the Composio toolkit picker in the agent editor
// (editor-client.tsx → ComposioAppsSection). NO new deps.

"use client";

import { useState, useTransition, useEffect } from "react";
import { Check, Loader2, CalendarClock } from "lucide-react";
import { setBookingPolicyAction } from "@/lib/deployments/actions";
import type {
  BookingPolicy,
  DayWindow,
} from "@/lib/agents/booking/booking-policy";

// The per-day rows are Sun..Sat → 0..6 (matches BookingPolicy.hours keys).
const WEEKDAYS: Array<{ idx: number; label: string }> = [
  { idx: 0, label: "Sun" },
  { idx: 1, label: "Mon" },
  { idx: 2, label: "Tue" },
  { idx: 3, label: "Wed" },
  { idx: 4, label: "Thu" },
  { idx: 5, label: "Fri" },
  { idx: 6, label: "Sat" },
];

// The default window seeded into a row when the operator OPENS a previously
// closed day (so the time inputs aren't blank). The resolver would clamp a bad
// window anyway; this just gives a sensible starting point.
const DEFAULT_OPEN_WINDOW: DayWindow = { start: "09:00", end: "17:00" };

/** One editable per-day row's state: open flag + its window times. Seeded from
 *  the resolved policy's `hours` (a day present → open with its window; a day
 *  absent → closed, pre-filled with the default window for when it's opened). */
type DayRowState = { open: boolean; start: string; end: string };

/** Seed the 7 per-day rows (idx 0..6) from a resolved policy's hours map. */
function seedDayRows(hours: BookingPolicy["hours"]): DayRowState[] {
  return WEEKDAYS.map((d) => {
    const w = hours[d.idx];
    return w
      ? { open: true, start: w.start, end: w.end }
      : { open: false, start: DEFAULT_OPEN_WINDOW.start, end: DEFAULT_OPEN_WINDOW.end };
  });
}

// The small known set of required-field chips. Any custom field already present
// in `initial.requiredFields` is preserved + rendered as its own chip too.
const KNOWN_REQUIRED_FIELDS = ["name", "phone", "email", "service", "address"];

type BookingPolicyEditorProps = {
  deploymentId: string;
  /** The resolved EFFECTIVE policy (deployment override ?? template ?? system
   *  defaults), computed server-side so the operator edits real values. */
  initial: BookingPolicy;
  /** Fired after a successful save (e.g. so the parent can refresh / close). */
  onSaved?: () => void;
};

export function BookingPolicyEditor({
  deploymentId,
  initial,
  onSaved,
}: BookingPolicyEditorProps) {
  // Numeric fields are edited as strings (text inputs) and coerced on save —
  // mirrors the quote-range UX in the agent editor + avoids NaN churn while
  // typing. maxPerDay blank = no cap (→ null).
  const [duration, setDuration] = useState(String(initial.durationMinutes));
  const [buffer, setBuffer] = useState(String(initial.bufferMinutes));
  const [leadTime, setLeadTime] = useState(String(initial.leadTimeHours));
  const [maxPerDay, setMaxPerDay] = useState(
    initial.maxPerDay == null ? "" : String(initial.maxPerDay),
  );
  // Per-day windows: one row per weekday (Sun..Sat), seeded from initial.hours.
  const [dayRows, setDayRows] = useState<DayRowState[]>(() =>
    seedDayRows(initial.hours),
  );
  // Union the known chips with any custom required fields already stored, so a
  // custom field is shown (and stays selected) rather than silently dropped.
  const [requiredFields, setRequiredFields] = useState<string[]>(
    initial.requiredFields,
  );

  const [isSaving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Flash a transient "Saved ✓" for ~2s after a successful save.
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  // The full chip set: known fields + any custom field present in the initial
  // policy (deduped, order-stable — known first, then extras).
  const chipFields = [
    ...KNOWN_REQUIRED_FIELDS,
    ...requiredFields.filter((f) => !KNOWN_REQUIRED_FIELDS.includes(f)),
  ];

  // Per-day row mutators. `patchDay` updates one weekday row in place; `toggleDay`
  // flips its open/closed flag (opening a blank day fills the default window).
  const patchDay = (idx: number, patch: Partial<DayRowState>) => {
    setDayRows((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)),
    );
  };
  const toggleDay = (idx: number) => {
    setDayRows((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, open: !row.open } : row)),
    );
  };

  const toggleField = (field: string) => {
    setRequiredFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field],
    );
  };

  // Light client-side validation: duration >= 1, and every OPEN day must have a
  // window with end > start. The server resolver canonicalizes everything else
  // (clamps buffer/lead, drops bad windows/days), so we only block the cases a
  // bad form could make confusing. A day that is open but has end<=start is the
  // one mistake we surface inline.
  const durationNum = Number(duration);
  const durationValid = Number.isFinite(durationNum) && durationNum >= 1;
  const invalidOpenDays = WEEKDAYS.filter(
    (d) => dayRows[d.idx]!.open && !(dayRows[d.idx]!.end > dayRows[d.idx]!.start),
  );
  const daysValid = invalidOpenDays.length === 0;
  const canSave = durationValid && daysValid && !isSaving;

  const save = () => {
    setError(null);
    setSaved(false);
    if (!canSave) return;

    // Build the per-day hours map from the open rows. Each open day with a valid
    // window contributes an entry; closed days are simply omitted (= closed). The
    // booking engine re-clamps on read, so a stray bad window can't break a call.
    const hours: BookingPolicy["hours"] = {};
    for (const d of WEEKDAYS) {
      const row = dayRows[d.idx]!;
      if (row.open && row.end > row.start) {
        hours[d.idx] = { start: row.start, end: row.end };
      }
    }

    // Build the sparse policy object from controlled state. Numbers are coerced;
    // an empty maxPerDay → null (no cap). The booking engine re-clamps on read.
    const maxNum = Number(maxPerDay);
    const policy: Partial<BookingPolicy> = {
      durationMinutes: Math.max(1, Math.round(durationNum)),
      bufferMinutes: Math.max(0, Math.round(Number(buffer) || 0)),
      leadTimeHours: Math.max(0, Number(leadTime) || 0),
      maxPerDay: maxPerDay.trim() === "" || !(maxNum > 0) ? null : Math.round(maxNum),
      hours,
      requiredFields,
    };

    startSave(async () => {
      const result = await setBookingPolicyAction({ deploymentId, policy });
      if (result.ok) {
        setSaved(true);
        onSaved?.();
      } else {
        setError(
          result.error === "unauthorized"
            ? "You don't have access to this client."
            : result.error === "not_found"
              ? "Client not found."
              : "Couldn't save the booking rules — try again.",
        );
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Numeric rules — duration / buffer / lead time / max per day */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NumberField
          label="Duration (min)"
          value={duration}
          onChange={setDuration}
          min={1}
          invalid={!durationValid}
        />
        <NumberField
          label="Buffer (min)"
          value={buffer}
          onChange={setBuffer}
          min={0}
        />
        <NumberField
          label="Lead time (hrs)"
          value={leadTime}
          onChange={setLeadTime}
          min={0}
        />
        <NumberField
          label="Max / day"
          value={maxPerDay}
          onChange={setMaxPerDay}
          min={0}
          placeholder="No cap"
        />
      </div>
      {!durationValid && (
        <p className="text-[11px] text-rose-600 dark:text-rose-400">
          Duration must be at least 1 minute.
        </p>
      )}

      {/* Per-day business hours — one row per weekday (Sun..Sat): an Open/Closed
          toggle + Start/End times (disabled when closed). A closed day is simply
          omitted from the saved `hours` map. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Hours the agent books
        </span>
        <div className="flex flex-col gap-1.5">
          {WEEKDAYS.map((d) => {
            const row = dayRows[d.idx]!;
            const rowInvalid = row.open && !(row.end > row.start);
            return (
              <div key={d.idx} className="flex flex-wrap items-center gap-2">
                {/* Open/Closed toggle — reuses the chip look from the field chips */}
                <button
                  type="button"
                  onClick={() => toggleDay(d.idx)}
                  aria-pressed={row.open}
                  disabled={isSaving}
                  className={`inline-flex h-8 w-24 items-center justify-center gap-1 rounded-md border text-xs font-medium transition-colors disabled:opacity-60 ${
                    row.open
                      ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"
                      : "bg-background text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <span className="w-8 text-left">{d.label}</span>
                  <span>{row.open ? "Open" : "Closed"}</span>
                </button>
                <input
                  type="time"
                  value={row.start}
                  onChange={(e) => patchDay(d.idx, { start: e.target.value })}
                  disabled={isSaving || !row.open}
                  aria-label={`${d.label} start time`}
                  aria-invalid={rowInvalid}
                  className="crm-input h-8 w-28 text-sm disabled:opacity-50"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <input
                  type="time"
                  value={row.end}
                  onChange={(e) => patchDay(d.idx, { end: e.target.value })}
                  disabled={isSaving || !row.open}
                  aria-label={`${d.label} end time`}
                  aria-invalid={rowInvalid}
                  className="crm-input h-8 w-28 text-sm disabled:opacity-50"
                />
                {rowInvalid && (
                  <span className="text-[11px] text-rose-600 dark:text-rose-400">
                    End must be after start
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Required fields — chip toggles (known set + any custom present) */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Required before booking
        </span>
        <div className="flex flex-wrap gap-1.5">
          {chipFields.map((field) => {
            const on = requiredFields.includes(field);
            return (
              <button
                key={field}
                type="button"
                onClick={() => toggleField(field)}
                aria-pressed={on}
                disabled={isSaving}
                className={`inline-flex items-center gap-1 rounded-[11px] border px-3 py-1 text-xs font-medium capitalize transition-colors disabled:opacity-60 ${
                  on
                    ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"
                    : "bg-background text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {on && <Check className="size-3" aria-hidden />}
                {field}
              </button>
            );
          })}
        </div>
      </div>

      {/* Save */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="crm-button-primary inline-flex h-9 items-center gap-1.5 px-4 text-sm disabled:opacity-50"
        >
          {isSaving ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <CalendarClock className="size-3.5" />
              Save booking rules
            </>
          )}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <Check className="size-3.5" aria-hidden /> Saved
          </span>
        )}
        {error && (
          <span className="text-xs text-rose-600 dark:text-rose-400">{error}</span>
        )}
      </div>
    </div>
  );
}

/** One compact labeled number input — the duration/buffer/lead/max cells. */
function NumberField({
  label,
  value,
  onChange,
  min,
  placeholder,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min: number;
  placeholder?: string;
  invalid?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid}
        className="crm-input h-8 w-full text-sm"
      />
    </label>
  );
}
