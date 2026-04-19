import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { intakeForms, organizations } from "@/db/schema";
import {
  resolveOrgIdForWrite,
  resolveV1Identity,
} from "@/lib/auth/v1-identity";
import { assertWritable, demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";
import { logEvent } from "@/lib/observability/log";

type IntakeField = {
  key: string;
  label: string;
  type: "text" | "email" | "tel" | "textarea" | "select";
  required: boolean;
  options?: string[];
};

type CustomizeBody = {
  workspace_id?: unknown;
  fields?: unknown;
  form_name?: unknown;
};

const INTAKE_SLUG = "intake";

export async function POST(request: Request) {
  if (isDemoReadonly()) return demoApiBlockedResponse();
  assertWritable();

  const auth = await resolveV1Identity(request);
  if (!auth.ok) return auth.response;
  const { identity } = auth;

  const body = (await request.json().catch(() => ({}))) as CustomizeBody;

  const rawFields = Array.isArray(body.fields) ? body.fields : [];
  const fields: IntakeField[] = [];
  for (const raw of rawFields.slice(0, 8)) {
    if (!raw || typeof raw !== "object") continue;
    const f = raw as Record<string, unknown>;
    const key = String(f.key ?? "")
      .slice(0, 48)
      .replace(/[^a-z0-9_]/gi, "_")
      .toLowerCase();
    const label = String(f.label ?? "").slice(0, 120).trim();
    const type = String(f.type ?? "text");
    if (!key || !label) continue;
    if (!["text", "email", "tel", "textarea", "select"].includes(type)) continue;
    const field: IntakeField = {
      key,
      label,
      type: type as IntakeField["type"],
      required: Boolean(f.required),
    };
    if (type === "select" && Array.isArray(f.options)) {
      field.options = (f.options as unknown[])
        .map((o) => String(o).slice(0, 60))
        .filter(Boolean)
        .slice(0, 20);
    }
    fields.push(field);
  }

  if (fields.length === 0) {
    return NextResponse.json(
      { error: "At least one valid field is required." },
      { status: 400 }
    );
  }

  const formName =
    typeof body.form_name === "string" && body.form_name.trim().length > 0
      ? body.form_name.trim().slice(0, 120)
      : undefined;

  const requestedWorkspaceId =
    typeof body.workspace_id === "string" ? body.workspace_id : null;
  const resolved = await resolveOrgIdForWrite(identity, requestedWorkspaceId);
  if (!resolved.ok) return resolved.response;
  const orgId = resolved.orgId;

  const [org] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  const [existing] = await db
    .select({ id: intakeForms.id })
    .from(intakeForms)
    .where(and(eq(intakeForms.orgId, orgId), eq(intakeForms.slug, INTAKE_SLUG)))
    .limit(1);

  if (!existing) {
    await db.insert(intakeForms).values({
      orgId,
      name: formName ?? "Get in touch",
      slug: INTAKE_SLUG,
      fields,
      settings: { theme: "dark" },
      isActive: true,
    });
  } else {
    const patch: Partial<typeof intakeForms.$inferInsert> = {
      fields,
      updatedAt: new Date(),
    };
    if (formName) patch.name = formName;
    await db.update(intakeForms).set(patch).where(eq(intakeForms.id, existing.id));
  }

  logEvent(
    "intake_customize",
    {
      created: !existing,
      field_count: fields.length,
    },
    { request, identity, orgId, status: 200 }
  );

  return NextResponse.json({
    ok: true,
    workspace_id: orgId,
    slug: INTAKE_SLUG,
    applied: {
      field_count: fields.length,
      field_keys: fields.map((f) => f.key),
      form_name: formName ?? null,
    },
    public_url: `https://${org.slug}.${process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com"}/intake`,
    next: ["Visit /intake on your subdomain to verify the new fields render."],
  });
}
