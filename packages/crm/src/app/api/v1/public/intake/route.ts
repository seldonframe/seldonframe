import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { intakeForms, intakeSubmissions, organizations } from "@/db/schema";

/**
 * POST /api/v1/public/intake
 *
 * The HTTP endpoint the C5 intake renderer's vanilla-JS client posts
 * to on Submit. Stores the answer payload in `intake_submissions` for
 * the workspace operator to review later (Inbox, exports, automation
 * triggers, etc.).
 *
 * Request body:
 *   {
 *     orgSlug: string,
 *     formSlug?: string,         // default: "intake"
 *     answers: Record<string, unknown>,
 *     workspace?: string         // C5 client includes the workspace
 *                                // name for diagnostic logs
 *   }
 *
 * Auth: anonymous. We resolve the org by slug and look up the form by
 * (orgId, formSlug); if either is missing we return 404 without
 * leaking which.
 */

type SubmitBody = {
  orgSlug?: unknown;
  formSlug?: unknown;
  answers?: unknown;
  workspace?: unknown;
};

export async function POST(request: Request) {
  let body: SubmitBody;
  try {
    body = (await request.json()) as SubmitBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const orgSlug = typeof body.orgSlug === "string" ? body.orgSlug.trim() : "";
  const formSlug =
    typeof body.formSlug === "string" && body.formSlug.trim().length > 0
      ? body.formSlug.trim()
      : "intake";
  const answers =
    body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
      ? (body.answers as Record<string, unknown>)
      : null;

  if (!orgSlug || !answers) {
    return NextResponse.json(
      { error: "orgSlug and answers are required." },
      { status: 400 }
    );
  }

  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, orgSlug))
    .limit(1);

  if (!org) {
    return NextResponse.json({ error: "Form not found." }, { status: 404 });
  }

  const [form] = await db
    .select({ id: intakeForms.id, isActive: intakeForms.isActive })
    .from(intakeForms)
    .where(and(eq(intakeForms.orgId, org.id), eq(intakeForms.slug, formSlug)))
    .limit(1);

  if (!form || !form.isActive) {
    return NextResponse.json({ error: "Form not found." }, { status: 404 });
  }

  await db.insert(intakeSubmissions).values({
    orgId: org.id,
    formId: form.id,
    data: answers,
  });

  return NextResponse.json({ ok: true });
}
