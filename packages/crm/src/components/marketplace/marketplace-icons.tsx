// Marketplace icon system — the lucide-style line icons used across the
// storefront, ported verbatim from the Claude Design output
// (sf-mkt-design/SeldonFrame Marketplace.dc.html, the ICONS map). Kept as a
// tiny self-contained SVG factory so the storefront has ZERO runtime icon-lib
// dependency and renders identically on the server (RSC) and the client.
//
// Pure presentational — no "use client". Safe to render from server components.

import { createElement } from "react";
import type { CSSProperties, ReactElement } from "react";

/** Each entry is a list of [svgTag, attrs] child primitives. */
type IconDef = ReadonlyArray<readonly [string, Record<string, string | number>]>;

export type MarketplaceIconName =
  | "phone"
  | "mic"
  | "message"
  | "smartphone"
  | "mail"
  | "star"
  | "starLine"
  | "repeat"
  | "file"
  | "headphones"
  | "share"
  | "zap"
  | "search"
  | "sparkles"
  | "calendar"
  | "check"
  | "checkCircle"
  | "arrowRight"
  | "backArrow"
  | "copy"
  | "shield"
  | "trending"
  | "package"
  | "terminal"
  | "play"
  | "x"
  | "users"
  | "download"
  | "dollar"
  | "clock";

