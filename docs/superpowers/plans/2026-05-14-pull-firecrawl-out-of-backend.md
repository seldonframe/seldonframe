# Pull Firecrawl out of the SeldonFrame backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move URL→business-facts extraction from the backend (Firecrawl on a Hetzner VPS) to the Claude Code client (WebFetch + extraction reasoning), eliminate the Firecrawl dependency, and ship MCP `@seldonframe/mcp@1.52.0`.

**Architecture:** New backend endpoint `GET /api/v1/workspace/extract-instructions` returns a static "playbook" (prose instructions + JSON schema) that the repurposed `create_workspace_from_url` MCP tool passes through to Claude. Claude does the WebFetch + extraction + operator dialog itself, then calls existing `create_workspace_v2` with structured facts. Firecrawl code is deleted. Hetzner VPS is decommissioned after a 24h soak.

**Tech Stack:** Next.js 16.2 (App Router), TypeScript, Node.js, MCP SDK (`@modelcontextprotocol/sdk`), Vercel (hosting), `tsx` (smoke scripts). No Vitest/Jest in this codebase — tests are smoke scripts + curl + manual MCP verification per the existing pattern.

**Source spec:** [`docs/superpowers/specs/2026-05-14-pull-firecrawl-out-of-backend-design.md`](../specs/2026-05-14-pull-firecrawl-out-of-backend-design.md) (commit 28bd1821 on main).

---

## File map

**Create:**
- `packages/crm/src/lib/soul-compiler/url-extraction-instructions.ts` — `EXTRACTION_INSTRUCTIONS` const + `REQUIRED_FIELDS_SCHEMA` const
- `packages/crm/src/app/api/v1/workspace/extract-instructions/route.ts` — `GET` handler that returns the playbook
- `packages/crm/src/testing/extract-instructions-smoke.ts` — smoke script that hits the new endpoint locally + asserts shape

**Modify:**
- `packages/crm/src/lib/soul-compiler/service.ts` — drop URL branch + `scrape_failed` code
- `packages/crm/src/app/api/v1/workspace/create/route.ts` — return 410 `url_flow_moved` when body has `url`; drop `scrape_failed` mapping
- `skills/mcp-server/src/tools.js` — repurpose `create_workspace_from_url` handler + description; drop `confirmed_no_url_available` from `create_workspace_v2` and `create_full_workspace`; rewrite their descriptions
- `skills/mcp-server/package.json` — `1.51.0` → `1.52.0`

**Delete:**
- `packages/crm/src/lib/soul-compiler/firecrawl.ts`

**Operational (no file changes):**
- Remove Vercel env vars `FIRECRAWL_BASE_URL` and `FIRECRAWL_API_KEY` from production, preview, development
- Remove DNS A record `firecrawl.seldonframe.com` (rec_id `rec_112069646bd3b0800163e611`)
- Snapshot + decommission Hetzner VPS `ubuntu-8gb-ash-1` (87.99.152.152)

---

## Phase A — Backend: new endpoint (TDD via smoke script)

### Task 1: Create the `url-extraction-instructions` module

**Files:**
- Create: `packages/crm/src/lib/soul-compiler/url-extraction-instructions.ts`

- [ ] **Step 1: Create the file with the constants**

```typescript
// packages/crm/src/lib/soul-compiler/url-extraction-instructions.ts
//
// 2026-05-14 — Verbatim "playbook" returned by GET /api/v1/workspace/extract-instructions.
// The MCP tool `create_workspace_from_url` proxies this payload through to Claude in CC.
// Claude reads the instructions, runs WebFetch itself, extracts the structured fields
// matching REQUIRED_FIELDS_SCHEMA, dialogues with the operator for any missing required
// field, then calls create_workspace_v2. See spec
// docs/superpowers/specs/2026-05-14-pull-firecrawl-out-of-backend-design.md.

export const EXTRACTION_INSTRUCTIONS = `You are extracting business facts from a website to create a SeldonFrame workspace.

URL: {url_echo}

Step 1 — Fetch homepage.
  Use the WebFetch tool to read {url_echo}. Look for: business name, services
  offered, phone, city/state, business description, hours, emergency/same-day,
  certifications, service area.

Step 2 — Decide if sub-pages are needed.
  If the homepage has all the REQUIRED fields below, skip to Step 3.
  Otherwise, fetch up to 2 of these in this priority order (only if they exist
  as links on the homepage): /about, /services, /contact, /pricing.
  HARD LIMIT: 3 total WebFetch calls. Stop fetching after that even if
  fields are still missing.

Step 3 — Reason and extract.
  Produce a JSON object matching the schema below. Use confident extractions
  only; do not invent. If a REQUIRED field can't be determined from what you
  fetched, leave it as null.

Step 4 — Fill the gaps with operator dialog.
  For every REQUIRED field that's still null, ask the operator ONE targeted
  question per missing field, in the simplest form. Examples:
    - "What's the business phone number?"
    - "What city is the business based in?"
  Don't ask for fields you already extracted with high confidence.

Step 5 — Create the workspace.
  Once every REQUIRED field is non-null, call create_workspace_v2 with the
  full object. Then follow the v2 flow: for each block in
  v2.recommended_blocks, call get_block_skill(name), generate props, call
  persist_block. Then call complete_workspace_v2, then finalize_workspace.

