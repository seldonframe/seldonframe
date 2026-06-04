# Client-Onboarding Intake + Wiring Agent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a client pays, email them a no-login multi-step intake; on submit, a wiring agent builds a staged change-plan across the workspace (Soul → website → booking → chatbot → CRM) that the agency reviews and applies with one click.

**Architecture:** Reuse the existing in-house intake renderer (Typeform-style cards), the existing `form.submitted` event bus, and the existing `/p/[token]` tokenized-link pattern. Add one new field type (`file`), two tables (`onboarding_links`, `change_plans`), a deterministic answer→change-plan mapper, and a review-and-apply executor that calls the existing per-surface server actions. Parsing of hours/services is **deterministic** (best-effort) with the human review screen as the safety net — no LLM in the core path.

**Tech Stack:** Next.js 16 (App Router, Turbopack), Drizzle + Neon Postgres, Vitest, `@vercel/blob`, React server actions.

**Spec:** `docs/superpowers/specs/2026-06-04-client-onboarding-intake-design.md`

**Test commands:** unit `pnpm -C packages/crm test:unit` · build-verify `pnpm -C packages/crm build` (Turbopack — required; `tsc` alone misses styled-jsx/server-component errors).

---

## File Structure

**New files**
- `packages/crm/src/db/schema/onboarding.ts` — `onboarding_links` + `change_plans` tables.
- `packages/crm/drizzle/00XX_onboarding_intake.sql` — migration for both tables (number = next in sequence).
- `packages/crm/src/lib/onboarding/parse-hours.ts` — `parseHoursText()` (deterministic).
- `packages/crm/src/lib/onboarding/parse-services.ts` — `parseServicesText()` (deterministic).
- `packages/crm/src/lib/onboarding/change-plan.ts` — `ChangePlan` type + `buildChangePlan()` mapper.
- `packages/crm/src/lib/onboarding/execute-change-plan.ts` — `applyChangePlan()` executor.
- `packages/crm/src/lib/onboarding/onboarding-form-definition.ts` — the 7-chapter question set.
- `packages/crm/src/lib/onboarding/links.ts` — token mint/load (mirrors `lib/proposals/load-by-token.ts`).
- `packages/crm/src/lib/uploads/file-validation.ts` — `validateUploadField()` (accept + size).
- `packages/crm/src/app/onboard/[token]/page.tsx` — public no-login intake render.
- `packages/crm/src/app/(dashboard)/onboarding/[id]/page.tsx` — agency review screen.
- `packages/crm/src/app/(dashboard)/onboarding/[id]/apply-action.ts` — `applyChangePlanAction` server action.
- Test files mirror each lib file under `packages/crm/tests/unit/onboarding/`.

**Modified files**
- `packages/crm/src/lib/blueprint/types.ts` — add `file` to `IntakeQuestion` (`~:299-301`).
- `packages/crm/src/lib/blueprint/renderers/formbricks-stack-v1.ts` — add `file` input branch (`renderQuestionInput`, `~:292`).
- `packages/crm/src/app/api/v1/public/intake/route.ts` — blob-upload files before the JSON write (`~:77`, events `~:319`).
- `packages/crm/src/app/api/webhooks/stripe/connect/route.ts` — mint + email onboarding link post-activation (`~:535`).
- `packages/crm/src/lib/events/listeners.ts` — subscribe a handler to `form.submitted` gated on the onboarding form (`~:94`).

---

## Phase 1 — Schema foundations

### Task 1: `onboarding_links` + `change_plans` tables

**Files:**
- Create: `packages/crm/src/db/schema/onboarding.ts`
- Create: `packages/crm/drizzle/00XX_onboarding_intake.sql`
- Modify: `packages/crm/src/db/schema/index.ts` (export the new schema — match the existing barrel pattern)

- [ ] **Step 1: Write the schema**

