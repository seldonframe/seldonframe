import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { intakeForms, organizations } from "@/db/schema";
import { resolveOrgIdForWrite, resolveV1Identity } from "@/lib/auth/v1-identity";
import { assertWritable, demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";
import { logEvent } from "@/lib/observability/log";
import { getIntakeFormTemplate } from "@/lib/forms/templates";

// Intake form CRUD — missing until now; dashboard used server actions only.
// With these endpoints the MCP surface can create multiple forms per
// workspace with a template_id shortcut, replacing the hardcoded-default
// pattern of the old `customize_intake_form` / `/api/v1/intake/customize`.

function toSlug(value: string) {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return normalized || "form";
}

const VALID_FIELD_TYPES = new Set(["text", "email", "tel", "textarea", "select"]);

function normalizeFields(input: unknown): Array<{
  key: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[];
}> {
  if (!Array.isArray(input)) return [];
  const result: Array<{ key: string; label: string; type: string; required: boolean; options?: string[] }> = [];
  for (const raw of input.slice(0, 20)) {
    if (!raw || typeof raw !== "object") continue;
    const f = raw as Record<string, unknown>;
    const key = String(f.key ?? "")
      .slice(0, 48)
      .replace(/[^a-z0-9_]/gi, "_")
      .toLowerCase();
    const label = String(f.label ?? "").trim().slice(0, 120);
    const type = String(f.type ?? "text");
    if (!key || !label || !VALID_FIELD_TYPES.has(type)) continue;
    const field: { key: string; label: string; type: string; required: boolean; options?: string[] } = {
      key,
      label,
      type,
      required: Boolean(f.required),
    };
    if (type === "select" && Array.isArray(f.options)) {
      field.options = (f.options as unknown[])
        .map((o) => String(o).slice(0, 60))
        .filter(Boolean)
        .slice(0, 20);
    }
    result.push(field);
  }
  return result;
}

export async function GET(request: Request) {
  const auth = await resolveV1Identity(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const requested = url.searchParams.get("workspace_id");
  const resolved = await resolveOrgIdForWrite(auth.identity, requested);
  if (!resolved.ok) return resolved.response;
  const orgId = resolved.orgId;

  const rows = await db
    .select({
      id: intakeForms.id,
      name: intakeForms.name,
      slug: intakeForms.slug,
      fields: intakeForms.fields,
      settings: intakeForms.settings,
      isActive: intakeForms.isActive,
      createdAt: intakeForms.createdAt,
      updatedAt: intakeForms.updatedAt,
    })
    .from(intakeForms)
    .where(eq(intakeForms.orgId, orgId));

  return NextResponse.json({
    ok: true,
    workspace_id: orgId,
    forms: rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      fields: r.fields,
      settings: r.settings,
      is_active: r.isActive,
      created_at: r.createdAt.toISOString(),
      updated_at: r.updatedAt.toISOString(),
    })),
  });
}

type CreateBody = {
  workspace_id?: unknown;
  name?: unknown;
  slug?: unknown;
  template_id?: unknown;
  fields?: unknown;
  is_active?: unknown;
};

export async function POST(request: Request) {
  if (isDemoReadonly()) return demoApiBlockedResponse();
  assertWritable();

  const auth = await resolveV1Identity(request);
  if (!auth.ok) return auth.response;
  const { identity } = auth;

  const body = (await request.json().catch(() => ({}))) as CreateBody;

  const requestedWorkspaceId =
    typeof body.workspace_id === "string" ? body.workspace_id : null;
  const resolved = await resolveOrgIdForWrite(identity, requestedWorkspaceId);
  if (!resolved.ok) return resolved.response;
  const orgId = resolved.orgId;

  // Template-backed create — fetches pre-built fields from the intake
  // template registry when template_id is provided. Caller can still
  // override name / slug / fields.
  const templateId = typeof body.template_id === "string" ? body.template_id : null;
  const template = templateId ? getIntakeFormTemplate(templateId) : null;
  if (templateId && !template) {
    return NextResponse.json(
      { error: `Unknown template_id '${templateId}'.`, code: "unknown_template" },
      { status: 400 },
    );
  }

  const name =
    typeof body.name === "string" && body.name.trim().length > 0
      ? body.name.trim().slice(0, 120)
      : template?.name ?? "New intake form";
  const slugInput =
    typeof body.slug === "string" && body.slug.trim().length > 0
      ? body.slug
      : template?.defaultSlug ?? name;
  const slug = toSlug(slugInput);
  const fields = Array.isArray(body.fields)
    ? normalizeFields(body.fields)
    : template?.fields ?? [];
  const isActive = body.is_active === undefined ? true : Boolean(body.is_active);

  const [org] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  // Conflict guard on (orgId, slug). Schema has a unique index; catching
  // before insert gives a nicer error than a generic FK/unique violation.
  const [conflict] = await db
    .select({ id: intakeForms.id })
    .from(intakeForms)
    .where(and(eq(intakeForms.orgId, orgId), eq(intakeForms.slug, slug)))
    .limit(1);
  if (conflict) {
    return NextResponse.json(
      {
        error: `Form with slug '${slug}' already exists. Use update_form to modify it.`,
        code: "slug_conflict",
      },
      { status: 409 },
    );
  }

  const [created] = await db
    .insert(intakeForms)
    .values({
      orgId,
      name,
      slug,
      fields,
      settings: (template?.settings as Record<string, unknown> | undefined) ?? { theme: "dark" },
      isActive,
    })
    .returning();

  logEvent(
    "form_create",
    { slug, template_id: templateId, field_count: fields.length },
    { request, identity, orgId, status: 201 },
  );

  return NextResponse.json(
    {
      ok: true,
      workspace_id: orgId,
      form: {
        id: created.id,
        name: created.name,
        slug: created.slug,
        fields: created.fields,
        settings: created.settings,
        is_active: created.isActive,
      },
      public_url: `https://${org.slug}.${process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com"}/forms/${created.slug}`,
    },
    { status: 201 },
  );
}
