// packages/crm/src/components/landing/landing-mode.tsx
//
// Client shell for the dual-path landing (spec 2026-07-13 §3.2).
// Owns: mode state, the data-mode attribute the token layer keys off,
// and the cosmetic URL update. Build/record stacks arrive as
// server-rendered children — this file adds no section content.
//
// URL strategy: on `/` the flip is instant client state +
// history.replaceState (no Next navigation — a router.push round-trip
// would delay the flip). On `/record`, flipping back to the website
// path is a real navigation to `/` (you arrived on a deep link).

"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Globe } from "lucide-react";
import type { LandingMode } from "@/app/(public)/landing-mode";
import { FlickerGrid } from "@/components/landing/flicker-grid";

// Theme tokens live in ./landing-theme.css, imported by the page-level
// composition (unified-landing.tsx) — NOT here, so this client component
// stays importable under the node:test harness (no CSS loader in tsx).

const LandingModeContext = createContext<{
  mode: LandingMode;
  recordEnabled: boolean;
  setMode: (next: LandingMode) => void;
} | null>(null);

export function useLandingMode() {
  const ctx = useContext(LandingModeContext);
  if (!ctx) throw new Error("useLandingMode must render inside <LandingModeShell>");
  return ctx;
}

export function LandingModeShell({
  initialMode,
  recordEnabled,
  urlStrategy,
  nav,
  buildStack,
  recordStack,
  footer,
}: {
  initialMode: LandingMode;
  recordEnabled: boolean;
  /** "replace-state" on /, "navigate-home" on /record */
  urlStrategy: "replace-state" | "navigate-home";
  nav: ReactNode;
  buildStack: ReactNode;
  recordStack: ReactNode;
  footer: ReactNode;
}) {
  const [mode, setModeState] = useState<LandingMode>(recordEnabled ? initialMode : "build");

  const setMode = useCallback(
    (next: LandingMode) => {
      if (next === "record" && !recordEnabled) return;
      if (next === "build" && urlStrategy === "navigate-home") {
        window.location.assign("/");
        return;
      }
      setModeState(next);
      if (urlStrategy === "replace-state") {
        window.history.replaceState(null, "", next === "record" ? "/?mode=record" : "/");
      }
    },
    [recordEnabled, urlStrategy],
  );

  // Grid intensity: a 25%-dimmed baseline (0.75) that additionally FADES on
  // scroll — full through the hero, down to 0 at the "how it works" (#build)
  // section, then ramping slowly back up from "wired together" (#modules).
  const BASE = 0.75;
  const [gridOpacity, setGridOpacity] = useState(BASE);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const build = document.getElementById("build");
      const modules = document.getElementById("modules");
      let f = 1;
      if (build) {
        const bTop = build.offsetTop - window.innerHeight * 0.5;
        const mTop = modules ? modules.offsetTop - window.innerHeight * 0.3 : bTop + 1400;
        if (y <= 0) f = 1;
        else if (y < bTop) f = 1 - y / bTop; // hero → how-it-works: 1 → 0
        else if (y < mTop) f = 0; // how-it-works → wired-together: hidden
        else f = Math.min(1, (y - mTop) / 1600); // wired-together onward: 0 → 1 (slow)
      }
      setGridOpacity(BASE * Math.max(0, Math.min(1, f)));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <LandingModeContext.Provider value={{ mode, recordEnabled, setMode }}>
      <div
        data-mode={mode}
        className="lp-root relative min-h-screen bg-[var(--lp-bg)] text-[var(--lp-ink)] selection:bg-[var(--lp-accent)]/20 selection:text-[var(--lp-accent)]"
      >
        {/* Page-wide flickering-grid backdrop — one fixed layer behind every
            section. Transparent (parchment) sections reveal it; alt bands and
            dark slabs stay opaque and cover it. Themed via --lp-fg-color. */}
        <div
          className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-150"
          style={{ opacity: gridOpacity }}
          aria-hidden
        >
          <FlickerGrid color="var(--lp-fg-color)" />
        </div>

        <div className="relative z-10">
        {nav}
        <main id="main-content">
          {/* Build stack stays mounted-but-hidden so hero input state
              survives a round-trip flip; record stack mounts on demand
              so its client bundle doesn't hydrate on the default view.
              This mounted-but-hidden trick only makes sense where the
              in-place flip exists (urlStrategy === "replace-state", i.e.
              on `/`). On `/record`, flipping to build is a full
              navigation (setMode("build") calls window.location.assign
              and `mode` never becomes "build" there), so mounting the
              build stack on that route is provably dead weight — and it
              was producing a duplicate FAQPage schema + duplicate
              element ids on an indexable page. */}
          {urlStrategy === "replace-state" ? (
            <div hidden={mode !== "build"} className="lp-stack">
              {buildStack}
            </div>
          ) : null}
          {mode === "record" ? <div className="lp-stack">{recordStack}</div> : null}
        </main>
        {footer}
        </div>
      </div>
    </LandingModeContext.Provider>
  );
}

/** Segmented two-mode control — renders at the top of BOTH hero cards
 *  (build: marketing-hero form card; record: record-hero card).
 *  Null when the record flag is off: the landing looks exactly as today. */
export function HeroModeSwitch() {
  const { mode, recordEnabled, setMode } = useLandingMode();
  if (!recordEnabled) return null;

  const base =
    "inline-flex h-[38px] items-center justify-center gap-2 rounded-[8px] px-3 text-[13.5px] transition-colors";
  const active = "bg-[var(--lp-card)] font-[600] text-[var(--lp-ink)] shadow-[0_1px_3px_rgba(0,0,0,.14)]";
  const idle = "font-[500] text-[var(--lp-muted)] hover:text-[var(--lp-ink)]";

  return (
    <div
      role="tablist"
      aria-label="How do you want to show Seldon your business?"
      className="grid w-full grid-cols-2 gap-1 rounded-[12px] border border-[var(--lp-border-soft)] bg-[var(--lp-bg)] p-1"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "build"}
        onClick={() => setMode("build")}
        className={`${base} ${mode === "build" ? active : idle}`}
      >
        <Globe size={14} className="shrink-0" aria-hidden />
        From your website
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "record"}
        onClick={() => setMode("record")}
        className={`${base} ${mode === "record" ? active : idle}`}
      >
        <span className="size-2 shrink-0 rounded-full bg-[#E5484D]" aria-hidden />
        From a recording
      </button>
    </div>
  );
}
