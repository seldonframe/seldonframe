// Typed SVG diagram primitives for /guides articles — a small illustration
// language (flow/loop/compare/bars/stack) rendered as server components with
// tasteful, pure-CSS animation (no client JS). Uses the MKT marketing tokens
// so diagrams sit visually inside the existing guide-page.tsx template.
//
// Animation is injected once via a static <style> tag (same pattern as
// MarketplaceStyles) — the CSS string is hand-authored, never user content,
// so dangerouslySetInnerHTML here is safe. Every animation is wrapped in
// prefers-reduced-motion so motion is always optional.

import type { ReactElement } from "react";
import { MKT } from "@/components/marketplace/marketplace-data";
import type { GuideDiagram, GuideDiagramItem } from "@/lib/seo/guides/types";

const DIAGRAM_CSS = `
  .sf-gd-flow-arrow path{stroke-dasharray:24;stroke-dashoffset:24;animation:sfGdDraw 1s ease forwards}
  .sf-gd-loop-arrow path{stroke-dasharray:120;stroke-dashoffset:120;animation:sfGdDraw 1.4s ease forwards}
  .sf-gd-bar-fill{animation:sfGdGrow .8s cubic-bezier(0.22,1,0.36,1) both}
  .sf-gd-loop-pulse{animation:sfGdPulse 2.4s ease-in-out infinite}
  @keyframes sfGdDraw{to{stroke-dashoffset:0}}
  @keyframes sfGdGrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
  @keyframes sfGdPulse{0%,100%{opacity:0.55}50%{opacity:1}}
  @media (prefers-reduced-motion: reduce){
    .sf-gd-flow-arrow path,.sf-gd-loop-arrow path{animation:none;stroke-dashoffset:0}
    .sf-gd-bar-fill{animation:none;transform:scaleX(1)}
    .sf-gd-loop-pulse{animation:none;opacity:1}
  }
`;

/** Injected once per page (guide-page.tsx renders it alongside MarketplaceStyles). */
export function GuideDiagramStyles(): ReactElement {
  return <style dangerouslySetInnerHTML={{ __html: DIAGRAM_CSS }} />;
}

/** Google's favicon service — a plain image URL, no API key, no config change. */
export function faviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

function Logo({ domain }: { domain: string }): ReactElement {
  return (
    <img
      src={faviconUrl(domain)}
      width={20}
      height={20}
      loading="lazy"
      alt={`${domain} logo`}
      style={{ borderRadius: 4, flex: "0 0 auto", verticalAlign: "middle" }}
    />
  );
}

function DiagramTitle({ title }: { title?: string }): ReactElement | null {
  if (!title) return null;
  return <div style={{ fontSize: 13.5, fontWeight: 800, color: "rgba(34,29,23,0.55)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 14 }}>{title}</div>;
}

function wrapperStyle(): React.CSSProperties {
  return {
    marginTop: 22,
    marginBottom: 6,
    padding: "22px 20px",
    border: `1px solid ${MKT.ink10}`,
    borderRadius: 16,
    background: "rgba(255,255,255,0.55)",
    overflowX: "auto",
  };
}

// ─── flow ─────────────────────────────────────────────────────────────────

function FlowDiagram({ d }: { d: Extract<GuideDiagram, { type: "flow" }> }): ReactElement {
  return (
    <div style={wrapperStyle()} role="img" aria-label={d.title ?? `Flow diagram: ${d.steps.map((s) => s.label).join(" then ")}`}>
      <DiagramTitle title={d.title} />
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0, minWidth: "max-content" }}>
        {d.steps.map((step, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center" }}>
            <StepCard item={step} />
            {i < d.steps.length - 1 && <FlowArrow />}
          </div>
        ))}
      </div>
    </div>
  );
}

