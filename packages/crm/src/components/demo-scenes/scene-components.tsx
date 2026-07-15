"use client";

// packages/crm/src/components/demo-scenes/scene-components.tsx
//
// Client-side component map, keyed by the same ids as registry.ts's
// DEMO_SCENES. Split out from the registry so registry.ts stays importable
// under node:test (no framer-motion / "use client" island in that module
// graph). registry.spec.ts asserts this map's key set is EXACTLY the
// registry's id set — no orphan scenes, no unregistered components.

import type { ComponentType } from "react";

import { DEMO_SCENES } from "./registry";
import { StatPayoffScene } from "./stat-payoff";
import { BookingCascadeScene } from "./booking-cascade";
import { CalendarConnectedScene } from "./calendar-connected";

// Every scene component accepts the same `loop` prop — whether it re-plays
// once it reaches its resting frame, or holds there (see scene-stage.tsx's
// ?loop=1 control).
export type DemoSceneComponent = ComponentType<{ loop?: boolean }>;

export const SCENE_COMPONENTS: Record<string, DemoSceneComponent> = {
  "booking-cascade": BookingCascadeScene,
  "calendar-connected": CalendarConnectedScene,
  "stat-payoff": StatPayoffScene,
};

export function getSceneComponent(id: string): DemoSceneComponent | null {
  return SCENE_COMPONENTS[id] ?? null;
}

// Dev-time invariant (not a test — those live in registry.spec.ts): every
// registry id must resolve to a component and vice versa.
if (process.env.NODE_ENV !== "production") {
  const registryIds = new Set(DEMO_SCENES.map((scene) => scene.id));
  const mapIds = new Set(Object.keys(SCENE_COMPONENTS));
  for (const id of registryIds) {
    if (!mapIds.has(id)) {
      // eslint-disable-next-line no-console -- dev-only sanity guard
      console.warn(`[demo-scenes] registry id "${id}" has no component in SCENE_COMPONENTS`);
    }
  }
}
