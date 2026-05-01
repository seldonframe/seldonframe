// ============================================================================
// RendererContract — interface every page renderer implements.
// ============================================================================
//
// April 30, 2026 — primitives architecture. A renderer takes a PageSchema
// (content), DesignTokens (style intent), and MediaLibrary (assets), and
// produces a complete HTML+head+optional-scripts bundle.
//
// The contract is intentionally narrow: render() is pure, deterministic,
// and side-effect-free. This makes renderers swappable. We can ship
// `general-service-v1` (static, no JS) today and add `cinematic-dark-v1`
// (React + Framer Motion) later without touching the workspace data model.

import type { BusinessType, PageSchema, MediaLibrary } from "./types";
import type { DesignTokens, PagePersonality } from "./design-tokens";

export interface RendererMeta {
  /** Stable id, e.g. "general-service-v1", "cinematic-dark-v1". Used as a
   *  key in the registry and persisted on the workspace record so existing
   *  renders can be reproduced byte-identically. */
  id: string;
  /** Human-readable label shown to operators in the style picker. */
  name: string;
  /** Short blurb shown next to the name. */
  description: string;
  /** Optional thumbnail URL — renderer authors provide a screenshot. */
  preview_image?: string;
  /** "static" = pure HTML/CSS, served as a string.
   *  "react" = needs a React runtime in the browser (renderer outputs
   *  scripts + hydration markup). */
  framework: "static" | "react";
  supports: {
    business_types: BusinessType[];
    personalities: PagePersonality[];
    /** Capability flags — informational, not strictly required. Helps
     *  selectRenderer() prefer feature-rich renderers when the operator's
     *  personality enables effects (glassmorphism, video_bg, etc.). */
    features: string[];
  };
}

export interface RenderedOutput {
  /** The complete page <body> HTML (or `<div>` fragment for embedding). */
  html: string;
  /** <head> content — fonts, meta, CSS link tags, OG tags. */
  head: string;
  /** Optional client-side JS bundle (for React renderers). Static
   *  renderers leave this undefined. */
  scripts?: string;
  framework: "static" | "react";
}

export interface RendererContract {
  meta: RendererMeta;
  render(
    schema: PageSchema,
    tokens: DesignTokens,
    media: MediaLibrary
  ): RenderedOutput;
}
