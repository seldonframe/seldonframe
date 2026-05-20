"use client"

// 2026-05-20 — buttonVariants extracted to ./button-variants.ts so server
// components can import the cva() function without crossing the "use client"
// boundary (Next 16 / RSC enforces this). This file still hosts the Button
// component itself + re-exports buttonVariants for backward compat.

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import type { VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { buttonVariants } from "./button-variants"

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
