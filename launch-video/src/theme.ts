import {loadFont as loadGrotesk} from '@remotion/google-fonts/SpaceGrotesk';
import {loadFont as loadPlexMono} from '@remotion/google-fonts/IBMPlexMono';

const grotesk = loadGrotesk('normal', {weights: ['500', '700'], subsets: ['latin']});
const plexMono = loadPlexMono('normal', {weights: ['400', '500'], subsets: ['latin']});

export const FONT_DISPLAY = grotesk.fontFamily;
export const FONT_MONO = plexMono.fontFamily;

// v2 — real landing-page light tokens (packages/crm landing-theme.css)
export const L = {
  bg: '#F6F2EA', // parchment
  bgAlt: '#EFE9DD',
  card: '#FFFDFA',
  ink: '#221D17',
  body: '#6E665A',
  faint: '#9A9183',
  line: '#DDD3C2',
  forest: '#1F2B24', // accent + CTA slab
  onForest: '#F6F2EA',
  gold: '#A98A5B', // metro-medspa widget gold
};

// SeldonFrame forest brand (post-#68 rebrand)
export const C = {
  forest: '#1F2B24',
  pine: '#141D18',
  moss: '#3A5244',
  sage: '#A7C0AE',
  paper: '#F5F1E8',
  sand: '#E4D9BF',
  dim: '#5E6E63',
  letterbox: '#0E1411',
};

// 100 BPM at 30fps → one beat = 18 frames. Every cue sits on this grid
// so a 100 BPM track drops straight onto the render in CapCut.
export const FPS = 30;
export const BEAT = 18;
export const b = (beats: number): number => Math.round(beats * BEAT);

// Scene durations in beats (keep in sync with BEAT-MAP.md)
export const SCENES = {
  hook: 16,
  workspace: 15,
  primitives: 12,
  surfaces: 13,
  frontoffice: 15,
  nometers: 15,
  cta: 16,
} as const;

export const TOTAL_FRAMES = Object.values(SCENES).reduce((a, v) => a + b(v), 0);

// v2 (~75s): A-roll bookends + VO-provisional grid. Re-timed to Whisper
// word-stamps once Max records the VO.
export const V2 = {
  aroll: 13, // 7.8s — founder hook slot
  demo: 27, // 16.2s — visitor books via chatbot → Google Calendar
  sentence: 17, // 10.2s — one sentence → the same live site
  natlang: 17, // 10.2s — "add a $50 deposit" → UI updates
  integrations: 17, // 10.2s — real-logo wall + BYOK
  ownit: 13, // 7.8s — open source, leave anytime
  pricing: 10, // 6.0s — $497 gate vs $99 flat + start free
  close: 12, // 7.2s — A-roll close slot + end card
} as const;

export const V2_TOTAL = Object.values(V2).reduce((a, v) => a + b(v), 0);
