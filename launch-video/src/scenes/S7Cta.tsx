import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {b, BEAT, C, FONT_MONO} from '../theme';
import {
  Accent,
  Browser,
  BuildLog,
  fade,
  Mark,
  ShotCrop,
  Stamp,
  Stage,
  useLayout,
} from '../components/core';

/**
 * Real-UI montage (proof it exists today) → flywheel → end card.
 * Dashboard shots crop left 17% (sidebar + account email) and top ~5.5%
 * (double browser chrome); the booking shot crops its header (demo phone).
 */
const MONTAGE = [
  {shot: 'crm-pipeline.png', iw: 1916, ih: 1090, crop: {l: 0.17, t: 0.24, r: 0.015}, cap: 'the CRM your clients log into'},
  {shot: 'agents.png', iw: 1918, ih: 1088, crop: {l: 0.17, t: 0.2, r: 0.015}, cap: 'the 4 automations every niche needs'},
  {shot: 'booking-page.png', iw: 1917, ih: 1092, crop: {t: 0.19, r: 0.012}, cap: 'the calendar that fills itself'},
];

const NODES = ['Build in minutes', 'Demo the live link', 'Client signs', 'Retainer renews'];

export const S7Cta: React.FC = () => {
  const frame = useCurrentFrame();
  const {V, W, H} = useLayout();

  const montageEnd = b(4.5);
  const wheelEnd = b(9.5);
  const inMontage = frame < montageEnd;
  const inWheel = frame >= montageEnd && frame < wheelEnd;
  const shotIdx = Math.min(2, Math.floor(frame / b(1.5)));

  const bw = V ? 960 : 1420;
  const bh = V ? 900 : 800;

  // flywheel geometry
  const cx = W / 2;
  const cy = V ? H / 2 : 600;
  const rx = V ? 380 : 470;
  const ry = V ? 560 : 300;
  const nodePos = [
    {x: cx, y: cy - ry},
    {x: cx + rx, y: cy},
    {x: cx, y: cy + ry},
    {x: cx - rx, y: cy},
  ];
  const orbit = ((frame - montageEnd) % (BEAT * 4)) / (BEAT * 4);

  return (
    <Stage>
      {/* --- phase 1: real UI montage --- */}
      {inMontage ? (
        <>
          <div
            style={{
              position: 'absolute',
              top: V ? 200 : 90,
              left: 0,
              right: 0,
              textAlign: 'center',
              fontFamily: FONT_MONO,
              fontSize: V ? 28 : 30,
              letterSpacing: '0.22em',
              color: C.sand,
              opacity: fade(frame, 2, 3),
            }}
          >
            ALL OF THIS EXISTS TODAY
          </div>
          <Stamp
            at={shotIdx * b(1.5) + 2}
            style={{
              position: 'absolute',
              left: '50%',
              top: V ? 380 : 180,
              marginLeft: -bw / 2,
            }}
          >
            <Browser width={bw} height={bh}>
              <ShotCrop
                src={MONTAGE[shotIdx].shot}
                cw={bw - 4}
                ch={bh - 62}
                iw={MONTAGE[shotIdx].iw}
                ih={MONTAGE[shotIdx].ih}
                crop={MONTAGE[shotIdx].crop}
              />
            </Browser>
            <div
              style={{
                marginTop: 26,
                textAlign: 'center',
                fontSize: V ? 32 : 36,
                fontWeight: 500,
                color: C.sage,
              }}
            >
              {MONTAGE[shotIdx].cap}
            </div>
          </Stamp>
        </>
      ) : null}

      {/* --- phase 2: the flywheel --- */}
      {inWheel ? (
        <>
          <Stamp
            at={montageEnd + 2}
            style={{position: 'absolute', top: V ? 210 : 86, left: 0, right: 0, textAlign: 'center'}}
          >
            <h1 style={{margin: 0, fontSize: V ? 64 : 78, fontWeight: 700}}>
              The loop the article promised. Running.
            </h1>
          </Stamp>
          <svg style={{position: 'absolute', inset: 0}} viewBox={`0 0 ${W} ${H}`}>
            <ellipse
              cx={cx}
              cy={cy}
              rx={rx}
              ry={ry}
              fill="none"
              stroke={C.moss}
              strokeWidth={2}
              strokeDasharray="14 12"
            />
            {[0, 0.5].map((off) => {
              const t = (orbit + off) % 1;
              const ang = t * Math.PI * 2 - Math.PI / 2;
              return (
                <circle
                  key={off}
                  cx={cx + rx * Math.cos(ang)}
                  cy={cy + ry * Math.sin(ang)}
                  r={9}
                  fill={C.sand}
                />
              );
            })}
          </svg>
          {NODES.map((n, i) => (
            <Stamp
              key={n}
              at={montageEnd + 4 + i * 6}
              style={{
                position: 'absolute',
                left: nodePos[i].x - (V ? 190 : 175),
                top: nodePos[i].y - 55,
                width: V ? 380 : 350,
              }}
            >
              <div
                style={{
                  border: `2px solid ${C.moss}`,
                  background: C.pine,
                  padding: '22px 26px',
                  textAlign: 'center',
                }}
              >
                <div style={{fontFamily: FONT_MONO, fontSize: 19, letterSpacing: '0.24em', color: C.sand}}>
                  / {i + 1}
                </div>
                <div style={{fontSize: V ? 34 : 36, fontWeight: 700, marginTop: 6}}>{n}</div>
              </div>
            </Stamp>
          ))}
        </>
      ) : null}

      {/* --- phase 3: end card --- */}
      {frame >= wheelEnd ? (
        <Stamp
          at={wheelEnd}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '0 80px',
          }}
        >
          <div style={{marginBottom: 44}}>
            <Mark size={V ? 140 : 130} boxed />
          </div>
          <h2 style={{margin: 0, fontSize: V ? 96 : 110, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1}}>
            Type a sentence.
            <br />
            Ship a <Accent>business.</Accent>
          </h2>
          <div
            style={{
              marginTop: 44,
              fontFamily: FONT_MONO,
              fontSize: V ? 40 : 44,
              color: C.paper,
              letterSpacing: '0.08em',
            }}
          >
            seldonframe.com
            <span
              style={{
                display: 'inline-block',
                width: 18,
                height: 42,
                background: C.sand,
                verticalAlign: 'middle',
                marginLeft: 10,
                opacity: Math.floor(frame / 15) % 2 === 0 ? 1 : 0,
              }}
            />
          </div>
        </Stamp>
      ) : null}

      <BuildLog
        items={
          frame < wheelEnd
            ? [{at: montageEnd + 4, text: '$ while (true) { build → demo → sign → renew }'}]
            : [{at: wheelEnd + 6, text: '✓ first workspace free', ok: true}]
        }
      />
    </Stage>
  );
};
