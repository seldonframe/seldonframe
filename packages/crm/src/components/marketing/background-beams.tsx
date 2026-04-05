"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

type BackgroundBeamsProps = {
  className?: string;
};

export function BackgroundBeams({ className }: BackgroundBeamsProps) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden="true">
      <motion.div
        className="absolute -left-24 top-8 h-px w-72 bg-linear-to-r from-transparent via-[#15b8b0]/45 to-transparent"
        animate={{ x: [0, 32, 0], opacity: [0.15, 0.45, 0.15] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-20 bottom-16 h-px w-80 bg-linear-to-r from-transparent via-[#63f6ef]/35 to-transparent"
        animate={{ x: [0, -28, 0], opacity: [0.1, 0.35, 0.1] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
      />
      <motion.div
        className="absolute left-1/2 top-1/3 h-44 w-px bg-linear-to-b from-transparent via-[#15b8b0]/20 to-transparent"
        animate={{ y: [0, 20, 0], opacity: [0.08, 0.24, 0.08] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
      />
    </div>
  );
}
