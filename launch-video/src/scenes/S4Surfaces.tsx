import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {b, BEAT, C, FONT_MONO} from '../theme';
import {Accent, BuildLog, fade, Mark, Stamp, Stage, Title, useLayout} from '../components/core';

const ENDS = [
  {name: 'Phone', line: '"Thanks for calling — how can I help?"'},
  {name: 'SMS', line: '"We can fit you in Thursday 2pm."'},
  {name: 'Web chat', line: '"Want me to book that for you?"'},
  {name: 'Email', line: '"Here\'s your quote, valid 30 days."'},
  {name: 'DM', line: '"Yes — we\'re open Saturdays."'},
];

export const S4Surfaces: React.FC = () => {
  const frame = useCurrentFrame();
  const {V, W, H} = useLayout();

  const cx = W / 2;
  const cy = V ? H / 2 + 40 : 660;
  const cardW = V ? 400 : 300;

  // endpoint card positions (top-left corners)
  const P = V
    ? [
        {x: 60, y: 480},
        {x: 620, y: 480},
        {x: cx - cardW / 2, y: 300},
        {x: 60, y: 1500},
        {x: 620, y: 1500},
      ]
    : [
        {x: 130, y: 320},
        {x: 130, y: 770},
        {x: cx - cardW / 2, y: 240},
        {x: W - 130 - cardW, y: 320},
        {x: W - 130 - cardW, y: 770},
      ];

  // wire anchor on each card (edge facing the core)
  const anchor = (p: {x: number; y: number}) => {
    const px = p.x + cardW / 2;
    const py = p.y + 60;
    return {x: px + (cx - px) * 0.32, y: py + (cy - py) * 0.28, px, py};
  };

  const drawIn = (i: number) =>
    interpolate(frame, [b(0.8 + i * 0.25), b(2.2 + i * 0.25)], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });

  // pulses travel core→endpoint on a loop, staggered per wire
  const pulseT = (i: number) => {
    const start = b(3 + i * 0.5);
    if (frame < start) return null;
    const cycle = ((frame - start) % (BEAT * 2.5)) / (BEAT * 2.5);
    return cycle;
  };

  return (
    <Stage>
      <Title at={b(0.5)}>
        Build once. It answers <Accent>everywhere.</Accent>
      </Title>

      <svg style={{position: 'absolute', inset: 0}} viewBox={`0 0 ${W} ${H}`}>
        {P.map((p, i) => {
          const a = anchor(p);
          const len = Math.hypot(a.px - cx, a.py - cy);
          const t = pulseT(i);
          return (
            <g key={i}>
              <line
                x1={cx}
                y1={cy}
                x2={a.px}
                y2={a.py}
                stroke={C.moss}
                strokeWidth={2}
                strokeDasharray={len}
                strokeDashoffset={len * (1 - drawIn(i))}
              />
              {t !== null ? (
                <circle
                  cx={cx + (a.px - cx) * t}
                  cy={cy + (a.py - cy) * t}
                  r={7}
                  fill={C.sand}
                  opacity={interpolate(t, [0, 0.08, 0.85, 1], [0, 1, 1, 0])}
                />
              ) : null}
            </g>
          );
        })}
      </svg>

      {ENDS.map((e, i) => (
        <Stamp
          key={e.name}
          at={b(1.2 + i * 0.35)}
          style={{position: 'absolute', left: P[i].x, top: P[i].y, width: cardW}}
        >
          <div
            style={{
              border: `2px solid ${C.moss}`,
              background: C.pine,
              padding: '20px 24px',
              textAlign: 'center',
            }}
          >
            <div style={{fontSize: V ? 38 : 36, fontWeight: 700}}>{e.name}</div>
            <div style={{fontFamily: FONT_MONO, fontSize: V ? 21 : 20, color: C.sage, marginTop: 8}}>
              {e.line}
            </div>
          </div>
        </Stamp>
      ))}

      {/* core */}
      <Stamp
        at={b(0.8)}
        style={{position: 'absolute', left: cx - 130, top: cy - 130, width: 260, height: 260}}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            border: `2px solid ${C.sage}`,
            background: C.pine,
            boxShadow: '0 30px 90px rgba(0,0,0,.45)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
          }}
        >
          <Mark size={92} />
          <div style={{fontFamily: FONT_MONO, fontSize: 21, letterSpacing: '0.24em', color: C.sand}}>
            ONE AGENT
          </div>
        </div>
      </Stamp>

      <div
        style={{
          position: 'absolute',
          bottom: V ? 210 : 116,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: FONT_MONO,
          fontSize: V ? 26 : 30,
          color: C.sage,
          letterSpacing: '0.06em',
          opacity: fade(frame, b(7), 5),
        }}
      >
        same brain · same guardrails · <span style={{color: C.sand}}>zero missed leads</span>
      </div>

      <BuildLog items={[{at: b(4), text: '✓ 5 surfaces live', ok: true}]} />
    </Stage>
  );
};
