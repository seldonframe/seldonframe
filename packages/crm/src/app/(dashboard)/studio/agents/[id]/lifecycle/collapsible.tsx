"use client";

// Agent lifecycle slice (T4, page restructure) — a tiny generic disclosure
// used for the "Configure the agent" area folded inside the Learned stage.
// Not the stage accordion itself (agent-lifecycle-accordion.tsx) — that one
// enforces ONE stage open at a time; this is a plain independent toggle.

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function Collapsible({
  label,
  defaultOpen = false,
  children,
}: {
  label: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-[var(--lc-line)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-[var(--lc-ink)]"
      >
        <span>{label}</span>
        <ChevronDown
          aria-hidden
          className={`size-4 shrink-0 text-[var(--lc-muted)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? <div className="border-t border-[var(--lc-line)] p-3">{children}</div> : null}
    </div>
  );
}
