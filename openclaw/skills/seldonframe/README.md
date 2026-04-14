# SeldonFrame OpenClaw Skill

This folder is a drop-in package for your VPS OpenClaw instance.

## Files
- `SKILL.md` - skill definition and behavior
- `.env.example` - required env variables
- `mcp.json` - example config snippet for skill registration + env wiring

## Required environment variables
- `CLAUDE_API_KEY` - builder's own Anthropic key
- `SELDONFRAME_API_KEY` - builder API key for `/api/v1/workspace/create` auth
- `SELDONFRAME_API_URL` - set to `https://app.seldonframe.com/api/v1/workspace/create`

Optional fallback:
- `SELDONFRAME_SESSION_COOKIE` - full cookie header value (used only if API key is unavailable)

Example:
- `SELDONFRAME_API_KEY=seldon_max_2026`

## VPS deployment steps
1. Copy this folder to your VPS OpenClaw config location.
2. Add env vars to your OpenClaw runtime environment:
   - `CLAUDE_API_KEY`
   - `SELDONFRAME_API_KEY=seldon_max_2026`
   - `SELDONFRAME_API_URL=https://app.seldonframe.com/api/v1/workspace/create`
   - `SELDONFRAME_SESSION_COOKIE=authjs.session-token=...` (optional fallback)
3. Ensure each request sends headers:
   - `x-claude-api-key: ${CLAUDE_API_KEY}`
   - `x-seldon-api-key: ${SELDONFRAME_API_KEY}`
4. If API key is unavailable, send cookie fallback:
   - `Cookie: ${SELDONFRAME_SESSION_COOKIE}`
5. Register the skill path:
   - `openclaw/skills/seldonframe/SKILL.md`
6. Merge/adapt `mcp.json` into your existing OpenClaw MCP config.
7. Restart OpenClaw service.

## Quick smoke test prompt
Use this in OpenClaw:

`I run a niche coaching business for software engineers transitioning into AI roles. I want a booking flow, intake form, and landing page.`

Expected behavior:
- If backend returns `ready`: assistant shares `🚀 Your new business is ready here: https://[slug].seldonframe.app`
- If backend returns `split_required`: assistant asks which part to start with first
- If `429`: rate-limit message
- If `401`: login guidance
- If `500`: simpler-input retry guidance