function StepCard({ item }: { item: GuideDiagramItem }): ReactElement {
  return (
    <div
      style={{
        minWidth: 148,
        maxWidth: 190,
        border: `1.5px solid ${MKT.ink10}`,
        borderRadius: 12,
        padding: "12px 14px",
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {item.domain && <Logo domain={item.domain} />}
        <span style={{ fontSize: 14, fontWeight: 700, color: MKT.ink, lineHeight: 1.3 }}>{item.label}</span>
      </div>
      {item.sub && <span style={{ fontSize: 12, color: "rgba(34,29,23,0.6)", lineHeight: 1.4 }}>{item.sub}</span>}
    </div>
  );
}

function FlowArrow(): ReactElement {
  return (
    <svg width="40" height="24" viewBox="0 0 40 24" aria-hidden style={{ flex: "0 0 auto" }} className="sf-gd-flow-arrow">
      <path d="M2 12 H32 M24 5 L32 12 L24 19" fill="none" stroke={MKT.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── loop ─────────────────────────────────────────────────────────────────

function LoopDiagram({ d }: { d: Extract<GuideDiagram, { type: "loop" }> }): ReactElement {
  const n = d.steps.length;
  const size = 300;
  const cx = size / 2;
  const cy = size / 2;
  const r = 108;
  const positions = d.steps.map((_, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });

  return (
    <div style={wrapperStyle()} role="img" aria-label={d.title ?? `Loop diagram: ${d.steps.join(" then ")}, then back to ${d.steps[0]}`}>
      <DiagramTitle title={d.title} />
      <div style={{ display: "flex", justifyContent: "center" }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ maxWidth: "100%", height: "auto" }}>
          {positions.map((p, i) => {
            const next = positions[(i + 1) % n];
            const mx = (p.x + next.x) / 2;
            const my = (p.y + next.y) / 2;
            // bow the curve outward from center for a cycle feel
            const dx = mx - cx;
            const dy = my - cy;
            const dist = Math.hypot(dx, dy) || 1;
            const bowX = mx + (dx / dist) * 18;
            const bowY = my + (dy / dist) * 18;
            return (
              <g key={i} className="sf-gd-loop-arrow">
                <path d={`M ${p.x} ${p.y} Q ${bowX} ${bowY} ${next.x} ${next.y}`} fill="none" stroke={MKT.green} strokeWidth="2" strokeLinecap="round" markerEnd="url(#sfGdArrowHead)" />
              </g>
            );
          })}
          <defs>
            <marker id="sfGdArrowHead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill={MKT.green} />
            </marker>
          </defs>
          {positions.map((p, i) => (
            <g key={i} className="sf-gd-loop-pulse">
              <circle cx={p.x} cy={p.y} r={38} fill="#fff" stroke={MKT.ink10} strokeWidth="1.5" />
              <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fontSize="11.5" fontWeight="700" fill={MKT.ink}>
                {wrapLoopLabel(d.steps[i]).map((line, li) => (
                  <tspan key={li} x={p.x} dy={li === 0 ? -((wrapLoopLabel(d.steps[i]).length - 1) * 6) : 12}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

function wrapLoopLabel(label: string): string[] {
  const words = label.split(" ");
  if (words.length <= 2) return [label];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

// ─── compare ──────────────────────────────────────────────────────────────

function CompareDiagram({ d }: { d: Extract<GuideDiagram, { type: "compare" }> }): ReactElement {
  return (
    <div style={wrapperStyle()} role="img" aria-label={d.title ?? `Comparison: ${d.left.heading} vs ${d.right.heading}`}>
      <DiagramTitle title={d.title} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {[d.left, d.right].map((col, i) => (
          <div key={i} style={{ border: `1.5px solid ${MKT.ink10}`, borderRadius: 12, padding: "16px 16px", background: "#fff" }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 10, color: MKT.ink }}>{col.heading}</div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
              {col.items.map((item, j) => (
                <li key={j} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13.5, lineHeight: 1.5, color: "rgba(34,29,23,0.78)" }}>
                  <span aria-hidden style={{ color: MKT.green, fontWeight: 800, flex: "0 0 auto" }}>
                    ✓
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── bars ─────────────────────────────────────────────────────────────────

function BarsDiagram({ d }: { d: Extract<GuideDiagram, { type: "bars" }> }): ReactElement {
  const max = Math.max(...d.items.map((it) => it.value), 1);
  return (
    <div style={wrapperStyle()} role="img" aria-label={d.title ?? `Bar comparison: ${d.items.map((it) => `${it.label} ${it.display}`).join(", ")}`}>
      <DiagramTitle title={d.title} />
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {d.items.map((item, i) => {
          const pct = Math.max((item.value / max) * 100, 4);
          return (
            <div key={i}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, fontSize: 13.5, fontWeight: 700, color: MKT.ink }}>
                {item.domain && <Logo domain={item.domain} />}
                <span>{item.label}</span>
                <span style={{ marginLeft: "auto", fontWeight: 800, color: MKT.green, fontFamily: MKT.fontMono, fontSize: 13 }}>{item.display}</span>
              </div>
              <div style={{ height: 10, borderRadius: 6, background: MKT.ink05, overflow: "hidden" }}>
                <div className="sf-gd-bar-fill" style={{ height: "100%", width: `${pct}%`, borderRadius: 6, background: MKT.green, transformOrigin: "left" }} />
              </div>
            </div>
          );
        })}
      </div>
      {d.note && <div style={{ marginTop: 12, fontSize: 12.5, color: "rgba(34,29,23,0.55)" }}>{d.note}</div>}
    </div>
  );
}

// ─── stack ────────────────────────────────────────────────────────────────

function StackDiagram({ d }: { d: Extract<GuideDiagram, { type: "stack" }> }): ReactElement {
  return (
    <div style={wrapperStyle()} role="img" aria-label={d.title ?? `Layer stack: ${d.layers.map((l) => l.label).join(", ")}`}>
      <DiagramTitle title={d.title} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {d.layers.map((layer, i) => (
          <div
            key={i}
            style={{
              border: `1.5px solid ${MKT.ink10}`,
              borderRadius: 10,
              padding: "12px 16px",
              background: i === 0 ? MKT.green10 : "#fff",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {layer.domain && <Logo domain={layer.domain} />}
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: MKT.ink }}>{layer.label}</div>
              {layer.sub && <div style={{ fontSize: 12, color: "rgba(34,29,23,0.6)", marginTop: 2 }}>{layer.sub}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── dispatch ─────────────────────────────────────────────────────────────

export function GuideDiagramView({ d }: { d: GuideDiagram }): ReactElement {
  switch (d.type) {
    case "flow":
      return <FlowDiagram d={d} />;
    case "loop":
      return <LoopDiagram d={d} />;
    case "compare":
      return <CompareDiagram d={d} />;
    case "bars":
      return <BarsDiagram d={d} />;
    case "stack":
      return <StackDiagram d={d} />;
  }
}
