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

// Scene durations in frames @ 30fps. Sum = 660f = 22.0s exactly — the
// landing's "Watch it work · 22s" label and modal title depend on it.
// Story = the landing triad: record → replay → diff, receipts throughout.
export const R_SCENES = {
  hook: 100, // 0-3.3s — H1: agents make claims / reelier writes receipts
  record: 145, // 3.3-8.2s — reelier init records the run that worked
  replay: 165, // 8.2-13.7s — 0 tokens, byte-identical, receipt per step
  diff: 145, // 13.7-18.5s — SAME / DRIFTED per step, exit 1 on drift
  proof: 105, // 18.5-22s — $0.019 vs $0.95 + end card
} as const;

export const R_TOTAL_FRAMES = Object.values(R_SCENES).reduce((a, v) => a + v, 0);
