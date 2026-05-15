# Redesign the agency operator's post-creation output — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the post-creation output an agency-voice product moment that surfaces all four pillars (Website, Booking, Intake, AI chatbot), the client portal URL, the chatbot embed snippet ready to paste, and the tier ladder — so operators see SeldonFrame's pitch (`CRM. Booking. Intake. AI chatbot. Already wired.`) instead of a generic config receipt.

**Architecture:** Three coordinated changes: (1) `complete_workspace_v2` server-side auto-creates a website-chatbot agent with an idempotency pre-check and soft-fail; (2) the snapshot endpoint exposes new derived fields (chatbot, tier via `buildTierUpsell`, booking via new `summarizeWeeklyHours` helper, intake); (3) the `finalize_workspace` MCP handler rewrites the `summary` string to the Approach-A 8-section template + adds a new 6-entry `next_steps_available` array.

**Tech Stack:** Next.js 16.2 (App Router) backend at `packages/crm`, MCP server in `skills/mcp-server` (Node, ESM), `lucide-react ^1.7.0` (client-only — important, but this plan doesn't import it server-side), `node:test` + `tsx` for unit tests at `packages/crm/tests/unit/`, run via `pnpm test:unit`.

**Source spec:** [`docs/superpowers/specs/2026-05-15-agency-output-product-moment-design.md`](../specs/2026-05-15-agency-output-product-moment-design.md) (commit `85aed6e2` on main).

---

## File map

**Create:**
- `packages/crm/src/lib/workspace/format-hours.ts` — pure helper that turns a weekly-availability object into a compact human string (`"Mon-Fri 7-5, Sat 8-12"` etc.)
- `packages/crm/tests/unit/format-hours.spec.ts` — unit tests for the helper

**Modify:**
- `packages/crm/src/app/api/v1/workspace/v2/complete/route.ts` — add auto-chatbot creation (idempotency pre-check + `createAgent` + soft-fail) and expose `chatbot_agent_id` / `chatbot_embed_url` / `chatbot_embed_snippet` in the response
- `packages/crm/src/app/api/v1/workspace/[id]/snapshot/route.ts` — add `chatbot`, `tier`, `booking`, `intake` fields to the snapshot response
- `skills/mcp-server/src/tools.js` — rewrite the `finalize_workspace` handler's `lines` array (the summary string builder) and return shape; update the tool's `description` to acknowledge agency framing
- `skills/mcp-server/package.json` — `1.52.0` → `1.53.0`

**No changes:**
- `packages/crm/src/lib/workspace/tier-upsell.ts` — used as-is; the spec relies on its existing `buildTierUpsell` signature
- `packages/crm/src/lib/agents/store.ts` — `createAgent` used as-is

---

## Phase A — `summarizeWeeklyHours` helper

### Task 1: Create `format-hours.ts` + unit tests (TDD)

**Files:**
- Create: `packages/crm/src/lib/workspace/format-hours.ts`
- Create: `packages/crm/tests/unit/format-hours.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/crm/tests/unit/format-hours.spec.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeWeeklyHours } from "../../src/lib/workspace/format-hours";

test("Mon-Fri 07:00-17:00 collapses to 'Mon-Fri 7-5'", () => {
  const hours = {
    monday:    { enabled: true,  start: "07:00", end: "17:00" },
    tuesday:   { enabled: true,  start: "07:00", end: "17:00" },
    wednesday: { enabled: true,  start: "07:00", end: "17:00" },
    thursday:  { enabled: true,  start: "07:00", end: "17:00" },
    friday:    { enabled: true,  start: "07:00", end: "17:00" },
    saturday:  { enabled: false, start: "00:00", end: "00:00" },
    sunday:    { enabled: false, start: "00:00", end: "00:00" },
  };
  assert.equal(summarizeWeeklyHours(hours), "Mon-Fri 7-5");
});

test("Mon-Fri + Sat with different hours formats with comma", () => {
  const hours = {
    monday:    { enabled: true,  start: "09:00", end: "17:00" },
    tuesday:   { enabled: true,  start: "09:00", end: "17:00" },
    wednesday: { enabled: true,  start: "09:00", end: "17:00" },
    thursday:  { enabled: true,  start: "09:00", end: "17:00" },
    friday:    { enabled: true,  start: "09:00", end: "17:00" },
    saturday:  { enabled: true,  start: "08:00", end: "12:00" },
    sunday:    { enabled: false, start: "00:00", end: "00:00" },
  };
  assert.equal(summarizeWeeklyHours(hours), "Mon-Fri 9-5, Sat 8-12");
});

test("non-contiguous days fall back to enumeration", () => {
  const hours = {
    monday:    { enabled: true,  start: "09:00", end: "17:00" },
    tuesday:   { enabled: false, start: "00:00", end: "00:00" },
    wednesday: { enabled: true,  start: "09:00", end: "17:00" },
    thursday:  { enabled: false, start: "00:00", end: "00:00" },
    friday:    { enabled: true,  start: "09:00", end: "17:00" },
    saturday:  { enabled: false, start: "00:00", end: "00:00" },
    sunday:    { enabled: false, start: "00:00", end: "00:00" },
  };
  assert.equal(summarizeWeeklyHours(hours), "Mon, Wed, Fri 9-5");
});

test("empty availability returns 'by appointment'", () => {
  assert.equal(summarizeWeeklyHours({}), "by appointment");
});

test("all-disabled days returns 'by appointment'", () => {
  const hours = {
    monday: { enabled: false, start: "09:00", end: "17:00" },
    tuesday: { enabled: false, start: "09:00", end: "17:00" },
  };
  assert.equal(summarizeWeeklyHours(hours), "by appointment");
});

test("single day returns just that day's hours", () => {
  const hours = {
    monday:  { enabled: false, start: "00:00", end: "00:00" },
    tuesday: { enabled: false, start: "00:00", end: "00:00" },
    wednesday: { enabled: true, start: "10:00", end: "14:00" },
  };
  assert.equal(summarizeWeeklyHours(hours), "Wed 10-2");
});

test("two adjacent runs with different hours", () => {
  // Mon-Wed 9-5, Thu-Fri 12-8
  const hours = {
    monday:    { enabled: true, start: "09:00", end: "17:00" },
    tuesday:   { enabled: true, start: "09:00", end: "17:00" },
    wednesday: { enabled: true, start: "09:00", end: "17:00" },
    thursday:  { enabled: true, start: "12:00", end: "20:00" },
    friday:    { enabled: true, start: "12:00", end: "20:00" },
  };
  assert.equal(summarizeWeeklyHours(hours), "Mon-Wed 9-5, Thu-Fri 12-8");
});

test("midnight-to-midnight is treated as 24/7-style", () => {
  // 00:00-00:00 (or 23:59) on all 7 days — odd edge but real
  const hours = {
    monday:    { enabled: true, start: "00:00", end: "23:59" },
    tuesday:   { enabled: true, start: "00:00", end: "23:59" },
    wednesday: { enabled: true, start: "00:00", end: "23:59" },
    thursday:  { enabled: true, start: "00:00", end: "23:59" },
    friday:    { enabled: true, start: "00:00", end: "23:59" },
    saturday:  { enabled: true, start: "00:00", end: "23:59" },
    sunday:    { enabled: true, start: "00:00", end: "23:59" },
  };
  // Returns the literal run; "Sun-Sat" isn't standard. Day-of-week
  // ordering is Mon-Sun, so all-7-days starting Mon prints "Mon-Sun".
  assert.equal(summarizeWeeklyHours(hours), "Mon-Sun 12-12");
});
```

- [ ] **Step 2: Run the tests — confirm they fail**

```bash
cd C:/Users/maxim/CascadeProjects/Seldon\ Frame/.claude/worktrees/<your-worktree>
pnpm test:unit 2>&1 | grep -E "format-hours|fail " | head -10
```
Expected: 8 tests, all failing because the module doesn't exist yet.

- [ ] **Step 3: Implement the helper**

```typescript
// packages/crm/src/lib/workspace/format-hours.ts
//
// 2026-05-15 — Compact human-readable summary of a weekly availability map.
// Used by the workspace snapshot endpoint to produce
// `booking.hours_summary` strings like "Mon-Fri 7-5, Sat 8-12" that the
// MCP finalize_workspace handler embeds in the operator-facing summary.
//
// Spec: docs/superpowers/specs/2026-05-15-agency-output-product-moment-design.md

type DayName =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

type DaySpec = { enabled: boolean; start: string; end: string };

export type WeeklyHours = Partial<Record<DayName, DaySpec>>;

const ORDER: DayName[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const SHORT: Record<DayName, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

/** Format "HH:MM" → 12-hour-ish short label without leading zeros or AM/PM.
 *  09:00 → "9", 17:00 → "5", 23:59 → "12", 14:30 → "2:30". */
function shortHour(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  // Convert 24h → 12h-ish: 0/12/24 → 12, 13-23 → h-12, 1-11 → h.
  let display = h % 12;
  if (display === 0) display = 12;
  if (Number.isNaN(m) || m === 0 || m === 59) return String(display);
  return `${display}:${String(m).padStart(2, "0")}`;
}

/**
 * Build a compact human-readable summary of a weekly availability map.
 *
 * Returns:
 *   - "by appointment" when no day is enabled
 *   - "Mon-Fri 9-5" for a contiguous run sharing the same hours
 *   - "Mon-Fri 9-5, Sat 8-12" for adjacent runs with different hours
 *   - "Mon, Wed, Fri 9-5" when enabled days are non-contiguous
 */
export function summarizeWeeklyHours(hours: WeeklyHours): string {
  // Collect enabled days in week order with their hour fingerprint.
  const enabled: Array<{ day: DayName; key: string; start: string; end: string }> = [];
  for (const day of ORDER) {
    const spec = hours[day];
    if (spec?.enabled) {
      enabled.push({
        day,
        key: `${spec.start}-${spec.end}`,
        start: spec.start,
        end: spec.end,
      });
    }
  }
  if (enabled.length === 0) return "by appointment";

  // Group consecutive days with the same hours into runs. A "run" is a
  // maximal contiguous (by ORDER index) sequence where the hour-key is
  // identical AND the previous day in ORDER is also in the run.
  type Run = {
    days: DayName[];
    start: string;
    end: string;
    contiguous: boolean;
  };
  const runs: Run[] = [];
  for (let i = 0; i < enabled.length; i++) {
    const e = enabled[i];
    const last = runs[runs.length - 1];
    const prevDayIdx = i > 0 ? ORDER.indexOf(enabled[i - 1].day) : -2;
    const currDayIdx = ORDER.indexOf(e.day);
    const adjacent = currDayIdx === prevDayIdx + 1;
    const sameHours = last && last.start === e.start && last.end === e.end;
    if (last && sameHours && adjacent && last.contiguous) {
      last.days.push(e.day);
    } else {
      runs.push({ days: [e.day], start: e.start, end: e.end, contiguous: adjacent || runs.length === 0 });
      // If a brand new run started because of a gap, mark non-contiguous
      // so subsequent days don't merge across the gap.
      if (last && !adjacent) {
        runs[runs.length - 1].contiguous = false;
      }
    }
  }

  // If everything ended up in ONE non-contiguous run (e.g. Mon/Wed/Fri
  // all at 9-5 — the loop above splits these into 3 single-day runs
  // because of the contiguity check). Detect that case and re-merge for
  // the "Mon, Wed, Fri 9-5" rendering.
  const allSameHours = runs.every(
    (r) => r.start === runs[0].start && r.end === runs[0].end
  );
  if (allSameHours && runs.length > 1) {
    const allDays = runs.flatMap((r) => r.days);
    const allContiguous = allDays.every((d, idx) => {
      if (idx === 0) return true;
      return ORDER.indexOf(d) === ORDER.indexOf(allDays[idx - 1]) + 1;
    });
    if (!allContiguous) {
      // Render as "Day1, Day2, Day3 H-H".
      return `${allDays.map((d) => SHORT[d]).join(", ")} ${shortHour(runs[0].start)}-${shortHour(runs[0].end)}`;
    }
  }

  // Otherwise, render each run as "Mon-Fri H-H" or "Mon H-H" and comma-join.
  return runs
    .map((run) => {
      const dayLabel =
        run.days.length === 1
          ? SHORT[run.days[0]]
          : `${SHORT[run.days[0]]}-${SHORT[run.days[run.days.length - 1]]}`;
      return `${dayLabel} ${shortHour(run.start)}-${shortHour(run.end)}`;
    })
    .join(", ");
}
```

- [ ] **Step 4: Run the tests — all should pass**

```bash
pnpm test:unit 2>&1 | grep -E "format-hours|pass |fail " | head -15
```
Expected: 8 pass, 0 fail.

If a test fails, the algorithm needs adjustment. Common edge:
- The "Mon, Wed, Fri 9-5" case requires the re-merge logic at the bottom of the function. If you see runs like `["Mon 9-5", "Wed 9-5", "Fri 9-5"]` instead of the merged form, the contiguity-detection branch isn't kicking in correctly. Trace through the loop step-by-step.

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/workspace/format-hours.ts \
        packages/crm/tests/unit/format-hours.spec.ts
git commit -m "feat(workspace): summarizeWeeklyHours helper for booking display

Compact human-readable summary of a weekly availability map (used by
snapshot endpoint to produce 'Mon-Fri 7-5, Sat 8-12'-style strings for
the operator-facing finalize_workspace summary).

Refs: docs/superpowers/specs/2026-05-15-agency-output-product-moment-design.md"
```

---

## Phase B — `complete_workspace_v2` auto-chatbot

### Task 2: Add auto-chatbot creation to `/v2/complete`

**Files:**
- Modify: `packages/crm/src/app/api/v1/workspace/v2/complete/route.ts`

- [ ] **Step 1: Inspect the current file**

```bash
cd C:/Users/maxim/CascadeProjects/Seldon\ Frame/.claude/worktrees/<your-worktree>
cat packages/crm/src/app/api/v1/workspace/v2/complete/route.ts | head -120
```

Note the structure:
- Existing imports (`db`, `blockInstances`, `organizations`, `guardApiRequest`, `logEvent`, `listBlockNames`)
- POST handler with auth + body parsing + block inventory + return
- Returns `{ ok, workspace_id, public_url, blocks: {expected, persisted, missing}, next_steps: [...] }`

Verify the `createAgent` return shape to confirm `agent.id` and `embedUrl` are accessible:

```bash
grep -n "embedUrl\|turnUrl\|return\s*{\s*ok:" packages/crm/src/lib/agents/store.ts | head -10
```

Expected: `embedUrl` and `turnUrl` returned as part of `{ ok: true, agent, embedUrl, turnUrl }`.

- [ ] **Step 2: Add imports**

At the top of the file, after existing imports:

```typescript
import { agents } from "@/db/schema";
import { createAgent } from "@/lib/agents/store";
```

(`logEvent`, `db`, `and`, `eq` are already imported per Step 1.)

If `and` is not imported alongside `eq`, add it:
```typescript
import { and, eq } from "drizzle-orm";
```

- [ ] **Step 3: Insert auto-chatbot block before the `return NextResponse.json({...})`**

Find the final return (currently `return NextResponse.json({ ok: true, workspace_id: workspaceId, public_url: publicUrl, blocks: {...}, next_steps: [...] })`).

Just BEFORE that return, insert:

```typescript
  // 2026-05-15 — Auto-create a website-chatbot scaffold so finalize_workspace's
  // operator summary can give the agency the embed snippet immediately.
  // Soft-fail: if createAgent throws (or returns { ok: false }), we return
  // null chatbot fields and the summary tells the operator to retry via
  // create_agent. Never blocks workspace creation.
  //
  // Idempotency: if a website-chatbot already exists for this workspace
  // (caller retried v2/complete, race, etc.), reuse it instead of creating
  // a duplicate.
  let chatbotAgentId: string | null = null;
  let chatbotEmbedUrl: string | null = null;
  let chatbotEmbedSnippet: string | null = null;

  const [existingChatbot] = await db
    .select({ id: agents.id, slug: agents.slug })
    .from(agents)
    .where(
      and(eq(agents.orgId, workspaceId), eq(agents.archetype, "website-chatbot")),
    )
    .limit(1);

  if (existingChatbot) {
    // Reconstruct the embed URL for an existing agent. The format must
    // match what createAgent emits — verify at task time by reading
    // packages/crm/src/lib/agents/store.ts (search for "embedUrl =").
    // Common pattern: `${API_BASE_OR_HOST}/embed/${agent.slug}.js`.
    const appHost =
      process.env.SELDONFRAME_APP_BASE?.trim() ||
      "https://app.seldonframe.com";
    chatbotAgentId = existingChatbot.id;
    chatbotEmbedUrl = `${appHost}/embed/${existingChatbot.slug}.js`;
    chatbotEmbedSnippet = `<script src="${chatbotEmbedUrl}" async></script>`;
  } else {
    try {
      // Look up the org name for the agent's display name.
      const [orgRow] = await db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, workspaceId))
        .limit(1);

      const agentResult = await createAgent({
        orgId: workspaceId,
        archetype: "website-chatbot",
        channel: "web_chat",
        name: `${orgRow?.name ?? "Website"} Chatbot`,
        // Empty FAQ scaffold — operator refines via update_website_chatbot
        // before calling publish_agent.
        faq: [],
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

If the existing-agent embed URL reconstruction at the top doesn't match `createAgent`'s actual output, the v2/complete idempotent path will produce a different embed URL than the create path. Verify by reading `createAgent` source and matching the pattern exactly. If it uses `agent.id` instead of `agent.slug`, swap accordingly.

- [ ] **Step 4: Update the return statement**

Find the existing `return NextResponse.json({ ok: true, workspace_id: workspaceId, public_url: publicUrl, blocks: {...}, next_steps: [...] })` and add three new fields:

```typescript
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
    // NEW (2026-05-15): auto-chatbot scaffold. Null when soft-fail fired.
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

- [ ] **Step 5: Typecheck**

```bash
cd packages/crm && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "v2/complete|TS[0-9]+:" | grep -v "next/types/validator" | head -10
```
Expected: no errors for `v2/complete/route.ts`.

- [ ] **Step 6: Commit**

```bash
cd C:/Users/maxim/CascadeProjects/Seldon\ Frame/.claude/worktrees/<your-worktree>
git add packages/crm/src/app/api/v1/workspace/v2/complete/route.ts
git commit -m "feat(workspace): auto-create website-chatbot in v2/complete

Every lean-URL-flow workspace ships with a website-chatbot scaffold so
finalize_workspace's operator summary can surface the embed snippet
immediately. Idempotency: existing chatbot is reused (no duplicates on
v2/complete retry). Soft-fail: createAgent errors are logged as
v2_auto_chatbot_failed and the workspace still completes with null
chatbot fields.

Restores the v1.51 auto-chatbot feature that was orphaned when URL
handling moved to the MCP client (see firecrawl-removal spec).

Refs: docs/superpowers/specs/2026-05-15-agency-output-product-moment-design.md"
```

---

## Phase C — Snapshot endpoint additions

### Task 3: Add `chatbot`, `tier`, `booking`, `intake` fields to snapshot

**Files:**
- Modify: `packages/crm/src/app/api/v1/workspace/[id]/snapshot/route.ts`

- [ ] **Step 1: Read the current snapshot route fully**

```bash
cat packages/crm/src/app/api/v1/workspace/\[id\]/snapshot/route.ts
```

Note: the auth + org load + counts already happen. The response currently returns workspace metadata + entity counts + public URLs. You're adding four new fields to the returned JSON.

- [ ] **Step 2: Add imports**

At the top of the file, after existing imports:

```typescript
import { agents, intakeForms } from "@/db/schema";
import { buildTierUpsell } from "@/lib/workspace/tier-upsell";
import { summarizeWeeklyHours, type WeeklyHours } from "@/lib/workspace/format-hours";
```

(`bookings` and other tables may already be imported; verify and don't duplicate.)

- [ ] **Step 3: After the existing data loads, before the response build, add the new field computations**

Find the spot in the handler where the existing response object is being assembled. Just before the `return NextResponse.json({...})`, add:

```typescript
  // 2026-05-15 — Chatbot info. Returns null when no website-chatbot
  // agent has been created for this workspace yet.
  const [chatbotAgent] = await db
    .select({
      id: agents.id,
      slug: agents.slug,
      name: agents.name,
      status: agents.status,
    })
    .from(agents)
    .where(
      and(eq(agents.orgId, workspaceId), eq(agents.archetype, "website-chatbot")),
    )
    .limit(1);

  const appHost =
    process.env.SELDONFRAME_APP_BASE?.trim() || "https://app.seldonframe.com";

  const chatbot = chatbotAgent
    ? {
        agent_id: chatbotAgent.id,
        embed_url: `${appHost}/embed/${chatbotAgent.slug}.js`,
        embed_snippet: `<script src="${appHost}/embed/${chatbotAgent.slug}.js" async></script>`,
        status: chatbotAgent.status as "draft" | "test" | "live",
        name: chatbotAgent.name,
      }
    : null;

  // 2026-05-15 — Tier info via buildTierUpsell. Always populated; currently
  // hardcoded to "free" until billing-state read is wired in a separate spec.
  const tierBase = buildTierUpsell({
    slug: org.slug,
    currentTier: "free",
  });
  const tierLabelMap = { free: "Free", growth: "Growth", scale: "Scale" } as const;
  const tier = {
    ...tierBase,
    current_tier: tierBase.tier_features.current_tier,
    current_tier_label: tierLabelMap[tierBase.tier_features.current_tier],
  };

  // 2026-05-15 — Booking summary. Pull the org's template-status booking
  // row, read metadata.availability + metadata.duration_minutes.
  const [bookingTemplate] = await db
    .select({
      metadata: bookings.metadata,
    })
    .from(bookings)
    .where(
      and(eq(bookings.orgId, workspaceId), eq(bookings.status, "template")),
    )
    .limit(1);

  const bookingMeta = (bookingTemplate?.metadata ?? {}) as {
    availability?: WeeklyHours;
    duration_minutes?: number;
  };
  const bookingSummary = bookingTemplate
    ? {
        duration_minutes: bookingMeta.duration_minutes ?? 60,
        hours_summary: summarizeWeeklyHours(bookingMeta.availability ?? {}),
      }
    : null;

  // 2026-05-15 — Intake summary. Pull the org's intake form, count fields.
  const [intakeForm] = await db
    .select({
      name: intakeForms.name,
      fields: intakeForms.fields,
    })
    .from(intakeForms)
    .where(eq(intakeForms.orgId, workspaceId))
    .limit(1);

  const intakeSummary = intakeForm
    ? {
        field_count: Array.isArray(intakeForm.fields) ? intakeForm.fields.length : 0,
        title: intakeForm.name ?? null,
      }
    : null;
```

The `bookings` import may already exist; double-check before adding a duplicate import.

- [ ] **Step 4: Add the four new fields to the response JSON**

Find the existing `return NextResponse.json({...})`. Add the new fields alongside the existing ones (do not modify existing fields):

```typescript
  return NextResponse.json({
    // ...all existing fields unchanged...
    chatbot,
    tier,
    booking: bookingSummary,
    intake: intakeSummary,
  });
```

- [ ] **Step 5: Typecheck**

```bash
cd packages/crm && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "snapshot/route|TS[0-9]+:" | grep -v "next/types/validator" | head -10
```
Expected: no errors for the snapshot route file.

- [ ] **Step 6: Smoke against local dev (optional but recommended)**

If a local dev server is running, hit the snapshot endpoint for a workspace you've created and confirm the four new fields appear:

```bash
curl -sS -H "Authorization: Bearer $WORKSPACE_BEARER" \
  "http://localhost:3000/api/v1/workspace/$WORKSPACE_ID/snapshot" | \
  python -c "import sys,json; d=json.load(sys.stdin); print('chatbot:', d.get('chatbot')); print('tier present:', bool(d.get('tier'))); print('booking:', d.get('booking')); print('intake:', d.get('intake'))"
```

Expected output:
- `chatbot: None` (if no chatbot yet) or a dict with `agent_id`, `embed_url`, `embed_snippet`, `status`, `name`
- `tier present: True` always
- `booking: {duration_minutes: 60, hours_summary: 'Mon-Fri 7-7, ...'}` or `None`
- `intake: {field_count: N, title: '...'}` or `None`

- [ ] **Step 7: Commit**

```bash
git add packages/crm/src/app/api/v1/workspace/\[id\]/snapshot/route.ts
git commit -m "feat(snapshot): expose chatbot + tier + booking + intake derived fields

The workspace snapshot endpoint now returns four new fields the
finalize_workspace MCP handler reads:
  - chatbot: { agent_id, embed_url, embed_snippet, status, name } | null
  - tier: { current_tier, current_tier_label, client_portal_url,
            client_portal_status, tier_features, upsell_hint }
  - booking: { duration_minutes, hours_summary } | null
  - intake: { field_count, title } | null

tier is always populated (currentTier hardcoded to 'free' until
billing-state read is wired). chatbot/booking/intake are null when the
underlying entities don't exist yet.

Refs: docs/superpowers/specs/2026-05-15-agency-output-product-moment-design.md"
```

---

## Phase D — MCP handler rewrite

### Task 4: Rewrite `finalize_workspace` summary string

**Files:**
- Modify: `skills/mcp-server/src/tools.js` (around lines 814-980)

This is the largest single change in the plan. The flow stays — snapshot fetch, welcome-email send, lead-capture call. Only the `lines = [...]` array (which builds `summary`), the return shape, and the tool description change.

- [ ] **Step 1: Capture `sessionStart` at the top of the handler**

Find the start of the `finalize_workspace` handler:

```javascript
    handler: async (a) => {
      const workspaceId = a.workspace_id ?? getDefaultWorkspace();
      // ...
```

Add immediately at the top of the handler body:

```javascript
    handler: async (a) => {
      const sessionStart = Date.now();
      const workspaceId = a.workspace_id ?? getDefaultWorkspace();
      // ...
```

(The "session start" for this single handler call is when the handler was invoked. For showing "shipped in 8m 48s", we'd want the time since the operator's `create_workspace_from_url` initial call — but that's across multiple tool calls and not easily tracked. Using the handler's own start time means the displayed duration is the finalize call's own duration. For now, accept that — the duration string in the summary template is a "since finalize started" measurement, ~10-30 seconds. If a longer-arc duration is wanted, that's a follow-up.)

Alternative: omit `duration` from the summary entirely if it's misleading. **Recommendation: omit it** since it's just the finalize call's own elapsed time, not the overall workspace-creation duration. The header line becomes:

```
✅ {business_name} — client OS shipped.
```

This is a small spec departure but produces a more honest result. If the user prefers a real duration, a follow-up can plumb a session-creation timestamp through the snapshot.

For Step 1 then: do NOT capture sessionStart, and proceed without `duration` in the header.

- [ ] **Step 2: Add `formatDuration` helper at module scope (skip if omitting duration)**

If omitting duration per Step 1 alt, SKIP this step.

- [ ] **Step 3: Read new fields from the snapshot**

After the existing `snapshot` fetch (~line 836), add:

```javascript
      const chatbot = snapshot?.chatbot ?? null;
      const tier = snapshot?.tier ?? null;
      const bookingInfo = snapshot?.booking ?? null;
      const intakeInfo = snapshot?.intake ?? null;
```

- [ ] **Step 4: Replace the `lines = [...]` array (the big change)**

Find the entire existing `const lines = [...]` block through `const summary = lines.join("\n");` (currently around lines 888-944). Replace with:

```javascript
      // Determine vertical-aware special note for the intake line.
      const intakeSpecialNote =
        personality?.vertical === "hvac" || personality?.vertical === "plumbing"
          ? "emergency-line fallback"
          : "structured lead-qualification";

      const tierLabel = tier?.current_tier_label ?? "Free";
      const isPaid =
        tier?.current_tier === "growth" || tier?.current_tier === "scale";
      const isScale = tier?.current_tier === "scale";

      const lines = [];

      // ─── Header ──────────────────────────────────────────────
      lines.push(`✅ ${wsName} — client OS shipped.`);
      lines.push("");
      lines.push("Your client's stack is wired and live:");
      lines.push("");

      // ─── Public site ────────────────────────────────────────
      lines.push("🌐 Public site (paste a screenshot in your Slack)");
      lines.push(`   ${publicUrls.home}`);
      lines.push("");

      // ─── Chatbot ────────────────────────────────────────────
      if (chatbot && chatbot.embed_snippet) {
        lines.push("🤖 AI chatbot — paste on the client's existing site (before </body>):");
        lines.push(`   ${chatbot.embed_snippet}`);
        lines.push(
          `   In ${String(chatbot.status).toUpperCase()} mode. Powered by your Claude Code key (swap in settings).`,
        );
        lines.push(
          `   Publish live: publish_agent({ agent_id: "${chatbot.agent_id}", status: "live" })`,
        );
      } else {
        lines.push("🤖 AI chatbot — scaffold pending. Retry:");
        lines.push(`   create_agent({ archetype: "website-chatbot", channel: "web_chat" })`);
      }
      lines.push("");

      // ─── Booking ────────────────────────────────────────────
      lines.push("📋 Booking page (client's customers self-serve appointments)");
      lines.push(`   ${publicUrls.book}`);
      lines.push("");

      // ─── Intake ─────────────────────────────────────────────
      const intakeFieldCount = intakeInfo?.field_count ?? 0;
      const intakeTitle = intakeInfo?.title ?? "lead qualification";
      lines.push(`📝 Intake form (${intakeFieldCount}-question ${intakeTitle})`);
      lines.push(`   ${publicUrls.intake}`);
      lines.push("");

      // ─── Admin ──────────────────────────────────────────────
      lines.push("🔐 Your admin (CRM, pipeline, leads, deals)");
      lines.push(`   ${adminUrl}`);
      lines.push("");

      // ─── Client portal ──────────────────────────────────────
      if (tier?.client_portal_url) {
        lines.push("👥 Client portal (your client logs in here to see their leads + bookings)");
        lines.push(`   ${tier.client_portal_url}`);
        if (isPaid) {
          lines.push(`   ✅ Active. Forward this URL to your client; they log in via magic email.`);
        } else {
          lines.push(`   🔒 Growth tier ($29/mo) unlocks this for your client. Preview it`);
          lines.push(`       yourself at the URL above right now.`);
        }
        lines.push("");
      }

      // ─── What's wired ───────────────────────────────────────
      lines.push("What's wired:");
      if (personalityLabel) {
        const stageCount = pipelineStages.length;
        lines.push(`   • ${personalityLabel} personality • ${stageCount}-stage CRM pipeline`);
      }
      if (bookingInfo) {
        lines.push(
          `   • ${bookingInfo.hours_summary} bookings, ${bookingInfo.duration_minutes}-min slots`,
        );
      }
      if (intakeInfo) {
        lines.push(`   • ${intakeFieldCount}-question intake with ${intakeSpecialNote}`);
      }
      if (chatbot) {
        lines.push(`   • AI chatbot trained on the homepage (FAQ scaffold ready to refine)`);
      }
      lines.push(
        emailSent
          ? `   • Welcome email + admin link sent to ${a.email}`
          : `   • Welcome email NOT yet sent (rerun finalize_workspace to retry)`,
      );
      lines.push("");

      // ─── What you can prompt next ───────────────────────────
      lines.push("What you can prompt next:");
      lines.push(`   • "Refine the chatbot FAQ from the site" → update_website_chatbot`);
      lines.push(`   • "Add SMS missed-call-text-back automation" → install_archetype`);
      lines.push(`   • "Customize the hero with the client's brand voice" → customize_block`);
      lines.push(`   • "Wire Google Calendar so bookings sync" → connect_integration`);
      lines.push(`   • "Add a Spanish version of the landing page" → clone_workspace + translate`);
      lines.push("");

      // ─── Tier ladder ────────────────────────────────────────
      if (!isScale) {
        lines.push(`Tier ladder (you're on ${tierLabel}):`);
        lines.push(`   Free  → 1 client workspace, everything above wired`);
        lines.push(`   Growth $29/mo → 3 workspaces, client portal goes live, custom domain`);
        lines.push(`                   (e.g. crm.youragency.com), SMS/email automations`);
        lines.push(`   Scale $99/mo → unlimited workspaces, full white-label, reseller pricing`);
        lines.push("");
      }

      // ─── Closer ─────────────────────────────────────────────
      lines.push("Forward your client this admin link when ready. Or stay here and iterate.");

      const summary = lines.join("\n");
```

- [ ] **Step 5: Update the return shape**

Find the existing `return { ok, summary, ... }` (~line 945-980). Replace with:

```javascript
      return {
        ok: emailSent || leadRecorded,
        summary,
        workspace: { id: workspaceId, name: wsName, slug },
        website_url: publicUrls.home,
        booking_url: publicUrls.book,
        intake_url: publicUrls.intake,
        admin_url: adminUrl,
        // NEW (2026-05-15): chatbot + tier surfacing
        chatbot_agent_id: chatbot?.agent_id ?? null,
        chatbot_embed_url: chatbot?.embed_url ?? null,
        chatbot_embed_snippet: chatbot?.embed_snippet ?? null,
        chatbot_status: chatbot?.status ?? null,
        client_portal_url: tier?.client_portal_url ?? null,
        client_portal_status: tier?.client_portal_status ?? null,
        current_tier: tier?.current_tier ?? "free",
        tier_features: tier?.tier_features ?? null,
        // Existing email/lead fields
        email_sent: emailSent,
        email_error: emailError,
        lead_recorded: leadRecorded,
        lead_id: leadId,
        lead_error: leadError,
        personality: personalityLabel,
        pipeline_stages: pipelineStages.map((s) => s?.name).filter(Boolean),
        // 2026-05-15 — new 6-entry next_steps_available (replaces the old
        // 4 technical tool entries). Agency-meaningful actions only.
        next_steps_available: [
          {
            action: "publish_agent",
            when: "operator has reviewed the chatbot and is ready to take it live for the client's website",
            example: `publish_agent({ agent_id: "${chatbot?.agent_id ?? "ag_..."}", status: "live" })`,
          },
          {
            action: "update_website_chatbot",
            when: "operator wants to refine the chatbot's FAQ before publishing",
            example: `update_website_chatbot({ workspace_id, faq: [{ q: '...', a: '...' }] })`,
          },
          {
            action: "install_archetype",
            when: "operator wants to wire pre-built automations (missed-call-text-back, speed-to-lead, review-requester)",
            example: `install_archetype({ archetype: "missed-call-text-back" })`,
          },
          {
            action: "customize_block",
            when: "operator wants to refine landing-page hero / services / FAQ with brand voice",
            example: `customize_block({ workspace_id, block_name: "hero", prompt: "make this feel more premium" })`,
          },
          {
            action: "connect_integration",
            when: "operator wants Google Calendar sync, Stripe payments, Twilio SMS",
            example: `connect_integration({ workspace_id, provider: "google_calendar" })`,
          },
          {
            action: "configure_llm_provider",
            when: "operator wants to swap from the default Claude Code key to a different Anthropic key",
            example: `configure_llm_provider({ workspace_id, provider: "anthropic", api_key: "sk-ant-..." })`,
          },
        ],
      };
```

- [ ] **Step 6: Update the tool's `description` field**

Find the `description` field of `finalize_workspace` (around line 803):

```javascript
    description:
      "ONE-CALL CLOSING WRAPPER for the workspace creation flow. Bundles email collection (welcome email + lead capture via collect_operator_email) AND produces the final operator-facing summary (live URLs, what's configured, admin link). " +
      ...
```

Add a new sentence at the end of the existing description string (just before the closing `"`):

```javascript
    description:
      "ONE-CALL CLOSING WRAPPER for the workspace creation flow. Bundles email collection (welcome email + lead capture via collect_operator_email) AND produces the final operator-facing summary (live URLs, what's configured, admin link). " +
      "Call this as the LAST step of every workspace creation. After create_workspace returns, ask the user 'What email should I use for your account? This is where you'll get your login link and any notifications.' Then call this tool with the email they give you. Returns a `summary` string Claude Code should paraphrase verbatim to the operator. " +
      "Use this instead of calling collect_operator_email directly when you want a single tool call to close the loop. Skipping this is the same as skipping email collection — leaves the operator with a one-shot URL and no recovery path. " +
      "Example: finalize_workspace({ email: 'max@precisionplumbing.com', name: 'Max' }). " +
      "The summary is agency-voice: addresses the operator AS an agency delivering for their SMB client, not as the workspace owner. When relaying to the operator, preserve the 'your client' framing throughout — don't rewrite to 'your workspace'.",
```

- [ ] **Step 7: Syntax check**

```bash
cd skills/mcp-server && npm run check:syntax
```
Expected: passes silently.

- [ ] **Step 8: Commit**

```bash
cd C:/Users/maxim/CascadeProjects/Seldon\ Frame/.claude/worktrees/<your-worktree>
git add skills/mcp-server/src/tools.js
git commit -m "feat(mcp): rewrite finalize_workspace summary to agency-voice product moment

The post-creation operator output is the agency customer's Stage-2
product moment. The previous summary was a config-receipt dump.

New 8-section summary (agency framing throughout):
  Header → public site → chatbot embed → booking → intake → admin →
  client portal → what's wired → what to prompt next → tier ladder

Branching: chatbot soft-fail shows 'scaffold pending, retry' line.
Paid tiers replace the 🔒 portal lock with 'Active, forward to client'.
Scale tier omits the tier ladder entirely (no upsell to show).

New 6-entry next_steps_available array replaces the previous 4
technical-tool entries (motion preset / DESIGN.md / handoff bundle /
update_landing_content) with agency-meaningful actions:
  publish_agent · update_website_chatbot · install_archetype ·
  customize_block · connect_integration · configure_llm_provider

Tool description updated to instruct Claude to preserve the 'your
client' framing when paraphrasing to the operator.

Refs: docs/superpowers/specs/2026-05-15-agency-output-product-moment-design.md"
```

---

## Phase E — MCP version bump + publish

### Task 5: Bump MCP package to 1.53.0

**Files:**
- Modify: `skills/mcp-server/package.json`

- [ ] **Step 1: Edit the version**

Open `skills/mcp-server/package.json` and change `"version": "1.52.0"` to `"version": "1.53.0"`.

- [ ] **Step 2: Syntax check**

```bash
cd skills/mcp-server && npm run check:syntax
```
Expected: passes.

- [ ] **Step 3: Commit**

```bash
cd C:/Users/maxim/CascadeProjects/Seldon\ Frame/.claude/worktrees/<your-worktree>
git add skills/mcp-server/package.json
git commit -m "chore(mcp): bump version to 1.53.0

v1.53.0 — finalize_workspace summary rewritten to an agency-voice
product moment (8 sections, chatbot embed snippet, client portal URL,
tier ladder, 6 agency-meaningful next-step examples). Auto-chatbot
creation restored on the lean URL flow. No breaking input-schema
changes; structured-response shape additively grows new fields.

Refs: docs/superpowers/specs/2026-05-15-agency-output-product-moment-design.md"
```

---

## Phase F — Deploy + verify

### Task 6: Push branch + merge to main

**Files:**
- None (operational)

- [ ] **Step 1: Confirm git log**

```bash
git log --oneline origin/main..HEAD
git diff --stat origin/main..HEAD
```
Expected: ~5 commits across Tasks 1-5; net positive line count (mostly new code in v2/complete, snapshot route, and the MCP summary; format-hours.ts ~150 lines).

- [ ] **Step 2: Push branch**

```bash
git push -u origin worktree-<your-worktree-name>
```

- [ ] **Step 3: Merge to main via the seo-marketing-schema worktree (or main checkout)**

```bash
cd C:/Users/maxim/CascadeProjects/Seldon\ Frame/.claude/worktrees/seo-marketing-schema
git pull --ff-only origin main
git merge --no-ff origin/worktree-<your-worktree-name> -m "Merge feat: agency-output product moment

Implements docs/superpowers/specs/2026-05-15-agency-output-product-moment-design.md.

5 commits:
- feat(workspace): summarizeWeeklyHours helper + tests
- feat(workspace): v2/complete auto-creates website-chatbot
- feat(snapshot): expose chatbot + tier + booking + intake derived fields
- feat(mcp): rewrite finalize_workspace summary to agency-voice product moment
- chore(mcp): bump version to 1.53.0"
git push origin main
```

- [ ] **Step 4: Wait for Vercel deploy**

```bash
sleep 180
# (Vercel auto-deploys on push to main. Verify in dashboard or via CLI.)
```

### Task 7: Publish `@seldonframe/mcp@1.53.0`

**Files:**
- None (operational)

- [ ] **Step 1: Verify version**

```bash
cd skills/mcp-server && grep '"version"' package.json
```
Expected: `"version": "1.53.0",`

- [ ] **Step 2: Run prepublish check**

```bash
npm run check:syntax
```
Expected: passes.

- [ ] **Step 3: Publish to npm**

```bash
npm publish --access public
```
Expected: `+ @seldonframe/mcp@1.53.0` line in output.

- [ ] **Step 4: Verify on npm**

```bash
npm view @seldonframe/mcp@1.53.0 version
```
Expected: `1.53.0`.

- [ ] **Step 5: Publish to MCP Registry**

(Same workflow as v1.52.0 publish. If unsure of the exact command, refer to the prior version's publish steps.)

### Task 8: Manual smoke against production

**Files:**
- None (manual)

In a fresh Claude Code session with `@seldonframe/mcp@1.53.0`:

- [ ] **Step 1: Force-refresh the MCP client cache**

```bash
npm uninstall -g @seldonframe/mcp 2>/dev/null
npx -y @seldonframe/mcp@1.53.0 --version
```
Expected: `1.53.0`.

- [ ] **Step 2: Run the canonical smoke prompt**

In a clean Claude Code session:

```
create workspace for https://quigleyac.com
```

- [ ] **Step 3: Verify the summary against the §"Definition of done" checklist from the spec**

Tick each box:

- [ ] `✅ Quigley Heating & Air — client OS shipped.` header (agency framing — note "client OS", not "your workspace")
- [ ] 🌐 Public site URL line shown
- [ ] 🤖 Chatbot embed snippet shown: `<script src="…" async></script>`
- [ ] 🤖 "In TEST mode. Powered by your Claude Code key (swap in settings)." footer
- [ ] 🤖 `publish_agent({ agent_id: "ag_…", status: "live" })` example with REAL agent ID (not "ag_..." literal)
- [ ] 📋 Booking URL shown
- [ ] 📝 Intake URL shown with field count + form title
- [ ] 🔐 Admin URL shown (existing — unchanged)
- [ ] 👥 Client portal URL shown
- [ ] 👥 🔒 Growth tier ($29/mo) unlocks line (free tier mode)
- [ ] "What's wired" block: personality, N-stage CRM pipeline, hours-summary, intake-special-note, chatbot mention, email status
- [ ] "What you can prompt next" block: 5 agency-meaningful examples
- [ ] "Tier ladder (you're on Free)" with Free / Growth / Scale unlocks
- [ ] "Forward your client this admin link when ready. Or stay here and iterate." closer

- [ ] **Step 4: Verify structural assertions in Vercel logs**

```bash
vercel logs --since 5m --yes --cwd packages/crm 2>&1 | grep -E "v2_workspace_completed|v2_auto_chatbot_failed|v2_workspace_create_succeeded|workspace_output_contract" | head -20
```

Expected:
- `v2_workspace_completed` event present
- NO `v2_auto_chatbot_failed` event
- `v2_workspace_create_succeeded` (existing, unchanged)
- `workspace_output_contract status: "pass"` (regression check vs. prior spec's fix)

- [ ] **Step 5: Verify the agent row exists**

If you have DB access (drizzle-studio or psql), confirm exactly one `agents` row exists for the workspace with `archetype = 'website-chatbot'`:

```sql
SELECT id, name, archetype, status FROM agents
WHERE org_id = '<workspace_id>' AND archetype = 'website-chatbot';
```
Expected: exactly one row, `status = 'draft'` or `'test'`.

If you can't directly access the DB, this is implicitly verified by the embed snippet appearing in the summary (Step 3) — if the agent didn't get created, the soft-fail branch would have fired and the "scaffold pending" message would show instead.

### Task 9: 24h soak

**Files:**
- None (operational)

- [ ] **Step 1: Monitor Vercel logs for 24h**

```bash
vercel logs --since 24h --yes --cwd packages/crm 2>&1 | \
  grep -E "v2_auto_chatbot_failed|workspace_output_contract status" | head -30
```

Expected:
- Zero `v2_auto_chatbot_failed` events (any that fire are real bugs to triage)
- `workspace_output_contract status` should remain `pass` for every new workspace
- No regression in `enhance_blocks_succeeded` rate

- [ ] **Step 2: Spot-check operator response variety**

In a fresh Claude Code session, run the smoke prompt for two different verticals to confirm the vertical-aware intake_special_note + hours_summary work correctly:

```
create workspace for https://<a-dental-or-other-non-emergency-vertical-site>
```

Verify:
- `intake_special_note` reads `"structured lead-qualification"` (not `"emergency-line fallback"`) for non-emergency verticals
- `hours_summary` reads something like "Mon-Fri 9-5" for dental, not the HVAC default
- All other sections still surface correctly

- [ ] **Step 3: If any regression surfaces, revert the merge**

```bash
cd C:/Users/maxim/CascadeProjects/Seldon\ Frame/.claude/worktrees/seo-marketing-schema
git log --oneline -3
git revert -m 1 <merge-sha>
git push origin main
# Also: npm deprecate @seldonframe/mcp@1.53.0 "rolled back, see incident"
```

---

## Definition of done

- [ ] All unit tests pass (`pnpm test:unit`): `format-hours.spec.ts` is green
- [ ] Manual smoke checklist from Task 8 Step 3 is 100% green for an HVAC workspace
- [ ] No `v2_auto_chatbot_failed` events in production logs for 24h
- [ ] `workspace_output_contract status: "pass"` continues to hold (no regression from prior spec)
- [ ] Exactly one `agents` row per workspace with `archetype = 'website-chatbot'`
- [ ] `@seldonframe/mcp@1.53.0` published to npm + MCP Registry
- [ ] Vercel-deployed snapshot endpoint returns the four new fields when queried directly

---

## Self-review notes

1. **Spec coverage:**
   - §Components 5a (v2/complete auto-chatbot) → Task 2
   - §Components 5b (snapshot endpoint additions) → Task 3
   - §Components 5c (summarizeWeeklyHours helper) → Task 1
   - §Components 5d (finalize_workspace handler rewrite) → Task 4
   - §"Summary string" verbatim template → Task 4 Step 4 reproduces it line-for-line
   - §"Branching rules" → Task 4 Step 4 implements all three (chatbot null, paid tier, scale tier)
   - §Variable sourcing table → Task 4 Step 4 reads from the snapshot fields added in Task 3
   - §"Testing" §"Unit: format-hours.spec.ts" → Task 1 Step 1 has 8 tests covering all the spec's listed cases plus 2 extra edge cases (single day, two adjacent runs)
   - §"Migration / rollout" 10 steps → Tasks 1-9 map to them with the version bump (Task 5) + publish (Task 7) split out
   - §"Definition of done" → mirrored above

2. **Placeholder scan:**
   - Task 4 Step 1 has an "Alternative: omit `duration`" recommendation that's followed in Step 4 — not a placeholder, an explicit design call (the spec's `{duration}` variable is dropped to avoid showing the wrong-duration value). Self-documented in the step.
   - Task 2 Step 3 has a "Verify at task time by reading createAgent" note about the embed URL format. Honest unknown flagged for the implementer; not a TBD.
   - No `TODO`/`later`/`handle edge cases`/`similar to Task N` patterns.

3. **Type consistency:**
   - `summarizeWeeklyHours` defined in Task 1, used in Task 3 with matching imports
   - `WeeklyHours` type exported from `format-hours.ts` (Task 1) and re-imported in Task 3
   - `buildTierUpsell` signature matches existing helper (verified from codebase grep)
   - `createAgent` input/output shape matches `lib/agents/store.ts` (verified)
   - Field names align: `chatbot_agent_id` / `chatbot_embed_url` / `chatbot_embed_snippet` consistent in v2/complete response → snapshot → MCP handler → summary → return shape

## Out of scope

(Mirror of spec §"Out of scope"; not addressed in this plan.)

1. Real billing-state read (`currentTier` stays `"free"` in `buildTierUpsell` invocation).
2. Vertical-aware iteration menu (the 5 examples are the same for every vertical).
3. Default landing-page visual quality (separate spec).
4. `customize_block` response design (only finalize_workspace touched).
5. Mid-creation progress narration during `persist_block`.
6. Live chatbot publishing flow.
7. Soul-derived FAQ population.
8. Old "Optional upgrades" prompts (motion-preset, DESIGN.md, handoff-bundle) — still callable as tools; just removed from the summary's `next_steps_available`.
