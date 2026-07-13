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

import React from "react"
import { useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

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
      <>
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
              {...props}
            >
              {child}
            </div>
          )
        })}
      </>
    )
  }

  return (
    <>
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
                "--duration": calculatedDuration,
                "--radius": radius,
                "--angle": angle,
                "--icon-size": `${iconSize}px`,
                animationDelay: `${delay}s`,
              } as React.CSSProperties
            }
            className={cn(
              "animate-orbit absolute flex size-(--icon-size) transform-gpu items-center justify-center rounded-full",
              { "[animation-direction:reverse]": reverse },
              className
            )}
            {...props}
          >
            {child}
          </div>
        )
      })}
    </>
  )
}
