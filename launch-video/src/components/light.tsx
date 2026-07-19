import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, Easing} from 'remotion';
import {FONT_DISPLAY, FONT_MONO, L} from '../theme';
import {useLayout} from './core';

/* ---------- parchment stage (matches landing-theme.css light mode) ---------- */
export const StageL: React.FC<{children: React.ReactNode; alt?: boolean}> = ({
  children,
  alt,
}) => (
  <AbsoluteFill
    style={{
      backgroundColor: alt ? L.bgAlt : L.bg,
      backgroundImage: [
        `radial-gradient(1400px 800px at 50% 40%, rgba(255,253,250,.8), transparent 70%)`,
        `repeating-linear-gradient(0deg, rgba(34,29,23,.035) 0 1px, transparent 1px 120px)`,
        `repeating-linear-gradient(90deg, rgba(34,29,23,.035) 0 1px, transparent 1px 120px)`,
      ].join(','),
      fontFamily: FONT_DISPLAY,
      color: L.ink,
    }}
  >
    {children}
  </AbsoluteFill>
);

/* ---------- light browser frame ---------- */
export const BrowserL: React.FC<{
  width: number;
  height: number;
  url?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}> = ({width, height, url, children, style}) => (
  <div
    style={{
      width,
      height,
      border: `1.5px solid ${L.line}`,
      background: L.card,
      boxShadow: '0 30px 90px rgba(34,29,23,.16)',
      display: 'flex',
      flexDirection: 'column',
      borderRadius: 10,
      overflow: 'hidden',
      ...style,
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 20px',
        borderBottom: `1.5px solid ${L.line}`,
        background: L.bg,
        flex: 'none',
      }}
    >
      <div style={{width: 12, height: 12, borderRadius: 6, background: L.line}} />
      <div style={{width: 12, height: 12, borderRadius: 6, background: L.line}} />
      <div style={{width: 12, height: 12, borderRadius: 6, background: L.line}} />
      {url ? (
        <div
          style={{
            flex: 1,
            border: `1.5px solid ${L.line}`,
            borderRadius: 8,
            padding: '7px 16px',
            fontFamily: FONT_MONO,
            fontSize: 22,
            color: L.body,
            background: L.card,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          {url}
        </div>
      ) : null}
    </div>
    <div style={{flex: 1, overflow: 'hidden', position: 'relative'}}>{children}</div>
  </div>
);

/* ---------- headline on parchment ---------- */
export const TitleL: React.FC<{
  children: React.ReactNode;
  size?: number;
  style?: React.CSSProperties;
}> = ({children, size, style}) => {
  const {V} = useLayout();
  return (
    <h1
      style={{
        margin: 0,
        fontSize: size ?? (V ? 68 : 78),
        fontWeight: 700,
        letterSpacing: '-0.02em',
        lineHeight: 1.08,
        color: L.ink,
        ...style,
      }}
    >
      {children}
    </h1>
  );
};

export const Kicker: React.FC<{children: React.ReactNode; style?: React.CSSProperties}> = ({
  children,
  style,
}) => (
  <div
    style={{
      fontFamily: FONT_MONO,
      fontSize: 24,
      letterSpacing: '0.24em',
      color: L.faint,
      textTransform: 'uppercase',
      ...style,
    }}
  >
    {children}
  </div>
);

/* ---------- receipts ticker, light ---------- */
export const LogRowL: React.FC<{items: {at: number; text: string; ok?: boolean}[]}> = ({
  items,
}) => {
  const frame = useCurrentFrame();
  const {V} = useLayout();
  return (
    <div
      style={{
        position: 'absolute',
        left: V ? 60 : 120,
        bottom: V ? 90 : 46,
        fontFamily: FONT_MONO,
        fontSize: V ? 27 : 25,
        color: L.faint,
        display: 'flex',
        gap: V ? 26 : 42,
        flexWrap: 'wrap',
      }}
    >
      {items.map((it, i) => (
        <span
          key={i}
          style={{opacity: frame >= it.at ? 1 : 0, color: it.ok ? L.forest : L.faint}}
        >
          {it.text}
        </span>
      ))}
    </div>
  );
};

/* ---------- seldon mark, ink-on-parchment ---------- */
export const MarkInk: React.FC<{size: number; boxed?: boolean; stroke?: string}> = ({
  size,
  boxed,
  stroke: strokeProp,
}) => {
  const stroke = strokeProp ?? (boxed ? L.onForest : L.forest);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      {boxed ? <rect width="100" height="100" rx="24" fill={L.forest} /> : null}
      <line x1="22" y1="22" x2="58" y2="22" stroke={stroke} strokeWidth="4" strokeLinecap="round" />
      <line x1="78" y1="42" x2="78" y2="78" stroke={stroke} strokeWidth="4" strokeLinecap="round" />
      <line x1="78" y1="78" x2="22" y2="78" stroke={stroke} strokeWidth="4" strokeLinecap="round" />
      <line x1="22" y1="78" x2="22" y2="22" stroke={stroke} strokeWidth="4" strokeLinecap="round" />
      <circle cx="22" cy="22" r="7" fill={stroke} />
      <circle cx="78" cy="22" r="7" fill="none" stroke={stroke} strokeWidth="4" />
      <circle cx="78" cy="78" r="7" fill={stroke} />
      <circle cx="22" cy="78" r="7" fill={stroke} />
    </svg>
  );
};

/* ---------- animated visitor cursor with click ripples ---------- */
export type CursorStop = {at: number; x: number; y: number; click?: boolean};

export const Cursor: React.FC<{stops: CursorStop[]; scale?: number}> = ({stops, scale = 1}) => {
  const frame = useCurrentFrame();
  if (frame < stops[0].at) return null;

  let x = stops[stops.length - 1].x;
  let y = stops[stops.length - 1].y;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const bStop = stops[i + 1];
    if (frame <= bStop.at) {
      const t = interpolate(frame, [a.at, bStop.at], [0, 1], {
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      x = a.x + (bStop.x - a.x) * t;
      y = a.y + (bStop.y - a.y) * t;
      break;
    }
  }

  return (
    <>
      {stops
        .filter((s) => s.click && frame >= s.at && frame <= s.at + 16)
        .map((s, i) => {
          const p = (frame - s.at) / 16;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: s.x - 34 * p,
                top: s.y - 34 * p,
                width: 68 * p,
                height: 68 * p,
                borderRadius: '50%',
                border: `3px solid ${L.forest}`,
                opacity: 1 - p,
                pointerEvents: 'none',
              }}
            />
          );
        })}
      <svg
        width={34 * scale}
        height={34 * scale}
        viewBox="0 0 24 24"
        style={{
          position: 'absolute',
          left: x,
          top: y,
          filter: 'drop-shadow(0 3px 8px rgba(34,29,23,.35))',
          pointerEvents: 'none',
        }}
      >
        <path
          d="M5 3 L19 12.5 L12.5 13.8 L15.5 20.5 L13 21.6 L10 14.8 L5 19 Z"
          fill="#FFFDFA"
          stroke="#221D17"
          strokeWidth="1.6"
        />
      </svg>
    </>
  );
};
