// v1.36.0 — emergency-strip block.
//
// High-prominence "if this is an emergency, call X now" banner.
// Critical for trades businesses (plumbing, HVAC, locksmith, towing,
// roofing) where after-hours emergencies are the highest-LTV segment.
// Visually breaks from the rest of the page using the brand color
// at high opacity to grab attention.

import { Phone, Zap } from "lucide-react";
import type { EmergencyStripSectionContent } from "./types";

function toTelLink(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  return `tel:${digits.startsWith("+") ? digits : digits}`;
}

export function EmergencyStripSection({
  headline,
  phone,
  phoneLink,
  hours,
}: EmergencyStripSectionContent) {
  const telHref = phoneLink ?? toTelLink(phone);

  return (
    <section className="px-5 py-8 md:py-10">
      <div className="mx-auto w-full max-w-6xl">
        <div className="rounded-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground px-6 py-6 md:px-8 md:py-8 grid gap-4 md:grid-cols-[auto,1fr,auto] items-center">
          <div className="hidden md:flex h-12 w-12 items-center justify-center rounded-full bg-primary-foreground/15 text-primary-foreground">
            <Zap className="h-6 w-6" />
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] font-mono text-primary-foreground/80 mb-1">
              Emergency
            </p>
            <h3 className="text-lg md:text-xl font-bold tracking-tight">{headline}</h3>
            {hours ? (
              <p className="mt-1 text-sm text-primary-foreground/85 leading-relaxed">{hours}</p>
            ) : null}
          </div>

          <a
            href={telHref}
            className="inline-flex items-center gap-2 rounded-full bg-primary-foreground text-primary px-5 py-3 font-semibold hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            <Phone className="h-4 w-4" />
            <span className="text-base">{phone}</span>
          </a>
        </div>
      </div>
    </section>
  );
}
