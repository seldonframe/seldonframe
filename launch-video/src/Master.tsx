import React from 'react';
import {Series} from 'remotion';
import {b, SCENES} from './theme';
import {S1Hook} from './scenes/S1Hook';
import {S2Workspace} from './scenes/S2Workspace';
import {S3Primitives} from './scenes/S3Primitives';
import {S4Surfaces} from './scenes/S4Surfaces';
import {S5FrontOffice} from './scenes/S5FrontOffice';
import {S6NoMeters} from './scenes/S6NoMeters';
import {S7Cta} from './scenes/S7Cta';

export const Master: React.FC = () => (
  <Series>
    <Series.Sequence durationInFrames={b(SCENES.hook)}>
      <S1Hook />
    </Series.Sequence>
    <Series.Sequence durationInFrames={b(SCENES.workspace)}>
      <S2Workspace />
    </Series.Sequence>
    <Series.Sequence durationInFrames={b(SCENES.surfaces)}>
      <S4Surfaces />
    </Series.Sequence>
    <Series.Sequence durationInFrames={b(SCENES.primitives)}>
      <S3Primitives />
    </Series.Sequence>
    <Series.Sequence durationInFrames={b(SCENES.frontoffice)}>
      <S5FrontOffice />
    </Series.Sequence>
    <Series.Sequence durationInFrames={b(SCENES.nometers)}>
      <S6NoMeters />
    </Series.Sequence>
    <Series.Sequence durationInFrames={b(SCENES.cta)}>
      <S7Cta />
    </Series.Sequence>
  </Series>
);
