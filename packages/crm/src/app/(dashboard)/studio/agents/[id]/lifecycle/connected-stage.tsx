"use client";

// Agent lifecycle slice (T9, T3) — Stage 03 "Connected".
//
// Required toolkits are derived server-side (page.tsx, via
// connected-toolkits.ts against the template's Composio bindings) and
// handed down as plain props — this island renders status and drives the
// connect flow. No Composio key configured → a single card linking to
// /integrations (existing key flow), never a dead Connect button.
//
// T3 (spec §2, in-place popup connect — NO redirects off this page): Connect
// opens the mint result's redirectUrl in a popup (window.open). While the
// popup is open, this island BOTH (a) listens for the popup's postMessage
// completion signal and (b) independently polls the existing org-scoped
// connection-status action (listComposioConnectionsAction, already built
// for /integrations — reused here, not rebuilt) every ~2s — belt-and-
// suspenders, since postMessage can be lost (popup closed too fast, a
// cross-origin quirk) but the poll always eventually sees the truth. Either
// signal flips the row to Connected in place and closes the popup if it's
// still open. A blocked popup falls back to a same-tab redirect (mode:
// "redirect", returnTo = this page's own URL, allowlisted server-side by
// resolveConnectReturnTo). A popup left open past POPUP_TIMEOUT_MS without
// either signal shows a "still waiting" retry state instead of hanging
// forever.

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Check, Plug } from "lucide-react";
import { connectLifecycleToolkitAction } from "@/lib/agent-templates/lifecycle-connect-actions";
import { listComposioConnectionsAction } from "@/app/(dashboard)/integrations/actions";
import { isConnectPopupMessage } from "@/lib/integrations/connect-popup";

const POLL_MS = 2000;
const POPUP_TIMEOUT_MS = 90_000;
const POPUP_FEATURES = "width=520,height=680,noopener=no";

export type RequiredToolkitView = {
  slug: string;
  name: string;
  logo: string | null;
  connected: boolean;
  /** Best-effort "why" line — the step in the recording that uses this app,
   *  when known; a generic fallback otherwise. */
  why: string;
};

type ConnectState =
  | { phase: "idle" }
  | { phase: "opening"; slug: string }
  | { phase: "waiting"; slug: string; popup: Window | null }
  | { phase: "timed_out"; slug: string; popup: Window | null }
  | { phase: "error"; slug: string; error: string };

