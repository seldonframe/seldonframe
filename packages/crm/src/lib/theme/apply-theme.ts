import type { OrgTheme } from "./types";

export function themeToCSS(theme: OrgTheme): Record<string, string> {
  const radius = { sharp: "0px", rounded: "8px", pill: "9999px" }[theme.borderRadius];
  const isDark = theme.mode === "dark";

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
  };
}

export function googleFontUrl(fontFamily: string): string {
  const encoded = fontFamily.replace(/ /g, "+");
  return `https://fonts.googleapis.com/css2?family=${encoded}:wght@400;500;600;700&display=swap`;
}
