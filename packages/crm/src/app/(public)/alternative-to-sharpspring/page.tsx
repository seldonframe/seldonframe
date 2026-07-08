// /alternative-to-sharpspring — static comparison page driven by the
// alternative-pages registry (lib/seo/alternative-pages.ts). Additive: no DB.
import type { Metadata } from "next";
import { AlternativePage } from "@/components/seo/alternative-page";
import { getCompetitor, alternativePageMeta } from "@/lib/seo/alternative-pages";

const SLUG = "sharpspring";
const meta = alternativePageMeta(SLUG);

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: meta.canonical, types: { "text/markdown": `${meta.canonical}.md` } },
  openGraph: { title: meta.title, description: meta.description, url: meta.canonical, type: "website" },
  twitter: { card: "summary_large_image", title: meta.title, description: meta.description },
};

export default function Page() {
  return <AlternativePage competitor={getCompetitor(SLUG)} />;
}
