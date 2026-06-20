// landing/archetypes.ts
//
// ✅ Synced with canonical packages/crm/src/lib/workspace/aesthetic-archetypes.ts
//    (v1.40.0+). When the canonical file changes, mirror the change here OR
//    delete this file and import from the canonical path directly.
//
// Section components only ever read from this file — they never hard-code
// hex, never reach for Tailwind color utilities directly. Theming is 100% via
// the CSS vars emitted by archetypeStyle() below.
//
// Universal bans across every archetype (enforced by hand in this codebase
// and via the LLM voice profile in the canonical file):
//   • Inter font            — banned, use the per-archetype headline/body
//   • Centered hero          — banned, all heroes are asymmetric or split
//   • 3-equal-card horizontal grids — banned, vary card sizes / counts
//   • Pure black #000000     — banned, use the archetype's `secondary`
//   • Pure-saturated accents — banned, all hues sit below ~70% saturation
//   • AI purple / lila / cyan-blue — banned, no SaaS gradient palettes

import type { CSSProperties } from "react";

export type AestheticArchetypeId =
  | "editorial-warm"
  | "bold-urgency"
  | "clinical-trust"
  | "cinematic-aspirational"
  | "technical-restrained"
  | "soft-residential"
  | "brutalist"
  | "midnight-craft";

export const ARCHETYPE_IDS: readonly AestheticArchetypeId[] = [
  "editorial-warm",
  "bold-urgency",
  "clinical-trust",
  "cinematic-aspirational",
  "technical-restrained",
  "soft-residential",
  "brutalist",
  "midnight-craft",
] as const;

export type HeroVariant =
  | "left-aligned-asymmetric"
  | "split-screen-50-50"
  | "cinematic-aura";

export type MotionPreset = "subtle" | "balanced" | "editorial";

export type ArchetypeDials = {
  /** 1–10. Higher = more visual variance and surface invention. */
  designVariance: number;
  /** 1–10. Higher = more aggressive animation. */
  motionIntensity: number;
  /** 1–10. Higher = denser layout, more elements per row. */
  visualDensity: number;
};

export type Archetype = {
  id: AestheticArchetypeId;
  label: string;
  fits: string;
  palette: {
    primary: string;
    secondary: string;
    background: string;
    text: string;
    border: string;
  };
  fonts: { headline: string; body: string };
  dials: ArchetypeDials;
  heroVariant: HeroVariant;
  /** When true, render a floating "Get help now" widget on desktop. */
  desktopStickyCTA: boolean;
  motionPreset: MotionPreset;
  /** Tokens the LLM and components must avoid for THIS archetype. */
  bannedHere: readonly string[];
  voice: {
    tone: string;
    pace: "urgent" | "fast" | "measured" | "warm" | "confident";
    leanInto: readonly string[];
    avoid: readonly string[];
  };
  /** Used by next/image source helper to fetch hero photos. */
  fallbackImageQueries: readonly string[];
};

