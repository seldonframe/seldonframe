// v1.32.1 — Motion primitives library entry point.
//
// Import primitives from "@/components/motion" anywhere in the app.
// They're client-only ("use client" inside primitives.tsx), so they
// work on user-facing public pages, the dashboard, and the marketing
// site equally well.
//
// Philosophy + per-primitive docs live in `./primitives.tsx`.

export {
  RevealOnScroll,
  Stagger,
  HoverLift,
  Counter,
  TextReveal,
  Marquee,
  MagneticButton,
  Parallax,
  PRESETS,
  EASE_OUT_EXPO,
} from "./primitives";

export type {
  RevealOnScrollProps,
  StaggerProps,
  HoverLiftProps,
  CounterProps,
  TextRevealProps,
  MarqueeProps,
  MagneticButtonProps,
  ParallaxProps,
} from "./primitives";
