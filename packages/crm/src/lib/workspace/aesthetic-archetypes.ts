// ============================================================================
// v1.40.0 — Aesthetic Archetype Registry (the "fat skill")
// ============================================================================
//
// Curated design archetypes that map a personality / business shape to a
// complete visual identity (palette + typography + layout dials + hero
// variant + banned tokens). Inspired by the taste-skill repo
// (github.com/leonxlnx/taste-skill) — translated into the SF design system
// with industry-appropriate token defaults.
//
// WHY ARCHETYPES INSTEAD OF VERTICALS:
// "Vertical" is too narrow. A custom-restoration roofer doing $150k metal
// roofs in Hill Country has different brand needs than a storm-chaser
// doing $8k insurance jobs. Both are "roofing." The right axis is what
// emotional category the business sits in:
//
//   - editorial-warm:        craft trades, boutique services, family practices
//   - bold-urgency:          emergency trades (HVAC, plumbing, locksmith, towing)
//   - clinical-trust:        medical, dental, legal, financial, professional services
//   - cinematic-aspirational: medspa, fitness, wellness, lifestyle coaching
//   - technical-restrained:  agencies, consultancies, B2B SaaS, dev shops
//   - soft-residential:      home cleaning, landscaping, residential improvement
//   - brutalist:             creative shops, design studios, concept-driven
//
// The classifier picks ONE archetype based on (vertical + voice signals +
// emergency_service flag + price tier). The orchestrator threads the chosen
// archetype through Step 12.6.5 (design.md generation) and Step 12.7
// (block enhancement). Adding a new archetype = adding one entry here.
//
// EVERY ARCHETYPE BANS:
//   - Inter font (the AI-default; banned per taste-skill)
//   - Centered hero (the AI-default for variance > 4; banned per taste-skill)
//   - 3-equal-card horizontal grids (the AI-default; banned per taste-skill)
//   - Pure black (#000000) and pure-saturated accents
//   - "AI purple/blue" aesthetic (the indigo/cyan SaaS look)

export type AestheticArchetypeId =
  | "editorial-warm"
  | "bold-urgency"
  | "clinical-trust"
  | "cinematic-aspirational"
  | "technical-restrained"
  | "soft-residential"
  | "brutalist";

export interface AestheticArchetype {
  id: AestheticArchetypeId;
  /** One-line operator-facing description. */
  label: string;
  /** Which businesses fit this archetype. */
  fits: string;
  /** Color palette in hex. Tokens chosen to satisfy taste-skill rules
   *  (max 1 accent, saturation < 80%, no pure black). */
  palette: {
    /** The brand accent. Used for primary CTAs + brand moments. */
    primary: string;
    /** The supporting accent. Used sparingly. */
    secondary: string;
    /** Page background tone. */
    background: string;
    /** Body text color. NEVER #000000 per taste-skill. */
    text: string;
    /** Border/divider color. */
    border: string;
  };
  /** Font family pair. Headline first, body second. NEVER includes Inter
   *  per taste-skill. Both must already be in the OrgTheme.fontFamily union
   *  OR registered in the apply-theme.ts googleFontUrl helper. */
  fonts: {
    headline: string;
    body: string;
  };
  /** Three taste-skill dials, scoped per archetype. */
  dials: {
    designVariance: number;
    motionIntensity: number;
    visualDensity: number;
  };
  /** Hero treatment. Centered is BANNED for variance > 4 per taste-skill;
   *  these are the allowed alternatives.
   *  v1.41.0 — cinematic-aura added for archetypes that want the
   *  Aura-style looping-video + liquid-glass dark hero.
   *  v1.43.0 — kept as the *fallback* path; new workspaces prefer
   *  `defaultTemplate` (richer designs from the template registry). */
  heroVariant:
    | "split-screen-50-50"
    | "left-aligned-asymmetric"
    | "cinematic-fullbleed"
    | "founder-portrait"
    | "cinematic-aura";
  /** v1.43.0 — default hero template id from
   *  `components/landing/hero-templates/registry.ts`. The LLM can
   *  override per workspace (it picks from the catalog in the hero
   *  block's section spec), but absent / unknown picks fall back to
   *  this archetype-level default. Empty string means "no template —
   *  use the legacy heroVariant path" (e.g., trades / bold-urgency
   *  where no cinematic template fits yet). */
  defaultTemplate:
    | "cinematic-aura"
    | "viktor-light"
    | "velorah-editorial"
    | "nexora-light"
    | "securify-bold"
    | "stellar-tabs-white"
    | "";
  /** Whether this archetype's pages should ship a desktop sticky CTA
   *  (urgency-driven trades benefit; restrained / clinical do NOT). */
  desktopStickyCTA: boolean;
  /** Tokens this archetype specifically forbids — passed to the design.md
   *  prompt as hard constraints. Each archetype inherits the universal
   *  bans (Inter, centered hero, 3-equal-cards, pure black, AI purple). */
  bannedHere: string[];
  /** Recommended motion preset id (matches v1.34 motion presets). */
  motionPreset: "minimal" | "subtle" | "balanced" | "editorial";
  /** Voice characteristics for the LLM to match in copy. */
  voice: {
    tone: string;
    pace: "fast" | "measured" | "warm" | "urgent" | "calm" | "confident";
    /** Words/phrases to LEAN INTO. */
    leanInto: string[];
    /** Words/phrases to AVOID. */
    avoid: string[];
  };
  /** v1.54.0 — Curated Unsplash search terms verified to return non-zero
   *  results. Used as last-resort fallback by personality-images.ts when
   *  the LLM-generated query + all broadening tiers in
   *  buildQueryCandidates all return zero results. Each entry must be
   *  2-4 words: broad enough to guarantee hits, narrow enough not to be
   *  generic stock-photo filler. Picked deterministically by
   *  hash(business_name) % len so regenerate gives the same fallback. */
  fallbackImageQueries: string[];
}

