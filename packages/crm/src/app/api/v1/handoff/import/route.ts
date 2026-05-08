// v1.33.1 — POST /api/v1/handoff/import
//
// Accepts a Claude Design "handoff bundle" (the artifact Claude Design
// produces when designs are ready for code) and:
//   1. Applies any design tokens it carries (same path as
//      apply_design_md — the bundle's tokens are an embedded
//      DESIGN.md-equivalent).
//   2. Validates the components in the bundle and returns a structured
//      manifest of them — names, target surfaces, prop schemas, and
//      truncated source previews.
//   3. Does NOT auto-execute generated React on live pages. The
//      operator (or Claude Code on their behalf) reviews each
//      component and chooses whether to wire it via
//      update_landing_page / add_custom_block. This matches the
//      eval-gate philosophy: nothing customer-facing ships without a
//      human or eval-checked agent step.
//
// The expected bundle schema (Anthropic hasn't published a formal one
// yet, so this is our defensive read of the most likely format —
// extending forward when the spec stabilizes is a small change):
//
//   {
//     meta?: { project_name?, generated_at?, target?: "react" | "html" },
//     tokens?: { ...same shape as DESIGN.md front matter... },
//     components: [
//       {
//         name: string,
//         surface?: "landing" | "booking" | "intake" | "portal" | "any",
//         react_source?: string,    // JSX/TSX content
//         html_source?: string,     // alternative for HTML output
//         props_schema?: object,    // JSON Schema
//         deps?: string[]
//       },
//       ...
//     ],
//     assets?: [{ name, url, type: "image" | "font" | "icon" }, ...]
//   }

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import {
  resolveOrgIdForWrite,
  resolveV1Identity,
} from "@/lib/auth/v1-identity";
import { assertWritable, demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";
import { logEvent } from "@/lib/observability/log";
import { DEFAULT_ORG_THEME, type OrgTheme } from "@/lib/theme/types";

type Body = {
  workspace_id?: unknown;
  bundle?: unknown;
};

type ComponentDescriptor = {
  name: string;
  surface: string;
  has_react_source: boolean;
  has_html_source: boolean;
  source_preview: string;
  source_size_bytes: number;
  props_schema_keys: string[];
  deps: string[];
  next_step: string;
};

const FONT_CHOICES: OrgTheme["fontFamily"][] = [
  "Inter",
  "DM Sans",
  "Playfair Display",
  "Space Grotesk",
  "Lora",
  "Outfit",
];

const KNOWN_SURFACES = new Set(["landing", "booking", "intake", "portal", "any"]);
const MAX_SOURCE_BYTES = 64 * 1024; // per component
const MAX_COMPONENTS = 40;
const MAX_BUNDLE_BYTES = 1024 * 1024; // 1MB total

function applyTokensToTheme(
  tokens: Record<string, unknown>,
  base: OrgTheme
): { theme: OrgTheme; applied: Record<string, string> } {
  const applied: Record<string, string> = {};
  const colors = (tokens.colors ?? tokens.color) as Record<string, unknown> | undefined;

  if (colors && typeof colors === "object") {
    const primary = (colors as Record<string, unknown>).primary ?? (colors as Record<string, unknown>).brand;
    if (typeof primary === "string" && /^#[0-9a-f]{6}$/i.test(primary)) {
      base.primaryColor = primary;
      applied.primary_color = primary;
    }
    const accent = (colors as Record<string, unknown>).accent ?? (colors as Record<string, unknown>).secondary;
    if (typeof accent === "string" && /^#[0-9a-f]{6}$/i.test(accent)) {
      base.accentColor = accent;
      applied.accent_color = accent;
    }
  }

  const mode = tokens.mode ?? tokens.colorScheme;
  if (mode === "dark" || mode === "light") {
    base.mode = mode;
    applied.mode = mode;
  }

  const typo = (tokens.typography ?? tokens.font ?? tokens.fonts) as Record<string, unknown> | undefined;
  if (typo && typeof typo === "object") {
    const candidate = (typo as Record<string, unknown>).body ?? (typo as Record<string, unknown>).sans;
    const value = typeof candidate === "string" ? candidate : null;
    if (value) {
      const matched = FONT_CHOICES.find((f) => f.toLowerCase() === value.toLowerCase());
      if (matched) {
        base.fontFamily = matched;
        applied.font_family = matched;
      }
    }
  }

  return { theme: base, applied };
}

function validateComponents(components: unknown): {
  ok: true;
  descriptors: ComponentDescriptor[];
} | { ok: false; error: string } {
  if (!Array.isArray(components)) {
    return { ok: false, error: "bundle.components must be an array." };
  }
  if (components.length === 0) {
    return { ok: false, error: "bundle.components is empty — nothing to import." };
  }
  if (components.length > MAX_COMPONENTS) {
    return {
      ok: false,
      error: `bundle.components has ${components.length} items; max ${MAX_COMPONENTS} per import.`,
    };
  }

  const descriptors: ComponentDescriptor[] = [];
  for (const c of components) {
    if (!c || typeof c !== "object") {
      return { ok: false, error: "Each component must be an object." };
    }
    const comp = c as Record<string, unknown>;
    if (typeof comp.name !== "string" || comp.name.length === 0) {
      return { ok: false, error: "Each component must have a non-empty `name`." };
    }

    const surface =
      typeof comp.surface === "string" && KNOWN_SURFACES.has(comp.surface)
        ? comp.surface
        : "any";

    const reactSrc = typeof comp.react_source === "string" ? comp.react_source : null;
    const htmlSrc = typeof comp.html_source === "string" ? comp.html_source : null;
    const source = reactSrc ?? htmlSrc ?? "";

    if (!source) {
      return {
        ok: false,
        error: `Component "${comp.name}" has neither react_source nor html_source.`,
      };
    }
    if (source.length > MAX_SOURCE_BYTES) {
      return {
        ok: false,
        error: `Component "${comp.name}" source is ${source.length}B; max ${MAX_SOURCE_BYTES}B per component.`,
      };
    }

    const propsSchema = (comp.props_schema && typeof comp.props_schema === "object"
      ? (comp.props_schema as Record<string, unknown>)
      : {}) as Record<string, unknown>;
    const propsSchemaKeys = Object.keys(
      (propsSchema.properties as Record<string, unknown> | undefined) ?? propsSchema
    );

    const deps = Array.isArray(comp.deps) ? comp.deps.filter((d): d is string => typeof d === "string") : [];

    descriptors.push({
      name: comp.name,
      surface,
      has_react_source: Boolean(reactSrc),
      has_html_source: Boolean(htmlSrc),
      source_preview: source.slice(0, 280),
      source_size_bytes: source.length,
      props_schema_keys: propsSchemaKeys,
      deps,
      next_step:
        reactSrc !== null
          ? `update_landing_page({ workspace_id, page_slug, sections: [..., { type: "custom_react", content: { component_name: "${comp.name}", react_source: <pasted-from-bundle> } }] })`
          : `update_landing_page({ workspace_id, page_slug, sections: [..., { type: "custom_html", content: { html: <pasted-from-bundle> } }] })`,
    });
  }
  return { ok: true, descriptors };
}

export async function POST(request: Request) {
  if (isDemoReadonly()) return demoApiBlockedResponse();
  assertWritable();

  const auth = await resolveV1Identity(request);
  if (!auth.ok) return auth.response;
  const { identity } = auth;

  const body = (await request.json().catch(() => ({}))) as Body;
  const requestedWorkspaceId =
    typeof body.workspace_id === "string" ? body.workspace_id : null;
  const bundle = body.bundle;

  if (!bundle || typeof bundle !== "object") {
    return NextResponse.json(
      {
        error:
          "bundle is required. Pass the JSON content of the Claude Design handoff bundle as `bundle` (object).",
      },
      { status: 400 }
    );
  }

  const bundleSize = JSON.stringify(bundle).length;
  if (bundleSize > MAX_BUNDLE_BYTES) {
    return NextResponse.json(
      {
        error: `Bundle is ${bundleSize}B; max ${MAX_BUNDLE_BYTES}B per import. Split into multiple smaller bundles or reduce embedded asset sizes.`,
      },
      { status: 413 }
    );
  }

  const b = bundle as Record<string, unknown>;
  const tokens = (b.tokens && typeof b.tokens === "object"
    ? (b.tokens as Record<string, unknown>)
    : null);
  const components = b.components;
  const componentsResult = validateComponents(components);
  if (!componentsResult.ok) {
    return NextResponse.json({ error: componentsResult.error }, { status: 400 });
  }

  const resolved = await resolveOrgIdForWrite(identity, requestedWorkspaceId);
  if (!resolved.ok) return resolved.response;
  const orgId = resolved.orgId;

  const [current] = await db
    .select({ theme: organizations.theme })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!current) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  // Apply tokens (if any) using the same path as apply_design_md.
  let appliedTokens: Record<string, string> = {};
  if (tokens) {
    const base: OrgTheme = { ...DEFAULT_ORG_THEME, ...(current.theme ?? {}) };
    const result = applyTokensToTheme(tokens, base);
    appliedTokens = result.applied;
    if (Object.keys(appliedTokens).length > 0) {
      await db
        .update(organizations)
        .set({ theme: result.theme, updatedAt: new Date() })
        .where(eq(organizations.id, orgId));
    }
  }

  const meta = (b.meta && typeof b.meta === "object"
    ? (b.meta as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  const projectName = typeof meta.project_name === "string" ? meta.project_name : null;
  const target = typeof meta.target === "string" ? meta.target : "react";

  logEvent(
    "handoff_import",
    {
      project_name: projectName,
      target,
      components_count: componentsResult.descriptors.length,
      tokens_applied: Object.keys(appliedTokens).length,
    },
    { request, identity, orgId, status: 200 }
  );

  return NextResponse.json({
    ok: true,
    workspace_id: orgId,
    project_name: projectName,
    target,
    components: componentsResult.descriptors,
    components_count: componentsResult.descriptors.length,
    tokens_applied: appliedTokens,
    next: [
      "Components are validated but NOT auto-applied to live pages — Claude Design output runs through human/eval review before customers see it.",
      "For each component above, call update_landing_page (or add_custom_block) with the source from the bundle to wire it into the chosen surface.",
      Object.keys(appliedTokens).length > 0
        ? `Workspace theme updated: ${Object.keys(appliedTokens).join(", ")}.`
        : "No design tokens were present in the bundle (or none mapped to OrgTheme fields).",
    ],
  });
}
