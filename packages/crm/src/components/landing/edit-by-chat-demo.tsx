// packages/crm/src/components/landing/edit-by-chat-demo.tsx
//
// "You edit by chatting" — a looping two-panel demo: the operator types a
// plain-English change to Seldon (left), and the live site preview updates
// (right). Mirrors the real in-product edit flow (e.g. the /clients/<slug>/ready
// surface). Self-contained motion; reduced-motion renders the finished state.

"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;
const PROMPT = "Change the headline to “Same-day AC repair in Dallas” and warm up the red.";

// The two site states the chat toggles between.
const BEFORE = { headline: "Heating & cooling you can trust.", accent: "#B23B3B", tag: "Family-owned" };
const AFTER = { headline: "Same-day AC repair in Dallas.", accent: "#D64545", tag: "24/7 emergency" };

export function EditByChatDemo() {
  const reduce = useReducedMotion() ?? false;
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  // Phases: 0 idle(before) · 1 typing · 2 applying · 3 applied(after) · 4 hold
  const [phase, setPhase] = useState(0);
  const [typed, setTyped] = useState(0);

  useEffect(() => {
    if (reduce || !inView) return;
    let t: ReturnType<typeof setTimeout>;
    if (phase === 0) t = setTimeout(() => setPhase(1), 900);
    else if (phase === 1) {
      if (typed < PROMPT.length) t = setTimeout(() => setTyped((n) => n + 1), 26);
      else t = setTimeout(() => setPhase(2), 500);
    } else if (phase === 2) t = setTimeout(() => setPhase(3), 1100);
    else if (phase === 3) t = setTimeout(() => setPhase(4), 2600);
    else t = setTimeout(() => { setPhase(0); setTyped(0); }, 300);
    return () => clearTimeout(t);
  }, [phase, typed, inView, reduce]);

  // Reset when scrolled away so it replays cleanly.
  useEffect(() => { if (!inView && !reduce) { setPhase(0); setTyped(0); } }, [inView, reduce]);

  const applied = reduce || phase >= 3;
  const site = applied ? AFTER : BEFORE;
  const shownPrompt = reduce ? PROMPT : PROMPT.slice(0, typed);

  return (
    <div
      ref={ref}
      className="grid w-full max-w-[820px] grid-cols-1 gap-3 rounded-[18px] border border-[rgba(34,29,23,.1)] bg-[#FFFDFA] p-3 shadow-[0_1px_2px_rgba(34,29,23,.05),0_16px_40px_rgba(34,29,23,.08)] md:grid-cols-[1fr_1.15fr]"
      aria-label="Editing your site by chatting with Seldon"
    >
      {/* Chat panel */}
      <div className="flex flex-col justify-end gap-2.5 rounded-[13px] bg-[#F6F2EA] p-4">
        <div className="mb-auto flex items-center gap-2 text-[11px] font-[600] uppercase tracking-[0.06em] text-[#6E665A]">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark */}
          <img src="/brand/seldon-mark.svg" alt="" width={18} height={18} className="rounded-[5px]" />
          Chat with Seldon
        </div>
        {/* user message */}
        <div className="ml-auto max-w-[92%] rounded-[12px] rounded-br-[4px] bg-[#1F2B24] px-3 py-2 text-[12.5px] leading-[1.4] text-[#F6F2EA]">
          {shownPrompt || <span className="opacity-40">Type a change…</span>}
          {!reduce && phase === 1 && <span className="ml-0.5 inline-block h-3.5 w-px translate-y-[2px] animate-pulse bg-[#F6F2EA] align-middle" />}
        </div>
        {/* seldon reply */}
        {(reduce || phase >= 2) && (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="mr-auto max-w-[92%] rounded-[12px] rounded-bl-[4px] border border-[rgba(34,29,23,.08)] bg-[#FFFDFA] px-3 py-2 text-[12.5px] leading-[1.4] text-[#221D17]"
          >
            {applied ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="text-[#1F2B24]">✓</span> Updated your homepage — live now.
              </span>
            ) : (
              <span className="text-[#6E665A]">Applying the change…</span>
            )}
          </motion.div>
        )}
      </div>

      {/* Live site preview */}
      <div className="overflow-hidden rounded-[13px] border border-[rgba(34,29,23,.08)] bg-white">
        <div className="flex items-center gap-1.5 border-b border-[rgba(34,29,23,.06)] bg-[#F6F2EA] px-3 py-2">
          <span className="size-2 rounded-full bg-[#E5484D]/70" />
          <span className="size-2 rounded-full bg-[#FEBC2E]/70" />
          <span className="size-2 rounded-full bg-[#28C840]/70" />
          <span className="ml-2 truncate font-mono text-[10.5px] text-[#9A9183]">dallas-heating-air.app.seldonframe.com</span>
        </div>
        <div className="relative p-5">
          <motion.span
            key={site.tag}
            initial={reduce ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-[600]"
            style={{ background: `${site.accent}1a`, color: site.accent }}
          >
            <span className="size-1.5 rounded-full" style={{ background: site.accent }} />
            {site.tag}
          </motion.span>
          <motion.h4
            key={site.headline}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="mt-3 text-[clamp(19px,2.4vw,26px)] font-[700] leading-[1.1] tracking-[-0.02em] text-[#1a1a1a]"
          >
            {site.headline}
          </motion.h4>
          <p className="mt-2 max-w-[34ch] text-[12px] leading-[1.5] text-[#666]">
            Licensed, insured, and on call across the metro. Book online in 60 seconds.
          </p>
          <motion.span
            className="mt-4 inline-flex items-center gap-1.5 rounded-[9px] px-4 py-2 text-[12.5px] font-[600] text-white"
            animate={{ backgroundColor: site.accent }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            Book a repair →
          </motion.span>
        </div>
      </div>
    </div>
  );
}
