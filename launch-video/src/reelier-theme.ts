import {loadFont as loadInter} from '@remotion/google-fonts/Inter';
import {loadFont as loadMono} from '@remotion/google-fonts/JetBrainsMono';

// Reelier brand does not ship on Google Fonts (Geist/Geist Mono are Vercel's
// own foundry fonts, not in @remotion/google-fonts' catalog). Inter + JetBrains
// Mono are the closest available substitutes to Geist/Geist Mono — same
// geometric-grotesk-plus-monospace pairing, same tabular-nums numeral set.
// See reelier-cloud/docs/DESIGN.md "Type" section for the real-app tokens.
const inter = loadInter('normal', {weights: ['500', '600', '700'], subsets: ['latin']});
const mono = loadMono('normal', {weights: ['400', '500', '600'], subsets: ['latin']});

export const R_FONT_SANS = inter.fontFamily;
export const R_FONT_MONO = mono.fontFamily;

// Reelier Cloud dashboard tokens — reelier-cloud/docs/DESIGN.md "Color"
export const R = {
  bg: '#0a0a0a',
  surface: '#0c0c0e',
  border: '#232326',
  borderStrong: '#2a2a2e',
  text: '#ededed',
  muted: '#a1a1a6',
  faint: '#6b6b6f',
  accent: '#0070f3',
  accentHover: '#3291ff',
  passed: '#3ecf8e',
  passedTint: 'rgba(62,207,142,.09)',
  unchecked: '#e6ac47',
  uncheckedTint: 'rgba(217,164,65,.10)',
  failed: '#f0655e',
  failedTint: 'rgba(229,83,75,.10)',
  skipped: '#8b8f98',
};

export const R_FPS = 30;

// Scene durations in frames @ 30fps. Sum = 660f = 22.0s (within the 18-22s brief).
export const R_SCENES = {
  hook: 90, // 0-3s
  record: 150, // 3-8s
  compile: 120, // 8-12s
  replay: 120, // 12-16s
  proof: 180, // 16-22s (numbers + end card)
} as const;

export const R_TOTAL_FRAMES = Object.values(R_SCENES).reduce((a, v) => a + v, 0);
