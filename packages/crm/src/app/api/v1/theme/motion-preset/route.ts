// v1.34.0 — POST /api/v1/theme/motion-preset
//
// Stores the operator's chosen motion intensity on the workspace's
// OrgTheme. Today, the renderer applies the "balanced" preset's set of
// primitives unconditionally (RevealOnScroll on sections, Stagger on
// grids, HoverLift on CTAs). Future renderers can gate on this field
// to short-circuit motion for "minimal", and add heavier primitives
// (Counter, MagneticButton, TextReveal) for "editorial".
//
// The MCP tool `apply_motion_preset` calls this. Claude Code can read
// the stored value via get_workspace_state and use it as a hint when
// generating new content (e.g. avoid heavy animations for a workspace
// that picked "minimal").

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
import {
  DEFAULT_ORG_THEME,
  type MotionPreset,
  type OrgTheme,
} from "@/lib/theme/types";

type Body = {
  workspace_id?: unknown;
  preset?: unknown;
};

const VALID_PRESETS: MotionPreset[] = ["minimal", "subtle", "balanced", "editorial"];

// Short, operator-friendly descriptions Claude Code can echo back to
// the user when confirming a preset change.
const PRESET_DESCRIPTIONS: Record<MotionPreset, string> = {
  minimal:
    "No motion. Accessibility-first — respects prefers-reduced-motion and works on slow devices. Pages feel fast, deliberate, restrained.",
  subtle:
    "Sections fade up as visitors scroll. Quiet, professional, won't distract from your content.",
  balanced:
    "Sections fade up, grid items stagger in sequentially, CTAs lift on hover. The default — premium feel without being theatrical.",
  editorial:
    "Full effects — staggered hero text, animated stats counting up, magnetic CTAs that follow the cursor, scroll-linked parallax. Use when your brand is brave.",
};

export async function POST(request: Request) {
  if (isDemoReadonly()) return demoApiBlockedResponse();
  assertWritable();

  const auth = await resolveV1Identity(request);
  if (!auth.ok) return auth.response;
  const { identity } = auth;

  const body = (await request.json().catch(() => ({}))) as Body;
  const requestedWorkspaceId =
    typeof body.workspace_id === "string" ? body.workspace_id : null;
  const preset = body.preset;

  if (typeof preset !== "string" || !VALID_PRESETS.includes(preset as MotionPreset)) {
    return NextResponse.json(
      {
        error: `preset is required and must be one of: ${VALID_PRESETS.join(", ")}.`,
        valid_presets: VALID_PRESETS,
        descriptions: PRESET_DESCRIPTIONS,
      },
      { status: 400 }
    );
  }
  const validPreset = preset as MotionPreset;

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

  const previousTheme = (current.theme ?? {}) as Partial<OrgTheme>;
  const previousPreset = previousTheme.motionPreset ?? "balanced";

  const base: OrgTheme = { ...DEFAULT_ORG_THEME, ...previousTheme, motionPreset: validPreset };

  await db
    .update(organizations)
    .set({ theme: base, updatedAt: new Date() })
    .where(eq(organizations.id, orgId));

  logEvent(
    "motion_preset_apply",
    { from: previousPreset, to: validPreset },
    { request, identity, orgId, status: 200 }
  );

  return NextResponse.json({
    ok: true,
    workspace_id: orgId,
    preset: validPreset,
    previous_preset: previousPreset,
    description: PRESET_DESCRIPTIONS[validPreset],
    next: [
      validPreset === previousPreset
        ? `Preset unchanged — already at "${validPreset}".`
        : `Switched motion preset from "${previousPreset}" to "${validPreset}".`,
      "Refresh the public subdomain to see the change. The renderer applies the balanced preset's primitives unconditionally today; minimal/editorial gating ships in v1.34.x.",
    ],
  });
}
