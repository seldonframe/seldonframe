"use client"

// Vendored from Magic UI (https://magicui.design/docs/components/orbiting-circles)
// on the `motion` engine already installed in this repo (no new dependency).
// Adapted per the cross-surface motion Adaptation Contract:
//  - useReducedMotion() early-returns a complete static state (every child
//    rendered at a fixed angular position) instead of the CSS `animate-orbit`
//    keyframe loop.
//  - `forceStatic` prop forces the same static branch (used by the motion
//    lab + any caller that wants the resting state on demand).
//  - The orbit-path stroke defaults to a token-friendly `currentColor` /
//    `stroke-black/10 dark:stroke-white/10` pairing (unchanged from upstream,
//    which was already token-neutral) rather than a brand hex.
//  - `className` passthrough via `cn` (unchanged from upstream).
//  - Children are always rendered in the DOM (SSR/crawler visible) in both
//    branches; only the animation classes/keyframes are swapped out.
//  - The animated branch's `@keyframes orbit` is co-located in this file (a
//    module-level constant emitted via a plain `<style>` tag once, inside
//    the animated branch only) rather than assumed to exist in a global
//    Tailwind theme file — a vendored component must animate standalone
//    without any repo-wide CSS wiring.
//  - Container-level HTML attrs (`{...props}`) are spread onto a single
//    `display: contents` wrapper, not stamped onto every orbiting child.

import React from "react"
import { useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

// Magic UI's orbit keyframes, co-located so this component animates without
// any Tailwind theme/global CSS wiring. Rendered once, only in the animated
// (non-reduced-motion) branch.
const ORBIT_KEYFRAMES = `@keyframes orbit {
  0% {
    transform: rotate(calc(var(--angle) * 1deg)) translateY(calc(var(--radius) * 1px)) rotate(calc(var(--angle) * -1deg));
  }
  100% {
    transform: rotate(calc(var(--angle) * 1deg + 360deg)) translateY(calc(var(--radius) * 1px)) rotate(calc((var(--angle) * -1deg) - 360deg));
  }
}`

export interface OrbitingCirclesProps
  extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
  children?: React.ReactNode
  reverse?: boolean
  duration?: number
  delay?: number
  radius?: number
  path?: boolean
  iconSize?: number
  speed?: number
  /** Force the static (reduced-motion) branch regardless of the OS setting. */
  forceStatic?: boolean
}

export function OrbitingCircles({
  className,
  children,
  reverse,
  duration = 20,
  delay = 0,
  radius = 160,
  path = true,
  iconSize = 30,
  speed = 1,
  forceStatic = false,
  ...props
}: OrbitingCirclesProps) {
  const prefersReducedMotion = useReducedMotion()
  const isStatic = forceStatic || Boolean(prefersReducedMotion)
  const calculatedDuration = duration / speed
  const childArray = React.Children.toArray(children)
  const count = childArray.length

  // Reduced-motion / forceStatic branch: every child is placed at a fixed
  // angular position (precomputed cos/sin) around the orbit — no rotation,
  // no `animate-orbit` class, no keyframe loop. Children stay in the DOM.
  if (isStatic) {
    return (
      <div className="contents" {...props}>
        {path && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            version="1.1"
            className="pointer-events-none absolute inset-0 size-full"
          >
            <circle
              className="stroke-black/10 stroke-1 dark:stroke-white/10"
              cx="50%"
              cy="50%"
              r={radius}
              fill="none"
            />
          </svg>
        )}
        {childArray.map((child, index) => {
          const angle = (2 * Math.PI * index) / (count || 1)
          const x = radius * Math.cos(angle)
          const y = radius * Math.sin(angle)
          return (
            <div
              key={index}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: `${iconSize}px`,
                height: `${iconSize}px`,
                transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
              }}
              className={cn(
                "flex transform-gpu items-center justify-center rounded-full",
                className
              )}
            >
              {child}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="contents" {...props}>
      {/* Co-located keyframes: this component must animate standalone, so
          the orbit keyframe isn't assumed to live in a global Tailwind
          theme file. Rendered once per instance, animated branch only. */}
      <style>{ORBIT_KEYFRAMES}</style>
      {path && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          version="1.1"
          className="pointer-events-none absolute inset-0 size-full"
        >
          <circle
            className="stroke-black/10 stroke-1 dark:stroke-white/10"
            cx="50%"
            cy="50%"
            r={radius}
            fill="none"
          />
        </svg>
      )}
      {childArray.map((child, index) => {
        const angle = (360 / (count || 1)) * index
        return (
          <div
            key={index}
            style={
              {
                position: "absolute",
                top: "50%",
                left: "50%",
                width: `${iconSize}px`,
                height: `${iconSize}px`,
                marginTop: `${-iconSize / 2}px`,
                marginLeft: `${-iconSize / 2}px`,
                "--radius": radius,
                "--angle": angle,
                animation: `orbit ${calculatedDuration}s linear infinite${
                  reverse ? " reverse" : ""
                }`,
                animationDelay: `${delay}s`,
              } as React.CSSProperties
            }
            className={cn(
              "flex items-center justify-center rounded-full",
              className
            )}
          >
            {child}
          </div>
        )
      })}
    </div>
  )
}
