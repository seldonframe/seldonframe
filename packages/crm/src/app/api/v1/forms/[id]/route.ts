import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { intakeForms, organizations } from "@/db/schema";
import { resolveOrgIdForWrite, resolveV1Identity } from "@/lib/auth/v1-identity";
import { assertWritable, demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";
import { logEvent } from "@/lib/observability/log";

// Public-URL pattern lives at packages/crm/src/app/forms/[id]/[formSlug]/page.tsx
// — despite the dir name, `[id]` is the org slug and `[formSlug]` is the form's
// slug. Encapsulating that knowledge here prevents every archetype / agent
// spec from depending on the internal route shape. Shipped 2026-04-21 in the
// pre-7.c micro-slice after MCP gap audit v2.
function buildPublicFormUrl(orgSlug: string | null, formSlug: string) {
  const origin = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.seldonframe.com").replace(/\/+$/, "");
  if (!orgSlug) return null;
  return `${origin}/forms/${orgSlug}/${formSlug}`;
}

// The `id` segment accepts EITHER the uuid primary key OR the slug. Slug
// lookups are the common MCP case (`update_form({ form_slug: 'intake' })`);
// uuid lookups are for dashboard links. Both resolved against (orgId, ...).
async function findForm(orgId: string, idOrSlug: string) {
  // Try by id first — uuid's 36-char shape is easy to recognize but we'll
  // just try both to keep the guard simple.
  const byId = await db
    .select()
    .from(intakeForms)
    .where(and(eq(intakeForms.orgId, orgId), eq(intakeForms.id, idOrSlug)))
    .limit(1);
  if (byId[0]) return byId[0];

  const bySlug = await db
    .select()
    .from(intakeForms)
    .where(and(eq(intakeForms.orgId, orgId), eq(intakeForms.slug, idOrSlug)))
    .limit(1);
  return bySlug[0] ?? null;
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveV1Identity(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const requested = url.searchParams.get("workspace_id");
  const resolved = await resolveOrgIdForWrite(auth.identity, requested);
  if (!resolved.ok) return resolved.response;

  const { id } = await params;
  const form = await findForm(resolved.orgId, id);
  if (!form) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [org] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, resolved.orgId))
    .limit(1);

  return NextResponse.json({
    ok: true,
    form: {
      id: form.id,
      name: form.name,
      slug: form.slug,
      fields: form.fields,
      settings: form.settings,
      is_active: form.isActive,
      public_url: buildPublicFormUrl(org?.slug ?? null, form.slug),
    },
  });
}

type PatchBody = {
  workspace_id?: unknown;
  name?: unknown;
  slug?: unknown;
  fields?: unknown;
  is_active?: unknown;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isDemoReadonly()) return demoApiBlockedResponse();
  assertWritable();

  const auth = await resolveV1Identity(request);
  if (!auth.ok) return auth.response;
  const { identity } = auth;

  const body = (await request.json().catch(() => ({}))) as PatchBody;
  const requestedWorkspaceId =
    typeof body.workspace_id === "string" ? body.workspace_id : null;
  const resolved = await resolveOrgIdForWrite(identity, requestedWorkspaceId);
  if (!resolved.ok) return resolved.response;
  const orgId = resolved.orgId;

  const { id } = await params;
  const form = await findForm(orgId, id);
  if (!form) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const patch: Partial<typeof intakeForms.$inferInsert> = { updatedAt: new Date() };
  const applied: Record<string, unknown> = {};

  if (typeof body.name === "string" && body.name.trim().length > 0) {
    patch.name = body.name.trim().slice(0, 120);
    applied.name = patch.name;
  }
  if (typeof body.slug === "string" && body.slug.trim().length > 0) {
    // Slug changes — no conflict check here because we lean on the unique
    // index at write time. PATCH returns a 500-ish on collision; acceptable
    // given how rare programmatic slug changes are.
    patch.slug = body.slug.trim().toLowerCase().slice(0, 48);
    applied.slug = patch.slug;
  }
  if (body.fields !== undefined) {
    patch.fields = normalizeFields(body.fields);
    applied.field_count = patch.fields.length;
  }
  if (body.is_active !== undefined) {
    patch.isActive = Boolean(body.is_active);
    applied.is_active = patch.isActive;
  }

  if (Object.keys(applied).length === 0) {
    return NextResponse.json(
      { error: "No patchable fields provided.", code: "empty_patch" },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(intakeForms)
    .set(patch)
    .where(and(eq(intakeForms.orgId, orgId), eq(intakeForms.id, form.id)))
    .returning();

  logEvent(
    "form_update",
    { form_slug: updated?.slug, applied_keys: Object.keys(applied) },
    { request, identity, orgId, status: 200 },
  );

  return NextResponse.json({
    ok: true,
    workspace_id: orgId,
    form: {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      fields: updated.fields,
      settings: updated.settings,
      is_active: updated.isActive,
    },
    applied,
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isDemoReadonly()) return demoApiBlockedResponse();
  assertWritable();

  const auth = await resolveV1Identity(request);
  if (!auth.ok) return auth.response;
  const { identity } = auth;

  const url = new URL(request.url);
  const requested = url.searchParams.get("workspace_id");
  const resolved = await resolveOrgIdForWrite(identity, requested);
  if (!resolved.ok) return resolved.response;
  const orgId = resolved.orgId;

  const { id } = await params;
  const form = await findForm(orgId, id);
  if (!form) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db
    .delete(intakeForms)
    .where(and(eq(intakeForms.orgId, orgId), eq(intakeForms.id, form.id)));

  logEvent(
    "form_delete",
    { form_slug: form.slug },
    { request, identity, orgId, status: 200 },
  );

  return NextResponse.json({ ok: true, deleted: form.id });
}
