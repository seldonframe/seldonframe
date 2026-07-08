// Shared "shareable result" module for the free SEO calculator tools
// (missed-call-calculator.tsx, ai-receptionist-cost-calculator.tsx).
//
// Two responsibilities live here:
//   1. Pure URL query-state encode/decode helpers (unit-testable, no DOM).
//   2. A client-only <canvas> "result card" renderer — a YouTube-thumbnail
//      style 1280x720 image summarizing the calculator result, downloadable
//      and shareable. Zero deps, zero network.
//
// Nothing in this file does I/O at module-load time, so it's safe to import
// from a Node test runner as long as the test only touches the pure
// encode/decode exports (the canvas fns require `document`/`window`).

// ─── URL-state schema ──────────────────────────────────────────────────
//
// Short, stable query keys so shared links stay compact.
//   Missed-call calculator:      mc = missedPerWeek, jv = jobValue, cr = closeRate
//   AI receptionist cost calc:   cm = callsPerMonth, am = avgMinutes, wg = wage,
//                                 ar = answeringRate, ai = aiRate

export interface MissedCallState {
  missedPerWeek: number;
  jobValue: number;
  closeRate: number;
}

export interface MissedCallBounds {
  missedPerWeek: { min: number; max: number };
  jobValue: { min: number; max: number };
  closeRate: { min: number; max: number };
}

