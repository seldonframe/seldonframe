"use client";

import { useSprite } from "./sprite";
import { clamp, Easing } from "./easing";

// ── Phase 3: Structure ────────────────────────────────────────────────────────
// 5 nodes appear in a deliberate radial arrangement, then connection lines
// stroke-draw between them. Each node has a tiny entity label.

type NodeDef = {
  id: string;
  label: string;
  sub: string;
  x: number;
  y: number;
  size: "lg" | "md";
  appear: number;
};

type EdgeDef = {
  from: string;
  to: string;
  start: number;
  dashed?: boolean;
};

export function BuildPhase3Structure() {
  const { localTime } = useSprite();
  const t = localTime;

  const cx = 304, cy = 270;
  const r = 175;

  const nodes: NodeDef[] = [
    { id: "core",  label: "Workspace",     sub: "core",             x: cx,                    y: cy,        size: "lg", appear: 0.4 },
    { id: "cust",  label: "Customers",     sub: "people · jobs",    x: cx - r,                y: cy - 30,   size: "md", appear: 1.4 },
    { id: "book",  label: "Bookings",      sub: "calendar · slots", x: cx + r * 0.95,         y: cy - 60,   size: "md", appear: 1.8 },
    { id: "conv",  label: "Conversations", sub: "sms · email",      x: cx - r * 0.8,          y: cy + 130,  size: "md", appear: 2.2 },
    { id: "forms", label: "Intake Forms",  sub: "leads · quotes",   x: cx + r * 0.85,         y: cy + 140,  size: "md", appear: 2.6 },
  ];

  const edges: EdgeDef[] = [
    { from: "core",  to: "cust",  start: 3.0 },
    { from: "core",  to: "book",  start: 3.4 },
    { from: "core",  to: "conv",  start: 3.8 },
    { from: "core",  to: "forms", start: 4.2 },
    // secondary — sub-relationships
    { from: "cust",  to: "book",  start: 5.0, dashed: true },
    { from: "cust",  to: "conv",  start: 5.4, dashed: true },
    { from: "forms", to: "cust",  start: 5.8, dashed: true },
    { from: "book",  to: "conv",  start: 6.2, dashed: true },
  ];

  const findNode = (id: string): NodeDef =>
    nodes.find((n) => n.id === id)!;

  const countProgress = clamp((t - 7) / 2.4, 0, 1);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <svg
        width="608" height="520"
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
      >
        <defs>
          <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(16,185,129,0.35)" />
            <stop offset="100%" stopColor="rgba(16,185,129,0)" />
          </radialGradient>
        </defs>

        {/* Edges */}
        {edges.map((e, i) => {
          const a = findNode(e.from), b = findNode(e.to);
          const p = clamp((t - e.start) / 0.7, 0, 1);
          const eased = Easing.easeInOutCubic(p);
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const bow = e.dashed ? 18 : 8;
          const nx = -dy / dist * bow, ny = dx / dist * bow;
          const path = `M ${a.x} ${a.y} Q ${mx + nx} ${my + ny} ${b.x} ${b.y}`;
          return (
            <path key={i}
              d={path}
              fill="none"
              stroke={e.dashed ? "rgba(16,185,129,0.35)" : "rgba(16,185,129,0.75)"}
              strokeWidth={e.dashed ? 1 : 1.5}
              pathLength="1"
              style={{
                strokeDasharray: e.dashed ? "3 4" : "1 1",
                strokeDashoffset: e.dashed ? (1 - eased) * 7 : 1 - eased,
                opacity: p,
              }}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((n) => {
          const p = clamp((t - n.appear) / 0.7, 0, 1);
          const eased = Easing.easeOutCubic(p);
          const isLg = n.size === "lg";
          const radius = isLg ? 34 : 24;
          return (
            <g key={n.id} style={{
              opacity: p,
              transform: `translate(0, ${(1 - eased) * 6}px)`,
              transformOrigin: "center",
            }}>
              <circle cx={n.x} cy={n.y} r={radius * 2} fill="url(#nodeGlow)" opacity={isLg ? 0.6 : 0.4} />
              <circle
                cx={n.x} cy={n.y} r={radius}
                fill="rgba(6,16,13,0.95)"
                stroke={isLg ? "#10b981" : "rgba(16,185,129,0.7)"}
                strokeWidth={isLg ? 1.5 : 1}
              />
              <circle cx={n.x} cy={n.y} r={isLg ? 4 : 3} fill="#10b981" />
              <text
                x={n.x}
                y={n.y + radius + 18}
                textAnchor="middle"
                fill="rgba(246,244,239,0.92)"
                fontFamily="var(--font-geist-sans), Inter, system-ui, sans-serif"
                fontSize={isLg ? 14 : 12}
                fontWeight="600"
                letterSpacing="-0.01em"
              >
                {n.label}
              </text>
              <text
                x={n.x}
                y={n.y + radius + 33}
                textAnchor="middle"
                fill="rgba(246,244,239,0.4)"
                fontFamily="var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace"
                fontSize="9"
                letterSpacing="0.06em"
              >
                {n.sub}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Stats footer */}
      <div style={{
        position: "absolute",
        bottom: 18, left: 40, right: 40,
        display: "flex",
        justifyContent: "space-between",
        opacity: countProgress,
        transform: `translateY(${(1 - countProgress) * 6}px)`,
      }}>
        {[
          { v: 5,  label: "ENTITIES" },
          { v: 12, label: "RELATIONS" },
          { v: 47, label: "FIELDS" },
          { v: 4,  label: "AGENTS" },
        ].map((s, i) => (
          <div key={i}>
            <div style={{
              fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
              fontSize: 22,
              fontWeight: 500,
              color: "#10b981",
              letterSpacing: "-0.02em",
              fontVariantNumeric: "tabular-nums",
            }}>
              {String(Math.floor(s.v * countProgress)).padStart(2, "0")}
            </div>
            <div style={{
              fontFamily: "var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace",
              fontSize: 9,
              color: "rgba(246,244,239,0.4)",
              letterSpacing: "0.18em",
              marginTop: 2,
            }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
