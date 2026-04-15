---
name: seldonframe
description: Build a complete personalized business OS from one text or URL. First workspace free forever.
version: 1.3.1
user-invocable: true
metadata:
  requires:
    env:
      - CLAUDE_API_KEY
      - SELDONFRAME_API_KEY
      - SELDONFRAME_API_URL
  homepage: https://app.seldonframe.com
---

# SeldonFrame

**From idea to first paying customer, in one text.**

Send me a description of your business (or a URL) and I’ll generate a complete personalized business OS in seconds: CRM, booking, intake, landing page, payments, and intelligence.

Pricing model:
- First workspace is completely free forever.
- Each additional workspace is $9/month per workspace.

## Workflow
1. Ask: “Tell me about your business or share your website URL.”
2. Accept either plain text or a URL.
3. POST to `{{SELDONFRAME_API_URL}}` (set to `https://app.seldonframe.com/api/v1/workspace/create`).
   - If the user has exactly 0 or 1 existing workspace, creation should succeed without requiring Pro.
4. Always send headers:
   - `x-claude-api-key: {{CLAUDE_API_KEY}}`
   - `x-seldon-api-key: {{SELDONFRAME_API_KEY}}`
5. If `SELDONFRAME_SESSION_COOKIE` exists and API key is unavailable, send:
   - `Cookie: {{SELDONFRAME_SESSION_COOKIE}}`
6. Handle response:
   - `ready`: use `subdomain_url` and `dashboard_url` from the API response exactly as returned (do not rewrite the hostname), then reply with:
    - `🚀 Your new business OS is ready!`
    - `Subdomain: {{subdomain_url}}`
    - `(Current production uses .seldonframe.com workspace hosts.)`
    - `(It may take 2–10 minutes for Vercel to fully activate the subdomain. Just refresh the page if it doesn't load immediately.)`
    - `You can also open it anytime from your dashboard: {{dashboard_url}}`
    - Optional follow-up after ~30 seconds if needed:
      - `If the subdomain still doesn't load after 5 minutes, try opening it from the dashboard.`
   - `split_required`: explain briefly and ask which side to build first.
   - `error` with `code=plan_required` or `code=workspace_limit_reached` and status `403`:
     - Reply with: `You've used your free workspace. Each additional workspace is $9/month.`
     - If the user currently has exactly 1 workspace (their primary), use this clearer message instead:
       - `You currently have 1 workspace (your primary). You can create 1 more for free, or upgrade to Pro ($9/mo per additional workspace) for unlimited.`
     - Then offer these options:
       1. `Upgrade to Pro ($9/mo per workspace)`
          - Call `POST https://app.seldonframe.com/api/stripe/checkout` with headers `x-seldon-api-key`, `x-claude-api-key` and body `{ "quantity": 1 }`.
          - Include `Cookie: {{SELDONFRAME_SESSION_COOKIE}}` when available.
          - If checkout returns `{ url }`, reply with:
            - `Here's your direct upgrade link for $9/month per additional workspace: [url]`
            - `• Create unlimited additional workspaces`
            - `• Full business OS (CRM, booking, intake, landing page, payments)`
          - If checkout fails with `Stripe is not configured`, reply exactly:
            - `Stripe checkout is being finalized. For now, visit https://app.seldonframe.com/pricing to upgrade.`
          - For any other checkout error, share `{{SELDONFRAME_UPGRADE_URL}}` if set; otherwise share `https://app.seldonframe.com/pricing`.
       2. `List my workspaces`
          - Call `GET https://app.seldonframe.com/api/v1/workspaces` with `x-seldon-api-key` (+ BYOK header).
          - Show numbered list format: `1. Name — slug — subdomain`.
          - Ask: `Which number would you like to delete?`
          - Map number to workspace id and call `DELETE https://app.seldonframe.com/api/v1/workspaces/:id`.
          - After deletion, reply: `Deleted. Want me to create your new workspace now?`
       3. `Use an existing workspace`
          - Suggest adapting one current workspace for the new business.

## Error handling
- `429`: “I hit a temporary rate limit. Try again in a few minutes.”
- `401`: “Authentication failed. Check your Seldon API key (or login session) and try again.”
- `500+`: “The builder engine had an issue. Try a shorter description or URL.”

Be concise, energized, and outcome-focused.

**Ready?** Tell me about your business and I’ll build it.
