// wallet formatting — pure micro-dollar ↔ display helpers (spec 1ff09dcb, P2).
//
// Shared by the /build/wallet page (server) and the GET /wallet/balance API
// (Monid-mirrored { value, currency }) so micros always render to dollars the
// same way. Pure; no IO. $1 = 1_000_000 micros (run-cost.ts's MICRO unit).

import { MICRO_PER_CENT } from "@/lib/build/run-cost";

/** Micro-dollars per whole dollar ($1 = 1_000_000). */
export const MICRO_PER_DOLLAR = MICRO_PER_CENT * 100;

/** Convert micro-dollars to a dollar number (e.g. 20_000_000 → 20). Clamps junk to
 *  0. Rounded to the cent so floating display never shows sub-cent noise. */
export function microsToDollars(micros: unknown): number {
  const v = Number(micros);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.round(v / MICRO_PER_CENT) / 100;
}

/** Monid-mirrored balance shape: a numeric dollar `value` + an ISO `currency`. */
export type MoneyValue = { value: number; currency: string };

/** Build the Monid-mirrored { value, currency } from micro-dollars. */
export function microsToMoney(micros: unknown, currency = "USD"): MoneyValue {
  return { value: microsToDollars(micros), currency };
}

/** Format micro-dollars as a USD display string (e.g. "$20.00"). */
export function formatMicrosUsd(micros: unknown): string {
  return `$${microsToDollars(micros).toFixed(2)}`;
}
