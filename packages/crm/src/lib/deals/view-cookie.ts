"use server";

import { cookies } from "next/headers";

/**
 * SSR-safe persistence for the /deals view toggle (Kanban | Table).
 *
 * Stored in a cookie rather than localStorage so the server component
 * picks the right initial render WITHOUT a flash. The previous
 * localStorage version always SSR'd Kanban then maybe swapped to Table
 * after hydration — works but causes a visible jump for operators
 * who prefer Table.
 *
 * Default: kanban. Cookie name kept short (`sf_deals_view`) since it
 * rides on every request to the dashboard.
 */

export type DealsViewMode = "table" | "kanban";

const COOKIE_NAME = "sf_deals_view";
// One year — view preference is sticky-by-default. Operators clear via
// switching the toggle, not by waiting for expiry.
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function getDealsView(): Promise<DealsViewMode> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (raw === "table" || raw === "kanban") return raw;
  return "kanban";
}

export async function setDealsViewAction(view: DealsViewMode) {
  if (view !== "table" && view !== "kanban") {
    return;
  }
  const store = await cookies();
  store.set(COOKIE_NAME, view, {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
    httpOnly: false,
    // No `secure: true` flag — the cookie is innocuous (just a UI
    // preference) and we want it to work in local dev over http.
    // The auth-bearing cookies elsewhere set Secure independently.
  });
}
