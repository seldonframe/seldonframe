import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";

function normalizeHost(host: string) {
  return host.trim().toLowerCase().replace(/:\d+$/, "");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const host = normalizeHost(String(url.searchParams.get("host") ?? ""));

  if (!host) {
    return NextResponse.json({ ok: false, error: "missing_host" }, { status: 400 });
  }

  const [org] = await db
    .select({ id: organizations.id, slug: organizations.slug })
    .from(organizations)
    .where(
      sql`${organizations.settings} ->> 'customDomain' = ${host}
      and coalesce((${organizations.settings} ->> 'domainVerified')::boolean, false) = true`
    )
    .limit(1);

  if (!org) {
    return NextResponse.json({ ok: true, org: null });
  }

  return NextResponse.json({
    ok: true,
    org: {
      id: org.id,
      slug: org.slug,
    },
  });
}
