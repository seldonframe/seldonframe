"use client";

import { useEffect, useRef } from "react";

// One-shot client beacon fired from the public landing page. Replaces
// the per-request server-action visit tracker so the page route can
// be statically rendered via Next ISR and still emit landing.visited
// on every real browser view.
//
// Uses sessionStorage to throttle: a given visitor's browser fires the
// beacon once per session per page to avoid double-counting SPA
// navigations or React StrictMode double-mounts.

export function VisitBeacon({ pageId }: { pageId: string }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    const storageKey = `sf_landing_visited:${pageId}`;
    try {
      if (typeof window !== "undefined" && window.sessionStorage.getItem(storageKey)) {
        return;
      }
    } catch {
      // SessionStorage blocked (private mode, cookies-off) — proceed to fire.
    }

    let visitorId: string | null = null;
    try {
      const existing = document.cookie
        .split("; ")
        .find((row) => row.startsWith("sf_vid="))
        ?.split("=")[1];
      if (existing) {
        visitorId = existing;
      } else {
        visitorId = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
        // 400 days, lax, secure if https.
        const secure = window.location.protocol === "https:" ? "; Secure" : "";
        document.cookie = `sf_vid=${visitorId}; Path=/; Max-Age=${60 * 60 * 24 * 400}; SameSite=Lax${secure}`;
      }
    } catch {
      visitorId = "anonymous";
    }

    const body = JSON.stringify({ pageId, visitorId });
    const url = "/api/v1/landing/track-visit";

    // Prefer sendBeacon for reliability on page transitions.
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      try {
        const blob = new Blob([body], { type: "application/json" });
        if (navigator.sendBeacon(url, blob)) {
          try {
            window.sessionStorage.setItem(storageKey, "1");
          } catch {
            /* storage blocked — harmless */
          }
          return;
        }
      } catch {
        // fall through to fetch
      }
    }

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    })
      .then(() => {
        try {
          window.sessionStorage.setItem(storageKey, "1");
        } catch {
          /* storage blocked — harmless */
        }
      })
      .catch(() => {
        /* best-effort tracking */
      });
  }, [pageId]);

  return null;
}
