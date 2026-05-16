# Ops-Stack-Only Workspace Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drop workspace creation time from ~3 min to ~30 sec by removing default landing-page generation. Promote the chatbot to first-class output. Add a chatbot-only preview page as the default public surface. Introduce a `landing-page-creation` SKILL.md for operator-prompted landing pages later.

**Architecture:** Strip the `enhanceLandingForWorkspace` call from `createFullWorkspace`. Add a `chatbot-preview` section type to the landing-page block registry. Auto-seed every new workspace's landing-page with a single chatbot-preview section after the chatbot agent is created in `v2/complete`. Set the auto-created chatbot to `status: "test"` so it's responsive on the preview URL. Rewrite the `finalize_workspace` MCP summary to lead with the chatbot embed snippet + 7-automation callout. The v1.54 archetype enforcement still fires when an operator later opts into a landing page via a new `skills/landing-page-creation/SKILL.md`.

**Tech Stack:** Next.js 16.2 (App Router) backend at `packages/crm`, React 19 for the new ChatbotPreview component, MCP server in `skills/mcp-server` (Node, ESM). `node:test` + `tsx` for unit tests at `packages/crm/tests/unit/`, run via `pnpm test:unit` from repo root. pnpm + turbo monorepo. No DB migration. New plugin-bundled SKILL.md at `skills/landing-page-creation/SKILL.md`.

**Spec:** `docs/superpowers/specs/2026-05-15-ops-stack-only-workspace-creation-design.md` (commit `513e94a1`).

---

## File Structure

### Modified

| Path | Change | Why |
|------|--------|-----|
| `packages/crm/src/components/landing/sections/types.ts` | Extend `LandingPageSection["type"]` union with `"chatbot-preview"` | New section type the page renderer dispatches on |
| `packages/crm/src/components/landing/block-registry.tsx` | Import + register a `chatbot-preview` block manifest | Dispatch the new section type to the ChatbotPreview component |
| `packages/crm/src/lib/agents/store.ts` | Add optional `status?: "draft" \| "test" \| "live"` field to `CreateAgentInput`; use `input.status ?? "draft"` at the insert | Lets `v2/complete` pass `status: "test"` explicitly without changing default for other callers |
| `packages/crm/src/lib/workspace/create-full.ts` | Remove the `enhanceLandingForWorkspace` try/catch block (lines ~497-536) | Eliminates the ~2.5-min LLM block generation from the default workspace creation path |
| `packages/crm/src/app/api/v1/workspace/v2/complete/route.ts` | Pass `status: "test"` to `createAgent`; call new `seedChatbotPreviewLanding` after chatbot creation; reshape response (chatbot + ops_stack + available_automations) | Wires the new behavior: responsive chatbot, chatbot-preview page seeded, new response shape |
| `packages/crm/src/app/api/v1/workspace/[id]/snapshot/route.ts` | Add `ops_stack` + `available_automations` to the snapshot response | finalize_workspace MCP tool reads from snapshot — needs the new fields |
| `skills/mcp-server/src/tools.js` | Rewrite finalize_workspace summary template (chatbot-first, 7-automation callout, landing-page nudge); rewrite next_steps_available | The verbatim operator output |
| `skills/mcp-server/package.json` | Bump version 1.53.0 → 1.55.0 | Signals the meaningful behavior change |

### Created

| Path | Purpose |
|------|---------|
| `packages/crm/src/components/landing/sections/chatbot-preview.tsx` | The full-page chat-interface React component (NOT floating widget) |
| `packages/crm/src/lib/workspace/seed-chatbot-preview-landing.ts` | Server-side function: replaces landing_pages.sections with a single chatbot-preview section |
| `skills/landing-page-creation/SKILL.md` | New plugin-bundled skill — operator-prompted landing page generation walkthrough |
| `packages/crm/tests/unit/seed-chatbot-preview-landing.spec.ts` | Verifies seeding writes the expected section shape, tagline fallback, embed URL format |
| `packages/crm/tests/unit/create-agent-status-input.spec.ts` | Verifies createAgent accepts the new optional status field and defaults to "draft" when omitted |
| `packages/crm/tests/unit/finalize-summary-v1-55.spec.ts` | Snapshot tests of the rewritten finalize_workspace summary string across 3 fixtures |
| `packages/crm/tests/unit/chatbot-preview-section.spec.tsx` | Component snapshot: renders with business name, tagline, theme palette, embed URL |

### NOT modified (out of scope reminder)

- `packages/crm/src/lib/workspace/enhance-blocks.ts` — code stays (called by landing-page-creation SKILL.md path via persist_block)
- `packages/crm/src/lib/billing/anonymous-workspace.ts` — keeps creating landing_pages row + soul-driven seeding (the new chatbot-preview seed REPLACES it post-creation)
- `packages/crm/src/lib/agents/archetypes/*` — 7 automation archetypes referenced from the snapshot; not modified
- Per-archetype hero templates (bold-urgency template etc.) — deferred per spec Section 3
- lucide-react proper fix — deferred per spec Section 3
- Existing workspaces — keep their landing pages (backward compat)

---

## Task 1: Extend LandingPageSection union with chatbot-preview

**Files:**
- Modify: `packages/crm/src/components/landing/sections/types.ts:272-292`

- [ ] **Step 1: Read the current LandingPageSection union**

```bash
grep -n "LandingPageSection\b" packages/crm/src/components/landing/sections/types.ts
```

Expected: line ~272 has `export type LandingPageSection = { type: ... }` with the existing union of section types.

- [ ] **Step 2: Add `"chatbot-preview"` to the union**

Open `packages/crm/src/components/landing/sections/types.ts`. Find the `LandingPageSection` type (around line 272). Add `"chatbot-preview"` at the end of the `type` union:

```typescript
export type LandingPageSection = {
  type:
    | "navbar"
    | "hero"
    | "benefits"
    | "whoitsfor"
    | "features"
    | "process"
    | "testimonials"
    | "pricing"
    | "faq"
    | "cta"
    | "footer"
    | "servicesGrid"
    | "emergencyStrip"
    | "serviceArea"
    | "projectGallery"
    | "stickyMobileCTA"
    // v1.55.0 — default public surface when no landing page is generated.
    // Renders a full-page branded chat interface for the workspace's
    // website-chatbot agent. Evicted when an operator persists hero/services
    // /etc via the landing-page-creation SKILL.md flow.
    | "chatbot-preview";
  content: Record<string, unknown>;
  order: number;
};
```

Also add the content shape interface just above the `LandingPageSection` type (alongside the other `*SectionContent` interfaces in the file):

```typescript
/** v1.55.0 — content for the chatbot-preview section type. */
export interface ChatbotPreviewSectionContent {
  /** Business name (h1 on the page). */
  businessName: string;
  /** One-line tagline below the h1. Falls back to `AI receptionist — ask ${businessName} anything`. */
  tagline: string;
  /** Full https:// URL to the agent's embed.js. */
  embedUrl: string;
  /** Theme mode for the page background. */
  themeMode: "light" | "dark";
}
```

