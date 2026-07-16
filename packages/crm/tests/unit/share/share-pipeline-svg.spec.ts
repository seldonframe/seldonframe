// components/share/share-pipeline-svg.tsx — legibility fix (share-card slice).
//
// Root cause this pins: the old layout set viewBox width = count * STEP_WIDTH
// while the <svg> renders width="100%" with no fixed height, so the browser
// scales the whole graphic to fit the container using (viewBoxHeight /
// viewBoxWidth) as the ratio — every extra step shrank ALL steps, not just
// added width. `layoutPipeline` is the pure layout function extracted so this
// spec can assert the geometry without a DOM: node size (STEP_WIDTH /
// STEP_HEIGHT) is CONSTANT regardless of step count, and the viewBox only
// grows in height (via row-wrapping, max 3 nodes/row) — never in a way that
// shrinks the per-step rendered size.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  LABEL_FONT_SIZE,
  layoutPipeline,
  SharePipelineSvg,
  STEP_HEIGHT,
  STEP_WIDTH,
  type SharePipelineStep,
} from "@/components/share/share-pipeline-svg";

function steps(n: number): SharePipelineStep[] {
  return Array.from({ length: n }, (_, i) => ({ label: `Step ${i + 1}` }));
}

describe("layoutPipeline", () => {
  test("1 step: single node, single row", () => {
    const layout = layoutPipeline(steps(1));
    assert.equal(layout.nodes.length, 1);
    assert.equal(layout.rows.length, 1);
    assert.equal(layout.nodes[0].label, "Step 1");
    assert.equal(layout.nodes[0].isMore, false);
  });

  test("3 steps: one row, no '+N more' node", () => {
    const layout = layoutPipeline(steps(3));
    assert.equal(layout.nodes.length, 3);
    assert.equal(layout.rows.length, 1);
    assert.ok(layout.nodes.every((n) => !n.isMore));
  });

  test("5 steps: wraps into 2 rows (max 3/row), no '+N more' node (at the cap)", () => {
    const layout = layoutPipeline(steps(5));
    assert.equal(layout.nodes.length, 5);
    assert.equal(layout.rows.length, 2);
    assert.equal(layout.rows[0].length, 3);
    assert.equal(layout.rows[1].length, 2);
    assert.ok(layout.nodes.every((n) => !n.isMore));
  });

  test("9 steps: caps at 5 displayed nodes (first 4 + a '+N more' node)", () => {
    const layout = layoutPipeline(steps(9));
    assert.equal(layout.nodes.length, 5);
    assert.equal(layout.nodes[0].label, "Step 1");
    assert.equal(layout.nodes[3].label, "Step 4");
    assert.equal(layout.nodes[4].isMore, true);
    assert.equal(layout.nodes[4].label, "+5 more steps");
    // wraps 5 nodes into 2 rows, same as the plain 5-step case
    assert.equal(layout.rows.length, 2);
    assert.equal(layout.rows[0].length, 3);
    assert.equal(layout.rows[1].length, 2);
  });

  test("9-step layout is geometrically IDENTICAL to the plain 5-step layout (viewBox + node positions)", () => {
    const nine = layoutPipeline(steps(9));
    const five = layoutPipeline(steps(5));
    assert.deepEqual(nine.viewBox, five.viewBox);
    for (let i = 0; i < 5; i++) {
      assert.equal(nine.nodes[i].x, five.nodes[i].x);
      assert.equal(nine.nodes[i].y, five.nodes[i].y);
    }
  });

  test("node dimensions are CONSTANT regardless of step count (the shrink-with-count bug)", () => {
    for (const n of [1, 3, 5, 9]) {
      const layout = layoutPipeline(steps(n));
      for (const node of layout.nodes) {
        assert.equal(node.width, STEP_WIDTH);
        assert.equal(node.height, STEP_HEIGHT);
      }
    }
  });

  test("viewBox height grows with row count, not per-step width shrink", () => {
    const oneRow = layoutPipeline(steps(3));
    const twoRows = layoutPipeline(steps(5));
    assert.ok(twoRows.viewBox.height > oneRow.viewBox.height, "height should grow when wrapping to a 2nd row");
    // width is bounded by the widest row (3 nodes) in both cases
    assert.equal(twoRows.viewBox.width, oneRow.viewBox.width);
  });

  test("worst-case (5 nodes / 2 rows) keeps a >=12px rendered label at a 640px-wide container", () => {
    const layout = layoutPipeline(steps(9)); // 5 displayed nodes, 2 rows — the worst case
    const containerWidth = 640;
    const scale = containerWidth / layout.viewBox.width;
    const renderedFontPx = LABEL_FONT_SIZE * scale;
    assert.ok(
      renderedFontPx >= 12,
      `rendered label size ${renderedFontPx.toFixed(2)}px is below the 12px legibility floor (viewBox width ${layout.viewBox.width})`,
    );
  });

  // MOBILE REGRESSION (2026-07-16): the /a page wraps this SVG in an
  // overflow-x-auto container. Without a min-width floor, a narrow (375px)
  // viewport would scale the WHOLE svg down using containerWidth/viewBoxWidth
  // as the ratio — the same bug class as the original 640px-container fix,
  // just triggered by a NARROWER container instead of a wider viewBox. The
  // SVG's `style.minWidth` (asserted below, on the render, not just here)
  // pins the rendered width to the viewBox width, so the browser can never
  // scale it below its designed size — the parent scrolls horizontally
  // instead. Model that behavior here: with min-width engaged, the
  // EFFECTIVE render width is max(containerWidth, viewBoxWidth), never less.
  test("375px-wide container: min-width holds geometry, label size never drops below its designed 14px", () => {
    const layout = layoutPipeline(steps(9)); // 5 displayed nodes, 2 rows — the worst case
    const containerWidth = 375;
    // What width="100%" WOULD scale to, absent min-width (the pre-fix bug):
    const unfloored = (LABEL_FONT_SIZE * containerWidth) / layout.viewBox.width;
    assert.ok(
      unfloored < 12,
      `test fixture no longer reproduces the bug at 375px (would render ${unfloored.toFixed(2)}px) — widen the fixture`,
    );
    // With min-width: viewBoxWidth engaged, the browser can't render narrower
    // than the SVG's natural (viewBox-derived) size — the effective width is
    // floored at viewBox.width, so scale never drops below 1.
    const effectiveWidth = Math.max(containerWidth, layout.viewBox.width);
    const scale = effectiveWidth / layout.viewBox.width;
    const renderedFontPx = LABEL_FONT_SIZE * scale;
    assert.ok(scale >= 1, "min-width should never let the SVG scale below its natural size");
    assert.ok(
      renderedFontPx >= LABEL_FONT_SIZE,
      `rendered label size ${renderedFontPx.toFixed(2)}px dropped below its designed ${LABEL_FONT_SIZE}px at a 375px container`,
    );
    assert.ok(renderedFontPx >= 12, "still clears the 12px legibility floor at 375px");
  });

  test("SVG declares style.minWidth == its own viewBox width in px (the actual mobile fix)", () => {
    for (const n of [3, 9]) {
      const layout = layoutPipeline(steps(n));
      const svg = SharePipelineSvg({ steps: steps(n) }) as unknown as { props?: { style?: { minWidth?: string } } };
      const minWidth = svg.props?.style?.minWidth;
      assert.equal(
        minWidth,
        `${layout.viewBox.width}px`,
        `expected svg style.minWidth to equal the viewBox width (${layout.viewBox.width}px), got ${String(minWidth)}`,
      );
    }
  });

  test("zero steps still returns a single-node layout (defensive floor, no divide-by-zero)", () => {
    const layout = layoutPipeline([]);
    assert.equal(layout.nodes.length, 1);
  });
});

