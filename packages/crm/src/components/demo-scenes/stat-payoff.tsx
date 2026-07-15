"use client";

// packages/crm/src/components/demo-scenes/stat-payoff.tsx
//
// Scene 4 (spec): one row, four counted wins, "one booked job pays for it"
// as the anchor line. This is the trivial first cut that ships with the
// route in Task 1 — just enough real content to prove /demo-scenes/[scene]
// works end to end. Task 2 upgrades this file to the full NumberTicker +
// AnimatedShinyText treatment.

export function StatPayoffScene() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        textAlign: "center",
      }}
    >
      <h1 style={{ margin: 0, fontSize: "clamp(28px, 4vw, 48px)", color: "var(--lp-ink)" }}>
        1 URL → 1 website · 1 AI chatbot · 1 CRM · 1 booking page
      </h1>
      <p style={{ margin: 0, fontSize: "clamp(16px, 2vw, 22px)", color: "var(--lp-body)" }}>
        one booked job pays for it
      </p>
    </div>
  );
}
