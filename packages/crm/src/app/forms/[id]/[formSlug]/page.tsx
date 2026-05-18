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
    // 2026-05-18 — inject the workspace logo + business name floating
    // above the pre-rendered blueprint HTML. The blueprint render was
    // produced before theme.logoUrl existed as a concept; rather than
    // regenerate it (expensive — would re-run the formbricks-stack-v1
    // renderer on every form), we overlay a small absolutely-positioned
    // header. fixed top-center; matches the booking page treatment.
    // No logo set → nothing renders, blueprint shows as-is.
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: form.contentCss! }} />
        {headerLogoUrl ? (
          <div
            style={{
              position: "fixed",
              top: 24,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 50,
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 16px",
              background: "rgba(255,255,255,0.92)",
              borderRadius: 12,
              boxShadow: "0 4px 12px rgba(15,23,42,0.08)",
              backdropFilter: "blur(8px)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={headerLogoUrl}
              alt={`${headerName} logo`}
              style={{ height: 28, width: "auto", objectFit: "contain" }}
            />
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#0f172a",
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              }}
            >
              {headerName}
            </span>
          </div>
        ) : null}
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
