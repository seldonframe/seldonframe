import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { guardApiRequest } from "@/lib/api/guard";
import { generatePuckPageWithClaude } from "@/lib/puck/generate-with-claude";
import type { OrgSoul } from "@/lib/soul/types";
import type { OrgTheme } from "@/lib/theme/types";

export const runtime = "nodejs";

async function loadSoulAndTheme(orgId: string) {
  const [row] = await db
    .select({
      soul: organizations.soul,
      theme: organizations.theme,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return {
    soul: (row?.soul as OrgSoul | null) ?? null,
    theme: (row?.theme as OrgTheme | null) ?? null,
  };
}

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const body = (await request.json()) as {
    prompt?: unknown;
    existing?: unknown;
  };

  if (typeof body.prompt !== "string" || !body.prompt.trim()) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const { soul, theme } = await loadSoulAndTheme(guard.orgId);

  const result = await generatePuckPageWithClaude({
    orgId: guard.orgId,
    prompt: body.prompt,
    soul,
    theme,
    existing: body.existing && typeof body.existing === "object" ? (body.existing as Record<string, unknown> as never) : undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.reason,
        detail: result.detail,
        issues: "issues" in result ? result.issues : undefined,
      },
      { status: result.reason === "no_ai_client" ? 503 : 422 }
    );
  }

  return NextResponse.json({
    data: {
      payload: result.payload,
      droppedIssues: result.droppedIssues,
    },
  });
}
