import React from 'react';
import {useCurrentFrame} from 'remotion';
import {R, R_FONT_MONO} from '../reelier-theme';
import {RCaption, RCard, RSettle, RStage, RTypeOn} from '../components/reelier';

export const R2Record: React.FC = () => {
  const frame = useCurrentFrame();
  const proxyOn = frame >= 46;

  return (
    <RStage>
      <RSettle
        at={4}
        style={{position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-56%)'}}
      >
        <RCard width={1180} title="agent.log">
          <div style={{padding: '38px 44px', fontFamily: R_FONT_MONO, fontSize: 27, lineHeight: 2.05}}>
            <div>
              <span style={{color: R.muted}}>$ </span>
              <RTypeOn
                text="agent: GET registry.npmjs.org/@seldonframe/reelier"
                start={10}
                end={55}
                style={{color: R.text}}
              />
            </div>
            <div style={{opacity: frame >= 58 ? 1 : 0, color: R.faint}}>
              ↳ mcp-proxy: watching{proxyOn ? '…' : ''}
            </div>
            <div style={{marginTop: 18, opacity: frame >= 78 ? 1 : 0}}>
              <RTypeOn
                text="reelier records it once"
                start={80}
                end={118}
                style={{color: R.accent, fontWeight: 600}}
              />
            </div>
          </div>
        </RCard>
      </RSettle>

      <RCaption at={124}>Record once.</RCaption>
    </RStage>
  );
};
