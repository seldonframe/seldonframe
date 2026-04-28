/**
 * Persistence helpers for the blueprint customization loop (C3.3 / C3.4).
 *
 * The full round-trip looks like:
 *
 *   load → mutate → render → save
 *
 * Each MCP tool that touches the landing page (update_landing_content,
 * update_theme, update_landing_section) goes through these helpers so
 * the load-and-fallback behavior, render call, and write shape stay
 * consistent across endpoints.
 *
 * Fallback behavior: rows that landed before C3.3 (or any non-template
 * row) have blueprint_json = NULL. `loadBlueprintOrFallback` returns
 * a fresh template-derived Blueprint for those — the very next save
 * will persist it, so subsequent customizations round-trip cleanly.
 */

import { pickTemplate } from "./templates";
import { renderGeneralServiceV1 } from "./renderers/general-service-v1";
import type { Blueprint } from "./types";

export interface RenderedBlueprint {
  /** The blueprint that produced the output. Persisted to landing_pages.blueprintJson. */
  blueprint: Blueprint;
  /** Rendered HTML. Persisted to landing_pages.contentHtml. */
  contentHtml: string;
  /** Rendered CSS. Persisted to landing_pages.contentCss. */
  contentCss: string;
}

/**
 * Build a starter Blueprint customized for a specific workspace.
 * Used at landing-page creation time (createDefaultLandingPage).
 *
 * Light customization only — workspace.name is the only slot we fill
 * in at this point. Everything else (city, owner name, etc.) stays as
 * `[Bracket]` placeholders that the slot-resolution layer in the
 * renderer hides until the operator updates them via NL tools.
 */
export function buildBlueprintForWorkspace(
  workspaceName: string,
  industry: string | null | undefined
): Blueprint {
  const template = pickTemplate(industry);
  return {
    ...template,
    workspace: { ...template.workspace, name: workspaceName },
  };
}

/**
 * Run a Blueprint through the renderer and bundle the output for
 * persistence. Single source of truth for the render call so future
 * renderer-version selection (general-service-v2, etc.) lands here.
 */
export function renderBlueprint(blueprint: Blueprint): RenderedBlueprint {
  const { html, css } = renderGeneralServiceV1(blueprint);
  return { blueprint, contentHtml: html, contentCss: css };
}

/**
 * Load the source Blueprint from a landing_pages row, falling back to a
 * fresh template-derived Blueprint when blueprint_json is NULL.
 *
 * The fallback path is invoked for:
 *   - Rows created before C3.3 landed (no blueprint_json)
 *   - Rows whose blueprint_json got nulled out by an unrelated migration
 *
 * Both cases self-heal on the next save (the route handler always
 * persists the post-mutation Blueprint to blueprint_json).
 */
export function loadBlueprintOrFallback(
  row: { blueprintJson: unknown },
  workspaceName: string,
  industry: string | null | undefined
): Blueprint {
  if (isBlueprintLike(row.blueprintJson)) {
    return row.blueprintJson;
  }
  return buildBlueprintForWorkspace(workspaceName, industry);
}

/**
 * Loose runtime check that the JSON column actually contains a Blueprint
 * shape (not, e.g., an empty `{}` from a corrupt write). We don't deep-
 * validate here — the renderer will throw on missing required fields,
 * which is a better signal than a blanket reject.
 */
function isBlueprintLike(value: unknown): value is Blueprint {
  if (value == null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.version !== "number") return false;
  if (v.workspace == null || typeof v.workspace !== "object") return false;
  if (v.landing == null || typeof v.landing !== "object") return false;
  return true;
}
