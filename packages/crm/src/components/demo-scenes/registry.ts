// packages/crm/src/components/demo-scenes/registry.ts
//
// Static metadata for every demo scene (spec "The seven scenes"). This file
// stays server-safe (no "use client", no framer-motion import) so both the
// index page (server component) and the registry spec (node:test, no DOM)
// can import it directly. Component lookup — which DOES need "use client"
// because the scenes are framer-motion islands — lives in the sibling
// scene-components.tsx map, keyed by the same ids.
//
// Registry grows scene-by-scene across the build tasks; the "component map
// covers exactly the registry ids" invariant (registry.spec.ts) keeps the
// two files honest at every commit, not just the final one.

export interface DemoSceneMeta {
  id: string;
  title: string;
  blurb: string;
}

export const DEMO_SCENES: DemoSceneMeta[] = [
  {
    id: "booking-cascade",
    title: "Booking cascade",
    blurb: "The money-loop B-roll: booking → SMS → CRM → review, staggered.",
  },
  {
    id: "calendar-connected",
    title: "Calendar connected",
    blurb: "Seldon and Google Calendar joined by a beam, then a booking synced.",
  },
  {
    id: "stat-payoff",
    title: "Stat payoff",
    blurb: "One URL, four counted wins, and the pricing anchor line.",
  },
  {
    id: "grounded-chat",
    title: "Grounded chat",
    blurb: "A grounded reply and a real booking confirmation, played back.",
  },
  {
    id: "sms-phone",
    title: "SMS phone",
    blurb: "A booking-confirmation text arriving on a CSS-only phone frame.",
  },
  {
    id: "live-confetti",
    title: "Live confetti",
    blurb: "The workspace-is-live headline with a confetti burst.",
  },
  {
    id: "docker-terminal",
    title: "Docker terminal",
    blurb: "docker compose up -d, staggered to SeldonFrame running locally.",
  },
];

export function getDemoScene(id: string): DemoSceneMeta | null {
  return DEMO_SCENES.find((scene) => scene.id === id) ?? null;
}
