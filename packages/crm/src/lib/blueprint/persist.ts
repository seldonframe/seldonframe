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
import type {
  Blueprint,
  LandingSection,
  SectionHero,
  SectionMidCta,
} from "./types";

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
  industry: string | null | undefined,
  opts: { timezone?: string | null } = {}
): Blueprint {
  const template = pickTemplate(industry);
  // v1.1.5 / Issue #7 — when the workspace's IANA timezone is known
  // (createAnonymousWorkspace infers it from city/state and stores it
  // on organizations.timezone), thread it onto workspace.contact.timezone
  // so the booking renderer's `data.workspaceTimezone` reflects the
  // operator's actual local time. Without this, the template's default
  // ("UTC" or "America/Los_Angeles" depending on industry pack) ships
  // to every workspace and the booking page shows slots in the wrong
  // zone.
  const tz = opts.timezone?.trim();
  const contact = tz
    ? { ...template.workspace.contact, timezone: tz }
    : template.workspace.contact;
  // v1.2.0 — defense-in-depth CTA href contract. Even if a template
  // JSON file has the wrong hrefs (e.g. legacy general.json had
  // ctaPrimary→/intake), normalize at blueprint build time so:
  //   - hero.ctaPrimary    → /book   (kind=primary)
  //   - hero.ctaSecondary  → /intake (kind=secondary)
  //   - mid-cta.ctaPrimary → /book
  //   - mid-cta.ctaSecondary → /intake
  // This is the SECOND defense layer (the first is
  // applyResolvedContentToActions in seedLandingFromSoul) so workspaces
  // built via the template path (createDefaultLandingPage) without a
  // soul-driven re-render also satisfy the contract. Operators who
  // later customize via update_landing_section override this — their
  // edits go through a different path that doesn't re-call this.
  const normalizeHero = (s: SectionHero): SectionHero => {
    const next: SectionHero = {
      ...s,
      ctaPrimary: { label: s.ctaPrimary.label, href: "/book", kind: "primary" },
    };
    if (s.ctaSecondary) {
      next.ctaSecondary = {
        label: s.ctaSecondary.label,
        href: "/intake",
        kind: "secondary",
      };
    }
    return next;
  };
  const normalizeMidCta = (s: SectionMidCta): SectionMidCta => {
    const next: SectionMidCta = { ...s };
    if (s.ctaPrimary) {
      next.ctaPrimary = {
        label: s.ctaPrimary.label,
        href: "/book",
        kind: "primary",
      };
    }
    if (s.ctaSecondary) {
      next.ctaSecondary = {
        label: s.ctaSecondary.label,
        href: "/intake",
        kind: "secondary",
      };
    }
    return next;
  };
  const sections: LandingSection[] = (template.landing?.sections ?? []).map((section) => {
    if (section.type === "hero") return normalizeHero(section);
    if (section.type === "mid-cta") return normalizeMidCta(section);
    return section;
  });
  return {
    ...template,
    workspace: { ...template.workspace, name: workspaceName, contact },
    landing: { ...template.landing, sections },
  };
}

/**
 * Run a Blueprint through the renderer and bundle the output for
 * persistence. Single source of truth for the render call so future
 * renderer-version selection (general-service-v2, etc.) lands here.
 *
 * P0-3: opts.removePoweredBy threads through to the renderer so paid
 * tiers (Cloud Pro / Cloud Agency) get HTML without the "Powered by
 * SeldonFrame" footer link. Defaults to false (free + starter see
 * the badge).
 */
export function renderBlueprint(
  blueprint: Blueprint,
  opts: { removePoweredBy?: boolean } = {}
): RenderedBlueprint {
  const { html, css } = renderGeneralServiceV1(blueprint, {
    removePoweredBy: opts.removePoweredBy,
  });
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