export const MISSED_CALL_BOUNDS: MissedCallBounds = {
  missedPerWeek: { min: 1, max: 60 },
  jobValue: { min: 50, max: 5000 },
  closeRate: { min: 5, max: 80 },
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Parse a query param as a finite number, or return undefined if invalid/missing. */
function parseNum(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key);
  if (raw === null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function encodeMissedCallState(state: MissedCallState): string {
  const params = new URLSearchParams();
  params.set("mc", String(Math.round(state.missedPerWeek)));
  params.set("jv", String(Math.round(state.jobValue)));
  params.set("cr", String(Math.round(state.closeRate)));
  return params.toString();
}

/**
 * Decode + clamp a missed-call query string into a partial state. Only keys
 * that are present and numeric are returned; callers merge onto defaults.
 * Garbage/out-of-range input is clamped to the slider bounds rather than
 * rejected outright, so a hand-edited URL never crashes the page.
 */
export function decodeMissedCallState(search: string): Partial<MissedCallState> {
  const params = new URLSearchParams(search);
  const out: Partial<MissedCallState> = {};

  const mc = parseNum(params, "mc");
  if (mc !== undefined) out.missedPerWeek = clamp(mc, MISSED_CALL_BOUNDS.missedPerWeek.min, MISSED_CALL_BOUNDS.missedPerWeek.max);

  const jv = parseNum(params, "jv");
  if (jv !== undefined) out.jobValue = clamp(jv, MISSED_CALL_BOUNDS.jobValue.min, MISSED_CALL_BOUNDS.jobValue.max);

  const cr = parseNum(params, "cr");
  if (cr !== undefined) out.closeRate = clamp(cr, MISSED_CALL_BOUNDS.closeRate.min, MISSED_CALL_BOUNDS.closeRate.max);

  return out;
}

export interface CostCalcState {
  callsPerMonth: number;
  avgMinutes: number;
  wage: number;
  answeringRate: number;
  aiRate: number;
}

export interface CostCalcBounds {
  callsPerMonth: { min: number; max: number };
  avgMinutes: { min: number; max: number };
  wage: { min: number; max: number };
  answeringRate: { min: number; max: number };
  aiRate: { min: number; max: number };
}

export const COST_CALC_BOUNDS: CostCalcBounds = {
  callsPerMonth: { min: 20, max: 3000 },
  avgMinutes: { min: 1, max: 20 },
  wage: { min: 12, max: 40 },
  answeringRate: { min: 0.5, max: 5 },
  aiRate: { min: 0.05, max: 1 },
};

export function encodeCostCalcState(state: CostCalcState): string {
  const params = new URLSearchParams();
  params.set("cm", String(Math.round(state.callsPerMonth)));
  params.set("am", String(state.avgMinutes));
  params.set("wg", String(state.wage));
  params.set("ar", String(state.answeringRate));
  params.set("ai", String(state.aiRate));
  return params.toString();
}

export function decodeCostCalcState(search: string): Partial<CostCalcState> {
  const params = new URLSearchParams(search);
  const out: Partial<CostCalcState> = {};

  const cm = parseNum(params, "cm");
  if (cm !== undefined) out.callsPerMonth = clamp(cm, COST_CALC_BOUNDS.callsPerMonth.min, COST_CALC_BOUNDS.callsPerMonth.max);

  const am = parseNum(params, "am");
  if (am !== undefined) out.avgMinutes = clamp(am, COST_CALC_BOUNDS.avgMinutes.min, COST_CALC_BOUNDS.avgMinutes.max);

  const wg = parseNum(params, "wg");
  if (wg !== undefined) out.wage = clamp(wg, COST_CALC_BOUNDS.wage.min, COST_CALC_BOUNDS.wage.max);

  const ar = parseNum(params, "ar");
  if (ar !== undefined) out.answeringRate = clamp(ar, COST_CALC_BOUNDS.answeringRate.min, COST_CALC_BOUNDS.answeringRate.max);

  const ai = parseNum(params, "ai");
  if (ai !== undefined) out.aiRate = clamp(ai, COST_CALC_BOUNDS.aiRate.min, COST_CALC_BOUNDS.aiRate.max);

  return out;
}

// ─── Canvas result-card renderer ───────────────────────────────────────

export interface ResultCardRow {
  label: string;
  value: string;
}

export interface ResultCardSpec {
  headline: string;
  bigNumber: string;
  subline: string;
  rows?: ResultCardRow[];
  footer: string;
}

const CARD_W = 1280;
const CARD_H = 720;

const CARD_INK = "#1F2B24";
const CARD_INK_ACCENT = "#26352C";
const CARD_PAPER = "#F6F2EA";
const CARD_PAPER_MUTED = "rgba(246,242,234,0.72)";
const CARD_GREEN = "#00897B";
const CARD_GREEN_GLOW = "rgba(0,137,123,0.45)";

/**
 * Shrink a font size until `text` fits within `maxWidth`, down to a floor.
 * Mutates nothing; returns the fitted size in px.
 */
function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  startPx: number,
  minPx: number,
  maxWidth: number,
  fontBuilder: (px: number) => string,
): number {
  let px = startPx;
  ctx.font = fontBuilder(px);
  while (ctx.measureText(text).width > maxWidth && px > minPx) {
    px -= 2;
    ctx.font = fontBuilder(px);
  }
  // The 2px decrement can overshoot an odd floor by one step — clamp back.
  return Math.max(px, minPx);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draw the SeldonFrame square mark: an outlined square + 4 corner dots. */
function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.save();
  ctx.strokeStyle = CARD_GREEN;
  ctx.lineWidth = Math.max(2, size * 0.09);
  ctx.strokeRect(x, y, size, size);
  const r = Math.max(2, size * 0.09);
  ctx.fillStyle = CARD_GREEN;
  const pts: [number, number][] = [
    [x, y],
    [x + size, y],
    [x, y + size],
    [x + size, y + size],
  ];
  for (const [px, py] of pts) {
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Render a YouTube-thumbnail-style (1280x720) result card onto `canvas`.
 * Renders at up to 2x devicePixelRatio internally (backing store scaled)
 * while the canvas element's CSS size stays at the caller's display size,
 * so output is crisp on retina screens.
 */
export function renderResultCard(canvas: HTMLCanvasElement, spec: ResultCardSpec): void {
  const dpr = typeof window !== "undefined" && window.devicePixelRatio ? Math.min(window.devicePixelRatio, 2) : 1;

  canvas.width = CARD_W * dpr;
  canvas.height = CARD_H * dpr;
  canvas.style.width = "100%";
  canvas.style.aspectRatio = `${CARD_W} / ${CARD_H}`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textBaseline = "alphabetic";

  // Background
  ctx.fillStyle = CARD_INK;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Subtle diagonal accent band, top-right to bottom, behind everything else.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(CARD_W * 0.62, 0);
  ctx.lineTo(CARD_W, 0);
  ctx.lineTo(CARD_W, CARD_H);
  ctx.lineTo(CARD_W * 0.38, CARD_H);
  ctx.closePath();
  ctx.fillStyle = CARD_INK_ACCENT;
  ctx.fill();
  ctx.restore();

  const marginX = 72;

  // Mark + wordmark, top-left.
  drawMark(ctx, marginX, 56, 34);
  ctx.fillStyle = CARD_PAPER_MUTED;
  ctx.font = "700 22px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText("seldonframe.com", marginX + 48, 80);

  // Headline
  ctx.fillStyle = CARD_PAPER;
  const headlineSize = fitFontSize(
    ctx,
    spec.headline,
    64,
    36,
    CARD_W - marginX * 2,
    (px) => `800 ${px}px system-ui, -apple-system, Segoe UI, sans-serif`,
  );
  ctx.font = `800 ${headlineSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.fillText(spec.headline, marginX, 190);

  // Big number — the star of the thumbnail. Shrink to fit, then glow +
  // underline bar sized to the fitted width.
  const bigMaxWidth = CARD_W - marginX * 2;
  const bigSize = fitFontSize(
    ctx,
    spec.bigNumber,
    150,
    60,
    bigMaxWidth,
    (px) => `900 ${px}px system-ui, -apple-system, Segoe UI, sans-serif`,
  );
  ctx.font = `900 ${bigSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
  const bigY = 400;
  const bigWidth = ctx.measureText(spec.bigNumber).width;

  ctx.save();
  ctx.shadowColor = CARD_GREEN_GLOW;
  ctx.shadowBlur = 36;
  ctx.fillStyle = CARD_GREEN;
  ctx.fillText(spec.bigNumber, marginX, bigY);
  ctx.restore();
  // Re-draw crisp on top (shadow pass alone can look soft/blurry for the glyphs themselves).
  ctx.fillStyle = CARD_GREEN;
  ctx.fillText(spec.bigNumber, marginX, bigY);

  // Underline bar under the big number.
  ctx.fillStyle = CARD_GREEN;
  roundRect(ctx, marginX, bigY + 18, Math.max(80, bigWidth), 8, 4);
  ctx.fill();

  // Subline
  ctx.fillStyle = CARD_PAPER_MUTED;
  const sublineSize = fitFontSize(
    ctx,
    spec.subline,
    40,
    22,
    CARD_W - marginX * 2,
    (px) => `600 ${px}px system-ui, -apple-system, Segoe UI, sans-serif`,
  );
  ctx.font = `600 ${sublineSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.fillText(spec.subline, marginX, bigY + 18 + 56);

  // Optional small rows
  if (spec.rows && spec.rows.length > 0) {
    let rowY = bigY + 18 + 56 + 46;
    ctx.font = "600 26px system-ui, -apple-system, Segoe UI, sans-serif";
    for (const row of spec.rows.slice(0, 3)) {
      ctx.fillStyle = CARD_PAPER_MUTED;
      const text = `${row.label}: `;
      ctx.fillText(text, marginX, rowY);
      const textWidth = ctx.measureText(text).width;
      ctx.fillStyle = CARD_PAPER;
      ctx.fillText(row.value, marginX + textWidth, rowY);
      rowY += 34;
    }
  }

  // Footer pill (rounded-rect around the CTA text), bottom-left.
  ctx.font = "700 24px system-ui, -apple-system, Segoe UI, sans-serif";
  const footerTextWidth = ctx.measureText(spec.footer).width;
  const pillPadX = 22;
  const pillH = 52;
  const pillW = footerTextWidth + pillPadX * 2;
  const pillX = marginX;
  const pillY = CARD_H - 56 - pillH;

  ctx.fillStyle = "rgba(246,242,234,0.10)";
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(246,242,234,0.28)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.stroke();

  ctx.fillStyle = CARD_PAPER;
  ctx.fillText(spec.footer, pillX + pillPadX, pillY + pillH / 2 + 8);
}

// ─── Share helpers ──────────────────────────────────────────────────────

/** Build the canonical shareable URL for the current page + query string. */
export function buildShareUrl(search: string): string {
  if (typeof window === "undefined") return "";
  const qs = search.startsWith("?") ? search : `?${search}`;
  return `${window.location.origin}${window.location.pathname}${qs === "?" ? "" : qs}`;
}

/**
 * Copy `text` to the clipboard, using the async Clipboard API when available
 * and falling back to a hidden textarea + execCommand for older browsers.
 * Returns whether the copy is believed to have succeeded.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy path
    }
  }
  if (typeof document === "undefined") return false;
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

/** Trigger a browser download of the canvas contents as a PNG. */
export function downloadCanvasAsImage(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}

/**
 * Share via the Web Share API when available (level 2: attach the canvas
 * image as a file when `navigator.canShare` accepts files; otherwise share
 * just the URL/text). Returns whether a share sheet was invoked.
 */
export async function shareResultCard(
  canvas: HTMLCanvasElement | null,
  opts: { title: string; text: string; url: string; filename: string },
): Promise<boolean> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;

  if (canvas) {
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (blob) {
      const file = new File([blob], opts.filename, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
      if (typeof nav.canShare === "function" && nav.canShare({ files: [file] })) {
        try {
          await navigator.share({ title: opts.title, text: opts.text, url: opts.url, files: [file] });
          return true;
        } catch {
          // user cancelled or share failed — fall through to text-only share
        }
      }
    }
  }

  try {
    await navigator.share({ title: opts.title, text: opts.text, url: opts.url });
    return true;
  } catch {
    return false;
  }
}
