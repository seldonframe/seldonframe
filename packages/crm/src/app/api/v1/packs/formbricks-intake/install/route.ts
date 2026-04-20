import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { resolveV1Identity } from "@/lib/auth/v1-identity";
import { enableWorkspaceBlock } from "@/lib/blocks/install";
import { createDefaultIntakeForm, createDefaultLandingPage } from "@/lib/blocks/templates";
import { requireManagedWorkspaceForUser } from "@/lib/openclaw/self-service";
import { logEvent } from "@/lib/observability/log";

const WORKSPACE_BASE_DOMAIN =
  process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";

type InstallBody = {
  workspace_id?: unknown;
  form_id?: unknown;
  config?: unknown;
};

export async function POST(request: Request) {
  const auth = await resolveV1Identity(request);
  if (!auth.ok) return auth.response;
  const { identity } = auth;

  const body = (await request.json().catch(() => ({}))) as InstallBody;
  const requestedId = typeof body.workspace_id === "string" ? body.workspace_id.trim() : "";
  const formId = typeof body.form_id === "string" ? body.form_id.trim() : undefined;
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

  const mergedConfig = { ...(config ?? {}), ...(formId ? { form_id: formId } : {}) };
  const result = await enableWorkspaceBlock(
    orgId,
    "formbricks-intake",
    Object.keys(mergedConfig).length > 0 ? mergedConfig : undefined
  );

  const theme =
    config?.theme === "dark" || config?.theme === "light" ? (config.theme as "dark" | "light") : "dark";
  const template = await createDefaultIntakeForm(orgId, { theme });

  // Side effect: ensure the workspace landing page is healthy. Idempotent
  // for already-seeded workspaces; triggers the repair branch for pre-fix
  // workspaces whose landing row has contentCss=null (rendered blank).
  // Non-fatal — a landing-page glitch shouldn't block an intake install.
  await createDefaultLandingPage(orgId, { theme }).catch((error) => {
    console.warn(
      `[formbricks install] landing repair failed for ${orgId}:`,
      error instanceof Error ? error.message : String(error)
    );
  });

  const publicOrigin = `https://${result.slug}.${WORKSPACE_BASE_DOMAIN}`;
  const adminOrigin = "https://app.seldonframe.com";
  const wsQuery = `?workspace=${encodeURIComponent(orgId)}`;

  logEvent(
    "formbricks_intake_install",
    {
      already_enabled: result.alreadyEnabled,
      template_already_existed: template.alreadyExisted,
    },
    { request, identity, orgId, status: 200 }
  );

  return NextResponse.json({
    ok: true,
    installed: {
      slug: "formbricks-intake",
      kind: "intake",
      already_enabled: result.alreadyEnabled,
      installed_at: new Date().toISOString(),
      form_id: formId ?? null,
      config: config ?? {},
    },
    default_template: {
      slug: template.slug,
      name: template.name,
      already_existed: template.alreadyExisted,
    },
    entities: ["Survey", "Question", "Response"],
    urls: {
      admin: `${adminOrigin}/forms${wsQuery}`,
      // Public — /intake rewrites to /forms/<slug>/intake; now resolves to a real form.
      intake: `${publicOrigin}/intake`,
      intake_share: `${publicOrigin}/forms/${template.slug}`,
    },
    next: [
      `Share ${publicOrigin}/intake with prospects.`,
      "customize_intake_form({ fields: [...] }) — replace the default fields.",
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
    installed: (row.enabledBlocks ?? []).includes("formbricks-intake"),
    slug: row.slug,
  });
}
