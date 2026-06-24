"use client";

// Phase 2/4 — the /integrations dashboard (client).
//
// Renders the curated Composio toolkit catalog as a grid of "app cards", each
// showing Connected / Connect / Disconnect via managed OAuth. Connect calls the
// server action to mint a hosted-consent redirect URL, then navigates there;
// Composio returns the operator to /integrations?connected=<toolkit> which this
// component reads to show a success toast + refetch the live connection state.
//
// When the workspace has no Composio key at all (no platform key + no BYO secret)
// a "Bring your own Composio key" field is shown, wired to setComposioKeyAction.
//
// Phase 4: for a CONNECTED toolkit that declares a pinned primaryTrigger, an
// "Enable trigger" control surfaces so inbound app events (e.g. new Gmail) can
// drive event-triggered archetype agents.
//
// SECURITY: no secret ever lives in this component. The BYO key is submitted and
// immediately cleared from state; it is never rendered back.

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plug, Check, Loader2, Zap, KeyRound } from "lucide-react";
import {
  listComposioConnectionsAction,
  connectComposioToolkitAction,
  disconnectComposioToolkitAction,
  setComposioKeyAction,
  enableComposioTriggerAction,
} from "./actions";

/** A catalog toolkit descriptor passed from the server (serializable subset). */
export type CatalogToolkit = {
  slug: string;
  label: string;
  logo: string | null;
  /** Pinned primary trigger slug, or null (drives the Enable-trigger control). */
  primaryTrigger: string | null;
};

/** Live connection state for a toolkit (from the adapter). */
export type ToolkitConnectionView = {
  slug: string;
  connected: boolean;
  connectedAccountId: string | null;
};

type Props = {
  catalog: CatalogToolkit[];
  initialConnections: ToolkitConnectionView[];
  /** True when the workspace has a usable Composio key (platform or BYO). When
   *  false the BYO-key panel is shown and Connect is disabled until a key
   *  exists. */
  hasKey: boolean;
  /** The return param Composio appended (?connected=<toolkit>), if any. */
  returnedToolkit: string | null;
  /** Optional ?status= value Composio appends to the callback. */
  returnedStatus: string | null;
};

type Toast = { kind: "success" | "error"; message: string } | null;

