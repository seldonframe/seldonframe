"use client";

// v1.41.0 — Word-by-word blur-in entrance for cinematic headlines.
//
// IntersectionObserver triggers on first 10% visibility (once). Each word
// renders as a motion.span with a 3-step keyframe: blurred + below →
// half-blurred mid-flight → in-focus + settled. Stagger via per-word
// delay = i * 100ms.
//
// Used on the hero headline of the cinematic-aura variant. The `shinyWord`
// (if matched) gets the gradient-shiny class layered on top — the blur-in
// runs once, then the shine animates forever.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";

export function BlurText({
  text,
  shinyWord,
  className = "",
  style,
  wordClassName = "",
  shinyClassName = "cin-shiny",
}: {
  text: string;
  /** Optional word inside `text` that gets the gradient-shiny treatment.
   *  Matched case-insensitively, first occurrence only. */
  shinyWord?: string;
  className?: string;
  style?: CSSProperties;
  wordClassName?: string;
  shinyClassName?: string;
}) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            obs.disconnect();
            break;
          }
        }
      },
      { threshold: 0.1 },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, []);

  const words = text.split(/\s+/).filter(Boolean);
  const shinyLower = shinyWord?.toLowerCase();
  let shinyMatched = false;

  return (
    <p
      ref={ref}
      className={className}
      style={{
        display: "flex",
        flexWrap: "wrap",
        rowGap: "0.1em",
        ...style,
      }}
    >
      {words.map((word, i) => {
        const stripped = word.replace(/[.,!?;:]+$/, "").toLowerCase();
        const isShiny = !shinyMatched && shinyLower && stripped === shinyLower;
        if (isShiny) shinyMatched = true;
        return (
          <motion.span
            // eslint-disable-next-line react/no-array-index-key
            key={`${word}-${i}`}
            initial={{ filter: "blur(10px)", opacity: 0, y: 50 }}
            animate={
              visible
                ? {
                    filter: ["blur(10px)", "blur(5px)", "blur(0px)"],
                    opacity: [0, 0.5, 1],
                    y: [50, -5, 0],
                  }
                : undefined
            }
            transition={{
              duration: 0.7,
              times: [0, 0.5, 1],
              ease: "easeOut",
              delay: (i * 100) / 1000,
            }}
            className={`${wordClassName} ${isShiny ? shinyClassName : ""}`}
            style={{ display: "inline-block", marginRight: "0.28em" }}
          >
            {word}
          </motion.span>
        );
      })}
    </p>
  );
}
