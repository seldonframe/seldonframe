"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function PwaInstallCard() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  return (
    <section className="crm-card space-y-3">
      <div>
        <h2 className="text-card-title">PWA</h2>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">Install SeldonFrame Hub for app-like access across devices.</p>
      </div>

      <button
        type="button"
        className="crm-button-primary h-10 px-4"
        disabled={!installEvent}
        onClick={async () => {
          if (!installEvent) {
            return;
          }

          await installEvent.prompt();
          const choice = await installEvent.userChoice;
          setStatus(choice.outcome === "accepted" ? "Installed" : "Install dismissed");
          setInstallEvent(null);
        }}
      >
        Install Hub App
      </button>

      {status ? <p className="text-label text-[hsl(var(--color-text-secondary))]">{status}</p> : null}
    </section>
  );
}