Failure modes:
  - WebFetch returns empty/error: try the next priority page. If all 3 fetches
    fail or return empty, tell the operator "I can't read the site — can you
    paste a description of the business?" and route to description-based flow.
  - WebFetch returns a Cloudflare/anti-bot challenge page (signs: "Just a
    moment...", "Verifying you are human", < 500 chars of meaningful content):
    same as empty — fall back to the operator-description dialog.
  - JS-only SPA (HTML shell with no content): same — fall back to dialog.

Do NOT:
  - Pre-validate URLs (no HEAD requests, no probes — just WebFetch).
  - Fetch more than 3 pages.
  - Fabricate any field. If unsure, ask.
  - Call create_full_workspace from this flow. Always use create_workspace_v2.
`;

export const REQUIRED_FIELDS_SCHEMA = {
  type: "object",
  required: [
    "business_name",
    "city",
    "state",
    "phone",
    "services",
    "business_description",
  ],
  properties: {
    business_name: { type: "string", minLength: 1 },
    city: { type: "string", minLength: 1 },
    state: {
      type: "string",
      minLength: 1,
      description: "2-letter or full name",
    },
    phone: { type: "string", minLength: 1 },
    services: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
    },
    business_description: { type: "string", minLength: 1 },
    review_count: { type: ["number", "null"] },
    review_rating: { type: ["number", "null"] },
    certifications: { type: ["array", "null"], items: { type: "string" } },
    trust_signals: { type: ["array", "null"], items: { type: "string" } },
    emergency_service: { type: ["boolean", "null"] },
    same_day: { type: ["boolean", "null"] },
    service_area: { type: ["array", "null"], items: { type: "string" } },
    email: { type: ["string", "null"] },
    address: { type: ["string", "null"] },
    weekly_hours: { type: ["object", "null"] },
    testimonials: { type: ["array", "null"] },
  },
} as const;

export type RequiredFieldsSchema = typeof REQUIRED_FIELDS_SCHEMA;
```

- [ ] **Step 2: TypeScript compile check**

Run: `cd packages/crm && npx tsc --noEmit src/lib/soul-compiler/url-extraction-instructions.ts`
Expected: no errors. (The file has no imports so should compile in isolation.)

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/lib/soul-compiler/url-extraction-instructions.ts
git commit -m "feat(soul-compiler): add url-extraction-instructions playbook module

Verbatim instructions + JSON schema returned by the new
GET /api/v1/workspace/extract-instructions endpoint. Replaces
Firecrawl-based URL handling; CC client does WebFetch + extraction.

Refs: docs/superpowers/specs/2026-05-14-pull-firecrawl-out-of-backend-design.md"
```

---

### Task 2: Create the `GET /api/v1/workspace/extract-instructions` route

**Files:**
- Create: `packages/crm/src/app/api/v1/workspace/extract-instructions/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
// packages/crm/src/app/api/v1/workspace/extract-instructions/route.ts
//
// 2026-05-14 — Pure-data endpoint that returns a "playbook" for URL-based
// workspace creation. No fetching, no LLM, no auth. The MCP tool
// `create_workspace_from_url` proxies this response to Claude in CC. Claude
// then runs WebFetch + extraction itself per the instructions.
//
// Spec: docs/superpowers/specs/2026-05-14-pull-firecrawl-out-of-backend-design.md

import { NextResponse } from "next/server";
import {
  EXTRACTION_INSTRUCTIONS,
  REQUIRED_FIELDS_SCHEMA,
} from "@/lib/soul-compiler/url-extraction-instructions";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) {
    return NextResponse.json(
      { error: "missing ?url param" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    status: "instructions",
    url_echo: url,
    instructions: EXTRACTION_INSTRUCTIONS.replace("{url_echo}", url).replace(
      "{url_echo}",
      url
    ),
    required_fields_schema: REQUIRED_FIELDS_SCHEMA,
    next_tool: "create_workspace_v2",
  });
}
```

Note: `.replace("{url_echo}", url)` is called twice because the placeholder appears twice in the template (Step 1 + the "URL: {url_echo}" header). Using two `.replace` calls instead of a global regex keeps the substitution exact-match (no escape concerns if a URL ever contained `$` or `&`).

- [ ] **Step 2: TypeScript compile check**

Run: `cd packages/crm && npx tsc --noEmit`
Expected: no errors for this file. (Other errors unrelated to this file may exist in the worktree if node_modules isn't fully installed — ignore those.)

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/app/api/v1/workspace/extract-instructions/route.ts
git commit -m "feat(api): add GET /v1/workspace/extract-instructions endpoint

Returns the URL-handling playbook (prose + JSON schema) that the
MCP create_workspace_from_url tool proxies to Claude in CC. No
fetching, no LLM, no auth required.

Refs: docs/superpowers/specs/2026-05-14-pull-firecrawl-out-of-backend-design.md"
```

---

### Task 3: Smoke-test the new endpoint locally

**Files:**
- Create: `packages/crm/src/testing/extract-instructions-smoke.ts`

- [ ] **Step 1: Create the smoke script**

