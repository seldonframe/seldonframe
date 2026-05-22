"use client";

// packages/crm/src/app/(dashboard)/clients/[slug]/landing/edit/edit-shell.tsx
//
// Client component — split layout:
//   Left (60%): live preview iframe + viewport toggle.
//   Right (40%): natural-language instruction input + version history + undo.
//
// No new npm dependencies — textarea, button, iframe, standard HTML.

import { useState, useCallback, useTransition, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Monitor, Smartphone, Tablet } from "lucide-react";

type VersionRow = {
  id: string;
  instruction: string | null;
  summary: string | null;
  createdAt: string;
};

type Viewport = "desktop" | "tablet" | "phone";

const VIEWPORT_WIDTHS: Record<Viewport, string> = {
  desktop: "100%",
  tablet: "768px",
  phone: "390px",
};

type Props = {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  hasLanding: boolean;
  previewUrl: string;
  initialVersions: VersionRow[];
};

export function EditShell({
  workspaceId,
  workspaceName,
  workspaceSlug,
  hasLanding,
  previewUrl,
  initialVersions,
}: Props) {
  const [instruction, setInstruction] = useState("");
  const [versions, setVersions] = useState<VersionRow[]>(initialVersions);
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [iframeKey, setIframeKey] = useState(Date.now());
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const refreshIframe = useCallback(() => {
    setIframeKey(Date.now());
  }, []);

  const handleApply = useCallback(async () => {
    const trimmed = instruction.trim();
    if (!trimmed) return;

    setStatus("submitting");
    setStatusMsg("Applying...");

    try {
      const res = await fetch("/api/v1/landing/r1/customize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-org-id": workspaceId,
        },
        body: JSON.stringify({ instruction: trimmed }),
      });

      const json = (await res.json()) as {
        ok?: boolean;
        summary?: string;
        version_id?: string;
        error?: string;
        detail?: string;
      };

      if (!res.ok || !json.ok) {
        setStatus("error");
        setStatusMsg(
          `Failed: ${json.detail ?? json.error ?? "Unknown error"}`,
        );
        return;
      }

      // Add a new version row at the top of the list.
      const newVersion: VersionRow = {
        id: json.version_id ?? "",
        instruction: trimmed,
        summary: json.summary ?? null,
        createdAt: new Date().toISOString(),
      };

      startTransition(() => {
        setVersions((prev) => [newVersion, ...prev]);
        setInstruction("");
        setStatus("success");
        setStatusMsg(`Applied: ${json.summary ?? "Changes saved."}`);
        refreshIframe();
      });

      // Auto-clear success message after 5s.
      setTimeout(() => {
        setStatus("idle");
        setStatusMsg("");
      }, 5000);
    } catch (err) {
      setStatus("error");
      setStatusMsg(
        `Network error: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }, [instruction, workspaceId, refreshIframe]);

  const handleUndo = useCallback(
    async (versionId: string) => {
      setStatus("submitting");
      setStatusMsg("Reverting...");

      try {
        const res = await fetch("/api/v1/landing/r1/revert", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-org-id": workspaceId,
          },
          body: JSON.stringify({ version_id: versionId }),
        });

        const json = (await res.json()) as {
          ok?: boolean;
          summary?: string;
          version_id?: string;
          error?: string;
          detail?: string;
        };

        if (!res.ok || !json.ok) {
          setStatus("error");
          setStatusMsg(
            `Revert failed: ${json.detail ?? json.error ?? "Unknown error"}`,
          );
          return;
        }

        // Add a new "reverted" row at the top.
        const revertedVersion: VersionRow = {
          id: json.version_id ?? "",
          instruction: `Reverted to earlier version`,
          summary: json.summary ?? null,
          createdAt: new Date().toISOString(),
        };

        startTransition(() => {
          setVersions((prev) => [revertedVersion, ...prev]);
          setStatus("success");
          setStatusMsg(`Reverted: ${json.summary ?? "Reverted successfully."}`);
          refreshIframe();
        });

        setTimeout(() => {
          setStatus("idle");
          setStatusMsg("");
        }, 5000);
      } catch (err) {
        setStatus("error");
        setStatusMsg(
          `Network error: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    },
    [workspaceId, refreshIframe],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Ctrl/Cmd + Enter to submit.
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (status !== "submitting") handleApply();
      }
    },
    [handleApply, status],
  );

  const isSubmitting = status === "submitting";

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
      {/* ── Top bar ── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border/70 bg-card/60 px-4 py-3">
        <Link
          href={`/clients/${workspaceSlug}/ready`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to workspace
        </Link>
        <span className="text-muted-foreground/40">|</span>
        <span className="text-xs font-medium text-foreground">
          Landing editor &mdash; {workspaceName}
        </span>
      </div>

      {/* ── Split body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: preview ── */}
        <div className="flex flex-1 flex-col overflow-hidden border-r border-border/70">
          {/* Viewport toggle */}
          <div className="flex shrink-0 items-center gap-1 border-b border-border/60 bg-muted/20 px-3 py-2">
            <span className="mr-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Preview
            </span>
            {(["desktop", "tablet", "phone"] as Viewport[]).map((vp) => (
              <button
                key={vp}
                type="button"
                onClick={() => setViewport(vp)}
                title={vp}
                className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                  viewport === vp
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                }`}
              >
                {vp === "desktop" ? (
                  <Monitor className="size-4" />
                ) : vp === "tablet" ? (
                  <Tablet className="size-4" />
                ) : (
                  <Smartphone className="size-4" />
                )}
              </button>
            ))}
            <div className="flex-1" />
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Open in new tab
            </a>
          </div>

          {/* iframe container */}
          <div className="relative flex flex-1 items-start justify-center overflow-auto bg-muted/10 p-4">
            {!hasLanding ? (
              <div className="flex flex-col items-center gap-3 pt-24 text-center">
                <p className="text-sm text-muted-foreground">
                  No R1 landing page found for this workspace.
                </p>
                <p className="text-xs text-muted-foreground">
                  Create one from the workspace creation flow first.
                </p>
              </div>
            ) : (
              <div
                className="relative overflow-hidden rounded-lg border border-border/60 shadow-md transition-[width] duration-300"
                style={{ width: VIEWPORT_WIDTHS[viewport], maxWidth: "100%" }}
              >
                <iframe
                  key={iframeKey}
                  src={`${previewUrl}?refresh=${iframeKey}`}
                  className="h-full min-h-[600px] w-full border-none"
                  style={{ height: "calc(100vh - 14rem)" }}
                  title="Landing page preview"
                  sandbox="allow-scripts allow-same-origin allow-forms"
                />
              </div>
            )}
          </div>
        </div>

        {/* ── Right: editor ── */}
        <div className="flex w-full max-w-sm flex-col overflow-hidden border-l border-border/70 bg-background md:w-80 lg:w-96 xl:max-w-sm">
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
            {/* Header */}
            <div>
              <h1 className="text-base font-semibold tracking-tight text-foreground">
                Edit your landing
              </h1>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                {workspaceSlug}
              </p>
            </div>

            {/* Instruction textarea */}
            <div className="flex flex-col gap-2">
              <label
                htmlFor="landing-instruction"
                className="text-xs font-medium text-foreground"
              >
                What should change?
              </label>
              <textarea
                id="landing-instruction"
                ref={textareaRef}
                rows={5}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isSubmitting}
                placeholder={
                  `Tell me what to change. Examples:\n` +
                  `  • "Change the hero tagline to focus on 24/7 emergency"\n` +
                  `  • "Replace the hero photo with https://..."\n` +
                  `  • "Add a question about financing to the FAQ"`
                }
                className="w-full resize-none rounded-lg border border-border bg-muted/10 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={handleApply}
                disabled={isSubmitting || !instruction.trim()}
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-[background-color,opacity] hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "Applying..." : "Apply changes"}
              </button>
              <p className="text-[10px] text-muted-foreground">
                Ctrl+Enter to apply &middot; Changes go live immediately
              </p>
            </div>

            {/* Status line */}
            {statusMsg && (
              <p
                className={`rounded-md px-3 py-2 text-xs ${
                  status === "error"
                    ? "border border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400"
                    : status === "success"
                      ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : "border border-border bg-muted/20 text-muted-foreground"
                }`}
              >
                {statusMsg}
              </p>
            )}

            {/* Version history */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                History
              </p>
              {versions.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No edit history yet. Make a change above to start.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {versions.map((v, idx) => (
                    <li
                      key={v.id}
                      className="flex flex-col gap-1 rounded-lg border border-border/70 bg-muted/10 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-col gap-0.5">
                          <p className="text-[11px] text-muted-foreground">
                            {new Date(v.createdAt).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                          {v.instruction && (
                            <p
                              className="max-w-[17ch] truncate text-[11px] font-medium text-foreground"
                              title={v.instruction}
                            >
                              {v.instruction}
                            </p>
                          )}
                          {v.summary && (
                            <p className="text-[11px] text-muted-foreground">
                              {v.summary}
                            </p>
                          )}
                        </div>
                        {/* Don't show undo for the newest row (that's current). */}
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={() => handleUndo(v.id)}
                            disabled={isSubmitting}
                            className="shrink-0 rounded-md border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                          >
                            Undo to here
                          </button>
                        )}
                        {idx === 0 && (
                          <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                            Current
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
