import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {b, C, FONT_MONO} from '../theme';
import {
  Accent,
  Browser,
  BuildLog,
  fade,
  ShotCrop,
  Stamp,
  Stage,
  Title,
  useLayout,
} from '../components/core';

/**
 * REAL client sites (from the live demo marquee) inside mini browser
 * frames — the whitelabel front office is not a mockup.
 */
const CLIENTS = [
  {shot: 'crown-plumbing.jpg', name: 'Crown Plumbing', vertical: 'plumbing'},
  {shot: 'rejuvenate-medspa.jpg', name: 'Rejuvenate Medspa', vertical: 'medspa'},
  {shot: 'the-cooling-specialists.jpg', name: 'The Cooling Specialists', vertical: 'hvac'},
];

export const S5FrontOffice: React.FC = () => {
  const frame = useCurrentFrame();
  const {V, W} = useLayout();

  const cardW = V ? 860 : 500;
  const cardH = V ? 320 : 360;
  const gap = V ? 40 : 60;
  const rowY = V ? 560 : 470;
  const startX = V ? (W - cardW) / 2 : (W - cardW * 3 - gap * 2) / 2;

  return (
    <Stage>
      <Title at={b(0.5)} size={V ? 64 : 76}>
        Deliver it as <Accent>your</Accent> product. Not ours.
      </Title>

      {/* agency node */}
      <Stamp
        at={b(1.5)}
        style={{
          position: 'absolute',
          left: '50%',
          top: V ? 380 : 220,
          width: 520,
          marginLeft: -260,
        }}
      >
        <div
          style={{
            border: `2px solid ${C.sage}`,
            background: C.pine,
            padding: '24px 32px',
            textAlign: 'center',
            boxShadow: '0 24px 70px rgba(0,0,0,.4)',
          }}
        >
          <div style={{fontFamily: FONT_MONO, fontSize: 21, letterSpacing: '0.26em', color: C.sand}}>
            THE BUILDER
          </div>
          <div style={{fontSize: 42, fontWeight: 700, marginTop: 6}}>Your Agency</div>
        </div>
      </Stamp>

      {/* wires down to the client sites */}
      {!V ? (
        <svg style={{position: 'absolute', inset: 0}} viewBox={`0 0 ${W} 1080`}>
          {CLIENTS.map((_, i) => {
            const tx = startX + i * (cardW + gap) + cardW / 2;
            const p = interpolate(frame, [b(2 + i * 0.3), b(3.2 + i * 0.3)], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            const len = Math.hypot(tx - W / 2, rowY - 350);
            return (
              <line
                key={i}
                x1={W / 2}
                y1={350}
                x2={tx}
                y2={rowY}
                stroke={C.moss}
                strokeWidth={2}
                strokeDasharray={len}
                strokeDashoffset={len * (1 - p)}
              />
            );
          })}
        </svg>
      ) : null}

      {/* real client sites */}
      {CLIENTS.map((cl, i) => {
        const x = V ? startX : startX + i * (cardW + gap);
        const y = V ? rowY + i * (cardH + 34) : rowY;
        return (
          <Stamp key={cl.name} at={b(3 + i * 1)} style={{position: 'absolute', left: x, top: y}}>
            <Browser
              width={cardW}
              height={cardH}
              url={
                <span style={{fontSize: 19}}>
                  {cl.vertical}…app.seldonframe.com
                </span>
              }
            >
              <ShotCrop
                src={cl.shot}
                cw={cardW - 4}
                ch={cardH - 62}
                iw={1280}
                ih={800}
                zoomFrom={1}
                zoomTo={1.05}
                zoomStart={b(3 + i)}
                zoomEnd={b(15)}
              />
            </Browser>
            {/* retainer badge */}
            <Stamp
              at={b(7 + i * 0.5)}
              style={{position: 'absolute', right: 16, top: cardH - 30}}
            >
              <div
                style={{
                  display: 'inline-block',
                  border: `2px solid ${C.sand}`,
                  background: C.pine,
                  color: C.sand,
                  fontFamily: FONT_MONO,
                  fontSize: 20,
                  letterSpacing: '0.12em',
                  padding: '10px 16px',
                }}
              >
                MONTHLY RETAINER
              </div>
            </Stamp>
          </Stamp>
        );
      })}

      <div
        style={{
          position: 'absolute',
          bottom: V ? 190 : 104,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: V ? 34 : 40,
          fontWeight: 500,
          color: C.sage,
          opacity: fade(frame, b(10), 5),
          padding: '0 90px',
        }}
      >
        A whitelabel AI front office per client —{' '}
        <span style={{color: C.paper, fontWeight: 700}}>your name on every screen.</span>
      </div>

      <BuildLog
        items={[
          {at: b(3.4), text: '✓ client 1 live', ok: true},
          {at: b(4.4), text: '✓ client 2 live', ok: true},
          {at: b(5.4), text: '✓ client 3 live', ok: true},
        ]}
      />
    </Stage>
  );
};
