"use client";

// idle-scene.tsx — Idle State v3 port.
//
// 2026-05-22 — Foreign-embed fix. The previous version wrapped the whole
// scene in a <Stage width=720 height=960> dark canvas, so the dashboard
// rendered a letterboxed dark card floating inside the host chrome — in
// light mode it looked like a foreign embed, in dark mode it drew a hard
// containment edge that didn't blend.
//
// v3 fixes the architecture, not the cosmetics:
//   1. FLOW COMPONENT — no fixed pixel dimensions. The <section> fills its
//      grid cell via `flex: 1; min-height: 0`. The Stage wrapper is gone.
//   2. HOST CSS VARS — reads `--background`, `--foreground`, `--primary`,
//      `--card`, `--border`, `--muted`, `--muted-foreground`, `--input`,
//      `--ring`, `--accent`, `--accent-foreground`, `--primary-foreground`
//      straight off :root / .dark. No localStorage. No internal theme
//      state. No `next-themes` either — the cascade does the work.
//   3. AMBIENT ATMOSPHERE — radial wash + grid mask on the primary tint
//      at z-index 0, NOT a nested rounded dark card. The page background
//      IS the surface; the atmosphere gives it warmth without drawing a
//      card boundary.
//
// External API is preserved: the parent (clients-new-form.tsx) calls
// IdleScene with url/bizInfo input pairs, two submit callbacks, a
// disabled boolean per mode, an optional errorOverlay, and an optional
// initialTab. The contract is the same as the Phase Q version.
//
// What's intentionally NOT here:
//   - Internal breadcrumb (`.crumb` in v3 HTML) — the dashboard chrome
//     above the content area already renders "New Client / Stay focused
//     on the current client workspace". Don't duplicate it.
//   - Demo theme toggle button in v3 — mockup-only. The dashboard's
//     existing theme switcher is the production toggle.
//   - Idle State v2's `Stage` wrapper, `ParticleDrift`, `RegisterMarks`,
//     `IdleBackdrop`, `IdleFooter`, `BuildCta`, `UrlInput`, `Kbd`,
//     `BizInfoTextarea`, `SegmentedTabs`, `HeroColumn`, `Scene` —
//     ported as flow-component equivalents using host CSS vars.

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";

// ── Typewriter placeholder examples (cycles while the input is idle) ─────────

const URL_PLACEHOLDERS = [
  "https://your-clients-hvac-company.com",
  "https://example-roofing.com",
  "https://example-dental.com",
  "https://stocktonheating.com",
] as const;

const BIZ_PLACEHOLDERS = [
  "Family-owned HVAC in Stockton, CA. 24/7 emergency service. Licensed C-20, bonded, insured. 4.8★ on Google with 412 reviews.",
  "Heritage roofer, third generation. Slate + tile specialists. 30-year workmanship guarantee. Insured, OSHA-certified crews.",
  "Family-owned residential lawn care in Raleigh, NC. Weekly mowing, no contracts, same crew every visit. Friendly voice. 4.8★ on Google.",
] as const;

// One example cycle every ~3.5s. Typewriter speed: type 35ms/char, hold 1.6s,
// delete 18ms/char, hold 220ms before next example. Reduced-motion users see
// only the first example, statically.
const TYPE_MS_PER_CHAR = 35;
const DELETE_MS_PER_CHAR = 18;
const HOLD_AFTER_TYPE_MS = 1600;
const HOLD_AFTER_DELETE_MS = 220;

// ── Phase ticker (the right aside) ───────────────────────────────────────────

const IDLE_PHASES = [
  { n: "01", name: "Scan", desc: "reading the site" },
  { n: "02", name: "Identity", desc: "pulling brand voice" },
  { n: "03", name: "Structure", desc: "mapping entities" },
  { n: "04", name: "Modules", desc: "CRM · bookings · intake" },
  { n: "05", name: "Activation", desc: "seeding example data" },
  { n: "06", name: "Reveal", desc: "workspace ready" },
] as const;

