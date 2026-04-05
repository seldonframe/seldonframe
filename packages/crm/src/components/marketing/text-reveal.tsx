"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

type TextRevealProps = {
  lines: string[];
  className?: string;
};

export function TextReveal({ lines, className }: TextRevealProps) {
  return (
    <div className={cn("space-y-1", className)}>
      {lines.map((line, index) => (
        <div key={line} className="overflow-hidden">
          <motion.span
            className="block"
            initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
            whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            viewport={{ once: true, amount: 0.7 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: index * 0.08 }}
          >
            {line}
          </motion.span>
        </div>
      ))}
    </div>
  );
}
