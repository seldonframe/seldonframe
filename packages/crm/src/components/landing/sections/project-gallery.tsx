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
// v1.40.2 — per-tile onError fallback. When an Unsplash URL 404s or
// fails to load, we hide that tile entirely instead of rendering a
// broken-image icon (which is what the Vesper test exposed: 2 of 6
// gallery tiles came up broken). The grid auto-reflows around the
// missing items, leaving a clean 4-tile or 5-tile composition rather
// than two visually-broken slots.
//
// Operators can replace any image post-launch via update_landing_section.

"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import Link from "next/link";
import type { ProjectGallerySectionContent } from "./types";

function GalleryTile({
  item,
}: {
  item: ProjectGallerySectionContent["items"][number];
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  // v1.40.5 — Unsplash photographer credit appears as the bottom line
  // of the hover overlay (alongside the existing caption). Required
  // for production-tier API approval. Always rendered when attribution
  // is present, regardless of whether the caption is — operators
  // sometimes turn captions off but Unsplash credits stay on.
  const attribution = item.attribution;
  const hasOverlay = Boolean(item.caption) || Boolean(attribution);
  return (
    <figure className="group relative aspect-square overflow-hidden rounded-2xl border bg-muted/20 transition-all hover:-translate-y-[2px] hover:shadow-lg">
      <img
        src={item.image}
        alt={item.alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
      {hasOverlay ? (
        <figcaption className="absolute inset-x-0 bottom-0 space-y-1 bg-gradient-to-t from-black/70 to-transparent px-3 py-3 pt-8 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 md:text-sm">
          {item.caption ? <span className="block">{item.caption}</span> : null}
          {attribution ? (
            <span className="block text-[10px] font-normal text-white/70">
              Photo by{" "}
              <a
                href={`${attribution.photographer_url}${attribution.photographer_url.includes("?") ? "&" : "?"}utm_source=seldonframe&utm_medium=referral`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-2 hover:underline hover:text-white"
              >
                {attribution.photographer_name}
              </a>{" "}
              on{" "}
              <a
                href="https://unsplash.com/?utm_source=seldonframe&utm_medium=referral"
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-2 hover:underline hover:text-white"
              >
                Unsplash
              </a>
            </span>
          ) : null}
        </figcaption>
      ) : null}
    </figure>
  );
}

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
            <GalleryTile key={`gallery-${index}`} item={item} />
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
