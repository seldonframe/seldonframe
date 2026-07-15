// packages/crm/src/app/(dev)/demo-scenes/page.tsx
//
// DEV-ONLY index of every recordable demo scene (spec
// docs/superpowers/specs/2026-07-14-demo-scenes-design.md). Same gating
// idiom as the sibling /motion-lab route: SF_MOTION_LAB=1 strict-"1"
// (reused from motion-lab/gate.ts, not duplicated) -> 404s in prod unless
// the flag is explicitly on; noindex/nofollow even when reachable.

import "@/components/landing/landing-theme.css";
import "@/components/motion/motion-tokens.css";

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { isMotionLabOn } from "../motion-lab/gate";
import { DEMO_SCENES } from "@/components/demo-scenes/registry";

export const metadata: Metadata = {
  title: "Demo scenes (dev only)",
  robots: { index: false, follow: false },
};

export default function DemoScenesIndexPage() {
  if (!isMotionLabOn({ SF_MOTION_LAB: process.env.SF_MOTION_LAB })) notFound();

  return (
    <div
      className="lp-root"
      style={{
        minHeight: "100vh",
        background: "var(--lp-bg)",
        color: "var(--lp-ink)",
        padding: 32,
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Demo scenes (dev only)</h1>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--lp-body)" }}>
          Full-viewport, loopable, brand-tokened scenes for product video B-roll.
          Not indexed, not linked from marketing.
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        {DEMO_SCENES.map((scene) => (
          <Link
            key={scene.id}
            href={`/demo-scenes/${scene.id}`}
            style={{
              display: "block",
              padding: 16,
              borderRadius: 12,
              border: "1px solid var(--lp-border, rgba(34,29,23,.14))",
              background: "var(--lp-card)",
              color: "var(--lp-ink)",
              textDecoration: "none",
            }}
          >
            <h2 style={{ margin: 0, fontSize: 16 }}>{scene.title}</h2>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--lp-body)" }}>
              {scene.blurb}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
