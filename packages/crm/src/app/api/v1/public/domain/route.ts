import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { bookings, intakeForms, landingPages, organizations } from "@/db/schema";

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
