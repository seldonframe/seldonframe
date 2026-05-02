"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Bug,
  HelpCircle,
  MessageCircle,
  X,
} from "lucide-react";

/**
 * May 1, 2026 — persistent help button on every admin page.
 *
 * Floating circle in the bottom-right corner that opens a small
 * popover with three escape hatches:
 *   - Join Discord (community Q&A, opens in new tab)
 *   - Documentation (in-app /docs)
 *   - Report a bug (GitHub issues, opens in new tab)
 *
 * Pinned to the viewport via fixed position so it stays available
 * regardless of scroll. z-index sits above the dashboard grid but
 * below modals/sheets (those use z-50+ themselves).
 *
 * Closes on:
 *   - X button
 *   - Click outside the popover
 *   - Escape key
 */

const DISCORD_INVITE = "https://discord.gg/sbVUu976NW";
const GITHUB_ISSUES = "https://github.com/seldonframe/seldonframe/issues/new";

export function HelpButton() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="fixed bottom-5 right-5 z-40 print:hidden"
    >
      {open ? (
        <div className="mb-3 w-64 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-foreground">Need help?</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close help menu"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          <ul className="py-1 text-sm">
            <li>
              <a
                href={DISCORD_INVITE}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-foreground transition-colors hover:bg-muted/60"
              >
                <MessageCircle className="size-4 text-[#5865f2]" />
                <span className="flex-1">Join Discord</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Live
                </span>
              </a>
            </li>
            <li>
              <a
                href="/docs"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-foreground transition-colors hover:bg-muted/60"
              >
                <BookOpen className="size-4 text-muted-foreground" />
                <span className="flex-1">Documentation</span>
              </a>
            </li>
            <li>
              <a
                href={GITHUB_ISSUES}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-foreground transition-colors hover:bg-muted/60"
              >
                <Bug className="size-4 text-muted-foreground" />
                <span className="flex-1">Report a bug</span>
              </a>
            </li>
          </ul>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? "Close help" : "Open help"}
        aria-expanded={open}
        className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-1 ring-black/5 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <HelpCircle className="size-5" />
      </button>
    </div>
  );
}
