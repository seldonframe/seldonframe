import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {R, R_FONT_MONO, R_FONT_SANS} from '../reelier-theme';

/* ---------- stage backdrop: reelier dark, restrained ---------- */
export const RStage: React.FC<{children: React.ReactNode}> = ({children}) => (
  <AbsoluteFill
    style={{
      backgroundColor: R.bg,
      backgroundImage: `repeating-linear-gradient(0deg, ${R.border} 0 1px, transparent 1px 96px), repeating-linear-gradient(90deg, ${R.border} 0 1px, transparent 1px 96px)`,
      backgroundBlendMode: 'normal',
      opacity: 1,
      fontFamily: R_FONT_SANS,
      color: R.text,
    }}
  >
    <AbsoluteFill style={{backgroundImage: `radial-gradient(900px 560px at 50% 42%, rgba(35,35,38,.55), transparent 70%)`}} />
    {children}
  </AbsoluteFill>
);

/* ---------- clamped fade ---------- */
export const rFade = (f: number, at: number, dur = 12): number =>
  interpolate(f, [at, at + dur], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

/* ---------- calm settle-in: small rise + fade, never a bounce ---------- */
export const useRSettle = (at: number, distance = 14) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const p = spring({frame: frame - at, fps, config: {damping: 22, stiffness: 140, mass: 0.7}});
  const opacity = frame < at ? 0 : rFade(frame, at, 10);
  const y = interpolate(p, [0, 1], [distance, 0]);
  return {opacity, transform: `translateY(${y}px)`};
};

// Outer div carries the caller's own positioning (left/top/transform for
// centering); inner div carries the settle motion (opacity + translateY) —
// kept separate so the two `transform`s never clobber each other.
export const RSettle: React.FC<{at: number; distance?: number; style?: React.CSSProperties; children: React.ReactNode}> = ({
  at,
  distance,
  style,
  children,
}) => {
  const s = useRSettle(at, distance);
  return (
    <div style={style}>
      <div style={s}>{children}</div>
    </div>
  );
};

/* ---------- mono typing, cursor-caret ---------- */
export const RTypeOn: React.FC<{text: string; start: number; end: number; caret?: boolean; style?: React.CSSProperties}> = ({
  text,
  start,
  end,
  caret = true,
  style,
}) => {
  const frame = useCurrentFrame();
  const n = Math.round(
    interpolate(frame, [start, end], [0, text.length], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
  );
  const caretOn = Math.floor(frame / 15) % 2 === 0;
  const done = frame >= end;
  return (
    <span style={{fontFamily: R_FONT_MONO, ...style}}>
      {text.slice(0, n)}
      {caret && !done ? (
        <span
          style={{
            display: 'inline-block',
            width: '0.5em',
            height: '0.95em',
            background: R.accent,
            verticalAlign: 'text-bottom',
            marginLeft: 4,
            opacity: caretOn ? 1 : 0,
          }}
        />
      ) : null}
    </span>
  );
};

/* ---------- reelier mark — the play triangle + echo stroke (public/logo.svg, inline) ---------- */
export const RMark: React.FC<{size: number; color?: string}> = ({size, color}) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" role="img" aria-label="Reelier">
    <g stroke={color ?? R.text} strokeWidth="8" strokeLinejoin="round" strokeLinecap="round">
      <path d="M30 22 L78 50 L30 78 Z" />
      <line x1="18" y1="38" x2="18" y2="62" />
    </g>
  </svg>
);

/* ---------- terminal / editor card frame ---------- */
export const RCard: React.FC<{width: number; height?: number; title?: string; style?: React.CSSProperties; children: React.ReactNode}> = ({
  width,
  height,
  title,
  style,
  children,
}) => (
  <div
    style={{
      width,
      height,
      border: `1px solid ${R.border}`,
      borderRadius: 8,
      background: R.surface,
      boxShadow: '0 40px 120px rgba(0,0,0,.55)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      ...style,
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '13px 18px',
        borderBottom: `1px solid ${R.border}`,
        flex: 'none',
      }}
    >
      <div style={{width: 10, height: 10, borderRadius: 999, background: R.border}} />
      <div style={{width: 10, height: 10, borderRadius: 999, background: R.border}} />
      <div style={{width: 10, height: 10, borderRadius: 999, background: R.border}} />
      {title ? (
        <div
          style={{
            marginLeft: 8,
            fontFamily: R_FONT_MONO,
            fontSize: 15,
            color: R.faint,
          }}
        >
          {title}
        </div>
      ) : null}
    </div>
    <div style={{flex: 1, overflow: 'hidden', position: 'relative'}}>{children}</div>
  </div>
);

/* ---------- outcome chip: ✓ passed / ! unchecked / × failed (DESIGN.md glyph set) ---------- */
export const RChip: React.FC<{outcome: 'passed' | 'unchecked' | 'failed'; children: React.ReactNode; style?: React.CSSProperties}> = ({
  outcome,
  children,
  style,
}) => {
  const glyph = outcome === 'passed' ? '✓' : outcome === 'unchecked' ? '!' : '×';
  const color = outcome === 'passed' ? R.passed : outcome === 'unchecked' ? R.unchecked : R.failed;
  const tint = outcome === 'passed' ? R.passedTint : outcome === 'unchecked' ? R.uncheckedTint : R.failedTint;
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 16px',
        borderRadius: 4,
        border: `1px solid ${color}`,
        background: tint,
        fontFamily: R_FONT_MONO,
        fontSize: 22,
        color: R.text,
        ...style,
      }}
    >
      <span style={{color, fontWeight: 600}}>{glyph}</span>
      {children}
    </div>
  );
};

/* ---------- caption bar, bottom-center, calm ---------- */
export const RCaption: React.FC<{at: number; children: React.ReactNode}> = ({at, children}) => (
  <RSettle
    at={at}
    style={{
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 90,
      textAlign: 'center',
    }}
  >
    <div
      style={{
        display: 'inline-block',
        fontFamily: R_FONT_SANS,
        fontSize: 34,
        fontWeight: 600,
        letterSpacing: '-0.01em',
        color: R.text,
      }}
    >
      {children}
    </div>
  </RSettle>
);

export const RAccent: React.FC<{children: React.ReactNode}> = ({children}) => (
  <span style={{color: R.accent}}>{children}</span>
);