```typescript
// packages/crm/src/testing/extract-instructions-smoke.ts
//
// Smoke test for GET /api/v1/workspace/extract-instructions.
// Run with `tsx src/testing/extract-instructions-smoke.ts` while the dev
// server is running on http://localhost:3000.

const BASE = process.env.SMOKE_BASE_URL?.trim() || "http://localhost:3000";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

async function main() {
  // Case 1: missing ?url → 400
  const noUrlRes = await fetch(`${BASE}/api/v1/workspace/extract-instructions`);
  assert(noUrlRes.status === 400, `expected 400 for missing url, got ${noUrlRes.status}`);
  console.log("ok: 400 when ?url missing");

  // Case 2: with ?url → 200 with playbook shape
  const url = "https://quigleyac.com";
  const res = await fetch(
    `${BASE}/api/v1/workspace/extract-instructions?url=${encodeURIComponent(url)}`
  );
  assert(res.status === 200, `expected 200, got ${res.status}`);
  const body = (await res.json()) as {
    status?: string;
    url_echo?: string;
    instructions?: string;
    required_fields_schema?: { required?: string[] };
    next_tool?: string;
  };
  assert(body.status === "instructions", `unexpected status: ${body.status}`);
  assert(body.url_echo === url, `url_echo mismatch: ${body.url_echo}`);
  assert(typeof body.instructions === "string", "instructions not a string");
  assert(
    body.instructions!.includes("WebFetch"),
    "instructions does not mention WebFetch"
  );
  assert(
    body.instructions!.includes(url),
    "instructions did not substitute {url_echo}"
  );
  assert(body.next_tool === "create_workspace_v2", `next_tool: ${body.next_tool}`);
  const required = body.required_fields_schema?.required ?? [];
  for (const field of [
    "business_name",
    "city",
    "state",
    "phone",
    "services",
    "business_description",
  ]) {
    assert(required.includes(field), `required_fields_schema missing ${field}`);
  }
  console.log("ok: 200 with correct playbook shape");

  // Case 3: same URL twice → identical instructions (deterministic)
  const url2 = "https://example.com";
  const res2 = await fetch(
    `${BASE}/api/v1/workspace/extract-instructions?url=${encodeURIComponent(url2)}`
  );
  const body2 = (await res2.json()) as { instructions?: string };
  // The instructions differ in the {url_echo} substitution, but the rest must match.
  const stripUrl = (s: string) => s.replace(url, "<URL>").replace(url2, "<URL>");
  assert(
    stripUrl(body.instructions!) === stripUrl(body2.instructions!),
    "instructions vary beyond URL substitution"
  );
  console.log("ok: instructions deterministic modulo URL substitution");

  console.log("\nAll smoke checks passed.");
}

main().catch((err) => {
  console.error("smoke script error:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the smoke script — should FAIL first (endpoint not yet deployed if dev server is fresh)**

Run (in terminal 1): `cd packages/crm && npm run dev`
Run (in terminal 2): `cd packages/crm && npx tsx src/testing/extract-instructions-smoke.ts`

Expected on a cold dev server before Task 2 was deployed: connection-refused or 404. After Task 2: all three "ok:" lines and "All smoke checks passed."

If the dev server is already running and Task 2 is built, this should pass immediately.

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/testing/extract-instructions-smoke.ts
git commit -m "test(soul-compiler): smoke test for /extract-instructions endpoint

Validates 400-on-missing-url, 200-with-shape, and instructions
determinism. Matches the existing cross-block-smoke pattern (no
Vitest in this package).

Refs: docs/superpowers/specs/2026-05-14-pull-firecrawl-out-of-backend-design.md"
```

---

## Phase B — Backend: deletions + 410 hardening

### Task 4: Simplify `compileSoulService` (remove URL branch + `scrape_failed`)

**Files:**
- Modify: `packages/crm/src/lib/soul-compiler/service.ts`

- [ ] **Step 1: Read the current `service.ts` to confirm the exact lines to change**