export const ARCHETYPES: Record<AestheticArchetypeId, AestheticArchetype> = {
  // ─────────────────────────────────────────────────────────────────────────
  "editorial-warm": {
    id: "editorial-warm",
    label: "Editorial — warm, craft-focused",
    fits:
      "Custom craft trades (high-end roofing, fine carpentry, restoration), " +
      "family-owned local services with a story, " +
      "boutique service businesses with portfolio depth.",
    palette: {
      primary: "#9c2b1d", // deep terracotta (sat ~65%, no pure red)
      secondary: "#3a3530", // warm charcoal
      background: "#f8f4ec", // warm cream
      text: "#1f1c19", // near-black, never #000
      border: "#e6dfd1",
    },
    fonts: {
      headline: "Cabinet Grotesk",
      body: "Geist",
    },
    dials: {
      designVariance: 7, // asymmetric, expressive
      motionIntensity: 5, // tasteful scroll reveals
      visualDensity: 4, // breathing room
    },
    heroVariant: "left-aligned-asymmetric",
    defaultTemplate: "viktor-light",
    desktopStickyCTA: false,
    bannedHere: [
      "Inter font",
      "centered hero",
      "3-equal-card horizontal grids",
      "teal / cyan / AI-blue accents",
      "tech/SaaS color palettes",
      "pure black #000000",
      "high-saturation neon accents",
    ],
    motionPreset: "editorial",
    voice: {
      tone:
        "warm, confident, human. Like a trusted neighbor who happens to be the best at their craft.",
      pace: "measured",
      leanInto: ["since [year]", "by hand", "every detail", "lifetime", "earned the trust"],
      avoid: ["disrupt", "revolutionary", "10x", "AI-powered", "synergize"],
    },
    fallbackImageQueries: [
      "craftsman workshop",
      "artisan hands working",
      "skilled tradesperson",
      "family workshop",
      "warm restoration project",
      "craft detail",
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  "bold-urgency": {
    id: "bold-urgency",
    label: "Bold — emergency / urgency-driven",
    fits:
      "24/7 emergency trades (HVAC, plumbing, locksmith, towing, " +
      "water-damage restoration, electrician), same-day-service businesses, " +
      "any vertical where the customer's pain is acute and now.",
    palette: {
      primary: "#cc2d2d", // strong red, sat ~70%, NOT neon
      secondary: "#1a1a1a", // near-black (not #000)
      background: "#ffffff", // clean white
      text: "#0f0f0f", // near-black
      border: "#e8e8e8",
    },
    fonts: {
      headline: "Outfit",
      body: "Geist",
    },
    dials: {
      designVariance: 5, // structured, scannable
      motionIntensity: 7, // alive, urgent
      visualDensity: 6, // info-rich for fast decisions
    },
    heroVariant: "split-screen-50-50",
    defaultTemplate: "", // trades use the legacy variant — no cinematic template fits the bold-urgency vibe
    desktopStickyCTA: true, // "Get help now" floating widget
    bannedHere: [
      "Inter font",
      "centered hero",
      "3-equal-card horizontal grids",
      "warm/cream backgrounds (sets wrong tone)",
      "thin display fonts (urgency demands weight)",
      "purple / lila / AI-blue",
      "pure black #000000",
    ],
    motionPreset: "balanced",
    voice: {
      tone: "direct, no-nonsense, action-oriented. Speak like a 911 dispatcher who happens to fix things.",
      pace: "urgent",
      leanInto: ["right now", "we answer", "same-day", "24/7", "guaranteed", "no surprise charges"],
      avoid: ["luxury", "premium", "boutique", "curated", "artisan"],
    },
    fallbackImageQueries: [
      "plumber working",
      "hvac technician",
      "electrician work",
      "service truck",
      "uniform worker",
      "trade professional",
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  "clinical-trust": {
    id: "clinical-trust",
    label: "Clinical — trust + authority",
    fits:
      "Medical practices, dental offices, law firms, financial advisors, " +
      "accounting firms, regulated professional services where credentials " +
      "and authority drive the buying decision.",
    palette: {
      primary: "#1e3a5f", // deep navy, sat ~50%
      secondary: "#7a1f24", // muted burgundy as supporting
      background: "#fafafa", // off-white, NOT pure white
      text: "#15171a",
      border: "#e2e4e7",
    },
    fonts: {
      headline: "Cabinet Grotesk",
      body: "Geist",
    },
    dials: {
      designVariance: 4, // restrained, calm
      motionIntensity: 4, // subtle, never showy
      visualDensity: 5, // information-rich (credentials)
    },
    heroVariant: "left-aligned-asymmetric",
    defaultTemplate: "nexora-light",
    desktopStickyCTA: false,
    bannedHere: [
      "Inter font",
      "centered hero",
      "3-equal-card horizontal grids",
      "warm/orange tones",
      "playful / handwritten / display fonts",
      "high-saturation accents",
      "casual emojis or stickers",
    ],
    motionPreset: "subtle",
    voice: {
      tone:
        "calm, authoritative, precise. Like a senior partner explaining a complex matter without condescension.",
      pace: "measured",
      leanInto: ["consultation", "experience since", "board-certified", "represented", "trusted by"],
      avoid: ["disrupt", "ninja", "rockstar", "amazing", "best-in-class"],
    },
    fallbackImageQueries: [
      "modern dental office",
      "medical practice interior",
      "professional consultation",
      "doctor office reception",
      "law firm interior",
      "professional handshake",
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  "cinematic-aspirational": {
    id: "cinematic-aspirational",
    label: "Cinematic — aspirational / luxe",
    fits:
      "Medspas, premium fitness studios, lifestyle coaching, luxury services, " +
      "high-end salons, premium wellness, anywhere customers buy the dream " +
      "before they buy the service.",
    palette: {
      primary: "#a08562", // muted gold, sat ~40%
      secondary: "#1a1a1a", // near-black
      background: "#f5f1ec", // warm cream
      text: "#1a1a1a",
      border: "#e3ddd3",
    },
    fonts: {
      headline: "Cabinet Grotesk",
      body: "Satoshi",
    },
    dials: {
      designVariance: 8, // very asymmetric, editorial
      motionIntensity: 8, // smooth, premium reveals
      visualDensity: 3, // generous whitespace
    },
    // v1.41.0 — upgraded from cinematic-fullbleed to cinematic-aura.
    // Coaches and luxe businesses sell the dream; a looping Pexels MP4
    // with liquid-glass chrome conveys that better than a still photo.
    heroVariant: "cinematic-aura",
    defaultTemplate: "cinematic-aura",
    desktopStickyCTA: false,
    bannedHere: [
      "Inter font",
      "centered hero",
      "3-equal-card horizontal grids",
      "stark white backgrounds",
      "saturated colors",
      "dense grids",
      "tech-looking fonts",
    ],
    motionPreset: "editorial",
    voice: {
      tone: "cinematic, sensory, confident. Speak as if every word is shot in slow motion.",
      pace: "warm",
      leanInto: ["restorative", "intentional", "signature", "discreet", "quietly"],
      avoid: ["affordable", "deal", "discount", "starter package"],
    },
    fallbackImageQueries: [
      "luxury spa interior",
      "modern wellness studio",
      "minimalist treatment room",
      "premium fitness studio",
      "spa relaxation",
      "aesthetic beauty",
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  "technical-restrained": {
    id: "technical-restrained",
    label: "Technical — restrained / B2B",
    fits:
      "Marketing/dev agencies, technical consultancies, B2B SaaS, " +
      "engineering firms, fractional executives, anywhere the buyer is a " +
      "technical or operations leader.",
    palette: {
      primary: "#2a2a2a", // near-black accent
      secondary: "#7a7a7a", // mid grey
      background: "#fbfbfb", // warm-white
      text: "#0f0f0f",
      border: "#e8e8e8",
    },
    fonts: {
      headline: "Geist",
      body: "Geist",
    },
    dials: {
      designVariance: 6, // editorial but disciplined
      motionIntensity: 5, // precise, not showy
      visualDensity: 7, // technical, info-rich
    },
    // v1.41.0 — upgraded from split-screen-50-50 to cinematic-aura.
    // Modern B2B / agency landings (Velorah, Aethera, Asme, Aura) all
    // lean on looping-video + liquid-glass + serif italics for the
    // hero. The page body below the fold stays restrained.
    // v1.43.0 — defaultTemplate is viktor-light (the most common agency
    // shape). LLM upgrades to nexora-light / stellar-tabs-white when
    // the workspace IS a SaaS product, or securify-bold for dev tools.
    heroVariant: "cinematic-aura",
    defaultTemplate: "viktor-light",
    desktopStickyCTA: false,
    bannedHere: [
      "Inter font",
      "centered hero",
      "3-equal-card horizontal grids",
      "warm gradients",
      "playful illustrations",
      "lifestyle photography",
      "saturated accents",
    ],
    motionPreset: "subtle",
    voice: {
      tone: "precise, evidence-led, no fluff. Speak like a senior engineer writing a post-mortem.",
      pace: "fast",
      leanInto: ["measured", "shipped", "proven", "engineering team", "case study"],
      avoid: ["amazing", "revolutionary", "game-changing", "innovative"],
    },
    fallbackImageQueries: [
      "modern workspace",
      "professional team meeting",
      "minimalist office",
      "design studio",
      "tech workspace",
      "professional collaboration",
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  "soft-residential": {
    id: "soft-residential",
    label: "Soft — residential / friendly",
    fits:
      "Home cleaning, landscaping, residential lawn care, residential paint, " +
      "residential improvement services, dog walking, pet grooming, anywhere " +
      "the customer is a homeowner who wants their week to feel easier.",
    palette: {
      primary: "#3d6e4f", // muted forest green, sat ~50%
      secondary: "#a08562", // warm tan supporting
      background: "#fbfaf6", // warm white
      text: "#1f2421",
      border: "#e7e3d8",
    },
    fonts: {
      headline: "Outfit",
      body: "Geist",
    },
    dials: {
      designVariance: 5, // approachable but composed
      motionIntensity: 5, // friendly, not flashy
      visualDensity: 4, // breathing room
    },
    heroVariant: "left-aligned-asymmetric",
    defaultTemplate: "viktor-light",
    desktopStickyCTA: false,
    bannedHere: [
      "Inter font",
      "centered hero",
      "3-equal-card horizontal grids",
      "harsh red accents",
      "emergency-style urgency",
      "corporate/SaaS palettes",
    ],
    motionPreset: "balanced",
    voice: {
      tone: "warm, approachable, slightly conversational. Speak like a friendly neighbor who's good at this.",
      pace: "warm",
      leanInto: ["your home", "weekly", "monthly", "we handle", "easy to book"],
      avoid: ["enterprise", "scale", "platform", "leverage"],
    },
    fallbackImageQueries: [
      "home garden",
      "tidy modern home",
      "residential lawn",
      "clean home interior",
      "pet grooming",
      "homeowner happy",
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  brutalist: {
    id: "brutalist",
    label: "Brutalist — concept-driven creative",
    fits:
      "Creative studios, design agencies, art galleries, concept-heavy " +
      "consultancies, anyone whose work itself is the brand statement.",
    palette: {
      primary: "#0a0a0a", // intense near-black
      secondary: "#d92020", // accent red, sat ~75%
      background: "#fafaf7", // off-white
      text: "#0a0a0a",
      border: "#0a0a0a", // hard edges
    },
    fonts: {
      headline: "Cabinet Grotesk",
      body: "Geist",
    },
    dials: {
      designVariance: 9, // very asymmetric, intentionally raw
      motionIntensity: 6, // sharp, not soft
      visualDensity: 6, // dense type, raw layouts
    },
    heroVariant: "left-aligned-asymmetric",
    defaultTemplate: "securify-bold",
    desktopStickyCTA: false,
    bannedHere: [
      "Inter font",
      "centered hero",
      "3-equal-card horizontal grids",
      "soft pastels",
      "rounded-2xl cards everywhere",
      "drop shadows",
      "gradients",
    ],
    motionPreset: "balanced",
    voice: {
      tone: "blunt, opinionated, confident. The work speaks for itself.",
      pace: "confident",
      leanInto: ["we built", "we shipped", "selected work", "since [year]"],
      avoid: ["passionate", "love what we do", "team of experts"],
    },
    fallbackImageQueries: [
      "concrete architecture",
      "industrial design",
      "raw studio space",
      "minimalist gallery",
      "modern sculpture",
      "design exhibit",
    ],
  },
};

// ─── Classifier ─────────────────────────────────────────────────────────────

export interface ArchetypeClassifierInput {
  /** Personality vertical from CRMPersonality (hvac / dental / legal / etc). */
  vertical: string;
  /** Whether the operator's soul says they offer 24/7 emergency service. */
  emergencyService?: boolean | null;
  /** Whether the operator offers same-day service. */
  sameDay?: boolean | null;
  /** Average review rating, when known. Higher → trends premium. */
  reviewRating?: number | null;
  /** Number of reviews, when known. */
  reviewCount?: number | null;
  /** Free-text business description — used as a tie-breaker when keywords
   *  like "luxury" / "boutique" / "premium" / "concept" / "studio" appear. */
  businessDescription?: string | null;
}

/**
 * Pick the best aesthetic archetype for a workspace's soul shape.
 * Conservative fallback to "editorial-warm" — looks great for almost any
 * craft-focused local service business if classification is uncertain.
 */
export function classifyArchetype(input: ArchetypeClassifierInput): AestheticArchetypeId {
  const v = (input.vertical ?? "").toLowerCase();
  const desc = (input.businessDescription ?? "").toLowerCase();

  // Emergency override — beats everything else when the operator runs 24/7.
  if (input.emergencyService === true || /(24\/7|emergency|after.?hours|same.?day)/.test(desc)) {
    if (/(hvac|plumb|electric|locksmith|tow|water.?damage|restoration|roof)/.test(v + " " + desc)) {
      return "bold-urgency";
    }
  }

  // Clinical-trust verticals (regulated professions).
  if (/(legal|law|attorney|dental|dent|medical|doctor|cardio|derma|ortho|fin|account|tax|insur|advis)/.test(v)) {
    return "clinical-trust";
  }

  // Cinematic-aspirational verticals (sell the dream).
  if (/(med.?spa|spa|wellness|fitness|gym|yoga|coach|salon|aesthetic|beauty)/.test(v)) {
    return "cinematic-aspirational";
  }

  // Technical-restrained verticals (B2B / agency).
  if (/(agency|consult|saas|software|developer|engineer|design.?stud|marketing.?agency)/.test(v)) {
    // Brutalist override for design-forward studios.
    if (/(brutal|concept|art|gallery|design.?stud|creative.?stud)/.test(v + " " + desc)) {
      return "brutalist";
    }
    return "technical-restrained";
  }

  // Soft-residential verticals (homeowner-friendly recurring services).
  if (/(clean|landsca|lawn|paint|pest|pet|dog.?walk|groom)/.test(v)) {
    return "soft-residential";
  }

  // Trade verticals — split between bold-urgency (if emergency-flagged) and
  // editorial-warm (craft / restoration / family-owned).
  if (/(roof|hvac|plumb|electric|construction|carpent|fence|deck)/.test(v)) {
    if (/(luxury|premium|boutique|custom|fine|heritage|family.?owned|since)/.test(desc)) {
      return "editorial-warm";
    }
    return "bold-urgency";
  }

  // Catch-all. editorial-warm is the safest "looks great by default" pick
  // for any local-service business — premium feel, asymmetric layout,
  // warm + restrained palette. Beats a teal/Inter SaaS look every time.
  return "editorial-warm";
}

/** Convenience accessor. */
export function getArchetype(id: AestheticArchetypeId): AestheticArchetype {
  return ARCHETYPES[id];
}

// ─── Embed style-token helper ──────────────────────────────────────────────
//
// Returns a flat, embed-ready token bundle (palette + fonts) for a given
// archetype id. Used by the public chatbot widget (embed.js route) so that
// the floating bubble + panel inherit the workspace's brand colors and
// typography rather than the SeldonFrame default teal-on-Inter.
//
// Boundary: this helper does NOT mutate the archetype shape — it just
// picks the fields the embed CSS needs. Adding a new archetype field
// (or renaming one in `palette`) requires updating this projection too.
//
// SELDONFRAME_DEFAULT_TOKENS is the legacy/fallback brand used when:
//   - The workspace's theme.aestheticArchetype is null/missing.
//   - An unknown archetype id arrives (e.g., old serialized data).
// Values match the pre-archetype hardcoded fallbacks in embed.js/route.ts
// so existing workspaces don't visually shift on rollout.

export interface ArchetypeStyleTokens {
  /** Brand accent — used for bubble, header, user-message bubble, focus rings. */
  primary: string;
  /** Supporting accent — used for panel border + accent surfaces. */
  secondary: string;
  /** Surface tone for the message scroll area. */
  background: string;
  /** Body text color for assistant messages. */
  text: string;
  /** Divider / form-input border. */
  border: string;
  /** Headline font family (used only if it's safe to load — see
   *  buildGoogleFontUrl below for the allowlist). */
  headlineFont: string;
  /** Body font family (panel + input + buttons). */
  bodyFont: string;
}

export const SELDONFRAME_DEFAULT_TOKENS: ArchetypeStyleTokens = {
  // #111111 was the pre-archetype hardcoded fallback in embed.js/route.ts
  // at line 96. Keep it so legacy/un-classified workspaces don't shift.
  primary: "#111111",
  secondary: "#e5e5e1",
  background: "#f7f7f5",
  text: "#111111",
  border: "#e5e5e1",
  headlineFont: "Geist",
  bodyFont: "Geist",
};

/**
 * Project an archetype id onto the embed-ready style tokens.
 *
 * Conservative: any non-string / unknown / null input returns the
 * SeldonFrame default tokens. This is the function the embed.js route
 * consumes — it must never throw, since the embed script is served
 * even when DB lookups partially fail.
 */
export function getArchetypeStyleTokens(
  archetypeSlug: string | null | undefined,
): ArchetypeStyleTokens {
  if (!archetypeSlug || typeof archetypeSlug !== "string") {
    return SELDONFRAME_DEFAULT_TOKENS;
  }
  const archetype = ARCHETYPES[archetypeSlug as AestheticArchetypeId];
  if (!archetype) {
    return SELDONFRAME_DEFAULT_TOKENS;
  }
  return {
    primary: archetype.palette.primary,
    secondary: archetype.palette.secondary,
    background: archetype.palette.background,
    text: archetype.palette.text,
    border: archetype.palette.border,
    headlineFont: archetype.fonts.headline,
    bodyFont: archetype.fonts.body,
  };
}

// Google Fonts that are safe to inject as a <link rel="stylesheet"> into
// the host page. Fontshare-licensed fonts (Cabinet Grotesk, Satoshi) are
// deliberately omitted — they require a separate Fontshare snippet that
// is licensed per-domain, so for the public chatbot embed we fall back
// to the system stack when the workspace's archetype font isn't on this
// allowlist. The PublicThemeProvider (which DOES load Fontshare for the
// workspace landing) is a different surface that opts into that license.
const EMBED_GOOGLE_FONT_ALLOWLIST = new Set<string>([
  "Geist",
  "Inter",
  "Outfit",
  "DM Sans",
  "Playfair Display",
  "Space Grotesk",
  "Lora",
  "Anton",
  "Bricolage Grotesque",
  "IBM Plex Mono",
  "Inter Mono",
]);

/**
 * Build a Google Fonts CSS2 URL that fetches the embed's headline + body
 * fonts in a single request. Returns null when neither font is on the
 * Google allowlist (in which case the embed shouldn't inject any link).
 *
 * Weights are 400/500/600/700 — covers body weights + the headline weights
 * the embed actually uses (logo letter, brand name, send button).
 */
export function buildEmbedGoogleFontUrl(
  headlineFont: string,
  bodyFont: string,
): string | null {
  const families = new Set<string>();
  if (EMBED_GOOGLE_FONT_ALLOWLIST.has(headlineFont)) families.add(headlineFont);
  if (EMBED_GOOGLE_FONT_ALLOWLIST.has(bodyFont)) families.add(bodyFont);
  if (families.size === 0) return null;
  const params = Array.from(families)
    .map((name) => `family=${name.replace(/ /g, "+")}:wght@400;500;600;700`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}
