// v1.39.0 — shared lucide icon resolver for landing-page section blocks.
//
// Extracted from services-grid.tsx so benefits.tsx, project-gallery.tsx,
// and any future block can share the same name → component map. The LLM
// (enhance-blocks.ts) generates kebab-case-or-similar icon names per
// service/benefit/etc; this resolver normalizes the lookup (lowercase,
// strip non-alphanumerics) so "BadgeCheck" / "badge-check" / "badge_check"
// all resolve to the same lucide component.
//
// Falls back to <Sparkles> for unknown names so a stale or hallucinated
// icon string never breaks the render.

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
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  // Direct lucide names (lowercased + alphanumerics-only)
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

/**
 * Resolve an LLM-generated icon name (any common casing/separator) to a
 * lucide React component. Returns <Sparkles> for unknown names.
 */
export function resolveBlockIcon(iconName: string | undefined | null): LucideIcon {
  if (!iconName) return Sparkles;
  const normalized = iconName.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
  return ICON_MAP[normalized] ?? Sparkles;
}
