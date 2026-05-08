// v1.33.0 — Wired motion primitives into the user-facing page renderer.
//
// Every published landing page now gets scroll-triggered reveals on
// every section below the fold, automatically. Operators don't
// configure this; it just inherits.
//
// Rules:
//   - First section (assumed hero / above-the-fold) renders without
//     a reveal — we want immediate paint, no LCP penalty.
//   - Subsequent sections fade + slide up 20px as they enter the
//     viewport, with a -100px margin so the animation kicks before
//     the user has fully scrolled to the section (feels lively, not
//     pop-in).
//   - The wrapper is a single <motion.div> per section. PageRenderer
//     stays a server component; RevealOnScroll's `"use client"`
//     hydrates only the wrapper, so server-rendered block content
//     remains server-rendered. SEO / LCP unaffected.
//
// Per the v1.32.1 motion philosophy: thin harness, fat skill,
// antifragile. The primitive itself is dumb — it always animates the
// same way. The "skill" of when to compose richer motion (TextReveal
// on hero headlines, MagneticButton on CTAs, Stagger on grid blocks,
// Counter on stat blocks) lives in Claude Code, applied per-page via
// the SF MCP.

import { RevealOnScroll } from "@/components/motion";
import { getLandingBlockManifest } from "./block-registry";
import type { LandingPageSection } from "./sections/types";

export function PageRenderer({ sections }: { sections: LandingPageSection[] }) {
  const ordered = [...sections].sort((a, b) => a.order - b.order);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--sf-bg)", color: "var(--sf-text)" }}>
      {ordered.map((section, index) => {
        const key = `${section.type}-${index}`;
        const manifest = getLandingBlockManifest(section.type);
        if (!manifest) {
          return null;
        }

        const rendered = manifest.render(section.content, key);

        // Hero / above-the-fold: render directly. No motion delay,
        // no LCP penalty.
        if (index === 0) {
          return rendered;
        }

        // Below-the-fold sections: fade + slide up on scroll.
        return (
          <RevealOnScroll
            key={key}
            distance={20}
            duration={0.55}
            margin="-100px"
            className="block w-full"
          >
            {rendered}
          </RevealOnScroll>
        );
      })}
    </div>
  );
}
