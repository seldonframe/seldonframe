"use client";

// packages/crm/src/components/demo-scenes/calendar-connected.tsx
//
// Scene 2 (spec): the invisible-plumbing beat — Seldon <-> Google Calendar
// joined by AnimatedBeam, a spring-pop "Connected" pill, a booking-event
// card sliding in beneath the calendar node, and a pulse dot travelling the
// beam. AnimatedBeam already has a complete reduced-motion branch
// (forceStatic), so this scene forwards useReducedMotion into it and skips
// its own extra motion (pulse dot, pill spring) in that branch too.

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

import { AnimatedBeam } from "@/components/ui/magic/animated-beam";

const CYCLE_MS = 6000;
const CONNECT_AT_MS = 1400;
const CARD_AT_MS = 1900;

function Node({ src, label }: { src: string; label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "var(--lp-card)",
          border: "1px solid var(--lp-border, rgba(34,29,23,.14))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 8px 24px rgba(20,17,13,.10)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- static vendored brand icon */}
        <img src={src} alt="" width={32} height={32} />
      </div>
      <span style={{ fontSize: 13, color: "var(--lp-body)" }}>{label}</span>
    </div>
  );
}

export function CalendarConnectedScene({ loop = true }: { loop?: boolean }) {
  const reducedMotion = Boolean(useReducedMotion());
  const containerRef = useRef<HTMLDivElement>(null);
  const fromRef = useRef<HTMLDivElement>(null);
  const toRef = useRef<HTMLDivElement>(null);

  const [cycle, setCycle] = useState(0);
  const [connected, setConnected] = useState(false);
  const [cardIn, setCardIn] = useState(false);

  // reducedMotion resolves asynchronously (motion's useReducedMotion reads
  // matchMedia in an effect, after hydration) — so it must be re-checked on
  // every dependency change, not just baked into a useState initializer
  // that only runs once at mount. Without this, a user whose OS preference
  // flips true after mount would be stuck on the bare beam forever (state
  // seeded false, and the early return below never sets it true).
  useEffect(() => {
    if (reducedMotion) {
      setConnected(true);
      setCardIn(true);
      return undefined;
    }
    const t1 = setTimeout(() => setConnected(true), CONNECT_AT_MS);
    const t2 = setTimeout(() => setCardIn(true), CARD_AT_MS);
    let t3: ReturnType<typeof setTimeout> | undefined;
    if (loop) {
      t3 = setTimeout(() => {
        setConnected(false);
        setCardIn(false);
        setCycle((c) => c + 1);
      }, CYCLE_MS);
    }
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (t3) clearTimeout(t3);
    };
  }, [cycle, reducedMotion, loop]);

  return (
    <div
      key={cycle}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 40 }}
    >
      <div
        ref={containerRef}
        style={{
          position: "relative",
          width: "min(70vw, 360px)",
          height: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div ref={fromRef}>
          <Node src="/brand/seldon-mark.svg" label="Seldon" />
        </div>
        <div ref={toRef}>
          <Node src="/brand/integrations/google-calendar.svg" label="Google Calendar" />
        </div>
        <AnimatedBeam
          containerRef={containerRef}
          fromRef={fromRef}
          toRef={toRef}
          forceStatic={reducedMotion}
        />
        {!reducedMotion && connected && (
          <motion.span
            aria-hidden
            initial={{ left: "10%" }}
            animate={{ left: "90%" }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
            style={{
              position: "absolute",
              top: "50%",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "var(--lp-accent)",
              transform: "translate(-50%, -50%)",
            }}
          />
        )}
      </div>

      {connected && (
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 22 }}
          style={{
            padding: "6px 14px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            background: "var(--lp-accent-soft, rgba(31,43,36,.09))",
            color: "var(--lp-accent)",
          }}
        >
          ✓ Connected
        </motion.div>
      )}

      {cardIn && (
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          style={{
            padding: "12px 18px",
            borderRadius: 12,
            background: "var(--lp-card)",
            border: "1px solid var(--lp-border, rgba(34,29,23,.12))",
            fontSize: 14,
            color: "var(--lp-ink)",
          }}
        >
          📅 Tue 2:30 PM — Sarah M synced to Google Calendar
        </motion.div>
      )}
    </div>
  );
}
