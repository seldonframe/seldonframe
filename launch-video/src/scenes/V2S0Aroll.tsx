import React from 'react';
import {useCurrentFrame} from 'remotion';
import {b, FONT_MONO, L} from '../theme';
import {fade, Stamp, useLayout} from '../components/core';
import {Kicker, MarkInk, StageL, TitleL} from '../components/light';

/**
 * 0:00–0:05.4 = A-ROLL SLOT (founder hook to camera, clip A from SHOT-LIST.md).
 * 0:05.4–0:07.8 = the category card (stays in the final cut — we hard-cut from
 * Max's face to this title).
 */
export const V2S0Aroll: React.FC = () => {
  const frame = useCurrentFrame();
  const {V} = useLayout();
  const CARD = b(9);

  return (
    <StageL>
      {frame < CARD ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <div
            style={{
              width: V ? 900 : 1400,
              border: `2px dashed ${L.faint}`,
              borderRadius: 12,
              padding: V ? '90px 60px' : '110px 90px',
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
              A-ROLL SLOT 01 · FOUNDER HOOK · 0:00–0:05
            </div>
            <div style={{fontSize: V ? 38 : 44, fontWeight: 500, color: L.body, lineHeight: 1.4}}>
              “If you sell websites, AI agents, or automations to local businesses, you know
              the drill — weeks of setup per client, meters on every text, and a platform you
              can never leave.{' '}
              <span style={{color: L.ink, fontWeight: 700}}>We built the opposite.</span>”
            </div>
          </div>
        </div>
      ) : (
        <Stamp
          at={CARD}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '0 90px',
          }}
        >
          <div style={{marginBottom: 44}}>
            <MarkInk size={V ? 120 : 110} boxed />
          </div>
          <TitleL size={V ? 84 : 104}>
            The AI front office platform
            <br />
            agencies <span style={{textDecoration: 'underline', textDecorationColor: L.gold, textUnderlineOffset: 12}}>actually own.</span>
          </TitleL>
          <Kicker style={{marginTop: 40, opacity: fade(frame, CARD + 10, 5)}}>
            SELDONFRAME
          </Kicker>
        </Stamp>
      )}
    </StageL>
  );
};
