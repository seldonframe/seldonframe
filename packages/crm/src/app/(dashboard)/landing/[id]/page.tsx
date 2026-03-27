import { notFound } from "next/navigation";
import { LandingEditor } from "@/components/landing/landing-editor";
import { getLandingPageById } from "@/lib/landing/actions";
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

  return (
    <section className="animate-page-enter space-y-4">
      <div>
        <h1 className="text-page-title">{page.title}</h1>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">Edit section JSON and publish when ready.</p>
      </div>

      <LandingEditor pageId={page.id} initialSections={(page.sections as LandingSection[]) ?? []} initialStatus={page.status} />
    </section>
  );
}
