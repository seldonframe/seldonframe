"use client";

// packages/crm/src/components/demo-scenes/sms-phone.tsx
//
// Scene 5 (spec): a pure-CSS phone frame (rounded slab, notch, status bar —
// no new dependency, ~60 LOC of divs) with an iMessage-style bubble sliding
// in, plus a subtle haptic-style shake on arrival. No framer-motion needed
// for the frame itself; the bubble entrance + shake are plain CSS
// @keyframes gated by prefers-reduced-motion (same idiom motion-tokens.css
// uses: the reduced-motion media query zeroes durations, it doesn't try to
// remove the animation property).

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

const MESSAGE =
  "You're booked for Tue 2:30 PM with Zen Flow Hydration — reply R to reschedule.";

const CYCLE_MS = 4500;

export function SmsPhoneScene({ loop = true }: { loop?: boolean }) {
  const reducedMotion = Boolean(useReducedMotion());
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (reducedMotion || !loop) return undefined;
    const timer = setInterval(() => setCycle((c) => c + 1), CYCLE_MS);
    return () => clearInterval(timer);
  }, [reducedMotion, loop]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <style>{`
        @keyframes demo-scene-sms-slide-in {
          0% { opacity: 0; transform: translateY(16px) scale(.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes demo-scene-sms-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-3px); }
          40% { transform: translateX(3px); }
          60% { transform: translateX(-2px); }
          80% { transform: translateX(2px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .demo-scene-sms-bubble { animation: none !important; opacity: 1 !important; transform: none !important; }
        }
      `}</style>

      {/* Phone slab — flex column so the screen body gets exactly the space
          below the status bar; a plain height:100% here overflowed the slab
          by the status-bar height and clipped the bubble's last line. */}
      <div
        style={{
          width: 300,
          height: 620,
          borderRadius: 44,
          background: "#14110D",
          border: "10px solid #14110D",
          boxShadow: "0 24px 60px rgba(0,0,0,.35)",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Notch */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: 130,
            height: 26,
            borderBottomLeftRadius: 16,
            borderBottomRightRadius: 16,
            background: "#14110D",
            zIndex: 2,
          }}
        />
        {/* Status bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "14px 22px 4px",
            fontSize: 13,
            fontWeight: 600,
            color: "#F6F2EA",
          }}
        >
          <span>9:41</span>
          <span>📶 🔋</span>
        </div>

        {/* Screen body — flex:1 fills the slab below the status bar exactly */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            background: "#221D17",
            padding: "20px 16px 40px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
          }}
        >
          {/* Sender header — reads like a real Messages thread on camera */}
          <div
            style={{
              position: "absolute",
              top: 52,
              left: 0,
              right: 0,
              textAlign: "center",
              fontSize: 12.5,
              letterSpacing: "0.02em",
              color: "rgba(246,242,234,.55)",
            }}
          >
            Zen Flow Hydration
          </div>
          <div
            key={cycle}
            className="demo-scene-sms-bubble"
            style={{
              maxWidth: "84%",
              padding: "12px 16px",
              borderRadius: 20,
              borderBottomLeftRadius: 6,
              background: "#3A3A3C",
              color: "#F6F2EA",
              fontSize: 15,
              lineHeight: 1.4,
              animation: reducedMotion
                ? "none"
                : "demo-scene-sms-slide-in 500ms ease-out both, demo-scene-sms-shake 400ms ease-in-out 520ms 1",
            }}
          >
            {MESSAGE}
          </div>
        </div>
      </div>
    </div>
  );
}
