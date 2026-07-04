/**
 * Garbage collection cutoff for unclaimed web_ungated workspaces.
 * Returns a date that is exactly 7 days before the given time.
 *
 * @param now - The reference time (typically new Date())
 * @returns A Date object that is 7 days in the past
 */
export function webUngatedGcCutoff(now: Date): Date {
  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
}
