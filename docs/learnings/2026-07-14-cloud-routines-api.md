# Learnings — driving claude.ai cloud routines from an agent (undocumented API)

**Date:** 2026-07-14 · **Context:** Max wanted the Karpathy-style overnight persona loop ("pretend you're a 7-year-old, find the first confusing thing, fix it, repeat") running against the SeldonFrame activation funnel **without his desktop being on**, plus a PR babysitter. Local scheduled tasks (`~/.claude/scheduled-tasks`) only run while the desktop app is open — the correct rail is claude.ai **routines** (cloud Claude Code sessions on a cron), whose create API is undocumented.

## The problem shape
You need to configure a hosted service whose API exists (a tool exposes `POST /v1/code/triggers`) but whose request-body schema is published nowhere. Blind field-guessing produced opaque errors (`session_request.worker.: Field required`) and — worse — **silently dropped unknown fields** while returning HTTP 200.

## The approach that worked (reusable)
1. **Probe with empty objects first, not guessed fields.** `{}` at each nesting level makes the validator enumerate required fields ("job_config must have \"ccr\" shape", "must set ccr.environment_id"). Guessed field names return "Extra inputs are not permitted" at best and silence at worst.
2. **When probing stalls, grep the client binary that already speaks the API.** The Claude Code CLI (`claude.exe`, a Bun-compiled binary — its JS bundle survives as plain strings) contains the built-in `/schedule` skill prompt with the **complete create-body JSON template**, plus the environments API (`/v1/environment_providers/...`), header requirements (`anthropic-beta: ccr-byoc-2025-07-29`), and field semantics (cron is **UTC**; min interval 1h). `python: data.find(b"PROMPT_HERE")` + a ±7KB window beat an hour of probing.
3. **For cookie-authed web APIs, watch the real UI's network tab.** Navigating claude.ai/code/routines with claude-in-chrome and reading network requests exposed the environments endpoint + org uuid in one shot; a page-context `fetch` then read/created environments with the session cookie.
4. **Echo-check every write.** This API returns 200 and silently drops unknown keys (`allow_unrestricted_git_push` on the trigger source, `prompt` at top level). The only reliable verification: diff the echoed object for the field you set. A 200 is not a confirmation.
5. **Smoke by firing, not by reading config.** `{action: "run"}` surfaced `session_config_rejected` for invalid env ids that create/update happily stored. Config that saves ≠ config that runs (Optimistic Path bug, service-side edition).

## Judgment calls
- **Default env has "Trusted" network** → the live site would 403 (`host_not_allowed`). Created a dedicated `seldonframe-loops` env (default hosts + seldonframe domains) instead of mutating Default — isolation over convenience.
- Persona loop pushes only `claude/`-prefixed branches (platform default = a free safety rail). The babysitter, which legitimately needs to push arbitrary PR branches, got a **fallback contract** (patch-in-comment, `blocked-on-push`) instead of a fight with a permission the API wouldn't accept.
- Guardian stayed REPORT-ONLY; the babysitter is a separate actor with its own charter — don't retrofit write powers onto a watchdog.

## Reusable rule
> When an API is undocumented but a first-party client exists, the client **is** the documentation: enumerate required fields with empty-object probes, then extract the exact payload template from the client's strings. Verify writes by echo-diff and a live fire — never by HTTP 200.

**Artifacts:** triggers `trig_01CCRPPjnRwapd7gL6LmcgEt` (persona loop, 07:17 UTC nightly) + `trig_01TsGM8CerdHrK6JQifiGg12` (pr-babysitter, 6h) · env `env_01DKoz9xurdVb5hWVnoXyQtA` · smoke session `cse_01RRt88AhdkvV2jZ844wJoZs` · manage at claude.ai/code/routines.
