import React from 'react';
import {Series} from 'remotion';
import {R_SCENES} from './reelier-theme';
import {R1Hook} from './scenes/R1Hook';
import {R2Record} from './scenes/R2Record';
import {R3Replay} from './scenes/R3Replay';
import {R4Diff} from './scenes/R4Diff';
import {R5Proof} from './scenes/R5Proof';

export const ReelierExplainer: React.FC = () => (
  <Series>
    <Series.Sequence durationInFrames={R_SCENES.hook}>
      <R1Hook />
    </Series.Sequence>
    <Series.Sequence durationInFrames={R_SCENES.record}>
      <R2Record />
    </Series.Sequence>
    <Series.Sequence durationInFrames={R_SCENES.replay}>
      <R3Replay />
    </Series.Sequence>
    <Series.Sequence durationInFrames={R_SCENES.diff}>
      <R4Diff />
    </Series.Sequence>
    <Series.Sequence durationInFrames={R_SCENES.proof}>
      <R5Proof />
    </Series.Sequence>
  </Series>
);
