// Vendored from Magic UI (magicui.design/docs/components/hero-video-dialog),
// adapted for SeldonFrame's motion-initiative pattern: `useReducedMotion` +
// a `forceStatic` prop skip the spring/scale entrance — the modal still
// opens, it just renders the end-state instantly instead of animating in.
// "Static IS the real design" when motion is unwanted (comprehension-first).
"use client"

import { useState } from "react"
import { Play, XIcon } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils"

type AnimationStyle =
  | "from-bottom"
  | "from-center"
  | "from-top"
  | "from-left"
  | "from-right"
  | "fade"
  | "top-in-bottom-out"
  | "left-in-right-out"

interface HeroVideoProps {
  animationStyle?: AnimationStyle
  videoSrc: string
  thumbnailSrc: string
  thumbnailAlt?: string
  className?: string
  /** Skip the spring/scale entrance and render the open state instantly —
   *  used when `useReducedMotion()` is true, or forced by the caller. */
  forceStatic?: boolean
}

const animationVariants = {
  "from-center": { initial: { scale: 0.5, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 0.5, opacity: 0 } },
  fade: { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } },
} as const

const STATIC_VARIANT = { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 1 } } as const

export function HeroVideoDialog({
  animationStyle = "from-center",
  videoSrc,
  thumbnailSrc,
  thumbnailAlt = "Video thumbnail",
  className,
  forceStatic = false,
}: HeroVideoProps) {
  const [isVideoOpen, setIsVideoOpen] = useState(false)
  const prefersReducedMotion = useReducedMotion()
  const skipAnimation = forceStatic || Boolean(prefersReducedMotion)
  const selectedAnimation = skipAnimation
    ? STATIC_VARIANT
    : (animationVariants[animationStyle as "from-center"] ?? animationVariants["from-center"])

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        aria-label="Play video"
        className="group relative cursor-pointer border-0 bg-transparent p-0 w-full"
        onClick={() => setIsVideoOpen(true)}
      >
        <img
          src={thumbnailSrc}
          alt={thumbnailAlt}
          width={1920}
          height={1080}
          className="w-full rounded-md border shadow-lg transition-all duration-200 ease-out group-hover:brightness-[0.8]"
        />
        <div className="absolute inset-0 flex scale-[0.9] items-center justify-center rounded-2xl transition-all duration-200 ease-out group-hover:scale-100">
          <div className="flex size-24 items-center justify-center rounded-full bg-white/20 backdrop-blur-md">
            <div className="relative flex size-16 scale-100 items-center justify-center rounded-full bg-white/95 shadow-md transition-all duration-200 ease-out group-hover:scale-[1.2]">
              <Play className="size-7 fill-[#221D17] text-[#221D17]" style={{ marginLeft: 3 }} />
            </div>
          </div>
        </div>
      </button>
      <AnimatePresence>
        {isVideoOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={skipAnimation ? { duration: 0 } : undefined}
            onClick={() => setIsVideoOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
          >
            <motion.div
              {...selectedAnimation}
              transition={skipAnimation ? { duration: 0 } : { type: "spring", damping: 30, stiffness: 300 }}
              className="relative mx-4 aspect-video w-full max-w-4xl"
            >
              <button
                aria-label="Close video"
                onClick={() => setIsVideoOpen(false)}
                className="absolute -top-12 right-0 rounded-full bg-white/20 p-2 text-white backdrop-blur-md"
              >
                <XIcon className="size-5" />
              </button>
              <div className="relative size-full overflow-hidden rounded-2xl border-2 border-white">
                <iframe
                  src={videoSrc}
                  title="Video player"
                  className="size-full rounded-2xl"
                  allowFullScreen
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                ></iframe>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
