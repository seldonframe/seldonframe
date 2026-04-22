// Landing Pages block — tool schemas (Scope 3 Step 2b.2 block 6 —
// the FINAL 2b.2 migration).
//
// Zod-authored schemas for the 8 Landing MCP tools. Source of truth
// for the tool surface; the emit step renders JSON Schema into
// landing-pages.block.md on next `pnpm emit:blocks`.
//
// 8 tools total (matches skills/mcp-server/src/tools.js lines 1793-1965):
//   Pages (5):     list_landing_pages, get_landing_page,
//                  create_landing_page, update_landing_page,
//                  publish_landing_page
//   Templates (2): list_landing_templates, get_landing_template
//   Generate (1):  generate_landing_page (Claude-driven draft,
//                  non-persisting)
//
// L-18 containment — READ BEFORE MODIFYING:
//
// `packages/crm/src/lib/puck/validator.ts` is a server-side module
// used by API routes. Before L-18, it imported `puckConfig` from
// `config.impl.tsx` (a React component file with useState/useEffect
// at module top level). That import chain silently broke 15+ Vercel
// deployments before the fix.
//
// This file (intake.tools.ts was the precedent; this file follows
// the same discipline) imports ONLY from:
//   - "zod"
//   - "../lib/blocks/contract-v2" (type-only)
//
// NO imports from ../lib/puck/config.impl (client-only Puck config).
// NO imports from ../lib/puck/validator (pulls the whole Puck graph).
// NO imports from anything under ../components or ../app.
//
// Puck payload shape is surfaced as `z.record(z.string(), z.unknown())`
// at the boundary. The full typed schema lives in
// lib/puck/config-fields.ts (server-safe) + lib/puck/validator.ts.
// MCP tool-schema exposure of Puck structure is intentionally shallow
// — agents that want to write a Puck payload go through
// generate_landing_page (Claude-drafted + pre-validated) or pass a
// template's payload verbatim. Rich Puck authoring is a UI concern,
// not an MCP-tool concern.
//
// Puck-complexity containment: 32 Puck components across 5 categories
// (layout / content / forms / business / interactive) documented in
// landing-pages.block.md. None of that metadata leaks into
// lib/agents/types.ts or into these tool schemas. ConversationExit /
// Predicate / ExtractField / Step remain unchanged through 6
// consecutive 2b.2 migrations.
//
// Archetype coverage (2026-04-22):
// ZERO shipped archetypes (Speed-to-Lead, Win-Back, Review-Requester)
// reference any landing tool or landing.* event. Landing pages are a
// publishing surface for cold traffic — agents drive through
// create_landing_page / generate_landing_page at onboarding time,
// not inside archetype workflows. The 9-probe regression is pure
// negative-control: 3-in-a-row hash preservation on archetypes that
// don't touch landing at all confirms the v2 contract's parser
// state isn't bleeding between blocks.
//
// Cleanup follow-up (out of 2b.2 scope):
// tasks/follow-up-puck-config-consolidation.md remains open — making
// lib/puck/config-fields.ts the single source of truth and removing
// duplication with config.impl.tsx. Landing migration does NOT touch
// that cleanup; scope stays clean. Post-2b.2 concern.

import { z } from "zod";

import type { ToolDefinition } from "../lib/blocks/contract-v2";

// ---------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------

const workspaceIdArg = z
  .string()
  .uuid()
  .optional()
  .describe("Optional. Falls back to the active workspace.");

const landingStatus = z.enum(["draft", "published"]);

const landingSource = z.enum(["scratch", "template", "soul", "api"]);

const landingPageType = z.enum(["home", "landing", "custom"]);

// Puck payload — surfaced as opaque JSON at the MCP-tool boundary.
// The full typed schema (components + props) lives in
// lib/puck/config-fields.ts. Agents MUST NOT hand-author arbitrary
// Puck payloads; use generate_landing_page (Claude-drafted +
// pre-validated) or a template's payload.
const puckPayload = z
  .record(z.string(), z.unknown())
  .describe(
    "Puck payload { content: [], root: {props}, zones: {} }. Validated against the typed Puck config on every save. Prefer generate_landing_page or a template's payload over hand-authoring.",
  );

// ---------------------------------------------------------------------
// Return shapes
// ---------------------------------------------------------------------

const LandingPageRecord = z.object({
  id: z.string().uuid(),
  title: z.string(),
  slug: z.string(),
  status: landingStatus,
  pageType: landingPageType.nullable(),
  source: landingSource,
  puckData: puckPayload.nullable(),
  publicUrl: z.string().url().nullable(),
  publishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const LandingTemplateRecord = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  vertical: z.string().nullable().describe("Optional vertical tag (e.g., 'dental', 'coaching', 'realestate')."),
  payload: puckPayload.describe("Pre-validated Puck payload ready to seed create_landing_page."),
});

