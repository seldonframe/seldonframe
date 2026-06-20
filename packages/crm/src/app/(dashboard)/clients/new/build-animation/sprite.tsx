"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useTimeline } from "./stage";
import { clamp } from "./easing";

// ── Sprite context ────────────────────────────────────────────────────────────

type SpriteCtx = {
  localTime: number;
  progress: number;
  duration: number;
  visible: boolean;
};

const SpriteContext = createContext<SpriteCtx>({
  localTime: 0,
  progress: 0,
  duration: 0,
  visible: false,
});

export const useSprite = (): SpriteCtx => useContext(SpriteContext);

// ── Sprite ────────────────────────────────────────────────────────────────────
// Renders children only when the playhead is inside [start, end].
// Provides localTime (seconds since start) and progress (0..1) via SpriteContext.

type SpriteProps = {
  start: number;
  end: number;
  keepMounted?: boolean;
  children: ReactNode;
};

export function Sprite({ start, end, keepMounted = false, children }: SpriteProps) {
  const { time } = useTimeline();
  const visible = time >= start && time <= end;

  if (!visible && !keepMounted) return null;

  const duration = end - start;
  const localTime = Math.max(0, time - start);
  const progress =
    duration > 0 && isFinite(duration)
      ? clamp(localTime / duration, 0, 1)
      : 0;

  const value: SpriteCtx = { localTime, progress, duration, visible };

  return (
    <SpriteContext.Provider value={value}>
      {children}
    </SpriteContext.Provider>
  );
}
