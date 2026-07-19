import React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {C, FONT_DISPLAY, FONT_MONO} from '../theme';

export const useLayout = () => {
  const {width, height} = useVideoConfig();
  const V = height > width; // vertical (1080×1920) vs landscape (1920×1080)
  return {V, W: width, H: height};
};

/* ---------- stage backdrop: forest + faint grid + vignette ---------- */
export const Stage: React.FC<{children: React.ReactNode}> = ({children}) => (
  <AbsoluteFill
    style={{
      backgroundColor: C.forest,
      backgroundImage: [
        `radial-gradient(1200px 700px at 50% 45%, rgba(58,82,68,.28), transparent 70%)`,
        `repeating-linear-gradient(0deg, rgba(167,192,174,.05) 0 1px, transparent 1px 120px)`,
        `repeating-linear-gradient(90deg, rgba(167,192,174,.05) 0 1px, transparent 1px 120px)`,
      ].join(','),
      fontFamily: FONT_DISPLAY,
      color: C.paper,
    }}
  >
    {children}
  </AbsoluteFill>
);

/* ---------- clamped fade helper ---------- */
export const fade = (f: number, at: number, dur = 4): number =>
  interpolate(f, [at, at + dur], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

/* ---------- stamp-in: the brand move — snap-scale, never a slow fade ---------- */
export const useStamp = (at: number) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const p = spring({
    frame: frame - at,
    fps,
    config: {damping: 15, stiffness: 260, mass: 0.6},
  });
  const opacity = frame < at ? 0 : fade(frame, at, 3);
  const scale = interpolate(p, [0, 1], [1.07, 1]);
  return {opacity, transform: `scale(${scale})`};
};

