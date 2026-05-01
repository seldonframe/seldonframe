// ============================================================================
// Renderer Registry — discoverable list of renderers + selection logic.
// ============================================================================
//
// April 30, 2026 — primitives architecture. Adding a new renderer is just
// adding a row here. The selectRenderer() function picks the best match for
// a given (business_type, personality) pair, falling back gracefully:
//
//   1. Exact match — supports both the business type AND the personality.
//   2. Type match — supports the business type, regardless of personality.
//   3. Personality match — supports the personality, regardless of type.
//   4. First registered renderer — guaranteed-non-null fallback.

import type { BusinessType } from "./types";
import type { PagePersonality } from "./design-tokens";
import type { RendererMeta } from "./renderer";

export const RENDERER_REGISTRY: RendererMeta[] = [
  {
    id: "general-service-v1",
    name: "Clean Professional",
    description:
      "Clean, professional layout. Adapts content per business type. The default for V1.",
    framework: "static",
    supports: {
      business_types: [
        "local_service",
        "professional_service",
        "agency",
        "saas",
        "ecommerce",
        "other",
      ],
      personalities: ["clean", "minimal", "playful", "editorial", "bold"],
      features: ["scroll_animations"],
    },
  },
  // Future renderers added here. Examples (NOT shipped yet):
  //
  // {
  //   id: "cinematic-dark-v1",
  //   name: "Cinematic Dark",
  //   description: "Dark, cinematic with glassmorphism + video backgrounds.",
  //   framework: "react",
  //   supports: {
  //     business_types: ["saas", "agency"],
  //     personalities: ["cinematic", "editorial", "bold"],
  //     features: ["glassmorphism", "video_bg", "scroll_animations", "framer_motion"],
  //   },
  // },
];

/**
 * Pick the best renderer for a (business_type, personality) pair. Walks the
 * registry in priority order:
 *   1. exact match (both type and personality supported)
 *   2. type match
 *   3. personality match
 *   4. first registered renderer (V1 invariant: at least one entry exists)
 *
 * Throws if the registry is empty — callers should never need to handle null.
 */
export function selectRenderer(
  businessType: BusinessType,
  personality: PagePersonality
): RendererMeta {
  if (RENDERER_REGISTRY.length === 0) {
    throw new Error(
      "RENDERER_REGISTRY is empty — at least one renderer must be registered."
    );
  }

  // 1. Exact match
  const exact = RENDERER_REGISTRY.find(
    (renderer) =>
      renderer.supports.business_types.includes(businessType) &&
      renderer.supports.personalities.includes(personality)
  );
  if (exact) return exact;

  // 2. Type match
  const byType = RENDERER_REGISTRY.find((renderer) =>
    renderer.supports.business_types.includes(businessType)
  );
  if (byType) return byType;

  // 3. Personality match
  const byPersonality = RENDERER_REGISTRY.find((renderer) =>
    renderer.supports.personalities.includes(personality)
  );
  if (byPersonality) return byPersonality;

  // 4. Ultimate fallback — first registered renderer
  return RENDERER_REGISTRY[0];
}

/** Lookup a renderer by stable id. Returns undefined if not registered —
 *  callers (e.g. legacy workspaces with a stored renderer_id) should
 *  fall back to selectRenderer() in that case. */
export function getRendererById(id: string): RendererMeta | undefined {
  return RENDERER_REGISTRY.find((renderer) => renderer.id === id);
}
