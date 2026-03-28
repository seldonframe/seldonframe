import Link from "next/link";
import { createSuggestedFormAction, listForms } from "@/lib/forms/actions";
import { getLabels } from "@/lib/soul/labels";

export default async function FormsPage() {
  const [labels, forms] = await Promise.all([getLabels(), listForms()]);

  return (
    <section className="animate-page-enter space-y-4">
      <div>
        <h1 className="text-page-title">{labels.intakeForm.plural}</h1>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">
          Submissions become {labels.contact.plural.toLowerCase()} in your CRM automatically.
        </p>
      </div>

      {forms.length === 0 ? (
        <article className="glass-card flex min-h-52 flex-col items-center justify-center rounded-2xl p-8 text-center">
          <p className="text-3xl">📝</p>
          <p className="mt-3 text-lg font-medium text-foreground">Create your first intake form</p>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Submissions become {labels.contact.plural.toLowerCase()} in your CRM automatically.
          </p>
          <form action={createSuggestedFormAction}>
            <button type="submit" className="crm-button-primary mt-5 h-10 px-6">
              Create Form
            </button>
          </form>
        </article>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {forms.map((form) => (
            <article key={form.id} className="glass-card rounded-2xl p-5">
              <h3 className="text-base font-medium text-foreground">{form.name}</h3>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">/{form.slug}</p>
              <div className="mt-4 flex gap-2">
                <Link href={`/forms/${form.id}`} className="crm-button-primary h-9 px-4 text-xs">
                  Edit
                </Link>
                <Link href={`/forms/${form.id}`} className="crm-button-secondary h-9 px-4 text-xs">
                  Preview
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