export const Stamp: React.FC<{
  at: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({at, style, children}) => {
  const s = useStamp(at);
  return <div style={{...style, ...s}}>{children}</div>;
};

/* ---------- mono typing ---------- */
export const TypeOn: React.FC<{
  text: string;
  start: number;
  end: number;
  caret?: boolean;
  style?: React.CSSProperties;
}> = ({text, start, end, caret = true, style}) => {
  const frame = useCurrentFrame();
  const n = Math.round(
    interpolate(frame, [start, end], [0, text.length], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  );
  const caretOn = Math.floor(frame / 15) % 2 === 0;
  return (
    <span style={{fontFamily: FONT_MONO, ...style}}>
      {text.slice(0, n)}
      {caret ? (
        <span
          style={{
            display: 'inline-block',
            width: '0.55em',
            height: '1.05em',
            background: C.sand,
            verticalAlign: 'text-bottom',
            marginLeft: 6,
            opacity: caretOn ? 1 : 0,
          }}
        />
      ) : null}
    </span>
  );
};

/* ---------- build log: the ✓ receipts ticker, bottom-left ---------- */
export const BuildLog: React.FC<{
  items: {at: number; text: string; ok?: boolean}[];
}> = ({items}) => {
  const frame = useCurrentFrame();
  const {V} = useLayout();
  return (
    <div
      style={{
        position: 'absolute',
        left: V ? 60 : 120,
        bottom: V ? 90 : 44,
        fontFamily: FONT_MONO,
        fontSize: V ? 28 : 26,
        color: C.sage,
        letterSpacing: '0.02em',
        display: 'flex',
        gap: V ? 28 : 44,
        flexWrap: 'wrap',
      }}
    >
      {items.map((it, i) => (
        <span
          key={i}
          style={{opacity: frame >= it.at ? 1 : 0, color: it.ok ? C.sand : C.sage}}
        >
          {it.text}
        </span>
      ))}
    </div>
  );
};

/* ---------- seldon mark (inline so it stays crisp + recolorable) ---------- */
export const Mark: React.FC<{size: number; boxed?: boolean}> = ({size, boxed}) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    {boxed ? <rect width="100" height="100" rx="24" fill={C.pine} /> : null}
    <line x1="22" y1="22" x2="58" y2="22" stroke={C.paper} strokeWidth="4" strokeLinecap="round" />
    <line x1="78" y1="42" x2="78" y2="78" stroke={C.paper} strokeWidth="4" strokeLinecap="round" />
    <line x1="78" y1="78" x2="22" y2="78" stroke={C.paper} strokeWidth="4" strokeLinecap="round" />
    <line x1="22" y1="78" x2="22" y2="22" stroke={C.paper} strokeWidth="4" strokeLinecap="round" />
    <circle cx="22" cy="22" r="7" fill={C.paper} />
    <circle cx="78" cy="22" r="7" fill="none" stroke={C.paper} strokeWidth="4" />
    <circle cx="78" cy="78" r="7" fill={C.paper} />
    <circle cx="22" cy="78" r="7" fill={C.paper} />
  </svg>
);

/* ---------- browser device frame ---------- */
export const Browser: React.FC<{
  width: number;
  height: number;
  url?: React.ReactNode;
  hot?: boolean; // sage border for the hero frame
  children?: React.ReactNode;
  style?: React.CSSProperties;
}> = ({width, height, url, hot, children, style}) => (
  <div
    style={{
      width,
      height,
      border: `2px solid ${hot ? C.sage : C.moss}`,
      background: C.pine,
      boxShadow: '0 40px 120px rgba(0,0,0,.45)',
      display: 'flex',
      flexDirection: 'column',
      ...style,
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '16px 22px',
        borderBottom: `2px solid ${C.moss}`,
        flex: 'none',
      }}
    >
      <div style={{width: 13, height: 13, background: C.moss}} />
      <div style={{width: 13, height: 13, background: C.moss}} />
      <div style={{width: 13, height: 13, background: C.moss}} />
      {url ? (
        <div
          style={{
            flex: 1,
            border: `2px solid ${C.moss}`,
            padding: '8px 16px',
            fontFamily: FONT_MONO,
            fontSize: 24,
            color: C.sage,
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

/* ---------- real-screenshot crop: hides sidebars/emails/chrome exactly ---------- */
export const ShotCrop: React.FC<{
  src: string;
  cw: number; // container px
  ch: number;
  iw: number; // image natural px
  ih: number;
  crop?: {l?: number; t?: number; r?: number; b?: number}; // fractions to remove
  zoomFrom?: number; // subtle Ken Burns
  zoomTo?: number;
  zoomStart?: number;
  zoomEnd?: number;
}> = ({src, cw, ch, iw, ih, crop = {}, zoomFrom = 1, zoomTo = 1, zoomStart = 0, zoomEnd = 1}) => {
  const frame = useCurrentFrame();
  const l = crop.l ?? 0;
  const t = crop.t ?? 0;
  const r = crop.r ?? 0;
  const bt = crop.b ?? 0;
  const w0 = iw * (1 - l - r);
  const h0 = ih * (1 - t - bt);
  const s = Math.max(cw / w0, ch / h0);
  const zoom = interpolate(frame, [zoomStart, zoomEnd], [zoomFrom, zoomTo], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div style={{width: cw, height: ch, overflow: 'hidden', position: 'relative'}}>
      <Img
        src={staticFile(src)}
        style={{
          position: 'absolute',
          width: iw * s,
          height: ih * s,
          left: -iw * s * l,
          top: -ih * s * t,
          transform: `scale(${zoom})`,
          transformOrigin: 'top center',
        }}
      />
    </div>
  );
};

/* ---------- scene headline ---------- */
export const Title: React.FC<{
  at: number;
  children: React.ReactNode;
  size?: number;
}> = ({at, children, size}) => {
  const {V} = useLayout();
  return (
    <Stamp
      at={at}
      style={{
        position: 'absolute',
        top: V ? 150 : 74,
        left: 0,
        right: 0,
        textAlign: 'center',
        padding: V ? '0 70px' : '0 140px',
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: size ?? (V ? 72 : 80),
          fontWeight: 700,
          letterSpacing: '-0.01em',
          lineHeight: 1.08,
        }}
      >
        {children}
      </h1>
    </Stamp>
  );
};

export const Accent: React.FC<{children: React.ReactNode}> = ({children}) => (
  <span style={{color: C.sand}}>{children}</span>
);
