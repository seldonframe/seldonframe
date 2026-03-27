"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-[8px] border bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:pointer-events-none disabled:opacity-50 active:not-aria-[haspopup]:translate-y-0 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow-[var(--shadow-xs)] hover:-translate-y-px hover:shadow-[var(--shadow-sm)] active:translate-y-0 active:shadow-[var(--shadow-xs)]",
        outline:
          "border-primary/60 bg-transparent text-primary hover:-translate-y-px hover:bg-primary/10 hover:shadow-[var(--shadow-sm)] active:translate-y-0 active:shadow-[var(--shadow-xs)]",
        secondary:
          "border-border bg-card text-foreground hover:-translate-y-px hover:bg-muted/70 hover:shadow-[var(--shadow-sm)] active:translate-y-0 active:shadow-[var(--shadow-xs)]",
        ghost:
          "border-transparent hover:bg-muted/70 hover:text-foreground",
        destructive:
          "border-destructive/30 bg-destructive/10 text-destructive hover:-translate-y-px hover:bg-destructive/20 hover:shadow-[var(--shadow-sm)]",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 gap-1.5 px-4 text-[14px]",
        xs: "h-7 gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 px-3 text-[13px] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-1.5 px-5 text-[15px]",
        icon: "size-10",
        "icon-xs":
          "size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-8",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