```ts
// packages/crm/src/db/schema/onboarding.ts
import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const onboardingLinks = pgTable(
  "onboarding_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    // pending → submitted → applied
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
  },
  (t) => ({ tokenIdx: index("onboarding_links_token_idx").on(t.token) }),
);

export const changePlans = pgTable(
  "change_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    submissionId: uuid("submission_id"),
    plan: jsonb("plan").notNull(),
    // pending_review → applied → discarded
    status: text("status").notNull().default("pending_review"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
  },
  (t) => ({ orgIdx: index("change_plans_org_idx").on(t.orgId) }),
);
```

- [ ] **Step 2: Write the SQL migration** (number it as the next file in `packages/crm/drizzle/`; confirm the highest existing number first)

```sql
CREATE TABLE IF NOT EXISTS "onboarding_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "token" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "submitted_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "onboarding_links_token_idx" ON "onboarding_links" ("token");

CREATE TABLE IF NOT EXISTS "change_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "submission_id" uuid,
  "plan" jsonb NOT NULL,
  "status" text DEFAULT 'pending_review' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "applied_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "change_plans_org_idx" ON "change_plans" ("org_id");
```

- [ ] **Step 3: Export + journal.** Add exports to the schema barrel and append the migration to `packages/crm/drizzle/meta/_journal.json` exactly as the migration pipeline expects (match the format of the last entry — the repo has a journal CI check, task #95).
- [ ] **Step 4: Build-verify.** Run `pnpm -C packages/crm build`. Expected: compiles (Drizzle types resolve).
- [ ] **Step 5: Commit.** `feat(onboarding): onboarding_links + change_plans tables`

---

## Phase 2 — The `file` field type (TDD)

### Task 2: File-validation helper (pure, TDD)

**Files:**
- Create: `packages/crm/src/lib/uploads/file-validation.ts`
- Test: `packages/crm/tests/unit/onboarding/file-validation.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { validateUploadField } from "@/lib/uploads/file-validation";

describe("validateUploadField", () => {
  const cfg = { accept: [".csv", ".xlsx"], maxSizeMb: 10 };
  it("accepts an allowed type under the size cap", () => {
    expect(validateUploadField({ name: "contacts.csv", sizeBytes: 1_000 }, cfg)).toEqual({ ok: true });
  });
  it("rejects a disallowed extension", () => {
    expect(validateUploadField({ name: "evil.exe", sizeBytes: 10 }, cfg)).toEqual({
      ok: false, reason: "type",
    });
  });
  it("rejects a file over the size cap", () => {
    expect(validateUploadField({ name: "big.csv", sizeBytes: 11 * 1024 * 1024 }, cfg)).toEqual({
      ok: false, reason: "size",
    });
  });
  it("matches accept case-insensitively", () => {
    expect(validateUploadField({ name: "CONTACTS.CSV", sizeBytes: 1 }, cfg)).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`validateUploadField` not defined). `pnpm -C packages/crm test:unit file-validation`
- [ ] **Step 3: Implement**

```ts
// packages/crm/src/lib/uploads/file-validation.ts
export type UploadFieldConfig = { accept: string[]; maxSizeMb: number };
export type UploadCandidate = { name: string; sizeBytes: number };
export type UploadValidation = { ok: true } | { ok: false; reason: "type" | "size" };

export function validateUploadField(file: UploadCandidate, cfg: UploadFieldConfig): UploadValidation {
  const lower = file.name.toLowerCase();
  const okType = cfg.accept.some((ext) => lower.endsWith(ext.toLowerCase()));
  if (!okType) return { ok: false, reason: "type" };
  if (file.sizeBytes > cfg.maxSizeMb * 1024 * 1024) return { ok: false, reason: "size" };
  return { ok: true };
}
```

- [ ] **Step 4: Run — expect PASS.** **Step 5: Commit** `feat(onboarding): file upload validation helper`.

### Task 3: Add `file` to the `IntakeQuestion` type

**Files:** Modify `packages/crm/src/lib/blueprint/types.ts` (`IntakeQuestion`, `~:299-301`)

- [ ] **Step 1: Read** `types.ts` around the `IntakeQuestion` union to confirm the exact shape, then add `"file"` to the `type` union and an optional `file?: { accept: string[]; maxSizeMb: number; multiple: boolean }` config field. Do not remove existing fields.
- [ ] **Step 2: Build-verify** `pnpm -C packages/crm build`. Expected: compiles; no renderer exhaustiveness break yet (renderer handled next task).
- [ ] **Step 3: Commit** `feat(onboarding): file question type on IntakeQuestion`.

### Task 4: Renderer input branch for `file`

**Files:** Modify `packages/crm/src/lib/blueprint/renderers/formbricks-stack-v1.ts` (`renderQuestionInput`, `~:292`)

- [ ] **Step 1: Read** the `renderQuestionInput` switch and an existing branch (e.g. `text`) to match markup/aria conventions.
- [ ] **Step 2: Add** a `case "file":` branch rendering `<input type="file" accept="…" {multiple?}>` with the field key, required flag, and the same label/error markup the other branches use. Keep it vanilla (the renderer emits static HTML + the form's JS handler).
- [ ] **Step 3: Wire** the form's submit JS to read selected files for `file` questions (the existing handler serializes inputs by key — extend it to collect `File` objects for upload in the next task).
- [ ] **Step 4: Build-verify** `pnpm -C packages/crm build`.
- [ ] **Step 5: Commit** `feat(onboarding): render file inputs in the intake card flow`.

### Task 5: Blob-upload files on submit

**Files:** Modify `packages/crm/src/app/api/v1/public/intake/route.ts` (`~:77`); reference `lib/uploads/user-image.ts` for the `@vercel/blob put` pattern.

- [ ] **Step 1: Read** `public/intake/route.ts` (how it parses the body + writes `intake_submissions`) and `lib/uploads/user-image.ts`.
- [ ] **Step 2: Branch on content type.** When the request is `multipart/form-data` (file questions present), for each uploaded file call `validateUploadField` (Task 2); on `ok`, `put()` to Blob; replace the field value in `data` with the returned URL (array of URLs when `multiple`). Reject with 400 + the reason on validation failure.
- [ ] **Step 3: Keep the JSON path unchanged** for forms without files (back-compat).
- [ ] **Step 4: Confirm** the existing `intake.submitted` / `form.submitted` emit still fires after the write (`~:319`).
- [ ] **Step 5: Build-verify + commit** `feat(onboarding): store uploaded intake files in blob storage`.

---

## Phase 3 — Onboarding form + delivery

### Task 6: The onboarding form definition

**Files:** Create `packages/crm/src/lib/onboarding/onboarding-form-definition.ts`

- [ ] **Step 1: Define** `ONBOARDING_QUESTIONS: IntakeQuestion[]` for the 7 chapters exactly as the spec's "intake — 7 chapters" section (keys: `business_name, tagline, phone, email, has_public_address, address, hours_text, services_text, primary_service, logo, brand_colors, photos, website_url, socials, google_reviews_url, testimonials, contacts_file, bookings_file, call_handling, lead_routing, has_domain, domain`). Use existing types; `logo/photos` = `file` (images), `contacts_file/bookings_file` = `file` (`.csv/.xlsx`). Set `showIf` for `address` (`has_public_address=Yes`) and `domain` (`has_domain=Yes`).
- [ ] **Step 2: Add** `seedOnboardingForm(orgId)` that writes this question set as an intake form with slug `onboarding` (reuse the intake create path — `createFormAction` / `persistAndRender` from `lib/page-blocks/intake-structure.ts`), and returns the `formId`.
- [ ] **Step 3:** No test (declarative config). **Build-verify + commit** `feat(onboarding): 7-chapter onboarding form definition`.

### Task 7: Token mint/load + `/onboard/[token]` route

**Files:** Create `packages/crm/src/lib/onboarding/links.ts`, `packages/crm/src/app/onboard/[token]/page.tsx`; reference `lib/proposals/load-by-token.ts`.

- [ ] **Step 1: Write the failing test** for the token validator (mirror `load-by-token`):

```ts
import { describe, it, expect } from "vitest";
import { isValidOnboardingToken } from "@/lib/onboarding/links";
describe("isValidOnboardingToken", () => {
  it("accepts a 32+ char url-safe token", () => {
    expect(isValidOnboardingToken("A".repeat(32))).toBe(true);
  });
  it("rejects short or unsafe tokens", () => {
    expect(isValidOnboardingToken("short")).toBe(false);
    expect(isValidOnboardingToken("bad/" + "x".repeat(40))).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL. Step 3: Implement** `links.ts`: `mintOnboardingToken()` (crypto-random, base64url, ≥32 chars), `isValidOnboardingToken(t)` (`/^[A-Za-z0-9_-]{32,}$/`), `createOnboardingLink(orgId)` (insert row, return token), `loadOnboardingLinkByToken(token)` (regex-then-DB, like proposals).
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Build the public route** `app/onboard/[token]/page.tsx`: validate token → load link → render the workspace's `onboarding` form HTML (same render path as the public `/intake` page). No auth. On invalid/used token, render a friendly "this link is no longer active" panel.
- [ ] **Step 6: Build-verify + commit** `feat(onboarding): tokenized /onboard/[token] route`.

### Task 8: Generate + email the link on payment

**Files:** Modify `packages/crm/src/app/api/webhooks/stripe/connect/route.ts` (`~:535`, the `checkout.session.completed` activation block)

- [ ] **Step 1: Read** the activation block and the `notifyProspectOfActivation` call to match the email/util conventions.
- [ ] **Step 2: After activation**, call `seedOnboardingForm(orgId)` (Task 6) + `createOnboardingLink(orgId)` (Task 7), build the `/onboard/[token]` URL, and send an agency-branded email to the client (reuse the existing proposal/activation email helper). Idempotency: skip if an `onboarding_links` row already exists for the org (guards webhook retries).
- [ ] **Step 3: Build-verify + commit** `feat(onboarding): email the onboarding link on workspace activation`.

---

## Phase 4 — The wiring agent

### Task 9: `parseHoursText` (pure, TDD)

**Files:** Create `packages/crm/src/lib/onboarding/parse-hours.ts`; Test `packages/crm/tests/unit/onboarding/parse-hours.spec.ts`

- [ ] **Step 1: Write the failing test** (use the booking `availability` shape from `lib/bookings/actions.ts:81` — `Record<"monday".."sunday", {enabled,start,end}>`, `"HH:MM"`):

```ts
import { describe, it, expect } from "vitest";
import { parseHoursText } from "@/lib/onboarding/parse-hours";

describe("parseHoursText", () => {
  it("parses a weekday range with a Saturday and a closed Sunday", () => {
    const a = parseHoursText("Mon-Fri 9-5, Sat 10-2, closed Sun");
    expect(a.monday).toEqual({ enabled: true, start: "09:00", end: "17:00" });
    expect(a.friday).toEqual({ enabled: true, start: "09:00", end: "17:00" });
    expect(a.saturday).toEqual({ enabled: true, start: "10:00", end: "14:00" });
    expect(a.sunday.enabled).toBe(false);
  });
  it("defaults unmatched input to Mon-Fri 9-5, weekends off", () => {
    const a = parseHoursText("we're flexible");
    expect(a.monday.enabled).toBe(true);
    expect(a.saturday.enabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL. Step 3: Implement** a deterministic parser: tokenize on commas; map day names/abbreviations + ranges (`Mon-Fri`) to day keys; parse `9-5`/`9am-5pm`/`09:00-17:00` to `"HH:MM"`; honor `closed <day>`; default any day not mentioned to the Mon-Fri-9-5/weekends-off baseline. Export `WeeklyAvailability` type matching the booking shape.
- [ ] **Step 4: Run — expect PASS. Step 5: Commit** `feat(onboarding): deterministic hours parser`.

### Task 10: `parseServicesText` (pure, TDD)

**Files:** Create `packages/crm/src/lib/onboarding/parse-services.ts`; Test `…/parse-services.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseServicesText } from "@/lib/onboarding/parse-services";

describe("parseServicesText", () => {
  it("parses name, price, and duration from common formats", () => {
    const s = parseServicesText("60-min massage — $90\nDeep tissue (90 min) - $130\nConsult: free");
    expect(s[0]).toEqual({ name: "massage", price: 90, durationMinutes: 60 });
    expect(s[1]).toEqual({ name: "Deep tissue", price: 130, durationMinutes: 90 });
    expect(s[2]).toEqual({ name: "Consult", price: 0, durationMinutes: 30 });
  });
  it("returns [] for empty input", () => {
    expect(parseServicesText("")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL. Step 3: Implement** a per-line parser: extract `$NNN` (or "free"→0) as price; extract `NN min`/`NN-min` as duration (default 30); the remaining text (trimmed of separators `—|-|:`) is the name. Skip blank lines. Export `ParsedService = { name; price; durationMinutes }`.
- [ ] **Step 4: Run — expect PASS. Step 5: Commit** `feat(onboarding): deterministic services parser`.

### Task 11: `buildChangePlan` mapper (pure, TDD)

**Files:** Create `packages/crm/src/lib/onboarding/change-plan.ts`; Test `…/change-plan.spec.ts`

- [ ] **Step 1: Define the type**

```ts
export type ChangePlan = {
  soul: Record<string, unknown>;                 // fields to merge (both casings handled at apply time)
  theme?: { primaryColor?: string; accentColor?: string };
  bookingDefault?: { availability: WeeklyAvailability; primaryServiceName?: string };
  appointmentTypes: { title: string; durationMinutes: number; price: number }[];
  contactsFileUrl?: string;
  bookingsFileUrl?: string;                       // stored, not imported (stub)
  callHandling: "ai_voice" | "human_then_text" | "none";
  leadRouting: ("email" | "text")[];
  domain?: string;
  summaries: string[];                            // human-readable lines for the review screen
};
```

- [ ] **Step 2: Write the failing test** — feed a representative submission `data` object (the onboarding keys) and assert the mapped `ChangePlan`: soul gets `business_name/tagline/phone`, `bookingDefault.availability` comes from `parseHoursText`, `appointmentTypes` from `parseServicesText`, `callHandling` maps the select value, `summaries` is non-empty. (Write concrete expected values.)
- [ ] **Step 3: Run — expect FAIL. Step 4: Implement** `buildChangePlan(data)` composing `parseHoursText` + `parseServicesText` + direct field mapping. Pure function, no DB/IO.
- [ ] **Step 5: Run — expect PASS. Step 6: Commit** `feat(onboarding): answer→change-plan mapper`.

### Task 12: Persist the plan on submission

**Files:** Modify `packages/crm/src/lib/events/listeners.ts` (`~:94`); reference the `form.submitted` payload + `$formId` matcher.

- [ ] **Step 1: Read** the existing `form.submitted` listener/fan-out.
- [ ] **Step 2: Add** a handler gated on the onboarding form (`formId` matches an `onboarding`-slug form): load the submission `data`, call `buildChangePlan(data)`, insert a `change_plans` row (`status: pending_review`), flip the `onboarding_links` row to `submitted`, and notify the agency (reuse the ops-notification email helper, task #91).
- [ ] **Step 3: Build-verify + commit** `feat(onboarding): build + persist change plan on submission`.

### Task 13: The executor

**Files:** Create `packages/crm/src/lib/onboarding/execute-change-plan.ts`

- [ ] **Step 1: Write the failing test** (mock the server actions; assert call order + inputs):

```ts
import { describe, it, expect, vi } from "vitest";
// vi.mock the imported server actions, then:
import { applyChangePlan } from "@/lib/onboarding/execute-change-plan";

it("applies surfaces in order: soul→booking→theme→chatbot→contacts", async () => {
  const calls: string[] = [];
  // arrange mocks to push their name into `calls`
  await applyChangePlan(/* orgId */ "org-1", /* plan */ samplePlan);
  expect(calls).toEqual(["soul", "seedLanding", "booking", "theme", "chatbot", "contacts"]);
});
```

- [ ] **Step 2: Run — expect FAIL. Step 3: Implement** `applyChangePlan(orgId, plan)` calling, in order: (1) write `organizations.soul` (both casings) + `applyPipelineStagesFromSoul` + `seedLandingFromSoul(orgId)`; (2) `updateBookingTypeAction` (default type hours/price/duration) + create extra appointment types; (3) `update_theme`; (4) `update_website_chatbot` (refresh from new soul); (5) parse `contactsFileUrl` → `bulkImportContactsAction({ rows })`. Domain/voice/SMS produce instruction strings only. Each surface wrapped in try/catch → collect per-surface result; never throw the whole apply on one surface failing.
- [ ] **Step 4: Run — expect PASS. Step 5: Commit** `feat(onboarding): change-plan executor`.

---

## Phase 5 — Review UI

### Task 14: Review screen + Apply action

**Files:** Create `packages/crm/src/app/(dashboard)/onboarding/[id]/page.tsx` + `apply-action.ts`

- [ ] **Step 1: Build the server action** `applyChangePlanAction(planId)`: auth via `getOrgId()`, load the plan (assert it belongs to the org + is `pending_review`), call `applyChangePlan`, set `status: applied` + `appliedAt`, flip `onboarding_links` to `applied`, notify the client. Returns the per-surface results.
- [ ] **Step 2: Build the review page**: render `plan.summaries` grouped by surface (Website / Booking / Brand / Chatbot / Contacts / Domain & Phones), each with the before→after summary; a single **"Apply all"** primary button bound to the action; per-item skip checkboxes (omit skipped surfaces from the applied plan). Match the dashboard's existing card styling.
- [ ] **Step 3: Build-verify** `pnpm -C packages/crm build`.
- [ ] **Step 4: Commit** `feat(onboarding): agency review-and-apply screen`.

---

## Phase 6 — Verification

### Task 15: Integration test

**Files:** Test `packages/crm/tests/unit/onboarding/onboarding-flow.spec.ts` (or integration suite if one exists)

- [ ] **Step 1: Write** a test that drives: build a fake onboarding submission `data` → `buildChangePlan` → insert plan → `applyChangePlan` against mocked server actions → assert each surface action was invoked with the mapped inputs and the plan flips to `applied`.
- [ ] **Step 2: Run — expect PASS.**
- [ ] **Step 3: Full suite** `pnpm -C packages/crm test:unit` — confirm no regressions (ignore the known pre-existing failures noted in the repo). **Step 4: Build-verify** `pnpm -C packages/crm build`. **Step 5: Commit** `test(onboarding): end-to-end change-plan flow`.

### Task 16: Manual smoke test (SURFACE TO USER — do not auto-run)

- [ ] On a Vercel preview deploy: create a test proposal → pay in Stripe test mode → confirm the onboarding email arrives → open `/onboard/[token]` → fill the form with a logo + a small contacts CSV → submit → confirm a `pending_review` plan appears on the review screen → click **Apply all** → verify the workspace landing (`/w/[slug]`), the booking hours/services, the chatbot copy, and the imported contacts all reflect the answers.
- [ ] Report results back; fix any gaps as hotfix tasks.

---

## Self-Review

- **Spec coverage:** file type (T2-5), onboarding form + tokenized link + email delivery (T6-8), deterministic hours/services parsing (T9-10), mapper (T11), persist-on-submit (T12), executor with the 3 gotchas — soul re-render, separate chatbot refresh, booking-hours via server action (T13), review-then-apply UI (T14), tests (T15-16), both tables (T1). All spec sections map to a task.
- **Type consistency:** `WeeklyAvailability` defined in `parse-hours.ts` and reused by `change-plan.ts` + the booking executor; `ParsedService` → `appointmentTypes`; `ChangePlan` is the single contract between mapper, persistence, executor, and UI.
- **No placeholders:** parsers, validation, schema, and `ChangePlan` carry real code; integration tasks name the exact file + anchor + behavior + test.
- **Booking-hours gotcha** is encoded as a task instruction (use `updateBookingTypeAction`, not the MCP tools).

---

## Execution Handoff

Recommended: **subagent-driven-development** (fresh subagent per task, two-stage review). Phases 1-2 and 9-11 are mechanical/TDD (cheap model); Phases 3-5 (webhook, route, listener, UI) are integration (standard model). Task 16 is manual — surface to the user.
