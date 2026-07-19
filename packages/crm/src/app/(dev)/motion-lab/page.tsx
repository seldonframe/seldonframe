// packages/crm/src/app/(dev)/motion-lab/page.tsx
//
// DEV-ONLY motion gallery — Max's single surface to review every vendored
// motion component (spec §7 "Motion review (Max, blocking)"). Gated
// SF_MOTION_LAB=1 strict-"1" (gate.ts), mirroring isRecordToAgentOn's idiom:
// 404s in prod unless the flag is explicitly on. Not a marketing route, so
// it's noindex/nofollow even when reachable.

// Landing theme tokens + cross-surface motion timing tokens, imported at the
// route level (same pattern as the sibling "/" and "/record" routes — see
// the header note in app/(public)/record/page.tsx) so var(--lp-*) and
// var(--motion-*) resolve; the client gallery deliberately doesn't import
// CSS itself so it stays importable under the node:test harness.
import "@/components/landing/landing-theme.css";
import "@/components/motion/motion-tokens.css";

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isMotionLabOn } from "./gate";
import { MotionLabClient } from "./motion-lab-client";

export const metadata: Metadata = {
  title: "Motion lab (dev only)",
  robots: { index: false, follow: false },
};

export default function MotionLabPage() {
  if (!isMotionLabOn({ SF_MOTION_LAB: process.env.SF_MOTION_LAB })) notFound();

  return <MotionLabClient />;
}