export const ARCHETYPES: Record<AestheticArchetypeId, Archetype> = {
  "editorial-warm": {
    id: "editorial-warm",
    label: "Editorial — warm, craft-focused",
    fits: "Custom craft trades, family-owned local services with a story, boutique service businesses with portfolio depth.",
    palette: { primary: "#9c2b1d", secondary: "#3a3530", background: "#f8f4ec", text: "#1f1c19", border: "#e6dfd1" },
    fonts: { headline: "Cabinet Grotesk", body: "Geist" },
    dials: { designVariance: 7, motionIntensity: 5, visualDensity: 4 },
    heroVariant: "left-aligned-asymmetric",
    desktopStickyCTA: false,
    motionPreset: "editorial",
    bannedHere: ["Inter font", "centered hero", "3-equal-card horizontal grids", "teal / cyan / AI-blue accents", "tech/SaaS color palettes", "pure black #000000", "high-saturation neon accents"],
    voice: {
      tone: "warm, confident, human. Like a trusted neighbor who happens to be the best at their craft.",
      pace: "measured",
      leanInto: ["since [year]", "by hand", "every detail", "lifetime", "earned the trust"],
      avoid: ["disrupt", "revolutionary", "10x", "AI-powered", "synergize"],
    },
    fallbackImageQueries: ["craftsman workshop", "artisan hands working", "skilled tradesperson", "family workshop", "warm restoration project", "craft detail"],
  },

  "bold-urgency": {
    id: "bold-urgency",
    label: "Bold — emergency / urgency-driven",
    fits: "24/7 emergency trades (HVAC, plumbing, locksmith, towing, water-damage restoration, electrician), same-day-service businesses, any vertical where the customer's pain is acute and now.",
    palette: { primary: "#cc2d2d", secondary: "#1a1a1a", background: "#ffffff", text: "#0f0f0f", border: "#e8e8e8" },
    fonts: { headline: "Outfit", body: "Geist" },
    dials: { designVariance: 5, motionIntensity: 7, visualDensity: 6 },
    heroVariant: "split-screen-50-50",
    desktopStickyCTA: true,
    motionPreset: "balanced",
    bannedHere: ["Inter font", "centered hero", "3-equal-card horizontal grids", "warm/cream backgrounds (sets wrong tone)", "thin display fonts (urgency demands weight)", "purple / lila / AI-blue", "pure black #000000"],
    voice: {
      tone: "direct, no-nonsense, action-oriented. Speak like a 911 dispatcher who happens to fix things.",
      pace: "urgent",
      leanInto: ["right now", "we answer", "same-day", "24/7", "guaranteed", "no surprise charges"],
      avoid: ["luxury", "premium", "boutique", "curated", "artisan"],
    },
    fallbackImageQueries: ["plumber working", "hvac technician", "electrician work", "service truck", "uniform worker", "trade professional"],
  },

  "clinical-trust": {
    id: "clinical-trust",
    label: "Clinical — trust + authority",
    fits: "Medical practices, dental offices, law firms, financial advisors, accounting firms, regulated professional services where credentials and authority drive the buying decision.",
    palette: { primary: "#1e3a5f", secondary: "#7a1f24", background: "#fafafa", text: "#15171a", border: "#e2e4e7" },
    fonts: { headline: "Cabinet Grotesk", body: "Geist" },
    dials: { designVariance: 4, motionIntensity: 4, visualDensity: 5 },
    heroVariant: "left-aligned-asymmetric",
    desktopStickyCTA: false,
    motionPreset: "subtle",
    bannedHere: ["Inter font", "centered hero", "3-equal-card horizontal grids", "warm/orange tones", "playful / handwritten / display fonts", "high-saturation accents", "casual emojis or stickers"],
    voice: {
      tone: "calm, authoritative, precise. Like a senior partner explaining a complex matter without condescension.",
      pace: "measured",
      leanInto: ["consultation", "experience since", "board-certified", "represented", "trusted by"],
      avoid: ["disrupt", "ninja", "rockstar", "amazing", "best-in-class"],
    },
    fallbackImageQueries: ["modern dental office", "medical practice interior", "professional consultation", "doctor office reception", "law firm interior", "professional handshake"],
  },

  "cinematic-aspirational": {
    id: "cinematic-aspirational",
    label: "Cinematic — aspirational / luxe",
    fits: "Medspas, premium fitness studios, lifestyle coaching, luxury services, high-end salons, premium wellness.",
    palette: { primary: "#a08562", secondary: "#1a1a1a", background: "#f5f1ec", text: "#1a1a1a", border: "#e3ddd3" },
    fonts: { headline: "Cabinet Grotesk", body: "Satoshi" },
    dials: { designVariance: 8, motionIntensity: 8, visualDensity: 3 },
    heroVariant: "cinematic-aura",
    desktopStickyCTA: false,
    motionPreset: "editorial",
    bannedHere: ["Inter font", "centered hero", "3-equal-card horizontal grids", "stark white backgrounds", "saturated colors", "dense grids", "tech-looking fonts"],
    voice: {
      tone: "cinematic, sensory, confident. Speak as if every word is shot in slow motion.",
      pace: "warm",
      leanInto: ["restorative", "intentional", "signature", "discreet", "quietly"],
      avoid: ["affordable", "deal", "discount", "starter package"],
    },
    fallbackImageQueries: ["luxury spa interior", "modern wellness studio", "minimalist treatment room", "premium fitness studio", "spa relaxation", "aesthetic beauty"],
  },

  "technical-restrained": {
    id: "technical-restrained",
    label: "Technical — restrained / B2B",
    fits: "Marketing/dev agencies, technical consultancies, B2B SaaS, engineering firms, fractional executives.",
    palette: { primary: "#2a2a2a", secondary: "#7a7a7a", background: "#fbfbfb", text: "#0f0f0f", border: "#e8e8e8" },
    fonts: { headline: "Geist", body: "Geist" },
    dials: { designVariance: 6, motionIntensity: 5, visualDensity: 7 },
    heroVariant: "cinematic-aura",
    desktopStickyCTA: false,
    motionPreset: "subtle",
    bannedHere: ["Inter font", "centered hero", "3-equal-card horizontal grids", "warm gradients", "playful illustrations", "lifestyle photography", "saturated accents"],
    voice: {
      tone: "precise, evidence-led, no fluff. Speak like a senior engineer writing a post-mortem.",
      pace: "fast",
      leanInto: ["measured", "shipped", "proven", "engineering team", "case study"],
      avoid: ["amazing", "revolutionary", "game-changing", "innovative"],
    },
    fallbackImageQueries: ["modern workspace", "professional team meeting", "minimalist office", "design studio", "tech workspace", "professional collaboration"],
  },

  "soft-residential": {
    id: "soft-residential",
    label: "Soft — residential / friendly",
    fits: "Home cleaning, landscaping, residential lawn care, residential paint, residential improvement, dog walking, pet grooming.",
    palette: { primary: "#3d6e4f", secondary: "#a08562", background: "#fbfaf6", text: "#1f2421", border: "#e7e3d8" },
    fonts: { headline: "Outfit", body: "Geist" },
    dials: { designVariance: 5, motionIntensity: 5, visualDensity: 4 },
    heroVariant: "left-aligned-asymmetric",
    desktopStickyCTA: false,
    motionPreset: "balanced",
    bannedHere: ["Inter font", "centered hero", "3-equal-card horizontal grids", "harsh red accents", "emergency-style urgency", "corporate/SaaS palettes"],
    voice: {
      tone: "warm, approachable, slightly conversational. Speak like a friendly neighbor who's good at this.",
      pace: "warm",
      leanInto: ["your home", "weekly", "monthly", "we handle", "easy to book"],
      avoid: ["enterprise", "scale", "platform", "leverage"],
    },
    fallbackImageQueries: ["home garden", "tidy modern home", "residential lawn", "clean home interior", "pet grooming", "homeowner happy"],
  },

  "brutalist": {
    id: "brutalist",
    label: "Brutalist — concept-driven creative",
    fits: "Creative studios, design agencies, art galleries, concept-heavy consultancies, anyone whose work itself is the brand statement.",
    palette: { primary: "#0a0a0a", secondary: "#d92020", background: "#fafaf7", text: "#0a0a0a", border: "#0a0a0a" },
    fonts: { headline: "Cabinet Grotesk", body: "Geist" },
    dials: { designVariance: 9, motionIntensity: 6, visualDensity: 6 },
    heroVariant: "left-aligned-asymmetric",
    desktopStickyCTA: false,
    motionPreset: "balanced",
    bannedHere: ["Inter font", "centered hero", "3-equal-card horizontal grids", "soft pastels", "rounded-2xl cards everywhere", "drop shadows", "gradients"],
    voice: {
      tone: "blunt, opinionated, confident. The work speaks for itself.",
      pace: "confident",
      leanInto: ["we built", "we shipped", "selected work", "since [year]"],
      avoid: ["passionate", "love what we do", "team of experts"],
    },
    fallbackImageQueries: ["concrete architecture", "industrial design", "raw studio space", "minimalist gallery", "modern sculpture", "design exhibit"],
  },

  "midnight-craft": {
    id: "midnight-craft",
    label: "Midnight craft — near-black, emerald accent",
    fits: "Premium trades, design-build remodelers, and studios that want a bold dark site.",
    palette: { primary: "#34d399", secondary: "#10b981", background: "#0d100e", text: "#f2f5f3", border: "#1e2a23" },
    fonts: { headline: "Outfit", body: "Geist" },
    dials: { designVariance: 7, motionIntensity: 6, visualDensity: 5 },
    heroVariant: "left-aligned-asymmetric",
    desktopStickyCTA: false,
    motionPreset: "balanced",
    bannedHere: ["light/cream backgrounds", "warm tones", "pure black #000000", "Inter font", "3-equal-card grids"],
    voice: {
      tone: "confident, crafted, understated",
      pace: "measured",
      leanInto: ["craftsmanship", "materials", "portfolio"],
      avoid: ["hype", "discount language"],
    },
    fallbackImageQueries: ["dark modern kitchen remodel", "moody craftsman interior", "architectural detail low light"],
  },
};

