// packages/crm/src/app/(public)/try/page.tsx
//
// PUBLIC, UNAUTHENTICATED "watch it build" page — the paste → live build
// animation → reveal (working chatbot + save CTA) surface. Flag-gated by
// isWebUngatedBuildOn (SF_WEB_UNGATED_BUILD=1); 404s when off, mirroring the
// SSE route it consumes (api/v1/web/build/stream/route.ts).
//
// This is an app surface, not indexable content — robots: noindex,nofollow.
// All interactivity (SSE, BuildAnimation, reveal, CTAs) lives in the client
// island (try-client.tsx) so this file stays a thin server gate + metadata
// shell, same idiom as other flag-gated public routes in this app.

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isWebUngatedBuildOn } from "@/lib/web-build/policy";
import { TryClient } from "./try-client";

export const metadata: Metadata = {
  title: "Try SeldonFrame — watch your business build itself",
  robots: { index: false, follow: false },
};

export default async function TryPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  if (!isWebUngatedBuildOn({ SF_WEB_UNGATED_BUILD: process.env.SF_WEB_UNGATED_BUILD })) notFound();
  const params = await searchParams;
  return <TryClient initialUrl={typeof params.url === "string" ? params.url : ""} />;
}
