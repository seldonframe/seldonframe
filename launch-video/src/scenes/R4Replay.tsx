import React from 'react';
import {useCurrentFrame} from 'remotion';
import {R, R_FONT_MONO, R_FONT_SANS} from '../reelier-theme';
import {RCaption, RChip, RSettle, RStage, rFade} from '../components/reelier';

export const R4Replay: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <RStage>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '38%',
          transform: 'translate(-50%,-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 22,
          alignItems: 'flex-start',
        }}
      >
        <RSettle at={6}>
          <RChip outcome="passed">GET registry.npmjs.org/@seldonframe/reelier</RChip>
        </RSettle>
        <RSettle at={26}>
          <RChip outcome="passed">bind id = json.id</RChip>
        </RSettle>
      </div>

      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '66%',
          transform: 'translate(-50%,-50%)',
          textAlign: 'center',
          opacity: rFade(frame, 56, 14),
        }}
      >
        <div
          style={{
            fontFamily: R_FONT_MONO,
            fontSize: 64,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: R.text,
          }}
        >
          0 LLM tokens
        </div>
        <div
          style={{
            marginTop: 10,
            fontFamily: R_FONT_SANS,
            fontSize: 26,
            color: R.muted,
          }}
        >
          no re-reasoning
        </div>
      </div>

      <RCaption at={92}>Replay it free.</RCaption>
    </RStage>
  );
};
