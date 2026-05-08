"use client";

// v1.32.1 — Motion primitives library.
//
// PHILOSOPHY: thin harness, fat skill, antifragile to LLM improvements.
//
// We don't hardcode "specific animations for specific blocks." That's
// brittle: every new business vertical needs a new preset, and the
// animations don't get better when models do.
//
// Instead, this file ships 8 composable primitives. Each is a thin
// wrapper around motion/react with sensible defaults. Each can be
// dropped on any block — landing page, calendar, intake form, customer
// portal, anywhere — to upgrade the feel.
//
// The "fat skill" lives in Claude Code. When an operator says "make
// my hero more impactful," Claude Code knows which primitives to
// compose: TextReveal on the headline, Stagger on the CTAs,
// MagneticButton on the primary CTA, RevealOnScroll on the section
// below. As frontier models improve at this composition, every
// SeldonFrame user's pages get richer — without us shipping new
// animation code.
//
// PRIMITIVES:
//   <RevealOnScroll>   — fade + slide up when scrolled into view
//   <Stagger>          — children reveal one by one
//   <HoverLift>        — hover-lift + accent glow on cards
//   <Counter>          — animate from 0 → value on scroll-into-view
//   <TextReveal>       — split text by word, reveal word-by-word
//   <Marquee>          — infinite horizontal scroll (logo bars)
//   <MagneticButton>   — button subtly follows cursor
//   <Parallax>         — scroll-linked Y translate (sparingly)
//
// Each accepts theme-agnostic className overrides; defaults match
// the SF brand (teal accent, restrained motion durations, conservative
// distances). Operators don't tune these — Claude Code does.
//
// USAGE (from any user-facing block):
//   import { RevealOnScroll, Stagger } from "@/components/motion";
//
//   <RevealOnScroll>
//     <Stagger>
//       {features.map(f => <Card key={f.id}>{...}</Card>)}
//     </Stagger>
//   </RevealOnScroll>

import * as React from "react";
import {
  motion,
  useInView,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  type MotionProps,
  type Transition,
} from "motion/react";

// ─────────────────────────────────────────────────────────────────
// 1. RevealOnScroll
// ─────────────────────────────────────────────────────────────────

export type RevealOnScrollProps = {
  children: React.ReactNode;
  /** Distance in px the element travels up while fading in. Default 16. */
  distance?: number;
  /** Animation duration in seconds. Default 0.55. */
  duration?: number;
  /** Initial delay in seconds. Default 0. */
  delay?: number;
  /** Whether to only animate once (default true) or every time it enters. */
  once?: boolean;
  /** Viewport margin for IntersectionObserver. Default "-80px". */
  margin?: string;
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
};

export function RevealOnScroll({
  children,
  distance = 16,
  duration = 0.55,
  delay = 0,
  once = true,
  margin = "-80px",
  className,
  as = "div",
}: RevealOnScrollProps) {
  // motion's per-tag generics make dynamic `as` strict-type-impossible;
  // cast to React.ComponentType to keep the runtime contract honest
  // and the types pragmatic.
  // motion is a callable type with per-tag property accessors. The
  // generic indexer below isn't representable in TS, so cast through
  // `unknown` to a plain component map.
  const Component = (motion as unknown as Record<string, React.ComponentType<Record<string, unknown>>>)[
    as as string
  ];
  return (
    <Component
      initial={{ opacity: 0, y: distance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: margin as `${number}px` }}
      transition={{ duration, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </Component>
  );
}

// ─────────────────────────────────────────────────────────────────
// 2. Stagger (children-aware reveal)
// ─────────────────────────────────────────────────────────────────

export type StaggerProps = {
  children: React.ReactNode;
  /** Delay between each child's reveal, in seconds. Default 0.08. */
  childDelay?: number;
  /** Initial delay before the first child reveals. Default 0. */
  delay?: number;
  /** Distance each child travels. Default 12. */
  distance?: number;
  /** Animation duration per child. Default 0.45. */
  duration?: number;
  className?: string;
  /** Tag for the wrapper. Default "div". */
  as?: "div" | "ul" | "ol" | "section";
};

export function Stagger({
  children,
  childDelay = 0.08,
  delay = 0,
  distance = 12,
  duration = 0.45,
  className,
  as = "div",
}: StaggerProps) {
  const Component = (motion as unknown as Record<string, React.ComponentType<Record<string, unknown>>>)[
    as
  ];
  const items = React.Children.toArray(children);

  return (
    <Component
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: childDelay, delayChildren: delay } },
      }}
      className={className}
    >
      {items.map((child, i) => (
        <motion.div
          key={i}
          variants={{
            hidden: { opacity: 0, y: distance },
            visible: { opacity: 1, y: 0, transition: { duration, ease: [0.22, 1, 0.36, 1] } },
          }}
        >
          <>{child}</>
        </motion.div>
      ))}
    </Component>
  );
}

