// Adapted from Magic UI's Highlighter (magicui.design/docs/components/highlighter).
// The upstream version draws the marker stroke with the `rough-notation`
// package; that dependency isn't in this repo (deps are pinned per the
// worktree brief), so this adaptation reproduces the same "human-drawn
// marker" read with a pure CSS/motion background-sweep instead — same
// visual outcome (a highlight growing left-to-right behind the text), one
// fewer dependency. `useReducedMotion`/`forceStatic` render the fully-drawn
// end-state instantly, per the motion-initiative guardrail.
"use client"

import { useRef, type CSSProperties, type ReactNode } from "react"
import { useInView, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils"

interface HighlighterProps {
  children: ReactNode
  /** Marker color — defaults to the Seldon accent (deep forest) at low opacity. */
  color?: string
  className?: string
  /** Skip the draw-in sweep and render fully highlighted immediately. */
  forceStatic?: boolean
  /** When true, the marker draws in on scroll-into-view AND retracts on
   *  scroll-out (appears/disappears each pass) instead of drawing once. */
  repeat?: boolean
}

export function Highlighter({ children, color = "rgba(31, 43, 36,0.18)", className, forceStatic = false, repeat = false }: HighlighterProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: !repeat, margin: "-12%" })
  const prefersReducedMotion = useReducedMotion()
  const skipAnimation = forceStatic || Boolean(prefersReducedMotion)
  const drawn = skipAnimation || isInView

  // The highlight is a background painted BEHIND the text and cloned per line
  // (box-decoration-break), so on wrapped/multi-line text it hugs each line
  // like a real marker instead of one block over the whole bounding box. The
  // draw-in sweep is a CSS transition on background-size (0%→100% width).
  const style: CSSProperties = {
    backgroundImage: `linear-gradient(${color}, ${color})`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "0 62%",
    backgroundSize: drawn ? "100% 74%" : "0% 74%",
    WebkitBoxDecorationBreak: "clone",
    boxDecorationBreak: "clone",
    borderRadius: 3,
    padding: "0.02em 0.08em",
    margin: "0 -0.08em",
    transition: skipAnimation ? "none" : "background-size 0.6s cubic-bezier(0.22, 1, 0.36, 1)",
  }

  return (
    <span ref={ref} className={cn("box-decoration-clone", className)} style={style}>
      {children}
    </span>
  )
}
