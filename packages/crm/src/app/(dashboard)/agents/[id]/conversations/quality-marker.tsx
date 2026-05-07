"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markConversationQualityAction } from "@/lib/agents/actions";

export function QualityMarker(props: {
  conversationId: string;
  initialQuality: "good" | "bad" | null;
  initialNotes: string | null;
}) {
  const [quality, setQuality] = useState<"good" | "bad" | null>(
    props.initialQuality,
  );
  const [notes, setNotes] = useState(props.initialNotes ?? "");
  const [isPending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const router = useRouter();

  const save = (next: { q?: "good" | "bad" | null; n?: string }) => {
    const finalQ = next.q !== undefined ? next.q : quality;
    const finalN = next.n !== undefined ? next.n : notes;
    if (next.q !== undefined) setQuality(finalQ);
    if (next.n !== undefined) setNotes(finalN);
    startTransition(async () => {
      const result = await markConversationQualityAction({
        conversationId: props.conversationId,
        quality: finalQ,
        notes: finalN.trim() || undefined,
      });
      if (result.ok) {
        setSavedAt(Date.now());
        router.refresh();
      }
    });
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted-foreground">Quality:</span>
      <button
        type="button"
        disabled={isPending}
        onClick={() => save({ q: quality === "good" ? null : "good" })}
        className={`rounded-full px-3 py-1 transition-colors ${
          quality === "good"
            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
            : "border bg-card hover:bg-muted/50"
        }`}
      >
        ✓ Good
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => save({ q: quality === "bad" ? null : "bad" })}
        className={`rounded-full px-3 py-1 transition-colors ${
          quality === "bad"
            ? "bg-rose-500/15 text-rose-700 dark:text-rose-400"
            : "border bg-card hover:bg-muted/50"
        }`}
      >
        ✗ Bad
      </button>
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => {
          if (notes !== (props.initialNotes ?? "")) save({});
        }}
        placeholder="Notes (optional)"
        className="flex-1 min-w-[200px] rounded border bg-background px-2 py-1 focus:border-primary focus:outline-none"
      />
      {savedAt && (
        <span className="text-emerald-600 dark:text-emerald-400">✓ saved</span>
      )}
    </div>
  );
}
