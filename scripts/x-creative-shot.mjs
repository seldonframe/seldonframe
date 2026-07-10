#!/usr/bin/env node
// x-creative-shot — render a 1200x675 HTML creative card to PNG via headless Chrome.
// Usage: node scripts/x-creative-shot.mjs docs/strategy/x-creatives/YYYY-MM-DD/card.html
// Writes card.png next to the HTML at 2x scale (2400x1350). Used by the weekly
// x-vault loop for GENERATED creatives (concept/stat/quote cards only — never
// fake receipts; see x-post-engine skill, creative rules).

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

// --headless=new is required; legacy --headless silently writes nothing on current Chrome.
execFileSync(chrome, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--force-device-scale-factor=2', '--window-size=1200,675',
  `--screenshot=${pngPath}`, pathToFileURL(htmlPath).href,
], { stdio: 'inherit' });

if (!existsSync(pngPath)) { console.error('Render failed — no PNG written'); process.exit(1); }
console.log(`Rendered ${pngPath} (2400x1350)`);
