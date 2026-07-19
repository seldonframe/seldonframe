import React from 'react';
import {Easing, interpolate, useCurrentFrame} from 'remotion';
import {b, FONT_MONO, L} from '../theme';
import {fade, Stamp, TypeOn, useLayout} from '../components/core';
import {Kicker, LogRowL, StageL, TitleL} from '../components/light';

/**
 * The complexity pain, inverted: change anything in plain English.
 * Command types → the booking card updates itself. No admin maze.
 */
export const V2S3NatLang: React.FC = () => {
  const frame = useCurrentFrame();
  const {V} = useLayout();

  const APPLY = b(8);
  const cardW = V ? 880 : 720;
  const depositPop = interpolate(frame, [APPLY, APPLY + 9], [0.5, 1], {
    easing: Easing.bezier(0.2, 0.9, 0.3, 1.2),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <StageL>
      <div style={{position: 'absolute', top: V ? 170 : 70, left: 0, right: 0, textAlign: 'center'}}>
        <Kicker style={{opacity: fade(frame, 2, 4)}}>NO CERTIFICATION COURSE · NO ADMIN MAZE</Kicker>
        <div style={{marginTop: 22, opacity: fade(frame, 6, 4)}}>
          <TitleL size={V ? 60 : 72}>
            Change anything in <span style={{color: L.gold}}>plain English.</span>
          </TitleL>
        </div>
      </div>

      {/* the command */}
      <Stamp
        at={b(1)}
        style={{
          position: 'absolute',
          left: '50%',
          top: V ? 460 : 320,
          width: V ? 940 : 1280,
          marginLeft: V ? -470 : -640,
        }}
      >
        <div
          style={{
            border: `1.5px solid ${L.line}`,
            borderRadius: 10,
            background: L.forest,
            boxShadow: '0 24px 70px rgba(34,29,23,.25)',
            padding: V ? '28px 32px' : '32px 40px',
            fontFamily: FONT_MONO,
            fontSize: V ? 27 : 33,
            color: L.onForest,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          <span style={{opacity: 0.55}}>&gt;&nbsp;</span>
          <TypeOn
            text="add a $50 deposit to new bookings"
            start={b(1.5)}
            end={b(6)}
            caret={frame < APPLY}
          />
        </div>
      </Stamp>

      {/* the booking card that updates itself */}
      <Stamp
        at={b(3)}
        style={{
          position: 'absolute',
          left: '50%',
          top: V ? 720 : 500,
          width: cardW,
          marginLeft: -cardW / 2,
        }}
      >
        <div
          style={{
            border: `1.5px solid ${L.line}`,
            borderRadius: 12,
            background: L.card,
            boxShadow: '0 24px 70px rgba(34,29,23,.14)',
            padding: '36px 44px',
          }}
        >
          <div style={{fontFamily: FONT_MONO, fontSize: 20, letterSpacing: '0.2em', color: L.faint}}>
            BOOKING PAGE · METRO MEDSPA
          </div>
          <div style={{fontSize: V ? 40 : 44, fontWeight: 700, marginTop: 14}}>
            HydraFacial — 60 min
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              marginTop: 22,
              fontSize: 28,
              color: L.body,
            }}
          >
            <span>$150</span>
            <span style={{color: L.line}}>·</span>
            <span>with Dana</span>
            {/* the change, landing */}
            {frame >= APPLY ? (
              <span
                style={{
                  marginLeft: 'auto',
                  background: L.forest,
                  color: L.onForest,
                  borderRadius: 999,
                  padding: '10px 22px',
                  fontSize: 24,
                  fontWeight: 700,
                  transform: `scale(${depositPop})`,
                }}
              >
                $50 deposit due today
              </span>
            ) : null}
          </div>
          <div
            style={{
              marginTop: 26,
              borderTop: `1.5px solid ${L.line}`,
              paddingTop: 22,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{fontFamily: FONT_MONO, fontSize: 21, color: L.faint}}>
              collect deposit on booking
            </span>
            {/* toggle that flips */}
            <div
              style={{
                width: 74,
                height: 40,
                borderRadius: 999,
                background: frame >= APPLY ? L.forest : L.line,
                position: 'relative',
                transition: 'none',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 4,
                  left: interpolate(frame, [APPLY, APPLY + 6], [4, 38], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  background: '#FFFDFA',
                  boxShadow: '0 2px 6px rgba(34,29,23,.25)',
                }}
              />
            </div>
          </div>
        </div>
      </Stamp>

      <LogRowL
        items={[
          {at: b(6.5), text: '$ applying …'},
          {at: APPLY + b(1), text: '✓ live on the booking page', ok: true},
        ]}
      />
    </StageL>
  );
};
