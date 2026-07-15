"use client";

// packages/crm/src/components/demo-scenes/booking-cascade.tsx
//
// Scene 1 (spec): the money-loop B-roll — a staggered stack of product-toast
// cards showing the automation cascade a real booking triggers. Built on the
// existing AnimatedList (components/ui/animated-list.tsx), which has no
// internal reduced-motion guard (per the motion-lab comment on
// AnimatedListDemo) — so this scene owns its own reduced-motion branch that
// renders every card statically, and owns its own loop (AnimatedList itself
// only plays forward once; the loop is a hold-then-remount cycle here).

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

import { AnimatedList } from "@/components/ui/animated-list";

interface CascadeItem {
  id: string;
  icon?: string;
  emoji?: string;
  text: string;
}

const ITEMS: CascadeItem[] = [
  {
    id: "booking",
    icon: "/brand/integrations/google-calendar.svg",
    text: "New booking — Sarah M · Tue 2:30 PM",
  },
  {
    id: "sms",
    icon: "/brand/integrations/twilio.svg",
    text: "SMS confirmation sent to Sarah",
  },
  {
    id: "crm",
    icon: "/brand/seldon-mark.svg",
    text: "Contact added to CRM",
  },
  {
    id: "review",
    emoji: "⭐",
    text: "Review request queued for Wednesday",
  },
];

const STAGGER_MS = 1200;
const HOLD_MS = 1500;
const FADE_MS = 400;

function CascadeCard({ item }: { item: CascadeItem }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "min(88vw, 460px)",
        padding: "14px 18px",
        borderRadius: 14,
        background: "var(--lp-card)",
        border: "1px solid var(--lp-border, rgba(34,29,23,.12))",
        boxShadow: "0 12px 32px rgba(20,17,13,.12)",
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          borderRadius: 9,
          background: "var(--lp-bg-alt, rgba(34,29,23,.06))",
          flexShrink: 0,
          fontSize: 16,
        }}
      >
        {item.icon ? (
          // eslint-disable-next-line @next/next/no-img-element -- static vendored brand icon
          <img src={item.icon} alt="" width={18} height={18} />
        ) : (
          item.emoji
        )}
      </span>
      <span style={{ fontSize: "clamp(14px, 1.4vw, 18px)", color: "var(--lp-ink)" }}>
        {item.text}
      </span>
    </div>
  );
}

export function BookingCascadeScene({ loop = true }: { loop?: boolean }) {
  const reducedMotion = Boolean(useReducedMotion());
  const [cycle, setCycle] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (reducedMotion || !loop) return undefined;
    const totalMs = STAGGER_MS * ITEMS.length + HOLD_MS;
    const hideTimer = setTimeout(() => setVisible(false), totalMs);
    const resetTimer = setTimeout(() => {
      setCycle((c) => c + 1);
      setVisible(true);
    }, totalMs + FADE_MS);
    return () => {
      clearTimeout(hideTimer);
      clearTimeout(resetTimer);
    };
  }, [cycle, reducedMotion, loop]);

  if (reducedMotion) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        {ITEMS.map((item) => (
          <CascadeCard key={item.id} item={item} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ opacity: visible ? 1 : 0, transition: `opacity ${FADE_MS}ms ease` }}>
      <AnimatedList key={cycle} delay={STAGGER_MS} className="w-full">
        {ITEMS.map((item) => (
          <CascadeCard key={item.id} item={item} />
        ))}
      </AnimatedList>
    </div>
  );
}
