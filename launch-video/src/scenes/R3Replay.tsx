import React from 'react';
import {useCurrentFrame} from 'remotion';
import {R, R_FONT_MONO, R_FONT_SANS} from '../reelier-theme';
import {RCaption, RChip, RSettle, RStage, RTypeOn, rFade} from '../components/reelier';

// Step titles are the real `reelier init --yes` replay output; the claims
// (0 tokens, byte-identical, 1,000 replays, receipt per step) are the
// landing hero-sub + proof-strip numbers, all tagged MEASURED there.
export const R3Replay: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <RStage>
      <RSettle
        at={4}
        style={{position: 'absolute', left: '50%', top: '15%', transform: 'translate(-50%,-50%)'}}
      >
        <div style={{fontFamily: R_FONT_MONO, fontSize: 36}}>
          <span style={{color: R.muted}}>$ </span>
          <RTypeOn
            text="reelier run reelier-init-demo.skill.md"
            start={6}
            end={44}
            style={{color: R.text}}
          />
        </div>
      </RSettle>

      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '36%',
          transform: 'translate(-50%,-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          alignItems: 'center',
        }}
      >
        <RSettle at={52}>
          <RChip outcome="passed">Step 1 — GET npm registry metadata</RChip>
        </RSettle>
        <RSettle at={66}>
          <RChip outcome="passed">Step 2 — GET package homepage</RChip>
        </RSettle>
      </div>

      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '64%',
          transform: 'translate(-50%,-50%)',
          textAlign: 'center',
          whiteSpace: 'nowrap',
          opacity: rFade(frame, 88, 12),
        }}
      >
        <div
          style={{
            fontFamily: R_FONT_MONO,
            fontSize: 72,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: R.text,
          }}
        >
          0 tokens · byte-identical
        </div>
        <div style={{marginTop: 14, fontFamily: R_FONT_SANS, fontSize: 30, color: R.muted}}>
          a receipt on every step
        </div>
        <div style={{marginTop: 6, fontFamily: R_FONT_SANS, fontSize: 26, color: R.faint}}>
          1,000 replays, 1,000 identical — measured
        </div>
      </div>

      <RCaption at={124}>Replay it deterministically.</RCaption>
    </RStage>
  );
};
