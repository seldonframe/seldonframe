import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {R, R_FONT_MONO, R_FONT_SANS} from '../reelier-theme';
import {RMark, RStage} from '../components/reelier';

// One number, then the card: "~50× cheaper ($0.019 vs ~$0.95 at 50 runs)"
// is the landing proof-strip figure, tagged MEASURED there.
export const R5Proof: React.FC = () => {
  const frame = useCurrentFrame();

  const statOpacity = interpolate(frame, [4, 14, 46, 56], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const endOpacity = interpolate(frame, [54, 68], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <RStage>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          opacity: statOpacity,
        }}
      >
        <div
          style={{
            fontFamily: R_FONT_MONO,
            fontSize: 88,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: R.text,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          $0.019 <span style={{color: R.muted}}>vs</span> $0.95
        </div>
        <div style={{marginTop: 18, fontFamily: R_FONT_SANS, fontSize: 32, color: R.muted}}>
          ~50× cheaper at 50 runs — measured
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 26,
          opacity: endOpacity,
        }}
      >
        <RMark size={92} />
        <div style={{fontFamily: R_FONT_SANS, fontSize: 48, fontWeight: 600, letterSpacing: '-0.01em', color: R.text}}>
          reelier.com
        </div>
        <div
          style={{
            marginTop: 4,
            padding: '14px 26px',
            border: `1px solid ${R.border}`,
            borderRadius: 6,
            background: R.surface,
            fontFamily: R_FONT_MONO,
            fontSize: 28,
            color: R.muted,
          }}
        >
          npm i -g @seldonframe/reelier
        </div>
      </div>
    </RStage>
  );
};
