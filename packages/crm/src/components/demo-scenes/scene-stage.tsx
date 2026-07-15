"use client";

// packages/crm/src/components/demo-scenes/scene-stage.tsx
//
// Full-viewport stage host for one demo scene (spec "Route design"). Reused
// by app/(dev)/demo-scenes/[scene]/page.tsx. 100svh, token background via
// .lp-root (the same landing-theme.css tokens motion-lab reuses), a small
// bottom-right control cluster (Restart · Loop · Light/Dark) that fades to
// opacity 0 after 3s idle so it never leaks into a recording.
//
//  - Restart: bumps a `key` on the scene wrapper, remounting the scene so
//    every internal phase machine / AnimatedList / etc. replays from zero.
//  - Loop: persisted in the `?loop=1` query param (via router.replace, no
//    scroll reset) so a recording session can deep-link a looping scene.
//    Passed down to the scene component as a prop so scenes that only
//    replay when instructed (e.g. counters) can honor it; scenes that loop
//    unconditionally by construction (AnimatedList, Terminal) ignore it.
//  - Light/Dark: toggles data-mode="record" on the .lp-root wrapper, the
//    same dark-flip idiom the landing + motion-lab use.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { getSceneComponent } from "./scene-components";
import type { DemoSceneMeta } from "./registry";

const IDLE_HIDE_MS = 3000;

export function SceneStage({ scene }: { scene: DemoSceneMeta }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const loop = searchParams.get("loop") === "1";

  const [restartKey, setRestartKey] = useState(0);
  const [dark, setDark] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetIdleTimer = useCallback(() => {
    setControlsVisible(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setControlsVisible(false), IDLE_HIDE_MS);
  }, []);

  useEffect(() => {
    resetIdleTimer();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [resetIdleTimer]);

  const toggleLoop = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    if (loop) next.delete("loop");
    else next.set("loop", "1");
    const query = next.toString();
    router.replace(query ? `?${query}` : "?", { scroll: false });
  }, [loop, router, searchParams]);

  const Component = getSceneComponent(scene.id);

  return (
    <div
      className="lp-root"
      data-mode={dark ? "record" : undefined}
      onMouseMove={resetIdleTimer}
      style={{
        position: "relative",
        width: "100%",
        height: "100svh",
        background: "var(--lp-bg)",
        color: "var(--lp-ink)",
        overflow: "hidden",
      }}
    >
      <div
        key={restartKey}
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {Component ? <Component key={loop ? "loop" : "once"} /> : null}
      </div>

      <div
        style={{
          position: "absolute",
          right: 16,
          bottom: 16,
          display: "flex",
          gap: 8,
          padding: "8px 10px",
          borderRadius: 10,
          background: "var(--lp-card)",
          border: "1px solid var(--lp-border, rgba(34,29,23,.14))",
          opacity: controlsVisible ? 1 : 0,
          transition: "opacity 240ms ease",
          pointerEvents: controlsVisible ? "auto" : "none",
        }}
      >
        <button
          type="button"
          onClick={() => setRestartKey((n) => n + 1)}
          style={controlButtonStyle}
        >
          Restart
        </button>
        <button type="button" onClick={toggleLoop} style={controlButtonStyle}>
          Loop {loop ? "on" : "off"}
        </button>
        <button type="button" onClick={() => setDark((d) => !d)} style={controlButtonStyle}>
          {dark ? "Dark" : "Light"}
        </button>
      </div>
    </div>
  );
}

const controlButtonStyle: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--lp-border, rgba(34,29,23,.14))",
  background: "transparent",
  color: "var(--lp-ink)",
  cursor: "pointer",
};
