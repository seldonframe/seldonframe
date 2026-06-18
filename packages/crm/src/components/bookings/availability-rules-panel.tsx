"use client";

// Workspace-level booking availability + rules panel.
//
// Renders BELOW the WeekCalendar on /bookings (before Appointment Types).
// It's the single workspace-wide business-hours + booking-rules config that
// the public slot generator reads (organizations.settings.booking + the
// organizations.timezone column).
//
// Server-fetched initial values (WorkspaceBookingRules + the org timezone)
// come in as props; on Save we call the "use server" action
// updateWorkspaceBookingRulesAction with a PLAIN object (not FormData) and
// reflect the returned, normalized rules back into local state so the form
// always shows exactly what was persisted.
//
// Visual chrome mirrors the "Working hours" grid in the Create-appointment-
// type sheet (bookings-page-content.tsx) for consistency: same crm-input /
// crm-button-primary classes, same per-day row layout. The on/off control is
// an accessible role="switch" toggle (labelled, keyboard-operable) instead of
// the sheet's <select>, per the panel spec.

import { useState, useTransition } from "react";
import type {
  AvailabilityDayKey,
  AvailabilitySchedule,
  WorkspaceBookingRules,
} from "@/lib/bookings/workspace-rules";
import { updateWorkspaceBookingRulesAction } from "@/lib/bookings/actions";

// Monday→Sunday for display; data keys remain sunday..saturday.
const DISPLAY_DAYS: { key: AvailabilityDayKey; label: string }[] = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
];

// Common North-American zones first, then a few global staples. The current
// workspace timezone is injected at render time if it isn't already here, so
// the <select> never silently drops the saved value.
const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: "America/New_York", label: "Eastern — New York" },
  { value: "America/Chicago", label: "Central — Chicago" },
  { value: "America/Denver", label: "Mountain — Denver" },
  { value: "America/Los_Angeles", label: "Pacific — Los Angeles" },
  { value: "America/Phoenix", label: "Mountain (no DST) — Phoenix" },
  { value: "America/Anchorage", label: "Alaska — Anchorage" },
  { value: "Pacific/Honolulu", label: "Hawaii — Honolulu" },
  { value: "America/Toronto", label: "Eastern — Toronto" },
  { value: "America/Vancouver", label: "Pacific — Vancouver" },
  { value: "UTC", label: "UTC" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "Australia/Sydney", label: "Sydney" },
];

const MIN_NOTICE_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "No minimum" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 240, label: "4 hours" },
  { value: 720, label: "12 hours" },
  { value: 1440, label: "1 day" },
  { value: 2880, label: "2 days" },
];

const DURATION_OPTIONS = [30, 45, 60, 90, 120, 150, 180];

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

type SaveState = "idle" | "saving" | "saved" | "error";

type AvailabilityRulesPanelProps = {
  /** Server-fetched initial rules (getWorkspaceBookingRules). */
  initialRules: WorkspaceBookingRules;
  /** Server-fetched workspace IANA timezone (organizations.timezone). */
  initialTimezone: string;
};

