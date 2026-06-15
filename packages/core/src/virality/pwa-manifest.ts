export type PwaIcon = {
  src: string;
  sizes: string;
  type: string;
  /** v1 PWA — "maskable" lets Android crop into the safe zone without
   *  clipping the glyph. Omitted = "any" purpose. */
  purpose?: "any" | "maskable";
};

export type PwaManifestOptions = {
  name: string;
  shortName?: string;
  description?: string;
  startUrl?: string;
  /** v1 PWA — installable scope. When set, the installed app only
   *  "owns" URLs under this path; out-of-scope links open in the
   *  browser. Per-agency app scopes to /portal/<slug>/. */
  scope?: string;
  display?: "standalone" | "fullscreen" | "minimal-ui" | "browser";
  themeColor?: string;
  backgroundColor?: string;
  icons?: PwaIcon[];
};

const DEFAULT_THEME_COLOR = "#0a0e14";
const DEFAULT_BACKGROUND_COLOR = "#0a0e14";

const DEFAULT_ICONS: PwaIcon[] = [
  { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];

export function generatePwaManifest(options: PwaManifestOptions) {
  return {
    name: options.name,
    short_name: options.shortName ?? options.name,
    description: options.description ?? "",
    start_url: options.startUrl ?? "/dashboard",
    scope: options.scope ?? options.startUrl ?? "/",
    display: options.display ?? "standalone",
    theme_color: options.themeColor ?? DEFAULT_THEME_COLOR,
    background_color: options.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
    icons: options.icons ?? DEFAULT_ICONS,
  };
}

/** Minimal branding shape this mapper needs. Matches the relevant
 *  subset of `EffectiveBranding` from
 *  packages/crm/src/lib/partner-agencies/branding.ts so the CRM can
 *  pass the resolved branding straight through. */
export type ManifestBrandingInput = {
  is_white_label: boolean;
  brand_name: string;
  logo_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
};

/** Pure: map effective branding + an org slug into PwaManifestOptions
 *  for the per-agency installable app. The installed app's identity
 *  (name, theme color) comes from the active agency; SeldonFrame
 *  defaults apply when there's no active white-label agency. Icons
 *  are always the default PNG set in v1 (per-agency generated icons
 *  are a fast-follow). */
export function brandingToManifestOptions(input: {
  orgSlug: string;
  branding: ManifestBrandingInput;
}): PwaManifestOptions {
  const scope = `/portal/${input.orgSlug}/`;
  const name = input.branding.is_white_label
    ? input.branding.brand_name
    : "SeldonFrame";
  const themeColor =
    input.branding.is_white_label && input.branding.primary_color
      ? input.branding.primary_color
      : DEFAULT_THEME_COLOR;
  return {
    name,
    shortName: name,
    description: `${name} — your business in your pocket.`,
    startUrl: scope,
    scope,
    display: "standalone",
    themeColor,
    backgroundColor: DEFAULT_BACKGROUND_COLOR,
    icons: DEFAULT_ICONS,
  };
}
