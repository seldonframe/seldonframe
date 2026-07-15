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
    id: "stat-payoff",
    title: "Stat payoff",
    blurb: "One URL, four counted wins, and the pricing anchor line.",
  },
];

export function getDemoScene(id: string): DemoSceneMeta | null {
  return DEMO_SCENES.find((scene) => scene.id === id) ?? null;
}
