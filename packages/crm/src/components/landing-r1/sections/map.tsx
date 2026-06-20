// landing-r1/sections/map.tsx
//
// Lazy, keyless Google Maps embed. Archetype-themed via CSS vars (inherited
// from SiteShell). Renders NOTHING when there's no address — the map is a
// progressive enhancement, never a broken empty box.

"use client";

import type { AestheticArchetypeId } from "../archetypes";
import { mapEmbedUrl } from "@/lib/landing/map-embed";

export type MapSectionProps = {
  /** Pre-joined, one-line address (use joinFooterAddress at the call site). */
  address?: string | null;
  archetype: AestheticArchetypeId;
  /** Optional heading; omit for a bare map. */
  heading?: string;
};

export function MapSection({ address, heading }: MapSectionProps) {
  const src = mapEmbedUrl(address);
  if (!src) return null;
  return (
    <section className="sf-r1-map" data-slot="map">
      <div className="container">
        {heading ? <h2 className="sf-r1-map__heading">{heading}</h2> : null}
        <div className="sf-r1-map__frame">
          <iframe
            src={src}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title="Business location map"
            allowFullScreen
          />
        </div>
      </div>
      <MapStyles />
    </section>
  );
}

function MapStyles() {
  return (
    <style jsx global>{`
      .sf-r1-map { padding: 0 0 64px; background: var(--bg); color: var(--text); }
      .sf-r1-map .container {
        max-width: 1200px; margin: 0 auto;
        padding-left: 20px; padding-right: 20px;
      }
      @media (min-width: 768px) { .sf-r1-map .container { padding-left: 32px; padding-right: 32px; } }
      @media (min-width: 1024px) { .sf-r1-map .container { padding-left: 48px; padding-right: 48px; } }
      .sf-r1-map__heading {
        margin: 0 0 16px; font-family: var(--font-headline); font-weight: 800;
        font-size: clamp(22px, 3vw, 30px); letter-spacing: -0.015em;
      }
      .sf-r1-map__frame {
        width: 100%; aspect-ratio: 16 / 7; min-height: 220px;
        border-radius: 14px; overflow: hidden;
        border: 1px solid var(--border); background: var(--surface);
      }
      .sf-r1-map__frame iframe { width: 100%; height: 100%; border: 0; display: block; }
    `}</style>
  );
}
