// landing/_shared/motion.tsx
//
// Motion primitives. Per the brief:
//  • CSS for hover/transition/keyframes (handled in section-level <style jsx> or
//    Tailwind utilities — not here).
//  • Framer Motion only for SCROLL-TRIGGERED motion: counter tick on view,
//    trust badge fade-in on scroll, services card stagger, FAQ accordion
//    height (shadcn already animates the accordion, so we just dress it).
//
// All primitives respect prefers-reduced-motion via useReducedMotion().

"use client";

import { motion, useReducedMotion, useInView } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";

// ── Reveal — fades + lifts a node when it enters the viewport ──────────────
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -40px 0px", amount: 0.08 }}
      transition={{ duration: 0.54, ease: "easeOut", delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── Stagger container + child — services grid card stagger ────────────────
export function StaggerGroup({
  children,
  className,
  delayChildren = 0,
  stagger = 0.08,
}: {
  children: ReactNode;
  className?: string;
  delayChildren?: number;
  stagger?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "0px 0px -40px 0px", amount: 0.05 }}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: stagger, delayChildren } },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 14 },
        show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
      }}
    >
      {children}
    </motion.div>
  );
}

// ── CountUp — ticks a number on view ───────────────────────────────────────
// Pure useEffect + RAF, gated by useInView. Framer-only because we need the
// "in view" trigger; the actual interpolation is a tiny RAF loop (lighter
// than framer-motion's animate() for one scalar).
export function CountUp({
  value,
  decimals = 0,
  duration = 1400,
  format,
  className,
}: {
  value: number;
  decimals?: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const [display, setDisplay] = useState(reduce ? value : 0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration, reduce]);

  const formatted = format
    ? format(display)
    : decimals > 0
      ? display.toFixed(decimals)
      : Math.round(display).toLocaleString();

  return (
    <span ref={ref} className={className} aria-label={String(value)}>
      {formatted}
    </span>
  );
}
