// packages/crm/src/lib/landing/render-landing-template.tsx
//
// Shared dispatcher for the premium full-page health/wellness landing
// templates (registry.ts). Lifted verbatim out of /w/[slug]'s inline
// template branch so /w/[slug] and the /s/[orgSlug]/[...slug] subdomain
// route render byte-for-byte the same output for a workspace that opted
// into a template — the two routes must never diverge (2026-07-14 parity
// fix; see docs/superpowers/specs/2026-07-14-subdomain-landing-template-parity-design.md).
//
// Pure function: no db access, no async — takes already-resolved data and
// returns a React element (or null). Unit-tests without mocks; either
// route can call it from any context.

import type { ReactElement } from "react";

import {
  LANDING_TEMPLATES,
  isLandingTemplateId,
} from "@/components/landing-templates/registry";
import { withTemplateDefaults } from "@/components/landing-templates/default-photos";
import {
  r1PayloadToTemplateData,
  submittedSoulToTemplateData,
} from "@/lib/landing/r1-payload-to-template";
import {
  archetypeToSfTheme,
  buildTemplateCtas,
} from "@/lib/landing/template-adapters";
import { ARCHETYPES, type AestheticArchetypeId } from "@/lib/workspace/aesthetic-archetypes";
import type { R1LandingPayload } from "@/lib/landing/r1-payload-prompt";

export function renderLandingTemplate(input: {
  slug: string;
  orgId: string;
  landingTemplate: string | undefined;
  /** r1 content source (preferred). null → soul fallback. */
  r1: { payload: R1LandingPayload; archetype: AestheticArchetypeId } | null;
  /** raw organizations.soul — read only when r1 is null */
  soul: unknown;
  /** live org-theme archetype (theme.aestheticArchetype) */
  themeArchetype: string | undefined;
}): ReactElement | null {
  // Non-template workspaces (or unregistered/undefined ids) render nothing
  // here — callers fall through to the landing-r1 path.
  if (!isLandingTemplateId(input.landingTemplate)) return null;

  const Tpl = LANDING_TEMPLATES[input.landingTemplate];
  // Fill any empty photo slots with the template's curated fixture imagery
  // (Claude Design's hand-picked photos) so the page looks like the designed
  // template even when extraction captured few/no photos. Real photos win.
  const templateData = withTemplateDefaults(
    input.r1
      ? r1PayloadToTemplateData(input.r1.payload)
      : submittedSoulToTemplateData(input.soul),
    input.landingTemplate,
  );
  // Re-skin via the archetype palette ONLY when one is explicitly set (on
  // the r1 payload or the org theme). Otherwise pass undefined so the
  // template renders in its own signature default palette — the designed look.
  const explicitArchetype = input.r1?.archetype ?? input.themeArchetype;
  const sfTheme =
    explicitArchetype && explicitArchetype in ARCHETYPES
      ? archetypeToSfTheme(explicitArchetype as AestheticArchetypeId)
      : undefined;

  return (
    <Tpl
      data={templateData}
      ctas={buildTemplateCtas(input.slug, input.orgId, templateData.phone)}
      theme={sfTheme}
    />
  );
}
