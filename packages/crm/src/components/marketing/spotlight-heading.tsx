"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

type SpotlightHeadingProps = {
  title: string;
  description?: string;
  className?: string;
};

export function SpotlightHeading({ title, description, className }: SpotlightHeadingProps) {
  return (
    <div className={cn("relative overflow-hidden rounded-3xl border border-white/10 bg-[#071216] p-8 md:p-10", className)}>
      <div className="pointer-events-none absolute left-1/2 top-0 h-44 w-md -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(21,184,176,0.35),rgba(21,184,176,0)_72%)]" />
      <motion.h2
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="relative text-3xl font-semibold tracking-tight md:text-4xl"
      >
        {title}
      </motion.h2>
      {description ? (
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.45, ease: "easeOut", delay: 0.08 }}
          className="relative mt-4 max-w-3xl text-base leading-relaxed text-[#9fb2b8]"
        >
          {description}
        </motion.p>
      ) : null}
    </div>
  );
}