const SHIMMER_INTERVAL_MS = 1600;

// ── Public types ─────────────────────────────────────────────────────────────

export type IdleSceneProps = {
  // URL mode
  url: string;
  onUrlChange: (next: string) => void;
  onUrlSubmit: () => void;
  urlDisabled?: boolean;
  // Biz-info mode (paste path)
  bizInfo: string;
  onBizInfoChange: (next: string) => void;
  onBizInfoSubmit: () => void;
  bizInfoDisabled?: boolean;
  // Shared
  errorOverlay?: ReactNode;
  // Optional initial tab so the marketing-prompt forwarder can land the
  // visitor on the right input when they passed ?biz= (no URL). Defaults
  // to "url" — the more common path.
  initialTab?: "url" | "biz";
};

type TabId = "url" | "biz";

// ── Typewriter hook ──────────────────────────────────────────────────────────
// Cycles through `examples` to fill a placeholder string. Pauses when
// `paused` is true (input focused or has user text). Returns the empty
// string + the first example on reduced-motion (no animation).

function useTypewriterPlaceholder(
  examples: readonly string[],
  paused: boolean,
  reduced: boolean,
): string {
  const [text, setText] = useState<string>(examples[0] ?? "");
  const idxRef = useRef(0);

  useEffect(() => {
    if (reduced) {
      // Reduced-motion: show first example, static.
      setText(examples[0] ?? "");
      return;
    }
    if (paused) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (fn: () => void, ms: number) => {
      timer = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
    };

    const typeNext = (target: string, pos = 0) => {
      if (cancelled) return;
      if (pos > target.length) {
        schedule(() => deleteNext(target, target.length), HOLD_AFTER_TYPE_MS);
        return;
      }
      setText(target.slice(0, pos));
      schedule(() => typeNext(target, pos + 1), TYPE_MS_PER_CHAR);
    };

    const deleteNext = (target: string, pos: number) => {
      if (cancelled) return;
      if (pos < 0) {
        idxRef.current = (idxRef.current + 1) % examples.length;
        const next = examples[idxRef.current] ?? "";
        schedule(() => typeNext(next, 0), HOLD_AFTER_DELETE_MS);
        return;
      }
      setText(target.slice(0, pos));
      schedule(() => deleteNext(target, pos - 1), DELETE_MS_PER_CHAR);
    };

    const current = examples[idxRef.current] ?? "";
    typeNext(current, current.length); // start with full + roll into delete
    // (Initial render shows the example fully; the cycle begins by
    // holding then deleting then typing the next one.)

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [examples, paused, reduced]);

  return text;
}

// ── IdleScene ────────────────────────────────────────────────────────────────

export function IdleScene({
  url,
  onUrlChange,
  onUrlSubmit,
  urlDisabled = false,
  bizInfo,
  onBizInfoChange,
  onBizInfoSubmit,
  bizInfoDisabled = false,
  errorOverlay,
  initialTab = "url",
}: IdleSceneProps) {
  const [tab, setTab] = useState<TabId>(initialTab);
  const [urlFocused, setUrlFocused] = useState(false);
  const [bizFocused, setBizFocused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [shimmerIdx, setShimmerIdx] = useState(0);

  const urlInputRef = useRef<HTMLInputElement>(null);
  const bizInputRef = useRef<HTMLTextAreaElement>(null);

  // a11y label ids (stable)
  const urlLabelId = useId();
  const bizLabelId = useId();

  // Detect prefers-reduced-motion once + listen for changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = () => setReduced(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Cycle the shimmer phase highlight every 1.6s. Skip on reduced-motion.
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      setShimmerIdx((i) => (i + 1) % IDLE_PHASES.length);
    }, SHIMMER_INTERVAL_MS);
    return () => clearInterval(id);
  }, [reduced]);

  // Typewriter placeholders. Pause when:
  //   - the input is focused (operator may be reading/typing)
  //   - the field already has user text (placeholder isn't visible anyway)
  const urlPlaceholder = useTypewriterPlaceholder(
    URL_PLACEHOLDERS,
    urlFocused || url.length > 0,
    reduced,
  );
  const bizPlaceholder = useTypewriterPlaceholder(
    BIZ_PLACEHOLDERS,
    bizFocused || bizInfo.length > 0,
    reduced,
  );

  // Tab switch — focus the new input next tick.
  const switchTab = useCallback((id: TabId) => {
    setTab(id);
    // Defer to next tick so the input has mounted before focus.
    setTimeout(() => {
      if (id === "url") urlInputRef.current?.focus();
      else bizInputRef.current?.focus();
    }, 0);
  }, []);

  // ⌘↵ / Ctrl↵ global launch
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (tab === "url") {
          if (!urlDisabled && url.trim().length >= 3) onUrlSubmit();
        } else {
          if (!bizInfoDisabled && bizInfo.trim().length >= 20) onBizInfoSubmit();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    tab,
    url,
    bizInfo,
    urlDisabled,
    bizInfoDisabled,
    onUrlSubmit,
    onBizInfoSubmit,
  ]);

  // Chip example — populate the matching input and switch tabs if needed.
  const applyExample = useCallback(
    (kind: TabId, value: string) => {
      if (kind === "url") {
        onUrlChange(value);
        if (tab !== "url") switchTab("url");
        setTimeout(() => urlInputRef.current?.focus(), 0);
      } else {
        onBizInfoChange(value);
        if (tab !== "biz") switchTab("biz");
        setTimeout(() => bizInputRef.current?.focus(), 0);
      }
    },
    [tab, onUrlChange, onBizInfoChange, switchTab],
  );

  // Active submit + disabled state for the visible CTA
  const handleSubmit = useCallback(() => {
    if (tab === "url") {
      if (!urlDisabled && url.trim().length >= 3) onUrlSubmit();
    } else {
      if (!bizInfoDisabled && bizInfo.trim().length >= 20) onBizInfoSubmit();
    }
  }, [
    tab,
    url,
    bizInfo,
    urlDisabled,
    bizInfoDisabled,
    onUrlSubmit,
    onBizInfoSubmit,
  ]);

  const submitDisabled =
    tab === "url"
      ? urlDisabled || url.trim().length < 3
      : bizInfoDisabled || bizInfo.trim().length < 20;

  return (
    <section className="sf-idle">
      {/* Ambient atmosphere — radial wash + grid mask, z-index 0. No card edge. */}
      <div className="sf-idle-atmos" aria-hidden />

      {/* LEFT hero — flow column */}
      <div className="sf-idle-hero">
        <span className="sf-idle-kicker">New client workspace</span>

        <h1 className="sf-idle-headline">
          Spin up a client workspace<br />
          <span className="sf-muted">in <span className="sf-accent">60 seconds.</span></span>
        </h1>

        <p className="sf-idle-sub">
          Paste your client&apos;s website — or describe the business — and we ship the
          CRM, booking page, intake form, and AI chatbot in one pass. You keep the
          recurring revenue.
        </p>

        <form
          className="sf-idle-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          {/* Tab switcher */}
          <div
            className="sf-idle-tabs"
            role="tablist"
            aria-label="Input mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "url"}
              data-active={tab === "url" ? "yes" : "no"}
              onClick={() => switchTab("url")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18" />
                <path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
              </svg>
              Paste website URL
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "biz"}
              data-active={tab === "biz" ? "yes" : "no"}
              onClick={() => switchTab("biz")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M7 8h10M7 12h10M7 16h6" />
              </svg>
              No website? Paste business info
            </button>
          </div>

          {/* Input card — same card for both modes, swaps inner pane */}
          <div className="sf-idle-input-card">
            {tab === "url" ? (
              <div className="sf-idle-pane">
                <label id={urlLabelId} htmlFor="sf-idle-url" className="sr-only">
                  Client website URL
                </label>
                <input
                  ref={urlInputRef}
                  id="sf-idle-url"
                  type="url"
                  className="sf-idle-url"
                  value={url}
                  onChange={(e) => onUrlChange(e.target.value)}
                  onFocus={() => setUrlFocused(true)}
                  onBlur={() => setUrlFocused(false)}
                  placeholder={urlPlaceholder}
                  autoComplete="off"
                  spellCheck={false}
                  aria-labelledby={urlLabelId}
                />
              </div>
            ) : (
              <div className="sf-idle-pane">
                <label id={bizLabelId} htmlFor="sf-idle-biz" className="sr-only">
                  Business information
                </label>
                <textarea
                  ref={bizInputRef}
                  id="sf-idle-biz"
                  className="sf-idle-biz"
                  value={bizInfo}
                  onChange={(e) => onBizInfoChange(e.target.value)}
                  onFocus={() => setBizFocused(true)}
                  onBlur={() => setBizFocused(false)}
                  rows={4}
                  spellCheck={false}
                  placeholder={bizPlaceholder}
                  aria-labelledby={bizLabelId}
                />
              </div>
            )}
            <div className="sf-idle-form-foot">
              <span className="sf-idle-hint">
                <span className="sf-kbd">⌘</span>
                <span className="sf-kbd">↵</span>
                <small>to launch</small>
              </span>
              <button
                type="submit"
                className="sf-idle-submit"
                disabled={submitDisabled}
              >
                Build workspace
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            </div>
          </div>
        </form>

        {/* Quick examples */}
        <div className="sf-idle-examples">
          <span className="sf-idle-examples-lbl">Try</span>
          <button
            type="button"
            className="sf-idle-chip"
            onClick={() => applyExample("url", "https://stocktonheating.com")}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            an HVAC company
          </button>
          <button
            type="button"
            className="sf-idle-chip"
            onClick={() => applyExample("url", "https://example-roofing.com")}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 12l9-9 9 9" />
              <path d="M5 10v11h14V10" />
            </svg>
            a heritage roofer
          </button>
          <button
            type="button"
            className="sf-idle-chip"
            onClick={() => applyExample("url", "https://example-dental.com")}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="9" />
            </svg>
            a dental practice
          </button>
          <button
            type="button"
            className="sf-idle-chip"
            onClick={() =>
              applyExample(
                "biz",
                "Family-owned residential lawn care in Raleigh, NC. Weekly mowing, no contracts, same crew every visit. Friendly voice. 4.8★ on Google.",
              )
            }
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M11 22a9 9 0 0 1-9-9 9 9 0 0 1 9-9c1 5 5 9 9 9a9 9 0 0 1-9 9z" />
            </svg>
            a lawn-care business (no website)
          </button>
        </div>

        {/* Error overlay (parent-injected). Slot lives inside the hero so
            screen-readers see it adjacent to the form. */}
        {errorOverlay ? (
          <div className="sf-idle-error">{errorOverlay}</div>
        ) : null}

        <Link href="/dashboard" className="sf-idle-skip">
          <span className="sf-idle-skip-underline">Skip and set one up by hand</span>
          <span>→</span>
        </Link>
      </div>

      {/* RIGHT aside — LIVE BUILD ticker */}
      <aside className="sf-idle-aside" aria-label="Live build preview">
        <div className="sf-aside-head">
          <span className="sf-aside-tag">Live build</span>
          <span className="sf-aside-desc">We&apos;ll narrate every step.</span>
        </div>
        <div className="sf-phases">
          {IDLE_PHASES.map((ph, i) => {
            const isShimmer = !reduced && i === shimmerIdx;
            return (
              <div
                key={ph.n}
                className={`sf-phase${isShimmer ? " is-shimmer" : ""}`}
              >
                <span className="sf-phase-num">{ph.n}</span>
                <div className="sf-phase-label">
                  <span className="sf-phase-name">{ph.name}</span>
                  <span className="sf-phase-desc">{ph.desc}</span>
                </div>
                <span className="sf-phase-status">ready</span>
              </div>
            );
          })}
        </div>
        <div className="sf-aside-foot">
          <span>~60s total</span>
          <span>fully editable after</span>
        </div>
      </aside>

      <IdleStyles />
    </section>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
// styled-jsx `global` is required because the .sf-idle-* selectors are
// composed deeply (atmosphere ::before/::after, form internals, etc.) and
// scoped styled-jsx would emit per-element hash-suffixed classes the
// compound selectors can't reach. The .sf-idle- prefix keeps everything
// namespaced so we don't leak into the dashboard chrome.
//
// Theme reads: every color uses host CSS vars (var(--background),
// var(--foreground), etc.). The .dark variant lives in globals.css as
// `@custom-variant dark (&:is(.dark *))` — we don't need to redeclare
// anything. The atmosphere ::before block has a `.dark` override below
// because the radial wash needs slightly more saturation in dark mode
// to register against the near-black background.

function IdleStyles() {
  return (
    <style jsx global>{`
      .sf-idle {
        position: relative;
        /* 2026-05-23 — Mobile-first stacking fix.
           Original implementation used display:grid + grid-template-columns:1fr
           with height:100% + overflow:hidden. On a phone viewport
           the constrained container couldn't fit both children, and
           the browser ended up rendering the hero + aside on top of
           each other instead of stacking vertically. Switched mobile
           to display:flex + flex-direction:column with natural
           document scroll, and only flip to grid 2-col at the
           desktop breakpoint where it actually makes sense.

           flex:1 + min-height:0 still lets the section fill a
           flex-column parent on desktop. */
        flex: 1;
        min-height: 100%;
        display: flex;
        flex-direction: column;
        isolation: isolate;
        background: var(--background);
        color: var(--foreground);
        font-family: var(--font-geist-sans), system-ui, sans-serif;
      }
      @media (min-width: 1080px) {
        .sf-idle {
          /* Desktop: side-by-side grid, container constrained to
             viewport, hidden overflow so the atmosphere stays inside. */
          display: grid;
          grid-template-columns: minmax(0, 1.7fr) minmax(320px, 1fr);
          height: 100%;
          min-height: 0;
          overflow: hidden;
        }
      }

      /* Ambient atmosphere — radial wash + grid mask, z-index 0. No card edge. */
      .sf-idle-atmos {
        position: absolute;
        inset: 0;
        z-index: 0;
        pointer-events: none;
      }
      .sf-idle-atmos::before {
        content: '';
        position: absolute;
        inset: 0;
        background:
          radial-gradient(70% 60% at 18% 70%, color-mix(in oklab, var(--primary) 7%, transparent), transparent 70%),
          radial-gradient(60% 50% at 85% 25%, color-mix(in oklab, var(--accent) 50%, transparent), transparent 70%);
      }
      :is(.dark) .sf-idle-atmos::before {
        background:
          radial-gradient(70% 60% at 18% 70%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 70%),
          radial-gradient(60% 50% at 85% 25%, color-mix(in oklab, var(--primary) 8%, transparent), transparent 70%);
      }
      .sf-idle-atmos::after {
        content: '';
        position: absolute;
        inset: 0;
        background-image:
          linear-gradient(color-mix(in oklab, var(--foreground) 4%, transparent) 1px, transparent 1px),
          linear-gradient(90deg, color-mix(in oklab, var(--foreground) 4%, transparent) 1px, transparent 1px);
        background-size: 48px 48px;
        -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 88%);
        mask-image: radial-gradient(ellipse at center, black 30%, transparent 88%);
        opacity: 0.6;
      }

      /* HERO column.
         2026-05-23 — Bug fix: when the hero content is taller than the
         viewport-minus-chrome (e.g. shorter laptop screens, browsers with
         the dev tools docked), justify-content:center combined with the
         .sf-idle wrapper's overflow:hidden clipped the top of the
         "Spin up a client workspace…" headline against the dashboard
         chrome's bottom edge. Switched to justify-content:flex-start and
         bumped the top padding so the headline always clears the chrome
         with ~24-32px of breathing room. The content still feels
         centered on tall viewports because the bottom of the column has
         the typewriter chips + skip link absorbing any remaining space. */
      .sf-idle-hero {
        position: relative;
        z-index: 1;
        /* 2026-05-23 — mobile polish: tighter padding + gap so the hero
           breathes properly on a phone viewport. 96px top + 32px gap
           was pushing the form below the fold on iPhone-12-sized
           viewports and giving a cluttered feel. */
        padding: 40px 18px 32px;
        display: flex;
        flex-direction: column;
        gap: 18px;
        justify-content: flex-start;
        min-height: 0;
      }
      @media (min-width: 640px) { .sf-idle-hero { padding: 72px 28px 56px; gap: 24px; } }
      @media (min-width: 768px) { .sf-idle-hero { padding: 112px 56px 80px; gap: 36px; } }
      @media (min-width: 1280px) { .sf-idle-hero { padding: 120px 88px 96px; gap: 40px; } }

      .sf-idle-kicker {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-family: var(--font-geist-mono), ui-monospace, monospace;
        font-size: 11px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--primary);
      }
      .sf-idle-kicker::before {
        content: '';
        width: 22px;
        height: 1px;
        background: currentColor;
        opacity: 0.55;
      }

      .sf-idle-headline {
        margin: 0;
        font-family: var(--font-geist-sans), system-ui, sans-serif;
        font-weight: 600;
        /* 2026-05-23 — mobile polish: bottom of the clamp dropped from 40px
           to 30px so the headline doesn't wrap to 5+ lines on iPhone-SE
           viewports. The viewport-based middle term (6vw) still scales up
           smoothly on tablet/desktop. */
        font-size: clamp(30px, 6vw, 76px);
        letter-spacing: -0.030em;
        line-height: 1.04;
        color: var(--foreground);
        text-wrap: balance;
        max-width: 920px;
      }
      .sf-idle-headline .sf-muted {
        color: var(--muted-foreground);
        font-weight: 500;
      }
      .sf-idle-headline .sf-accent {
        color: var(--primary);
      }

      .sf-idle-sub {
        margin: 0;
        max-width: 580px;
        font-size: clamp(15px, 1.4vw, 17.5px);
        line-height: 1.6;
        color: var(--muted-foreground);
        text-wrap: pretty;
      }

      .sf-idle-form {
        max-width: 720px;
      }

      .sf-idle-tabs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4px;
        padding: 4px;
        background: var(--muted);
        border: 1px solid var(--border);
        border-radius: 10px;
        margin-bottom: 12px;
      }
      .sf-idle-tabs button {
        height: 38px;
        padding: 0 12px;
        background: transparent;
        border: none;
        border-radius: 7px;
        color: var(--muted-foreground);
        font-family: inherit;
        font-size: 13px;
        font-weight: 500;
        letter-spacing: -0.005em;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        cursor: pointer;
        transition: background 180ms ease, color 160ms ease, box-shadow 180ms ease;
        white-space: nowrap;
      }
      .sf-idle-tabs button:hover {
        color: var(--foreground);
      }
      .sf-idle-tabs button[data-active="yes"] {
        background: var(--card);
        color: var(--foreground);
        font-weight: 600;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06), 0 0 0 1px var(--border);
      }

      .sf-idle-input-card {
        position: relative;
        background: var(--card);
        border: 1px solid var(--input);
        border-radius: 12px;
        box-shadow: var(--shadow-card);
        transition: border-color 220ms ease, box-shadow 220ms ease;
      }
      .sf-idle-input-card:focus-within {
        border-color: var(--ring);
        box-shadow:
          0 0 0 3px color-mix(in oklab, var(--ring) 22%, transparent),
          var(--shadow-card);
      }

      .sf-idle-pane {
        padding: 16px 18px;
      }

      .sf-idle-url {
        display: block;
        width: 100%;
        height: 36px;
        background: transparent;
        border: none;
        outline: none;
        color: var(--foreground);
        font-family: var(--font-geist-mono), ui-monospace, monospace;
        font-size: 15px;
        caret-color: var(--primary);
      }
      .sf-idle-url::placeholder {
        color: var(--muted-foreground);
        opacity: 0.7;
      }

      .sf-idle-biz {
        display: block;
        width: 100%;
        min-height: 100px;
        background: transparent;
        border: none;
        outline: none;
        resize: none;
        color: var(--foreground);
        font-family: var(--font-geist-sans), system-ui, sans-serif;
        font-size: 14.5px;
        line-height: 1.55;
        caret-color: var(--primary);
      }
      .sf-idle-biz::placeholder {
        color: var(--muted-foreground);
        opacity: 0.65;
      }

      .sf-idle-form-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px 14px;
        gap: 14px;
      }

      .sf-idle-hint {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-family: var(--font-geist-mono), ui-monospace, monospace;
        font-size: 11.5px;
        color: var(--muted-foreground);
      }
      .sf-idle-hint small {
        font-size: inherit;
        font-family: inherit;
      }
      .sf-kbd {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 20px;
        height: 20px;
        padding: 0 5px;
        background: var(--muted);
        border: 1px solid var(--border);
        border-radius: 5px;
        color: var(--muted-foreground);
        font-size: 11px;
        line-height: 1;
      }

      .sf-idle-submit {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        height: 44px;
        padding: 0 18px;
        background: var(--primary);
        color: var(--primary-foreground);
        border: 1px solid var(--primary);
        border-radius: 10px;
        font-family: inherit;
        font-size: 14.5px;
        font-weight: 600;
        letter-spacing: -0.005em;
        box-shadow: 0 8px 24px color-mix(in oklab, var(--primary) 28%, transparent);
        cursor: pointer;
        transition: filter 160ms ease, transform 120ms ease, opacity 160ms ease, box-shadow 160ms ease;
      }
      .sf-idle-submit:hover:not(:disabled) {
        filter: brightness(1.05);
      }
      .sf-idle-submit:active:not(:disabled) {
        transform: translateY(1px);
      }
      .sf-idle-submit:disabled {
        opacity: 0.55;
        cursor: not-allowed;
        box-shadow: none;
      }

      .sf-idle-examples {
        margin-top: 6px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        max-width: 720px;
      }
      .sf-idle-examples-lbl {
        font-family: var(--font-geist-mono), ui-monospace, monospace;
        font-size: 10.5px;
        letter-spacing: 0.10em;
        text-transform: uppercase;
        color: var(--muted-foreground);
        margin-right: 2px;
      }
      .sf-idle-chip {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 6px 11px;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 999px;
        color: var(--muted-foreground);
        font-family: inherit;
        font-size: 12.5px;
        font-weight: 500;
        letter-spacing: -0.003em;
        cursor: pointer;
        transition: background 160ms ease, color 160ms ease, border-color 160ms ease, transform 120ms ease;
      }
      .sf-idle-chip:hover {
        background: var(--muted);
        color: var(--foreground);
        border-color: color-mix(in oklab, var(--primary) 20%, var(--border));
        transform: translateY(-1px);
      }
      .sf-idle-chip svg {
        color: var(--primary);
      }

      .sf-idle-error {
        max-width: 720px;
      }

      .sf-idle-skip {
        font-size: 13px;
        color: var(--muted-foreground);
        display: inline-flex;
        align-items: center;
        gap: 6px;
        align-self: flex-start;
        text-decoration: none;
        transition: color 160ms ease;
      }
      .sf-idle-skip:hover { color: var(--foreground); }
      .sf-idle-skip-underline {
        border-bottom: 1px dotted color-mix(in oklab, var(--muted-foreground) 50%, transparent);
        padding-bottom: 1px;
      }

      /* RIGHT aside — LIVE BUILD.
         Top padding mirrors .sf-idle-hero so the "Live build" tag aligns
         with the hero kicker visually. */
      .sf-idle-aside {
        position: relative;
        z-index: 1;
        padding: 96px 32px 56px;
        display: flex;
        flex-direction: column;
        gap: 24px;
        background: linear-gradient(180deg,
          color-mix(in oklab, var(--card) 50%, transparent) 0%,
          transparent 100%);
        border-left: 1px solid var(--border);
      }
      @media (max-width: 1079px) {
        .sf-idle-aside {
          border-left: none;
          border-top: 1px solid var(--border);
          /* 2026-05-23 — mobile polish: tighter aside padding so it
             doesn't add another 80px of dead space below the form on a
             phone viewport. */
          padding: 28px 18px 36px;
          gap: 16px;
        }
      }
      @media (max-width: 639px) {
        /* On very small viewports, drop the per-phase descriptions —
           the 6-row phase list with name + desc + READY chip stacks
           into way too much vertical real estate before the user has
           even submitted. Just the labels + status chips. */
        .sf-idle-aside .sf-phase-desc { display: none; }
        .sf-idle-aside .sf-phase { padding: 10px 0; }
      }
      @media (min-width: 1080px) {
        .sf-idle-aside { padding: 120px 44px 96px; }
      }

      .sf-aside-head {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-bottom: 18px;
        border-bottom: 1px solid var(--border);
      }
      .sf-aside-tag {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-family: var(--font-geist-mono), ui-monospace, monospace;
        font-size: 10.5px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--primary);
      }
      .sf-aside-tag::before {
        content: '';
        width: 7px;
        height: 7px;
        border-radius: 4px;
        background: var(--primary);
        box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 22%, transparent);
        animation: sf-idle-blink 2s ease-in-out infinite;
      }
      .sf-aside-desc {
        font-size: 13.5px;
        color: var(--muted-foreground);
      }
      @keyframes sf-idle-blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      .sf-phases {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
      }
      .sf-phase {
        display: grid;
        grid-template-columns: 24px 1fr auto;
        gap: 14px;
        align-items: center;
        padding: 14px 0;
        border-top: 1px solid var(--border);
        position: relative;
      }
      .sf-phase:first-child { border-top: none; }
      .sf-phase-num {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-family: var(--font-geist-mono), ui-monospace, monospace;
        font-size: 11px;
        color: var(--muted-foreground);
        font-variant-numeric: tabular-nums;
        border: 1px solid var(--border);
        border-radius: 4px;
        width: 22px;
        height: 22px;
      }
      .sf-phase-label {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .sf-phase-name {
        font-family: var(--font-geist-mono), ui-monospace, monospace;
        font-size: 11.5px;
        font-weight: 500;
        letter-spacing: 0.10em;
        text-transform: uppercase;
        color: var(--foreground);
      }
      .sf-phase-desc {
        font-size: 13px;
        color: var(--muted-foreground);
        letter-spacing: -0.005em;
        line-height: 1.4;
      }
      .sf-phase-status {
        font-family: var(--font-geist-mono), ui-monospace, monospace;
        font-size: 10.5px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted-foreground);
        opacity: 0.7;
      }

      .sf-phase.is-shimmer .sf-phase-num {
        border-color: color-mix(in oklab, var(--primary) 50%, transparent);
        color: var(--primary);
      }
      .sf-phase.is-shimmer .sf-phase-name {
        color: var(--primary);
      }
      .sf-phase.is-shimmer::before {
        content: '';
        position: absolute;
        left: -16px;
        top: 4px;
        bottom: 4px;
        width: 2px;
        border-radius: 1px;
        background: var(--primary);
        opacity: 0.7;
      }

      .sf-aside-foot {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        padding-top: 14px;
        border-top: 1px dashed var(--border);
        font-family: var(--font-geist-mono), ui-monospace, monospace;
        font-size: 10.5px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted-foreground);
      }

      @media (prefers-reduced-motion: reduce) {
        .sf-aside-tag::before { animation: none; }
      }
    `}</style>
  );
}
