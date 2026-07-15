"use client";

import { useState, useTransition } from "react";
import type { AgentActionDraftRow } from "@/db/schema/agent-action-drafts";
import { approveDraftAction, dismissDraftAction } from "./actions";

export function DraftRow({ draft }: { draft: AgentActionDraftRow }) {
  const [pendingAction, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [conflict, setConflict] = useState(false);

  const act = (fn: (id: string) => Promise<{ ok: boolean; conflict?: boolean }>) =>
    startTransition(async () => {
      const out = await fn(draft.id);
      if (!out.ok && out.conflict) setConflict(true);
    });

  return (
    <li className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium">{draft.title}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {draft.stepAction} · {draft.kind} · agent {draft.agentId}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm"
            disabled={pendingAction}
            onClick={() => act(dismissDraftAction)}
          >
            Dismiss
          </button>
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
            disabled={pendingAction}
            onClick={() => act(approveDraftAction)}
          >
            Approve
          </button>
        </div>
      </div>
      <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
        {draft.content.body}
      </pre>
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          className="text-xs underline"
          onClick={async () => {
            await navigator.clipboard.writeText(draft.content.body);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy draft"}
        </button>
        {conflict ? (
          <span className="text-xs text-amber-600">
            Already resolved elsewhere — refresh to see the latest state.
          </span>
        ) : null}
      </div>
    </li>
  );
}
