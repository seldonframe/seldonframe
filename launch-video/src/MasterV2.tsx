import React from 'react';
import {Series} from 'remotion';
import {b, V2} from './theme';
import {V2S0Aroll} from './scenes/V2S0Aroll';
import {V2S1Demo} from './scenes/V2S1Demo';
import {V2S2Sentence} from './scenes/V2S2Sentence';
import {V2S3NatLang} from './scenes/V2S3NatLang';
import {V2S4Integrations} from './scenes/V2S4Integrations';
import {V2S5OwnIt} from './scenes/V2S5OwnIt';
import {V2S6Pricing} from './scenes/V2S6Pricing';
import {V2S7Close} from './scenes/V2S7Close';

export const MasterV2: React.FC = () => (
  <Series>
    <Series.Sequence durationInFrames={b(V2.aroll)}>
      <V2S0Aroll />
    </Series.Sequence>
    <Series.Sequence durationInFrames={b(V2.demo)}>
      <V2S1Demo />
    </Series.Sequence>
    <Series.Sequence durationInFrames={b(V2.sentence)}>
      <V2S2Sentence />
    </Series.Sequence>
    <Series.Sequence durationInFrames={b(V2.natlang)}>
      <V2S3NatLang />
    </Series.Sequence>
    <Series.Sequence durationInFrames={b(V2.integrations)}>
      <V2S4Integrations />
    </Series.Sequence>
    <Series.Sequence durationInFrames={b(V2.ownit)}>
      <V2S5OwnIt />
    </Series.Sequence>
    <Series.Sequence durationInFrames={b(V2.pricing)}>
      <V2S6Pricing />
    </Series.Sequence>
    <Series.Sequence durationInFrames={b(V2.close)}>
      <V2S7Close />
    </Series.Sequence>
  </Series>
);
