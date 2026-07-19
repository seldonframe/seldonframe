#!/usr/bin/env node
// x-creative-shot — render an HTML creative card to PNG via headless Chrome.
// Usage: node scripts/x-creative-shot.mjs <card.html> [--size WxH]
//   default --size 1200x675 (16:9, in-feed posts)
//   X Article covers/inline images: --size 1500x600 (5:2 — X's article render ratio)
// Writes card.png next to the HTML at 2x scale. The HTML's .card element must
// match the given size. GENERATED concept/stat/quote cards only — never fake
// receipts; see x-post-engine skill, creative rules.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CHROME_PATHS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const chrome = CHROME_PATHS.find(existsSync);
if (!chrome) { console.error('No Chrome/Edge found'); process.exit(1); }

const htmlPath = resolve(process.argv[2] ?? '');
if (!htmlPath.endsWith('.html') || !existsSync(htmlPath)) {
  console.error('Usage: node scripts/x-creative-shot.mjs <path-to-card.html>');
  process.exit(1);
}
const pngPath = htmlPath.replace(/\.html$/, '.png');
const sizeIdx = process.argv.indexOf('--size');
const size = sizeIdx !== -1 ? process.argv[sizeIdx + 1] : '1200x675';
const [w, h] = size.split('x').map(Number);
if (!w || !h) { console.error(`Bad --size "${size}" — expected WxH like 1500x600`); process.exit(1); }

// --headless=new is required; legacy --headless silently writes nothing on current Chrome.
execFileSync(chrome, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--force-device-scale-factor=2', `--window-size=${w},${h}`,
  `--screenshot=${pngPath}`, pathToFileURL(htmlPath).href,
], { stdio: 'inherit' });

if (!existsSync(pngPath)) { console.error('Render failed — no PNG written'); process.exit(1); }
console.log(`Rendered ${pngPath} (${w * 2}x${h * 2})`);
