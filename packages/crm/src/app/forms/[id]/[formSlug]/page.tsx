import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { intakeForms, organizations } from "@/db/schema";
import { PublicForm } from "@/components/forms/public-form";
import { PublicThemeProvider } from "@/components/theme/public-theme-provider";
import { PoweredByBadge } from "@seldonframe/core/virality";
import { shouldShowPoweredByBadgeForOrg } from "@/lib/billing/public";
import { getPublicOrgThemeBySlug } from "@/lib/theme/actions";

export default async function PublicIntakePage({
  params,
}: {
  params: Promise<{ id: string; formSlug: string }>;
}) {
  const { id: orgSlug, formSlug } = await params;

  const [org] = await db
    .select({ id: organizations.id })
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

  return (
    <PublicThemeProvider theme={theme}>
      <main className="crm-page flex items-center justify-center">
        <div className="w-full max-w-xl space-y-4">
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
