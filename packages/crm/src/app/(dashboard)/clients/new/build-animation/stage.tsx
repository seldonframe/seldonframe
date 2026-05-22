"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useMemo,
  type ReactNode,
} from "react";
import { clamp } from "./easing";

// ── Timeline context ──────────────────────────────────────────────────────────

type TimelineCtx = {
  time: number;
  duration: number;
  playing: boolean;
};

const TimelineContext = createContext<TimelineCtx>({
  time: 0,
  duration: 60,
  playing: false,
});

export const useTime = (): number => useContext(TimelineContext).time;
export const useTimeline = (): TimelineCtx => useContext(TimelineContext);

// ── Stage ─────────────────────────────────────────────────────────────────────
// Production-flavored Stage for /clients/new:
//   - `active` prop controls play/pause.
//   - Resets clock when active goes false→true.
//   - Loops continuously when active=true.
//   - prefers-reduced-motion: freezes at t=30 (mid-build frame).
//   - Scales to parent width via ResizeObserver, preserving 3:4 aspect ratio.
//   - No playback bar. No localStorage persistence.

type StageProps = {
  width: number;
  height: number;
  duration: number;
  background: string;
  active: boolean;
  loop?: boolean;
  /** Seconds to freeze at for prefers-reduced-motion users. Defaults to 30. */
  reducedMotionFreezeAt?: number;
  children: ReactNode;
};

export function Stage({
  width,
  height,
  duration,
  background,
  active,
  loop = true,
  reducedMotionFreezeAt = 30,
  children,
}: StageProps) {
  const [time, setTime] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [scale, setScale] = useState(1);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const prevActiveRef = useRef(false);

  // Detect prefers-reduced-motion once on mount
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
  }, []);

  // Reset clock when active transitions false→true
  useEffect(() => {
    if (active && !prevActiveRef.current) {
      setTime(0);
    }
    prevActiveRef.current = active;
  }, [active]);

  // Animation loop — only runs when active and no reduced-motion
  useEffect(() => {
    if (!active || reducedMotion) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTsRef.current = null;
      // Freeze at representative frame for reduced-motion users
      if (reducedMotion) setTime(reducedMotionFreezeAt);
      return;
    }

    const step = (ts: number) => {
      if (lastTsRef.current === null) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      setTime((t) => {
        let next = t + dt;
        if (next >= duration) {
          next = loop ? next % duration : duration;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTsRef.current = null;
    };
  }, [active, reducedMotion, duration, loop]);

  // Responsive scaling — resize the 720×960 canvas to fit parent width.
  // Maintains aspect ratio 3:4. Min scale ~0.4 for legibility.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const measure = () => {
      const parentW = el.parentElement?.clientWidth ?? el.clientWidth;
      const s = Math.max(0.4, Math.min(1, parentW / width));
      setScale(s);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el.parentElement ?? el);
    return () => ro.disconnect();
  }, [width]);

  const ctxValue = useMemo<TimelineCtx>(
    () => ({ time, duration, playing: active && !reducedMotion }),
    [time, duration, active, reducedMotion],
  );

  const scaledHeight = height * scale;

  return (
    // Outer wrapper sets the collapsed height so the parent layout knows
    // the visual footprint even though the canvas is scaled inside.
    <div
      ref={wrapperRef}
      style={{
        width: "100%",
        height: scaledHeight,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Canvas — fixed 720×960, scaled from top-center */}
      <div
        style={{
          width,
          height,
          background,
          position: "absolute",
          top: 0,
          left: "50%",
          transform: `translateX(-50%) scale(${scale})`,
          transformOrigin: "top center",
          overflow: "hidden",
        }}
      >
        <TimelineContext.Provider value={ctxValue}>
          {children}
        </TimelineContext.Provider>
      </div>
    </div>
  );
}
