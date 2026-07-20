import React from 'react';
import {useCurrentFrame} from 'remotion';
import {R, R_FONT_MONO} from '../reelier-theme';
import {RCaption, RChip, RSettle, RStage, RTypeOn, rFade} from '../components/reelier';

// The drift is the real one from the landing's HealDiff card (reelier
// writeback test fixture, heal-me.skill.md): `bind id = json.id` breaks
// when the API wraps the field under a 'note' object. SAME / DRIFTED and
// "exit 1 on drift" are the landing's exact diff-card words.
const ROWS: {at: number; left: string; verdict: 'SAME' | 'DRIFTED'}[] = [
  {at: 48, left: 'assert status == 200', verdict: 'SAME'},
  {at: 64, left: 'bind id = json.id', verdict: 'DRIFTED'},
];

const DiffRow: React.FC<{left: string; verdict: 'SAME' | 'DRIFTED'}> = ({left, verdict}) => {
  const ok = verdict === 'SAME';
  return (
    <div
      style={{
        width: 980,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '18px 28px',
        border: `1px solid ${ok ? R.border : R.failed}`,
        borderRadius: 6,
        background: ok ? R.surface : R.failedTint,
        fontFamily: R_FONT_MONO,
        fontSize: 32,
      }}
    >
      <span style={{color: R.text}}>{left}</span>
      <span style={{color: ok ? R.passed : R.failed, fontWeight: 600}}>{verdict}</span>
    </div>
  );
};

export const R4Diff: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <RStage>
      <RSettle
        at={4}
        style={{position: 'absolute', left: '50%', top: '15%', transform: 'translate(-50%,-50%)'}}
      >
        <div style={{fontFamily: R_FONT_MONO, fontSize: 36}}>
          <span style={{color: R.muted}}>$ </span>
          <RTypeOn text="reelier diff heal-me" start={6} end={38} style={{color: R.text}} />
        </div>
      </RSettle>

      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '43%',
          transform: 'translate(-50%,-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          alignItems: 'center',
        }}
      >
        {ROWS.map((r) => (
          <RSettle key={r.left} at={r.at}>
            <DiffRow left={r.left} verdict={r.verdict} />
          </RSettle>
        ))}
        <div
          style={{
            fontFamily: R_FONT_MONO,
            fontSize: 27,
            color: R.faint,
            opacity: rFade(frame, 80, 8),
          }}
        >
          &#8627; the id moved under a &lsquo;note&rsquo; wrapper
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '66%',
          display: 'flex',
          justifyContent: 'center',
          opacity: rFade(frame, 96, 10),
        }}
      >
        <RChip outcome="failed">exit 1 on drift — loud, never silent</RChip>
      </div>

      <RCaption at={116}>Diff every run to catch drift.</RCaption>
    </RStage>
  );
};
