"use client";

// Month-navigable date picker for the /bookings toolbar.
//
// Replaces the old inert date-range button (which only showed the current
// week's span and couldn't jump across months). Clicking the trigger opens a
// popover with a full MONTH calendar grid (all weeks visible), prev/next MONTH
// arrows, today highlighted, and the currently-viewed week's day highlighted as
// the selection. Clicking any day jumps the week view to the week containing
// that day, then closes the popover.
//
// The week view is driven by a single `offsetDays` integer (day-granular offset
// from "today" in the workspace timezone). This component is presentation-only:
// it hands the picked Date back to WeekCalendar via `onSelectDate`, and the
// parent translates it into an offset using the same UTC-midnight anchoring the
// rest of week-calendar.tsx uses (so timezone correctness is preserved).
//
// Styling matches the dashboard warm-paper surface (popover tokens) with the
// #059669 accent for the selected day + today ring. We supply the full
// `classNames` map (react-day-picker v9) rather than importing the library's
// stylesheet, so the picker inherits no global rdp defaults and stays on-brand.

import { useState } from "react";
import { DayPicker } from "react-day-picker";
import { Calendar as CalendarIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type BookingDatePickerProps = {
  /** Label rendered inside the trigger button — the existing week-span text
   *  (e.g. "Jun 14 - Jun 20, 2026") or single-day label in Day view. */
  label: string;
  /** The day currently anchoring the week view (first visible column), shown
   *  as the calendar's selection + the month it opens to. A browser-local Date
   *  at midnight (built by the parent from the workspace timezone) so
   *  DayPicker's local-time grid lines up with the displayed month. */
  selectedDay: Date;
  /** Today, anchored in the workspace timezone (browser-local midnight). Drives
   *  the "today" ring so it matches the operator's local day, not the viewer's
   *  browser day. */
  today: Date;
  /** Called with the clicked day. The parent jumps the week view to the week
   *  containing this date and we close the popover. */
  onSelectDate: (date: Date) => void;
};

export function BookingDatePicker({
  label,
  selectedDay,
  today,
  onSelectDate,
}: BookingDatePickerProps) {
  const [open, setOpen] = useState(false);
  // Controlled month so the prev/next arrows move month-to-month. Re-seeds to
  // the selected week's month each time the popover opens.
  const [month, setMonth] = useState<Date>(selectedDay);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Re-center the grid on the active week whenever we (re)open.
        if (next) setMonth(selectedDay);
      }}
    >
      <PopoverTrigger
        className="crm-pressable inline-flex h-8 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-xs transition-[background-color,color,transform] duration-150 ease-out hover:bg-accent hover:text-accent-foreground"
        aria-label="Jump to a date"
      >
        <CalendarIcon className="size-4 text-muted-foreground" />
        <span className="text-xs text-foreground">{label}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <DayPicker
          mode="single"
          required
          selected={selectedDay}
          month={month}
          onMonthChange={setMonth}
          today={today}
          showOutsideDays
          // Reduced-motion safe: no month-transition animation at all.
          animate={false}
          onSelect={(day) => {
            if (!day) return;
            onSelectDate(day);
            setOpen(false);
          }}
          classNames={{
            month: "space-y-2",
            month_caption: "relative flex items-center justify-center h-8",
            caption_label: "text-sm font-semibold text-foreground",
            nav: "absolute inset-x-1 top-3 z-10 flex items-center justify-between",
            button_previous:
              "crm-pressable inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground motion-reduce:transition-none",
            button_next:
              "crm-pressable inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground motion-reduce:transition-none",
            chevron: "size-4 fill-current",
            month_grid: "w-full border-collapse",
            weekdays: "flex",
            weekday:
              "w-9 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground",
            week: "flex w-full",
            day: "p-0 text-center",
            day_button:
              "inline-flex size-9 items-center justify-center rounded-md text-sm text-foreground transition-colors hover:bg-[color-mix(in_srgb,#059669_12%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#059669]/40 motion-reduce:transition-none",
            // Selected wins over today: `!` guarantees the teal fill + white
            // text even when the selected day is also today.
            selected:
              "[&_button]:!bg-[#059669] [&_button]:!text-white [&_button]:font-semibold",
            today: "[&_button]:text-[#059669] [&_button]:font-semibold",
            outside: "[&_button]:text-muted-foreground/50",
            disabled: "[&_button]:text-muted-foreground/40",
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
