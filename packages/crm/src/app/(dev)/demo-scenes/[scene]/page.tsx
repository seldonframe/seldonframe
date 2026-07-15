// packages/crm/src/app/(dev)/demo-scenes/[scene]/page.tsx
//
// DEV-ONLY single-scene stage, rendered full-viewport for screen recording.
// Same gating idiom as /motion-lab (SF_MOTION_LAB=1 strict-"1", reused from
// motion-lab/gate.ts) + noindex/nofollow. Unknown [scene] -> notFound().
// The server page only resolves the scene id from the static registry;
// SceneStage (client) owns all the interactive stage chrome.

import "@/components/landing/landing-theme.css";
import "@/components/motion/motion-tokens.css";

import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { isMotionLabOn } from "../../motion-lab/gate";
import { getDemoScene } from "@/components/demo-scenes/registry";
import { SceneStage } from "@/components/demo-scenes/scene-stage";

export const metadata: Metadata = {
  title: "Demo scene (dev only)",
  robots: { index: false, follow: false },
};

export default async function DemoScenePage({
  params,
}: {
  params: Promise<{ scene: string }>;
}) {
  if (!isMotionLabOn({ SF_MOTION_LAB: process.env.SF_MOTION_LAB })) notFound();

  const { scene: sceneId } = await params;
  const scene = getDemoScene(sceneId);
  if (!scene) notFound();

  return (
    <Suspense fallback={null}>
      <SceneStage scene={scene} />
    </Suspense>
  );
}
