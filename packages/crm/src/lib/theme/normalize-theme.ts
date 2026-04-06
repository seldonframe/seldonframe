import { DEFAULT_ORG_THEME, type OrgTheme } from "./types";

const ALLOWED_FONTS: OrgTheme["fontFamily"][] = ["Inter", "DM Sans", "Playfair Display", "Space Grotesk", "Lora", "Outfit"];
const ALLOWED_MODES: OrgTheme["mode"][] = ["light", "dark"];
const ALLOWED_RADII: OrgTheme["borderRadius"][] = ["sharp", "rounded", "pill"];

export function isHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export function normalizeTheme(raw: unknown): OrgTheme {
  if (!raw || typeof raw !== "object") {
    return DEFAULT_ORG_THEME;
  }

  const value = raw as Record<string, unknown>;
  const primaryColor = typeof value.primaryColor === "string" && isHexColor(value.primaryColor)
    ? value.primaryColor
    : DEFAULT_ORG_THEME.primaryColor;
  const accentColor = typeof value.accentColor === "string" && isHexColor(value.accentColor)
    ? value.accentColor
    : DEFAULT_ORG_THEME.accentColor;
  const fontFamily =
    typeof value.fontFamily === "string" && ALLOWED_FONTS.includes(value.fontFamily as OrgTheme["fontFamily"])
      ? (value.fontFamily as OrgTheme["fontFamily"])
      : DEFAULT_ORG_THEME.fontFamily;
  const mode =
    typeof value.mode === "string" && ALLOWED_MODES.includes(value.mode as OrgTheme["mode"])
      ? (value.mode as OrgTheme["mode"])
      : DEFAULT_ORG_THEME.mode;
  const borderRadius =
    typeof value.borderRadius === "string" && ALLOWED_RADII.includes(value.borderRadius as OrgTheme["borderRadius"])
      ? (value.borderRadius as OrgTheme["borderRadius"])
      : DEFAULT_ORG_THEME.borderRadius;
  const logoUrl = typeof value.logoUrl === "string" && value.logoUrl.trim() ? value.logoUrl.trim() : null;

  return {
    primaryColor,
    accentColor,
    fontFamily,
    mode,
    borderRadius,
    logoUrl,
  };
}
