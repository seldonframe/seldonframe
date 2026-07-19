import React from 'react';
import {useCurrentFrame} from 'remotion';
import {b, C, FONT_MONO} from '../theme';
import {Accent, BuildLog, fade, Mark, Stamp, Stage, TypeOn, useLayout} from '../components/core';

const CHORES = [
  ['build the ', 'skills folder'],
  ['wire a ', 'CRM'],
  ['set up ', 'booking + intake'],
  ['build the ', 'client dashboard'],
  ['broker the ', 'OAuth'],
  ['deploy + host ', 'all of it'],
] as const;

const SENTENCE = 'an AI receptionist for a roofing company';

export const S1Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const {V} = useLayout();

  const choresGone = frame >= b(12.5);
  const choresDim = frame >= b(6);

  return (
    <Stage>
      {/* Phase A — the article's chore pile */}
      {!choresGone ? (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: V ? 260 : 108,
            transform: 'translateX(-50%)',
            width: V ? 880 : 900,
            opacity: choresDim ? 0.1 : 1,
          }}
        >
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: V ? 28 : 26,
              letterSpacing: '0.24em',
              color: C.sage,
              marginBottom: 36,
              opacity: fade(frame, b(0.25), 3),
            }}
          >
            THE 1-PERSON-AGENCY ARTICLE SAYS:
          </div>
          {CHORES.map(([pre, hot], i) => (
            <div
              key={i}
              style={{
                fontFamily: FONT_MONO,
                fontSize: V ? 38 : 40,
                lineHeight: 1.95,
                color: C.sage,
                opacity: fade(frame, b(0.75 + i * 0.75), 3),
              }}
            >
              □ {pre}
              <span style={{color: C.paper, fontWeight: 500}}>{hot}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Phase B — the terminal */}
      {!choresGone ? (
        <Stamp
          at={b(6.5)}
          style={{
            position: 'absolute',
            left: '50%',
            top: V ? '62%' : '71%',
            width: V ? 950 : 1240,
            marginLeft: V ? -475 : -620,
            marginTop: -110,
          }}
        >
          <div
            style={{
              border: `2px solid ${C.moss}`,
              background: C.pine,
              boxShadow: '0 40px 120px rgba(0,0,0,.45)',
            }}
          >
            <div
              style={{
                display: 'flex',
                gap: 14,
                padding: '20px 26px',
                borderBottom: `2px solid ${C.moss}`,
              }}
            >
              <div style={{width: 15, height: 15, background: C.moss}} />
              <div style={{width: 15, height: 15, background: C.moss}} />
              <div style={{width: 15, height: 15, background: C.moss}} />
            </div>
            <div
              style={{
                padding: V ? '38px 40px 46px' : '42px 46px 52px',
                fontFamily: FONT_MONO,
                fontSize: V ? 30 : 38,
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{color: C.sage}}>&gt;&nbsp;</span>
              <TypeOn text={SENTENCE} start={b(7)} end={b(12)} style={{color: C.paper}} />
            </div>
          </div>
        </Stamp>
      ) : null}

      {/* Phase C — the payoff */}
      {choresGone ? (
        <Stamp
          at={b(12.5)}
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
          <div style={{marginBottom: 48}}>
            <Mark size={V ? 120 : 110} boxed />
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: V ? 104 : 132,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
            }}
          >
            Or type <Accent>one sentence.</Accent>
          </h1>
        </Stamp>
      ) : null}

      <BuildLog
        items={[
          {at: b(1), text: '$ the hard way: ~3 weeks'},
          {at: b(7), text: '$ seldonframe build …'},
          {at: b(12.75), text: '✓ done', ok: true},
        ]}
      />
    </Stage>
  );
};
