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
import { archetypeStyle, ARCHETYPES, type AestheticArchetypeId } from "../archetypes";
import { PoweredByBadge } from "../powered-by-badge";
import { googleFontUrl } from "@/lib/theme/apply-theme";
import type { OrgTheme } from "@/lib/theme/types";

export type ShellMode = "light" | "dark";

/**
 * SH2-F1 — the slice of OrgTheme resolveSitePalette/resolveShellStyle/SiteShell
 * need. All three fields optional (unlike OrgTheme itself, where
 * accentColor/primaryColor are required) because test fixtures and partial
 * callers construct these ad hoc — only `customizedAt`'s presence/absence
 * actually gates any behavior; missing accentColor/primaryColor simply means
 * "don't override that token."
 */
export type SitePaletteThemeInput = Partial<Pick<OrgTheme, "customizedAt" | "accentColor" | "primaryColor">>;

/**
 * SH2-F1 — the user-customized palette override.
 *
 * Every R1 archetype ships a curated palette (archetypeStyle's --primary /
 * --secondary). That curated look is the default for every workspace and
 * must NOT be disturbed by an org that has never touched its theme settings.
 * But once an operator (or the copilot's update_theme tool) explicitly saves
 * a color, the public site must actually reflect it — before this fix,
 * SiteShell only ever read the archetype, never `organizations.theme`, so a
 * saved accentColor/primaryColor silently had no visible effect.
 *
 * `saveThemeForOrg` (lib/theme/save-theme.ts) stamps `theme.customizedAt` on
 * every explicit write. Its presence is the gate: absent → archetype palette
 * wins unchanged (build defaults, never customized). Present → the org's own
 * primaryColor becomes --primary and (when set) accentColor becomes
 * --secondary, so the operator's choice actually shows up on every R1 page
 * (this is the shared shell — the one mount point for all of them). This
 * mirrors the house convention: primaryColor is the dominant brand token
 * (--primary / --ring elsewhere, see lib/theme/apply-theme.ts), accentColor
 * is the secondary/accent slot (--accent elsewhere; --secondary here, since
 * the R1 archetype palette's accent slot is named --secondary not --accent).
 *
 * Pure + exported for unit testing (no DOM, no archetype/theme fetching).
 */
export function resolveSitePalette(
  archetypePalette: CSSProperties,
  orgTheme: SitePaletteThemeInput | null | undefined,
): CSSProperties {
  if (!orgTheme?.customizedAt) {
    return archetypePalette;
  }
  const overridden: Record<string, string> = { ...(archetypePalette as Record<string, string>) };
  if (orgTheme.primaryColor) {
    overridden["--primary"] = orgTheme.primaryColor;
  }
  if (orgTheme.accentColor) {
    overridden["--secondary"] = orgTheme.accentColor;
  }
  return overridden as CSSProperties;
}

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
 * palette, applies dark overrides when mode === "dark", then layers the
 * user-customized palette override (SH2-F1 — resolveSitePalette, only takes
 * effect when orgTheme.customizedAt is set), and always adds the
 * no-horizontal-scroll guard + full-height. Exported for unit testing.
 */
export function resolveShellStyle(
  archetype: AestheticArchetypeId,
  mode: ShellMode = "light",
  orgTheme?: SitePaletteThemeInput | null,
): CSSProperties {
  const base = archetypeStyle(archetype) as Record<string, string>;
  const withMode: Record<string, string> =
    mode === "dark" ? { ...base, ...DARK_OVERRIDES } : { ...base };
  const merged = resolveSitePalette(withMode as CSSProperties, orgTheme) as Record<string, string>;
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
  /**
   * SH2-F1 — the org's saved theme (accentColor/primaryColor/customizedAt).
   * Optional: internal preview/fixture surfaces that pass no real org theme
   * keep rendering the archetype's curated palette unchanged, same as
   * `workspaceId` above.
   */
  orgTheme?: SitePaletteThemeInput | null;
  children: ReactNode;
};

export function SiteShell({ archetype, mode = "light", workspaceId, orgTheme, children }: SiteShellProps) {
  // Load the archetype's fonts. archetypeStyle() sets --font-headline/--font-body
  // to family names like "Cabinet Grotesk" / "Satoshi", but nothing on the /w
  // render path (and the /landing-preview route) ever LOADED them — so text fell
  // back to system-ui. googleFontUrl() already emits the right CDN URL for both
  // Google fonts (Outfit, Geist) and Fontshare fonts (Cabinet Grotesk, Satoshi).
  // React hoists <link rel="stylesheet"> to <head> and dedupes by href. Geist is
  // included even though next/font self-hosts it in the root layout, because the
  // archetype CSS references the literal family name "Geist" which next/font's
  // hashed family does not expose.
  const fontsForArchetype = ARCHETYPES[archetype]?.fonts;
  const fontFamilies = fontsForArchetype
    ? Array.from(new Set([fontsForArchetype.headline, fontsForArchetype.body]))
    : [];

  return (
    <div
      data-archetype={archetype}
      data-mode={mode}
      style={resolveShellStyle(archetype, mode, orgTheme)}
    >
      {fontFamilies.map((family) => (
        <link key={family} rel="stylesheet" href={googleFontUrl(family)} />
      ))}
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
