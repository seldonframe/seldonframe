import React from 'react';
import {useCurrentFrame} from 'remotion';
import {b, FONT_MONO, L} from '../theme';
import {fade, Stamp, TypeOn, useLayout} from '../components/core';
import {Kicker, LogRowL, StageL, TitleL} from '../components/light';

/**
 * The lock-in pain, inverted. Copy mirrors the live /agencies ownership
 * block: "Own everything. Leave anytime."
 */
export const V2S5OwnIt: React.FC = () => {
  const frame = useCurrentFrame();
  const {V} = useLayout();

  const cardW = V ? 940 : 1180;

  return (
    <StageL alt>
      <div style={{position: 'absolute', top: V ? 220 : 110, left: 0, right: 0, textAlign: 'center'}}>
        <Kicker style={{opacity: fade(frame, 2, 4)}}>NOT RENTED. OWNED.</Kicker>
        <div style={{marginTop: 24, opacity: fade(frame, 6, 4)}}>
          <TitleL size={V ? 76 : 96}>
            Own everything. <span style={{color: L.gold}}>Leave anytime.</span>
          </TitleL>
        </div>
      </div>

      <Stamp
        at={b(2.5)}
        style={{
          position: 'absolute',
          left: '50%',
          top: V ? 640 : 420,
          width: cardW,
          marginLeft: -cardW / 2,
        }}
      >
        <div
          style={{
            background: L.forest,
            borderRadius: 14,
            padding: V ? '44px 52px' : '52px 64px',
            color: L.onForest,
            boxShadow: '0 30px 90px rgba(31,43,36,.35)',
            fontFamily: FONT_MONO,
          }}
        >
          <div style={{fontSize: V ? 26 : 30, opacity: 0.65}}>
            $ <TypeOn text="docker compose up" start={b(3)} end={b(5)} caret={frame < b(6)} />
          </div>
          <div style={{fontSize: V ? 24 : 28, marginTop: 24, opacity: fade(frame, b(5.5), 4)}}>
            ghcr.io/seldonframe/seldonframe · <span style={{color: L.gold}}>open source</span>
          </div>
          <div
            style={{
              marginTop: 34,
              paddingTop: 30,
              borderTop: '1.5px solid rgba(246,242,234,.2)',
              display: 'flex',
              gap: V ? 24 : 44,
              flexWrap: 'wrap',
              fontSize: V ? 24 : 27,
            }}
          >
            {['your clients', 'your data', 'yours to keep'].map((t, i) => (
              <span key={t} style={{opacity: fade(frame, b(7 + i * 0.7), 4)}}>
                ✓ {t}
              </span>
            ))}
          </div>
        </div>
      </Stamp>

      <div
        style={{
          position: 'absolute',
          bottom: V ? 220 : 130,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: V ? 32 : 38,
          fontWeight: 500,
          color: L.body,
          opacity: fade(frame, b(9.5), 5),
          padding: '0 100px',
        }}
      >
        If you ever leave, <span style={{color: L.ink, fontWeight: 700}}>everything comes with you.</span>
      </div>

      <LogRowL items={[{at: b(6), text: '✓ self-hostable', ok: true}]} />
    </StageL>
  );
};
