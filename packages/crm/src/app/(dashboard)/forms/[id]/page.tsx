import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { intakeForms } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";

/*
  Square UI class reference (source of truth):
  - templates/dashboard-2/components/dashboard/welcome-section.tsx
    - title: "text-lg sm:text-[22px] font-semibold leading-relaxed"
    - helper copy: "text-sm sm:text-base text-muted-foreground"
  - templates/dashboard-2/components/dashboard/deals-table.tsx
    - card/list shell: "rounded-xl border bg-card"
*/

export default async function FormDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orgId = await getOrgId();

  if (!orgId) {
    notFound();
  }

  const [form] = await db
    .select()
    .from(intakeForms)
    .where(and(eq(intakeForms.orgId, orgId), eq(intakeForms.id, id)))
    .limit(1);

  if (!form) {
    notFound();
  }

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">{form.name}</h1>
        <p className="text-sm sm:text-base text-muted-foreground">Manage form fields and publishing details.</p>
      </div>
      <div className="rounded-xl border bg-card p-5">
        <p className="text-sm text-foreground">Slug: {form.slug}</p>
        <p className="mt-2 text-sm text-foreground">Fields: {Array.isArray(form.fields) ? form.fields.length : 0}</p>
      </div>
    </section>
  );
}
