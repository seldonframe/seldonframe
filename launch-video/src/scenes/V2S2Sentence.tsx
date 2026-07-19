import React from 'react';
import {useCurrentFrame} from 'remotion';
import {b, FONT_MONO, L} from '../theme';
import {fade, ShotCrop, Stamp, TypeOn, useLayout} from '../components/core';
import {BrowserL, Kicker, LogRowL, StageL, TitleL} from '../components/light';

/**
 * "The part your clients never see": the SAME Metro Medspa site from the
 * demo scene came from one typed sentence.
 */
export const V2S2Sentence: React.FC = () => {
  const frame = useCurrentFrame();
  const {V, W} = useLayout();

  const bw = V ? 960 : 1140;
  const bh = V ? 620 : 540;
  const REVEAL = b(7);

  return (
    <StageL>
      <div style={{position: 'absolute', top: V ? 170 : 70, left: 0, right: 0, textAlign: 'center'}}>
        <Kicker style={{opacity: fade(frame, 2, 4)}}>THE PART THEIR CUSTOMERS NEVER SEE</Kicker>
        <div style={{marginTop: 22, opacity: fade(frame, 6, 4)}}>
          <TitleL size={V ? 62 : 72}>
            You typed <span style={{color: L.gold}}>one sentence.</span>
          </TitleL>
        </div>
      </div>

      {/* the sentence, terminal-style but light */}
      <Stamp
        at={b(1)}
        style={{
          position: 'absolute',
          left: '50%',
          top: V ? 460 : 300,
          width: V ? 940 : 1240,
          marginLeft: V ? -470 : -620,
        }}
      >
        <div
          style={{
            border: `1.5px solid ${L.line}`,
            borderRadius: 10,
            background: L.forest,
            boxShadow: '0 24px 70px rgba(34,29,23,.25)',
            padding: V ? '30px 34px' : '34px 42px',
            fontFamily: FONT_MONO,
            fontSize: V ? 28 : 34,
            color: L.onForest,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          <span style={{opacity: 0.55}}>&gt;&nbsp;</span>
          <TypeOn
            text="a front office for a medspa in St. Louis"
            start={b(1.5)}
            end={b(5.5)}
            caret={frame < REVEAL}
          />
        </div>
      </Stamp>

      {/* the same live site drops in below */}
      <Stamp
        at={REVEAL}
        style={{
          position: 'absolute',
          left: '50%',
          top: V ? 700 : 452,
          marginLeft: -bw / 2,
        }}
      >
        <BrowserL width={bw} height={bh} url={<span>metro-medspa-9d24.app.seldonframe.com</span>}>
          <ShotCrop
            src="metro-medspa-live.jpeg"
            cw={bw - 3}
            ch={bh - 56}
            iw={1920}
            ih={1080}
            zoomFrom={1}
            zoomTo={1.04}
            zoomStart={REVEAL}
            zoomEnd={b(17)}
          />
        </BrowserL>
      </Stamp>

      <LogRowL
        items={[
          {at: REVEAL + b(1), text: '✓ site', ok: true},
          {at: REVEAL + b(1.7), text: '✓ crm', ok: true},
          {at: REVEAL + b(2.4), text: '✓ calendar', ok: true},
          {at: REVEAL + b(3.1), text: '✓ intake', ok: true},
          {at: REVEAL + b(3.8), text: '✓ agent', ok: true},
          {at: REVEAL + b(5.2), text: 'live in minutes — not weeks', ok: false},
        ]}
      />
    </StageL>
  );
};