// ─────────────────────────────────────────────────────────────────
// 3. HoverLift
// ─────────────────────────────────────────────────────────────────

export type HoverLiftProps = {
  children: React.ReactNode;
  /** Pixels the element rises on hover. Default 4. */
  lift?: number;
  /** Whether to add an accent glow on hover. Default true. */
  glow?: boolean;
  /** Glow color (any CSS color string). Default brand teal. */
  glowColor?: string;
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
};

export function HoverLift({
  children,
  lift = 4,
  glow = true,
  glowColor = "rgba(31, 174, 133, 0.35)",
  className,
  as = "div",
}: HoverLiftProps) {
  // motion is a callable type with per-tag property accessors. The
  // generic indexer below isn't representable in TS, so cast through
  // `unknown` to a plain component map.
  const Component = (motion as unknown as Record<string, React.ComponentType<Record<string, unknown>>>)[
    as as string
  ];
  return (
    <Component
      whileHover={{
        y: -lift,
        boxShadow: glow ? `0 12px 30px -12px ${glowColor}` : undefined,
      }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={className}
    >
      {children}
    </Component>
  );
}

// ─────────────────────────────────────────────────────────────────
// 4. Counter — animate 0 → value on scroll-into-view
// ─────────────────────────────────────────────────────────────────

export type CounterProps = {
  /** Target value to count up to. */
  to: number;
  /** Starting value. Default 0. */
  from?: number;
  /** Duration in seconds. Default 1.6. */
  duration?: number;
  /** Optional suffix appended to the number (e.g. "%", "+", "ms"). */
  suffix?: string;
  /** Optional prefix prepended (e.g. "$"). */
  prefix?: string;
  /** Decimal places. Default 0. */
  decimals?: number;
  /** Whether to format with thousands separators. Default true. */
  separator?: boolean;
  className?: string;
};

export function Counter({
  to,
  from = 0,
  duration = 1.6,
  suffix = "",
  prefix = "",
  decimals = 0,
  separator = true,
  className,
}: CounterProps) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [display, setDisplay] = React.useState<string>(`${prefix}${from}${suffix}`);

  React.useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    let raf = 0;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    const step = (now: number) => {
      const elapsed = (now - start) / 1000;
      const t = Math.min(elapsed / duration, 1);
      const value = from + (to - from) * ease(t);
      const fixed = value.toFixed(decimals);
      const formatted = separator
        ? fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
        : fixed;
      setDisplay(`${prefix}${formatted}${suffix}`);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [inView, from, to, duration, suffix, prefix, decimals, separator]);

  return (
    <span ref={ref} className={className} aria-label={`${prefix}${to}${suffix}`}>
      {display}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────
// 5. TextReveal — split text by word, reveal word-by-word
// ─────────────────────────────────────────────────────────────────

export type TextRevealProps = {
  children: string;
  /** Time between each word's reveal in seconds. Default 0.06. */
  wordDelay?: number;
  /** Initial delay before the first word reveals. Default 0. */
  delay?: number;
  /** Distance each word travels. Default 8. */
  distance?: number;
  /** Animation duration per word. Default 0.5. */
  duration?: number;
  className?: string;
  as?: "h1" | "h2" | "h3" | "h4" | "p" | "span";
};

export function TextReveal({
  children,
  wordDelay = 0.06,
  delay = 0,
  distance = 8,
  duration = 0.5,
  className,
  as = "h2",
}: TextRevealProps) {
  const Component = motion[as] as typeof motion.h2;
  const words = children.split(/(\s+)/); // keep whitespace as separate tokens
  return (
    <Component
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: wordDelay, delayChildren: delay } },
      }}
      className={className}
      aria-label={children}
    >
      {words.map((word, i) =>
        /^\s+$/.test(word) ? (
          <span key={i} aria-hidden> </span>
        ) : (
          <motion.span
            key={i}
            aria-hidden
            className="inline-block"
            variants={{
              hidden: { opacity: 0, y: distance },
              visible: { opacity: 1, y: 0, transition: { duration, ease: [0.22, 1, 0.36, 1] } },
            }}
          >
            {word}
          </motion.span>
        )
      )}
    </Component>
  );
}

// ─────────────────────────────────────────────────────────────────
// 6. Marquee — infinite horizontal scroll
// ─────────────────────────────────────────────────────────────────

