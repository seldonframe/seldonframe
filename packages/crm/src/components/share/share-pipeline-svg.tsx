// Agent setup mode slice (T5) — the share card's animated SVG pipeline.
//
// Server-safe (no "use client", no hooks): steps light up in sequence via
// plain CSS @keyframes with a per-node animation-delay — no JS timer, no
// client bundle. Renders on the PUBLIC /a/[slug] page, so every string here
// is already-scrubbed step-label text (the server actions that write
// share_cards.sanitizedSteps are the only write path — see
// lib/agent-templates/share-card-actions.ts).
//
// LEGIBILITY FIX (2026-07-16): the old layout set viewBox width =
// count * STEP_WIDTH and rendered <svg width="100%"> with no fixed height —
// the browser scales the WHOLE graphic to fit the container using
// (viewBoxHeight / viewBoxWidth) as the aspect ratio, so every extra step
// shrank ALL steps (fontSize 14 became ~7px at 6+ steps). Fix: cap displayed
// nodes at 5 (first 4 + a "+N more" node) and WRAP into rows (max 3/row) so
// the viewBox grows in HEIGHT, never in a way that shrinks per-step size.
// `layoutPipeline` is a pure function so the geometry is unit-testable
// without a DOM — see tests/unit/share/share-pipeline-svg.spec.ts.
//
// BRAND: forest palette (post-rebrand, PR #68) — node fill uses the elevated
// dark surface, text/highlight uses cream (paper), never the retired
// emerald #2fd18d (green === dark now; see lib/seo/og-card.tsx's
// OG_COLORS comment).

export type SharePipelineStep = { label: string };

export const STEP_WIDTH = 180;
export const STEP_HEIGHT = 64;
const STEP_GAP = 40;
const ROW_GAP = 32;
const PADDING = 24;
const MAX_PER_ROW = 3;
const DISPLAY_CAP = 5;
const KEEP_FULL = 4;
const CYCLE_S = 0.9;

// Brand colors (forest rebrand, PR #68 / #91) — never the retired emerald.
const NODE_FILL = "#1A1713"; // elevated dark surface
const NODE_FILL_MORE = "#1A1713";
const NODE_STROKE = "#4A4032"; // subtle warm border
const NODE_STROKE_ACTIVE = "#F6F2EA"; // cream highlight (was emerald)
const NODE_FILL_ACTIVE = "#241E15";
const TEXT_FILL = "#F6F2EA"; // cream — differs from every node fill above
const TEXT_FILL_MORE = "#A39B8D"; // muted — still differs from NODE_FILL_MORE
const ARROW_STROKE = "#4A4032";
const ARROW_STROKE_ACTIVE = "#F6F2EA";

/** Truncate a label for the fixed-width node box — the full text still sits
 *  in the node's <title> for accessibility/tooltips. */
function fitLabel(label: string, max = 22): string {
  return label.length > max ? `${label.slice(0, max - 1).trimEnd()}…` : label;
}

export type PipelineNodeLayout = {
  label: string;
  fullLabel: string;
  isMore: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  row: number;
  col: number;
};

export type PipelineLayout = {
  rows: PipelineNodeLayout[][];
  viewBox: { width: number; height: number };
  nodes: PipelineNodeLayout[];
};

/** Pure layout function: turns a step list into a row-wrapped grid of fixed-
 *  size nodes. Cap at DISPLAY_CAP (5) — beyond that, show the first
 *  KEEP_FULL (4) steps plus one "+N more steps" node, so the total displayed
 *  node count (and therefore the viewBox) never grows past the 5-node/2-row
 *  worst case, regardless of how many steps the agent actually has. */
