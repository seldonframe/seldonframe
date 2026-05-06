// ============================================================================
// v1.16.0 — server-side helper for the customer-facing portal route
// ============================================================================
//
// Shared helper that takes (orgId, contactId, workspaceTimezone) and
// returns the rendered HTML + CSS for the operator-defined portal
// template. Used by app/portal/[orgSlug]/(client)/page.tsx.
//
// Returns null when the template is empty so the page can fall through
// to the existing stats overview.
//
// CSS strategy: COMPOSITE_CSS uses bare tokens (--sf-bg, --sf-text,
// --sf-border, --sf-primary, --sf-accent). The portal page's existing
// theme system uses different names (--color-primary, etc.), so we
// inject a small alias block that maps existing portal theme tokens
// onto the composite primitive's expected names — scoped under
// .sf-cmp-portal-host so it doesn't leak.

import {
  COMPOSITE_CSS,
  renderCompositeTree,
  type CompositeRenderContext,
} from "@/lib/page-blocks/composite/render";
import { buildCustomerContext } from "./customer-context";
import { loadPortalTemplateForRender } from "./structure";

export interface RenderedPortalTemplate {
  html: string;
  css: string;
  sections_count: number;
}

const PORTAL_TOKEN_ALIASES = `
.sf-cmp-portal-host {
  /* Map portal-page theme tokens onto the composite primitive's
     expected variable names. Fallbacks are sane light-mode values. */
  --sf-bg: hsl(var(--color-bg-primary, 0 0% 100%));
  --sf-text: hsl(var(--color-text, 222 47% 11%));
  --sf-border: hsl(var(--color-border, 0 0% 89%));
  --sf-primary: hsl(var(--color-primary, 187 80% 35%));
  --sf-accent: hsl(var(--color-accent, 187 60% 50%));
}
.sf-cmp-portal-host .sf-cmp-section {
  /* The portal page already provides padding via the layout's
     .crm-card spacing. Tighten the composite section's defaults so
     it doesn't double-pad. */
  padding: 0;
  background: transparent;
}
.sf-cmp-portal-host .sf-cmp-section-header {
  text-align: left;
  margin: 0 0 1.5rem;
}
`;

export async function renderPortalForCustomer(args: {
  orgId: string;
  contactId: string;
  workspaceTimezone: string;
  workspaceContext: CompositeRenderContext;
}): Promise<RenderedPortalTemplate | null> {
  const template = await loadPortalTemplateForRender(args.orgId);
  if (template.length === 0) return null;

  const customerContext = await buildCustomerContext({
    orgId: args.orgId,
    contactId: args.contactId,
    workspaceContext: args.workspaceContext,
    workspaceTimezone: args.workspaceTimezone,
  });
  if (!customerContext) return null;

  const renderedSections = template.map((section) =>
    renderCompositeTree(section, customerContext),
  );

  // Wrap in the portal host class so the token aliases scope correctly.
  const html = `<div class="sf-cmp-portal-host">${renderedSections.join("\n")}</div>`;
  const css = `${PORTAL_TOKEN_ALIASES}\n${COMPOSITE_CSS}`;

  return {
    html,
    css,
    sections_count: renderedSections.length,
  };
}