// ---------------------------------------------------------------------
// Pages (5)
// ---------------------------------------------------------------------

export const listLandingPages: ToolDefinition = {
  name: "list_landing_pages",
  description: "List the workspace's landing pages (draft + published), newest-updated first.",
  args: z.object({
    limit: z.number().int().positive().max(200).optional().describe("Max rows (default 50, max 200)."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({ data: z.array(LandingPageRecord) }),
  emits: [],
};

export const getLandingPage: ToolDefinition = {
  name: "get_landing_page",
  description: "Fetch a single landing page with its full Puck payload + metadata.",
  args: z.object({
    page_id: z.string().uuid().describe("Landing page ID from list_landing_pages."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({ data: LandingPageRecord }),
  emits: [],
};

export const createLandingPage: ToolDefinition = {
  name: "create_landing_page",
  description:
    "Create a landing page from an optional Puck payload. Without puck_data, creates a blank draft. With puck_data, validates the payload against the Puck schema and rejects on mismatch. Set published=true to publish immediately.",
  args: z.object({
    title: z.string().min(1).describe("Page title (used for the dashboard; not the public URL)."),
    slug: z.string().optional().describe("Optional URL slug. Derived from title if omitted."),
    puck_data: puckPayload.optional().describe("Optional Puck payload. Prefer generate_landing_page output or a template's payload."),
    published: z.boolean().optional().describe("If true, publish immediately. Default: draft."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({ data: LandingPageRecord }),
  // Can emit landing.published when published=true at creation. The
  // validator's `emits ⊆ block.produces` rule still holds.
  emits: ["landing.published"],
};

export const updateLandingPage: ToolDefinition = {
  name: "update_landing_page",
  description:
    "Update a landing page's title and/or Puck payload. Validates puck_data on the way through. Does not change publish status — use publish_landing_page for that.",
  args: z.object({
    page_id: z.string().uuid().describe("Landing page to update."),
    title: z.string().min(1).optional().describe("Optional new title."),
    puck_data: puckPayload.nullable().optional().describe("Optional new Puck payload. Pass null to clear."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({ data: LandingPageRecord }),
  emits: ["landing.updated"],
};

export const publishLandingPage: ToolDefinition = {
  name: "publish_landing_page",
  description:
    "Flip a landing page between draft and published. Publishing busts the public-URL cache immediately and emits landing.published. Pass published=false to unpublish.",
  args: z.object({
    page_id: z.string().uuid().describe("Landing page to publish."),
    published: z.boolean().optional().describe("true = publish (default), false = unpublish."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({ data: LandingPageRecord }),
  // Either event depending on the `published` arg. Both appear in
  // landing-pages.block.md's produces list.
  emits: ["landing.published", "landing.unpublished"],
};

// ---------------------------------------------------------------------
// Templates (2)
// ---------------------------------------------------------------------

export const listLandingTemplates: ToolDefinition = {
  name: "list_landing_templates",
  description:
    "List the pre-built vertical landing-page templates. Each has a validated Puck payload ready to seed a new page via create_landing_page({puck_data: template.payload}).",
  args: z.object({
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({ data: z.array(LandingTemplateRecord) }),
  emits: [],
};

export const getLandingTemplate: ToolDefinition = {
  name: "get_landing_template",
  description:
    "Fetch a single landing-page template including its Puck payload. Pair with create_landing_page to seed a new page from the template.",
  args: z.object({
    template_id: z.string().describe("Template ID from list_landing_templates."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({ data: LandingTemplateRecord }),
  emits: [],
};

// ---------------------------------------------------------------------
// Generate (1)
// ---------------------------------------------------------------------

export const generateLandingPage: ToolDefinition = {
  name: "generate_landing_page",
  description:
    "Generate a Puck landing-page payload from a natural-language prompt using Claude + the workspace's Soul + theme. Returns a pre-validated payload but does NOT persist — pair with create_landing_page to save the result.",
  args: z.object({
    prompt: z.string().min(1).describe("One-sentence page description. The more specific, the better."),
    existing: puckPayload.optional().describe("Optional existing Puck payload to revise rather than start fresh."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({
    data: z.object({
      payload: puckPayload,
      validationNotes: z.array(z.string()).describe("Empty array when generation produced a schema-valid payload first-shot."),
    }),
  }),
  // No event — generation is pure, doesn't persist or publish.
  emits: [],
};

// ---------------------------------------------------------------------
// Exported tuple — order matches tools.js for byte-stable emission.
// ---------------------------------------------------------------------

export const LANDING_TOOLS: readonly ToolDefinition[] = [
  listLandingPages,
  getLandingPage,
  createLandingPage,
  updateLandingPage,
  publishLandingPage,
  listLandingTemplates,
  getLandingTemplate,
  generateLandingPage,
] as const;
