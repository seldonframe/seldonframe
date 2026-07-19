"use client";

// Agent setup mode slice (T5) — "Share what you built" on the celebration
// screen. Opt-in, PREVIEW-before-publish (spec §3): Preview computes
// scrubbed step labels WITHOUT writing anything; the operator can edit
// labels inline; only the explicit Publish click writes the share_cards
// row and makes anything public. Unpublish deletes it (page 404s).

import { useEffect, useState, useTransition } from "react";
import { Check, Share2 } from "lucide-react";
import {
  getShareCardStatusAction,
  previewShareCardAction,
  publishShareCardAction,
  unpublishShareCardAction,
} from "@/lib/agent-templates/share-card-actions";

type PreviewStep = { label: string };

export function ShareCardPanel({ templateId }: { templateId: string }) {
  const [pending, startPending] = useTransition();
  const [status, setStatus] = useState<{ published: boolean; url: string | null } | null>(null);
  const [preview, setPreview] = useState<{ agentName: string; steps: PreviewStep[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getShareCardStatusAction(templateId).then((result) => {
      if (!cancelled) setStatus({ published: result.published, url: result.url });
    });
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  const loadPreview = () => {
    setError(null);
    startPending(async () => {
      const result = await previewShareCardAction(templateId);
      if (!result.ok) {
        setError("Couldn't build a preview. Try again.");
        return;
      }
      setPreview({ agentName: result.agentName, steps: result.steps });
    });
  };

  const editLabel = (index: number, label: string) => {
    setPreview((prev) => {
      if (!prev) return prev;
      const steps = prev.steps.map((s, i) => (i === index ? { label } : s));
      return { ...prev, steps };
    });
  };

  const publish = () => {
    if (!preview) return;
    setError(null);
    startPending(async () => {
      const result = await publishShareCardAction(templateId, preview.steps);
      if (!result.ok) {
        setError("Couldn't publish. Try again.");
        return;
      }
      setStatus({ published: true, url: result.url });
      setPreview(null);
    });
  };

  const unpublish = () => {
    setError(null);
    startPending(async () => {
      const result = await unpublishShareCardAction(templateId);
      if (!result.ok) {
        setError("Couldn't unpublish. Try again.");
        return;
      }
      setStatus({ published: false, url: null });
    });
  };

  return (
    <div className="rounded-lg border border-[var(--lc-line)] bg-[var(--lc-surface)]/30 p-3.5 text-left">
      <div className="flex items-start gap-2">
        <Share2 className="mt-0.5 size-4 shrink-0 text-[var(--lc-muted)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--lc-ink)]">Share what you built</p>
          <p className="mt-0.5 text-xs text-[var(--lc-muted)]">
            A public page with an animated diagram of this agent&apos;s workflow. Nothing goes
            public until you publish.
          </p>

          {status?.published && status.url ? (
            <div className="mt-3 space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <Check className="size-3.5" aria-hidden /> Published
              </p>
              <a
                href={status.url}
                target="_blank"
                rel="noreferrer"
                className="block truncate text-xs text-primary hover:underline"
              >
                {status.url}
              </a>
              <button
                type="button"
                onClick={unpublish}
                disabled={pending}
                className="crm-button-secondary inline-flex h-8 items-center px-3 text-xs"
              >
                Unpublish
              </button>
            </div>
          ) : preview ? (
            <div className="mt-3 space-y-2">
              <ul className="space-y-1.5">
                {preview.steps.map((step, i) => (
                  <li key={i}>
                    <input
                      value={step.label}
                      onChange={(e) => editLabel(i, e.target.value)}
                      className="w-full rounded border border-[var(--lc-line)] bg-transparent px-2 py-1 text-xs text-[var(--lc-ink)]"
                    />
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={publish}
                  disabled={pending}
                  className="crm-button-primary inline-flex h-8 items-center px-3 text-xs"
                >
                  {pending ? "Publishing…" : "Publish"}
                </button>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  disabled={pending}
                  className="crm-button-secondary inline-flex h-8 items-center px-3 text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={loadPreview}
              disabled={pending}
              className="crm-button-secondary mt-3 inline-flex h-8 items-center gap-1.5 px-3 text-xs"
            >
              <Share2 className="size-3.5" aria-hidden />
              {pending ? "Building preview…" : "Preview a share card"}
            </button>
          )}

          {error ? <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
