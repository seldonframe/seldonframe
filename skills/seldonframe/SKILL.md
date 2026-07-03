# SeldonFrame Skill — Official MCP for Claude Code (v1.5.0)

You now have full control over SeldonFrame directly from Claude Code.

## API Key Management

Keys come from one of two places: an environment variable already set on
your machine (e.g. `ANTHROPIC_API_KEY`), or a value you pass explicitly as
a tool argument. There is no separate masked-input flow — this is a normal
MCP tool call like any other.

If a tool is about to store a key it found in your environment, it asks
for your OK first and tells you exactly which variable it found — it
never sends that value anywhere without your confirmation. A key you pass
explicitly as a tool argument counts as that confirmation.

Recommendation: prefer setting keys as environment variables over pasting
them into chat, since chat history isn't a secrets store. Once stored,
keys are encrypted at rest and never echoed back in tool results.

Say: “Show me my connected keys” or “Rotate my Resend key” anytime.

**Karpathy Best Practices** (applied to every block and change):
- Think Before Coding: explicit reasoning, surface assumptions
- Simplicity First: smallest solution that works
- Surgical Changes: touch only what is required
- Goal-Driven Execution: define verifiable success criteria

## Wow Features You Can Use Right Now

- **Inline live previews inside Claude Code**: `Generate a discovery booking form and show me a live preview`
- **One-command "Apply to all clients" with confirmation**: `Install this block to all my e-commerce clients and personalize it to each Soul`
- **Auto-validation & test generation**: `Generate the block and automatically create and run tests for it`
- **Visual Brain insights inside chat**: `Show me Brain insights for Indie SaaS Launch`
- **Self-improving Skill**: The Skill will remember what you like and suggest improvements over time
- **Collaborative agency mode**: `Invite my teammate to review this block`
- **Zero-config vertical templates**: `Launch a complete AI-video OS for ecommerce`

## Quick Start Examples (copy-paste)

- `Create a new workspace for "Acme Coaching" based on their website`
- `Generate and install a discovery booking block into the current workspace`
- `Install the Lead Scoring block to all my e-commerce client workspaces`
- `Update the client onboarding block to include a pre-call questionnaire`
- `Connect myagency.com as custom domain for the current workspace`
- `Export the current workspace as portable .agent/ folder`
- `Show me Brain v2 insights for Indie SaaS Launch`
- `Show me my connected keys`
- `Rotate my Resend key`
- `Invite Sarah into self-service mode for the Acme workspace`
- `In end_client_mode: true, make the booking page show evening slots only`

The web dashboard is now only for quick visual overviews. Do everything powerful from here in Claude Code.

Ready when you are — tell me what you want to build or customize next.
