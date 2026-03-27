import Link from "next/link";
import { listForms } from "@/lib/forms/actions";

export default async function FormsPage() {
  const forms = await listForms();

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Intake Forms</h1>

      <div className="crm-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[hsl(var(--color-surface-raised))] text-left">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Slug</th>
            </tr>
          </thead>
          <tbody>
            {forms.map((form) => (
              <tr key={form.id} className="border-t">
                <td className="px-3 py-2"><Link href={`/forms/${form.id}`} className="underline">{form.name}</Link></td>
                <td className="px-3 py-2">{form.slug}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
