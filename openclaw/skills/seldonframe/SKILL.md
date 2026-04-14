---
name: seldonframe
description: Build a complete personalized business OS from one text or URL. First workspace free forever.
version: 1.2.0
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

First workspace is completely free forever.

## Workflow
1. Ask: “Tell me about your business or share your website URL.”
2. Accept either plain text or a URL.
3. POST to `{{SELDONFRAME_API_URL}}` (set to `https://app.seldonframe.com/api/v1/workspace/create`).
4. Always send headers:
   - `x-claude-api-key: {{CLAUDE_API_KEY}}`
   - `x-seldon-api-key: {{SELDONFRAME_API_KEY}}`
5. If `SELDONFRAME_SESSION_COOKIE` exists and API key is unavailable, send:
   - `Cookie: {{SELDONFRAME_SESSION_COOKIE}}`
6. Handle response:
   - `ready`: reply with
     - `🚀 Your new business is ready here: https://[slug].seldonframe.app`
   - `split_required`: explain briefly and ask which side to build first.

## Error handling
- `429`: “I hit a temporary rate limit. Try again in a few minutes.”
- `401`: “Authentication failed. Check your Seldon API key (or login session) and try again.”
- `500+`: “The builder engine had an issue. Try a shorter description or URL.”

Be concise, energized, and outcome-focused.

**Ready?** Tell me about your business and I’ll build it.
