import React from 'react';
import {Series} from 'remotion';
import {R_SCENES} from './reelier-theme';
import {R1Hook} from './scenes/R1Hook';
import {R2Record} from './scenes/R2Record';
import {R3Compile} from './scenes/R3Compile';
import {R4Replay} from './scenes/R4Replay';
import {R5Proof} from './scenes/R5Proof';

export const ReelierExplainer: React.FC = () => (
  <Series>
    <Series.Sequence durationInFrames={R_SCENES.hook}>
      <R1Hook />
    </Series.Sequence>
    <Series.Sequence durationInFrames={R_SCENES.record}>
      <R2Record />
    </Series.Sequence>
    <Series.Sequence durationInFrames={R_SCENES.compile}>
      <R3Compile />
    </Series.Sequence>
    <Series.Sequence durationInFrames={R_SCENES.replay}>
      <R4Replay />
    </Series.Sequence>
    <Series.Sequence durationInFrames={R_SCENES.proof}>
      <R5Proof />
    </Series.Sequence>
  </Series>
);
