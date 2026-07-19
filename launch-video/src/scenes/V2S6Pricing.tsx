import React from 'react';
import {useCurrentFrame} from 'remotion';
import {b, FONT_MONO, L} from '../theme';
import {fade, ShotCrop, Stamp, useLayout} from '../components/core';
import {BrowserL, Kicker, LogRowL, StageL} from '../components/light';

/**
 * The stacked-pricing pain, inverted. "$497/mo just to unlock reselling"
 * is the verified SaaS-Mode gate phrasing (see prohibited-claims guards).
 * Real client sites (skinney + rejuvenate) flank the price as the
 * white-label proof.
 */
export const V2S6Pricing: React.FC = () => {
  const frame = useCurrentFrame();
  const {V, W} = useLayout();

  const siteW = V ? 470 : 560;
  const siteH = V ? 300 : 310;

  return (
    <StageL>
      {/* elsewhere: the gate */}
      <div
        style={{
          position: 'absolute',
          top: V ? 200 : 96,
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: fade(frame, b(0.5), 4),
        }}
      >
        <div style={{fontFamily: FONT_MONO, fontSize: V ? 26 : 30, color: L.faint}}>
          elsewhere:{' '}
          <span style={{textDecoration: 'line-through', textDecorationColor: '#B0714F'}}>
            $497/mo
          </span>{' '}
          just to unlock reselling
        </div>
      </div>

      {/* the price */}
      <Stamp
        at={b(2)}
        style={{position: 'absolute', top: V ? 420 : 220, left: 0, right: 0, textAlign: 'center'}}
      >
        <div style={{fontSize: V ? 190 : 230, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1, color: L.ink}}>
          $99
          <span style={{fontSize: V ? 52 : 62, fontWeight: 500, color: L.body, letterSpacing: 0}}>
            /mo flat
          </span>
        </div>
        <div style={{marginTop: 18, fontSize: V ? 34 : 40, fontWeight: 600, color: L.ink}}>
          White-label every client. <span style={{color: L.gold}}>Start free.</span>
        </div>
        <Kicker style={{marginTop: 16, opacity: fade(frame, b(4), 4)}}>
          no meters · no per-client tax · cancel anytime
        </Kicker>
      </Stamp>

      {/* white-label proof: two more REAL client sites */}
      <Stamp
        at={b(4.5)}
        style={{position: 'absolute', left: V ? 60 : W / 2 - siteW - 40, top: V ? 1130 : 680}}
      >
        <BrowserL width={siteW} height={siteH} url={<span style={{fontSize: 17}}>skinney-medspa…</span>}>
          <ShotCrop src="skinney-medspa-live.jpeg" cw={siteW - 3} ch={siteH - 54} iw={1920} ih={1080} />
        </BrowserL>
      </Stamp>
      <Stamp
        at={b(5.2)}
        style={{position: 'absolute', left: V ? 550 : W / 2 + 40, top: V ? 1130 : 680}}
      >
        <BrowserL width={siteW} height={siteH} url={<span style={{fontSize: 17}}>rejuvenate-medspa…</span>}>
          <ShotCrop src="rejuvenate-medspa-live.jpeg" cw={siteW - 3} ch={siteH - 54} iw={1920} ih={1080} />
        </BrowserL>
      </Stamp>

      <LogRowL
        items={[
          {at: b(5.5), text: '✓ client 2', ok: true},
          {at: b(6.2), text: '✓ client 3', ok: true},
          {at: b(7), text: '$ same $99. no extra tax.'},
        ]}
      />
    </StageL>
  );
};
