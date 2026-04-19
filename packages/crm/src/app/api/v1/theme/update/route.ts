import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import {
  resolveOrgIdForWrite,
  resolveV1Identity,
} from "@/lib/auth/v1-identity";
import { assertWritable, demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";
import { DEFAULT_ORG_THEME, type OrgTheme } from "@/lib/theme/types";

type UpdateBody = {
  workspace_id?: unknown;
  mode?: unknown;
  primary_color?: unknown;
  accent_color?: unknown;
  font_family?: unknown;
};

const FONT_CHOICES: OrgTheme["fontFamily"][] = [
  "Inter",
  "DM Sans",
  "Playfair Display",
  "Space Grotesk",
  "Lora",
  "Outfit",
];

export async function POST(request: Request) {
  if (isDemoReadonly()) return demoApiBlockedResponse();
  assertWritable();

  const auth = await resolveV1Identity(request);
  if (!auth.ok) return auth.response;
  const { identity } = auth;

  const body = (await request.json().catch(() => ({}))) as UpdateBody;

  const requestedWorkspaceId =
    typeof body.workspace_id === "string" ? body.workspace_id : null;
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

  // Spread DEFAULT first so any missing keys in a partially-stored theme
  // are filled in — guarantees a conformant OrgTheme shape on write.
  const base: OrgTheme = { ...DEFAULT_ORG_THEME, ...(current.theme ?? {}) };
  const applied: Record<string, string> = {};

  if (body.mode === "dark" || body.mode === "light") {
    base.mode = body.mode;
    applied.mode = body.mode;
  }
  if (
    typeof body.primary_color === "string" &&
    /^#[0-9a-f]{6}$/i.test(body.primary_color)
  ) {
    base.primaryColor = body.primary_color;
    applied.primary_color = body.primary_color;
  }
  if (
    typeof body.accent_color === "string" &&
    /^#[0-9a-f]{6}$/i.test(body.accent_color)
  ) {
    base.accentColor = body.accent_color;
    applied.accent_color = body.accent_color;
  }
  if (
    typeof body.font_family === "string" &&
    FONT_CHOICES.includes(body.font_family as OrgTheme["fontFamily"])
  ) {
    base.fontFamily = body.font_family as OrgTheme["fontFamily"];
    applied.font_family = body.font_family;
  }

  if (Object.keys(applied).length === 0) {
    return NextResponse.json(
      {
        error:
          "At least one of mode (dark|light), primary_color (#hex), accent_color (#hex), or font_family is required.",
        valid_fonts: FONT_CHOICES,
      },
      { status: 400 }
    );
  }

  await db
    .update(organizations)
    .set({ theme: base, updatedAt: new Date() })
    .where(eq(organizations.id, orgId));

  return NextResponse.json({
    ok: true,
    workspace_id: orgId,
    applied,
    next: ["Refresh the subdomain or admin dashboard to see the theme change."],
  });
}
