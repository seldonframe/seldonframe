import { notFound } from "next/navigation";
import { LandingEditor } from "@/components/landing/landing-editor";
import { getLandingPageById } from "@/lib/landing/actions";
import { sectionsToHTML } from "@/lib/landing/section-to-html";
import type { LandingSection } from "@/lib/landing/types";

export default async function LandingPageEditor({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const page = await getLandingPageById(id);

  if (!page) {
    notFound();
  }

  const sections = (page.sections as LandingSection[]) ?? [];
  const fallback = sectionsToHTML(sections);

  return (
    <section className="animate-page-enter space-y-4">
      <div>
        <h1 className="text-page-title">{page.title}</h1>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">Edit visually, adjust settings, preview, and publish.</p>
      </div>

      <LandingEditor
        pageId={page.id}
        orgSlug={page.orgSlug}
        title={page.title}
        slug={page.slug}
        seoDescription={String((page.seo as { description?: string } | null)?.description ?? "")}
        initialHtml={page.contentHtml ?? fallback.html}
        initialCss={page.contentCss ?? fallback.css}
        initialEditorData={(page.editorData as Record<string, unknown> | null) ?? null}
        initialStatus={page.status}
      />
    </section>
  );
}
