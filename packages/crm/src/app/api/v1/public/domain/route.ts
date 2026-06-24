import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { bookings, intakeForms, landingPages, organizations } from "@/db/schema";
import { resolveWorkspaceForCustomDomain } from "@/lib/domains/store";

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

  // v1.8.0 — preferred custom-domain path: workspace_domains table.
  // Indexed lookup (workspace_domains_active_lookup_idx WHERE
  // status='verified') so this is a single hot-path query on every
  // host check. Falls through to the legacy settings.customDomain
  // path below + then to subdomain extraction.
  const v18Match = await resolveWorkspaceForCustomDomain(host);
  let v18Org: { id: string; slug: string } | null = null;
  if (v18Match) {
    const [row] = await db
      .select({ id: organizations.id, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, v18Match.workspace_id))
      .limit(1);
    if (row) v18Org = row;
  }

  // Legacy path: organizations.settings.customDomain. Pre-1.8 used
  // this. Kept as a fallback so workspaces that registered under the
  // old scheme keep working. New domains always use workspace_domains.
  const [legacyCustomDomainOrg] = !v18Org
    ? await db
        .select({ id: organizations.id, slug: organizations.slug })
        .from(organizations)
        .where(
          sql`${organizations.settings} ->> 'customDomain' = ${host}
          and coalesce((${organizations.settings} ->> 'domainVerified')::boolean, false) = true`
        )
        .limit(1)
    : [null];

  const customDomainOrg = v18Org ?? legacyCustomDomainOrg;

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

  // Exclude the internal 'r1' R-framework row. The public home is ALWAYS served
  // at the conventional 'home' slug — the /s/[orgSlug]/[...slug] page loads the
  // r1 payload there via its isHomePage branch. Returning 'r1' here made the
  // proxy rewrite the subdomain root to /s/<slug>/r1, which the page does NOT
  // treat as home → it fell through to a legacy lookup that 404s, so every r1
  // workspace served the marketing-chrome 404 at its subdomain instead of the
  // archetype landing.
  const [landing] = await db
    .select({ slug: landingPages.slug })
    .from(landingPages)
    .where(sql`${landingPages.orgId} = ${org.id} and ${landingPages.slug} <> 'r1'`)
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
