import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { intakeForms } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { FormEditor } from "@/components/forms/form-editor";

export default async function FormEditPage({ params }: { params: Promise<{ id: string }> }) {
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

  const initialFields = Array.isArray(form.fields)
    ? (form.fields as Array<{ key: string; label: string; type: string; required: boolean; options?: string[] }>)
    : [];

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">Edit {form.name}</h1>
        <p className="text-sm sm:text-base text-muted-foreground">Manage form fields and publishing details.</p>
      </div>

      <FormEditor formId={form.id} initialName={form.name} initialSlug={form.slug} initialFields={initialFields} />
    </section>
  );
}
