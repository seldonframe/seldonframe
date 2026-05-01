// ============================================================================
// GeneralServiceV1Renderer — RendererContract adapter for the static V1 renderer.
// ============================================================================
//
// May 1, 2026 — primitives architecture A5. Wraps the existing
// `renderGeneralServiceV1(blueprint, options)` function so it implements
// the `RendererContract` interface. Lets new code paths (Soul →
// schemaFromSoul → adapter.render → HTML) consume the same renderer that
// existing persisted-Blueprint workspaces use, without breaking direct
// callers of `renderGeneralServiceV1` (the legacy seed flow + the
// re-render-after-plan-change webhook handler).
//
// Adapter chain:
//   PageSchema + DesignTokens
//     → blueprintFromSchema()         (schema → legacy Blueprint)
//     → renderGeneralServiceV1()      (existing 1,672-line static renderer)
//     → wrap output as RenderedOutput
//
// The wrapped renderer is registered under the same id ("general-service-v1")
// as the existing entry in the registry, so consumer code that looks up by
// id keeps working.

import { renderGeneralServiceV1 } from "../../blueprint/renderers/general-service-v1";
import type { RendererContract, RenderedOutput } from "../renderer";
import type { PageSchema, MediaLibrary } from "../types";
import type { DesignTokens } from "../design-tokens";
import { blueprintFromSchema } from "./blueprint-from-schema";

export interface GeneralServiceV1RenderOptions {
  /** Suppress the "Powered by SeldonFrame" footer link. Caller wires this
   *  from the workspace plan tier (canRemoveBranding(plan)). */
  removePoweredBy?: boolean;
}

export const GeneralServiceV1Renderer: RendererContract = {
  meta: {
    id: "general-service-v1",
    name: "Clean Professional",
    description:
      "Clean, static-rendered layout. Adapts content per business type. The default renderer for V1.",
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
  render(schema, tokens, _media) {
    return renderWithGeneralServiceV1(schema, tokens, _media, {});
  },
};

/**
 * Same as `GeneralServiceV1Renderer.render` but accepts the
 * removePoweredBy flag, which RendererContract doesn't carry today.
 * Callers that need branding control (the seed flow, the plan-change
 * webhook re-renderer) reach for this directly.
 */
export function renderWithGeneralServiceV1(
  schema: PageSchema,
  tokens: DesignTokens,
  _media: MediaLibrary,
  options: GeneralServiceV1RenderOptions = {}
): RenderedOutput {
  const blueprint = blueprintFromSchema(schema, tokens);
  // May 1, 2026 — pass tokens through so the renderer can apply the
  // cinematic overlay (dark mode + glass pill nav + blur-in animations
  // when tokens.mode === "dark" + tokens.effects.glassmorphism).
  const rendered = renderGeneralServiceV1(blueprint, {
    removePoweredBy: options.removePoweredBy ?? false,
    tokens,
  });

  // The renderer's `head` carries Google Fonts <link> tags when the
  // cinematic overlay is active. Concatenate the font preconnects + the
  // <style> block so the served page's head gets everything in one shot.
  const headParts: string[] = [];
  if (rendered.head && rendered.head.length > 0) {
    headParts.push(rendered.head);
  }
  headParts.push(`<style>${rendered.css}</style>`);

  return {
    html: rendered.html,
    head: headParts.join("\n"),
    framework: "static",
  };
}
