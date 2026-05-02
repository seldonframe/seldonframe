// ============================================================================
// PageSchema — pure structured content. No HTML, no styling, no presentation.
// ============================================================================
//
// April 30, 2026 — primitives architecture migration. The old pipeline was
//   blueprint JSON → hardcoded renderer → static HTML.
// The renderer was the ceiling: changing the visual style required hand-editing
// 1,600-line render functions, and the JSON blueprint mixed content (headlines,
// FAQs) with presentation hints (section types, layout flags).
//
// The new pipeline separates the WHAT (PageSchema) from the HOW (DesignTokens
// + Renderer):
//   Soul + business_type → schemaFromSoul() → PageSchema
//   PageSchema + DesignTokens → renderer.render() → HTML + CSS
//
// PageSchema is intentionally renderer-agnostic. A "cinematic dark with
// glassmorphism" renderer and a "clean minimal light" renderer both consume
// the same PageSchema; only the DesignTokens change.

export type BusinessType =
  | "local_service"          // HVAC, plumbing, cleaning, repair
  | "professional_service"   // coaching, consulting, therapy, legal, advisory
  | "saas"                   // software products, dev tools, platforms
  | "agency"                 // marketing/design/dev studios, firms
  | "ecommerce"              // shops, stores, products
  | "other";                 // safest fallback

/** A section is one ordered content block on the page (hero, features, FAQ).
 *  The renderer decides the layout; the schema only carries content + intent. */
export type SectionIntent =
  | "hero"
  | "features"
  | "how_it_works"
  | "pricing"
  | "testimonials"
  | "stats"
  | "faq"
  | "cta"
  | "about"
  | "portfolio"
  | "team"
  | "trust_bar"
  | "services"               // synonym for "features" on local-service pages
  | "products"               // ecommerce product grid
  | "partners"               // "Built on" / "As seen on" horizontal logo/name strip
  | "footer";                // structured footer content

export interface SectionItem {
  /** Title of the item (service name, feature name, product name). */
  title: string;
  description: string;
  /** Optional lucide-react icon name, e.g. "Sparkles", "Code". */
  icon?: string;
  /** Optional URL to a media asset rendered with the item. */
  image?: string;
  /** Optional href when the whole item is clickable. */
  href?: string;
}

export interface SectionFaq {
  question: string;
  answer: string;
}

export interface SectionStat {
  /** "200+", "98%", "3.2x" — raw display string, no formatting work for the renderer. */
  value: string;
  label: string;
}

export interface SectionContent {
  headline?: string;
  subheadline?: string;
  body?: string;
  items?: SectionItem[];
  faqs?: SectionFaq[];
  stats?: SectionStat[];
  /** Optional bullet list of strings for trust_bar / quick proof rows. */
  bullets?: string[];
  /** v1.1.5 / Issue #3 — optional background image URL for hero
   *  sections (full-bleed). Personality-driven; operators override via
   *  update_landing_section. The renderer overlays a dark gradient so
   *  text contrast is preserved regardless of the image's tonality. */
  imageUrl?: string;
}

export interface PageSection {
  /** Stable id, e.g. "hero", "features", "faq". Operators reference sections
   *  by id when they update_page_content / toggle_section. */
  id: string;
  intent: SectionIntent;
  content: SectionContent;
  /** Operator can hide a section without deleting it. */
  visible: boolean;
  /** Lower numbers render first. */
  order: number;
}

export interface PageAction {
  /** Stable id, e.g. "hero_primary_cta", "nav_book". */
  id: string;
  /** Button label, e.g. "Start for $0 →". Markdown not allowed. */
  text: string;
  /** Destination — a path (`/intake`), full URL (`https://github.com/...`),
   *  or `tel:` / `mailto:` URI. The renderer resolves relative paths against
   *  the workspace's public host. */
  href: string;
  style: "primary" | "secondary" | "ghost";
  /** Where this CTA renders. Common placements: "hero", "cta", "nav", "footer".
   *  A renderer ignores placements it doesn't have a slot for. */
  placement: string[];
}

export interface PageTestimonial {
  quote: string;
  name: string;
  role: string;
  company: string;
  avatar?: string;
}

export interface PageProof {
  testimonials: PageTestimonial[];
  /** Company / partner names — "Stripe", "Vercel". The renderer typesets these
   *  or pairs with logos pulled from MediaLibrary.gallery (matched by alt). */
  partners: string[];
  /** Short trust badges — "Open source", "Free to start". */
  trust_badges: string[];
}

export interface MediaAsset {
  url: string;
  alt: string;
  /** Free-form classification: "team", "work", "product", "logo:stripe". */
  tags: string[];
}

export interface MediaLibrary {
  /** Optional autoplay-muted hero video (used by cinematic personalities). */
  hero_video?: string;
  /** Static hero image (used when video isn't desired or supported). */
  hero_image?: string;
  /** Workspace logo (favicon / header / footer). */
  logo?: string;
  /** OG / social-card image. */
  og_image?: string;
  /** Reusable image library — referenced by SectionItem.image, etc. */
  gallery: MediaAsset[];
}

export interface PageBusiness {
  name: string;
  type: BusinessType;
  tagline: string;
  description: string;
  /** Optional contact channels — only rendered if explicitly set. The
   *  renderer never invents placeholder values like "(555) 555-0100". */
  phone?: string;
  email?: string;
  address?: string;
  /** SaaS-specific links — show in nav/footer for SaaS pages, hidden elsewhere. */
  github_url?: string;
  docs_url?: string;
  discord_url?: string;
}

export interface PageSchema {
  business: PageBusiness;
  sections: PageSection[];
  actions: PageAction[];
  proof: PageProof;
  media: MediaLibrary;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Filter and sort the visible sections for rendering. */
export function visibleSectionsInOrder(schema: PageSchema): PageSection[] {
  return schema.sections
    .filter((section) => section.visible)
    .slice()
    .sort((a, b) => a.order - b.order);
}

/** Find all actions with a given placement key (e.g. "hero", "nav"). */
export function actionsForPlacement(
  schema: PageSchema,
  placement: string
): PageAction[] {
  return schema.actions.filter((action) => action.placement.includes(placement));
}

/** Find a section by id. Returns undefined if missing. */
export function findSection(schema: PageSchema, id: string): PageSection | undefined {
  return schema.sections.find((section) => section.id === id);
}
