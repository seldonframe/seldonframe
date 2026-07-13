// Adapted from Magic UI's Highlighter (magicui.design/docs/components/highlighter).
// The upstream version draws the marker stroke with the `rough-notation`
// package; that dependency isn't in this repo (deps are pinned per the
// worktree brief), so this adaptation reproduces the same "human-drawn
// marker" read with a pure CSS/motion background-sweep instead — same
// visual outcome (a highlight growing left-to-right behind the text), one
// fewer dependency. `useReducedMotion`/`forceStatic` render the fully-drawn
// end-state instantly, per the motion-initiative guardrail.
"use client"

import { useRef, type ReactNode } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils"

interface HighlighterProps {
  children: ReactNode
  /** Marker color — defaults to the SeldonFrame accent green at low opacity. */
  color?: string
  className?: string
  /** Skip the draw-in sweep and render fully highlighted immediately. */
  forceStatic?: boolean
}

export function Highlighter({ children, color = "rgba(0,137,123,0.28)", className, forceStatic = false }: HighlighterProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-10%" })
  const prefersReducedMotion = useReducedMotion()
  const skipAnimation = forceStatic || Boolean(prefersReducedMotion)

  return (
    <span ref={ref} className={cn("relative inline-block", className)}>
      <motion.span
        aria-hidden
        initial={{ scaleX: skipAnimation ? 1 : 0 }}
        animate={{ scaleX: skipAnimation || isInView ? 1 : 0 }}
        transition={skipAnimation ? { duration: 0 } : { duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: "absolute",
          inset: "12% -3% 6%",
          background: color,
          borderRadius: 3,
          transformOrigin: "left",
          zIndex: 0,
        }}
      />
      <span style={{ position: "relative", zIndex: 1 }}>{children}</span>
    </span>
  )
}