export type MarqueeProps = {
  children: React.ReactNode;
  /** Pixels per second. Default 40. */
  speed?: number;
  /** Direction. Default "left". */
  direction?: "left" | "right";
  /** Pause on hover. Default true. */
  pauseOnHover?: boolean;
  /** Optional gap between repetitions in pixels. Default 48. */
  gap?: number;
  className?: string;
};

export function Marquee({
  children,
  speed = 40,
  direction = "left",
  pauseOnHover = true,
  gap = 48,
  className,
}: MarqueeProps) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [duration, setDuration] = React.useState(20);

  React.useEffect(() => {
    if (!trackRef.current) return;
    const width = trackRef.current.scrollWidth / 2; // we render children twice
    setDuration(width / speed);
  }, [speed, children]);

  const x = direction === "left" ? ["0%", "-50%"] : ["-50%", "0%"];

  return (
    <div
      className={`overflow-hidden ${className ?? ""}`}
      style={{ ["--gap" as string]: `${gap}px` }}
    >
      <motion.div
        ref={trackRef}
        className={`flex w-max ${pauseOnHover ? "hover:[animation-play-state:paused]" : ""}`}
        style={{ gap: `${gap}px`, paddingRight: `${gap}px` }}
        animate={{ x }}
        transition={{ duration, ease: "linear", repeat: Infinity }}
      >
        {/* render twice so the loop seam is invisible */}
        {[0, 1].map((k) => (
          <div key={k} className="flex shrink-0 items-center" style={{ gap: `${gap}px` }}>
            {children}
          </div>
        ))}
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// 7. MagneticButton — subtle cursor attraction
// ─────────────────────────────────────────────────────────────────

export type MagneticButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Maximum px the button can travel toward the cursor. Default 8. */
  strength?: number;
};

export function MagneticButton({
  children,
  strength = 8,
  className,
  ...props
}: MagneticButtonProps) {
  const ref = React.useRef<HTMLButtonElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 18, mass: 0.5 });
  const sy = useSpring(y, { stiffness: 220, damping: 18, mass: 0.5 });

  const onMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const mx = e.clientX - (rect.left + rect.width / 2);
    const my = e.clientY - (rect.top + rect.height / 2);
    const max = Math.max(rect.width, rect.height) / 2;
    const norm = (v: number) => Math.max(-1, Math.min(1, v / max));
    x.set(norm(mx) * strength);
    y.set(norm(my) * strength);
  };
  const onLeave = () => {
    x.set(0);
    y.set(0);
  };

  // motion's `motion.button` accepts our event handlers + className just
  // like a regular <button>. We forward `...props` so callers can pass
  // type, onClick, disabled, etc.
  return (
    <motion.button
      ref={ref}
      style={{ x: sx, y: sy }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={className}
      {...(props as MotionProps & React.ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      <>{children}</>
    </motion.button>
  );
}

// ─────────────────────────────────────────────────────────────────
// 8. Parallax — scroll-linked Y translate
// ─────────────────────────────────────────────────────────────────

export type ParallaxProps = {
  children: React.ReactNode;
  /** Translate speed multiplier. -0.3 (slow up) to 0.3 (fast down). Default -0.15. */
  speed?: number;
  className?: string;
};

export function Parallax({ children, speed = -0.15, className }: ParallaxProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  // Map scroll progress (0 → 1) to a translate range. The element will
  // travel by `speed * 100%` of its own height across the visible
  // range.
  const y = useTransform(scrollYProgress, [0, 1], [`${speed * 100}%`, `${-speed * 100}%`]);

  return (
    <div ref={ref} className={className} style={{ position: "relative" }}>
      <motion.div style={{ y }}><>{children}</></motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Shared transition presets — for callers that want to roll their own
// motion.div with consistent timing.
// ─────────────────────────────────────────────────────────────────

export const EASE_OUT_EXPO: Transition["ease"] = [0.22, 1, 0.36, 1];

export const PRESETS = {
  /** Standard "premium" reveal — fade + 16px slide up over 0.55s. */
  reveal: {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.55, ease: EASE_OUT_EXPO },
  },
  /** Pop-in for important badges or pills. */
  pop: {
    initial: { opacity: 0, scale: 0.85 },
    animate: { opacity: 1, scale: 1 },
    transition: { duration: 0.4, type: "spring" as const, stiffness: 220 },
  },
  /** Soft fade for ambient elements (background glows, dividers). */
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 0.6, ease: EASE_OUT_EXPO },
  },
} as const;
