import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { resolveV1Identity } from "@/lib/auth/v1-identity";
import { enableWorkspaceBlock } from "@/lib/blocks/install";
import { createDefaultBookingTemplate, createDefaultLandingPage } from "@/lib/blocks/templates";
import { requireManagedWorkspaceForUser } from "@/lib/openclaw/self-service";
import { logEvent } from "@/lib/observability/log";

const WORKSPACE_BASE_DOMAIN =
  process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";

type InstallBody = {
  workspace_id?: unknown;
  config?: unknown;
};

export async function POST(request: Request) {
  const auth = await resolveV1Identity(request);
  if (!auth.ok) return auth.response;
  const { identity } = auth;

  const body = (await request.json().catch(() => ({}))) as InstallBody;
  const requestedId = typeof body.workspace_id === "string" ? body.workspace_id.trim() : "";
  const config =
    body.config && typeof body.config === "object"
      ? (body.config as Record<string, unknown>)
      : undefined;

  let orgId: string;

  if (identity.kind === "workspace") {
    if (requestedId && requestedId !== identity.orgId) {
      return NextResponse.json(
        { error: "Bearer token does not authorize this workspace." },
        { status: 403 }
      );
    }
    orgId = identity.orgId;
  } else {
    if (!requestedId) {
      return NextResponse.json({ error: "workspace_id is required." }, { status: 400 });
    }
    const workspace = await requireManagedWorkspaceForUser(requestedId, identity.userId).catch(() => null);
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    }
    orgId = workspace.id;
  }

  const result = await enableWorkspaceBlock(orgId, "caldiy-booking", config);

  const theme =
    config?.theme === "dark" || config?.theme === "light" ? (config.theme as "dark" | "light") : "dark";
  const template = await createDefaultBookingTemplate(orgId, { theme });

  // Side effect: ensure the workspace landing page is healthy. Idempotent
  // for already-seeded workspaces; triggers the repair branch for pre-fix
  // workspaces whose landing row has contentCss=null (rendered blank).
  // Non-fatal — a landing-page glitch shouldn't block a booking install.
  await createDefaultLandingPage(orgId, { theme }).catch((error) => {
    console.warn(
      `[caldiy install] landing repair failed for ${orgId}:`,
      error instanceof Error ? error.message : String(error)
    );
  });

  const publicOrigin = `https://${result.slug}.${WORKSPACE_BASE_DOMAIN}`;
  const adminOrigin = "https://app.seldonframe.com";
  const wsQuery = `?workspace=${encodeURIComponent(orgId)}`;

  logEvent(
    "caldiy_booking_install",
    {
      already_enabled: result.alreadyEnabled,
      template_already_existed: template.alreadyExisted,
    },
    { request, identity, orgId, status: 200 }
  );

  return NextResponse.json({
    ok: true,
    installed: {
      slug: "caldiy-booking",
      kind: "booking",
      already_enabled: result.alreadyEnabled,
      installed_at: new Date().toISOString(),
      config: config ?? {},
    },
    default_template: {
      slug: template.slug,
      title: template.title,
      already_existed: template.alreadyExisted,
    },
    entities: ["EventType", "Availability", "Booking"],
    urls: {
      admin: `${adminOrigin}/bookings${wsQuery}`,
      // Public — /book rewrites to /book/<slug>/default; now resolves to a real template.
      book: `${publicOrigin}/book`,
      book_share: `${publicOrigin}/book/${template.slug}`,
    },
    next: [
      `Share ${publicOrigin}/book/${template.slug} with prospects.`,
      "configure_booking({ title?, duration_minutes?, description? }) — tune the default booking.",
    ],
  });
}

export async function GET(request: Request) {
  const auth = await resolveV1Identity(request);
  if (!auth.ok) return auth.response;

  const orgId =
    auth.identity.kind === "workspace" ? auth.identity.orgId : null;
  if (!orgId) {
    return NextResponse.json(
      { error: "Workspace context required. Pass a workspace bearer token." },
      { status: 400 }
    );
  }

  const [row] = await db
    .select({ enabledBlocks: organizations.enabledBlocks, slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });

  return NextResponse.json({
    ok: true,
    installed: (row.enabledBlocks ?? []).includes("caldiy-booking"),
    slug: row.slug,
  });
}
