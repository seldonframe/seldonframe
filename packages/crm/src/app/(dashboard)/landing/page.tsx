import Link from "next/link";
import { createLandingPageAction, listLandingPages } from "@/lib/landing/actions";

export default async function LandingPagesDashboard() {
  const pages = await listLandingPages();

  return (
    <section className="animate-page-enter space-y-4">
      <div>
        <h1 className="text-page-title">Landing Pages</h1>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">Build and publish modular landing pages with integrated form and booking sections.</p>
      </div>

      <form action={createLandingPageAction} className="crm-card grid gap-3 p-4 md:grid-cols-[1fr_1fr_auto]">
        <input className="crm-input h-10 px-3" name="title" placeholder="Page title" required />
        <input className="crm-input h-10 px-3" name="slug" placeholder="page-slug" required />
        <button type="submit" className="crm-button-primary h-10 px-4">Create</button>
      </form>

      <div className="crm-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[hsl(var(--color-surface-raised))] text-left text-label">
            <tr>
              <th className="px-3 py-3">Title</th>
              <th className="px-3 py-3">Slug</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Open</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((page) => (
              <tr key={page.id} className="crm-table-row">
                <td className="px-3 py-3 font-medium text-foreground">{page.title}</td>
                <td className="px-3 py-3">{page.slug}</td>
                <td className="px-3 py-3"><span className="crm-badge">{page.status}</span></td>
                <td className="px-3 py-3">
                  <Link href={`/landing/${page.id}`} className="text-primary underline-offset-4 hover:underline">Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
