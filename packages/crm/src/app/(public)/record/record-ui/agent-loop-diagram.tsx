// packages/crm/src/app/(public)/record/record-ui/agent-loop-diagram.tsx
//
// Record v3 (S2a) — the agent-loop explainer. A small, CSS-only-animated
// SVG under the hero: Trigger → Watch → Decide → Act → Check with you, a
// teal dot traveling the loop, one node brightening as the dot passes.
// Purpose: a first-time visitor who doesn't know what "an agent" is
// understands in ~5 seconds what their recording becomes.
//
// Server-renderable (no hooks, no browser APIs) — animation is pure CSS
// `@keyframes` inside an inline <style>, so it works without JS.
// `prefers-reduced-motion` gets a static diagram via a media query that
// pins the animation to its 0% frame and disables the dot's motion path.

const NODES = [
  { id: "trigger", label: "Trigger", angle: -90 },
  { id: "watch", label: "Watch", angle: -18 },
  { id: "decide", label: "Decide", angle: 54 },
  { id: "act", label: "Act", angle: 126 },
  { id: "check", label: "Check with you", angle: 198 },
] as const;

const CX = 280;
const CY = 130;
const R = 92;

function pointOn(angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) };
}

export function AgentLoopDiagram() {
  const pathD =
    NODES.map((n, i) => {
      const p = pointOn(n.angle);
      return `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }).join(" ") + " Z";

  return (
    <figure className="mx-auto w-full max-w-[560px]">
      <svg
        viewBox="0 0 560 260"
        role="img"
        aria-labelledby="agent-loop-title agent-loop-desc"
        className="w-full"
      >
        <title id="agent-loop-title">The agent loop</title>
        <desc id="agent-loop-desc">
          A cycle of five stages — Trigger, Watch, Decide, Act, and Check with you — that a
          compiled agent runs on repeat.
        </desc>

        <style>{`
          @keyframes sf-loop-dot {
            0% { offset-distance: 0%; }
            100% { offset-distance: 100%; }
          }
          .sf-loop-dot {
            offset-path: path('${pathD}');
            animation: sf-loop-dot 6s linear infinite;
          }
          .sf-loop-node-glow {
            animation: sf-loop-glow 6s linear infinite;
          }
          @keyframes sf-loop-glow {
            0%, 12%, 100% { opacity: 0.35; }
            2%, 10% { opacity: 1; }
          }
          @media (prefers-reduced-motion: reduce) {
            .sf-loop-dot { animation: none; offset-distance: 0%; }
            .sf-loop-node-glow { animation: none; opacity: 0.7; }
          }
        `}</style>

        <path
          d={pathD}
          fill="none"
          stroke="rgba(231,229,222,.14)"
          strokeWidth="1.5"
          strokeDasharray="2 6"
          strokeLinecap="round"
        />

        {NODES.map((n, i) => {
          const p = pointOn(n.angle);
          const labelAbove = n.angle > 90 || n.angle < -90;
          return (
            <g key={n.id}>
              <circle
                cx={p.x}
                cy={p.y}
                r="20"
                fill="#0F1413"
                stroke="#14B8A6"
                strokeWidth="1.5"
                className="sf-loop-node-glow"
                style={{ animationDelay: `${(i / NODES.length) * 6}s` }}
              />
              <text
                x={p.x}
                y={p.y + (labelAbove ? -30 : 38)}
                textAnchor="middle"
                fontSize="13"
                fontWeight="600"
                fill="#E7E5DE"
              >
                {n.label}
              </text>
            </g>
          );
        })}

        <circle r="5" fill="#2DD4BF" className="sf-loop-dot" />
      </svg>
      <figcaption className="mt-2 text-center text-[12.5px] text-[#9CA3AF]">
        A recording becomes an agent that runs this loop for you.
      </figcaption>
    </figure>
  );
}
