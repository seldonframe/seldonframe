#!/usr/bin/env node
// x-viral-scan — find today's viral posts in the niche for quote-repost drafting.
// Auths with the cached OAuth2 user token (.env.x-tokens.json — same one the
// bookmarks puller uses; the app-only bearer in .env.x-api was mis-transcribed
// from a screenshot and 401s, and search accepts user-context auth anyway).
// Usage: node scripts/x-viral-scan.mjs [--top 3]
// Prints a ranked markdown shortlist to stdout; the daily loop drafts ONE
// quote-repost per hit (drafting = agent taste, this script only finds+ranks).
// Pay-per-use: one request per query below.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = resolve(ROOT, '.env.x-api');
const TOKEN_FILE = resolve(ROOT, '.env.x-tokens.json');

// The niche. Edit freely — each entry costs one API request per run.
const QUERIES = [
  '"claude code" -is:retweet -is:reply lang:en',
  '"ai agents" (build OR built OR shipped) -is:retweet -is:reply lang:en',
  '"build in public" -is:retweet -is:reply lang:en',
  '(vibecoding OR "vibe coding" OR vibecoded) -is:retweet -is:reply lang:en',
];
const MIN_LIKES = 100; // floor before velocity ranking

const env = {};
for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

// Same refresh dance as x-bookmarks-pull.mjs (duplicated on purpose — two sites, no shared module yet)
async function getAccessToken() {
  if (!existsSync(TOKEN_FILE)) throw new Error('No token cache — run x-bookmarks-pull.mjs --auth first.');
  let cache = JSON.parse(readFileSync(TOKEN_FILE, 'utf8'));
  if (Date.now() > (cache.expires_at ?? 0) - 60_000) {
    if (!cache.refresh_token) throw new Error('Token expired, no refresh token — re-run --auth.');
    const attempts = env.X_OAUTH2_CLIENT_SECRET
      ? [{ Authorization: 'Basic ' + Buffer.from(`${env.X_OAUTH2_CLIENT_ID}:${env.X_OAUTH2_CLIENT_SECRET}`).toString('base64') }, {}]
      : [{}];
    let tok, lastErr;
    for (const extra of attempts) {
      const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: cache.refresh_token });
      if (!extra.Authorization) body.set('client_id', env.X_OAUTH2_CLIENT_ID);
      const res = await fetch('https://api.x.com/2/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...extra },
        body: body.toString(),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok) { tok = j; break; }
      lastErr = new Error(`refresh ${res.status}: ${JSON.stringify(j)}`);
      if (res.status !== 401 && res.status !== 403) break;
    }
    if (!tok) throw lastErr;
    cache = { ...cache, access_token: tok.access_token, refresh_token: tok.refresh_token ?? cache.refresh_token, expires_at: Date.now() + (tok.expires_in ?? 7200) * 1000 };
    writeFileSync(TOKEN_FILE, JSON.stringify(cache, null, 2));
  }
  return cache.access_token;
}
const ACCESS_TOKEN = await getAccessToken();

const topN = (() => { const i = process.argv.indexOf('--top'); return i !== -1 ? parseInt(process.argv[i + 1], 10) || 3 : 3; })();

const hits = new Map();
for (const query of QUERIES) {
  const params = new URLSearchParams({
    query,
    sort_order: 'relevancy', // default 'recency' returns minutes-old posts with no engagement yet
    max_results: '50',
    'tweet.fields': 'created_at,public_metrics,author_id',
    expansions: 'author_id',
    'user.fields': 'username,public_metrics',
  });
  const res = await fetch(`https://api.x.com/2/tweets/search/recent?${params}`, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });
  if (!res.ok) { console.error(`search "${query}" → ${res.status}: ${await res.text()}`); continue; }
  const page = await res.json();
  const users = Object.fromEntries((page.includes?.users ?? []).map((u) => [u.id, u]));
  for (const t of page.data ?? []) {
    const m = t.public_metrics ?? {};
    if ((m.like_count ?? 0) < MIN_LIKES) continue;
    const ageH = Math.max(0.5, (Date.now() - new Date(t.created_at).getTime()) / 3.6e6);
    const u = users[t.author_id];
    hits.set(t.id, {
      id: t.id,
      username: u?.username ?? 'unknown',
      followers: u?.public_metrics?.followers_count ?? 0,
      text: t.text.replace(/\s+/g, ' ').slice(0, 280),
      likes: m.like_count ?? 0,
      reposts: m.retweet_count ?? 0,
      replies: m.reply_count ?? 0,
      ageH: Math.round(ageH * 10) / 10,
      velocity: Math.round(((m.like_count ?? 0) / ageH) * 10) / 10, // likes/hour = the viral signal
      query,
    });
  }
}

const ranked = [...hits.values()].sort((a, b) => b.velocity - a.velocity).slice(0, topN);
if (!ranked.length) { console.log('NO HITS above threshold today — skip the email, do not force a quote.'); process.exit(0); }

for (const [i, h] of ranked.entries()) {
  console.log(`## ${i + 1}. @${h.username} (${h.followers.toLocaleString()} followers) · ${h.velocity} likes/hr · ${h.likes} likes · ${h.ageH}h old`);
  console.log(`https://x.com/${h.username}/status/${h.id}`);
  console.log(`matched: ${h.query}`);
  console.log(`> ${h.text}\n`);
}
