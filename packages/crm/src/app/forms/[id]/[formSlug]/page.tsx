import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { intakeForms, organizations } from "@/db/schema";
import { PublicForm } from "@/components/forms/public-form";
import { PublicThemeProvider } from "@/components/theme/public-theme-provider";
import { PoweredByBadge } from "@seldonframe/core/virality";
import { shouldShowPoweredByBadgeForOrg } from "@/lib/billing/public";
import { getPublicOrgThemeBySlug } from "@/lib/theme/actions";
// 2026-05-18 — white-label slice 2: agency-wide logo header on the
// public intake page. Mirrors the slice 1 treatment we shipped for
// /book/[orgSlug]/[bookingSlug]. Effective branding picks the agency
// logo when chrome substitution is active; falls back to the
// workspace's own theme.logoUrl when it isn't.
import { getEffectiveBrandingForWorkspace } from "@/lib/partner-agencies/branding";

export default async function PublicIntakePage({
  params,
}: {
  params: Promise<{ id: string; formSlug: string }>;
}) {
  const { id: orgSlug, formSlug } = await params;

  const [org] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.slug, orgSlug))
    .limit(1);

  if (!org) {
    notFound();
  }

  const [form] = await db
    .select()
    .from(intakeForms)
    .where(and(eq(intakeForms.orgId, org.id), eq(intakeForms.slug, formSlug)))
    .limit(1);

  if (!form) {
    notFound();
  }

  const showBadge = await shouldShowPoweredByBadgeForOrg(org.id);
  const theme = await getPublicOrgThemeBySlug(orgSlug);
  // 2026-05-18 — effective branding for the white-label header.
  const effectiveBranding = await getEffectiveBrandingForWorkspace(org.id);
  const headerLogoUrl =
    (effectiveBranding.is_white_label && effectiveBranding.logo_url) ||
    theme.logoUrl ||
    null;
  const headerName = effectiveBranding.is_white_label
    ? effectiveBranding.brand_name
    : org.name;

  // Wiring task: prefer the blueprint-rendered HTML/CSS pair
  // (formbricks-stack-v1) when present on the row. Falls back to the
  // legacy PublicForm React component for rows that predate the wiring.
  const useBlueprintRender = Boolean(form.contentHtml && form.contentCss);

  if (useBlueprintRender) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: form.contentCss! }} />
        <div dangerouslySetInnerHTML={{ __html: form.contentHtml! }} />
        {showBadge ? (
          <div className="flex justify-center py-2">
            <PoweredByBadge />
          </div>
        ) : null}
      </>
    );
  }

  return (
    <PublicThemeProvider theme={theme}>
      <main className="crm-page flex flex-col items-center pt-6 md:pt-10">
        {/* 2026-05-18 — white-label header bar. Renders the agency
            logo (or workspace logo as fallback) + the brand name
            above the intake form so the customer sees consistent
            chrome across booking + intake. The form itself owns its
            welcome step heading, so we keep this header minimal: a
            small logo + text row, no marketing copy. */}
        <header
          className="mb-4 flex items-center gap-3 w-full max-w-xl px-4"
        >
          {headerLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={headerLogoUrl}
              alt={`${headerName} logo`}
              className="h-9 w-auto object-contain shrink-0"
            />
          ) : null}
          <p
            className="text-base font-semibold truncate"
            style={{ color: "var(--sf-text)" }}
          >
            {headerName}
          </p>
        </header>
        <div className="w-full max-w-xl space-y-4 px-4">
          {/* The form owns its own heading (welcome step) — no outer <h1>
              needed. PublicForm renders a three-step flow: welcome → one
              question per page → done. */}
          <PublicForm
            orgSlug={orgSlug}
            formSlug={formSlug}
            formName={form.name}
            fields={Array.isArray(form.fields) ? (form.fields as Array<{ key: string; label: string; type: string; required: boolean; options?: string[] }>) : []}
          />
          {showBadge ? (
            <div className="flex justify-center pt-2">
              <PoweredByBadge />
            </div>
          ) : null}
        </div>
      </main>
    </PublicThemeProvider>
  );
}
