"use client"

// packages/crm/src/app/(dev)/motion-lab/motion-lab-client.tsx
//
// The dev-only motion gallery island. Renders every vendored motion
// component (Task 2-6) plus the pre-existing BorderBeam/AnimatedList in a
// labelled card: name, its one-line comprehension purpose (spec §5's
// concept column), and the component live. Two gallery-level toggles drive
// every card at once:
//  - reduced motion -> forceStatic on every component that supports it
//  - light / dark(record) -> wraps the gallery in .lp-root, toggling
//    data-mode="record" so the --lp-* tokens flip the same way the real
//    landing does.
//
// This is a review surface, not a design system — cards are plain, unstyled
// containers so the motion itself is what's being judged (spec §7 "Motion
// review (Max, blocking)").

import { useRef, useState } from "react"

import { AnimatedBeam } from "@/components/ui/magic/animated-beam"
import { OrbitingCircles } from "@/components/ui/magic/orbiting-circles"
import { Terminal, TypingAnimation, AnimatedSpan } from "@/components/ui/magic/terminal"
import { BentoGrid, BentoCard } from "@/components/ui/magic/bento-grid"
import { AvatarCircles } from "@/components/ui/magic/avatar-circles"
import { BorderBeam } from "@/components/ui/border-beam"
import { AnimatedList } from "@/components/ui/animated-list"

function LabCard({
  name,
  purpose,
  children,
}: {
  name: string
  purpose: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        border: "1px solid var(--lp-border, #e5e5e5)",
        borderRadius: 12,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        background: "var(--lp-card, transparent)",
      }}
    >
      <h2 style={{ margin: 0, fontSize: 16, color: "var(--lp-ink, inherit)" }}>{name}</h2>
      <p style={{ margin: 0, fontSize: 13, color: "var(--lp-body, #666)" }}>{purpose}</p>
      <div
        style={{
          position: "relative",
          minHeight: 220,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  )
}

function AnimatedBeamDemo({ forceStatic }: { forceStatic: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fromRef = useRef<HTMLDivElement>(null)
  const toRef = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: 260,
        height: 120,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div
        ref={fromRef}
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: "1px solid var(--lp-border, #ccc)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          background: "var(--lp-card, #fff)",
        }}
      >
        Seldon
      </div>
      <div
        ref={toRef}
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: "1px solid var(--lp-border, #ccc)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          background: "var(--lp-card, #fff)",
        }}
      >
        Tool
      </div>
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={fromRef}
        toRef={toRef}
        forceStatic={forceStatic}
      />
    </div>
  )
}

const ORBIT_ITEMS = ["voice", "chat", "sms", "email", "dm", "mcp"]

function OrbitingCirclesDemo({ forceStatic }: { forceStatic: boolean }) {
  return (
    <div style={{ position: "relative", width: 260, height: 220 }}>
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        agent
      </div>
      <OrbitingCircles radius={80} iconSize={36} forceStatic={forceStatic}>
        {ORBIT_ITEMS.map((label) => (
          <div
            key={label}
            style={{
              fontSize: 9,
              border: "1px solid var(--lp-border, #ccc)",
              borderRadius: "50%",
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--lp-card, #fff)",
            }}
          >
            {label}
          </div>
        ))}
      </OrbitingCircles>
    </div>
  )
}

function TerminalDemo({ forceStatic }: { forceStatic: boolean }) {
  return (
    <Terminal>
      <TypingAnimation forceStatic={forceStatic}>$ npx -y @seldonframe/mcp</TypingAnimation>
      <AnimatedSpan forceStatic={forceStatic} delay={600}>
        connected — workspace live on yourslug.app.seldonframe.com
      </AnimatedSpan>
    </Terminal>
  )
}

function BentoGridDemo({ forceStatic }: { forceStatic: boolean }) {
  return (
    <BentoGrid className="w-full" style={{ gridAutoRows: "6rem" }}>
      {["CRM", "Booking", "Intake", "Portal", "Landing", "Reviews"].map((name) => (
        <BentoCard
          key={name}
          name={name}
          description="one system"
          className="col-span-1"
          forceStatic={forceStatic}
        />
      ))}
    </BentoGrid>
  )
}

