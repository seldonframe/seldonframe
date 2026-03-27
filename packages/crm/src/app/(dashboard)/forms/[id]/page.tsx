import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { intakeForms } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";

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
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">{form.name}</h1>
      <div className="crm-card p-4">
        <p className="text-sm">Slug: {form.slug}</p>
        <p className="mt-2 text-sm">Fields: {Array.isArray(form.fields) ? form.fields.length : 0}</p>
      </div>
    </section>
  );
}
