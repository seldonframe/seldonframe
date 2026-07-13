"use client";

// Agent setup mode slice (T3) — the popup-only half of the in-place connect
// flow (spec §2). Runs inside the popup window Composio's OAuth completion
// redirected back to: posts CONNECT_POPUP_MESSAGE_TYPE to `window.opener`
// (parent listens + also independently polls the connection-status action —
// belt-and-suspenders per the spec, never trust postMessage alone), then
// self-closes. If there's no opener (the operator opened this URL directly,
// or a browser blocked window.close()) it falls back to a plain "you can
// close this window" message with nothing left to do.

import { useEffect, useState } from "react";
import { CONNECT_POPUP_MESSAGE_TYPE } from "@/lib/integrations/connect-popup";

export function ConnectPopupCallback({ toolkit }: { toolkit: string | null }) {
  // "finishing" for a brief beat while the postMessage fires, then
  // "manual-close" once window.close() has been attempted — if it
  // succeeded the tab is already gone and this never renders; if the
  // browser blocked it, the operator sees correct copy instead of a
  // permanently stuck "Finishing up…".
  const [phase, setPhase] = useState<"finishing" | "manual-close">("finishing");

  useEffect(() => {
    if (window.opener && toolkit) {
      try {
        window.opener.postMessage({ type: CONNECT_POPUP_MESSAGE_TYPE, toolkit }, window.location.origin);
      } catch {
        // Best-effort — the parent's own status poll is the fallback source
        // of truth if postMessage fails for any reason (blocked opener,
        // cross-origin quirk, etc.).
      }
    }
    const timer = setTimeout(() => {
      try {
        window.close();
      } catch {
        // Some browsers refuse to close a window script didn't open.
      }
      setPhase("manual-close");
    }, 400);
    return () => clearTimeout(timer);
  }, [toolkit]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[#0b0e14] px-6 text-center">
      <p className="text-lg font-semibold text-white">Connected</p>
      <p className="text-sm text-[#8b93a7]">
        {phase === "finishing" ? "Finishing up…" : "You can close this window."}
      </p>
    </main>
  );
}
