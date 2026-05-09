import type { OrgTheme } from "./types";

export function themeToCSS(theme: OrgTheme): Record<string, string> {
  const radius = { sharp: "0px", rounded: "8px", pill: "9999px" }[theme.borderRadius];
  const isDark = theme.mode === "dark";

  // v1.38.4 — defense-in-depth. Pre-1.38.4, themeToCSS only set our
  // bespoke --sf-* variables. But v1.36+ React components (
  // public-booking-form.tsx, services-grid.tsx, project-gallery.tsx,
  // sticky-mobile-cta.tsx, hero.tsx, etc.) increasingly use Tailwind
  // utility classes like `bg-card`, `text-foreground`, `bg-muted/15`,
  // `border-border` — which resolve to the shadcn-convention vars
  // (--card, --foreground, --muted, --border) controlled GLOBALLY
  // via the `.dark` class on <html>. Setting --sf-bg to white didn't
  // help when bg-card stayed dark.
  //
  // Now we ALSO set the shadcn-convention vars locally on the
  // PublicThemeProvider's wrapper div so Tailwind utility classes
  // resolve to our intended palette instead of the global cascade.
  // Paired with the className="light" wrapper added in v1.38.4 on
  // the booking + landing routes — both defenses required because
  // some Tailwind v4 utilities use `:where()` selectors that win
  // against inline-styled vars unless the .dark cascade is also off.
  return {
    "--sf-primary": theme.primaryColor,
    "--sf-accent": theme.accentColor,
    "--sf-font": theme.fontFamily,
    "--sf-radius": radius,
    "--sf-bg": isDark ? "#09090b" : "#ffffff",
    "--sf-text": isDark ? "#fafafa" : "#09090b",
    "--sf-card-bg": isDark ? "#18181b" : "#f4f4f5",
    "--sf-muted": isDark ? "#a1a1aa" : "#71717a",
    "--sf-border": isDark ? "#27272a" : "#e4e4e7",
    // shadcn-convention vars (mirror --sf-* values). Each consumer
    // component picks whichever it prefers; both resolve to the
    // same palette.
    "--background": isDark ? "#09090b" : "#ffffff",
    "--foreground": isDark ? "#fafafa" : "#09090b",
    "--card": isDark ? "#18181b" : "#ffffff",
    "--card-foreground": isDark ? "#fafafa" : "#09090b",
    "--muted": isDark ? "#27272a" : "#f4f4f5",
    "--muted-foreground": isDark ? "#a1a1aa" : "#71717a",
    "--border": isDark ? "#27272a" : "#e4e4e7",
    "--input": isDark ? "#27272a" : "#e4e4e7",
    "--ring": theme.primaryColor,
    "--popover": isDark ? "#18181b" : "#ffffff",
    "--popover-foreground": isDark ? "#fafafa" : "#09090b",
    "--accent": isDark ? "#27272a" : "#f4f4f5",
    "--accent-foreground": isDark ? "#fafafa" : "#09090b",
    "--primary": theme.primaryColor,
    "--primary-foreground": "#ffffff",
    "--secondary": isDark ? "#27272a" : "#f4f4f5",
    "--secondary-foreground": isDark ? "#fafafa" : "#09090b",
    "--destructive": "#ef4444",
    "--destructive-foreground": "#ffffff",
  };
}

// v1.40.0 — font URL resolver supports Google Fonts AND Fontshare.
//
// Google Fonts hosts: Inter, DM Sans, Playfair Display, Space Grotesk,
// Lora, Outfit, Geist (recently added).
//
// Fontshare hosts: Cabinet Grotesk, Satoshi (premium foundry, free for
// commercial use). Geist is also available from Fontshare. We prefer
// Google for fonts available in both because Google's CDN has wider
// edge coverage.
//
// The taste-skill-prescribed defaults (Geist, Outfit, Cabinet Grotesk,
// Satoshi) are all free for commercial use across the licenses we ship.
const FONTSHARE_FONTS = new Set(["Cabinet Grotesk", "Satoshi"]);

export function googleFontUrl(fontFamily: string): string {
  if (FONTSHARE_FONTS.has(fontFamily)) {
    // Fontshare uses a different URL shape; their CSS API exposes weights
    // 300/400/500/700 by default. Convert "Cabinet Grotesk" → "cabinet-grotesk".
    const slug = fontFamily.toLowerCase().replace(/ /g, "-");
    return `https://api.fontshare.com/v2/css?f[]=${slug}@300,400,500,700&display=swap`;
  }
  const encoded = fontFamily.replace(/ /g, "+");
  return `https://fonts.googleapis.com/css2?family=${encoded}:wght@400;500;600;700&display=swap`;
}
