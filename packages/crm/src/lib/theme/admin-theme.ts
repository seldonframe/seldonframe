// Admin theme bridge — extends workspace branding to admin surfaces.
//
// Shipped in SLICE 4a PR 1 C2 per audit §2.3 + §1.2.4.
//
// Relationship to the existing public-theme-provider:
//   - `public-theme-provider.tsx` writes custom `--sf-*` vars into
//     a scoped wrapper div. Customer surfaces consume those vars.
//     Admin surfaces are unaffected.
//   - `admin-theme.ts` + `admin-theme-provider.tsx` (this commit)
//     OVERRIDE a CURATED subset of shadcn's base vars — only
//     `--primary` / `--ring` / `--accent` / `--radius`. Admin chrome
//     keeps its shadcn look; primary-action surfaces (buttons,
//     focus rings, accent backgrounds) pick up the workspace brand.
//
// What this bridge does NOT do:
//   - Invert light/dark mode. Admin mode is user-controlled (system
//     preference / admin toggle), not set by OrgTheme.mode.
//   - Override background / foreground / card / popover. Those are
//     chrome; overriding them would make admin feel inconsistent
//     across workspaces — confusing to builders who work in many
//     workspaces.
//   - Apply custom fontFamily to admin. Admin uses Geist throughout.
//     Workspace fonts are customer-only.

import type { OrgTheme } from "./types";

/**
 * Compute the CSS custom-property overrides for the admin surface,
 * given a workspace OrgTheme. Returns a narrow map — consumers
 * inline the result into a `<style>` tag or React style prop.
 */
export function adminThemeToCSSVars(theme: OrgTheme): Record<string, string> {
  const radius = radiusToRem(theme.borderRadius);
  return {
    "--primary": theme.primaryColor,
    "--ring": theme.primaryColor, // ring matches primary for visual coherence
    "--accent": theme.accentColor,
    "--radius": radius,
  };
}

function radiusToRem(step: OrgTheme["borderRadius"]): string {
  switch (step) {
    case "sharp": return "0px";
    case "rounded": return "0.75rem";
    case "pill": return "9999px";
  }
}
