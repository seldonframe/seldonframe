// v1 PWA — registers the hand-rolled service worker scoped to this
// workspace's portal path. Client-only; renders nothing. Registration
// is best-effort: failures are logged, never thrown (SW is a
// progressive enhancement; the app works without it).

"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister({ scope }: { scope: string }) {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    navigator.serviceWorker
      .register("/sw.js", { scope })
      .catch((err) => {
        console.warn("[pwa] service worker registration failed", err);
      });
  }, [scope]);

  return null;
}
