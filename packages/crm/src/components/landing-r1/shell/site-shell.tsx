// landing-r1/shell/site-shell.tsx
//
// Shared layout shell for every public R1 page (home + service detail). Applies
// the archetype CSS-var palette via archetypeStyle(), an optional dark-mode
// override, and an overflow-x: clip root so NOTHING can introduce horizontal
// scroll on mobile (the spec's no-horizontal-scroll guard). Renders its
// children; the page composes <Navbar> + content + <Footer> inside it.
//
// "use client" because archetypeStyle() returns inline CSSProperties and we
// keep parity with the other landing-r1 components (all client). No JS state.

"use client";

import type { CSSProperties, ReactNode } from "react";
import { archetypeStyle, type AestheticArchetypeId } from "../archetypes";

export type ShellMode = "light" | "dark";

/**
 * Dark-mode token overrides. We keep the archetype's --primary (brand accent)
 * and --secondary, but flip surfaces/text to a near-black, high-contrast set.
 * Phase 1 only consumes this when theme.mode === "dark"; the dedicated dark
 * ARCHETYPE + operator toggle are P2.
 */
const DARK_OVERRIDES: Record<string, string> = {
  "--bg": "#0d0d0f",
  "--text": "#f4f4f5",
  "--border": "#26262b",
  "--surface": "color-mix(in oklab, #0d0d0f 86%, #f4f4f5 14%)",
  "--surface-deep": "color-mix(in oklab, #0d0d0f 78%, #f4f4f5 22%)",
};

/**
 * Pure: resolve the inline style for the shell root. Starts from the archetype
 * palette, applies dark overrides when mode === "dark", and always adds the
 * no-horizontal-scroll guard + full-height. Exported for unit testing.
 */
export function resolveShellStyle(
  archetype: AestheticArchetypeId,
  mode: ShellMode = "light",
): CSSProperties {
  const base = archetypeStyle(archetype) as Record<string, string>;
  const merged: Record<string, string> =
    mode === "dark" ? { ...base, ...DARK_OVERRIDES } : { ...base };
  merged["overflowX"] = "clip";
  merged["minHeight"] = "100dvh";
  return merged as CSSProperties;
}

export type SiteShellProps = {
  archetype: AestheticArchetypeId;
  mode?: ShellMode;
  children: ReactNode;
};

export function SiteShell({ archetype, mode = "light", children }: SiteShellProps) {
  return (
    <div data-archetype={archetype} data-mode={mode} style={resolveShellStyle(archetype, mode)}>
      {children}
      {/* Belt-and-suspenders: also clip at the html/body level so a child that
          escapes the flow can't add a scrollbar. Scoped global is fine here —
          the shell renders once per page. */}
      <style jsx global>{`
        html, body { overflow-x: clip; }
      `}</style>
    </div>
  );
}
