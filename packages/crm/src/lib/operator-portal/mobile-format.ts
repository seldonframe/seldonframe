// Pure formatters shared across the operator mobile screens. No
// "use server" directive — these are sync utilities imported by both
// server components (screens) and never call the DB.

export function telHref(phone: string | null | undefined): string {
  if (!phone) return "";
  const trimmed = phone.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  const digits = trimmed.replace(/[^\d]/g, "");
  return digits ? `tel:${plus}${digits}` : "";
}

export function smsHref(phone: string | null | undefined): string {
  if (!phone) return "";
  const trimmed = phone.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  const digits = trimmed.replace(/[^\d]/g, "");
  return digits ? `sms:${plus}${digits}` : "";
}

export function contactDisplayName(input: {
  firstName: string | null;
  lastName: string | null;
  phone?: string | null;
}): string {
  const name = [input.firstName, input.lastName]
    .filter((p): p is string => Boolean(p && p.trim()))
    .join(" ")
    .trim();
  if (name) return name;
  if (input.phone && input.phone.trim()) return input.phone.trim();
  return "Lead";
}

export function formatRelative(date: Date, now: number = Date.now()): string {
  const diffMin = Math.floor((now - date.getTime()) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

export type DayBooking = {
  id: string;
  startsAt: Date;
  title: string;
  fullName: string | null;
};

export type BookingDayGroup = {
  /** Stable YYYY-MM-DD key (local). */
  dayKey: string;
  /** Human label, e.g. "Mon, Jun 15". */
  label: string;
  items: DayBooking[];
};

export function groupBookingsByDay(bookings: DayBooking[]): BookingDayGroup[] {
  const byKey = new Map<string, DayBooking[]>();
  for (const b of bookings) {
    const d = b.startsAt;
    const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const arr = byKey.get(dayKey) ?? [];
    arr.push(b);
    byKey.set(dayKey, arr);
  }
  return Array.from(byKey.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, items]) => ({
      dayKey,
      label: items[0].startsAt.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      items: items.sort((x, y) => x.startsAt.getTime() - y.startsAt.getTime()),
    }));
}
