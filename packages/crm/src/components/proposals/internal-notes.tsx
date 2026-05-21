"use client";

// packages/crm/src/components/proposals/internal-notes.tsx
// 2026-05-20 — Phase C: operator-only freeform notes, append-only.

import { useState, useTransition } from "react";
import type { ProposalInternalNote } from "@/db/schema/proposals";
import { Button } from "@/components/ui/button";
import { addProposalNoteAction } from "@/lib/proposals/actions";

export function InternalNotes({
  proposalId,
  notes,
}: {
  proposalId: string;
  notes: ProposalInternalNote[];
}) {
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    if (!draft.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await addProposalNoteAction({ id: proposalId, body: draft });
      if (!result.ok) setError(result.error);
      else setDraft("");
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
          Internal notes
        </h3>
        <p className="text-xs text-muted-foreground">
          Operator-only · not visible to prospect
        </p>
      </div>
      <div className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note about this prospect…"
          rows={2}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
        />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={isPending || !draft.trim()}
          >
            {isPending ? "Adding…" : "Add note"}
          </Button>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </div>
      {notes.length > 0 ? (
        <ul className="space-y-2 pt-2 border-t border-border/50">
          {notes
            .slice()
            .reverse()
            .map((note, idx) => (
              <li
                key={idx}
                className="rounded-md border border-border/70 bg-card/50 p-3"
              >
                <p className="text-sm whitespace-pre-wrap">{note.body}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(note.createdAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </li>
            ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground italic">No notes yet.</p>
      )}
    </section>
  );
}
