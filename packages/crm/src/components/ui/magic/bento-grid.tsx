// Vendored from Magic UI (https://magicui.design/docs/components/bento-grid)
// on the `motion` engine already installed in this repo (no new dependency —
// this component in fact needs no `motion/react` import at all, see below).
// Adapted per the cross-surface motion Adaptation Contract:
//  - Upstream's only "animation" is a CSS `group-hover` translate/opacity
//    reveal on the CTA row — a Tailwind `transition-all duration-300`
//    utility, not a `motion/react` component and not a custom `animate-*`
//    keyframe (this repo's Tailwind v4 setup has none of Magic UI's custom
//    keyframes registered, so depending on one would silently no-op).
//    Because no `motion` hooks or client-only state are used, this file
//    stays a plain server component — no `"use client"` directive needed.
//  - `forceStatic` (new prop, not in upstream) is the contract's static
//    escape hatch: when true, the CTA row renders unconditionally visible
//    with no `group-hover`/`transition-*` classes, matching the reduced-
//    motion behavior used across the other vendored magic/ components.
//  - Upstream imports shadcn's `Button` (a `"use client"` component) and
//    `@radix-ui/react-icons`. Both are dropped: the CTA is a plain `<a>`
//    styled inline (keeps this a server component) and `Icon` stays the
//    caller-supplied `React.ElementType` with no default, so no icon
//    package dependency is introduced.
//  - Colors: upstream's `bg-background`, `text-neutral-700/300/400` and
//    shadow tokens are replaced with this repo's landing tokens
//    (`--lp-card`, `--lp-border`, `--lp-ink`, `--lp-body`) so the card
//    reads correctly in BOTH the light "build" landing mode and the warm
//    "record" dark mode — hardcoded neutrals or shadcn `bg-background`
//    would not flip with the landing's `data-mode` attribute.
//  - `className` passthrough via `cn` (unchanged from upstream).

import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react"

import { cn } from "@/lib/utils"

interface BentoGridProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode
  className?: string
}

export const BentoGrid = ({ children, className, ...props }: BentoGridProps) => {
  return (
    <div
      className={cn("grid w-full auto-rows-[22rem] grid-cols-3 gap-4", className)}
      {...props}
    >
      {children}
    </div>
  )
}

interface BentoCardProps extends ComponentPropsWithoutRef<"div"> {
  name: string
  className?: string
  background?: ReactNode
  Icon?: ElementType
  description: string
  href?: string
  cta?: string
  /** Skip the hover/reveal transition and render the CTA row statically. */
  forceStatic?: boolean
}

export const BentoCard = ({
  name,
  className,
  background,
  Icon,
  description,
  href,
  cta,
  forceStatic = false,
  ...props
}: BentoCardProps) => (
  <div
    className={cn(
      "group relative col-span-3 flex flex-col justify-between overflow-hidden rounded-xl",
      "border-[var(--lp-border)] bg-[var(--lp-card)] [box-shadow:0_0_0_1px_var(--lp-border),0_2px_4px_color-mix(in_oklab,var(--lp-ink)_5%,transparent),0_12px_24px_color-mix(in_oklab,var(--lp-ink)_5%,transparent)]",
      "transform-gpu border",
      className
    )}
    {...props}
  >
    {background ? <div>{background}</div> : null}
    <div className="p-4">
      <div
        className={cn(
          "pointer-events-none z-10 flex transform-gpu flex-col gap-1",
          !forceStatic && "transition-all duration-300 lg:group-hover:-translate-y-10"
        )}
      >
        {Icon ? (
          <Icon
            className={cn(
              "h-12 w-12 origin-left transform-gpu text-[var(--lp-ink)]",
              !forceStatic && "transition-all duration-300 ease-in-out group-hover:scale-75"
            )}
          />
        ) : null}
        <h3 className="text-xl font-semibold text-[var(--lp-ink)]">{name}</h3>
        <p className="max-w-lg text-[var(--lp-body)]">{description}</p>
      </div>

      {href && cta ? (
        <div
          className={cn(
            "pointer-events-none flex w-full flex-row items-center lg:hidden",
            !forceStatic && "translate-y-0 transform-gpu transition-all duration-300"
          )}
        >
          <a
            href={href}
            className="pointer-events-auto p-0 text-sm font-medium text-[var(--lp-ink)] hover:underline"
          >
            {cta}
            <span aria-hidden="true" className="ms-2">
              &rarr;
            </span>
          </a>
        </div>
      ) : null}
    </div>

    {href && cta ? (
      <div
        className={cn(
          "pointer-events-none absolute bottom-0 hidden w-full flex-row items-center p-4 lg:flex",
          forceStatic
            ? "opacity-100"
            : "translate-y-10 transform-gpu opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100"
        )}
      >
        <a
          href={href}
          className="pointer-events-auto p-0 text-sm font-medium text-[var(--lp-ink)] hover:underline"
        >
          {cta}
          <span aria-hidden="true" className="ms-2">
            &rarr;
          </span>
        </a>
      </div>
    ) : null}

    {!forceStatic && (
      <div className="pointer-events-none absolute inset-0 transform-gpu transition-all duration-300 group-hover:bg-[var(--lp-ink)]/[.03]" />
    )}
  </div>
)