const ICONS: Record<MarketplaceIconName, IconDef> = {
  phone: [["path", { d: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" }]],
  mic: [["path", { d: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" }], ["path", { d: "M19 10v2a7 7 0 0 1-14 0v-2" }], ["line", { x1: 12, y1: 19, x2: 12, y2: 22 }]],
  message: [["path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" }]],
  smartphone: [["rect", { x: 5, y: 2, width: 14, height: 20, rx: 2.5 }], ["line", { x1: 12, y1: 18, x2: 12.01, y2: 18 }]],
  mail: [["rect", { x: 2, y: 4, width: 20, height: 16, rx: 2.5 }], ["path", { d: "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" }]],
  star: [["path", { d: "M12 2.5l2.95 5.98 6.6.96-4.77 4.65 1.13 6.57L12 17.55l-5.91 3.11 1.13-6.57L2.45 9.44l6.6-.96z" }]],
  starLine: [["polygon", { points: "12 2.5 14.95 8.48 21.55 9.44 16.78 14.09 17.91 20.66 12 17.55 6.09 20.66 7.22 14.09 2.45 9.44 9.05 8.48" }]],
  repeat: [["path", { d: "m17 2 4 4-4 4" }], ["path", { d: "M3 11v-1a4 4 0 0 1 4-4h14" }], ["path", { d: "m7 22-4-4 4-4" }], ["path", { d: "M21 13v1a4 4 0 0 1-4 4H3" }]],
  file: [["path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }], ["polyline", { points: "14 2 14 8 20 8" }], ["line", { x1: 16, y1: 13, x2: 8, y2: 13 }], ["line", { x1: 16, y1: 17, x2: 8, y2: 17 }], ["line", { x1: 10, y1: 9, x2: 8, y2: 9 }]],
  headphones: [["path", { d: "M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" }]],
  share: [["circle", { cx: 18, cy: 5, r: 3 }], ["circle", { cx: 6, cy: 12, r: 3 }], ["circle", { cx: 18, cy: 19, r: 3 }], ["line", { x1: 8.59, y1: 13.51, x2: 15.42, y2: 17.49 }], ["line", { x1: 15.41, y1: 6.51, x2: 8.59, y2: 10.49 }]],
  zap: [["polygon", { points: "13 2 3 14 12 14 11 22 21 10 12 10" }]],
  search: [["circle", { cx: 11, cy: 11, r: 8 }], ["path", { d: "m21 21-4.3-4.3" }]],
  sparkles: [["path", { d: "M9.94 14.06 8.5 14.06l-.94-2.36-2.36-.94L8.5 9.5 9.44 5l.94 4.5 2.36.94-2.36.94zM18 7l.7 1.8L20.5 9.5l-1.8.7L18 12l-.7-1.8L15.5 9.5l1.8-.7zM17 15l.6 1.4L19 17l-1.4.6L17 19l-.6-1.4L15 17l1.4-.6z" }]],
  calendar: [["path", { d: "M8 2v4" }], ["path", { d: "M16 2v4" }], ["rect", { x: 3, y: 4, width: 18, height: 18, rx: 2 }], ["path", { d: "M3 10h18" }], ["path", { d: "m9 16 2 2 4-4" }]],
  check: [["polyline", { points: "20 6 9 17 4 12" }]],
  checkCircle: [["path", { d: "M22 11.08V12a10 10 0 1 1-5.93-9.14" }], ["polyline", { points: "22 4 12 14.01 9 11.01" }]],
  arrowRight: [["line", { x1: 5, y1: 12, x2: 19, y2: 12 }], ["polyline", { points: "12 5 19 12 12 19" }]],
  backArrow: [["line", { x1: 19, y1: 12, x2: 5, y2: 12 }], ["polyline", { points: "12 19 5 12 12 5" }]],
  copy: [["rect", { x: 9, y: 9, width: 13, height: 13, rx: 2 }], ["path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" }]],
  shield: [["path", { d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" }], ["path", { d: "m9 12 2 2 4-4" }]],
  trending: [["polyline", { points: "22 7 13.5 15.5 8.5 10.5 2 17" }], ["polyline", { points: "16 7 22 7 22 13" }]],
  package: [["path", { d: "M16.5 9.4 7.55 4.24" }], ["path", { d: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" }], ["polyline", { points: "3.29 7 12 12 20.71 7" }], ["line", { x1: 12, y1: 22, x2: 12, y2: 12 }]],
  terminal: [["polyline", { points: "4 17 10 11 4 5" }], ["line", { x1: 12, y1: 19, x2: 20, y2: 19 }]],
  play: [["polygon", { points: "6 3 20 12 6 21" }]],
  x: [["line", { x1: 18, y1: 6, x2: 6, y2: 18 }], ["line", { x1: 6, y1: 6, x2: 18, y2: 18 }]],
  users: [["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }], ["circle", { cx: 9, cy: 7, r: 4 }], ["path", { d: "M22 21v-2a4 4 0 0 0-3-3.87" }], ["path", { d: "M16 3.13a4 4 0 0 1 0 7.75" }]],
  download: [["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }], ["polyline", { points: "7 10 12 15 17 10" }], ["line", { x1: 12, y1: 15, x2: 12, y2: 3 }]],
  dollar: [["line", { x1: 12, y1: 1, x2: 12, y2: 23 }], ["path", { d: "M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" }]],
  clock: [["circle", { cx: 12, cy: 12, r: 10 }], ["polyline", { points: "12 6 12 12 16 14" }]],
};

export type MarketplaceIconProps = {
  name: MarketplaceIconName;
  size?: number;
  /** Stroke width. 0 → render filled (uses fill instead of stroke). */
  stroke?: number;
  /** When true, fill with currentColor and drop the stroke (for star glyphs). */
  filled?: boolean;
  style?: CSSProperties;
};

/**
 * Render a single marketplace icon as an inline SVG. Mirrors the design's `ic()`
 * factory: filled icons use `fill="currentColor"` with no stroke; line icons use
 * `stroke="currentColor"` with no fill.
 */
export function MarketplaceIcon({
  name,
  size = 19,
  stroke = 2,
  filled = false,
  style,
}: MarketplaceIconProps): ReactElement {
  const defs = ICONS[name] ?? [];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ display: "block", flex: "none", ...style }}
    >
      {defs.map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}

/** A row of `n` filled stars (the design's `starRow`). */
export function StarRow({ count, size = 13 }: { count: number; size?: number }): ReactElement {
  return (
    <span style={{ display: "inline-flex", gap: "1px" }}>
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} style={{ display: "inline-flex" }}>
          <MarketplaceIcon name="star" size={size} filled />
        </span>
      ))}
    </span>
  );
}
