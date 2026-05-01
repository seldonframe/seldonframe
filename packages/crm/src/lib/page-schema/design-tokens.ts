// ============================================================================
// DesignTokens — design intent. The renderer translates these into CSS.
// ============================================================================
//
// April 30, 2026 — primitives architecture. Tokens describe what the operator
// wants the page to FEEL like; they don't dictate exact CSS. Different
// renderers can interpret the same tokens differently — a "cinematic"
// personality on the static renderer might mean Cal Sans + dark mode + subtle
// fade-ups; on a future Framer-Motion-powered renderer the same personality
// would unlock parallax + video backgrounds + scroll-driven text reveals.
//
// Operator-facing tools (set_page_style, update_design_tokens) edit this
// object. The renderer reads it. Neither side encodes layout.

export type PagePersonality =
  | "cinematic"   // dark, video bg, glassmorphism, Framer Motion
  | "clean"       // light, minimal, Inter/system, no effects
  | "editorial"   // serif headings, spacious, elegant
  | "bold"        // large type, high contrast, striking
  | "minimal"     // ultra-clean, lots of whitespace
  | "playful";    // rounded, colorful, friendly

export type ColorMode = "dark" | "light";

export type TypeScale = "compact" | "comfortable" | "editorial";
export type Density = "compact" | "comfortable" | "spacious";
export type Motion = "none" | "subtle" | "cinematic";

export interface PalettePreferences {
  /** Hex color, e.g. "#10B981". The renderer derives background, surface,
   *  text, muted, and border from this single accent + the color mode. */
  accent: string;
}

export interface TypographyPreferences {
  /** Google Font name for headings. Renderer is responsible for loading. */
  display: string;
  /** Google Font name for body text. */
  body: string;
  scale: TypeScale;
}

export interface EffectFlags {
  glassmorphism: boolean;
  video_background: boolean;
  scroll_animations: boolean;
  parallax: boolean;
}

export interface DesignTokens {
  personality: PagePersonality;
  mode: ColorMode;
  palette: PalettePreferences;
  typography: TypographyPreferences;
  motion: Motion;
  density: Density;
  effects: EffectFlags;
}

// ─── Personality defaults ────────────────────────────────────────────────────
//
// Operators pick a personality (set_page_style({ style: "cinematic" })) and
// the renderer uses these defaults. Operators can override individual tokens
// after — update_design_tokens({ palette: { accent: "#10B981" } }) merges on
// top of the personality defaults.

export const PERSONALITY_DEFAULTS: Record<PagePersonality, Partial<DesignTokens>> = {
  cinematic: {
    mode: "dark",
    typography: {
      display: "Instrument Serif",
      body: "Barlow",
      scale: "editorial",
    },
    motion: "cinematic",
    density: "spacious",
    effects: {
      glassmorphism: true,
      video_background: true,
      scroll_animations: true,
      parallax: true,
    },
  },
  clean: {
    mode: "light",
    typography: { display: "Inter", body: "Inter", scale: "comfortable" },
    motion: "subtle",
    density: "comfortable",
    effects: {
      glassmorphism: false,
      video_background: false,
      scroll_animations: true,
      parallax: false,
    },
  },
  editorial: {
    mode: "light",
    typography: { display: "Instrument Serif", body: "Inter", scale: "editorial" },
    motion: "subtle",
    density: "spacious",
    effects: {
      glassmorphism: false,
      video_background: false,
      scroll_animations: true,
      parallax: true,
    },
  },
  bold: {
    mode: "dark",
    typography: { display: "Kanit", body: "Inter", scale: "editorial" },
    motion: "subtle",
    density: "comfortable",
    effects: {
      glassmorphism: false,
      video_background: true,
      scroll_animations: true,
      parallax: false,
    },
  },
  minimal: {
    mode: "light",
    typography: { display: "Inter", body: "Inter", scale: "compact" },
    motion: "none",
    density: "compact",
    effects: {
      glassmorphism: false,
      video_background: false,
      scroll_animations: false,
      parallax: false,
    },
  },
  playful: {
    mode: "light",
    typography: { display: "Inter", body: "Inter", scale: "comfortable" },
    motion: "subtle",
    density: "comfortable",
    effects: {
      glassmorphism: false,
      video_background: false,
      scroll_animations: true,
      parallax: false,
    },
  },
};

/**
 * Build a complete DesignTokens object for a personality, layering any
 * explicit operator overrides on top. Renderer-safe — every required field
 * is filled with a sensible default.
 */
export function tokensForPersonality(
  personality: PagePersonality,
  overrides: Partial<DesignTokens> = {},
  defaultAccent = "#14b8a6"
): DesignTokens {
  const personalityDefaults = PERSONALITY_DEFAULTS[personality];

  return {
    personality,
    mode: overrides.mode ?? personalityDefaults.mode ?? "light",
    palette: {
      accent: overrides.palette?.accent ?? defaultAccent,
    },
    typography: {
      display:
        overrides.typography?.display ??
        personalityDefaults.typography?.display ??
        "Inter",
      body:
        overrides.typography?.body ??
        personalityDefaults.typography?.body ??
        "Inter",
      scale:
        overrides.typography?.scale ??
        personalityDefaults.typography?.scale ??
        "comfortable",
    },
    motion: overrides.motion ?? personalityDefaults.motion ?? "subtle",
    density: overrides.density ?? personalityDefaults.density ?? "comfortable",
    effects: {
      glassmorphism:
        overrides.effects?.glassmorphism ??
        personalityDefaults.effects?.glassmorphism ??
        false,
      video_background:
        overrides.effects?.video_background ??
        personalityDefaults.effects?.video_background ??
        false,
      scroll_animations:
        overrides.effects?.scroll_animations ??
        personalityDefaults.effects?.scroll_animations ??
        false,
      parallax:
        overrides.effects?.parallax ??
        personalityDefaults.effects?.parallax ??
        false,
    },
  };
}
