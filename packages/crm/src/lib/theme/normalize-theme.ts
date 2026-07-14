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
  // SH2-F1 — pass through customizedAt untouched: it is stamped exclusively by
  // saveThemeForOrg (never by normalizeTheme itself), so this function must not
  // invent, validate, or strip it — only carry forward whatever the caller's
  // merge produced. Absent/non-string input omits the field entirely (matches
  // every other optional OrgTheme field's "absent → not customized" default).
  const customizedAt = typeof value.customizedAt === "string" ? value.customizedAt : undefined;
  // v1.56.0 — carry the aesthetic-archetype fields through untouched. These are
  // the operator's live "design" choice (set by setArchetypeForOrg when they
  // switch design on /ready). normalizeTheme previously dropped them, so the
  // public /w landing read `undefined` and fell back to the FROZEN archetype
  // baked at generation time — i.e. "Change design" was a silent no-op. We
  // pass the id through permissively (any string) because the sole consumer
  // (app/(public)/w/[slug]/page.tsx) already guards with `... in ARCHETYPES`
  // before using it, so an unknown value can never reach the renderer.
  const aestheticArchetype =
    typeof value.aestheticArchetype === "string"
      ? (value.aestheticArchetype as OrgTheme["aestheticArchetype"])
      : undefined;
  const aestheticArchetypeChoice =
    typeof value.aestheticArchetypeChoice === "string" ? value.aestheticArchetypeChoice : undefined;

  return {
    primaryColor,
    accentColor,
    fontFamily,
    mode,
    borderRadius,
    logoUrl,
    ...(aestheticArchetype !== undefined ? { aestheticArchetype } : {}),
    ...(aestheticArchetypeChoice !== undefined ? { aestheticArchetypeChoice } : {}),
    ...(customizedAt !== undefined ? { customizedAt } : {}),
  };
}
