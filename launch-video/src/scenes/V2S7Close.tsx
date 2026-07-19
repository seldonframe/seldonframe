import React from 'react';
import {useCurrentFrame} from 'remotion';
import {b, FONT_MONO, L} from '../theme';
import {Stamp, useLayout} from '../components/core';
import {MarkInk, StageL} from '../components/light';

/**
 * 0–3.6s = A-ROLL SLOT (clip B, the close). Then the end card on the
 * forest CTA slab — same slab the live site's final CTA uses.
 */
export const V2S7Close: React.FC = () => {
  const frame = useCurrentFrame();
  const {V} = useLayout();
  const CARD = b(6);

  return (
    <StageL>
      {frame < CARD ? (
        <div style={{position: 'absolute', inset: 0, display: 'grid', placeItems: 'center'}}>
          <div
            style={{
              width: V ? 900 : 1400,
              border: `2px dashed ${L.faint}`,
              borderRadius: 12,
              padding: V ? '90px 60px' : '100px 90px',
              textAlign: 'center',
              background: L.card,
            }}
          >
            <div
              style={{
                fontFamily: FONT_MONO,
                fontSize: 26,
                letterSpacing: '0.24em',
                color: L.faint,
                marginBottom: 30,
              }}
            >
              A-ROLL SLOT 02 · FOUNDER CLOSE · 0:68–0:72
            </div>
            <div style={{fontSize: V ? 40 : 48, fontWeight: 500, color: L.body, lineHeight: 1.4}}>
              “Type a sentence. Ship a business.{' '}
              <span style={{color: L.ink, fontWeight: 700}}>It's free to start.</span>”
            </div>
          </div>
        </div>
      ) : (
        <Stamp at={CARD} style={{position: 'absolute', inset: 0}}>
          {/* forest slab end card — mirrors --lp-cta-slab on the live site */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: L.forest,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              color: L.onForest,
              padding: '0 90px',
            }}
          >
            <div style={{marginBottom: 46}}>
              {/* forest slab needs the cream strokes — forest-on-forest is invisible */}
              <MarkInk size={V ? 130 : 120} stroke={L.onForest} />
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: V ? 92 : 108,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                lineHeight: 1.1,
              }}
            >
              Type a sentence.
              <br />
              Ship a <span style={{color: L.gold}}>business.</span>
            </h2>
            <div
              style={{
                marginTop: 46,
                fontFamily: FONT_MONO,
                fontSize: V ? 38 : 42,
                letterSpacing: '0.08em',
              }}
            >
              seldonframe.com
              <span
                style={{
                  display: 'inline-block',
                  width: 17,
                  height: 40,
                  background: L.gold,
                  verticalAlign: 'middle',
                  marginLeft: 10,
                  opacity: Math.floor(frame / 15) % 2 === 0 ? 1 : 0,
                }}
              />
            </div>
            <div
              style={{
                marginTop: 30,
                fontFamily: FONT_MONO,
                fontSize: V ? 24 : 26,
                opacity: 0.75,
              }}
            >
              ✓ start free · $99/mo when you're ready to white-label
            </div>
          </div>
        </Stamp>
      )}
    </StageL>
  );
};