// ── CSS-var emitter ────────────────────────────────────────────────────────
// Every section root wraps in <div data-archetype={id} style={archetypeStyle(id)}>.
// This emits a flat surface of vars; downstream Tailwind classes (or raw CSS)
// reference var(--primary), var(--bg), etc. so swapping archetype = swapping
// one prop.

export function archetypeStyle(id: AestheticArchetypeId): CSSProperties {
  const a = ARCHETYPES[id];
  const motionScale = a.motionPreset === "subtle" ? 0.6 : a.motionPreset === "editorial" ? 1.4 : 1.0;
  return {
    ["--primary" as never]: a.palette.primary,
    ["--secondary" as never]: a.palette.secondary,
    ["--bg" as never]: a.palette.background,
    ["--text" as never]: a.palette.text,
    ["--border" as never]: a.palette.border,
    // Convenience derived tokens — components read these for hover / surface tones.
    ["--surface" as never]: "color-mix(in oklab, var(--bg) 94%, var(--text) 6%)",
    ["--surface-deep" as never]: "color-mix(in oklab, var(--bg) 88%, var(--text) 12%)",
    ["--primary-ink" as never]: "#ffffff",
    ["--secondary-ink" as never]: "#ffffff",
    ["--font-headline" as never]: `'${a.fonts.headline}', system-ui, sans-serif`,
    ["--font-body" as never]: `'${a.fonts.body}', system-ui, sans-serif`,
    ["--motion-scale" as never]: String(motionScale),
  } as CSSProperties;
}

// ── tel: helper (no libphonenumber) ────────────────────────────────────────
export function telHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return `tel:${digits}`;
  if (digits.length === 10) return `tel:+1${digits}`;
  return `tel:${digits}`;
}
