"use client";

// F2 fix (2026-07-05, SH2-F2) — the win-ladder previously only reflected DB
// state on a manual page reload: an operator who connected their calendar in
// one tab (returning to /dashboard via an OAuth redirect) and then completed
// a booking in another tab saw the ladder stay stuck at "0 of 4 done" even
// though the underlying steps had already flipped server-side. Mount this
// next to every WinLadder render site (renders null — it's pure effect
// wiring) to re-render the server tree (nav + ladder recompute) without
// losing client-side state such as the SeldonChat panel staying open.
//
// Three independent triggers, each re-entrant-safe:
//   (a) mount-time "connected=" query param (OAuth return) — refresh once,
//       then strip the param via history.replaceState so a later manual
//       reload doesn't refresh again.
//   (b) "seldonchat:acted" CustomEvent (dispatched by seldon-chat.tsx after
//       any successful tool call) — throttled so a burst of tool calls in one
//       turn doesn't trigger a refresh storm.
//   (c) document visibilitychange → visible, when enough time has passed
//       since the last refresh — covers the "booked in another tab, switched
//       back" case with no event to listen for at all.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const ACTED_THROTTLE_MS = 3_000;
const VISIBILITY_MIN_GAP_MS = 60_000;

/**
 * Pure decision helper for the visibilitychange trigger: true when at least
 * `minGapMs` has elapsed since the last refresh. `lastMs === null` means no
 * refresh has happened yet this page-load, which always clears the gap (the
 * component was just mounted — any subsequent tab switch back is worth a
 * refresh, since mount-time itself only fires a refresh for the OAuth-return
 * query-param path, not on every load).
 */
export function shouldAutoRefresh(nowMs: number, lastMs: number | null, minGapMs: number): boolean {
  if (lastMs === null) return true;
  return nowMs - lastMs >= minGapMs;
}

export function LadderAutoRefresh() {
  const router = useRouter();
  const lastRefreshRef = useRef<number | null>(null);

  useEffect(() => {
    // (a) OAuth-return query param — refresh once, then strip it so a
    // subsequent manual reload doesn't re-trigger.
    if (window.location.search.includes("connected=")) {
      lastRefreshRef.current = Date.now();
      router.refresh();

      const url = new URL(window.location.href);
      url.searchParams.delete("connected");
      window.history.replaceState({}, "", url.toString());
    }
  }, [router]);

  useEffect(() => {
    // (b) SeldonChat acted — throttled refresh.
    function handleActed() {
      const now = Date.now();
      if (lastRefreshRef.current !== null && now - lastRefreshRef.current < ACTED_THROTTLE_MS) {
        return;
      }
      lastRefreshRef.current = now;
      router.refresh();
    }

    window.addEventListener("seldonchat:acted", handleActed);
    return () => {
      window.removeEventListener("seldonchat:acted", handleActed);
    };
  }, [router]);

  useEffect(() => {
    // (c) Tab became visible again (e.g. returning from the booking tab).
    function handleVisibility() {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (!shouldAutoRefresh(now, lastRefreshRef.current, VISIBILITY_MIN_GAP_MS)) return;
      lastRefreshRef.current = now;
      router.refresh();
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [router]);

  return null;
}
