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
