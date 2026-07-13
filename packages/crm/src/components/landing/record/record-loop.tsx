// packages/crm/src/components/landing/record/record-loop.tsx
//
// The record promise, shown not told (2026-07-13): a compact looping
// strip — REC captures frames → Seldon compiles → the agent goes live —
// so a visitor grasps the record→agent pipeline before reading a word.
//
// Motion contract: keyframes co-located below (styled-jsx), and
// prefers-reduced-motion renders every stage in its finished state
// (all lit, progress full, check visible) with zero animation.
// Dark-surface component — uses the record page's --lp-* tokens.

"use client";

export function RecordLoop() {
  return (
    <div
      className="sf-recloop mt-7 flex w-full max-w-[560px] items-center justify-center gap-3 md:gap-4"
      aria-label="How it works: record your screen, Seldon compiles, your agent goes live"
    >
      {/* Stage 1 — the recording */}
      <div className="sf-stage sf-stage-1 flex min-w-0 items-center gap-2.5 rounded-[12px] border border-[var(--lp-border)] bg-[var(--lp-card)] px-3.5 py-2.5">
        <span className="sf-recloop-dot inline-block size-[8px] shrink-0 rounded-full bg-[#E5484D]" aria-hidden />
        <div className="min-w-0 text-left">
          <div className="text-[12.5px] font-[600] leading-tight text-[var(--lp-ink)]">You work</div>
          <div className="sf-recbar mt-1.5 h-[3px] w-[64px] overflow-hidden rounded-full bg-[rgba(255,255,255,.12)]" aria-hidden>
            <span className="sf-recbar-fill block h-full w-full origin-left rounded-full bg-[#E5484D]" />
          </div>
        </div>
      </div>

      <span className="sf-arrow sf-arrow-1 shrink-0 text-[var(--lp-muted)]" aria-hidden>→</span>

      {/* Stage 2 — Seldon compiles */}
      <div className="sf-stage sf-stage-2 flex min-w-0 items-center gap-2.5 rounded-[12px] border border-[var(--lp-border)] bg-[var(--lp-card)] px-3.5 py-2.5">
        <span className="sf-frames relative inline-flex shrink-0" aria-hidden>
          <span className="sf-frame block h-[14px] w-[10px] rounded-[2px] border border-[var(--lp-muted)]" />
          <span className="sf-frame sf-frame-2 -ml-[5px] block h-[14px] w-[10px] rounded-[2px] border border-[var(--lp-muted)] bg-[var(--lp-card)]" />
          <span className="sf-frame sf-frame-3 -ml-[5px] block h-[14px] w-[10px] rounded-[2px] border border-[var(--lp-muted)] bg-[var(--lp-card)]" />
        </span>
        <div className="min-w-0 text-left text-[12.5px] font-[600] leading-tight text-[var(--lp-ink)]">
          Seldon watches
          <div className="text-[11px] font-[400] text-[var(--lp-muted)]">frames + narration</div>
        </div>
      </div>

      <span className="sf-arrow sf-arrow-2 shrink-0 text-[var(--lp-muted)]" aria-hidden>→</span>

      {/* Stage 3 — the agent, live */}
      <div className="sf-stage sf-stage-3 flex min-w-0 items-center gap-2.5 rounded-[12px] border border-[var(--lp-accent)]/50 bg-[var(--lp-card)] px-3.5 py-2.5">
        <span className="sf-live-check flex size-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--lp-accent)] text-[11px] font-[800] text-[#0B1210]" aria-hidden>
          ✓
        </span>
        <div className="min-w-0 text-left text-[12.5px] font-[600] leading-tight text-[var(--lp-ink)]">
          Agent live
          <div className="text-[11px] font-[400] text-[var(--lp-muted)]">testable · yours</div>
        </div>
      </div>

      <style jsx>{`
        /* Looping timeline: 6s cycle. Stage 1 records (bar fills), stage 2
           frames pop in, stage 3 check lands — then it breathes and loops. */
        .sf-recloop-dot {
          animation: sf-rl-rec 1.2s ease-in-out infinite;
        }
        .sf-recbar-fill {
          animation: sf-rl-bar 6s linear infinite;
        }
        .sf-stage-2, .sf-arrow-1 {
          animation: sf-rl-in 6s ease-out infinite;
        }
        .sf-stage-3, .sf-arrow-2 {
          animation: sf-rl-in-late 6s ease-out infinite;
        }
        .sf-frame-2 { animation: sf-rl-frame 6s ease-out infinite; }
        .sf-frame-3 { animation: sf-rl-frame-late 6s ease-out infinite; }
        @keyframes sf-rl-rec {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
        @keyframes sf-rl-bar {
          0% { transform: scaleX(0); }
          38% { transform: scaleX(1); }
          100% { transform: scaleX(1); }
        }
        @keyframes sf-rl-in {
          0%, 20% { opacity: 0.3; }
          38%, 100% { opacity: 1; }
        }
        @keyframes sf-rl-in-late {
          0%, 55% { opacity: 0.3; }
          72%, 100% { opacity: 1; }
        }
        @keyframes sf-rl-frame {
          0%, 24% { opacity: 0; transform: translateX(-2px); }
          34%, 100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes sf-rl-frame-late {
          0%, 30% { opacity: 0; transform: translateX(-2px); }
          42%, 100% { opacity: 1; transform: translateX(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .sf-recloop-dot,
          .sf-recbar-fill,
          .sf-stage-2, .sf-arrow-1,
          .sf-stage-3, .sf-arrow-2,
          .sf-frame-2, .sf-frame-3 {
            animation: none;
          }
          /* Finished state: everything lit, bar full. */
          .sf-recbar-fill { transform: scaleX(1); }
        }
        @media (max-width: 560px) {
          .sf-recloop { flex-wrap: wrap; }
        }
      `}</style>
    </div>
  );
}