export function AvailabilityRulesPanel({
  initialRules,
  initialTimezone,
}: AvailabilityRulesPanelProps) {
  const [availability, setAvailability] = useState<AvailabilitySchedule>(
    initialRules.availability,
  );
  const [timezone, setTimezone] = useState(initialTimezone);
  const [minNotice, setMinNotice] = useState(initialRules.minNoticeMinutes);
  const [buffer, setBuffer] = useState(String(initialRules.defaultBufferMinutes));
  const [duration, setDuration] = useState(initialRules.defaultDurationMinutes);
  // Max-per-day is a free text/number input; "" or 0 means "No limit" (null).
  const [maxPerDay, setMaxPerDay] = useState(
    initialRules.maxBookingsPerDay == null ? "" : String(initialRules.maxBookingsPerDay),
  );

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [pending, startTransition] = useTransition();

  // Inject the saved timezone if it isn't one of the curated options so the
  // <select> can always pre-select it.
  const timezoneOptions = TIMEZONE_OPTIONS.some((tz) => tz.value === timezone)
    ? TIMEZONE_OPTIONS
    : [{ value: timezone, label: timezone }, ...TIMEZONE_OPTIONS];

  function updateDay(key: AvailabilityDayKey, patch: Partial<AvailabilitySchedule[AvailabilityDayKey]>) {
    setAvailability((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    if (saveState !== "idle") setSaveState("idle");
  }

  function markDirty() {
    if (saveState !== "idle") setSaveState("idle");
  }

  function handleSave() {
    setSaveState("saving");
    startTransition(async () => {
      try {
        const parsedMax = Number.parseInt(maxPerDay, 10);
        const result = await updateWorkspaceBookingRulesAction({
          availability,
          minNoticeMinutes: minNotice,
          defaultBufferMinutes: Number.parseInt(buffer, 10) || 0,
          defaultDurationMinutes: duration,
          // Empty or 0 => no limit (null).
          maxBookingsPerDay: Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : null,
          // Only send a timezone when the operator actually changed it.
          ...(timezone !== initialTimezone ? { timezone } : {}),
        });

        // Reflect the normalized, persisted rules back into the form.
        setAvailability(result.rules.availability);
        setMinNotice(result.rules.minNoticeMinutes);
        setBuffer(String(result.rules.defaultBufferMinutes));
        setDuration(result.rules.defaultDurationMinutes);
        setMaxPerDay(
          result.rules.maxBookingsPerDay == null ? "" : String(result.rules.maxBookingsPerDay),
        );
        if (result.timezone) setTimezone(result.timezone);
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    });
  }

  const saveLabel =
    saveState === "saving" || pending
      ? "Saving..."
      : saveState === "saved"
        ? "Saved"
        : "Save";

  return (
    <section className="order-1 space-y-3 px-3 pb-3 md:px-6" aria-labelledby="availability-rules-heading">
      <div className="crm-card space-y-6 !p-4 md:!p-6">
        <div>
          <h2 id="availability-rules-heading" className="text-sm font-semibold text-foreground">
            Availability &amp; booking rules
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Your workspace business hours and booking limits. These apply to every appointment type.
          </p>
        </div>

        {/* Per-day business hours — mirrors the "Working hours" grid in the
            Create-appointment-type sheet, but with an accessible toggle. */}
        <fieldset className="rounded-xl border border-border bg-muted/25 p-3">
          <legend className="px-1 text-sm font-medium text-foreground">Business hours</legend>
          <div className="mt-2 space-y-2">
            {DISPLAY_DAYS.map((day) => {
              const settings = availability[day.key];
              return (
                <div
                  key={day.key}
                  className="grid grid-cols-[56px_auto_1fr_1fr] items-center gap-2"
                >
                  <span className="text-xs text-muted-foreground">{day.label}</span>
                  <DayToggle
                    label={`Toggle ${day.label} availability`}
                    enabled={settings.enabled}
                    onChange={(enabled) => updateDay(day.key, { enabled })}
                  />
                  <input
                    className="crm-input h-9 w-full px-2 text-xs disabled:opacity-50"
                    type="time"
                    aria-label={`${day.label} open time`}
                    value={settings.start}
                    disabled={!settings.enabled}
                    onChange={(event) => updateDay(day.key, { start: event.target.value })}
                  />
                  <input
                    className="crm-input h-9 w-full px-2 text-xs disabled:opacity-50"
                    type="time"
                    aria-label={`${day.label} close time`}
                    value={settings.end}
                    disabled={!settings.enabled}
                    onChange={(event) => updateDay(day.key, { end: event.target.value })}
                  />
                </div>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="availability-timezone" className="mb-1 block text-sm text-muted-foreground">
              Timezone
            </label>
            <select
              id="availability-timezone"
              className="crm-input h-9 w-full px-3"
              value={timezone}
              onChange={(event) => {
                setTimezone(event.target.value);
                markDirty();
              }}
            >
              {timezoneOptions.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="availability-min-notice" className="mb-1 block text-sm text-muted-foreground">
              Minimum notice
            </label>
            <select
              id="availability-min-notice"
              className="crm-input h-9 w-full px-3"
              value={minNotice}
              onChange={(event) => {
                setMinNotice(Number(event.target.value));
                markDirty();
              }}
            >
              {MIN_NOTICE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="availability-buffer" className="mb-1 block text-sm text-muted-foreground">
              Buffer between appointments (min)
            </label>
            <input
              id="availability-buffer"
              className="crm-input h-9 w-full px-3"
              type="number"
              min={0}
              max={120}
              step={5}
              value={buffer}
              onChange={(event) => {
                setBuffer(event.target.value);
                markDirty();
              }}
            />
          </div>

          <div>
            <label htmlFor="availability-duration" className="mb-1 block text-sm text-muted-foreground">
              Default appointment duration
            </label>
            <select
              id="availability-duration"
              className="crm-input h-9 w-full px-3"
              value={duration}
              onChange={(event) => {
                setDuration(Number(event.target.value));
                markDirty();
              }}
            >
              {DURATION_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {durationLabel(minutes)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="availability-max-per-day" className="mb-1 block text-sm text-muted-foreground">
              Max bookings per day
            </label>
            <input
              id="availability-max-per-day"
              className="crm-input h-9 w-full px-3"
              type="number"
              min={0}
              max={50}
              step={1}
              placeholder="No limit"
              value={maxPerDay}
              onChange={(event) => {
                setMaxPerDay(event.target.value);
                markDirty();
              }}
            />
            <p className="mt-1 text-xs text-muted-foreground">Leave empty or 0 for no limit.</p>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            className="crm-button-primary h-9 px-5 text-sm"
            disabled={pending || saveState === "saving"}
            onClick={handleSave}
          >
            {saveLabel}
          </button>
          {saveState === "saved" ? (
            <span className="text-xs text-positive" role="status">
              Booking rules saved.
            </span>
          ) : null}
          {saveState === "error" ? (
            <span className="text-xs text-negative" role="status">
              Couldn&apos;t save. Try again.
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// Accessible on/off toggle: a labelled role="switch" button operable by
// click + Space/Enter. Colors come from theme tokens; the slide transition
// is suppressed under prefers-reduced-motion via motion-reduce:transition-none.
function DayToggle({
  enabled,
  onChange,
  label,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
        enabled ? "border-primary bg-primary" : "border-border bg-muted"
      }`}
    >
      <span
        className={`inline-block size-3.5 transform rounded-full bg-background shadow-sm transition-transform motion-reduce:transition-none ${
          enabled ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
