"use client";

// Simple-home command bar (Task 7) — the front door becomes page chrome.
// Sticky bar mounted between DashboardTopbar and {children} inside the
// scroll column. Submitting dispatches "seldonchat:open" with a prefill
// detail so SeldonChat (the existing floating dock, unchanged apart from
// listening for prefill/chips/hideLauncher) picks it up and opens itself.
// On mount (once, when autoOpenOnce), it also dispatches the same event
// with starter chips and fires markChatIntroSeenAction() in the background
// so the intro never re-fires for this org.

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { markChatIntroSeenAction } from "@/lib/workspace/surface-actions";

type CommandBarProps = {
  enabled: boolean;
  autoOpenOnce: boolean;
  chips: string[];
};

function dispatchOpen(detail: { prefill?: string; chips?: string[] }) {
  window.dispatchEvent(new CustomEvent("seldonchat:open", { detail }));
}

export function CommandBar({ enabled, autoOpenOnce, chips }: CommandBarProps) {
  const [value, setValue] = useState("");
  const firedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !autoOpenOnce || firedRef.current) return;
    firedRef.current = true;
    dispatchOpen({ chips });
    void markChatIntroSeenAction();
    // Only ever runs once per mount — autoOpenOnce/chips are stable inputs
    // computed server-side for the lifetime of this page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, autoOpenOnce]);

  if (!enabled) {
    return null;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    dispatchOpen({ prefill: trimmed });
    setValue("");
  }

  return (
    <div className="sticky top-0 z-20 -mx-4 mb-2 border-b border-border/80 bg-card/88 px-4 py-2.5 shadow-(--shadow-xs) backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      {/* Mobile (<640px): a full-width button that opens the panel — no
          inline text input on small screens. */}
      <button
        type="button"
        onClick={() => dispatchOpen({})}
        className="flex w-full items-center gap-2 rounded-xl border border-border/80 bg-background/80 px-3 py-2 text-left text-sm text-muted-foreground shadow-(--shadow-xs) transition-colors hover:border-border hover:bg-background sm:hidden"
        aria-label="Ask SeldonChat"
      >
        <Sparkles className="size-4 shrink-0" />
        Ask SeldonChat — change anything
      </button>

      {/* Desktop/tablet (>=640px): compact single-row inline input. */}
      <form onSubmit={handleSubmit} className="hidden items-center gap-2 sm:flex">
        <Sparkles className="size-4 shrink-0 text-muted-foreground" />
        <input
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Ask SeldonChat — change anything"
          aria-label="Ask SeldonChat"
          className="h-9 w-full flex-1 rounded-xl border border-border/80 bg-background/80 px-3 text-sm text-foreground shadow-(--shadow-xs) outline-none transition-colors placeholder:text-muted-foreground focus:border-border focus:bg-background"
        />
      </form>
    </div>
  );
}
