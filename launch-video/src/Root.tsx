import React from 'react';
import {Composition} from 'remotion';
import {b, FPS, SCENES, TOTAL_FRAMES, V2, V2_TOTAL} from './theme';
import {Master} from './Master';
import {MasterV2} from './MasterV2';
import {V2S0Aroll} from './scenes/V2S0Aroll';
import {V2S1Demo} from './scenes/V2S1Demo';
import {V2S2Sentence} from './scenes/V2S2Sentence';
import {V2S3NatLang} from './scenes/V2S3NatLang';
import {V2S4Integrations} from './scenes/V2S4Integrations';
import {V2S5OwnIt} from './scenes/V2S5OwnIt';
import {V2S6Pricing} from './scenes/V2S6Pricing';
import {V2S7Close} from './scenes/V2S7Close';
import {S1Hook} from './scenes/S1Hook';
import {S2Workspace} from './scenes/S2Workspace';
import {S3Primitives} from './scenes/S3Primitives';
import {S4Surfaces} from './scenes/S4Surfaces';
import {S5FrontOffice} from './scenes/S5FrontOffice';
import {S6NoMeters} from './scenes/S6NoMeters';
import {S7Cta} from './scenes/S7Cta';
import {ReelierExplainer} from './ReelierExplainer';
import {R_FPS, R_TOTAL_FRAMES} from './reelier-theme';

const LANDSCAPE = {width: 1920, height: 1080} as const;
const VERTICAL = {width: 1080, height: 1920} as const;

export const RemotionRoot: React.FC = () => (
  <>
    {/* Reelier — dark-brand explainer, real benchmark numbers only */}
    <Composition
      id="ReelierExplainer"
      component={ReelierExplainer}
      durationInFrames={R_TOTAL_FRAMES}
      fps={R_FPS}
      {...LANDSCAPE}
    />

    {/* v2 — parchment, VO-driven, A-roll bookends */}
    <Composition id="MasterV2" component={MasterV2} durationInFrames={V2_TOTAL} fps={FPS} {...LANDSCAPE} />
    <Composition id="MasterV2Vertical" component={MasterV2} durationInFrames={V2_TOTAL} fps={FPS} {...VERTICAL} />
    <Composition id="V2S0Aroll" component={V2S0Aroll} durationInFrames={b(V2.aroll)} fps={FPS} {...LANDSCAPE} />
    <Composition id="V2S1Demo" component={V2S1Demo} durationInFrames={b(V2.demo)} fps={FPS} {...LANDSCAPE} />
    <Composition id="V2S2Sentence" component={V2S2Sentence} durationInFrames={b(V2.sentence)} fps={FPS} {...LANDSCAPE} />
    <Composition id="V2S3NatLang" component={V2S3NatLang} durationInFrames={b(V2.natlang)} fps={FPS} {...LANDSCAPE} />
    <Composition id="V2S4Integrations" component={V2S4Integrations} durationInFrames={b(V2.integrations)} fps={FPS} {...LANDSCAPE} />
    <Composition id="V2S5OwnIt" component={V2S5OwnIt} durationInFrames={b(V2.ownit)} fps={FPS} {...LANDSCAPE} />
    <Composition id="V2S6Pricing" component={V2S6Pricing} durationInFrames={b(V2.pricing)} fps={FPS} {...LANDSCAPE} />
    <Composition id="V2S7Close" component={V2S7Close} durationInFrames={b(V2.close)} fps={FPS} {...LANDSCAPE} />

    {/* v1 — forest dark (kept for reuse) */}
    <Composition id="Master" component={Master} durationInFrames={TOTAL_FRAMES} fps={FPS} {...LANDSCAPE} />
    <Composition id="MasterVertical" component={Master} durationInFrames={TOTAL_FRAMES} fps={FPS} {...VERTICAL} />

    {/* per-scene comps for stills + iteration */}
    <Composition id="S1Hook" component={S1Hook} durationInFrames={b(SCENES.hook)} fps={FPS} {...LANDSCAPE} />
    <Composition id="S2Workspace" component={S2Workspace} durationInFrames={b(SCENES.workspace)} fps={FPS} {...LANDSCAPE} />
    <Composition id="S3Primitives" component={S3Primitives} durationInFrames={b(SCENES.primitives)} fps={FPS} {...LANDSCAPE} />
    <Composition id="S4Surfaces" component={S4Surfaces} durationInFrames={b(SCENES.surfaces)} fps={FPS} {...LANDSCAPE} />
    <Composition id="S5FrontOffice" component={S5FrontOffice} durationInFrames={b(SCENES.frontoffice)} fps={FPS} {...LANDSCAPE} />
    <Composition id="S6NoMeters" component={S6NoMeters} durationInFrames={b(SCENES.nometers)} fps={FPS} {...LANDSCAPE} />
    <Composition id="S7Cta" component={S7Cta} durationInFrames={b(SCENES.cta)} fps={FPS} {...LANDSCAPE} />
  </>
);
