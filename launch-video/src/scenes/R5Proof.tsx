import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {R, R_FONT_MONO, R_FONT_SANS} from '../reelier-theme';
import {RChip, RMark, RStage} from '../components/reelier';

// Window fade: in over `edge` frames, hold, out over `edge` frames. Clamped.
const windowOpacity = (frame: number, start: number, end: number, edge = 10): number =>
  interpolate(frame, [start, start + edge, end - edge, end], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

const Stat: React.FC<{frame: number; start: number; end: number; big: string; tag: string}> = ({
  frame,
  start,
  end,
  big,
  tag,
}) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      opacity: windowOpacity(frame, start, end),
    }}
  >
    <div
      style={{
        fontFamily: R_FONT_MONO,
        fontSize: 76,
        fontWeight: 600,
        letterSpacing: '-0.01em',
        color: R.text,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {big}
    </div>
    <div style={{marginTop: 16, fontFamily: R_FONT_SANS, fontSize: 27, color: R.muted}}>{tag}</div>
  </div>
);

export const R5Proof: React.FC = () => {
  const frame = useCurrentFrame();

  const receiptOpacity = windowOpacity(frame, 122, 152);
  const endOpacity = interpolate(frame, [148, 162], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <RStage>
      <Stat frame={frame} start={4} end={46} big="1,000 → 1,000" tag="replays, byte-identical" />
      <Stat frame={frame} start={46} end={86} big="~50× cheaper" tag="cost at 50 runs (extrapolated)" />
      <Stat
        frame={frame}
        start={86}
        end={122}
        big="~59× faster"
        tag="48ms vs 2,842ms — measured"
      />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: receiptOpacity,
        }}
      >
        <RChip outcome="passed" style={{fontSize: 30, padding: '14px 26px'}}>
          replay verified
        </RChip>
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
        <div style={{fontFamily: R_FONT_SANS, fontSize: 44, fontWeight: 600, letterSpacing: '-0.01em', color: R.text}}>
          reelier.com
        </div>
        <div
          style={{
            marginTop: 4,
            padding: '12px 22px',
            border: `1px solid ${R.border}`,
            borderRadius: 6,
            background: R.surface,
            fontFamily: R_FONT_MONO,
            fontSize: 24,
            color: R.muted,
          }}
        >
          npm i -g @seldonframe/reelier
        </div>
      </div>
    </RStage>
  );
};
