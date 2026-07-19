import React from 'react';
import {useCurrentFrame} from 'remotion';
import {R, R_FONT_MONO} from '../reelier-theme';
import {RCaption, RCard, RSettle, RStage, rFade} from '../components/reelier';

const LINES: {at: number; key: string; rest: string}[] = [
  {at: 14, key: 'action', rest: ': http.get {...}'},
  {at: 34, key: 'assert', rest: ': status == 200'},
  {at: 54, key: 'bind', rest: ': id = json.id'},
];

export const R3Compile: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <RStage>
      <RSettle
        at={2}
        distance={10}
        style={{position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-56%)'}}
      >
        <RCard width={980} title="npm-info.skill.md">
          <div style={{padding: '40px 48px', fontFamily: R_FONT_MONO, fontSize: 30, lineHeight: 2.15}}>
            {LINES.map((l) => (
              <div key={l.key} style={{opacity: rFade(frame, l.at, 8)}}>
                <span style={{color: R.accent, fontWeight: 600}}>{l.key}</span>
                <span style={{color: R.text}}>{l.rest}</span>
              </div>
            ))}
          </div>
        </RCard>
      </RSettle>

      <RCaption at={78}>Compiled to a skill — with a test on every step.</RCaption>
    </RStage>
  );
};
