# End-Client Customization

**Version:** 1.0
**Forked from:** null
**What it does:** Enables end clients (the final users of the workspace) to customize their own experience via natural language through Seldon It. Changes are client-scoped only and do not affect the builder’s master template or other clients.

**When to apply:**
- Any workspace where the builder wants end clients to have lightweight customization power (scheduling tools, coaching portals, micro-SaaS, service intake, etc.).
- Especially valuable for coaching, consulting, fractional services, and micro-SaaS products.

**What it modifies in the workspace:**
- **Database changes:** Adds client_id-scoped overrides table (or uses existing client-scoped storage).
- **UI changes:** Adds a lightweight “Ask Seldon” chat widget visible only to end clients.
- **Integration changes:** None — uses existing Seldon It pipeline.
- **Soul changes:** Adds "end_client_customization": true to harness-rules.json.

**Builder-facing description:**
Turn on end-client customization with one toggle. Your clients can now say things like “Show me only evening slots” or “Add a custom results report” and Seldon It will create a personalized, permanent change for them instantly — without touching your master template. The Brain will surface popular customizations back to you so you can turn them into reusable blocks.

**Seldon It instruction template (used automatically):**

1. For the Builder Dashboard (CRM, booking page, intake form, etc.)
Best choice: shadcn/ui + Vercel AI Chat Components (official and seamless)

Repo / Template: Vercel’s official ai-chatbot example → https://github.com/vercel/ai/tree/main/examples/next-openai (or the newer shadcn-integrated version)

Why this is perfect:

Already built with shadcn/ui primitives (exactly our stack).

Looks and feels identical to ChatGPT/Claude (message bubbles, streaming, avatars, sidebar history).

Supports streaming responses out of the box (perfect for Seldon It).

Extremely lightweight — just copy the components into our /components/ui/chat folder.

Full control: we can make it a full-page chat in the builder dashboard or a persistent sidebar.

How to integrate (5-minute copy-paste):

Run npx shadcn-ui@latest add chat (if not already in registry) or copy the components from the Vercel repo.

Create /components/seldon-chat.tsx and wire it to our existing Seldon It API endpoint.

Place it as a persistent sidebar or full-screen modal in the builder dashboard pages.

This gives builders the exact Claude-like experience while staying native to our design system.

2. For End Clients (inside the workspace pages)
Best choice: Lightweight floating chat bubble using shadcn/ui primitives

Use the same shadcn chat components, but render them as a floating action button + expandable chat window.

Repo / Example: shadcn/ui chat component + the minimal floating version from https://github.com/mckaywrigley/chatbot-ui (we only take the chat window part, not the full app).

Why this is perfect for end clients:

Non-intrusive: floating bubble in the bottom-right corner of any workspace page (booking, intake, CRM view).

Feels premium and modern — exactly like the Claude floating assistant or ChatGPT’s embedded chat.

Extremely lightweight (no full sidebar needed for clients).

Scoped automatically: when in end-client mode, Seldon It knows to apply client_id scoping.

How to integrate (copy-paste):

Create a new component /components/end-client-chat.tsx.

Use shadcn’s Button + a popover or drawer that expands into the full chat interface.

Trigger it with a small floating button that says “Ask Seldon” or shows the Seldon logo.

The chat window uses the exact same Seldon It endpoint as the builder version, but with end_client_mode: true in the request.

This makes the end-client experience feel magical: they click a tiny bubble, type in natural language, and their workspace changes instantly for them only.

Recommendation Summary
Use Case	Recommended UI	Look & Feel	Integration Effort	Best For
Builder Dashboard	shadcn + Vercel AI Chat Components	Full Claude/ChatGPT	5–10 min	Full customization power
End Clients	shadcn floating chat bubble	Clean embedded chat	10–15 min	Lightweight, non-intrusive
Both use the exact same underlying Seldon It API endpoint — we just pass a flag (builder_mode vs end_client_mode) so the prompt and scoping behave correctly.

This keeps our stack clean, consistent, and fully open-source.
