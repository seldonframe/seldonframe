import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { resolveV1Identity } from "@/lib/auth/v1-identity";
import { listManagedOrganizations } from "@/lib/billing/orgs";

const WORKSPACE_BASE_DOMAIN =
  process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";

function formatWorkspace(row: {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    subdomain: `${row.slug}.${WORKSPACE_BASE_DOMAIN}`,
    created_at: new Date(row.createdAt).toISOString(),
  };
}

export async function GET(request: Request) {
  const auth = await resolveV1Identity(request);
  if (!auth.ok) return auth.response;
  const { identity } = auth;

  if (identity.kind === "workspace") {
    const [row] = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        createdAt: organizations.createdAt,
      })
      .from(organizations)
      .where(eq(organizations.id, identity.orgId))
      .limit(1);

    return NextResponse.json({
      status: "ok",
      workspaces: row ? [formatWorkspace(row)] : [],
    });
  }

  const rows = await listManagedOrganizations(identity.userId);
  return NextResponse.json({
    status: "ok",
    workspaces: rows.map(formatWorkspace),
  });
}