// ─── visibility invariant on rendered markup ───────────────────────────────
// L-36 rule: no text/fill may equal the color of the surface directly behind
// it. Walk the returned React element tree (SharePipelineSvg is a plain
// function component — no hooks — so it can be invoked directly) and assert
// every <text> node's `fill` differs from its sibling <rect>'s `fill`.

type ElementLike = { type?: unknown; props?: Record<string, unknown> };

function collectGroups(node: unknown, out: ElementLike[]): void {
  if (node == null || typeof node === "boolean" || typeof node === "string" || typeof node === "number") return;
  if (Array.isArray(node)) {
    for (const child of node) collectGroups(child, out);
    return;
  }
  const el = node as ElementLike;
  if (el.type === "g") {
    out.push(el);
    return;
  }
  collectGroups(el.props?.children, out);
}

function findByType(node: unknown, type: string): ElementLike | undefined {
  if (node == null || typeof node === "boolean" || typeof node === "string" || typeof node === "number") return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByType(child, type);
      if (found) return found;
    }
    return undefined;
  }
  const el = node as ElementLike;
  if (el.type === type) return el;
  return findByType(el.props?.children, type);
}

describe("SharePipelineSvg renders VISIBLY (L-36 invariant)", () => {
  for (const n of [1, 3, 5, 9]) {
    test(`${n} step(s): every node's <text fill> differs from its own <rect fill>`, () => {
      const svg = SharePipelineSvg({ steps: steps(n) });
      const groups: ElementLike[] = [];
      collectGroups(svg.props?.children, groups);
      assert.ok(groups.length > 0, "expected at least one <g> node group");
      for (const g of groups) {
        const rect = findByType(g.props?.children, "rect");
        const text = findByType(g.props?.children, "text");
        assert.ok(rect, "node group missing its <rect>");
        assert.ok(text, "node group missing its <text>");
        const rectFill = (rect!.props?.fill as string | undefined)?.toLowerCase();
        const textFill = (text!.props?.fill as string | undefined)?.toLowerCase();
        assert.ok(rectFill, "rect has no explicit fill");
        assert.ok(textFill, "text has no explicit fill");
        assert.notEqual(textFill, rectFill, `text fill (${textFill}) matches its own node's fill (${rectFill}) — invisible`);
      }
    });
  }
});
