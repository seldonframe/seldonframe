import React from 'react';
import {useCurrentFrame} from 'remotion';
import {R, R_FONT_MONO} from '../reelier-theme';
import {RCaption, RCard, RSettle, RStage, RTypeOn, rFade} from '../components/reelier';

// Every output line is from the real `reelier init --yes` transcript
// (reelier-cloud TerminalDemo.tsx, itself verbatim from the CLI) —
// 2 steps / 2 asserts are the demo's real numbers, nothing staged.
export const R2Record: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <RStage>
      <RSettle
        at={4}
        style={{position: 'absolute', left: '50%', top: '47%', transform: 'translate(-50%,-50%)'}}
      >
        <RCard width={1240} title="reelier init">
          <div style={{padding: '40px 48px', fontFamily: R_FONT_MONO, fontSize: 34, lineHeight: 1.95}}>
            <div>
              <span style={{color: R.muted}}>$ </span>
              <RTypeOn text="reelier init" start={10} end={34} style={{color: R.text}} />
            </div>
            <div style={{opacity: rFade(frame, 44, 8), color: R.faint}}>
              recording the run that worked — 2 real HTTP requests
            </div>
            <div style={{opacity: rFade(frame, 60, 8), color: R.text}}>
              &nbsp;&nbsp;GET npm registry metadata
            </div>
            <div style={{opacity: rFade(frame, 72, 8), color: R.text}}>
              &nbsp;&nbsp;GET package homepage
            </div>
            <div style={{marginTop: 16, opacity: rFade(frame, 90, 8)}}>
              <span style={{color: R.accent, fontWeight: 600}}>
                compiled &rarr; reelier-init-demo.skill.md
              </span>
            </div>
            <div style={{opacity: rFade(frame, 100, 8), color: R.faint}}>
              &nbsp;&nbsp;2 steps · 2 asserts · 1 bind
            </div>
          </div>
        </RCard>
      </RSettle>

      <RCaption at={112}>Record the run that worked.</RCaption>
    </RStage>
  );
};
