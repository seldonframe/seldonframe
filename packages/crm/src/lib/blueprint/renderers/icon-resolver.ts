// packages/crm/src/lib/blueprint/renderers/icon-resolver.ts
//
// 2026-05-15 — Shared lucide-react icon resolver for the workspace render
// path. Used by both the v2 React renderer (PageRenderer sections) and the
// v1 SSR renderer (general-service-v1.ts via renderIconToSvgString).
//
// Resolution order:
//   1. Concept aliases (Claude-friendly shortcuts: "storm" → CloudRainWind)
//   2. Direct lucide-react lookup (full ~1500-icon library)
//   3. Sparkles fallback
//
// Antifragility: as Claude gets better at picking lucide names directly, the
// alias table becomes less needed but doesn't hurt. As lucide ships new icons,
// they're automatically available without any change to this file.
//
// Spec: docs/superpowers/specs/2026-05-15-soften-rigid-validators-design.md

import {
  Award,
  BadgeCheck,
  CheckCircle2,
  CircleCheckBig,
  Clock,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  DollarSign,
  Droplets,
  Hammer,
  HardHat,
  Heart,
  Home,
  HousePlug,
  Leaf,
  MapPin,
  Phone,
  Rocket,
  Scissors,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Stethoscope,
  ThumbsUp,
  Truck,
  Wind,
  Wrench,
  Zap,
  icons as lucideIcons,
  type LucideIcon,
} from "lucide-react";

const FALLBACK_ICON: LucideIcon = Sparkles;

// Concept aliases preserved from v1.39.0 (the original
// components/landing/sections/icon-resolver.ts). These are Claude-friendly
// shortcuts: when Claude picks a vocabulary term ("storm", "drain",
// "emergency") rather than the exact lucide name, the alias maps it to a
// sensible icon. Without aliases, the lucide-react fallthrough would still
// catch most direct names (`shield_check` → ShieldCheck), but the aliases
// add semantic shortcuts the LLM tends to use.
const ALIASES: Record<string, LucideIcon> = {
  // Direct lucide names (lowercased + alphanumerics-only) — kept for
  // backward-compat; the lucide-react fallthrough below catches these too,
  // but keeping them here makes the alias resolution one lookup instead of
  // two for the common case.
  award: Award,
  badgecheck: BadgeCheck,
  checkcircle: CheckCircle2,
  circlecheckbig: CircleCheckBig,
  clock: Clock,
  cloudrain: CloudRain,
  cloudrainwind: CloudRainWind,
  cloudsnow: CloudSnow,
  dollarsign: DollarSign,
  droplets: Droplets,
  hammer: Hammer,
  hardhat: HardHat,
  heart: Heart,
  home: Home,
  houseplug: HousePlug,
  leaf: Leaf,
  mappin: MapPin,
  phone: Phone,
  rocket: Rocket,
  scissors: Scissors,
  shield: Shield,
  shieldcheck: ShieldCheck,
  sparkles: Sparkles,
  star: Star,
  stethoscope: Stethoscope,
  thumbsup: ThumbsUp,
  truck: Truck,
  wind: Wind,
  wrench: Wrench,
  zap: Zap,
  // Generic concept aliases
  storm: CloudRainWind,
  rain: CloudRain,
  snow: CloudSnow,
  inspection: ShieldCheck,
  repair: Wrench,
  install: Hammer,
  installation: Hammer,
  emergency: Zap,
  warranty: BadgeCheck,
  estimate: DollarSign,
  quote: DollarSign,
  free: DollarSign,
  service: Wrench,
  cleaning: Sparkles,
  same: Clock,
  sameday: Clock,
  fast: Zap,
  trust: ShieldCheck,
  trusted: ShieldCheck,
  insured: Shield,
  licensed: BadgeCheck,
  bonded: Shield,
  family: Heart,
  familyowned: Heart,
  local: MapPin,
  experience: Award,
  experienced: Award,
  // Roofing
  shingle: Home,
  metal: Shield,
  gutter: Droplets,
  tarp: Shield,
  hail: CloudRainWind,
  roof: Home,
  // Plumbing
  drain: Droplets,
  leak: Droplets,
  heater: Zap,
  pipe: Wrench,
  water: Droplets,
  // HVAC
  cooling: Wind,
  ac: Wind,
  heating: Zap,
  furnace: Zap,
  ductwork: Home,
  duct: Home,
  thermostat: Home,
  hvac: Wind,
  // Treatments / spa / dental
  treatment: Leaf,
  facial: Sparkles,
  massage: Heart,
  laser: Zap,
  // Auto / fleet
  vehicle: Truck,
  van: Truck,
  fleet: Truck,
};

/** Normalize for the alias table: lowercase, strip non-alphanumerics. */
function normalizeForAlias(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Convert snake_case / kebab-case / "Some Words" to PascalCase for the
 *  lucide-react export-name lookup. E.g. "shield_check" → "ShieldCheck",
 *  "shield-check" → "ShieldCheck", "Shield Check" → "ShieldCheck". */
function toPascalCase(name: string): string {
  return name
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join("");
}

/**
 * Resolve an icon name to a lucide-react component.
 *
 * Resolution order:
 *   1. Concept aliases (e.g. "storm" → CloudRainWind)
 *   2. Direct lucide-react lookup with PascalCase normalization
 *   3. Sparkles fallback
 *
 * Returns the Sparkles component (never null) so callers can always render
 * an icon without null checks.
 */
export function resolveIconComponent(
  name: string | null | undefined
): LucideIcon {
  if (!name || !name.trim()) return FALLBACK_ICON;
  const trimmed = name.trim();

  // 1. Aliases (concept shortcuts).
  const aliasKey = normalizeForAlias(trimmed);
  if (ALIASES[aliasKey]) return ALIASES[aliasKey];

  // 2. Direct lucide-react lookup (full library).
  const pascal = toPascalCase(trimmed);
  const direct = (lucideIcons as Record<string, LucideIcon | undefined>)[
    pascal
  ];
  if (direct) return direct;

  // 3. Sparkles fallback.
  return FALLBACK_ICON;
}

/**
 * Render an icon name to an inline SVG string for SSR contexts.
 * Used by general-service-v1.ts to emit HTML directly.
 */
export function renderIconToSvgString(
  name: string | null | undefined,
  options: { size?: number; strokeWidth?: number } = {}
): string {
  // Defer the react-dom/server import so this module can be imported in
  // contexts where SSR isn't available (e.g. test setup). The function
  // itself is only used by SSR paths.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { renderToString } = require("react-dom/server") as typeof import("react-dom/server");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createElement } = require("react") as typeof import("react");
  const Icon = resolveIconComponent(name);
  return renderToString(
    createElement(Icon, {
      size: options.size ?? 24,
      strokeWidth: options.strokeWidth ?? 2,
    })
  );
}
