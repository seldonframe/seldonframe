import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {b, C, FONT_MONO} from '../theme';
import {Accent, BuildLog, fade, Mark, Stamp, Stage, Title, useLayout} from '../components/core';

const TILES = [
  {n: '01', name: 'Surface', what: 'where it answers'},
  {n: '02', name: 'Skill', what: 'what it knows how to do'},
  {n: '03', name: 'Tools', what: 'what it can touch'},
  {n: '04', name: 'Knowledge', what: 'what it remembers'},
  {n: '05', name: 'Guardrails', what: 'what it will never say'},
  {n: '06', name: 'Voice', what: 'how it sounds'},
];

export const S3Primitives: React.FC = () => {
  const frame = useCurrentFrame();
  const {V, W, H} = useLayout();

  // tile positions: 3 left / 3 right around a center core (landscape),
  // 2×3 grid above/below the core (vertical)
  const cx = W / 2;
  const cy = V ? H / 2 + 60 : 640;

  const pos = V
    ? [
        {x: 150, y: 560},
        {x: 150, y: 1180},
        {x: 150, y: 1400},
        {x: 590, y: 560},
        {x: 590, y: 1180},
        {x: 590, y: 1400},
      ]
    : [
        {x: 190, y: 300},
        {x: 190, y: 560},
        {x: 190, y: 795},
        {x: 1390, y: 300},
        {x: 1390, y: 560},
        {x: 1390, y: 795},
      ];
  // vertical layout: put tiles 0/3 above core, others below — simpler: two columns of 3, core centered between rows
  const vpos = [
    {x: 70, y: 480},
    {x: 70, y: 1350},
    {x: 70, y: 1580},
    {x: 570, y: 480},
    {x: 570, y: 1350},
    {x: 570, y: 1580},
  ];
  const P = V ? vpos : pos;
  const tileW = V ? 440 : 340;

  const draw = (i: number) =>
    interpolate(frame, [b(2.2 + i * 0.3), b(4 + i * 0.3)], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });

  return (
    <Stage>
      <Title at={b(0.5)}>
        Every agent is the same <Accent>six parts.</Accent>
      </Title>

      {/* wires */}
      <svg
        style={{position: 'absolute', inset: 0, pointerEvents: 'none'}}
        viewBox={`0 0 ${W} ${H}`}
      >
        {P.map((p, i) => {
          const fromX = p.x + (p.x < cx ? tileW : 0);
          const fromY = p.y + 70;
          const len = Math.hypot(cx - fromX, cy - fromY);
          return (
            <line
              key={i}
              x1={fromX}
              y1={fromY}
              x2={cx}
              y2={cy}
              stroke={C.sage}
              strokeWidth={2}
              opacity={0.6}
              strokeDasharray={len}
              strokeDashoffset={len * (1 - draw(i))}
            />
          );
        })}
      </svg>

      {/* primitive tiles */}
      {TILES.map((t, i) => (
        <Stamp
          key={t.n}
          at={b(1.5 + i * 0.5)}
          style={{position: 'absolute', left: P[i].x, top: P[i].y, width: tileW}}
        >
          <div style={{border: `2px solid ${C.moss}`, background: C.pine, padding: '24px 28px'}}>
            <div
              style={{fontFamily: FONT_MONO, fontSize: 21, color: C.moss, letterSpacing: '0.2em'}}
            >
              / {t.n}
            </div>
            <div style={{fontSize: V ? 36 : 40, fontWeight: 700, marginTop: 6}}>{t.name}</div>
            <div style={{fontFamily: FONT_MONO, fontSize: V ? 20 : 22, color: C.sage, marginTop: 8}}>
              {t.what}
            </div>
          </div>
        </Stamp>
      ))}

      {/* agent core */}
      <Stamp
        at={b(1)}
        style={{
          position: 'absolute',
          left: cx - 150,
          top: cy - 150,
          width: 300,
          height: 300,
        }}
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
            gap: 18,
          }}
        >
          <Mark size={100} />
          <div
            style={{fontFamily: FONT_MONO, fontSize: 23, letterSpacing: '0.26em', color: C.sand}}
          >
            YOUR AGENT
          </div>
        </div>
      </Stamp>

      {/* payoff line */}
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
          opacity: fade(frame, b(8), 5),
        }}
      >
        swap any part · keep the rest · that&apos;s the whole trick
      </div>

      <BuildLog
        items={[
          {at: b(1.5), text: '$ composing agent from primitives …'},
          {at: b(6), text: '✓ 6/6 bound', ok: true},
        ]}
      />
    </Stage>
  );
};