- [ ] **Step 3: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: clean. (Other files that switch on `section.type` may emit warnings about a missing case — that's expected and will be fixed in Task 2.)

If typecheck emits errors about exhaustive switches in other files, capture them — Task 2 fixes them by registering the manifest. If errors are unrelated, investigate.

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/components/landing/sections/types.ts
git commit -m "feat(landing-types): add chatbot-preview section type + content shape"
```

---

## Task 2: Build ChatbotPreview React component + register manifest (TDD)

**Files:**
- Create: `packages/crm/src/components/landing/sections/chatbot-preview.tsx`
- Create: `packages/crm/tests/unit/chatbot-preview-section.spec.tsx`
- Modify: `packages/crm/src/components/landing/block-registry.tsx`

- [ ] **Step 1: Write the failing component test**

Create `packages/crm/tests/unit/chatbot-preview-section.spec.tsx`:

```typescript
// Tests for the v1.55.0 ChatbotPreview section component.
//
// Renders the workspace name, tagline, an embedded chatbot script tag,
// and the copy-snippet helper for the agency operator. Uses
// renderToString (no jsdom) — matches the existing test patterns
// for other landing section components.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";

import { ChatbotPreviewSection } from "../../src/components/landing/sections/chatbot-preview";

describe("ChatbotPreviewSection", () => {
  test("renders business name as the h1", () => {
    const html = renderToString(
      <ChatbotPreviewSection
        businessName="Ignitify Cooling"
        tagline="AI receptionist — ask anything"
        embedUrl="https://example.com/embed.js"
        themeMode="light"
      />,
    );
    assert.ok(html.includes("<h1"), "should have an h1");
    assert.ok(html.includes("Ignitify Cooling"), "h1 should contain business name");
  });

  test("renders the tagline as descriptive text", () => {
    const html = renderToString(
      <ChatbotPreviewSection
        businessName="Acme"
        tagline="AI receptionist — ask anything"
        embedUrl="https://example.com/embed.js"
        themeMode="light"
      />,
    );
    assert.ok(
      html.includes("AI receptionist — ask anything"),
      "tagline should appear in the rendered output",
    );
  });

  test("injects the embed.js script tag for the agent", () => {
    const html = renderToString(
      <ChatbotPreviewSection
        businessName="Acme"
        tagline="test"
        embedUrl="https://app.seldonframe.com/api/v1/public/agent/acme--default/embed.js"
        themeMode="light"
      />,
    );
    assert.ok(
      html.includes('src="https://app.seldonframe.com/api/v1/public/agent/acme--default/embed.js"'),
      "embed URL should appear as a script tag src attribute",
    );
    assert.ok(html.includes("async"), "script tag should be async");
  });

  test("shows the paste-snippet helper for the agency operator", () => {
    const html = renderToString(
      <ChatbotPreviewSection
        businessName="Acme"
        tagline="test"
        embedUrl="https://example.com/embed.js"
        themeMode="light"
      />,
    );
    assert.ok(
      html.includes("Want this on your site?"),
      "operator-helper copy should appear",
    );
    assert.ok(
      html.includes("&lt;script") || html.includes("<script"),
      "snippet should be visible (HTML-encoded or literal) for the operator to copy",
    );
  });

  test("light mode uses light background", () => {
    const html = renderToString(
      <ChatbotPreviewSection
        businessName="Acme"
        tagline="test"
        embedUrl="https://example.com/embed.js"
        themeMode="light"
      />,
    );
    assert.ok(
      /background[^"]*:\s*var\(--sf-bg\)/.test(html) ||
        html.includes("--sf-bg") ||
        /bg-(white|background)/.test(html),
      "light mode should set a light background via theme var or class",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:unit 2>&1 | grep -E "(chatbot-preview-section|fail )" | head -10
```

Expected: TypeScript / import error — `ChatbotPreviewSection` doesn't exist yet. This proves the test wires the right module.

- [ ] **Step 3: Create the ChatbotPreview React component**

Create `packages/crm/src/components/landing/sections/chatbot-preview.tsx`:

```typescript
// v1.55.0 — Default public surface for new workspaces when no landing
// page is generated. Renders a full-page branded chat interface
// (NOT the floating widget) so the agency operator can share a URL
// with their client to demo the AI receptionist before pasting the
// embed snippet on the client's existing site.
//
// Theme tokens (--sf-bg, --sf-text, --sf-primary, --sf-accent) are
// applied by the existing PublicThemeProvider higher in the tree.
// The component just consumes them via CSS variables — no theme
// prop drilling required.

import type { ChatbotPreviewSectionContent } from "./types";

export function ChatbotPreviewSection(props: ChatbotPreviewSectionContent) {
  const { businessName, tagline, embedUrl } = props;
  const snippet = `<script src="${embedUrl}" async></script>`;

  return (
    <section
      className="min-h-screen flex flex-col items-center justify-center px-6 py-12"
      style={{
        backgroundColor: "var(--sf-bg)",
        color: "var(--sf-text)",
      }}
    >
      <div className="max-w-3xl w-full mx-auto text-center">
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
          {businessName}
        </h1>
        <p
          className="mt-3 text-base md:text-lg opacity-70"
          style={{ color: "var(--sf-text)" }}
        >
          {tagline}
        </p>

        {/* The actual chatbot — embed.js loads the floating widget.
            On this demo page, the widget is the primary content; on
            real client sites where the snippet gets pasted, it's an
            unobtrusive floating button. */}
        <div className="mt-12">
          <div
            id="seldonframe-chatbot-preview-root"
            className="rounded-2xl border p-8 min-h-[400px] flex items-center justify-center"
            style={{ borderColor: "var(--sf-accent)" }}
          >
            <p className="opacity-60">
              Loading your AI receptionist…
            </p>
          </div>
          <script async src={embedUrl} />
        </div>

        {/* Operator helper: the embed snippet to copy onto the client's
            existing site. Rendered as a literal code block so the
            operator can select + copy. */}
        <div
          className="mt-16 pt-8 border-t text-left"
          style={{ borderColor: "var(--sf-accent)", opacity: 0.85 }}
        >
          <p className="text-sm font-medium">
            Want this on your site? Paste before <code>&lt;/body&gt;</code>:
          </p>
          <pre
            className="mt-3 rounded-lg p-4 text-xs overflow-x-auto"
            style={{
              backgroundColor: "var(--sf-text)",
              color: "var(--sf-bg)",
            }}
          >
            <code>{snippet}</code>
          </pre>
          <p className="mt-4 text-xs opacity-60">
            Or skip the paste — share this URL with your customers directly.
          </p>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Register the manifest in block-registry**

Open `packages/crm/src/components/landing/block-registry.tsx`. Add the import at the top (alongside the other section imports):

```typescript
import { ChatbotPreviewSection } from "./sections/chatbot-preview";
```

Add the type import for the content shape (alongside the other `*SectionContent` imports):

```typescript
import type {
  // ...existing imports...
  ChatbotPreviewSectionContent,
} from "./sections/types";
```

Then add a new manifest entry to the `landingBlockRegistry` array. Place it at the END of the array (after the existing entries) so legacy section ordering is preserved:

```typescript
{
  type: "chatbot-preview",
  label: "Chatbot Preview (default public surface)",
  category: "SeldonFrame",
  grapesId: "sf-chatbot-preview",
  grapesContent:
    '<section class="py-20 text-center"><h1 class="text-4xl font-semibold">Your Business</h1><p class="mt-3 opacity-70">AI receptionist — ask anything</p><div class="mt-12 rounded-2xl border p-8 min-h-[400px]">Loading your AI receptionist…</div></section>',
  render: (content, key) => (
    <ChatbotPreviewSection key={key} {...(content as ChatbotPreviewSectionContent)} />
  ),
},
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test:unit 2>&1 | grep -E "(chatbot-preview-section|pass |fail )" | head -15
```

Expected: all 5 component tests in `chatbot-preview-section.spec.tsx` pass.

- [ ] **Step 6: Run typecheck**

```bash
pnpm typecheck
```

Expected: clean. Any prior exhaustive-switch warnings from Task 1 should resolve now that the manifest is registered.

- [ ] **Step 7: Commit**

```bash
git add packages/crm/src/components/landing/sections/chatbot-preview.tsx packages/crm/tests/unit/chatbot-preview-section.spec.tsx packages/crm/src/components/landing/block-registry.tsx
git commit -m "feat(landing): add ChatbotPreview section component + block registry entry"
```

---

## Task 3: Add optional `status` field to createAgent input (TDD)

**Files:**
- Modify: `packages/crm/src/lib/agents/store.ts:90-167`
- Create: `packages/crm/tests/unit/create-agent-status-input.spec.ts`

- [ ] **Step 1: Read the current CreateAgentInput interface**

```bash
grep -n "CreateAgentInput\|status:" packages/crm/src/lib/agents/store.ts | head -15
```

Expected: a `CreateAgentInput` interface (around line ~30-60) defining the input shape, and `status: "draft"` hardcoded in the insert (around line 165).

- [ ] **Step 2: Write the failing test**

Create `packages/crm/tests/unit/create-agent-status-input.spec.ts`:

```typescript
// Tests for the v1.55.0 optional `status` field on createAgent input.
//
// v1.55 introduces the field so v2/complete can pass status: "test"
// for the auto-created website-chatbot (the chatbot needs to respond
// on the preview page immediately). Backward compat: when omitted,
// status defaults to "draft" — preserves behavior for other callers.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type { CreateAgentInput } from "../../src/lib/agents/store";

describe("CreateAgentInput.status — type contract", () => {
  test("accepts no status (defaults to draft at the insert site)", () => {
    // Type-level assertion: this should compile.
    const input: CreateAgentInput = {
      orgId: "org-1",
      archetype: "website-chatbot",
      channel: "web_chat",
      name: "Acme Chatbot",
    };
    assert.equal(input.orgId, "org-1");
    // No status property — typecheck must allow this.
  });

  test("accepts status: 'test'", () => {
    const input: CreateAgentInput = {
      orgId: "org-1",
      archetype: "website-chatbot",
      channel: "web_chat",
      name: "Acme Chatbot",
      status: "test",
    };
    assert.equal(input.status, "test");
  });

  test("accepts status: 'draft'", () => {
    const input: CreateAgentInput = {
      orgId: "org-1",
      archetype: "website-chatbot",
      channel: "web_chat",
      name: "Acme Chatbot",
      status: "draft",
    };
    assert.equal(input.status, "draft");
  });

  test("accepts status: 'live'", () => {
    const input: CreateAgentInput = {
      orgId: "org-1",
      archetype: "website-chatbot",
      channel: "web_chat",
      name: "Acme Chatbot",
      status: "live",
    };
    assert.equal(input.status, "live");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm test:unit 2>&1 | grep -E "(create-agent-status-input|fail )" | head -10
```

Expected: TypeScript compile error about `status` not being in `CreateAgentInput`. Proves the test wires the right module.

- [ ] **Step 4: Add status to CreateAgentInput + plumb to insert**

Open `packages/crm/src/lib/agents/store.ts`. Find the `CreateAgentInput` interface (around line 30-60). Add the optional status field at the end of the interface:

```typescript
export interface CreateAgentInput {
  orgId: string;
  archetype: AgentArchetype;
  channel: AgentChannel;
  name: string;
  capabilities?: AgentCapability[];
  faq?: AgentFaqEntry[];
  pricingFacts?: string[];
  greeting?: string;
  /** v1.55.0 — Optional initial status. Defaults to "draft" when
   *  omitted (preserves behavior for callers that don't specify).
   *  v2/complete sets this to "test" so the auto-created website
   *  chatbot is responsive on the preview page immediately. */
  status?: "draft" | "test" | "live";
}
```

Then find the `db.insert(agents).values({ ... status: "draft" })` block (around line 155-167). Change the hardcoded status to use the input:

```typescript
const [created] = await db
  .insert(agents)
  .values({
    orgId: input.orgId,
    name: input.name.trim(),
    slug,
    channel: input.channel,
    archetype: input.archetype,
    blueprint,
    currentVersion: 1,
    // v1.55.0 — honor input.status (default "draft" for backward compat).
    status: input.status ?? "draft",
  })
  .returning();
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test:unit 2>&1 | grep -E "(create-agent-status-input|pass |fail )" | head -15
```

Expected: all 4 tests in `create-agent-status-input.spec.ts` pass.

- [ ] **Step 6: Run typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add packages/crm/src/lib/agents/store.ts packages/crm/tests/unit/create-agent-status-input.spec.ts
git commit -m "feat(agents): add optional status field to CreateAgentInput (default draft)"
```

---

## Task 4: Implement seedChatbotPreviewLanding function (TDD)

**Files:**
- Create: `packages/crm/src/lib/workspace/seed-chatbot-preview-landing.ts`
- Create: `packages/crm/tests/unit/seed-chatbot-preview-landing.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/crm/tests/unit/seed-chatbot-preview-landing.spec.ts`:

```typescript
// Tests for v1.55.0 seedChatbotPreviewLanding.
//
// Writes a single chatbot-preview section to landing_pages.sections,
// replacing any existing sections (the chatbot-preview IS the default
// public surface for new workspaces). Tagline falls back to a generic
// when soul.business_description is null. Embed URL format matches
// the existing chatbot embed pattern.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildChatbotPreviewSection,
  type SeedChatbotPreviewInput,
} from "../../src/lib/workspace/seed-chatbot-preview-landing";

describe("buildChatbotPreviewSection — pure shape construction", () => {
  test("uses business_description as tagline when present", () => {
    const input: SeedChatbotPreviewInput = {
      orgId: "org-1",
      businessName: "Ignitify Cooling",
      tagline: "BBB-accredited HVAC team serving El Paso",
      orgSlug: "ignitify-cooling",
      agentSlug: "default",
      workspaceBaseDomain: "app.seldonframe.com",
    };
    const section = buildChatbotPreviewSection(input);
    assert.equal(section.type, "chatbot-preview");
    assert.equal(section.order, 1);
    assert.equal(section.content.businessName, "Ignitify Cooling");
    assert.equal(section.content.tagline, "BBB-accredited HVAC team serving El Paso");
  });

  test("falls back to generic tagline when tagline is null", () => {
    const input: SeedChatbotPreviewInput = {
      orgId: "org-2",
      businessName: "Acme Plumbing",
      tagline: null,
      orgSlug: "acme-plumbing",
      agentSlug: "default",
      workspaceBaseDomain: "app.seldonframe.com",
    };
    const section = buildChatbotPreviewSection(input);
    assert.equal(
      section.content.tagline,
      "AI receptionist — ask Acme Plumbing anything",
    );
  });

  test("constructs embed URL with org-slug--agent-slug pattern", () => {
    const input: SeedChatbotPreviewInput = {
      orgId: "org-3",
      businessName: "Acme",
      tagline: null,
      orgSlug: "acme",
      agentSlug: "default",
      workspaceBaseDomain: "app.seldonframe.com",
    };
    const section = buildChatbotPreviewSection(input);
    assert.equal(
      section.content.embedUrl,
      "https://app.seldonframe.com/api/v1/public/agent/acme--default/embed.js",
    );
  });

  test("defaults themeMode to 'light'", () => {
    const input: SeedChatbotPreviewInput = {
      orgId: "org-4",
      businessName: "Acme",
      tagline: null,
      orgSlug: "acme",
      agentSlug: "default",
      workspaceBaseDomain: "app.seldonframe.com",
    };
    const section = buildChatbotPreviewSection(input);
    assert.equal(section.content.themeMode, "light");
  });

  test("honors explicit themeMode override", () => {
    const input: SeedChatbotPreviewInput = {
      orgId: "org-5",
      businessName: "Acme",
      tagline: null,
      orgSlug: "acme",
      agentSlug: "default",
      workspaceBaseDomain: "app.seldonframe.com",
      themeMode: "dark",
    };
    const section = buildChatbotPreviewSection(input);
    assert.equal(section.content.themeMode, "dark");
  });

  test("truncates very long taglines to 200 chars (defensive)", () => {
    const longTagline = "A".repeat(500);
    const input: SeedChatbotPreviewInput = {
      orgId: "org-6",
      businessName: "Acme",
      tagline: longTagline,
      orgSlug: "acme",
      agentSlug: "default",
      workspaceBaseDomain: "app.seldonframe.com",
    };
    const section = buildChatbotPreviewSection(input);
    assert.ok(section.content.tagline.length <= 200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:unit 2>&1 | grep -E "(seed-chatbot-preview-landing|fail )" | head -10
```

Expected: import error — `buildChatbotPreviewSection` doesn't exist. Proves the test wires the right module.

- [ ] **Step 3: Implement the seeding module**

Create `packages/crm/src/lib/workspace/seed-chatbot-preview-landing.ts`:

```typescript
// v1.55.0 — Seed the default public landing for a new workspace with
// a single chatbot-preview section. Replaces the legacy soul-driven
// landing seed for the lean URL flow (create_workspace_from_url path).
//
// The chatbot-preview section is the default public surface — operator
// can replace it later via the landing-page-creation SKILL.md, which
// triggers persist_block calls that overwrite this section with
// hero/services/etc.
//
// This module exports BOTH a pure shape builder (buildChatbotPreviewSection)
// AND the I/O wrapper (seedChatbotPreviewLanding) so tests can verify
// the shape without spinning up a DB.

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { landingPages } from "@/db/schema/landing-pages";
import { organizations } from "@/db/schema/organizations";
import type { LandingPageSection } from "@/components/landing/sections/types";

export interface SeedChatbotPreviewInput {
  orgId: string;
  businessName: string;
  /** Soul.business_description preferred. null falls back to a generic. */
  tagline: string | null;
  orgSlug: string;
  agentSlug: string;
  /** Defaults to process.env.WORKSPACE_BASE_DOMAIN if set, else "app.seldonframe.com". */
  workspaceBaseDomain?: string;
  /** Defaults to "light". */
  themeMode?: "light" | "dark";
}

const TAGLINE_MAX_CHARS = 200;

/**
 * Pure shape builder — no I/O. Tests use this to verify the section
 * shape without spinning up a DB.
 */
export function buildChatbotPreviewSection(
  input: SeedChatbotPreviewInput,
): LandingPageSection {
  const baseDomain =
    input.workspaceBaseDomain ??
    process.env.WORKSPACE_BASE_DOMAIN ??
    "app.seldonframe.com";

  const embedUrl = `https://${baseDomain}/api/v1/public/agent/${input.orgSlug}--${input.agentSlug}/embed.js`;

  const rawTagline =
    input.tagline?.trim() ||
    `AI receptionist — ask ${input.businessName} anything`;
  const tagline =
    rawTagline.length > TAGLINE_MAX_CHARS
      ? rawTagline.slice(0, TAGLINE_MAX_CHARS)
      : rawTagline;

  return {
    type: "chatbot-preview",
    order: 1,
    content: {
      businessName: input.businessName,
      tagline,
      embedUrl,
      themeMode: input.themeMode ?? "light",
    },
  };
}

/**
 * I/O wrapper — replaces the existing landing_pages row for this
 * workspace with a single chatbot-preview section. If no row exists,
 * inserts one. Logs `chatbot_preview_seeded` on success.
 *
 * Soft-fail: errors are logged but never thrown — workspace creation
 * never blocks on this. The fallback is "no landing page row" which
 * renders as a 404 (acceptable; operator can regenerate via the
 * landing-page-creation SKILL.md).
 */
export async function seedChatbotPreviewLanding(
  input: SeedChatbotPreviewInput,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const section = buildChatbotPreviewSection(input);

    // Fetch existing landing_pages row for this org's home slug.
    const [existing] = await db
      .select({ id: landingPages.id })
      .from(landingPages)
      .where(
        and(
          eq(landingPages.orgId, input.orgId),
          eq(landingPages.slug, "home"),
        ),
      )
      .limit(1);

    if (existing) {
      // Replace sections; null out contentHtml/Css so the sections-based
      // renderer takes precedence.
      await db
        .update(landingPages)
        .set({
          sections: [section] as unknown as Record<string, unknown>[],
          contentHtml: null,
          contentCss: null,
          updatedAt: new Date(),
        })
        .where(eq(landingPages.id, existing.id));
    } else {
      // Workspace doesn't have a landing_pages row yet (unusual for v2
      // flow — anonymous-workspace.ts creates one — but defensive).
      await db.insert(landingPages).values({
        orgId: input.orgId,
        slug: "home",
        title: input.businessName,
        sections: [section] as unknown as Record<string, unknown>[],
        contentHtml: null,
        contentCss: null,
      });
    }

    console.warn(
      JSON.stringify({
        event: "chatbot_preview_seeded",
        workspace_id: input.orgId,
        agent_slug: input.agentSlug,
        seeded_replace: Boolean(existing),
      }),
    );

    return { ok: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(
      JSON.stringify({
        event: "chatbot_preview_seed_failed",
        workspace_id: input.orgId,
        reason,
      }),
    );
    return { ok: false, reason };
  }
}

/** Convenience: load businessName + orgSlug + tagline from the org row
 *  and seed in one call. Used by v2/complete. */
export async function seedChatbotPreviewLandingForOrg(args: {
  orgId: string;
  agentSlug: string;
  workspaceBaseDomain?: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const [org] = await db
    .select({
      name: organizations.name,
      slug: organizations.slug,
      soul: organizations.soul,
    })
    .from(organizations)
    .where(eq(organizations.id, args.orgId))
    .limit(1);

  if (!org) {
    return { ok: false, reason: "org_not_found" };
  }

  // Pull tagline from soul.business_description (snake_case JSONB shape,
  // not camelCase TS interface — codebase convention; see resolveOrgArchetype
  // in lib/page-blocks/persist.ts for the same pattern).
  const soulRecord = org.soul as Record<string, unknown> | null;
  const tagline =
    typeof soulRecord?.business_description === "string"
      ? (soulRecord.business_description as string)
      : null;

  return seedChatbotPreviewLanding({
    orgId: args.orgId,
    businessName: org.name,
    tagline,
    orgSlug: org.slug,
    agentSlug: args.agentSlug,
    workspaceBaseDomain: args.workspaceBaseDomain,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test:unit 2>&1 | grep -E "(seed-chatbot-preview-landing|pass |fail )" | head -15
```

Expected: all 6 tests pass.

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/crm/src/lib/workspace/seed-chatbot-preview-landing.ts packages/crm/tests/unit/seed-chatbot-preview-landing.spec.ts
git commit -m "feat(workspace): add seedChatbotPreviewLanding (pure shape + DB seeding)"
```

---

## Task 5: Wire v2/complete — pass status:test, seed preview, reshape response

**Files:**
- Modify: `packages/crm/src/app/api/v1/workspace/v2/complete/route.ts:75-180`

This task ties together Tasks 2-4. No new test (covered by Task 6's snapshot integration test + Task 11's smoke test).

- [ ] **Step 1: Read the current v2/complete chatbot creation block**

```bash
grep -n "createAgent\|chatbot_agent_id\|chatbot_embed" packages/crm/src/app/api/v1/workspace/v2/complete/route.ts | head -15
```

Expected: lines ~75-180. Verify the current structure matches: try/catch around `createAgent`, returns `chatbot_agent_id` / `chatbot_embed_url` / `chatbot_embed_snippet` at the end.

- [ ] **Step 2: Add the new imports**

Open `packages/crm/src/app/api/v1/workspace/v2/complete/route.ts`. Add to the imports near the top (alongside the existing `createAgent` import):

```typescript
import { seedChatbotPreviewLandingForOrg } from "@/lib/workspace/seed-chatbot-preview-landing";
import { listArchetypes } from "@/lib/agents/archetypes";
```

- [ ] **Step 3: Pass status: "test" to createAgent**

Find the `createAgent({ ... })` call (around line 115). Add `status: "test"` to the input:

```typescript
const agentResult = await createAgent({
  orgId: workspaceId,
  archetype: "website-chatbot",
  channel: "web_chat",
  name: `${org?.slug ?? "Website"} Chatbot`,
  // Empty FAQ scaffold — operator refines via update_website_chatbot
  // before calling publish_agent.
  faq: [],
  // v1.55.0 — TEST status so the chatbot responds on the preview page
  // immediately. Operator promotes to LIVE via publish_agent when the
  // client is ready to paste the embed on their real site.
  status: "test",
});
```

- [ ] **Step 4: After successful chatbot creation/reuse, seed the chatbot-preview landing**

Right after the chatbot create-or-reuse block ends (around line 149, just before the `return NextResponse.json({` block), add:

```typescript
// v1.55.0 — Replace the legacy soul-driven landing with a chatbot-preview
// section. This IS the default public surface for new workspaces.
// Operator can replace it later via the landing-page-creation SKILL.md.
//
// Soft-fail: if the seed fails, the workspace still has its legacy
// landing in place (created by anonymous-workspace.ts upstream) — the
// preview just shows the old generic content instead of the chatbot.
if (chatbotAgentId) {
  // Look up the agent slug (the createAgent call above returned it via
  // agentResult; the existing-chatbot branch already has existingChatbot.slug).
  const agentSlug =
    (existingChatbot?.slug as string | undefined) ??
    (agentResult?.ok ? agentResult.agent.slug : undefined);

  if (agentSlug) {
    const seedResult = await seedChatbotPreviewLandingForOrg({
      orgId: workspaceId,
      agentSlug,
      workspaceBaseDomain: baseDomain,
    });
    if (!seedResult.ok) {
      logEvent(
        "v2_chatbot_preview_seed_failed",
        { reason: seedResult.reason },
        { request, orgId: workspaceId, severity: "warn" },
      );
    }
  }
}
```

Note: the `agentResult` variable is declared inside the `else` branch (around line 115). Hoist its declaration to outside the if/else so it's in scope below the block. Refactor the existing structure as:

```typescript
let chatbotAgentId: string | null = null;
let chatbotEmbedUrl: string | null = null;
let chatbotEmbedSnippet: string | null = null;
let agentResult: Awaited<ReturnType<typeof createAgent>> | null = null;

if (existingChatbot) {
  chatbotAgentId = existingChatbot.id;
  chatbotEmbedUrl = `https://${baseDomain}/api/v1/public/agent/${org?.slug ?? workspaceId}--${existingChatbot.slug}/embed.js`;
  chatbotEmbedSnippet = `<script src="${chatbotEmbedUrl}" async></script>`;
} else {
  try {
    agentResult = await createAgent({
      orgId: workspaceId,
      archetype: "website-chatbot",
      channel: "web_chat",
      name: `${org?.slug ?? "Website"} Chatbot`,
      faq: [],
      status: "test", // v1.55.0
    });
    if (agentResult.ok) {
      chatbotAgentId = agentResult.agent.id;
      chatbotEmbedUrl = agentResult.embedUrl;
      chatbotEmbedSnippet = `<script src="${agentResult.embedUrl}" async></script>`;
    } else {
      logEvent(
        "v2_auto_chatbot_failed",
        {
          reason: "create_agent_returned_not_ok",
          error: agentResult.error,
          validation_errors: agentResult.validation_errors,
        },
        { request, orgId: workspaceId, severity: "warn" },
      );
    }
  } catch (err) {
    logEvent(
      "v2_auto_chatbot_failed",
      {
        reason: "create_agent_threw",
        error: err instanceof Error ? err.message : String(err),
      },
      { request, orgId: workspaceId, severity: "warn" },
    );
  }
}
```

- [ ] **Step 5: Reshape the response with chatbot + ops_stack + available_automations**

Replace the existing `return NextResponse.json({ ... })` at the bottom of the handler with the v1.55 shape. Find the `return NextResponse.json({ ok: true, workspace_id, ... });` block (around lines 151-180). Replace with:

```typescript
// v1.55.0 — Build the static 7-automation list from the archetype
// registry. Excludes "website-chatbot" since we already auto-created
// that one above. configured: false is a v1.55 placeholder — Brain v2
// can later flip these per workspace.
const availableAutomations = listArchetypes()
  .filter((a) => a.id !== "website-chatbot")
  .map((a) => ({
    id: a.id,
    name: a.label ?? a.id,
    configured: false,
  }));

const appHost = (process.env.SELDONFRAME_APP_BASE ?? `https://${baseDomain}`).replace(/\/$/, "");
const automationsUrl = `${appHost}/automations`;
const adminUrl = `${appHost}/admin/${encodeURIComponent(workspaceId)}`;

return NextResponse.json({
  ok: true,
  workspace_id: workspaceId,
  public_url: publicUrl,
  blocks: {
    expected,
    persisted: persisted.map((p) => ({
      name: p.blockName,
      template_version: p.templateVersion,
      updated_at: p.updatedAt,
    })),
    missing,
  },

  // v1.55.0 — chatbot promoted to first-class object
  chatbot: chatbotAgentId
    ? {
        agent_id: chatbotAgentId,
        embed_url: chatbotEmbedUrl,
        embed_snippet: chatbotEmbedSnippet,
        preview_url: publicUrl,
        status: "test" as const,
      }
    : null,

  // v1.55.0 — ops surfaces grouped
  ops_stack: {
    admin_url: adminUrl,
    booking_url: `${publicUrl}/book`,
    intake_url: `${publicUrl}/intake`,
    automations_url: automationsUrl,
  },

  // v1.55.0 — 7 ready-to-deploy automations (statically derived from registry)
  available_automations: availableAutomations,

  // Legacy fields retained for backward compat with v1.53 MCP clients.
  chatbot_agent_id: chatbotAgentId,
  chatbot_embed_url: chatbotEmbedUrl,
  chatbot_embed_snippet: chatbotEmbedSnippet,

  next_steps:
    missing.length > 0
      ? [
          `${missing.length} v2 block(s) not yet persisted: ${missing.join(", ")}.`,
          "These surfaces still render via the v1 pipeline (default copy from the personality system). The workspace is fully usable as-is.",
          "To upgrade them, call get_block_skill + persist_block for each missing block.",
        ]
      : [
          "All v2 blocks persisted. Workspace is fully v2-rendered for hero/services/faq.",
          "Operator can now customize any block via customize_block(workspace_id, block_name, prompt).",
        ],
});
```

- [ ] **Step 6: Run typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 7: Run all unit tests to confirm no regression**

```bash
pnpm test:unit 2>&1 | grep -E "(create-agent-status|seed-chatbot-preview|chatbot-preview-section|pass |fail )" | tail -30
```

Expected: tests from Tasks 2-4 still pass. No new failures from this wiring.

- [ ] **Step 8: Commit**

```bash
git add packages/crm/src/app/api/v1/workspace/v2/complete/route.ts
git commit -m "feat(v2/complete): chatbot status TEST + seed chatbot-preview + reshape response"
```

---

## Task 6: Strip enhanceLandingForWorkspace from createFullWorkspace

**Files:**
- Modify: `packages/crm/src/lib/workspace/create-full.ts:38-39, 497-536`

- [ ] **Step 1: Verify the current state of the enhance-blocks call**

```bash
grep -n "enhanceLandingForWorkspace\|enhance_blocks" packages/crm/src/lib/workspace/create-full.ts
```

Expected: an import on line ~39 and a try/catch block around line 497-536 calling `enhanceLandingForWorkspace`.

- [ ] **Step 2: Remove the import**

Open `packages/crm/src/lib/workspace/create-full.ts`. Find line ~38-39:

```typescript
// orchestrator. See lib/workspace/enhance-blocks.ts for the design rationale.
import { enhanceLandingForWorkspace } from "./enhance-blocks";
```

Delete BOTH lines (the comment + the import). Replace with:

```typescript
// v1.55.0 — enhanceLandingForWorkspace is no longer called from the
// default workspace creation path. The landing-page-creation SKILL.md
// triggers it indirectly via persist_block when operators opt into
// generating a landing page post-creation. See:
//   docs/superpowers/specs/2026-05-15-ops-stack-only-workspace-creation-design.md
```

- [ ] **Step 3: Remove the enhance-blocks try/catch block**

Find the block around lines 485-536 starting with the comment `// v1.38.0 closes the gap atomically — one server-side Opus call generates hero + servicesGrid + about + benefits + process + faq + cta...` and ending with the closing `}` of the catch block.

Replace the entire ~50-line block with a single comment:

```typescript
  // v1.55.0 — REMOVED: enhanceLandingForWorkspace (the LLM-driven block
  // generation step) is no longer called by default. The default public
  // surface is now a chatbot-preview page (seeded by v2/complete after
  // the website-chatbot agent is auto-created). Operators who want a
  // marketing landing page invoke the landing-page-creation SKILL.md
  // post-creation, which calls persist_block per block — the same
  // primitives, just operator-orchestrated instead of server-orchestrated.
  //
  // See: docs/superpowers/specs/2026-05-15-ops-stack-only-workspace-creation-design.md
  console.warn(
    JSON.stringify({
      event: "landing_page_skipped_default",
      workspace_id: createResult.orgId,
    }),
  );
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```

Expected: clean. If TypeScript complains about an unused import elsewhere, remove it.

- [ ] **Step 5: Run all unit tests to confirm no regression**

```bash
pnpm test:unit 2>&1 | grep -E "(fail )" | head -20
```

Expected: same pre-existing failures as baseline (workflow-event-log, block-codegen-staleness, SLICE 9, theme integration). No new failures.

- [ ] **Step 6: Commit**

```bash
git add packages/crm/src/lib/workspace/create-full.ts
git commit -m "feat(workspace): strip enhance-blocks from default createFullWorkspace path"
```

---

## Task 7: Add ops_stack + available_automations to snapshot endpoint

**Files:**
- Modify: `packages/crm/src/app/api/v1/workspace/[id]/snapshot/route.ts`

The MCP `finalize_workspace` tool reads from the snapshot endpoint. The new fields (chatbot, ops_stack, available_automations) need to be available there so the rewritten summary template can use them.

- [ ] **Step 1: Read the current snapshot route to know what already exists**

```bash
grep -n "chatbot\|public_urls\|return NextResponse" packages/crm/src/app/api/v1/workspace/\[id\]/snapshot/route.ts | head -20
```

Expected: existing handler returns `public_urls`, `chatbot` (from the agency-output spec), `tier`, `booking`, `intake`. We're adding `ops_stack` and `available_automations`.

- [ ] **Step 2: Add the imports**

Open `packages/crm/src/app/api/v1/workspace/[id]/snapshot/route.ts`. Add to the imports near the top (alongside other existing imports):

```typescript
import { listArchetypes } from "@/lib/agents/archetypes";
```

- [ ] **Step 3: Compute and return the new fields**

Find the `return NextResponse.json({ ... })` block at the end of the handler. Add the new fields to the returned object. Position them alongside the existing `chatbot` / `tier` / `booking` / `intake` fields:

```typescript
// v1.55.0 — Ops-stack URLs + automations callout for the new
// finalize_workspace summary template. Computed inline rather than
// stored anywhere — these are derived from existing data.
const appHost = (process.env.SELDONFRAME_APP_BASE ?? `https://${process.env.WORKSPACE_BASE_DOMAIN ?? "app.seldonframe.com"}`).replace(/\/$/, "");
const opsStack = {
  admin_url: `${appHost}/admin/${encodeURIComponent(workspaceId)}`,
  booking_url: publicUrls.book,
  intake_url: publicUrls.intake,
  automations_url: `${appHost}/automations`,
};

const availableAutomations = listArchetypes()
  .filter((a) => a.id !== "website-chatbot")
  .map((a) => ({
    id: a.id,
    name: a.label ?? a.id,
    configured: false,
  }));

return NextResponse.json({
  // ...existing fields (workspace, public_urls, chatbot, tier, booking, intake)...
  ops_stack: opsStack,
  available_automations: availableAutomations,
});
```

(If you're unsure where to splice this in, read the file's existing return statement and add the two new fields right before the closing `})` of the JSON object.)

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/app/api/v1/workspace/\[id\]/snapshot/route.ts
git commit -m "feat(snapshot): add ops_stack + available_automations for v1.55 finalize template"
```

---

## Task 8: Rewrite finalize_workspace MCP summary template (TDD)

**Files:**
- Modify: `skills/mcp-server/src/tools.js:802-1088`
- Create: `packages/crm/tests/unit/finalize-summary-v1-55.spec.ts`

The MCP tool template is JavaScript that string-builds the summary. The test snapshot-verifies the output for 3 fixture inputs.

- [ ] **Step 1: Write the failing snapshot test**

Create `packages/crm/tests/unit/finalize-summary-v1-55.spec.ts`:

```typescript
// Tests for the v1.55.0 finalize_workspace summary template.
//
// The summary is built in skills/mcp-server/src/tools.js but we test
// it via a pure helper extracted into this spec to avoid pulling in
// the entire MCP server module. The helper is also exported from
// skills/mcp-server/src/finalize-summary.js (NEW in this PR) so
// the tools.js handler delegates to it.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

// Note: skills/mcp-server is ESM. We import the helper via relative
// path from the test file. tsx + node:test handle the ESM resolution.
import { buildFinalizeSummary } from "../../../../skills/mcp-server/src/finalize-summary.js";

const baseSnapshot = {
  workspace: {
    name: "Ignitify Cooling and Heating",
    slug: "ignitify-cooling-and-heating",
    settings: { crmPersonality: { vertical: "hvac" } },
  },
  public_urls: {
    home: "https://ignitify-cooling-and-heating.app.seldonframe.com",
    book: "https://ignitify-cooling-and-heating.app.seldonframe.com/book",
    intake: "https://ignitify-cooling-and-heating.app.seldonframe.com/intake",
  },
  chatbot: {
    agent_id: "ag_abc123",
    embed_url: "https://app.seldonframe.com/api/v1/public/agent/ignitify-cooling-and-heating--default/embed.js",
    embed_snippet: '<script src="https://app.seldonframe.com/api/v1/public/agent/ignitify-cooling-and-heating--default/embed.js" async></script>',
    status: "test",
    preview_url: "https://ignitify-cooling-and-heating.app.seldonframe.com",
  },
  ops_stack: {
    admin_url: "https://app.seldonframe.com/admin/ws-123",
    booking_url: "https://ignitify-cooling-and-heating.app.seldonframe.com/book",
    intake_url: "https://ignitify-cooling-and-heating.app.seldonframe.com/intake",
    automations_url: "https://app.seldonframe.com/automations",
  },
  available_automations: [
    { id: "speed-to-lead", name: "Speed-to-Lead", configured: false },
    { id: "missed-call-text-back", name: "Missed-Call Text Back", configured: false },
    { id: "review-requester", name: "Review Requester", configured: false },
    { id: "appointment-confirm-sms", name: "Appointment Confirm via SMS", configured: false },
    { id: "weather-aware-booking", name: "Weather-Aware Booking", configured: false },
    { id: "daily-digest", name: "Daily Digest", configured: false },
    { id: "win-back", name: "Win-Back", configured: false },
  ],
  tier: {
    current_tier: "free",
    current_tier_label: "Free",
    client_portal_url: "https://app.seldonframe.com/customer/ignitify-cooling-and-heating/login",
  },
};

describe("buildFinalizeSummary — HVAC fixture", () => {
  test("includes the chatbot embed snippet front-and-center", () => {
    const out = buildFinalizeSummary({ snapshot: baseSnapshot, durationSec: 32, aestheticArchetype: "bold-urgency" });
    assert.ok(out.includes(baseSnapshot.chatbot.embed_snippet), "embed snippet must appear verbatim");
    const snippetIdx = out.indexOf(baseSnapshot.chatbot.embed_snippet);
    const automationsIdx = out.indexOf("Activate any:");
    assert.ok(snippetIdx < automationsIdx, "embed snippet should appear BEFORE the automations callout");
  });

  test("lists all 7 automations", () => {
    const out = buildFinalizeSummary({ snapshot: baseSnapshot, durationSec: 32, aestheticArchetype: "bold-urgency" });
    for (const name of ["Speed-to-Lead", "Missed-Call Text Back", "Review Requester", "Appointment Confirm via SMS", "Weather-Aware Booking", "Daily Digest", "Win-Back"]) {
      assert.ok(out.includes(name), `automation '${name}' should appear`);
    }
  });

  test("includes the automations dashboard URL + API-key helper note", () => {
    const out = buildFinalizeSummary({ snapshot: baseSnapshot, durationSec: 32, aestheticArchetype: "bold-urgency" });
    assert.ok(out.includes("https://app.seldonframe.com/automations"), "automations URL");
    assert.ok(out.includes("API keys"), "API-key helper note");
    assert.ok(out.includes("Twilio"), "Twilio mentioned");
  });

  test("includes the chatbot preview URL with 'demo for your client' framing", () => {
    const out = buildFinalizeSummary({ snapshot: baseSnapshot, durationSec: 32, aestheticArchetype: "bold-urgency" });
    assert.ok(out.includes(baseSnapshot.chatbot.preview_url), "preview URL");
    assert.ok(out.includes("Demo for your client") || out.includes("demo for your client"), "demo framing");
  });

  test("closes with the landing-page nudge naming the archetype", () => {
    const out = buildFinalizeSummary({ snapshot: baseSnapshot, durationSec: 32, aestheticArchetype: "bold-urgency" });
    assert.ok(out.includes("bold-urgency"), "archetype name should appear in the landing-page nudge");
    assert.ok(out.includes("landing-page-creation"), "skill name should appear");
  });

  test("includes duration_sec in the header", () => {
    const out = buildFinalizeSummary({ snapshot: baseSnapshot, durationSec: 32, aestheticArchetype: "bold-urgency" });
    assert.ok(out.includes("(32 seconds)") || out.includes("32 seconds"), "duration should appear");
  });

  test("includes business name in the header", () => {
    const out = buildFinalizeSummary({ snapshot: baseSnapshot, durationSec: 32, aestheticArchetype: "bold-urgency" });
    assert.ok(out.includes("Ignitify Cooling and Heating"), "business name should appear");
  });

  test("does NOT include legacy 'Powered by your Claude Code key' text", () => {
    const out = buildFinalizeSummary({ snapshot: baseSnapshot, durationSec: 32, aestheticArchetype: "bold-urgency" });
    assert.ok(!out.includes("Powered by your Claude Code key"), "legacy text should be gone");
  });

  test("does NOT include legacy 'Landing page rendered' claim", () => {
    const out = buildFinalizeSummary({ snapshot: baseSnapshot, durationSec: 32, aestheticArchetype: "bold-urgency" });
    assert.ok(!out.includes("Landing page rendered"), "legacy text should be gone");
  });
});

describe("buildFinalizeSummary — null chatbot fallback", () => {
  test("graceful summary when chatbot auto-creation failed", () => {
    const fixture = { ...baseSnapshot, chatbot: null };
    const out = buildFinalizeSummary({ snapshot: fixture, durationSec: 30, aestheticArchetype: "clinical-trust" });
    assert.ok(out.includes("scaffold pending") || out.includes("Chatbot creation failed"), "should mention chatbot fallback path");
    assert.ok(out.includes("Activate any:"), "automations callout should still appear");
  });
});

describe("buildFinalizeSummary — null archetype fallback (pre-v1.54 workspaces)", () => {
  test("landing-page nudge omits archetype name when null", () => {
    const out = buildFinalizeSummary({ snapshot: baseSnapshot, durationSec: 30, aestheticArchetype: null });
    assert.ok(out.includes("Want a landing page"), "landing-page nudge appears");
    assert.ok(!out.includes("null"), "the literal string 'null' should not appear");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:unit 2>&1 | grep -E "(finalize-summary-v1-55|fail )" | head -10
```

Expected: import error — `buildFinalizeSummary` doesn't exist. Proves the test wires the right module.

- [ ] **Step 3: Extract the summary builder into a standalone module**

Create `skills/mcp-server/src/finalize-summary.js`:

```javascript
// v1.55.0 — Standalone builder for the finalize_workspace operator summary.
// Extracted from tools.js so we can unit-test the string-building logic
// in isolation (no MCP server boot, no HTTP shims, no snapshot fetcher).
//
// The handler in tools.js fetches the snapshot, computes duration, and
// passes the result here. This file just builds the string.

/**
 * @param {object} args
 * @param {object} args.snapshot — workspace snapshot from
 *   /api/v1/workspace/<id>/snapshot. Must include: workspace.name,
 *   public_urls.{home,book,intake}, chatbot (or null), ops_stack,
 *   available_automations, tier.
 * @param {number} args.durationSec — total workspace creation time.
 * @param {string|null} args.aestheticArchetype — workspace's classified
 *   archetype (from snapshot.theme.aestheticArchetype). Used in the
 *   closing landing-page nudge.
 * @returns {string} the formatted operator summary
 */
export function buildFinalizeSummary({ snapshot, durationSec, aestheticArchetype }) {
  const ws = snapshot.workspace ?? {};
  const businessName = ws.name ?? "Your workspace";
  const chatbot = snapshot.chatbot ?? null;
  const opsStack = snapshot.ops_stack ?? {};
  const automations = snapshot.available_automations ?? [];
  const tier = snapshot.tier ?? {};
  const tierLabel = tier.current_tier_label ?? "Free";
  const isPaid = tier.current_tier === "growth" || tier.current_tier === "scale";

  // Extract client domain from the operator's input (the URL they scraped).
  // We store it on workspace.settings.source_url upstream; fall back to
  // the public preview URL host if unavailable.
  const clientDomain =
    (ws.settings && typeof ws.settings.source_url === "string"
      ? new URL(ws.settings.source_url).host
      : null) ?? "your client's site";

  const lines = [];

  // Header
  lines.push(`✅ Client ops stack ready for ${businessName}. (${durationSec} seconds)`);
  lines.push("");

  // Chatbot embed snippet (the magic moment — paste on client's existing site)
  if (chatbot && chatbot.embed_snippet) {
    lines.push(`📞 AI receptionist — paste before </body> on ${clientDomain} to go live:`);
    lines.push(chatbot.embed_snippet);
    lines.push("");
    lines.push(`🤖 Demo for your client: ${chatbot.preview_url ?? snapshot.public_urls?.home ?? ""}`);
    lines.push(`   (Chatbot live in TEST mode — share so your client can try it before pasting)`);
  } else {
    lines.push(`🤖 AI chatbot — scaffold pending. Retry:`);
    lines.push(`   create_agent({ archetype: "website-chatbot", channel: "web_chat" })`);
  }
  lines.push("");

  // Ops stack URLs
  lines.push(`📅 Booking: ${opsStack.booking_url ?? snapshot.public_urls?.book ?? ""}`);
  lines.push(`📝 Intake:  ${opsStack.intake_url ?? snapshot.public_urls?.intake ?? ""}`);
  lines.push(`🔧 Admin:   ${opsStack.admin_url ?? ""}`);
  lines.push("");

  // 7-automation callout
  if (automations.length > 0) {
    lines.push(`⚡ ${automations.length} more automations ready to deploy for this client:`);
    const descriptions = {
      "speed-to-lead": "text the lead within 30 sec of intake submission",
      "missed-call-text-back": "auto-SMS when their phone goes unanswered",
      "review-requester": "ask for a 5★ after every completed booking",
      "appointment-confirm-sms": "reduce no-shows automatically",
      "weather-aware-booking": "reschedule outdoor jobs when rain is forecast",
      "daily-digest": "morning summary of yesterday's activity",
      "win-back": "re-engage cancelled subscribers with a time-limited code",
    };
    for (const a of automations) {
      const desc = descriptions[a.id] ?? "";
      lines.push(`   • ${a.name}${desc ? " — " + desc : ""}`);
    }
    lines.push(`   Activate any: ${opsStack.automations_url ?? ""}`);
    lines.push(
      `   (Need API keys for SMS/email? Just ask — Claude will walk you through`,
    );
    lines.push(`    Twilio / Resend / Stripe setup when an automation needs one.)`);
    lines.push("");
  }

  // Tier + client portal
  const tierUpsell = isPaid
    ? "white-label + reseller pricing on Scale ($99/mo)"
    : "Upgrade $9/mo for unlimited workspaces";
  const clientPortalUrl = tier.client_portal_url ?? "";
  lines.push(
    `💼 Tier: ${tierLabel}  ·  ${tierUpsell}` +
      (clientPortalUrl ? `  ·  Client portal: ${clientPortalUrl}` : ""),
  );
  lines.push("");

  // Landing-page nudge (closing)
  const archetypeClause = aestheticArchetype ? ` in ${aestheticArchetype} style` : "";
  lines.push(
    `Want a landing page too? Just ask: "build a landing page for ${businessName}${archetypeClause}"`,
  );
  lines.push(
    `— Claude will use the landing-page-creation skill to generate one${aestheticArchetype ? " with the archetype voice" : ""}.`,
  );

  return lines.join("\n");
}
```

- [ ] **Step 4: Wire the builder into the tools.js handler**

Open `skills/mcp-server/src/tools.js`. Add the import near the top of the file (alongside other relative imports):

```javascript
import { buildFinalizeSummary } from "./finalize-summary.js";
```

Find the `finalize_workspace` handler's summary-building section (lines ~923-1024 — the `const lines = []; lines.push(...); ... const summary = lines.join("\n");` block). Replace the entire block with:

```javascript
      // v1.55.0 — Ops-stack-only workspace creation. The summary is
      // built by buildFinalizeSummary in ./finalize-summary.js; we
      // pass the snapshot + duration + archetype here.
      const aestheticArchetype = snapshot?.theme?.aestheticArchetype ?? null;
      const summary = buildFinalizeSummary({
        snapshot,
        durationSec: Math.round((Date.now() - new Date(snapshot.workspace?.createdAt ?? Date.now()).getTime()) / 1000),
        aestheticArchetype,
      });
```

(If `snapshot.workspace.createdAt` isn't available in the existing snapshot shape, replace the `durationSec` line with `durationSec: 0` for now — the smoke test will report actual duration via Vercel logs, not the summary text.)

- [ ] **Step 5: Update next_steps_available**

Still in `skills/mcp-server/src/tools.js`. Find the `next_steps_available` array at the end of the `finalize_workspace` handler (around lines 1054-1085). Replace with:

```javascript
        next_steps_available: [
          {
            id: "deploy_chatbot_embed",
            label: "Paste chatbot embed on client's existing site",
            action: "user_action",
            payload: {
              snippet: chatbot?.embed_snippet ?? null,
              target: snapshot?.workspace?.settings?.source_url ?? null,
            },
          },
          {
            id: "promote_chatbot_to_live",
            label: "Promote chatbot from TEST to LIVE (when ready for production)",
            action: "publish_agent",
            payload: { agent_id: chatbot?.agent_id ?? null },
          },
          {
            id: "activate_automation",
            label: "Activate one of the 7 ready automations",
            action: "open_dashboard",
            payload: { url: snapshot?.ops_stack?.automations_url ?? null },
          },
          {
            id: "configure_integration",
            label: "Configure Twilio / Resend / Stripe for SMS / email / payments",
            action: "claude_assisted",
            payload: { available_providers: ["twilio", "resend", "stripe"] },
          },
          {
            id: "build_landing_page",
            label: "Build a landing page (uses landing-page-creation skill)",
            action: "claude_assisted",
            payload: {
              skill: "landing-page-creation",
              archetype: snapshot?.theme?.aestheticArchetype ?? null,
            },
          },
          {
            id: "customize_chatbot_faq",
            label: "Refine the chatbot's FAQ from source site content",
            action: "claude_assisted",
            payload: { agent_id: chatbot?.agent_id ?? null },
          },
        ],
```

- [ ] **Step 6: Run tests to verify the new helper is exercised**

```bash
pnpm test:unit 2>&1 | grep -E "(finalize-summary-v1-55|pass |fail )" | head -20
```

Expected: all 11 tests in `finalize-summary-v1-55.spec.ts` pass.

- [ ] **Step 7: Run typecheck**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add skills/mcp-server/src/finalize-summary.js skills/mcp-server/src/tools.js packages/crm/tests/unit/finalize-summary-v1-55.spec.ts
git commit -m "feat(mcp): rewrite finalize_workspace summary (chatbot-first, 7-automation callout)"
```

---

## Task 9: Bump MCP server version 1.53.0 → 1.55.0

**Files:**
- Modify: `skills/mcp-server/package.json`

- [ ] **Step 1: Read the current version**

```bash
grep '"version"' skills/mcp-server/package.json
```

Expected: `"version": "1.53.0",`

- [ ] **Step 2: Bump to 1.55.0**

Open `skills/mcp-server/package.json`. Find:

```json
"version": "1.53.0",
```

Replace with:

```json
"version": "1.55.0",
```

(Skipping 1.54.0 because that internal version was used by the archetype work which was pure backend, no MCP changes.)

- [ ] **Step 3: Commit**

```bash
git add skills/mcp-server/package.json
git commit -m "chore(mcp): bump version to 1.55.0 for ops-stack-only workspace creation"
```

---

## Task 10: New landing-page-creation SKILL.md

**Files:**
- Create: `skills/landing-page-creation/SKILL.md`

- [ ] **Step 1: Verify the skills directory exists**

```bash
ls skills/
```

Expected: should show `mcp-server/` (and possibly other plugin-bundled skills). If `landing-page-creation/` doesn't exist yet, that's fine — we're creating it.

- [ ] **Step 2: Create the SKILL.md**

Create `skills/landing-page-creation/SKILL.md`:

```markdown
---
name: landing-page-creation
version: 1.0.0
description: |
  Build a SeldonFrame workspace's marketing landing page using the existing
  block primitives (get_block_skill + persist_block). Use when the operator
  asks to "build a landing page", "make a website", "design the home page",
  "redo the landing", or similar. Triggers AFTER workspace has been created
  via create_workspace_from_url (which by default creates only a chatbot-
  preview demo page — this skill replaces it with a marketing landing page).
when_to_use:
  - operator explicitly asks for a landing page
  - operator asks to redesign / refresh / regenerate the public site
  - operator asks to "show more than the chatbot demo"
  - operator wants a marketing surface for a client whose existing site is poor
when_not_to_use:
  - operator just created the workspace and hasn't asked for a landing page
    (the chatbot-preview is the intentional default — don't pre-generate)
  - operator wants to edit a single block (use customize_block instead)
  - operator wants a quiz funnel, intake form, or other non-landing block
---

# Landing-page creation

You are building a marketing landing page for a SeldonFrame workspace.
The workspace already exists (created by `create_workspace_from_url`),
already has a CRM, booking page, intake form, and AI chatbot. Today its
public surface is a chatbot-only preview page. The operator has asked
you to replace that with a full marketing landing.

## Mental model

SeldonFrame's pitch is **"ops stack first, marketing optional."** The
operator already has the ops stack live. A landing page is opt-in —
some clients have great existing sites and only need the chatbot+CRM
bolted on; others have outdated sites and want SF to render a new one.

When you build a landing page, the operator is in the second bucket.
Your job is to produce a page that's better than what their client
currently has — premium, niche-specific, archetype-correct.

## Process

### Step 1 — Understand the workspace

Call `get_workspace_state(workspace_id)` to load:
- The soul (business name, vertical, services, voice, certifications,
  reviews, emergency-service flag, same-day flag, business description)
- The classified `aesthetic_archetype` (one of 7: bold-urgency,
  clinical-trust, cinematic-aspirational, editorial-warm,
  technical-restrained, soft-residential, brutalist)
- The theme (palette, fonts) — already archetype-correct from v1.40
- Active integrations (so you don't reference an API the workspace
  doesn't have configured yet — e.g. don't promise SMS booking
  confirmations in copy if Twilio isn't connected)

If `aesthetic_archetype` is null (pre-v1.54 workspace), pick one
yourself from the vertical + business description, then proceed.

### Step 2 — Optionally consult external design skills

If the user has installed `claude-code/frontend-design/SKILL.md` (the
Anthropic frontend-design plugin), read it for Tailwind / Framer Motion
patterns and component composition guidance. It pairs with this skill:
frontend-design gives you the HOW (components, motion, layout); this
skill gives you the WHAT (which SF blocks, what order, what voice).

If `google-labs-code/design.md` is available, optionally invoke it for
design-language generation. It produces a design.md you can fold into
the block prompts as additional constraints.

### Step 3 — Decide the block sequence

Pick from available blocks. The default sequence for most service businesses:

1. `hero` — primary headline + CTA + supporting visual
2. `servicesGrid` — what they do (cards, pricing optional)
3. (optional) `projectGallery` — visual proof of work
4. (optional) `testimonials` — social proof
5. `faq` — top objections answered
6. (optional) `emergencyStrip` — only for bold-urgency archetypes
7. `cta` — closing call-to-action

#### Per-archetype adjustments

| archetype | adjustments |
|-----------|-------------|
| `bold-urgency` | add `emergencyStrip` after hero; skip `testimonials` if reviews < 50; add `stickyMobileCTA` for one-thumb booking |
| `clinical-trust` | add `benefits` block listing credentials; lengthen `faq` with insurance/financing questions; consider `process` block |
| `cinematic-aspirational` | lead with `projectGallery` immediately after hero; soften `faq` to "what to expect" tone |
| `editorial-warm` | longer `whoitsfor` / `process` blocks; more whitespace; skip emergencyStrip |
| `technical-restrained` | structured `features` block with bullet metrics; precise `pricing`; skip stickyMobileCTA |
| `soft-residential` | warm `benefits` block; visible `serviceArea` (zip codes covered); friendly `cta` |
| `brutalist` | minimal block count (hero + servicesGrid + cta); raw layouts, no soft easing |

### Step 4 — Generate and persist each block

For each block in the sequence:

a. Call `get_block_skill(block_name)` — returns the block's SKILL.md
   with its prop schema, voice rules, validators, and worked examples.

b. Generate props following the SKILL.md AND the archetype voice
   (`leanInto` / `avoid` lists from the archetype registry — accessed
   via the v1.54 `theme.aestheticArchetype` value).

c. Call `persist_block(workspace_id, block_name, prompt, props)` —
   v1.54's server enforcement WILL override your `template` and
   `variant` fields if they don't match the archetype's defaults. This
   is intentional — trust the server-side enforcement. Don't second-
   guess archetype defaults.

d. Note validator warnings in the response. If a validator flagged
   `headline_quantified`, `no_throat_clearing`, or similar, FIX YOUR
   PROPS AND CALL persist_block AGAIN. Don't ship past validators —
   they catch the patterns operators have explicitly told us look bad.

### Step 5 — Verify and report

After all blocks land:

a. Call `get_workspace_snapshot(workspace_id)` to confirm the landing
   page rendered (`landing_pages.sections` now has hero / services /
   etc instead of the original chatbot-preview).

b. Report the public URL back to the operator with a brief summary of
   what you placed and which archetype voice you used.

c. Offer concrete next steps:
   - "Want a different hero photo? Tell me what to search for."
   - "Want a softer voice? I can rerun in editorial-warm."
   - "Want to add a testimonials block? Share the testimonials."
   - "Want to publish the chatbot to LIVE now that the page exists? Just say so."

## Anti-patterns — DO NOT DO

- **Don't skip `get_workspace_state`.** You need the archetype, soul,
  and theme. Guessing wastes round-trips when the server overrides
  your picks anyway.
- **Don't write throat-clearing copy.** "Welcome to" / "Your trusted"
  / "Professional X services" are banned per every block's validator.
- **Don't propose templates outside the registry.** Templates are
  `cinematic-aura | viktor-light | velorah-editorial | nexora-light
  | securify-bold | stellar-tabs-white`. Picking anything else gets
  overridden server-side. Bold-urgency archetypes intentionally use
  empty template (the legacy variant renderer).
- **Don't generate Unsplash queries longer than 4 words.** Long
  queries zero-result. The server has archetype-curated fallbacks
  but those defeat your intent. Stick to 2-4 word queries.
- **Don't add features the workspace can't support.** If
  `integrations.twilio.configured` is false, don't promise SMS in
  copy. If Stripe isn't connected, don't say "pay deposit online."
- **Don't reorder blocks across persist calls.** Each `persist_block`
  call REPLACES that block type — order is determined at first persist.
  If you change your mind on order, call `update_landing_content` with
  the full new sequence.

## Worked example — bold-urgency (HVAC plumbing)

Operator: "build a landing page for ignitify in bold-urgency style"

1. `get_workspace_state(ws-1)` → archetype: bold-urgency, vertical: hvac,
   business_name: Ignitify Cooling, services: [AC Repair, AC Install,
   Furnace Repair, Maintenance], reviews: 13, emergency_service: true

2. Block sequence: hero → emergencyStrip → servicesGrid → faq → cta
   (skip testimonials since reviews < 50; add emergencyStrip per
   bold-urgency rule; add stickyMobileCTA)

3. `get_block_skill("hero")` → load voice rules (Hormozi-style,
   quantified, urgent), prop schema (headline / subhead / ctaPrimary /
   background_image_query / variant / template)

4. Generate hero props:
   ```json
   {
     "headline": "Same-Day AC & Furnace Repair Across El Paso",
     "subhead": "Ignitify Cooling — BBB-accredited, SuperPros 2024 Gold technicians who fix it right the first time. Honest pricing, financing available.",
     "ctaPrimary": { "label": "Get Service Today", "href": "/book" },
     "ctaSecondary": { "label": "Free Estimate", "href": "/intake" },
     "background_image_query": "hvac technician outdoor",
     "variant": "split-screen-50-50"
   }
   ```
   (Server will override variant to "split-screen-50-50" anyway since
   archetype is bold-urgency — your pick happens to match.)

5. `persist_block(ws-1, "hero", "...", props)` → returns ok + no
   warnings → continue to emergencyStrip

6. Repeat steps 3-5 for each subsequent block.

7. `get_workspace_snapshot(ws-1)` → confirm 5 sections rendered.

8. Report:
   > Landing page is live at https://ignitify-cooling.app.seldonframe.com.
   > Rendered in bold-urgency voice with 5 sections: hero, emergency strip,
   > services grid, FAQ, closing CTA. Hero uses split-screen-50-50 layout
   > with service-truck imagery. Want to tweak anything?

## Worked example — clinical-trust (dental practice)

Skip emergencyStrip. Lead with credentials in the hero subhead. Use
`nexora-light` template (archetype default). Lengthen FAQ with insurance
+ financing + "do you accept Medicare" type questions.

[Full prop JSON for each block omitted for brevity — follow the same
pattern as the bold-urgency example with the clinical-trust voice:
calm, authoritative, precise.]

## Worked example — cinematic-aspirational (medspa)

Lead with `projectGallery` immediately after hero. Hero uses
`cinematic-aura` template (archetype default) with a Pexels video
background. Soften FAQ to "what to expect" / "is it painful" tone.

[Full prop JSON for each block omitted for brevity — follow the same
pattern with the cinematic-aspirational voice: sensory, restorative,
intentional.]

## Integration notes

- **v1.54 archetype enforcement still fires.** Don't worry about
  picking the exact right template — the server overrides if you're
  off. Just match your COPY to the archetype voice.
- **Brain v2:** before generating, optionally call
  `list_brain_patterns(workspace_id)` to see what's worked for similar
  verticals. If brain patterns exist for "vertical=plumbing"
  (e.g., "service-truck hero photos performed best"), fold them into
  your block generation.
- **Validator gates are real.** If `persist_block` returns warnings,
  fix props and call again. Don't ship past validators.
```

- [ ] **Step 3: Commit**

```bash
git add skills/landing-page-creation/SKILL.md
git commit -m "feat(skills): add landing-page-creation SKILL.md for operator-prompted landing pages"
```

---

## Task 11: Run full test suite + typecheck verification

- [ ] **Step 1: Typecheck**

```bash
pnpm typecheck
```

Expected: clean. Pre-existing errors unrelated to this work are fine.

- [ ] **Step 2: Run the full unit test suite**

```bash
pnpm test:unit 2>&1 | tail -30
```

Expected:
- All 4 new spec files have all tests passing (chatbot-preview-section: 5; create-agent-status-input: 4; seed-chatbot-preview-landing: 6; finalize-summary-v1-55: 11)
- Pre-existing failures (workflow-event-log/category-server-actions, block-codegen-staleness, SLICE 9 archetype-isolation, theme integration) are the ONLY failures
- No NEW failures introduced

If anything else fails, investigate before proceeding.

- [ ] **Step 3: Confirm no uncommitted changes**

```bash
git status -s docs/superpowers/ packages/crm/src/ skills/ packages/crm/tests/unit/
```

Expected: clean. If anything is uncommitted in those paths, commit with a `chore: leftover from ops-stack-only` message.

- [ ] **Step 4: Verify the new file structure**

```bash
ls packages/crm/src/components/landing/sections/chatbot-preview.tsx
ls packages/crm/src/lib/workspace/seed-chatbot-preview-landing.ts
ls skills/landing-page-creation/SKILL.md
ls skills/mcp-server/src/finalize-summary.js
ls packages/crm/tests/unit/chatbot-preview-section.spec.tsx
ls packages/crm/tests/unit/create-agent-status-input.spec.ts
ls packages/crm/tests/unit/seed-chatbot-preview-landing.spec.ts
ls packages/crm/tests/unit/finalize-summary-v1-55.spec.ts
```

Expected: all 8 files exist.

---

## Task 12: Manual integration smoke test (after preview deploy)

This is run AFTER the PR is opened and Vercel auto-deploys a preview. Verifies the spec's behavioral contract end-to-end.

- [ ] **Step 1: Wait for Vercel preview to deploy**

After pushing the branch and opening a PR, Vercel auto-deploys. Note the preview URL.

- [ ] **Step 2: Create a workspace via the lean URL flow**

In a CC session pointed at the preview MCP, run:

```
mcp__seldonframe__create_workspace_from_url --url https://www.mrrooter.com/locations/austin
```

Watch the operator output. Expected:
- Completion message includes "(N seconds)" where N is under 60
- Chatbot embed snippet visible at the top of the summary
- "Demo for your client: …" URL visible
- 7-automation callout with all 7 names + descriptions + dashboard URL
- API-key helper note ("Need API keys… Twilio / Resend / Stripe")
- Tier line at the bottom
- Closing landing-page nudge naming the archetype (e.g. "bold-urgency style")

- [ ] **Step 3: Open the preview URL and verify ChatbotPreview renders**

Open the preview URL (e.g. `https://mr-rooter-austin.app.seldonframe.com`) in a browser. Expected:
- Page shows business name as h1
- Tagline below the h1
- Loading-state box for the chatbot
- Chatbot widget loads (via embed.js)
- "Want this on your site?" snippet block visible at the bottom
- Page styling uses the workspace's theme palette

- [ ] **Step 4: Verify the chatbot responds**

Open the chatbot widget on the preview page. Send a test message like "what services do you offer?". Expected: chatbot responds (because it's in TEST status, not DRAFT).

If it doesn't respond, check the chatbot's status via:

```
mcp__seldonframe__get_agent_metrics --workspace_id <id>
```

Expected: `status: "test"` in the response.

- [ ] **Step 5: Test the landing-page-creation SKILL.md flow**

In the same CC session, run:

```
build a landing page for Mr. Rooter Austin in bold-urgency style
```

Expected: Claude reads the new SKILL.md, calls `get_workspace_state`, then loops `get_block_skill` + `persist_block` for hero → emergencyStrip → servicesGrid → faq → cta. The preview URL transitions from chatbot-only to full landing page.

- [ ] **Step 6: Verify backward compat — existing workspace still renders**

Open the public URL of a workspace created BEFORE this PR (pre-v1.55). Expected: its existing landing page still renders normally (it has hero / services / etc sections, not chatbot-preview).

- [ ] **Step 7: Check Vercel logs for the new events**

In Vercel dashboard → Logs → filter by these event names:
- `landing_page_skipped_default` — every new workspace creation (100%)
- `chatbot_preview_seeded` — every new workspace creation (100%)
- `chatbot_auto_created_as_test` (or via existing `v2_auto_chatbot_*` events showing status: test) — every new workspace creation

- [ ] **Step 8: Confirm creation duration dropped to <60s**

Filter Vercel logs by `v2_workspace_create_succeeded`. The `duration_ms` field should be well under 60000 (60s) — typically ~30000-40000 (30-40s).

---

## Definition of Done

- [ ] All 4 new spec files have all tests passing locally (`pnpm test:unit`)
- [ ] `pnpm typecheck` is clean (modulo pre-existing unrelated errors)
- [ ] Branch pushed; PR opened with reference to spec `513e94a1`
- [ ] Preview smoke test (Task 12) confirms 30-second creation + chatbot-preview renders + chatbot responds + landing-page-creation SKILL.md works
- [ ] Backward compat verified — pre-v1.55 workspaces still render their landing pages
- [ ] PR merged to main; Vercel auto-deploys to production
- [ ] 24h production log audit shows expected event distribution + duration_ms drops to ~30s
- [ ] MCP version 1.55.0 published to npm (after PR merges)
- [ ] No regressions in existing test suite