function AvatarCirclesDemo() {
  return (
    <AvatarCircles
      numPeople={12}
      avatarUrls={[
        { imageUrl: "https://i.pravatar.cc/40?img=1", profileUrl: "#" },
        { imageUrl: "https://i.pravatar.cc/40?img=2", profileUrl: "#" },
        { imageUrl: "https://i.pravatar.cc/40?img=3", profileUrl: "#" },
      ]}
    />
  )
}

function BorderBeamDemo({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div
      style={{
        position: "relative",
        width: 160,
        height: 60,
        borderRadius: 10,
        border: "1px solid var(--lp-border, #ccc)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
      }}
    >
      building…
      {/* BorderBeam has no internal reduced-motion guard — this lab must
          faithfully show what a reduced-motion user sees, so we skip
          mounting it entirely (static box, no beam) instead of animating
          regardless of the toggle. */}
      {!reducedMotion && <BorderBeam size={40} />}
    </div>
  )
}

function AnimatedListDemo({ reducedMotion }: { reducedMotion: boolean }) {
  const items = ["New contact", "Booking confirmed", "Deal moved to Won"]
  const itemStyle: React.CSSProperties = {
    border: "1px solid var(--lp-border, #ccc)",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 12,
  }

  // AnimatedList has no internal reduced-motion guard — when the lab's
  // toggle is on, render the items statically (no staggered reveal)
  // instead of letting them animate regardless of the toggle.
  if (reducedMotion) {
    return (
      <div className="w-full" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((label) => (
          <div key={label} style={itemStyle}>
            {label}
          </div>
        ))}
      </div>
    )
  }

  return (
    <AnimatedList delay={800} className="w-full">
      {items.map((label) => (
        <div key={label} style={itemStyle}>
          {label}
        </div>
      ))}
    </AnimatedList>
  )
}

export function MotionLabClient() {
  const [reducedMotion, setReducedMotion] = useState(false)
  const [dark, setDark] = useState(false)

  return (
    <div className="lp-root" data-mode={dark ? "record" : undefined}>
      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 24,
          background: "var(--lp-bg, transparent)",
          color: "var(--lp-ink, inherit)",
          minHeight: "100vh",
        }}
      >
        <header style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Motion lab (dev only)</h1>
          <p style={{ margin: 0, fontSize: 13, color: "var(--lp-body, #666)" }}>
            Every vendored motion component, live. Not indexed, not linked from marketing.
          </p>
          <div style={{ display: "flex", gap: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={(event) => setReducedMotion(event.target.checked)}
              />
              Reduced motion
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={dark}
                onChange={(event) => setDark(event.target.checked)}
              />
              Dark (record mode)
            </label>
          </div>
        </header>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          <LabCard
            name="AnimatedBeam"
            purpose={
              '"Seldon is the source of truth that pushes outward" — Seldon core → client tools, the no-Zapier claim.'
            }
          >
            <AnimatedBeamDemo forceStatic={reducedMotion} />
          </LabCard>

          <LabCard
            name="OrbitingCircles"
            purpose="The agent's surfaces (voice · chat · sms · email · dm · mcp) orbiting one agent core."
          >
            <OrbitingCirclesDemo forceStatic={reducedMotion} />
          </LabCard>

          <LabCard
            name="Terminal / TypingAnimation / AnimatedSpan"
            purpose="The IDE/MCP on-ramp — animated typing of the connect command."
          >
            <TerminalDemo forceStatic={reducedMotion} />
          </LabCard>

          <LabCard
            name="BentoGrid / BentoCard"
            purpose='The all-in-one front office (CRM · booking · intake · portal · landing · reviews) — a layout that is "one system."'
          >
            <BentoGridDemo forceStatic={reducedMotion} />
          </LabCard>

          <LabCard name="AvatarCircles" purpose="Social-proof scale.">
            <AvatarCirclesDemo />
          </LabCard>

          <LabCard
            name="BorderBeam (existing)"
            purpose='"Live / building right now" active-state accent.'
          >
            <BorderBeamDemo reducedMotion={reducedMotion} />
          </LabCard>

          <LabCard
            name="AnimatedList (existing)"
            purpose="Sequential reveal of live activity — new contacts, bookings, deals moving stages."
          >
            <AnimatedListDemo reducedMotion={reducedMotion} />
          </LabCard>
        </div>
      </div>
    </div>
  )
}
