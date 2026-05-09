// v1.34.0 — Motion preset declares the intensity of motion across
// the user's published surfaces.
//   "minimal":   no motion — accessibility-first, prefers-reduced-motion.
//   "subtle":    fade-up reveals only (the v1.33.0 default behavior).
//   "balanced":  reveals + stagger + hover-lift (the v1.33.2 default,
//                what every workspace now ships with).
//   "editorial": full effects — counters, magnetic CTAs, text-reveal.
//
// Today, "balanced" is what every workspace gets at the renderer level
// (sections wrap their grids in <Stagger>, CTAs in <HoverLift>, pages
// in <RevealOnScroll>). The preset field stores the OPERATOR's intent
// so that:
//   1. Future renderers can gate primitives on the preset (e.g.
//      `minimal` short-circuits all wrapping).
//   2. Claude Code reads the preset via get_workspace_state and uses
//      it as a hint when generating new content (e.g. avoids adding
//      heavy animations to a workspace that picked "minimal").
//   3. apply_motion_preset MCP tool lets operators set their intent
//      via natural language: "make my pages feel more premium" →
//      Claude Code calls apply_motion_preset({ preset: "editorial" }).
//
// Per the antifragile pattern: storing the intent matters more than
// enforcing it everywhere on day one. Renderers progressively learn
// to respect it; Claude Code already can.
export type MotionPreset = "minimal" | "subtle" | "balanced" | "editorial";

export interface OrgTheme {
  primaryColor: string;
  accentColor: string;
  fontFamily: "Inter" | "DM Sans" | "Playfair Display" | "Space Grotesk" | "Lora" | "Outfit";
  mode: "light" | "dark";
  borderRadius: "sharp" | "rounded" | "pill";
  logoUrl: string | null;
  /** v1.34.0 — Operator's chosen motion intensity. Default "balanced". */
  motionPreset?: MotionPreset;
}

// v1.38.5 — flipped default mode from "dark" to "light".
// Customer-facing public surfaces (workspace landing, booking page,
// intake form) should be light by industry convention (Cal.com,
// Calendly, Squarespace, every SMB site builder). Operators who
// genuinely want a dark public-facing brand can opt-in via the theme
// settings page; they're the 5% case. The 95% case — local-service
// businesses, agencies, dental, HVAC, legal — wants a clean light
// palette by default. This change cascades: every newly-created
// workspace inherits mode:"light", existing workspaces are
// unaffected (their theme.mode is already stored in organizations.theme).
export const DEFAULT_ORG_THEME: OrgTheme = {
  primaryColor: "#14b8a6",
  accentColor: "#0d9488",
  fontFamily: "Inter",
  mode: "light",
  borderRadius: "rounded",
  logoUrl: null,
  motionPreset: "balanced",
};
