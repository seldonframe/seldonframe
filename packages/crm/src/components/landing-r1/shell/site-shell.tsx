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
//
// Growth loop #1 (virality pack, Task 1): when `workspaceId` is provided, the
// shell mounts <PoweredByBadge> once, after children — i.e. below the
// per-archetype <Footer> the page composes inside us, so it reads as a final
// credit line rather than part of the operator's own footer content. This is
// the ONE shell-level mount point for every R1 archetype; per-archetype
// Footer markup is untouched. `workspaceId` is optional and omitted by the
// internal fixture/preview surfaces (landing-preview/[archetype],
// landing-r1/preview.tsx) — those keep rendering exactly as before, no badge.

"use client";

import type { CSSProperties, ReactNode } from "react";
import { archetypeStyle, type AestheticArchetypeId } from "../archetypes";
import { PoweredByBadge } from "../powered-by-badge";

export type ShellMode = "light" | "dark";

/**
 * Dark-mode token overrides. We keep the archetype's --primary (brand accent)
 * and --secondary, but flip surfaces/text to a near-black, high-contrast set.
 * `resolveShellStyle` merges these when theme.mode === "dark". The dedicated
 * dark archetype (`midnight-craft`) and the `/clients/new` light/dark operator
 * toggle both shipped in P2 and consume this path.
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
  /**
   * The workspace this site belongs to. When present, mounts the
   * ref-attributed powered-by badge once at the bottom of the shell. Omit on
   * internal preview/fixture surfaces that have no real workspace.
   */
  workspaceId?: string;
  children: ReactNode;
};

export function SiteShell({ archetype, mode = "light", workspaceId, children }: SiteShellProps) {
  return (
    <div data-archetype={archetype} data-mode={mode} style={resolveShellStyle(archetype, mode)}>
      {children}
      {workspaceId && <PoweredByBadge workspaceId={workspaceId} />}
      {/* Belt-and-suspenders: also clip at the html/body level so a child that
          escapes the flow can't add a scrollbar. Scoped global is fine here —
          the shell renders once per page. */}
      <style jsx global>{`
        html, body { overflow-x: clip; }
      `}</style>
    </div>
  );
}
