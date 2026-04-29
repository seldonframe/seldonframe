/**
 * Curated list of common timezones for the workspace settings selector.
 * The full IANA list is overkill for the form; these 32 zones cover ~95%
 * of SeldonFrame's expected operator base (NA + EU + APAC).
 *
 * Lives in its own module (not next to the server actions) because
 * Next.js requires `"use server"` files to export only async functions —
 * a const array would crash the build with `A "use server" file can only
 * export async functions, found object`.
 */
export const COMMON_TIMEZONES = [
  "UTC",
  // Americas
  "America/Vancouver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Denver",
  "America/Chicago",
  "America/Mexico_City",
  "America/New_York",
  "America/Toronto",
  "America/Halifax",
  "America/St_Johns",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  // Europe / Africa
  "Europe/London",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Stockholm",
  "Europe/Athens",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Africa/Lagos",
  "Africa/Cairo",
  "Africa/Johannesburg",
  // Asia / Pacific
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Perth",
  "Australia/Sydney",
  "Pacific/Auckland",
] as const;

export type TimezoneOption = (typeof COMMON_TIMEZONES)[number];
