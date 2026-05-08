// v1.33.1 — POST /api/v1/theme/apply-design-md
//
// Accepts a DESIGN.md file (the Google Labs format: YAML front matter
// for tokens + Markdown for rationale) and applies the tokens to the
// workspace theme. Lets operators bring their own design system as a
// single canonical file. The MCP tool `apply_design_md` calls this.
//
// We only map tokens that have semantic equivalents in OrgTheme:
//   primary_color, accent_color, mode, fontFamily.
// Unknown tokens are returned in `unmapped` so the caller (Claude Code)
// can decide whether to write them as CSS custom properties on the
// landing page directly via update_landing_page, or surface them to
// the operator for manual handling.

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { parse as parseYaml } from "yaml";
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
  design_md_content?: unknown;
};

const FONT_CHOICES: OrgTheme["fontFamily"][] = [
  "Inter",
  "DM Sans",
  "Playfair Display",
  "Space Grotesk",
  "Lora",
  "Outfit",
];

// Resolve a token reference like `{colors.primary.500}` against the
// parsed YAML front matter. Returns undefined if not resolvable.
function resolveTokenRef(value: unknown, root: Record<string, unknown>): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.match(/^\{([\w.-]+)\}$/);
  if (!match) return value;
  const path = match[1].split(".");
  let cur: unknown = root;
  for (const seg of path) {
    if (cur && typeof cur === "object" && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

// Extract YAML front matter from a DESIGN.md content string. Returns
// null if no front matter is detected.
function extractFrontMatter(content: string): Record<string, unknown> | null {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) return null;
  const end = trimmed.indexOf("\n---", 3);
  if (end === -1) return null;
  const yaml = trimmed.slice(3, end).trim();
  try {
    const parsed = parseYaml(yaml);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// Extract the first hex color value from a token tree. Tries common
// paths first (colors.primary.500, colors.primary.DEFAULT, etc.) then
// falls back to the first hex string found.
function pickColor(tokens: Record<string, unknown>, key: string): string | undefined {
  const colors = (tokens.colors ?? tokens.color) as Record<string, unknown> | undefined;
  if (!colors || typeof colors !== "object") return undefined;
  const swatch = colors[key];
  if (!swatch) return undefined;

  // String value at color.primary
  if (typeof swatch === "string" && /^#[0-9a-f]{6}$/i.test(swatch)) return swatch;

  // Object with shades — try DEFAULT, 500, 600 in priority order
  if (typeof swatch === "object") {
    const shades = swatch as Record<string, unknown>;
    for (const shade of ["DEFAULT", "500", "600", "400", "700"]) {
      const v = shades[shade];
      if (typeof v === "string") {
        const resolved = resolveTokenRef(v, tokens);
        if (resolved && /^#[0-9a-f]{6}$/i.test(resolved)) return resolved;
      }
    }
  }
  return undefined;
}

function pickFont(tokens: Record<string, unknown>): OrgTheme["fontFamily"] | undefined {
  const typo = (tokens.typography ?? tokens.font ?? tokens.fonts) as Record<string, unknown> | undefined;
  if (!typo) return undefined;
  const candidate =
    typo.body ??
    typo.sans ??
    typo.primary ??
    typo.default ??
    (typeof typo === "string" ? typo : undefined);

  let value: string | undefined;
  if (typeof candidate === "string") value = candidate;
  else if (candidate && typeof candidate === "object") {
    const inner = (candidate as Record<string, unknown>).family ?? (candidate as Record<string, unknown>).name;
    if (typeof inner === "string") value = inner;
  }
  if (!value) return undefined;

  // Match against known fonts case-insensitively
  const matched = FONT_CHOICES.find((f) => f.toLowerCase() === value!.toLowerCase());
  return matched;
}

function pickMode(tokens: Record<string, unknown>): "dark" | "light" | undefined {
  const mode = tokens.mode ?? tokens.colorScheme ?? tokens["color-scheme"];
  if (mode === "dark" || mode === "light") return mode;
  return undefined;
}

export async function POST(request: Request) {
  if (isDemoReadonly()) return demoApiBlockedResponse();
  assertWritable();

  const auth = await resolveV1Identity(request);
  if (!auth.ok) return auth.response;
  const { identity } = auth;

  const body = (await request.json().catch(() => ({}))) as Body;
  const content = typeof body.design_md_content === "string" ? body.design_md_content : null;
  const requestedWorkspaceId =
    typeof body.workspace_id === "string" ? body.workspace_id : null;

  if (!content || content.length === 0) {
    return NextResponse.json(
      { error: "design_md_content is required (the full content of a DESIGN.md file as a string)." },
      { status: 400 }
    );
  }
  if (content.length > 256 * 1024) {
    return NextResponse.json(
      { error: "design_md_content exceeds 256KB. Pass a tokens-only DESIGN.md, not a full design system bundle." },
      { status: 413 }
    );
  }

  const tokens = extractFrontMatter(content);
  if (!tokens) {
    return NextResponse.json(
      {
        error:
          "No YAML front matter found. DESIGN.md files start with '---' on the first line, then a YAML block, then '---' to close. See https://github.com/google-labs-code/design.md.",
      },
      { status: 400 }
    );
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

  const base: OrgTheme = { ...DEFAULT_ORG_THEME, ...(current.theme ?? {}) };
  const applied: Record<string, string> = {};

  const primary = pickColor(tokens, "primary") ?? pickColor(tokens, "brand");
  if (primary) {
    base.primaryColor = primary;
    applied.primary_color = primary;
  }

  const accent = pickColor(tokens, "accent") ?? pickColor(tokens, "secondary");
  if (accent) {
    base.accentColor = accent;
    applied.accent_color = accent;
  }

  const mode = pickMode(tokens);
  if (mode) {
    base.mode = mode;
    applied.mode = mode;
  }

  const font = pickFont(tokens);
  if (font) {
    base.fontFamily = font;
    applied.font_family = font;
  }

  // Capture tokens we couldn't map so the caller knows what didn't
  // land. These can be applied as CSS custom properties on individual
  // landing pages via update_landing_page if the operator wants them.
  const unmapped: Record<string, unknown> = {};
  const knownTopLevels = new Set(["colors", "color", "typography", "font", "fonts", "mode", "colorScheme", "color-scheme"]);
  for (const [key, value] of Object.entries(tokens)) {
    if (!knownTopLevels.has(key)) {
      unmapped[key] = value;
    }
  }

  if (Object.keys(applied).length === 0) {
    return NextResponse.json(
      {
        error:
          "DESIGN.md parsed, but no tokens mapped to OrgTheme fields. Expected one of colors.primary, colors.accent, mode, or typography.body. Pass these as Claude Code can also surface them via update_landing_page.",
        unmapped_count: Object.keys(unmapped).length,
        unmapped_keys: Object.keys(unmapped),
      },
      { status: 400 }
    );
  }

  await db
    .update(organizations)
    .set({ theme: base, updatedAt: new Date() })
    .where(eq(organizations.id, orgId));

  logEvent(
    "theme_apply_design_md",
    { applied_keys: Object.keys(applied), unmapped_keys: Object.keys(unmapped) },
    { request, identity, orgId, status: 200 }
  );

  return NextResponse.json({
    ok: true,
    workspace_id: orgId,
    applied,
    unmapped: Object.keys(unmapped),
    next: [
      Object.keys(unmapped).length > 0
        ? `${Object.keys(unmapped).length} token group(s) didn't map to OrgTheme fields. To apply them as CSS custom properties on a specific landing page, call update_landing_page with the relevant tokens.`
        : "All recognized tokens applied. Reload your subdomain or admin dashboard to see the change.",
    ],
  });
}
