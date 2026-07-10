#!/usr/bin/env node
// x-bookmarks-pull — pull Max's X bookmarks into docs/strategy/x-vault.md (Corpus, UNDISTILLED).
//
// Bookmarks require OAuth 2.0 user context (PKCE) + bookmark.read. App-only bearer won't work.
//
// Usage:
//   node scripts/x-bookmarks-pull.mjs --auth        # one-time: prints authorize URL, waits on
//                                                   # http://localhost:3939/callback, saves tokens
//   node scripts/x-bookmarks-pull.mjs [--max 50]    # pull newest bookmarks, append new ones to vault
//
// Needs X_OAUTH2_CLIENT_ID (and X_OAUTH2_CLIENT_SECRET if the app is a confidential client)
// in .env.x-api. Tokens cached in .env.x-tokens.json (both gitignored via .env*).
// Pay-per-use account: every API call costs — this script makes 1 call per 100 bookmarks
// (+1 /users/me on first ever run, then the user id is cached).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = resolve(ROOT, '.env.x-api');
const TOKEN_FILE = resolve(ROOT, '.env.x-tokens.json');
const VAULT_FILE = resolve(ROOT, 'docs/strategy/x-vault.md');
const CALLBACK_PORT = 3939;
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/callback`;
const SCOPES = 'tweet.read users.read bookmark.read offline.access';

function loadEnv() {
  const env = {};
  if (!existsSync(ENV_FILE)) throw new Error(`.env.x-api not found at ${ENV_FILE}`);
  for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv();
const CLIENT_ID = env.X_OAUTH2_CLIENT_ID;
const CLIENT_SECRET = env.X_OAUTH2_CLIENT_SECRET || '';
if (!CLIENT_ID) {
  console.error('X_OAUTH2_CLIENT_ID missing in .env.x-api.');
  console.error('Get it from console.x.com → your app → User authentication settings (OAuth 2.0),');
  console.error(`with callback URL ${REDIRECT_URI} and scopes: ${SCOPES}`);
  process.exit(1);
}

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function tokenAuthHeaders() {
  const h = { 'Content-Type': 'application/x-www-form-urlencoded' };
  // Confidential clients authenticate the token endpoint with Basic auth; public clients don't.
  if (CLIENT_SECRET) h.Authorization = 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  return h;
}

async function tokenRequest(params) {
  // The app is registered as a Native App (public client) but the console issued a
  // secret anyway — try confidential (Basic) first, fall back to public-client form.
  const attempts = CLIENT_SECRET
    ? [{ headers: tokenAuthHeaders(), body: new URLSearchParams(params) },
       { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: (() => { const p = new URLSearchParams(params); p.set('client_id', CLIENT_ID); return p; })() }]
    : [{ headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: (() => { const p = new URLSearchParams(params); p.set('client_id', CLIENT_ID); return p; })() }];
  let lastErr;
  for (const a of attempts) {
    const res = await fetch('https://api.x.com/2/oauth2/token', { method: 'POST', headers: a.headers, body: a.body.toString() });
    const body = await res.json().catch(() => ({}));
    if (res.ok) return body;
    lastErr = new Error(`token endpoint ${res.status}: ${JSON.stringify(body)}`);
    if (res.status !== 401 && res.status !== 403) break;
  }
  throw lastErr;
}

function saveTokens(tok, extra = {}) {
  const prev = existsSync(TOKEN_FILE) ? JSON.parse(readFileSync(TOKEN_FILE, 'utf8')) : {};
  const merged = {
    ...prev,
    ...extra,
    access_token: tok.access_token,
    refresh_token: tok.refresh_token ?? prev.refresh_token,
    expires_at: Date.now() + (tok.expires_in ?? 7200) * 1000,
  };
  writeFileSync(TOKEN_FILE, JSON.stringify(merged, null, 2));
  return merged;
}

async function authFlow() {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const state = b64url(randomBytes(16));
  const authUrl =
    'https://x.com/i/oauth2/authorize?' +
    new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: SCOPES,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString();

  console.log('\nOpen this URL and click Authorize:\n\n' + authUrl + '\n');

  const code = await new Promise((resolvePromise, reject) => {
    const server = createServer((req, res) => {
      const u = new URL(req.url, REDIRECT_URI);
      if (u.pathname !== '/callback') { res.writeHead(404).end(); return; }
      const err = u.searchParams.get('error');
      const gotState = u.searchParams.get('state');
      const gotCode = u.searchParams.get('code');
      if (err || gotState !== state || !gotCode) {
        res.writeHead(400, { 'Content-Type': 'text/plain' }).end(`Auth failed: ${err || 'state mismatch'}`);
        server.close();
        reject(new Error(`callback error: ${err || 'state mismatch'}`));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' })
        .end('<body style="font-family:sans-serif;background:#111;color:#eee;padding:40px">Authorized. You can close this tab — the puller has your token.</body>');
      server.close();
      resolvePromise(gotCode);
    });
    server.listen(CALLBACK_PORT, () => console.log(`Waiting for callback on ${REDIRECT_URI} ...`));
    setTimeout(() => { server.close(); reject(new Error('auth timeout (10 min)')); }, 600_000);
  });

  const tok = await tokenRequest(new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  }));
  saveTokens(tok);
  console.log('Tokens saved to .env.x-tokens.json (gitignored). Run without --auth to pull.');
}

async function getAccessToken() {
  if (!existsSync(TOKEN_FILE)) throw new Error('No token cache — run with --auth first.');
  let cache = JSON.parse(readFileSync(TOKEN_FILE, 'utf8'));
  if (Date.now() > (cache.expires_at ?? 0) - 60_000) {
    if (!cache.refresh_token) throw new Error('Access token expired and no refresh token — re-run --auth.');
    const tok = await tokenRequest(new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: cache.refresh_token,
    }));
    cache = saveTokens(tok);
  }
  return cache;
}

async function api(path, accessToken) {
  const res = await fetch(`https://api.x.com/2${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function pull(maxCount) {
  let cache = await getAccessToken();
  if (!cache.user_id) {
    const me = await api('/users/me', cache.access_token);
    cache = saveTokens({ access_token: cache.access_token, expires_in: (cache.expires_at - Date.now()) / 1000 }, { user_id: me.data.id, username: me.data.username });
    console.log(`Authorized as @${cache.username} (${cache.user_id})`);
  }

  const vault = readFileSync(VAULT_FILE, 'utf8');
  const tweets = [];
  let nextToken;
  while (tweets.length < maxCount) {
    const params = new URLSearchParams({
      max_results: String(Math.min(100, maxCount - tweets.length < 10 ? 10 : maxCount - tweets.length)),
      // note_tweet = full text of long-form posts (the plain text field truncates at ~280)
      'tweet.fields': 'created_at,public_metrics,author_id,note_tweet,attachments',
      expansions: 'author_id,attachments.media_keys',
      'user.fields': 'username',
      // media urls let the weekly distill LOOK at what creatives perform
      'media.fields': 'type,url,preview_image_url',
    });
    if (nextToken) params.set('pagination_token', nextToken);
    const page = await api(`/users/${cache.user_id}/bookmarks?${params}`, cache.access_token);
    const users = Object.fromEntries((page.includes?.users ?? []).map((u) => [u.id, u.username]));
    const media = Object.fromEntries((page.includes?.media ?? []).map((m) => [m.media_key, m]));
    for (const t of page.data ?? []) {
      const mediaUrls = (t.attachments?.media_keys ?? [])
        .map((k) => media[k])
        .filter(Boolean)
        .map((m) => `${m.type}: ${m.url ?? m.preview_image_url ?? '(no url)'}`);
      tweets.push({ ...t, username: users[t.author_id] ?? 'unknown', mediaUrls });
    }
    nextToken = page.meta?.next_token;
    if (!nextToken || !(page.data ?? []).length) break;
  }

  const fresh = tweets.filter((t) => !vault.includes(`/status/${t.id}`));
  if (!fresh.length) {
    console.log(`Pulled ${tweets.length} bookmarks — all already in the vault. Nothing to add.`);
    return;
  }

  const entries = fresh.map((t) => {
    const m = t.public_metrics ?? {};
    const date = (t.created_at ?? '').slice(0, 10);
    const fullText = t.note_tweet?.text ?? t.text;
    const quoted = fullText.split('\n').map((l) => `> ${l}`).join('\n');
    return [
      `### ${date} · @${t.username} · https://x.com/${t.username}/status/${t.id}`,
      quoted,
      ...(t.mediaUrls?.length ? [`- media: ${t.mediaUrls.join(' · ')}`] : []),
      `- metrics: ${m.like_count ?? '?'} likes · ${m.retweet_count ?? '?'} reposts · ${m.reply_count ?? '?'} replies · ${m.impression_count ?? '?'} views`,
      `- format: `,
      `- why it worked: `,
      `- status: UNDISTILLED`,
      '',
    ].join('\n');
  });

  const marker = '## Corpus (raw evidence — append-only, newest first)';
  const idx = vault.indexOf(marker);
  if (idx === -1) throw new Error('Corpus marker not found in x-vault.md');
  // insert right after the marker's comment block (end of the entry-shape comment)
  const commentEnd = vault.indexOf('-->', idx);
  const insertAt = commentEnd === -1 ? idx + marker.length : commentEnd + 3;
  const updated = vault.slice(0, insertAt) + '\n\n' + entries.join('\n') + vault.slice(insertAt);
  writeFileSync(VAULT_FILE, updated);
  console.log(`Appended ${fresh.length} new bookmark(s) to docs/strategy/x-vault.md (${tweets.length} pulled, ${tweets.length - fresh.length} already present).`);
}

const args = process.argv.slice(2);
const maxIdx = args.indexOf('--max');
const maxCount = maxIdx !== -1 ? parseInt(args[maxIdx + 1], 10) || 50 : 50;

try {
  if (args.includes('--auth')) await authFlow();
  else await pull(maxCount);
} catch (e) {
  console.error(String(e.message ?? e));
  process.exit(1);
}