export function ConnectedStage({
  templateId,
  toolkits,
  composioConfigured,
}: {
  templateId: string;
  toolkits: RequiredToolkitView[];
  composioConfigured: boolean;
}) {
  const [connectedSlugs, setConnectedSlugs] = useState(
    () => new Set(toolkits.filter((t) => t.connected).map((t) => t.slug)),
  );
  const [state, setState] = useState<ConnectState>({ phase: "idle" });
  const [, startPending] = useTransition();

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const stopWatching = () => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }
  };

  const markConnected = (slug: string, popup: Window | null) => {
    setConnectedSlugs((prev) => new Set(prev).add(slug));
    setState({ phase: "idle" });
    stopWatching();
    if (popup && !popup.closed) {
      try {
        popup.close();
      } catch {
        // The popup already self-closes on its own (connect-popup-callback);
        // a failed programmatic close here just leaves it to do that.
      }
    }
  };

  // The poll: while a connect is in flight, re-check the SAME status action
  // /integrations uses. This is the source of truth the popup's postMessage
  // is only a faster-path shortcut for.
  const pollOnce = (slug: string, popup: Window | null) => {
    startPending(async () => {
      const result = await listComposioConnectionsAction();
      if (stateRef.current.phase !== "waiting" && stateRef.current.phase !== "timed_out") return;
      if (result.ok && result.connections.some((c) => c.slug === slug && c.connected)) {
        markConnected(slug, popup);
        return;
      }
      pollTimerRef.current = setTimeout(() => pollOnce(slug, popup), POLL_MS);
    });
  };

  // The postMessage listener: a same-origin CONNECT_POPUP_MESSAGE_TYPE for
  // the toolkit currently being connected is treated as an immediate signal
  // — the poll would confirm the same thing within POLL_MS regardless.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (!isConnectPopupMessage(event.data)) return;
      const current = stateRef.current;
      if ((current.phase === "waiting" || current.phase === "timed_out") && current.slug === event.data.toolkit) {
        markConnected(event.data.toolkit, current.popup);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => stopWatching, []);

  if (toolkits.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
        <Check className="size-4" aria-hidden /> Nothing to connect — this agent
        doesn&apos;t need any outside app.
      </p>
    );
  }

  if (!composioConfigured) {
    return (
      <div className="rounded-lg border border-[var(--lc-line)] bg-[var(--lc-surface)]/40 p-3 text-sm">
        <p className="text-[var(--lc-muted)]">
          This agent needs {toolkits.map((t) => t.name).join(", ")} connected —
          add your Composio key to enable it.
        </p>
        <Link
          href="/integrations"
          className="mt-1.5 inline-block text-xs font-medium text-primary hover:underline"
        >
          Go to Integrations →
        </Link>
      </div>
    );
  }

  const connect = (slug: string) => {
    setState({ phase: "opening", slug });
    startPending(async () => {
      const result = await connectLifecycleToolkitAction({ templateId, toolkit: slug, mode: "popup" });
      if (!result.ok) {
        setState({ phase: "error", slug, error: "Couldn't start the connect flow. Try again." });
        return;
      }

      const popup = window.open(result.redirectUrl, "sf-connect", POPUP_FEATURES);
      if (!popup) {
        // Popup blocked — same-tab fallback, returnTo carries us right
        // back to this stage (server-side allowlist checks the origin +
        // /studio prefix before trusting it).
        const fallback = await connectLifecycleToolkitAction({
          templateId,
          toolkit: slug,
          mode: "redirect",
          returnTo: window.location.href,
        });
        if (!fallback.ok) {
          setState({ phase: "error", slug, error: "Couldn't start the connect flow. Try again." });
          return;
        }
        window.location.href = fallback.redirectUrl;
        return;
      }

      setState({ phase: "waiting", slug, popup });
      pollTimerRef.current = setTimeout(() => pollOnce(slug, popup), POLL_MS);
      timeoutTimerRef.current = setTimeout(() => {
        setState((prev) => (prev.phase === "waiting" && prev.slug === slug ? { ...prev, phase: "timed_out" } : prev));
      }, POPUP_TIMEOUT_MS);
    });
  };

  const retry = (slug: string) => {
    stopWatching();
    connect(slug);
  };

  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {toolkits.map((t) => {
          const connected = connectedSlugs.has(t.slug);
          const busy =
            (state.phase === "opening" || state.phase === "waiting") && state.slug === t.slug;
          const timedOut = state.phase === "timed_out" && state.slug === t.slug;
          return (
            <li
              key={t.slug}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--lc-line)] bg-[var(--lc-surface)]/30 px-3 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-[var(--lc-ink)]">{t.name}</span>
                <span className="block text-xs text-[var(--lc-muted)]">
                  {timedOut ? "Still waiting — finish in the popup, or retry." : t.why}
                </span>
              </span>
              {connected ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  <Check className="size-3.5" aria-hidden /> Connected
                </span>
              ) : timedOut ? (
                <button
                  type="button"
                  onClick={() => retry(t.slug)}
                  className="crm-button-secondary inline-flex h-8 items-center gap-1.5 px-3 text-xs"
                >
                  <Plug className="size-3.5" aria-hidden />
                  Retry
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => connect(t.slug)}
                  disabled={busy}
                  className="crm-button-secondary inline-flex h-8 items-center gap-1.5 px-3 text-xs"
                >
                  <Plug className="size-3.5" aria-hidden />
                  {busy ? "Waiting for the popup…" : "Connect"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {state.phase === "error" ? (
        <p className="text-xs text-rose-600 dark:text-rose-400">{state.error}</p>
      ) : null}
    </div>
  );
}
