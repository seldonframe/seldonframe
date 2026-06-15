// v1 PWA — install affordance.
//
// Android / desktop Chrome: capture the `beforeinstallprompt` event,
// stash it, and show an "Install app" button that calls prompt().
// iOS Safari: there is no beforeinstallprompt — detect iOS + non-
// standalone and show a one-line "Add to Home Screen" hint instead.
// When already installed (display-mode: standalone) render nothing.

"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS legacy
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function InstallButton({ brandColor }: { brandColor: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    if (isIos()) {
      setShowIosHint(true);
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  if (showIosHint) {
    return (
      <p className="text-[12px]" style={{ color: "#666" }}>
        Install: tap Share, then <strong>Add to Home Screen</strong>.
      </p>
    );
  }

  if (!deferred) return null;

  return (
    <button
      type="button"
      onClick={async () => {
        await deferred.prompt();
        await deferred.userChoice;
        setDeferred(null);
      }}
      className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-white"
      style={{ backgroundColor: brandColor }}
    >
      Install app
    </button>
  );
}
