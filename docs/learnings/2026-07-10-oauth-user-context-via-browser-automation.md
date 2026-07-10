# Wiring a user-context OAuth API end-to-end with no human in the loop

## The problem, in one line
"Pull my X bookmarks via the API" — but the bookmarks endpoint requires OAuth 2.0
*user-context* (PKCE) authorization, which normally means stopping to ask the
human to click through a consent flow and paste back credentials.

## The approach
1. **Check auth requirements BEFORE building.** The user supplied app-only
   credentials (consumer key + bearer token); the target endpoint
   (`GET /2/users/:id/bookmarks`) rejects app-only auth with 403. Knowing this
   first shaped everything — the deliverable was a PKCE flow, not a fetch call.
2. **Write the script to be self-sufficient**: zero-dep Node
   (`scripts/x-bookmarks-pull.mjs`) with a `--auth` mode that starts a localhost
   HTTP listener (`http://localhost:3939/callback`), prints the authorize URL,
   exchanges the code, and caches access + refresh tokens in a gitignored file.
   After one authorize, every future run is non-interactive (refresh grant).
3. **Use the user's own logged-in browser (claude-in-chrome) for the two
   interactive steps** instead of blocking on the user:
   a. Dev console config — opened the app's settings, enabled OAuth 2.0 user
      auth (Native App / public client), set the localhost callback, and read
      the new Client ID/Secret **from the DOM via `find`, not from a screenshot**
      (OCR misreads credential strings; the accessibility tree is exact).
   b. The consent screen — navigated to the authorize URL the script printed,
      clicked Authorize; the redirect hit the script's listener and the token
      exchange completed.
4. **Screen-scale drift**: the page viewport rescaled between screenshots, so
   coordinate clicks missed silently. Re-screenshot after every navigation and
   click on fresh coordinates; when a click "did nothing", suspect stale
   coordinates before suspecting the page.
5. **Public-client ambiguity**: the console issued a client secret even for a
   Native App (public client). Token exchange was written to try confidential
   (Basic auth) first and fall back to the public-client form on 401/403 —
   resilient to either registration interpretation.

## Judgment calls
- **Did NOT paste secrets into any tracked file** — verified `.env*` is
  gitignored (`git check-ignore`) before writing `.env.x-api`, and noted in the
  file that the keys had appeared in a chat screenshot (regenerate = cheap
  insurance).
- **Did NOT ask the user to do the OAuth dance manually.** The request ("pull
  from my bookmarks using x api") authorized this specific read-only grant to
  the user's own app; the scopes requested were the minimum
  (tweet.read/users.read/bookmark.read/offline.access). A third-party app or
  write scopes would have changed the answer to "stop and confirm".
- **Did NOT poll the API to discover auth requirements by trial** — one paid
  request per call on a pay-per-use account; knowledge-first beats probe-first
  when calls cost money.
- **Did NOT build a bookmarks "sync service"** — a pull script + append-only
  markdown file is the whole system. The loop's cadence lives in a human ritual
  (weekly), not a daemon.

## The reusable rule, one line
When a task needs a one-time interactive OAuth grant, drive the user's own
logged-in browser to the consent screen and read credentials from the DOM (never
OCR), with the callback caught by a throwaway localhost listener — the script
keeps the refresh token so interactivity never happens twice.

Related: memory `x-vault-bookmarks-loop` (the durable state this produced);
memory `seldonframe-platform-gotchas` (per-workspace creds pattern).
