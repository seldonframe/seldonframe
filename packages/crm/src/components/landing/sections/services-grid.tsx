// v1.36.0 — services-grid block.
//
// The single most-impactful section for a local-service-business
// landing page. Each card has price, optional duration, and a
// "Book" CTA that links to the booking page. Replaces the old
// pricing block for trades/service businesses where pricing is
// per-service not per-tier.
//
// v1.38.4 — per-service icon resolver. Pre-1.38.4 every card
// rendered the same hardcoded <Sparkles> icon, which made the
// services row look like wallpaper. Now we resolve the LLM-
// generated `service.icon` string (lucide name, e.g. "wrench",
// "cloud-rain-wind", "shield") to the actual lucide React
// component. Falls back to <Sparkles> for unknown names so a
// stale icon string never breaks the render.

import Link from "next/link";
import {
  Award,
  BadgeCheck,
  CheckCircle2,
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
import type { ServicesGridSectionContent } from "./types";

// v1.38.4 — name → lucide component map. Covers the icon names the
// hero/services SKILL.md prompts tell Claude to pick from, plus
// vertical-appropriate aliases so close matches still resolve.
// Lookup is normalized: lowercase, strip non-alphanumerics, so
// "BadgeCheck", "badge-check", "badge_check" all work.
const ICON_MAP: Record<string, LucideIcon> = {
  award: Award,
  badgecheck: BadgeCheck,
  checkcircle: CheckCircle2,
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
  // Aliases for common LLM outputs that don't match a lucide name 1:1
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
};

function resolveServiceIcon(iconName: string | undefined): LucideIcon {
  if (!iconName) return Sparkles;
  const normalized = iconName.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
  return ICON_MAP[normalized] ?? Sparkles;
}

export function ServicesGridSection({
  headline,
  subheadline,
  services,
}: ServicesGridSectionContent) {
  return (
    <section className="bg-muted/15 px-5 py-24">
      <div className="mx-auto w-full max-w-6xl space-y-10">
        <header className="text-center max-w-3xl mx-auto">
          <h2 className="text-3xl font-semibold text-foreground md:text-4xl">{headline}</h2>
          {subheadline ? (
            <p className="mt-4 text-base text-muted-foreground md:text-lg leading-relaxed">{subheadline}</p>
          ) : null}
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service, index) => {
            const Icon = resolveServiceIcon(service.icon);
            return (
            <article
              key={`${service.name}-${index}`}
              className="group relative flex flex-col rounded-2xl border bg-card p-6 md:p-7 transition-all hover:border-primary/40 hover:-translate-y-[2px]"
            >
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
                <Icon className="h-5 w-5" />
              </div>

              <h3 className="text-lg font-semibold text-foreground">{service.name}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed flex-1">
                {service.description}
              </p>

              <div className="mt-5 pt-5 border-t border-border/60 flex items-baseline justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.08em] font-mono text-muted-foreground">Price</p>
                  <p className="text-xl font-bold text-foreground tracking-tight mt-0.5">{service.price}</p>
                </div>
                {service.duration ? (
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-[0.08em] font-mono text-muted-foreground">Duration</p>
                    <p className="text-sm text-foreground mt-0.5">{service.duration}</p>
                  </div>
                ) : null}
              </div>

              {service.ctaLink ? (
                <Link
                  href={service.ctaLink}
                  className="crm-button-primary mt-5 h-10 w-full justify-center text-sm font-semibold"
                >
                  {service.ctaText ?? "Book now"}
                </Link>
              ) : null}
            </article>
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
          All prices upfront — no surprises, no hidden fees.
        </p>
      </div>
    </section>
  );
}
