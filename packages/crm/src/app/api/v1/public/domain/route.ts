import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { bookings, intakeForms, landingPages, organizations } from "@/db/schema";

function normalizeHost(host: string) {
  return host.trim().toLowerCase().replace(/:\d+$/, "");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const host = normalizeHost(String(url.searchParams.get("host") ?? ""));
  const workspaceBaseDomain = (process.env.WORKSPACE_BASE_DOMAIN?.trim().toLowerCase() || "app.seldonframe.com").replace(/^\.+/, "");

  if (!host) {
    return NextResponse.json({ ok: false, error: "missing_host" }, { status: 400 });
  }

  const [customDomainOrg] = await db
    .select({ id: organizations.id, slug: organizations.slug })
    .from(organizations)
    .where(
      sql`${organizations.settings} ->> 'customDomain' = ${host}
      and coalesce((${organizations.settings} ->> 'domainVerified')::boolean, false) = true`
    )
    .limit(1);

  const wildcardSuffix = `.${workspaceBaseDomain}`;
  const wildcardSlug = host.endsWith(wildcardSuffix)
    ? host.slice(0, -wildcardSuffix.length)
    : null;

  const [subdomainOrg] = !customDomainOrg && wildcardSlug && !wildcardSlug.includes(".")
    ? await db
        .select({ id: organizations.id, slug: organizations.slug })
        .from(organizations)
        .where(eq(organizations.slug, wildcardSlug))
        .limit(1)
    : [null];

  const org = customDomainOrg ?? subdomainOrg;

  if (!org) {
    return NextResponse.json({ ok: true, org: null });
  }

  const [landing] = await db
    .select({ slug: landingPages.slug })
    .from(landingPages)
    .where(sql`${landingPages.orgId} = ${org.id}`)
    .orderBy(sql`${landingPages.updatedAt} desc`)
    .limit(1);

  const [booking] = await db
    .select({ slug: bookings.bookingSlug })
    .from(bookings)
    .where(sql`${bookings.orgId} = ${org.id}`)
    .orderBy(sql`${bookings.updatedAt} desc`)
    .limit(1);

  const [form] = await db
    .select({ slug: intakeForms.slug })
    .from(intakeForms)
    .where(sql`${intakeForms.orgId} = ${org.id}`)
    .orderBy(sql`${intakeForms.updatedAt} desc`)
    .limit(1);

  return NextResponse.json({
    ok: true,
    org: {
      id: org.id,
      slug: org.slug,
      defaults: {
        landingSlug: landing?.slug ?? "home",
        bookingSlug: booking?.slug ?? "default",
        formSlug: form?.slug ?? "intake",
      },
    },
  });
}
