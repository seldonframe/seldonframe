// Agent setup mode slice (T5) — the share card's animated SVG pipeline.
//
// Server-safe (no "use client", no hooks): steps light up in sequence via
// plain CSS @keyframes with a per-node animation-delay — no JS timer, no
// client bundle. Renders on the PUBLIC /a/[slug] page, so every string here
// is already-scrubbed step-label text (the server actions that write
// share_cards.sanitizedSteps are the only write path — see
// lib/agent-templates/share-card-actions.ts).

export type SharePipelineStep = { label: string };

const STEP_WIDTH = 220;
const STEP_HEIGHT = 64;
const STEP_GAP = 56;
const PADDING = 32;
const CYCLE_S = 0.9;

/** Truncate a label for the fixed-width node box — the full text still sits
 *  in the node's <title> for accessibility/tooltips. */
function fitLabel(label: string, max = 26): string {
  return label.length > max ? `${label.slice(0, max - 1).trimEnd()}…` : label;
}

export function SharePipelineSvg({ steps }: { steps: SharePipelineStep[] }) {
  const shown = steps.slice(0, 8);
  const count = Math.max(shown.length, 1);
  const width = PADDING * 2 + count * STEP_WIDTH + (count - 1) * STEP_GAP;
  const height = PADDING * 2 + STEP_HEIGHT;
  const y = PADDING;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label={`Agent workflow: ${shown.map((s) => s.label).join(" → ")}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <style>{`
        .sf-share-node { animation: sf-share-light ${CYCLE_S * count}s ease-in-out infinite; }
        .sf-share-arrow { animation: sf-share-arrow-light ${CYCLE_S * count}s ease-in-out infinite; }
        @keyframes sf-share-light {
          0%, 8% { fill: #1c2230; stroke: #3a4256; }
          14%, 22% { fill: #0f2a22; stroke: #2fd18d; }
          28%, 100% { fill: #1c2230; stroke: #3a4256; }
        }
        @keyframes sf-share-arrow-light {
          0%, 10% { stroke: #3a4256; }
          16%, 24% { stroke: #2fd18d; }
          30%, 100% { stroke: #3a4256; }
        }
      `}</style>
      {shown.map((step, i) => {
        const x = PADDING + i * (STEP_WIDTH + STEP_GAP);
        const delay = (i * CYCLE_S).toFixed(2);
        return (
          <g key={i}>
            {i > 0 ? (
              <line
                className="sf-share-arrow"
                x1={x - STEP_GAP + 4}
                y1={y + STEP_HEIGHT / 2}
                x2={x - 4}
                y2={y + STEP_HEIGHT / 2}
                stroke="#3a4256"
                strokeWidth={2}
                style={{ animationDelay: `${(i - 1) * CYCLE_S + CYCLE_S * 0.5}s` }}
              />
            ) : null}
            <rect
              className="sf-share-node"
              x={x}
              y={y}
              width={STEP_WIDTH}
              height={STEP_HEIGHT}
              rx={12}
              fill="#1c2230"
              stroke="#3a4256"
              strokeWidth={2}
              style={{ animationDelay: `${delay}s` }}
            >
              <title>{step.label}</title>
            </rect>
            <text
              x={x + STEP_WIDTH / 2}
              y={y + STEP_HEIGHT / 2 + 5}
              textAnchor="middle"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontSize={14}
              fontWeight={600}
              fill="#e6e9f0"
            >
              {fitLabel(step.label)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