export function IntegrationsClient(props: Props) {
  const router = useRouter();

  // Live connection state, seeded from the server then refetched after actions.
  const [connections, setConnections] = useState<ToolkitConnectionView[]>(
    props.initialConnections,
  );
  const [hasKey, setHasKey] = useState(props.hasKey);
  const [toast, setToast] = useState<Toast>(null);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const connBySlug = useMemo(() => {
    const m = new Map<string, ToolkitConnectionView>();
    for (const c of connections) m.set(c.slug, c);
    return m;
  }, [connections]);

  // On return from the hosted consent screen, show a toast + refetch. A failed
  // status surfaces an error; otherwise success. Runs once on mount when the
  // param is present.
  useEffect(() => {
    if (!props.returnedToolkit) return;
    const failed =
      props.returnedStatus != null &&
      /fail|error|denied|cancel/i.test(props.returnedStatus);
    setToast(
      failed
        ? { kind: "error", message: `Couldn't connect ${props.returnedToolkit}.` }
        : { kind: "success", message: `${props.returnedToolkit} connected.` },
    );
    void refetch();
    // Clean the URL so a refresh doesn't re-toast.
    router.replace("/integrations");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-dismiss the toast.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  async function refetch() {
    const res = await listComposioConnectionsAction();
    if (res.ok) {
      setConnections(
        res.connections.map((c) => ({
          slug: c.slug,
          connected: c.connected,
          connectedAccountId: c.connectedAccountId,
        })),
      );
    }
  }

  function handleConnect(slug: string) {
    setToast(null);
    setPendingSlug(slug);
    startTransition(async () => {
      const res = await connectComposioToolkitAction(slug);
      if (!res.ok) {
        setPendingSlug(null);
        setToast({ kind: "error", message: friendly(res.error) });
        return;
      }
      // Hand off to Composio's hosted consent screen.
      window.location.href = res.redirectUrl;
    });
  }

  function handleDisconnect(slug: string, connectedAccountId: string | null) {
    if (!connectedAccountId) return;
    setToast(null);
    setPendingSlug(slug);
    startTransition(async () => {
      const res = await disconnectComposioToolkitAction(connectedAccountId);
      setPendingSlug(null);
      if (!res.ok) {
        setToast({ kind: "error", message: friendly(res.error) });
        return;
      }
      setToast({ kind: "success", message: "Disconnected." });
      await refetch();
    });
  }

  function handleEnableTrigger(slug: string) {
    setToast(null);
    setPendingSlug(slug);
    startTransition(async () => {
      const res = await enableComposioTriggerAction(slug);
      setPendingSlug(null);
      if (!res.ok) {
        setToast({ kind: "error", message: friendly(res.error) });
        return;
      }
      setToast({
        kind: "success",
        message: "Trigger enabled — new events will reach your agents.",
      });
    });
  }

  return (
    <div className="space-y-5">
      {toast && (
        <p
          role="status"
          className={`rounded-md border px-3 py-2 text-sm ${
            toast.kind === "success"
              ? "border-positive/30 bg-positive/10 text-positive"
              : "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400"
          }`}
        >
          {toast.message}
        </p>
      )}

      {!hasKey && <ByoKeyPanel onSaved={() => setHasKey(true)} />}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {props.catalog.map((tk) => {
          const conn = connBySlug.get(tk.slug);
          const connected = conn?.connected ?? false;
          const busy = pendingSlug === tk.slug;
          return (
            <article
              key={tk.slug}
              className="flex flex-col rounded-xl border bg-card p-4"
            >
              <div className="flex items-center gap-3">
                <ToolkitLogo logo={tk.logo} label={tk.label} />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-foreground">
                    {tk.label}
                  </h3>
                  <span
                    className={`mt-0.5 inline-flex items-center gap-1 text-[11px] ${
                      connected ? "text-positive" : "text-muted-foreground"
                    }`}
                  >
                    {connected ? (
                      <>
                        <Check className="size-3" aria-hidden /> Connected
                      </>
                    ) : (
                      "Not connected"
                    )}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {connected ? (
                  <button
                    type="button"
                    onClick={() =>
                      handleDisconnect(tk.slug, conn?.connectedAccountId ?? null)
                    }
                    disabled={busy}
                    className="crm-button-secondary inline-flex h-8 items-center gap-1.5 px-3 text-xs disabled:opacity-60"
                  >
                    {busy ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : null}
                    Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleConnect(tk.slug)}
                    disabled={busy || !hasKey}
                    title={
                      !hasKey
                        ? "Add a Composio key first (below)"
                        : undefined
                    }
                    className="crm-button-primary inline-flex h-8 items-center gap-1.5 px-3 text-xs disabled:opacity-60"
                  >
                    {busy ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Plug className="size-3.5" aria-hidden />
                    )}
                    Connect
                  </button>
                )}

                {/* Phase 4 — surface the primary inbound-event trigger for a
                    connected toolkit that pins one. */}
                {connected && tk.primaryTrigger && (
                  <button
                    type="button"
                    onClick={() => handleEnableTrigger(tk.slug)}
                    disabled={busy}
                    title={`Enable the ${tk.primaryTrigger} trigger so new events reach your agents`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs text-muted-foreground hover:bg-muted/50 disabled:opacity-60"
                  >
                    <Zap className="size-3.5" aria-hidden />
                    Enable trigger
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Connecting an app authorizes it via Composio&apos;s secure managed OAuth.
        Your agents can then act in that app (read mail, create events, post to
        Slack…) when you enable the matching tools in{" "}
        <span className="font-medium text-foreground">
          Agents → Connectors &amp; Tools
        </span>
        .
      </p>
    </div>
  );
}

/** The square app logo with a graceful fallback to the label initial. */
function ToolkitLogo({ logo, label }: { logo: string | null; label: string }) {
  const [broken, setBroken] = useState(false);
  if (logo && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt=""
        width={36}
        height={36}
        onError={() => setBroken(true)}
        className="size-9 shrink-0 rounded-lg border bg-background object-contain p-1"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-sm font-semibold text-muted-foreground"
    >
      {label.charAt(0)}
    </span>
  );
}

/** The BYO-key panel — shown only when no platform/BYO key is configured. */
function ByoKeyPanel({ onSaved }: { onSaved: () => void }) {
  const [key, setKey] = useState("");
  const [busy, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    const trimmed = key.trim();
    if (!trimmed) return;
    setError(null);
    startSave(async () => {
      const res = await setComposioKeyAction(trimmed);
      setKey("");
      if (!res.ok) {
        setError(friendly(res.error));
        return;
      }
      onSaved();
    });
  }

  return (
    <div className="rounded-xl border border-dashed bg-card p-5">
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 dark:text-indigo-400"
        >
          <KeyRound className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-card-title">Bring your own Composio key</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            App connections are powered by Composio. Paste a Composio API key to
            enable Connect for this workspace. Stored encrypted — we never show it
            again.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          disabled={busy}
          placeholder="Paste your Composio API key"
          className="crm-input h-9 min-w-0 flex-1 px-3 text-sm"
        />
        <button
          type="button"
          onClick={save}
          disabled={busy || key.trim().length === 0}
          className="crm-button-primary inline-flex h-9 items-center gap-1.5 px-4 text-sm disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Save key
        </button>
      </div>
      {error && (
        <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>
      )}
    </div>
  );
}

/** Map an action error code to friendly copy. */
function friendly(error: string): string {
  switch (error) {
    case "unauthorized":
      return "You don't have access to this workspace.";
    case "unknown_toolkit":
      return "That app isn't available.";
    case "composio_not_configured":
      return "Composio isn't configured for this workspace yet.";
    case "missing_key":
      return "Enter a Composio API key.";
    case "missing_account_id":
      return "Nothing to disconnect.";
    case "no_primary_trigger":
      return "This app has no inbound trigger to enable.";
    default:
      return error;
  }
}
