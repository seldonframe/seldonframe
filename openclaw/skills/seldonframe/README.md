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
- `SELDONFRAME_UPGRADE_URL` - optional explicit upgrade URL (fallback is `https://app.seldonframe.com/pricing`)
- `SELDONFRAME_PRO_PRICE_ID` - Pro workspace price id (default: `price_1TMC7UJOtNZA0x7xNrl2VDVE`)

Example:
- `SELDONFRAME_API_KEY=seldon_max_2026`

## Pricing model enforced
- First workspace is free forever (no card required).
- Each additional workspace costs `$9/month` per workspace.
- Pro checkout price id: `price_1TMC7UJOtNZA0x7xNrl2VDVE`.
- On limits, backend returns `403` with `code=plan_required` or `code=workspace_limit_reached`.

## Limit-resolution flow in skill
When limit is hit, the skill responds:
`You've used your free workspace. Each additional workspace is $9/month.`

If the user currently has exactly 1 workspace (their primary), the skill can use this clearer message:
`You currently have 1 workspace (your primary). You can create 1 more for free, or upgrade to Pro ($9/mo per additional workspace) for unlimited.`

Then offers:
1. `Upgrade to Pro ($9/mo per workspace)`
   - Calls `POST https://app.seldonframe.com/api/stripe/checkout` with body `{ "quantity": 1 }`
   - On success, responds with:
     - `Here's your direct upgrade link for $9/month per additional workspace: [url]`
     - `• Create unlimited additional workspaces`
     - `• Full business OS (CRM, booking, intake, landing page, payments)`
   - If checkout fails with `Stripe is not configured`, responds with:
     - `Stripe checkout is being finalized. For now, visit https://app.seldonframe.com/pricing to upgrade.`
   - For other checkout errors, falls back to `SELDONFRAME_UPGRADE_URL` or `https://app.seldonframe.com/pricing`
2. `List my workspaces`
   - Calls `GET https://app.seldonframe.com/api/v1/workspaces`
   - Shows `name`, `slug`, `subdomain`
   - On user confirmation, deletes via `DELETE https://app.seldonframe.com/api/v1/workspaces/:id`
3. `Use an existing workspace`
   - Suggests adapting a current workspace for the new business

## VPS deployment steps
1. Copy this folder to your VPS OpenClaw config location.
2. Add env vars to your OpenClaw runtime environment:
   - `CLAUDE_API_KEY`
   - `SELDONFRAME_API_KEY=seldon_max_2026`
   - `SELDONFRAME_API_URL=https://app.seldonframe.com/api/v1/workspace/create`
   - `SELDONFRAME_PRO_PRICE_ID=price_1TMC7UJOtNZA0x7xNrl2VDVE`
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
- If backend returns `ready`: assistant shares `🚀 Your new business OS is ready!` and uses `subdomain_url` exactly as returned by the API (current production: `https://[slug].seldonframe.com`)
- If backend returns `split_required`: assistant asks which part to start with first
- If backend returns `403` with `plan_required` or `workspace_limit_reached`: assistant offers upgrade/list/delete/use-existing options
- If `429`: rate-limit message
- If `401`: login guidance
- If `500`: simpler-input retry guidance
