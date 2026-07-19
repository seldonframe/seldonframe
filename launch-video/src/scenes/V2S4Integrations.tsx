import React from 'react';
import {Easing, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {b, FONT_MONO, L} from '../theme';
import {fade, Stamp, useLayout} from '../components/core';
import {Kicker, LogRowL, StageL, TitleL} from '../components/light';

/**
 * PromptQL-style toggle wall with REAL logos, then the BYOK line —
 * the meters pain, inverted.
 */
const TILES = [
  {logo: 'logo-gcal.svg', name: 'Google Calendar', wide: false},
  {logo: 'logo-gmail.svg', name: 'Gmail', wide: false},
  {logo: 'logo-outlook.svg', name: 'Outlook', wide: false},
  {logo: 'logo-twilio.svg', name: 'Twilio', wide: true},
  {logo: 'logo-stripe.svg', name: 'Stripe', wide: false},
  {logo: 'logo-slack.svg', name: 'Slack', wide: false},
  {logo: 'logo-instagram.svg', name: 'Instagram', wide: false},
  {logo: 'logo-quickbooks.svg', name: 'QuickBooks', wide: false},
];

const Toggle: React.FC<{on: number}> = ({on}) => {
  const frame = useCurrentFrame();
  const active = frame >= on;
  return (
    <div
      style={{
        width: 62,
        height: 34,
        borderRadius: 999,
        background: active ? '#2E7D52' : L.line,
        position: 'relative',
        flex: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 4,
          left: interpolate(frame, [on, on + 5], [4, 32], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
          width: 26,
          height: 26,
          borderRadius: 13,
          background: '#FFFDFA',
          boxShadow: '0 2px 5px rgba(34,29,23,.25)',
        }}
      />
    </div>
  );
};

export const V2S4Integrations: React.FC = () => {
  const frame = useCurrentFrame();
  const {V} = useLayout();

  const cols = V ? 2 : 4;
  const tileW = V ? 460 : 380;
  const tileH = 104;
  const gap = 26;
  const gridW = cols * tileW + (cols - 1) * gap;
  const rows = Math.ceil(TILES.length / cols);
  const gridTop = V ? 560 : 380;

  const BYOK = b(10);

  return (
    <StageL>
      <div style={{position: 'absolute', top: V ? 170 : 70, left: 0, right: 0, textAlign: 'center'}}>
        <Kicker style={{opacity: fade(frame, 2, 4)}}>THE TOOLS THEY ALREADY USE</Kicker>
        <div style={{marginTop: 22, opacity: fade(frame, 6, 4)}}>
          <TitleL size={V ? 58 : 70}>
            Plugs into their stack. Runs on <span style={{color: L.gold}}>your keys.</span>
          </TitleL>
        </div>
      </div>

      {TILES.map((t, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const at = b(2 + i * 0.6);
        return (
          <Stamp
            key={t.name}
            at={at}
            style={{
              position: 'absolute',
              left: `calc(50% - ${gridW / 2 - col * (tileW + gap)}px)`,
              top: gridTop + row * (tileH + gap),
              width: tileW,
            }}
          >
            <div
              style={{
                height: tileH,
                border: `1.5px solid ${L.line}`,
                borderRadius: 12,
                background: L.card,
                boxShadow: '0 10px 30px rgba(34,29,23,.08)',
                display: 'flex',
                alignItems: 'center',
                gap: 18,
                padding: '0 24px',
              }}
            >
              <Img
                src={staticFile(t.logo)}
                style={{
                  width: t.wide ? 92 : 46,
                  height: t.wide ? 30 : 46,
                  objectFit: 'contain',
                  flex: 'none',
                }}
              />
              {/* wide logos (Twilio wordmark) already carry the name */}
              {!t.wide ? (
                <span style={{fontSize: 26, fontWeight: 600, color: L.ink}}>{t.name}</span>
              ) : null}
              <div style={{marginLeft: 'auto'}}>
                <Toggle on={at + 6} />
              </div>
            </div>
          </Stamp>
        );
      })}

      {/* BYOK line */}
      <div
        style={{
          position: 'absolute',
          top: gridTop + rows * (tileH + gap) + (V ? 60 : 44),
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: fade(frame, BYOK, 5),
        }}
      >
        <span
          style={{
            display: 'inline-block',
            background: L.forest,
            color: L.onForest,
            borderRadius: 999,
            padding: '16px 34px',
            fontSize: V ? 28 : 32,
            fontWeight: 600,
          }}
        >
          your API keys · wholesale costs · zero markup
        </span>
        <div
          style={{
            marginTop: 20,
            fontFamily: FONT_MONO,
            fontSize: V ? 24 : 26,
            color: L.body,
          }}
        >
          no usage meters. ever.
        </div>
      </div>

      <LogRowL items={[{at: b(9), text: '✓ 8 connections live', ok: true}]} />
    </StageL>
  );
};
