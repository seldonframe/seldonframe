"use client";

import { useSprite } from "./sprite";
import { clamp, Easing } from "./easing";

// ── Phase 5: Activation ───────────────────────────────────────────────────────
// Two-pane view: data rows growing into a CRM-style table on the left,
// integration tiles pulsing/wiring up on the right.

type StatusKind = "lead" | "active" | "paying";

function StatusPill({ kind }: { kind: StatusKind }) {
  const map: Record<StatusKind, { bg: string; c: string; label: string }> = {
    lead:   { bg: "rgba(255,255,255,0.06)", c: "rgba(246,244,239,0.7)",  label: "lead" },
    active: { bg: "rgba(16,185,129,0.14)", c: "rgba(167,243,208,0.95)", label: "active" },
    paying: { bg: "rgba(16,185,129,0.26)", c: "#a7f3d0",                label: "paying" },
  };
  const s = map[kind];
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 999,
      background: s.bg,
      color: s.c,
      fontSize: 10,
      fontWeight: 500,
      letterSpacing: "0.02em",
    }}>
      {s.label}
    </span>
  );
}

export function BuildPhase5Activation() {
  const { localTime } = useSprite();
  const t = localTime;

  const customers: Array<{ name: string; phone: string; status: StatusKind }> = [
    { name: "Diane Chen",        phone: "555·0114", status: "lead" },
    { name: "Marcus Velez",      phone: "555·2287", status: "active" },
    { name: "Hartmann Family",   phone: "555·9101", status: "active" },
    { name: "Atlas Roofing Co.", phone: "555·4456", status: "lead" },
    { name: "Pemberton, LLC",    phone: "555·7733", status: "paying" },
    { name: "Riley Okafor",      phone: "555·3009", status: "lead" },
    { name: "Brentwood HOA",     phone: "555·6612", status: "paying" },
  ];

  const integrations = [
    { name: "Stripe",     sub: "payments",   c: "#635BFF" },
    { name: "Gmail",      sub: "email",      c: "#EA4335" },
    { name: "Twilio",     sub: "sms",        c: "#F22F46" },
    { name: "Google Cal", sub: "calendar",   c: "#4285F4" },
    { name: "QuickBooks", sub: "accounting", c: "#2CA01C" },
  ];

  return (
    <div style={{ position: "absolute", inset: 0, padding: "24px 28px", display: "flex", gap: 18 }}>
      {/* Left pane — data */}
      <div style={{ flex: 1.3, display: "flex", flexDirection: "column" }}>
        <div style={{
          fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
          fontSize: 10,
          color: "rgba(16,185,129,0.85)",
          letterSpacing: "0.18em",
          marginBottom: 10,
        }}>
          ◢ SEEDING DATA · {String(Math.min(customers.length, Math.floor((t - 0.3) / 0.55) + 1)).padStart(2, "0")}/{customers.length}
        </div>

        {/* Header row */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 70px 60px",
          gap: 10,
          padding: "8px 12px",
          fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
          fontSize: 9,
          color: "rgba(246,244,239,0.4)",
          letterSpacing: "0.12em",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          <div>NAME</div>
          <div>PHONE</div>
          <div>STATUS</div>
        </div>

        {/* Rows */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          {customers.map((c, i) => {
            const appear = 0.3 + i * 0.55;
            const p = clamp((t - appear) / 0.5, 0, 1);
            const eased = Easing.easeOutCubic(p);
            return (
              <div key={i} style={{
                display: "grid",
                gridTemplateColumns: "1fr 70px 60px",
                gap: 10,
                padding: "9px 12px",
                fontFamily: "var(--font-geist-sans), Inter, system-ui, sans-serif",
                fontSize: 12,
                color: "rgba(246,244,239,0.85)",
                letterSpacing: "-0.005em",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                opacity: p,
                transform: `translateX(${(1 - eased) * -10}px)`,
                position: "relative",
              }}>
                {/* Growing-bar background to suggest "row inserting" */}
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(90deg, rgba(16,185,129,0.10), transparent 60%)",
                  opacity: p < 1 ? (1 - p) * 0.8 : 0,
                  pointerEvents: "none",
                }} />
                <div style={{ position: "relative" }}>{c.name}</div>
                <div style={{
                  position: "relative",
                  fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
                  fontSize: 11,
                  color: "rgba(246,244,239,0.55)",
                }}>{c.phone}</div>
                <div style={{ position: "relative" }}>
                  <StatusPill kind={c.status} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Counters */}
        <div style={{
          marginTop: "auto",
          display: "flex",
          gap: 18,
          paddingTop: 16,
          fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
        }}>
          {[
            { v: Math.floor(clamp((t - 2) / 7, 0, 1) * 24), label: "CUSTOMERS" },
            { v: Math.floor(clamp((t - 3) / 6, 0, 1) * 18), label: "JOBS" },
            { v: Math.floor(clamp((t - 4) / 5, 0, 1) * 7),  label: "PROPOSALS" },
          ].map((s, i) => (
            <div key={i}>
              <div style={{
                fontSize: 18,
                fontWeight: 500,
                color: "#10b981",
                fontVariantNumeric: "tabular-nums",
              }}>{String(s.v).padStart(2, "0")}</div>
              <div style={{
                fontSize: 9,
                color: "rgba(246,244,239,0.4)",
                letterSpacing: "0.18em",
                marginTop: 2,
              }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right pane — integrations */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{
          fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
          fontSize: 10,
          color: "rgba(255,255,255,0.45)",
          letterSpacing: "0.18em",
          marginBottom: 4,
        }}>
          INTEGRATIONS
        </div>
        {integrations.map((it, i) => {
          const appear = 1.0 + i * 0.55;
          const p = clamp((t - appear) / 0.6, 0, 1);
          const connected = t > appear + 1.0;
          const eased = Easing.easeOutCubic(p);
          const pulseT = Math.max(0, t - (appear + 1.0));
          const pulse = pulseT < 0.6 ? Math.sin(pulseT * Math.PI / 0.6) : 0;
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 10px",
              border: connected
                ? "1px solid rgba(16,185,129,0.35)"
                : "1px solid rgba(255,255,255,0.07)",
              background: connected
                ? `rgba(16,185,129,${0.04 + pulse * 0.10})`
                : "rgba(255,255,255,0.02)",
              borderRadius: 6,
              opacity: p,
              transform: `translateX(${(1 - eased) * 14}px)`,
              transition: "background 240ms ease, border-color 240ms ease",
            }}>
              {/* Logo placeholder — colored dot */}
              <div style={{
                width: 22, height: 22,
                borderRadius: 4,
                background: it.c,
                position: "relative",
              }}>
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(135deg, rgba(255,255,255,0.3), transparent 60%)",
                  borderRadius: 4,
                }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: "var(--font-geist-sans), Inter, system-ui, sans-serif",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "#f6f4ef",
                  letterSpacing: "-0.005em",
                }}>{it.name}</div>
                <div style={{
                  fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
                  fontSize: 9,
                  color: "rgba(246,244,239,0.4)",
                  letterSpacing: "0.12em",
                }}>{it.sub}</div>
              </div>
              <div style={{
                fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
                fontSize: 9,
                color: connected ? "#10b981" : "rgba(246,244,239,0.3)",
                letterSpacing: "0.12em",
              }}>
                {connected ? "● LINK" : "○ ..."}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
