import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {R, R_FONT_SANS} from '../reelier-theme';
import {RStage, rFade} from '../components/reelier';

// Path length of the triangle (M30 22 L78 50 L30 78 Z) ≈ 167, echo line = 24.
const TRIANGLE_LEN = 167;
const LINE_LEN = 24;

export const R1Hook: React.FC = () => {
  const frame = useCurrentFrame();

  const draw = interpolate(frame, [8, 46], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const triOffset = TRIANGLE_LEN * (1 - draw);
  const lineOffset = LINE_LEN * (1 - draw);
  const markScale = interpolate(frame, [8, 50], [0.94, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

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
          gap: 44,
        }}
      >
        <svg
          width={130}
          height={130}
          viewBox="0 0 100 100"
          fill="none"
          style={{transform: `scale(${markScale})`}}
        >
          <g stroke={R.text} strokeWidth="8" strokeLinejoin="round" strokeLinecap="round">
            <path d="M30 22 L78 50 L30 78 Z" strokeDasharray={TRIANGLE_LEN} strokeDashoffset={triOffset} />
            <line x1="18" y1="38" x2="18" y2="62" strokeDasharray={LINE_LEN} strokeDashoffset={lineOffset} />
          </g>
        </svg>
        <div
          style={{
            fontFamily: R_FONT_SANS,
            fontWeight: 600,
            fontSize: 74,
            letterSpacing: '-0.01em',
            lineHeight: 1.22,
            color: R.text,
            textAlign: 'center',
            maxWidth: 1400,
            opacity: rFade(frame, 48, 14),
          }}
        >
          <span style={{color: R.muted}}>Agents make claims.</span>
          <br />
          Reelier writes receipts.
        </div>
      </div>
    </RStage>
  );
};
