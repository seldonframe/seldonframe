// /alternative-to-kartra — static comparison page driven by the
// alternative-pages registry (lib/seo/alternative-pages.ts). Additive: no DB.
import type { Metadata } from "next";
import { AlternativePage } from "@/components/seo/alternative-page";
import { getCompetitor, alternativePageMeta } from "@/lib/seo/alternative-pages";
import { alternativeOgUrl } from "@/lib/seo/page-metadata";

const SLUG = "kartra";
const meta = alternativePageMeta(SLUG);
const ogUrl = alternativeOgUrl(SLUG);

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: meta.canonical, types: { "text/markdown": `${meta.canonical}.md` } },
  openGraph: { title: meta.title, description: meta.description, url: meta.canonical, type: "website", images: [{ url: ogUrl, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: meta.title, description: meta.description, images: [ogUrl] },
};

export default function Page() {
  return <AlternativePage competitor={getCompetitor(SLUG)} />;
}