export function layoutPipeline(steps: SharePipelineStep[]): PipelineLayout {
  const total = steps.length;

  const display: Array<{ label: string; fullLabel: string; isMore: boolean }> =
    total <= DISPLAY_CAP
      ? steps.map((s) => ({ label: fitLabel(s.label), fullLabel: s.label, isMore: false }))
      : [
          ...steps.slice(0, KEEP_FULL).map((s) => ({ label: fitLabel(s.label), fullLabel: s.label, isMore: false })),
          {
            label: `+${total - KEEP_FULL} more steps`,
            fullLabel: `${total - KEEP_FULL} more steps`,
            isMore: true,
          },
        ];

  const count = Math.max(display.length, 1);
  const items = display.length > 0 ? display : [{ label: "", fullLabel: "", isMore: false }];
  const rowCount = Math.ceil(count / MAX_PER_ROW);

  const rows: PipelineNodeLayout[][] = [];
  for (let r = 0; r < rowCount; r++) {
    const rowItems = items.slice(r * MAX_PER_ROW, r * MAX_PER_ROW + MAX_PER_ROW);
    const rowNodes: PipelineNodeLayout[] = rowItems.map((item, c) => ({
      label: item.label,
      fullLabel: item.fullLabel,
      isMore: item.isMore,
      x: PADDING + c * (STEP_WIDTH + STEP_GAP),
      y: PADDING + r * (STEP_HEIGHT + ROW_GAP),
      width: STEP_WIDTH,
      height: STEP_HEIGHT,
      row: r,
      col: c,
    }));
    rows.push(rowNodes);
  }

  const widestRowCount = Math.min(count, MAX_PER_ROW);
  const width = PADDING * 2 + widestRowCount * STEP_WIDTH + Math.max(widestRowCount - 1, 0) * STEP_GAP;
  const height = PADDING * 2 + rowCount * STEP_HEIGHT + Math.max(rowCount - 1, 0) * ROW_GAP;

  return { rows, viewBox: { width, height }, nodes: rows.flat() };
}

export function SharePipelineSvg({ steps }: { steps: SharePipelineStep[] }) {
  const layout = layoutPipeline(steps);
  const { nodes, viewBox } = layout;
  const nodeCount = Math.max(nodes.length, 1);

  return (
    <svg
      viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
      width="100%"
      role="img"
      aria-label={`Agent workflow: ${nodes.map((n) => n.fullLabel).join(" → ")}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <style>{`
        .sf-share-node { animation: sf-share-light ${CYCLE_S * nodeCount}s ease-in-out infinite; }
        .sf-share-arrow { animation: sf-share-arrow-light ${CYCLE_S * nodeCount}s ease-in-out infinite; }
        @keyframes sf-share-light {
          0%, 8% { fill: ${NODE_FILL}; stroke: ${NODE_STROKE}; }
          14%, 22% { fill: ${NODE_FILL_ACTIVE}; stroke: ${NODE_STROKE_ACTIVE}; }
          28%, 100% { fill: ${NODE_FILL}; stroke: ${NODE_STROKE}; }
        }
        @keyframes sf-share-arrow-light {
          0%, 10% { stroke: ${ARROW_STROKE}; }
          16%, 24% { stroke: ${ARROW_STROKE_ACTIVE}; }
          30%, 100% { stroke: ${ARROW_STROKE}; }
        }
      `}</style>
      {nodes.map((node, i) => {
        const delay = (i * CYCLE_S).toFixed(2);
        const prevInRow = node.col > 0 ? nodes[i - 1] : null;
        return (
          <g key={i}>
            {prevInRow ? (
              <line
                className="sf-share-arrow"
                x1={prevInRow.x + prevInRow.width + 4}
                y1={node.y + node.height / 2}
                x2={node.x - 4}
                y2={node.y + node.height / 2}
                stroke={ARROW_STROKE}
                strokeWidth={2}
                style={{ animationDelay: `${(i - 1) * CYCLE_S + CYCLE_S * 0.5}s` }}
              />
            ) : null}
            <rect
              className={node.isMore ? undefined : "sf-share-node"}
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              rx={12}
              fill={node.isMore ? NODE_FILL_MORE : NODE_FILL}
              stroke={NODE_STROKE}
              strokeDasharray={node.isMore ? "6 5" : undefined}
              strokeWidth={2}
              style={node.isMore ? undefined : { animationDelay: `${delay}s` }}
            >
              <title>{node.fullLabel}</title>
            </rect>
            <text
              x={node.x + node.width / 2}
              y={node.y + node.height / 2 + 5}
              textAnchor="middle"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontSize={14}
              fontWeight={600}
              fill={node.isMore ? TEXT_FILL_MORE : TEXT_FILL}
            >
              {node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
