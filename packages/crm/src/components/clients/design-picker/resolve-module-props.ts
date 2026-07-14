// SeldonFrame · landing-design picker — shared prop-derivation helper.
//
// 2026-07-14 — Lifted VERBATIM from the ready page's inline block
// (app/(dashboard)/clients/[slug]/ready/page.tsx:244-281, comment dated
// 2026-07-13) so a second surface (the claimed dashboard) can compute the
// same picker props without duplicating the track-detection logic. Second
// occurrence of this logic — extraction now justified per CLAUDE.md §3.1.
//
// Pure + server-safe: no "use client", no React, no DB/session access. The
// caller (a server component / page) is responsible for loading
// `theme`/`soul`/`settings` off the organizations row and passing them in.

import { isLandingTemplateId } from "@/components/landing-templates/registry";
import { isHealthVertical, resolveHealthTemplate } from "@/lib/landing/template-selection";
import { classifyArchetypeFromSoul } from "@/lib/workspace/apply-archetype-theme";

import { ARCHETYPE_DESIGNS } from "./data";
import type { DesignId, DesignTemplate } from "./types";

export type ResolveDesignModulePropsInput = {
  theme: unknown;
  soul: unknown;
  settings: unknown;
};

export type ResolveDesignModulePropsResult = {
  initialValue: DesignId;
  autoResolvedId?: Exclude<DesignId, "auto">;
  autoReason: string;
  designs?: DesignTemplate[];
  sectionLabel?: string;
  autoNote?: string;
};

// Every workspace picks a design on one of two tracks:
//   • health track   → the 5 premium landing templates (health verticals or a
//                       workspace that already has a premium template applied)
//   • archetype track → the 8 aesthetic archetypes (trades/generic verticals)
// The archetype track re-skins the landing-r1 render (palette/font/hero).
// `initialValue` is the operator's intent ("auto" or an id); `autoResolvedId`
// is what Auto maps to for this workspace.
export function resolveDesignModuleProps({
  theme,
  soul,
  settings,
}: ResolveDesignModulePropsInput): ResolveDesignModulePropsResult {
  const wsTheme =
    (theme as unknown as {
      landingTemplate?: string;
      landingTemplateChoice?: string;
      aestheticArchetype?: string;
      aestheticArchetypeChoice?: string;
    } | null) ?? null;
  const wsVertical = ((soul as unknown as { industry?: string } | null)?.industry ?? "").toString();
  const currentTemplateId = wsTheme?.landingTemplate;
  const onHealthTrack =
    isLandingTemplateId(currentTemplateId) || isHealthVertical(wsVertical);

  let initialValue: DesignId;
  let autoResolvedId: Exclude<DesignId, "auto"> | undefined;
  let autoReason: string;
  let designs: DesignTemplate[] | undefined;
  let sectionLabel: string | undefined;
  let autoNote: string | undefined;

  if (onHealthTrack) {
    initialValue = (wsTheme?.landingTemplateChoice as DesignId | undefined) ?? "auto";
    autoResolvedId = (
      isLandingTemplateId(currentTemplateId)
        ? currentTemplateId
        : resolveHealthTemplate(wsVertical)
    ) as Exclude<DesignId, "auto">;
    autoReason = wsVertical ? `Auto-picked for ${wsVertical}` : "Auto-picked for this business";
    // health options + copy = the picker defaults; leave undefined.
  } else {
    // Archetype track — trades/generic. Auto resolves via soul classification.
    initialValue = (wsTheme?.aestheticArchetypeChoice as DesignId | undefined) ?? "auto";
    autoResolvedId = (wsTheme?.aestheticArchetype ??
      classifyArchetypeFromSoul(soul, settings)) as Exclude<DesignId, "auto">;
    autoReason = wsVertical ? `Auto-picked for ${wsVertical}` : "Auto-picked for this business";
    designs = ARCHETYPE_DESIGNS;
    sectionLabel = "Design styles";
    autoNote = "Auto matches a style to your business. Pick any style to override it — your site re-skins instantly.";
  }

  return { initialValue, autoResolvedId, autoReason, designs, sectionLabel, autoNote };
}