Run: `Read packages/crm/src/lib/soul-compiler/service.ts` (use the editor's Read tool or `cat`)

Confirm the current shape matches what's expected: import of `compileWebsiteToMarkdown` on line 1, URL branch around lines 47–70, `scrape_failed` in the type union and 2 return paths.

- [ ] **Step 2: Replace the file with the simplified version**

```typescript
// packages/crm/src/lib/soul-compiler/service.ts
//
// 2026-05-14 — URL branch removed (moved to CC client via the new
// /extract-instructions endpoint + repurposed create_workspace_from_url
// MCP tool). compileSoulService now only handles description input.
// scrape_failed error code removed (no scraping possible).
//
// Spec: docs/superpowers/specs/2026-05-14-pull-firecrawl-out-of-backend-design.md

import { compileSoulWithTwoCallPattern, createByokAnthropicClient } from "./anthropic";
import { type RoutingResult, type SoulV4 } from "./schema";

export type SoulCompileServiceResult =
  | {
      status: "ready";
      routing: RoutingResult;
      soul: SoulV4;
      attempts: number;
      sourceText: string;
      pagesUsed: string[];
    }
  | {
      status: "split_required";
      routing: RoutingResult;
      message: string;
      suggestedFirstWorkspace: {
        business_name: string;
        audience_type: string;
      };
    }
  | {
      status: "error";
      code: "invalid_input" | "compile_failed";
      message: string;
    };

export async function compileSoulService(params: {
  input: string;
  claudeApiKey: string;
  model?: string;
}): Promise<SoulCompileServiceResult> {
  const { input, claudeApiKey, model } = params;

  if (!input.trim()) {
    return {
      status: "error",
      code: "invalid_input",
      message: "Input (description) is required",
    };
  }

  // URL inputs are no longer accepted on this service. They're routed at
  // the MCP-tool layer (create_workspace_from_url → extract-instructions →
  // Claude WebFetch → create_workspace_v2). Reject explicitly so older
  // callers get a clear error rather than a soul compiled from a URL string.
  if (input.startsWith("http://") || input.startsWith("https://")) {
    return {
      status: "error",
      code: "invalid_input",
      message:
        "URL inputs are no longer supported by compileSoulService. The URL flow moved to the MCP client; this service compiles description text only.",
    };
  }

  const sourceText = input.trim();

  try {
    const client = createByokAnthropicClient(claudeApiKey);

    const result = await compileSoulWithTwoCallPattern({
      inputTextOrScrapedContent: sourceText,
      client,
      model,
    });

    if (result.routing.split_recommendation) {
      return {
        status: "split_required",
        routing: result.routing,
        message:
          "Your business appears to have both service and product elements. Which one would you like to start with first?",
        suggestedFirstWorkspace: {
          business_name: result.routing.business_name,
          audience_type: result.routing.audience_type,
        },
      };
    }

    return {
      status: "ready",
      routing: result.routing,
      soul: result.soul,
      attempts: result.attempts,
      sourceText,
      pagesUsed: [],
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to compile soul. Please try again or simplify the description.";

    return {
      status: "error",
      code: "compile_failed",
      message,
    };
  }
}
```

- [ ] **Step 3: Verify no lingering references to scrape_failed or compileWebsiteToMarkdown in this file**

Run: `grep -n 'scrape_failed\|compileWebsiteToMarkdown' packages/crm/src/lib/soul-compiler/service.ts`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add packages/crm/src/lib/soul-compiler/service.ts
git commit -m "refactor(soul-compiler): drop URL branch + scrape_failed from compileSoulService

URL handling moved to CC client. Service now compiles description
text only. URL-shaped inputs return invalid_input with a clear
message pointing to the new flow.

Refs: docs/superpowers/specs/2026-05-14-pull-firecrawl-out-of-backend-design.md"
```

---

### Task 5: Return 410 from `/v1/workspace/create` for legacy URL bodies

**Files:**
- Modify: `packages/crm/src/app/api/v1/workspace/create/route.ts`

- [ ] **Step 1: Locate the body-parsing block to insert the 410 check**

Run: `grep -n "body\.url\|body\.description\|scrape_failed" packages/crm/src/app/api/v1/workspace/create/route.ts`
Expected output (line numbers approximate): `104: const url = ...`, `105: const description = ...`, `132: : compileResult.code === "scrape_failed"`

- [ ] **Step 2: Add the 410 early-return immediately after body parsing**

Find the block (around lines 103–114):

```typescript
  const body = (await request.json().catch(() => ({}))) as WorkspaceCreateBody;
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const model = typeof body.model === "string" ? body.model.trim() : undefined;

  if (!url && !description) {
    return NextResponse.json({ error: "Provide either url or description." }, { status: 400 });
  }

  if (url && description) {
    return NextResponse.json({ error: "Provide either url or description, not both." }, { status: 400 });
  }
```

Replace with:

```typescript
  const body = (await request.json().catch(() => ({}))) as WorkspaceCreateBody;
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const model = typeof body.model === "string" ? body.model.trim() : undefined;

  // 2026-05-14 — URL-based workspace creation moved to the MCP client.
  // Legacy clients (MCP < 1.52) that POST a `url` body get an explicit
  // upgrade message instead of silently degrading.
  if (url) {
    logWorkspaceCompile("workspace_compile_url_flow_moved", {
      userId,
      status: 410,
    });
    return NextResponse.json(
      {
        status: "error",
        code: "url_flow_moved",
        message:
          "URL-based workspace creation has moved to the MCP client. Upgrade to @seldonframe/mcp v1.52+ (npx -y @seldonframe/mcp@latest) and retry.",
      },
      { status: 410 }
    );
  }

  if (!description) {
    return NextResponse.json(
      { error: "Provide a description." },
      { status: 400 }
    );
  }
```

- [ ] **Step 3: Remove the `scrape_failed` mapping further down in the same file**

Find the block (around lines 128–135):

```typescript
      status:
        compileResult.code === "invalid_input"
          ? 400
          : compileResult.code === "scrape_failed"
            ? 422
            : 500,
```

Replace with:

```typescript
      status: compileResult.code === "invalid_input" ? 400 : 500,
```

- [ ] **Step 4: Verify no lingering `url`-handling references**

Run: `grep -n "compileSoulService.*url\|body\.url\|scrape_failed" packages/crm/src/app/api/v1/workspace/create/route.ts`
Expected: only the lines you intentionally kept (the body.url type check + the 410 branch). No `compileSoulService(url)` or `scrape_failed`.

- [ ] **Step 5: TypeScript compile check**

Run: `cd packages/crm && npx tsc --noEmit src/app/api/v1/workspace/create/route.ts`
Expected: no errors specific to this file.

- [ ] **Step 6: Commit**

```bash
git add packages/crm/src/app/api/v1/workspace/create/route.ts
git commit -m "feat(api): 410 url_flow_moved on /v1/workspace/create with url body

Legacy MCP clients (< 1.52) that POST a url field now get an
explicit upgrade message. Description-body path unchanged.
scrape_failed → 422 mapping removed (compileSoulService no longer
returns that code).

Refs: docs/superpowers/specs/2026-05-14-pull-firecrawl-out-of-backend-design.md"
```

---

### Task 6: Delete `firecrawl.ts`

**Files:**
- Delete: `packages/crm/src/lib/soul-compiler/firecrawl.ts`

- [ ] **Step 1: Confirm no remaining imports**

Run: `grep -rn 'from.*soul-compiler/firecrawl\|compileWebsiteToMarkdown\|soulCompilerFallbackErrorMessage' packages/crm/src/`
Expected: no matches. (`scrapeUrlListToMap` from the dea33f87 commit should also have no callers — verify by name.)

If matches exist, fix those call sites first before deleting the file.

- [ ] **Step 2: Delete the file**

```bash
rm packages/crm/src/lib/soul-compiler/firecrawl.ts
```

- [ ] **Step 3: TypeScript compile check**

Run: `cd packages/crm && npx tsc --noEmit`
Expected: no errors related to missing `firecrawl` import. (Pre-existing missing-module noise from the worktree's missing node_modules is OK; filter for `firecrawl` specifically.)

Run: `cd packages/crm && npx tsc --noEmit 2>&1 | grep -i firecrawl`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add -A packages/crm/src/lib/soul-compiler/
git commit -m "chore(soul-compiler): delete firecrawl.ts (URL flow moved to CC client)

No remaining callers. Backend has zero URL-fetching code paths now.

Refs: docs/superpowers/specs/2026-05-14-pull-firecrawl-out-of-backend-design.md"
```

---

## Phase C — MCP server changes

### Task 7: Repurpose `create_workspace_from_url` handler in `tools.js`

**Files:**
- Modify: `skills/mcp-server/src/tools.js`

- [ ] **Step 1: Locate the current `create_workspace_from_url` definition (around line 490)**

Run: `grep -n 'name: "create_workspace_from_url"' skills/mcp-server/src/tools.js`

- [ ] **Step 2: Read the surrounding 80 lines to capture the exact current shape**

Read lines around the matched line to see the description, input_schema, and handler. The current handler POSTs to `/api/v1/workspace/create`. You will replace this entire tool definition with the new one below.

- [ ] **Step 3: Replace the tool definition**

Replace the entire `create_workspace_from_url` object (from `name: "create_workspace_from_url"` to the closing `}` of that tool, immediately before the next tool definition) with:

```javascript
  {
    name: "create_workspace_from_url",
    description:
      "Entry point for URL-based workspace creation. Returns instructions Claude follows: WebFetch the URL, optionally WebFetch up to 2 priority sub-pages, extract structured business facts, ask the operator for any required field that can't be determined, then call `create_workspace_v2`. THIS TOOL DOES NOT CREATE A WORKSPACE — it returns the playbook. The actual workspace is created by the follow-up `create_workspace_v2` call (and then persist_block per block + complete_workspace_v2 + finalize_workspace).",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description:
            "The business website URL the operator provided (e.g. https://quigleyac.com).",
        },
      },
      required: ["url"],
    },
    handler: async ({ url }, { client }) => {
      const res = await client.get(
        `/api/v1/workspace/extract-instructions?url=${encodeURIComponent(url)}`
      );
      return res;
    },
  },
```

Notes:
- `client.get(path)` must already exist in `skills/mcp-server/src/client.js` for this handler to work. Check that file before this task — if there's no `get` method, add a small one that does a GET (no auth needed for this endpoint). Most MCP-server `client.js` files have both `get` and `post`; verify before assuming.
- The handler does NOT take a bearer/auth header — the new endpoint is unauthenticated by design.

- [ ] **Step 4: If `client.get` doesn't exist, add it**

Run: `grep -n 'get\|post' skills/mcp-server/src/client.js | head -20`

If only `post` is defined, add a `get` method modeled on the existing `post`:

```javascript
  async get(path) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`GET ${path} failed with ${res.status}: ${await res.text()}`);
    }
    return await res.json();
  },
```

(Place inside the client object alongside the existing `post` method. Match indentation + style of the existing file.)

- [ ] **Step 5: Syntax check**

Run: `cd skills/mcp-server && npm run check:syntax`
Expected: passes silently.

- [ ] **Step 6: Commit**

```bash
git add skills/mcp-server/src/tools.js skills/mcp-server/src/client.js
git commit -m "feat(mcp): repurpose create_workspace_from_url to return playbook

Handler now GETs /v1/workspace/extract-instructions and proxies the
prose+schema response to Claude. The tool no longer creates a
workspace; it returns instructions Claude follows (WebFetch + extract
+ dialog + create_workspace_v2).

Refs: docs/superpowers/specs/2026-05-14-pull-firecrawl-out-of-backend-design.md"
```

---

### Task 8: Drop `confirmed_no_url_available` guard from `create_workspace_v2` and `create_full_workspace`

**Files:**
- Modify: `skills/mcp-server/src/tools.js`

- [ ] **Step 1: Locate `create_workspace_v2` (around line 3019)**

Run: `grep -n 'name: "create_workspace_v2"\|name: "create_full_workspace"' skills/mcp-server/src/tools.js`

- [ ] **Step 2: In the `create_workspace_v2` definition, remove `confirmed_no_url_available`**

Within the tool's `inputSchema.properties`, find:

```javascript
confirmed_no_url_available: {
  type: "boolean",
  description:
    "MUST be `true`. Set to true ONLY if the operator did NOT provide a website URL. If a URL IS available, use `create_workspace_from_url` instead — do NOT lie here.",
},
```

Delete that entire property entry.

Within the same tool's `inputSchema.required` array, remove the string `"confirmed_no_url_available"`. The array should still contain `business_name`, `city`, `state`, `phone`, `services`, `business_description`.

- [ ] **Step 3: Rewrite the `create_workspace_v2` description**

Replace the current description (which begins "⛔ DO NOT USE WHEN A URL IS PROVIDED…") with:

```
"Create a workspace from pre-extracted business facts. Used as the follow-up call after `create_workspace_from_url` returns extraction instructions, OR directly when the operator provides structured info (no URL). Flow: 1) call this with the business facts; 2) for each block in v2.recommended_blocks, call get_block_skill + persist_block; 3) call complete_workspace_v2; 4) call finalize_workspace. MANDATORY FOLLOW-UP: After this returns `status: 'ready'` AND after all blocks land via persist_block + complete_workspace_v2, ask the operator 'What email should I use for your account?' Then call finalize_workspace({ workspace_id, email })."
```

- [ ] **Step 4: Repeat Step 2 for `create_full_workspace`**

Find the `create_full_workspace` tool definition (around line 61). Within its `inputSchema.properties`, delete the `confirmed_no_url_available` entry. Within its `inputSchema.required` array, remove `"confirmed_no_url_available"`.

- [ ] **Step 5: Rewrite the `create_full_workspace` description**

Replace the current description (which begins "⛔ DO NOT USE WHEN A URL IS PROVIDED…") with:

```
"Atomic workspace creation from pre-extracted business facts. Equivalent to create_workspace_v2 but single-call (no block-by-block iteration). Used as the follow-up after `create_workspace_from_url` for cases where the operator wants the workspace produced in one shot rather than block-iterated. Example: create_full_workspace({ business_name: 'Summit Air Comfort', city: 'Phoenix', state: 'AZ', phone: '(480) 555-2100', services: ['AC repair', 'heating installation', 'duct cleaning'], business_description: 'Residential and commercial HVAC in Phoenix', review_count: 950, review_rating: 4.7, trust_signals: ['licensed', 'bonded', 'insured'], emergency_service: true, same_day: true, service_area: ['Scottsdale', 'Tempe', 'Mesa'] }). MANDATORY FOLLOW-UP: same as create_workspace_v2 — after this returns `status: 'ready'`, ask 'What email should I use for your account?' and call finalize_workspace({ workspace_id, email })."
```

- [ ] **Step 6: Also update `create_workspace_from_google_paste` description (around line 232)**

If its description references the `confirmed_no_url_available` guard or the "⛔ DO NOT USE WHEN A URL IS PROVIDED" pattern from `create_full_workspace`, rewrite to drop that language. The Google-paste tool's semantics don't change (it remains for paste workflows), but its description should not reference a guard that no longer exists.

Run: `grep -n 'confirmed_no_url_available\|DO NOT USE WHEN A URL' skills/mcp-server/src/tools.js`
Expected after this step: no matches.

- [ ] **Step 7: Syntax check**

Run: `cd skills/mcp-server && npm run check:syntax`
Expected: passes silently.

- [ ] **Step 8: Commit**

```bash
git add skills/mcp-server/src/tools.js
git commit -m "refactor(mcp): drop confirmed_no_url_available guard from v2 + full tools

The guard existed only to force-route URL inputs through
create_workspace_from_url. Under the new flow, URL inputs go through
create_workspace_from_url → (Claude WebFetches + extracts + dialogs) →
create_workspace_v2. The guard is no longer meaningful. Descriptions
rewritten to drop 'DO NOT USE WHEN A URL IS PROVIDED' warnings.

Refs: docs/superpowers/specs/2026-05-14-pull-firecrawl-out-of-backend-design.md"
```

---

### Task 9: Bump MCP server version to 1.52.0

**Files:**
- Modify: `skills/mcp-server/package.json`

- [ ] **Step 1: Update the version**

Edit `skills/mcp-server/package.json`: change `"version": "1.51.0"` to `"version": "1.52.0"`.

- [ ] **Step 2: Verify syntax**

Run: `cd skills/mcp-server && npm run check:syntax`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add skills/mcp-server/package.json
git commit -m "chore(mcp): bump version to 1.52.0

v1.52.0 — URL-based workspace creation now runs in the Claude Code
client via WebFetch, not via backend scraper. No action needed for
callers; create_workspace_from_url signature unchanged.

Refs: docs/superpowers/specs/2026-05-14-pull-firecrawl-out-of-backend-design.md"
```

---

## Phase D — Deploy + verify

### Task 10: Push backend + MCP changes to main; let Vercel rebuild

**Files:**
- None (operational)

- [ ] **Step 1: Confirm git log shows the Phase A/B/C commits**

Run: `git log --oneline -15`
Expected: see the commits from tasks 1–9 ahead of `origin/main`.

- [ ] **Step 2: Push to main**

Run: `git push origin main`
Expected: push succeeds, refs advance.

- [ ] **Step 3: Wait for Vercel deploy, then confirm Ready**

Run: `sleep 180 && vercel ls --prod --token "$VERCEL_TOKEN" --cwd packages/crm | head -5`
Expected: the newest deployment shows `● Ready`.

If `--token` is needed, use the same Vercel personal access token already provisioned for this work (rotate after decommission per Task 18).

---

### Task 11: Smoke-test the new endpoint against production

**Files:**
- None (operational)

- [ ] **Step 1: Hit the production extract-instructions endpoint**

Run:

```bash
curl -sS -w "\nHTTP %{http_code}\n" \
  "https://app.seldonframe.com/api/v1/workspace/extract-instructions?url=https%3A%2F%2Fquigleyac.com" \
  | head -50
```

Expected:
- HTTP 200
- JSON body with `status: "instructions"`, `url_echo: "https://quigleyac.com"`, `instructions` containing the substituted URL + the word "WebFetch", `required_fields_schema` with 6 required fields, `next_tool: "create_workspace_v2"`.

- [ ] **Step 2: Confirm 400 on missing `?url`**

Run:

```bash
curl -sS -w "\nHTTP %{http_code}\n" \
  "https://app.seldonframe.com/api/v1/workspace/extract-instructions"
```

Expected: HTTP 400, `{ "error": "missing ?url param" }`.

- [ ] **Step 3: Confirm 410 on legacy URL body**

Run:

```bash
curl -sS -X POST "https://app.seldonframe.com/api/v1/workspace/create" \
  -H "Content-Type: application/json" \
  -H "x-byok-claude-key: sk-ant-test-not-real" \
  -d '{"url":"https://example.com"}' \
  -w "\nHTTP %{http_code}\n"
```

Expected: HTTP 410 OR HTTP 401 (if auth-check runs first). If 401, that's OK — auth gates the route before the body check; legacy clients with real auth will reach the 410 branch.

To verify the 410 path is reachable with real auth, you can either rely on Task 13's E2E smoke (which uses a real CC session) or temporarily test from an authenticated context.

---

### Task 12: Publish `@seldonframe/mcp@1.52.0` to npm + MCP Registry

**Files:**
- None (operational, executes the version bumped in Task 9)

- [ ] **Step 1: Verify package.json is at 1.52.0**

Run: `cat skills/mcp-server/package.json | grep '"version"'`
Expected: `"version": "1.52.0",`

- [ ] **Step 2: Run prepublish check**

Run: `cd skills/mcp-server && npm run check:syntax`
Expected: passes.

- [ ] **Step 3: Publish to npm**

Run: `cd skills/mcp-server && npm publish --access public`
Expected: `+ @seldonframe/mcp@1.52.0` line in output.

- [ ] **Step 4: Verify on npm registry**

Run: `npm view @seldonframe/mcp@1.52.0 version`
Expected: `1.52.0`.

- [ ] **Step 5: Publish to MCP Registry (if mcp-publisher is configured)**

Run: `cd skills/mcp-server && mcp-publisher publish` (or whatever the canonical command is for this repo; check prior versions' publish workflow).

If unsure of the exact command, refer to the prior version's publish steps (the v1.51.0 publish was done earlier on 2026-05-14 per chat history).

---

### Task 13: Run the E2E smoke matrix in a fresh Claude Code session

**Files:**
- None (operational, manual)

- [ ] **Step 1: Install/upgrade the MCP locally**

In a fresh terminal:

```bash
npm install -g @seldonframe/mcp@1.52.0
# Or: clear global install + use npx
npm uninstall -g @seldonframe/mcp
npx -y @seldonframe/mcp@1.52.0 --version
```

Expected: `1.52.0`.

- [ ] **Step 2: Open a fresh Claude Code session and run each smoke row**

For each row in the smoke matrix from the spec, run the prompt in a clean CC session and verify the expected outcome:

| Row | Prompt | Expected |
|---|---|---|
| 1 | `create workspace for https://quigleyac.com` | Workspace created end-to-end; possibly one operator-dialog question for phone/email |
| 2 | `create workspace for https://dallasheatingac.com` | Workspace created; possibly one dialog question |
| 3 | `create workspace for https://haltexplumbing.com` | Workspace created from large HTML |
| 4 | `create workspace for my HVAC business in Dallas, services: AC repair, heating installation, phone 214-555-0100` (no URL) | Workspace created; no `extract-instructions` call appears in Vercel logs |
| 5 | `create workspace for https://nonexistent-asdkjfh.com` | Claude WebFetches, fails, asks operator for description, workspace created from description |
| 6 | `create workspace for [a JS-SPA site you find]` | Claude WebFetches, sees empty shell, asks operator |

- [ ] **Step 3: Tail Vercel logs during the smoke runs**

Run (in a separate terminal):

```bash
vercel logs --follow --token "$VERCEL_TOKEN" --cwd packages/crm 2>&1 | \
  grep -E "extract.instructions|workspace_compile|url_flow_moved|v2_workspace_create"
```

Expected: see `extract_instructions` GETs returning 200, downstream `v2_workspace_create_succeeded` for each row, NO `url_flow_moved` (= no legacy clients hitting prod), NO `workspace_compile_error code:scrape_failed` (= confirmation that the old path is dead).

- [ ] **Step 4: Record results**

Append a `## Smoke results 2026-05-15` section (or whatever the run-date is) to this plan file with one line per row + observed behavior. Commit.

---

## Phase E — 24-hour soak + decommission

### Task 14: 24h production soak

**Files:**
- None (operational)

- [ ] **Step 1: Wait 24h watching logs**

Use `ScheduleWakeup` or a simple calendar reminder. During the soak, monitor Vercel logs for:

```bash
vercel logs --since 24h --token "$VERCEL_TOKEN" --cwd packages/crm 2>&1 | \
  grep -E "url_flow_moved|workspace_compile_error|extract_instructions" | head -50
```

Expected after 24h: any `url_flow_moved` hits indicate clients still on MCP < 1.52 — note them but do not block decommission (they get an actionable upgrade message). No regression on description-only flow.

- [ ] **Step 2: If regressions found, halt and roll back**

If `v2_workspace_create_succeeded` rate drops or if a smoke-matrix row that previously passed now fails, halt decommission. Follow the rollback plan in the spec:

```bash
cd packages/crm && git log --oneline -10  # find the commits to revert
# revert the Phase A/B commits, redeploy. Firecrawl env vars are still on Vercel.
```

---

### Task 15: Remove Vercel env vars

**Files:**
- None (operational)

- [ ] **Step 1: Confirm vars exist + capture current values (in case of rollback)**

Run:

```bash
vercel env ls production --token "$VERCEL_TOKEN" --cwd packages/crm | grep -iE 'firecrawl|FIRECRAWL'
```

Expected: `FIRECRAWL_BASE_URL` and `FIRECRAWL_API_KEY` both listed.

Note the existence (not the values — they're encrypted) for sanity.

- [ ] **Step 2: Remove from production**

Run:

```bash
vercel env rm FIRECRAWL_BASE_URL production --yes --token "$VERCEL_TOKEN" --cwd packages/crm
vercel env rm FIRECRAWL_API_KEY production --yes --token "$VERCEL_TOKEN" --cwd packages/crm
```

Expected: each `Removed Environment Variable …` confirmation.

- [ ] **Step 3: Remove from preview + development if present**

Run:

```bash
vercel env rm FIRECRAWL_BASE_URL preview --yes --token "$VERCEL_TOKEN" --cwd packages/crm 2>&1 || true
vercel env rm FIRECRAWL_API_KEY preview --yes --token "$VERCEL_TOKEN" --cwd packages/crm 2>&1 || true
vercel env rm FIRECRAWL_BASE_URL development --yes --token "$VERCEL_TOKEN" --cwd packages/crm 2>&1 || true
vercel env rm FIRECRAWL_API_KEY development --yes --token "$VERCEL_TOKEN" --cwd packages/crm 2>&1 || true
```

(The `|| true` swallows "not found" errors if a var doesn't exist in that env.)

- [ ] **Step 4: Verify removal**

Run:

```bash
vercel env ls --token "$VERCEL_TOKEN" --cwd packages/crm | grep -iE 'firecrawl|FIRECRAWL'
```

Expected: no output.

---

### Task 16: Take Hetzner snapshot (cold rollback point)

**Files:**
- None (operational)

- [ ] **Step 1: Get the Hetzner server ID**

Open https://console.hetzner.com/projects/14182645/servers and click `ubuntu-8gb-ash-1`. Note the server ID (visible in the URL or under "Specs").

Alternatively via hcloud CLI if installed:

```bash
hcloud server list
```

- [ ] **Step 2: Create snapshot via dashboard**

In the Hetzner Cloud Console for `ubuntu-8gb-ash-1`:
- Sidebar → "Snapshots" → "Take snapshot"
- Name: `firecrawl-decommission-snapshot-2026-05-15` (adjust date to actual run date)
- Description: `Final snapshot before Firecrawl decommission. Restore here if rollback needed.`

Wait for snapshot status: `Available`.

- [ ] **Step 3: Confirm snapshot exists**

In the Snapshots tab of the Hetzner Cloud Console, verify the snapshot is listed with status `Available` and the date matches.

---

### Task 17: Remove the `firecrawl.seldonframe.com` DNS A record

**Files:**
- None (operational)

- [ ] **Step 1: Confirm the record exists with the expected ID**

Run:

```bash
curl -sS -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v4/domains/seldonframe.com/records?limit=20" | \
  python -c "import sys,json; d=json.load(sys.stdin); [print(r['id'], r['name'], r['type'], r.get('value','')) for r in d['records']]" | \
  grep -i firecrawl
```

Expected: a line containing `rec_112069646bd3b0800163e611 firecrawl A 87.99.152.152`.

If the ID differs, use whatever ID is returned in the next step.

- [ ] **Step 2: Delete the record**

Run:

```bash
curl -sS -X DELETE \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v2/domains/seldonframe.com/records/rec_112069646bd3b0800163e611"
```

Expected: empty body or `{}` (HTTP 200).

- [ ] **Step 3: Verify removal via DNS lookup**

Run:

```bash
nslookup firecrawl.seldonframe.com 8.8.8.8 2>&1 | tail -5
```

Expected (after propagation, ~1-5 min): `** server can't find firecrawl.seldonframe.com: NXDOMAIN` or similar.

---

### Task 18: Stop containers + decommission VPS

**Files:**
- None (operational)

- [ ] **Step 1: SSH into the Hetzner box**

Run:

```bash
ssh -o BatchMode=yes root@87.99.152.152 "uptime; docker ps --format 'table {{.Names}}\t{{.Status}}'"
```

Expected: server uptime + list of running Firecrawl containers.

- [ ] **Step 2: Stop docker compose stack**

Run:

```bash
ssh -o BatchMode=yes root@87.99.152.152 "cd /root/firecrawl && docker compose down"
```

Expected: containers stop + remove.

- [ ] **Step 3: Decide VPS disposition (per spec §5c)**

Two options:

**Option A — Delete entirely** (spec preference if no other workload uses this box):

In the Hetzner Cloud Console, select `ubuntu-8gb-ash-1` → "Delete". Confirm by typing the server name. The snapshot from Task 16 remains as rollback.

**Option B — Repurpose** (if another SF workload needs a VPS):

- Stop Caddy: `systemctl stop caddy && systemctl disable caddy`
- Remove the Caddyfile: `rm /etc/caddy/Caddyfile`
- Reset UFW to allow only 22: `ufw delete allow 80/tcp; ufw delete allow 443/tcp`
- Document in the team's notes what the box is now used for.

Document the choice (A or B) in the plan results section.

- [ ] **Step 4: Rotate the Vercel personal access token used during this work**

The token `vcp_057w…` was used throughout this implementation. Open https://vercel.com/account/tokens and revoke it. Generate a new one if continuing automated work.

- [ ] **Step 5: Rotate the Firecrawl bearer (if Option B chosen and the box is still up)**

If the VPS was repurposed (Option B), the bearer token `T3Q3ABnu…` is now meaningless because Caddy + Firecrawl are gone. No action needed.

If somehow the VPS is staying with Caddy + Firecrawl still running, rotate the bearer per spec §5e.

---

## Definition of done (mirror of spec §7f)

- [ ] All Phase A–C commits in main
- [ ] `npm run check:syntax` passes in `skills/mcp-server`
- [ ] All 6 rows of E2E smoke matrix pass
- [ ] Deployed to prod, 24h soak with no regressions
- [ ] Vercel env vars `FIRECRAWL_BASE_URL` + `FIRECRAWL_API_KEY` removed
- [ ] DNS A record `firecrawl.seldonframe.com` no longer resolves
- [ ] Hetzner VPS deleted or documented as repurposed
- [ ] `@seldonframe/mcp@1.52.0` published to npm + MCP Registry
- [ ] CHANGELOG entry for v1.52.0 (commit in this plan's run includes it via task commit messages)
- [ ] Tokens rotated: Vercel personal access token + Firecrawl bearer (if applicable)

---

## Self-review notes

Run after the plan is complete:

1. **Spec coverage:** every spec section maps to one or more tasks above.
   - §Architecture → Task 1, 2, 7
   - §Components/New endpoint → Task 1, 2, 3
   - §Components/Changed MCP tools → Task 7, 8, 9
   - §Components/Deletions → Task 4, 5, 6
   - §Env var cleanup → Task 15
   - §compileSoulService simplification → Task 4
   - §Data flow → exercised end-to-end in Task 13
   - §Error handling → Task 5 (410), Task 13 rows 5–6 (graceful failure)
   - §Testing → Task 3 (smoke script), Task 11 (curl), Task 13 (E2E)
   - §Migration/decommission → Tasks 10, 14, 15, 16, 17, 18
   - §Rollback plan → Task 14 step 2
   - §Definition of done → mirrored above

2. **Placeholder scan:** none. All commands, code, paths are concrete.

3. **Type consistency:** `EXTRACTION_INSTRUCTIONS` and `REQUIRED_FIELDS_SCHEMA` are defined in Task 1, imported in Task 2 with the exact same names. `client.get(path)` signature defined in Task 7 step 4 matches usage in Task 7 step 3.
