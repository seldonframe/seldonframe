// buildPageMetadata — one place to assemble per-page SEO/GEO `Metadata`.
//
// SeldonFrame's discoverable pages (the /ai-agents SEO tree, the /marketplace
// storefront) each hand-rolled the same shape: a canonical, an optional
// `text/markdown` alternate pointing at the page's Markdown twin (the GEO
// discoverability hook agents follow), and an OpenGraph block whose title/
// description default from the page's own. The builder surface (/build,
// /build/keys, /build/wallet, and future builder pages) needs the exact same
// treatment, so this factors it to a single tiny, pure helper — pass the page's
// path + copy (and a `.md` twin when one exists) and get a coherent <head>.
//
// Pure (no I/O, no React): unit-tested with plain assertions. `metadataBase`
// (set once in the root layout to https://seldonframe.com) makes the relative
// canonical/OG URLs resolve to absolute — so callers pass root-relative paths.

import type { Metadata } from "next";
import { getCompetitor } from "./alternative-pages";
import { buildOgUrl, shortPrice } from "./og-card";

export type BuildPageMetadataInput = {
  /** Root-relative path of the page, e.g. "/build" (a missing leading slash is
   *  normalized). Used as the canonical and the OpenGraph url. */
  path: string;
  /** The <title> (and the OpenGraph title, unless `ogTitle` overrides it). */
  title: string;
  /** The meta description (and the OpenGraph description, unless overridden). */
  description: string;
  /** When the page has a Markdown twin, its root-relative path (e.g.
   *  "/build.md"). Emits `alternates.types["text/markdown"]` so crawlers/agents
   *  discover it. Omit for pages without a twin. */
  markdownPath?: string;
  /** Optional cleaner social-card title, when the <title> carries an SEO suffix
   *  you don't want on the OpenGraph card. Defaults to `title`. */
  ogTitle?: string;
  /** Optional social-card description override. Defaults to `description`. */
  ogDescription?: string;
};

/** Ensure a root-relative path begins with exactly one leading slash. */
function rootRelative(path: string): string {
  return `/${path.replace(/^\/+/, "")}`;
}

/**
 * Assemble a Next `Metadata` for a discoverable page: title + description, a
 * canonical (and a `text/markdown` alternate when a twin exists), and an
 * OpenGraph website block defaulting its copy from the page's. Pure.
 */
export function buildPageMetadata(input: BuildPageMetadataInput): Metadata {
  const canonical = rootRelative(input.path);

  const alternates: NonNullable<Metadata["alternates"]> = { canonical };
  if (input.markdownPath) {
    alternates.types = { "text/markdown": rootRelative(input.markdownPath) };
  }

  return {
    title: input.title,
    description: input.description,
    alternates,
    openGraph: {
      title: input.ogTitle ?? input.title,
      description: input.ogDescription ?? input.description,
      url: canonical,
      type: "website",
    },
  };
}

/**
 * The OG card URL for a single /alternative-to-<slug> page: resolves the
 * competitor from the registry and builds the `kind=alt` card URL with a
 * short price string. One-liner for the 25 static alternative-to-* pages —
 * pass straight into `openGraph.images` and `twitter.images`.
 */
export function alternativeOgUrl(slug: string): string {
  const c = getCompetitor(slug);
  return buildOgUrl({ kind: "alt", slug: c.slug, name: c.name, price: shortPrice(c.them.pricingModel) });
}
