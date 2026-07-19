import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {b, C, FONT_MONO} from '../theme';
import {Accent, BuildLog, fade, Stamp, Stage, Title, useLayout} from '../components/core';

const FEES = ['per-seat fee', 'per-contact fee', 'usage overages', 'upgrade to unlock…'];
const METER = [89, 142, 218, 305, 418, 560, 727];
const PERKS = [
  'no meters, no per-seat tax',
  'unlimited workspaces',
  'open source — yours to keep',
  'your keys, your data, your clients',
];

export const S6NoMeters: React.FC = () => {
  const frame = useCurrentFrame();
  const {V, W, H} = useLayout();

  const panelW = V ? 900 : 760;
  const panelH = V ? 700 : 640;
  const leftX = V ? (W - panelW) / 2 : 150;
  const rightX = V ? (W - panelW) / 2 : W - 150 - panelW;
  const leftY = V ? 360 : 250;
  const rightY = V ? 1120 : 250;

  const meterIdx = Math.min(
    METER.length - 1,
    Math.max(0, Math.floor(interpolate(frame, [b(2.5), b(5.5)], [0, METER.length], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })))
  );
  // tiny shake while the meter climbs
  const shaking = frame >= b(2.5) && frame <= b(5.5);
  const shake = shaking ? Math.sin(frame * 2.1) * 2.2 : 0;

  const flat = interpolate(frame, [b(6.5), b(8)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <Stage>
      <Title at={b(0.5)}>
        We don&apos;t <Accent>tax your work.</Accent>
      </Title>

      {/* the meter platforms */}
      <Stamp at={b(1)} style={{position: 'absolute', left: leftX, top: leftY, width: panelW}}>
        <div style={{border: `2px solid ${C.moss}`, background: C.pine, padding: '40px 48px', height: panelH}}>
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 23,
              letterSpacing: '0.24em',
              color: C.dim,
              marginBottom: 30,
            }}
          >
            THE METER PLATFORMS
          </div>
          {FEES.map((f, i) => (
            <div
              key={f}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: FONT_MONO,
                fontSize: 29,
                color: C.dim,
                borderBottom: '1.5px solid rgba(94,110,99,.4)',
                padding: '18px 0',
                opacity: fade(frame, b(1.5 + i * 0.5), 3),
              }}
            >
              <span>{f}</span>
              <span>+ $</span>
            </div>
          ))}
          <div
            style={{
              marginTop: 36,
              fontFamily: FONT_MONO,
              color: C.dim,
              display: 'flex',
              alignItems: 'baseline',
              gap: 20,
              transform: `translateX(${shake}px)`,
              opacity: fade(frame, b(2.5), 3),
            }}
          >
            <span style={{fontSize: 56}}>${METER[meterIdx]}</span>
            <span style={{fontSize: 23, letterSpacing: '0.1em'}}>/mo · and climbing</span>
          </div>
        </div>
      </Stamp>

      {/* seldonframe */}
      <Stamp at={b(6)} style={{position: 'absolute', left: rightX, top: rightY, width: panelW}}>
        <div
          style={{
            border: `2px solid ${C.sage}`,
            background: C.pine,
            padding: '40px 48px',
            height: panelH,
            boxShadow: '0 30px 90px rgba(0,0,0,.45)',
          }}
        >
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 23,
              letterSpacing: '0.24em',
              color: C.sand,
              marginBottom: 30,
            }}
          >
            SELDONFRAME
          </div>
          <div style={{fontSize: 140, fontWeight: 700, color: C.sand, letterSpacing: '-0.03em', lineHeight: 1}}>
            $29
            <span style={{fontSize: 42, fontWeight: 500, color: C.sage, letterSpacing: 0}}>
              /mo flat
            </span>
          </div>
          <div style={{margin: '32px 0 34px', height: 4, background: C.sand, width: `${flat * 100}%`}} />
          {PERKS.map((p, i) => (
            <div
              key={p}
              style={{
                fontFamily: FONT_MONO,
                fontSize: 28,
                color: C.sage,
                padding: '13px 0',
                opacity: fade(frame, b(7.5 + i * 0.5), 3),
              }}
            >
              <span style={{color: C.sand}}>✓</span> {p}
            </div>
          ))}
        </div>
      </Stamp>

      <BuildLog items={[{at: b(11), text: '✓ one booked job pays for the year', ok: true}]} />
    </Stage>
  );
};
