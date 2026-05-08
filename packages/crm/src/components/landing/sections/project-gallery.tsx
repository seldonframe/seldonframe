// v1.38.1 — project-gallery block.
//
// Masonry grid of stock photos (Unsplash, auto-fetched per service in
// enhanceLandingForWorkspace) that makes a trades-business landing
// page feel populated rather than text-only. The single most-impactful
// "feels real" block we can ship without operator-supplied photography.
//
// Layout: 2 cols on mobile, 3 cols on tablet, 4 cols on desktop. Each
// image gets a small hover-lift + zoom interaction. Optional caption
// shows on hover (or always, on mobile) so visitors know what they're
// looking at without the gallery feeling stock-y.
//
// Operators can replace any image post-launch via update_landing_section.

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { ProjectGallerySectionContent } from "./types";

export function ProjectGallerySection({
  headline,
  subheadline,
  items,
  ctaText,
  ctaLink,
}: ProjectGallerySectionContent) {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <section className="px-5 py-24" id="gallery">
      <div className="mx-auto w-full max-w-6xl space-y-10">
        <header className="text-center max-w-3xl mx-auto">
          <h2 className="text-3xl font-semibold text-foreground md:text-4xl">{headline}</h2>
          {subheadline ? (
            <p className="mt-4 text-base text-muted-foreground md:text-lg leading-relaxed">{subheadline}</p>
          ) : null}
        </header>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
          {items.map((item, index) => (
            <figure
              key={`gallery-${index}`}
              className="group relative aspect-square overflow-hidden rounded-2xl border bg-muted/20 transition-all hover:-translate-y-[2px] hover:shadow-lg"
            >
              {/* Using <img> not next/image so dynamic Unsplash URLs
                  don't require remotePatterns config — Unsplash already
                  serves WebP at the CDN edge with auto=format. */}
              <img
                src={item.image}
                alt={item.alt}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              {item.caption ? (
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-3 pt-8 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 md:text-sm">
                  {item.caption}
                </figcaption>
              ) : null}
            </figure>
          ))}
        </div>

        {ctaText && ctaLink ? (
          <div className="flex justify-center pt-2">
            <Link
              href={ctaLink}
              className="crm-button-primary h-11 px-7 text-sm font-semibold"
            >
              {ctaText}
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
