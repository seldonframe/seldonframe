# Speed-to-Lead Conversion Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bottom lead-capture section to the R1 landing framework (name · phone · need) that creates a CRM contact, texts the lead a booking link (gracefully skipping when the workspace has no Twilio), and emails the operator — plus make the mobile sticky "Text" button work and wire the 9 Seldon Studio demos' Call + Text to the 839 AI line.

**Architecture:** A `"use server"` action (`lib/landing/lead-form-action.ts`) mirrors the existing public-intake route (`assertWritable` → `enforceContactLimit` → find-or-create contact by phone → emit `contact.created` + `form.submitted` → SMS-the-lead in try/catch → email-the-operator). Because the unit-test runner is `node --test --import tsx` with **no module mocking** (the repo's idiom is dependency injection — see `src/lib/events/listeners-testable.ts`), the action is a thin wrapper over a pure, fully-injectable core `submitLeadFormWithDeps(input, deps)`; the test injects fakes for every DB/SMS/email/event boundary so no Postgres or Twilio is touched. A new `"use client"` section component (`components/landing-r1/sections/lead-form.tsx`) renders the form with `useTransition` and imports the action directly (mirrors `components/bookings/public-booking-form.tsx`); its confirmation-copy decision is extracted to a pure exported helper that is unit-tested (the visual shell, like every other `landing-r1` component, is verified manually). A new top-level optional `leadForm` field on `R1LandingPayload` gates the section; it round-trips through `loadLandingPayload`'s raw passthrough with no loader change. The two `(public)` pages render `<LeadFormSection>` after `<Faq>`. The demo telephony + `leadForm` enablement is a Neon data backfill (SQL, manual verification).

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), React 19, TypeScript, Drizzle ORM (Postgres/Neon), `node:test` + `tsx` for unit tests, styled-jsx for the section, Resend (operator email via the existing ops-notification path), Twilio (lead SMS via `sendSmsFromApi`).

---

## File Structure

| File | New / Modified | Responsibility |
| --- | --- | --- |
| `packages/crm/src/lib/landing/r1-payload-prompt.ts` | **Modified** | Add the top-level optional `leadForm` field (and its `R1LeadFormSection` type) to `R1LandingPayload`. No generator change needed for sticky `smsHref` — it is already emitted by the prompt for phone-first archetypes (lines ~292–296); the demo backfill handles existing rows. |
| `packages/crm/src/lib/landing/lead-form-action.ts` | **New** | `"use server"`. Exports `submitLeadFormAction` (the action the client calls) + `submitLeadFormWithDeps` (pure, injectable core) + the `LeadFormActionResult` / `LeadFormDeps` types + the default deps factory. Mirrors the public-intake route: dedup → resolve org → `assertWritable` → `enforceContactLimit` → find-or-create contact by phone → emit `contact.created`/`form.submitted` → SMS lead (try/catch) → email operator. |
| `packages/crm/tests/unit/landing/lead-form-action.spec.ts` | **New** | node:test unit tests for `submitLeadFormWithDeps` with injected fakes (no DB/Twilio): create new contact; upsert existing-by-phone (backfill name, no clobber, `need` into customFields); emits `contact.created` (create only) + `form.submitted` (always); SMS graceful-skip when `sendSms` throws; suppressed → `smsSent:false`; contact-limit error surfaced. |
| `packages/crm/src/lib/notifications/ops-notifications.ts` | **Modified** | Add `sendNewLeadAlert(params, deps)` (+ `NewLeadAlertParams`) — mirrors `sendNewSignupAlert` exactly (same `dispatch`, `escapeHtml`, recipient/from/apiKey resolution, injectable `fetcher`). The lead-form action calls this for the operator email. |
| `packages/crm/tests/unit/notifications/ops-new-lead-alert.spec.ts` | **New** | node:test unit tests for `sendNewLeadAlert` with an injected `fetcher`: posts to Resend with the right subject + recipient; no-ops (no throw) when `apiKey` empty; never throws on a fetch rejection. |
| `packages/crm/src/components/landing-r1/sections/lead-form.tsx` | **New** | `"use client"`. The archetype-themed bottom section. Renders heading/subheading, Name · Phone · need (select from `needOptions`, else short text), submit (`useTransition`), TCPA consent line, and a success card. Imports `submitLeadFormAction` directly. Exports the pure helper `leadFormConfirmation({ name, smsSent, bookUrl })` for unit testing the confirm copy. |
| `packages/crm/tests/unit/landing/lead-form-confirmation.spec.tsx` | **New** | node:test unit tests for `leadFormConfirmation` (pure): SMS-sent copy includes the name + "texted"; no-SMS copy says "book instantly" and surfaces the book URL. (`.tsx` so it sits alongside the component import; no rendering.) |
| `packages/crm/src/app/(public)/w/[slug]/page.tsx` | **Modified** | Render `<LeadFormSection>` after `<Faq>`, before `<Footer>`, gated on `payload.leadForm?.enabled`. Pass `orgSlug={slug}`, `businessName`, `archetype`, `leadForm`. |
| `packages/crm/src/app/(public)/s/[orgSlug]/[...slug]/page.tsx` | **Modified** | Same insertion in the R-framework home branch (uses `orgSlug` + `r1Data.orgId`). |
| `packages/crm/src/components/landing-r1/chrome/sticky-mobile-bar.tsx` | **Modified** | Simplify the convoluted `resolvedSms` line so the Text button shows **only** when `smsHref` is a non-empty string, and uses that value verbatim. |
| `packages/crm/tests/unit/landing/sticky-mobile-bar-sms.spec.tsx` | **New** | node:test + `renderToString` (jsdom-free, the runner's documented pattern): Text button absent when `smsHref` omitted; present with the exact `sms:` href when provided. |
| Neon backfill (no repo file) | **Data** | Enable `leadForm` on the 8 R1 demos (set `blueprint_json -> 'payload' -> 'leadForm'`) and set the 839 line across the 9 demos' payload (Call/Text/footer/sticky). Lumière excluded (template renderer). Run via `mcp__neon__run_sql` against the production branch; manual verification query included. |

**Decomposition notes (DRY / YAGNI):**
- The action's testable core is split out (`submitLeadFormWithDeps`) **only** because the test runner can't mock `@/db` — this is exactly the pattern `listeners-testable.ts` uses. We do not over-abstract: the `"use server"` export is a 2-line wrapper.
- The operator email reuses the existing platform-level ops-notification machinery (`dispatch`/`escapeHtml`/`resolve*`) rather than the workspace email pipeline (`sendEmailFromApi`) — matching the spec's "no Twilio dependency / no per-workspace provider lookup" requirement and the precedent in `ops-notifications.ts`.
- No DB migration: `leadForm` lives inside the existing `landing_pages.blueprint_json` jsonb (`loadLandingPayload` returns `bjson["payload"]` verbatim), and the contact's `need` lives in the existing `contacts.custom_fields` jsonb.

---

## Task 1: Add the `leadForm` field to the R1 payload type

No behavior yet — a pure type addition so every later task can reference `payload.leadForm` and `R1LeadFormSection`. Type-only, so the "test" is `tsc`.

**Files:**
- Modify: `packages/crm/src/lib/landing/r1-payload-prompt.ts`

- [ ] **Step 1: Add the `R1LeadFormSection` type and wire it into `R1LandingPayload`**

In `packages/crm/src/lib/landing/r1-payload-prompt.ts`, immediately **after** the `R1StickySection` type (ends at the line `};` after `bookHref?: string;`, ~line 144) and **before** the `/** Full R1 landing payload … */` comment, insert:

```ts
/**
 * Speed-to-Lead bottom section. Optional + top-level. When `enabled`,
 * the two public R1 pages render <LeadFormSection> after <Faq>. All copy
 * fields are optional — the component supplies sensible defaults. Enabled
 * per workspace by setting blueprint_json.payload.leadForm in the DB; it
 * round-trips through loadLandingPayload's raw passthrough (no loader change).
 */
export type R1LeadFormSection = {
  enabled: boolean;
  /** Section heading. Default: "Get a fast callback". */
  heading?: string;
  /** Sub-line under the heading. Default: "Tell us what you need — we'll text you a time in minutes." */
  subheading?: string;
  /** Label for the third field. Default: "What do you need?". */
  needLabel?: string;
  /** When non-empty, the need field renders as a <select> of these options; otherwise a short text input. */
  needOptions?: string[];
  /** TCPA / consent line shown under the submit button. Default supplied by the component. */
  consentText?: string;
};
```

Then update the `R1LandingPayload` type (currently ends `sticky?: R1StickySection; };`) to add `leadForm`:

```ts
/** Full R1 landing payload — union of all section prop shapes. */
export type R1LandingPayload = {
  hero: R1HeroSection;
  services: R1ServicesSection;
  testimonials: R1TestimonialsSection;
  faq: R1FaqSection;
  footer: R1FooterSection;
  emergency?: R1EmergencySection;
  sticky?: R1StickySection;
  /** Speed-to-Lead bottom section (optional). */
  leadForm?: R1LeadFormSection;
};
```

- [ ] **Step 2: Verify the type compiles**

Run: `cd packages/crm && npx tsc --noEmit -p tsconfig.json`
Expected: PASS (no new errors). `R1LeadFormSection` is exported and `R1LandingPayload.leadForm` is available to importers.

- [ ] **Step 3: Commit**

```bash
git add packages/crm/src/lib/landing/r1-payload-prompt.ts
git commit -m "feat(landing): add optional leadForm field to R1LandingPayload"
```

---

## Task 2: Operator "new lead" email helper (TDD)

Add `sendNewLeadAlert` to the existing platform-level ops-notification module so the lead-form action can email the operator without any Twilio/workspace-provider dependency. It mirrors `sendNewSignupAlert` and is fully testable via the injectable `fetcher`.

**Files:**
- Modify: `packages/crm/src/lib/notifications/ops-notifications.ts`
- Test: `packages/crm/tests/unit/notifications/ops-new-lead-alert.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/crm/tests/unit/notifications/ops-new-lead-alert.spec.ts`:

```ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { sendNewLeadAlert } from "@/lib/notifications/ops-notifications";

// A fetch stub that records the single Resend call.
function makeFetcher(ok = true) {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    });
    return {
      ok,
      status: ok ? 200 : 500,
      text: async () => (ok ? "" : "boom"),
    } as Response;
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

describe("sendNewLeadAlert", () => {
  test("posts to Resend with a lead subject + the configured recipient", async () => {
    const { fetcher, calls } = makeFetcher();
    await sendNewLeadAlert(
      {
        businessName: "Maloney Plumbing",
        name: "Dana R.",
        phone: "+12095550144",
        need: "Burst pipe",
        orgSlug: "maloney-plumbing",
      },
      { fetcher, apiKey: "re_test", env: { OPS_NOTIFICATION_EMAIL: "ops@example.com" } },
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.resend.com/emails");
    assert.deepEqual(calls[0].body.to, ["ops@example.com"]);
    assert.match(String(calls[0].body.subject), /New lead/i);
    assert.match(String(calls[0].body.subject), /Dana R\./);
    // The need + phone ride in the body text.
    assert.match(String(calls[0].body.text), /Burst pipe/);
    assert.match(String(calls[0].body.text), /\+12095550144/);
  });

  test("no-ops (no throw, no fetch) when apiKey is empty", async () => {
    const { fetcher, calls } = makeFetcher();
    await sendNewLeadAlert(
      { businessName: "X", name: "Y", phone: "+1", need: "Z", orgSlug: "x" },
      { fetcher, apiKey: "", env: {} },
    );
    assert.equal(calls.length, 0);
  });

  test("never throws when the fetch rejects", async () => {
    const rejecting = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    await assert.doesNotReject(() =>
      sendNewLeadAlert(
        { businessName: "X", name: "Y", phone: "+1", need: "Z", orgSlug: "x" },
        { fetcher: rejecting, apiKey: "re_test", env: {} },
      ),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit`
Expected: FAIL — `sendNewLeadAlert` is not exported from `@/lib/notifications/ops-notifications` (TypeError / import error in the new spec).

- [ ] **Step 3: Write minimal implementation**

In `packages/crm/src/lib/notifications/ops-notifications.ts`, add the `NewLeadAlertParams` type next to the other `*Params` types (after `PaidConversionAlertParams`, ~line 65):

```ts
export type NewLeadAlertParams = {
  /** The SMB the lead reached out to (workspace name). */
  businessName: string;
  /** Lead's name as typed in the form. */
  name: string;
  /** Lead's phone (E.164 preferred, but rendered verbatim). */
  phone: string;
  /** What they need — the third form field. */
  need: string;
  /** Workspace slug, for a quick "which workspace" reference line. */
  orgSlug: string;
};
```

Then extend the `dispatch` event union to include the new event type. Change:

```ts
async function dispatch(params: {
  event: "new_signup" | "paid_conversion";
```

to:

```ts
async function dispatch(params: {
  event: "new_signup" | "paid_conversion" | "new_lead";
```

Finally, add the function at the end of the file (after `sendPaidConversionAlert`):

```ts
/**
 * Send the "new lead" alert to the operator. Fires from the public
 * lead-form action on every submission (create or upsert).
 *
 * Mirrors sendNewSignupAlert: platform-level send (one global recipient,
 * no per-workspace Resend lookup, no suppression, no DB write) so it has
 * NO Twilio/workspace dependency and works even on demos with no email
 * integration configured. Never throws — a Resend outage logs to stdout
 * but the lead-form submission still succeeds.
 */
export async function sendNewLeadAlert(
  params: NewLeadAlertParams,
  deps: OpsNotificationDeps = {},
): Promise<void> {
  const env = deps.env ?? process.env;
  const fetcher = deps.fetcher ?? globalThis.fetch;
  const apiKey = resolveApiKey(deps.apiKey, env);
  const to = resolveOpsNotificationRecipient(env);
  const from = resolveFromAddress(env);

  const subject = `New lead — ${params.name} · ${params.phone}`;

  const text = `New lead captured from the ${params.businessName} landing page.

Name: ${params.name}
Phone: ${params.phone}
Need: ${params.need}
Workspace: ${params.orgSlug}

Follow up fast — speed-to-lead wins the job.`;

  const safeBusiness = escapeHtml(params.businessName);
  const safeName = escapeHtml(params.name);
  const safePhone = escapeHtml(params.phone);
  const safeNeed = escapeHtml(params.need);
  const safeSlug = escapeHtml(params.orgSlug);

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#0b0b10;padding:20px 24px;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#9aa0a6;margin-bottom:6px;">${safeBusiness} · New lead</div>
          <div style="font-size:20px;font-weight:600;line-height:1.25;">${safeName} just reached out.</div>
        </td></tr>
        <tr><td style="padding:20px 24px;font-size:14px;line-height:1.6;color:#1a1a1f;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:4px 0;color:#6b7280;width:120px;">Name</td><td style="padding:4px 0;font-weight:500;">${safeName}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;">Phone</td><td style="padding:4px 0;font-weight:500;">${safePhone}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;">Need</td><td style="padding:4px 0;">${safeNeed}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;">Workspace</td><td style="padding:4px 0;font-family:monospace;font-size:13px;">${safeSlug}</td></tr>
          </table>
          <p style="margin:16px 0 0 0;font-size:13px;color:#6b7280;">Follow up fast — speed-to-lead wins the job.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await dispatch({
    event: "new_lead",
    to,
    from,
    subject,
    text,
    html,
    apiKey,
    fetcher,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit`
Expected: PASS — the 3 `sendNewLeadAlert` tests pass (and no existing test regresses).

- [ ] **Step 5: Commit**

```bash
git add packages/crm/src/lib/notifications/ops-notifications.ts packages/crm/tests/unit/notifications/ops-new-lead-alert.spec.ts
git commit -m "feat(notifications): add sendNewLeadAlert operator email"
```

---

## Task 3: Lead-form server action core (TDD)

The heart of the feature. Implement `submitLeadFormWithDeps` (pure, injectable) + the `"use server"` wrapper `submitLeadFormAction`. Tests inject fakes for every boundary — no DB, no Twilio.

**Files:**
- Create: `packages/crm/src/lib/landing/lead-form-action.ts`
- Test: `packages/crm/tests/unit/landing/lead-form-action.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/crm/tests/unit/landing/lead-form-action.spec.ts`:

```ts
import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  submitLeadFormWithDeps,
  type LeadFormDeps,
} from "@/lib/landing/lead-form-action";

// A fresh recording-fakes set per test. Defaults model the happy path
// for a brand-new contact in a Twilio-configured workspace.
function makeDeps(overrides: Partial<LeadFormDeps> = {}): {
  deps: LeadFormDeps;
  events: Array<{ type: string; data: Record<string, unknown> }>;
  emails: unknown[];
  smsCalls: Array<{ toNumber: string; body: string }>;
  inserts: Array<Record<string, unknown>>;
  updates: Array<{ id: string; patch: Record<string, unknown> }>;
} {
  const events: Array<{ type: string; data: Record<string, unknown> }> = [];
  const emails: unknown[] = [];
  const smsCalls: Array<{ toNumber: string; body: string }> = [];
  const inserts: Array<Record<string, unknown>> = [];
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];

  const deps: LeadFormDeps = {
    assertWritable: () => {},
    resolveOrgIdBySlug: async () => "org-1",
    enforceContactLimit: async () => ({ allowed: true, tier: "free" }),
    findContactByPhone: async () => null,
    getContactById: async () => null,
    createContact: async (values) => {
      inserts.push(values);
      return "contact-new";
    },
    updateContact: async (id, patch) => {
      updates.push({ id, patch });
    },
    emit: async (type, data) => {
      events.push({ type, data });
    },
    buildBookUrl: () => "https://maloney-plumbing.app.seldonframe.com/book",
    sendSms: async ({ toNumber, body }) => {
      smsCalls.push({ toNumber, body });
      return { suppressed: false };
    },
    sendOperatorEmail: async (p) => {
      emails.push(p);
    },
    getBusinessName: async () => "Maloney Plumbing",
    now: () => new Date("2026-06-14T12:00:00.000Z"),
    ...overrides,
  };
  return { deps, events, emails, smsCalls, inserts, updates };
}

const INPUT = {
  orgSlug: "maloney-plumbing",
  name: "Dana Reyes",
  phone: "(209) 555-0144",
  need: "Burst pipe under the sink",
};

describe("submitLeadFormWithDeps — new contact, Twilio configured", () => {
  test("creates a lead contact, texts the lead, emails the operator, returns ok+smsSent", async () => {
    const { deps, events, emails, smsCalls, inserts } = makeDeps();
    const result = await submitLeadFormWithDeps(INPUT, deps);

    assert.equal(result.ok, true);
    assert.equal(result.smsSent, true);
    assert.equal(result.bookUrl, "https://maloney-plumbing.app.seldonframe.com/book");

    // One contact created, status=lead, source=landing-leadform, need in customFields.
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].orgId, "org-1");
    assert.equal(inserts[0].status, "lead");
    assert.equal(inserts[0].source, "landing-leadform");
    assert.equal(inserts[0].firstName, "Dana");
    assert.equal(inserts[0].lastName, "Reyes");
    assert.deepEqual(inserts[0].customFields, { need: "Burst pipe under the sink" });

    // Both events emitted: contact.created (create) + form.submitted (always).
    const types = events.map((e) => e.type);
    assert.deepEqual(types, ["contact.created", "form.submitted"]);
    assert.deepEqual(events[0].data, { contactId: "contact-new" });
    assert.equal(events[1].data.contactId, "contact-new");
    assert.equal(events[1].data.formId, "landing-leadform");

    // Lead SMS sent to the normalized number, with the book URL in the body.
    assert.equal(smsCalls.length, 1);
    assert.equal(smsCalls[0].toNumber, "+12095550144");
    assert.match(smsCalls[0].body, /maloney-plumbing\.app\.seldonframe\.com\/book/);

    // Operator emailed once.
    assert.equal(emails.length, 1);
  });
});

describe("submitLeadFormWithDeps — existing contact by phone (upsert)", () => {
  test("links existing contact, backfills blank name only, no contact.created", async () => {
    const { deps, events, inserts, updates } = makeDeps({
      findContactByPhone: async () => "contact-existing",
      // Existing contact has no firstName/lastName → name backfills.
      getContactById: async () => ({ firstName: "", lastName: null }),
    });
    const result = await submitLeadFormWithDeps(INPUT, deps);

    assert.equal(result.ok, true);
    // No new insert.
    assert.equal(inserts.length, 0);
    // Name backfilled + need merged into customFields via update.
    assert.equal(updates.length, 1);
    assert.equal(updates[0].id, "contact-existing");
    assert.equal(updates[0].patch.firstName, "Dana");
    assert.equal(updates[0].patch.lastName, "Reyes");
    // Only form.submitted — contact.created is NOT emitted on upsert.
    assert.deepEqual(events.map((e) => e.type), ["form.submitted"]);
  });

  test("does NOT clobber an existing non-blank name", async () => {
    const { deps, updates } = makeDeps({
      findContactByPhone: async () => "contact-existing",
      getContactById: async () => ({ firstName: "Daniela", lastName: "Reyes-Cruz" }),
    });
    await submitLeadFormWithDeps(INPUT, deps);
    // name fields must be absent from the patch (we only set need-related fields).
    const patch = updates[0]?.patch ?? {};
    assert.equal(patch.firstName, undefined);
    assert.equal(patch.lastName, undefined);
  });
});

describe("submitLeadFormWithDeps — SMS graceful skip (no Twilio)", () => {
  test("sendSms throwing leaves contact + operator email intact, smsSent=false", async () => {
    const { deps, events, emails } = makeDeps({
      sendSms: async () => {
        throw new Error("Twilio fromNumber not configured for this workspace");
      },
    });
    const result = await submitLeadFormWithDeps(INPUT, deps);

    assert.equal(result.ok, true);
    assert.equal(result.smsSent, false);
    // Contact + form events still emitted, operator still emailed.
    assert.deepEqual(events.map((e) => e.type), ["contact.created", "form.submitted"]);
    assert.equal(emails.length, 1);
  });
});

describe("submitLeadFormWithDeps — suppressed number", () => {
  test("suppressed result yields smsSent=false without throwing", async () => {
    const { deps } = makeDeps({
      sendSms: async () => ({ suppressed: true }),
    });
    const result = await submitLeadFormWithDeps(INPUT, deps);
    assert.equal(result.ok, true);
    assert.equal(result.smsSent, false);
  });
});

describe("submitLeadFormWithDeps — contact-limit reached", () => {
  test("returns ok=false with the upgrade message; no contact, no SMS", async () => {
    const { deps, inserts, smsCalls, events } = makeDeps({
      enforceContactLimit: async () => ({
        allowed: false,
        tier: "free",
        reason: "contact_limit_reached",
        message: "You've reached 50 contacts on the Free plan. Upgrade to Growth to keep adding clients.",
        upgradeUrl: "/settings/billing",
        used: 50,
        limit: 50,
      }),
      // limit is checked only when the contact doesn't already exist.
      findContactByPhone: async () => null,
    });
    const result = await submitLeadFormWithDeps(INPUT, deps);

    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /Free plan|Upgrade/i);
    assert.equal(inserts.length, 0);
    assert.equal(smsCalls.length, 0);
    assert.deepEqual(events, []);
  });
});

describe("submitLeadFormWithDeps — validation + unknown org", () => {
  beforeEach(() => {});

  test("missing name/phone returns ok=false without side effects", async () => {
    const { deps, inserts } = makeDeps();
    const result = await submitLeadFormWithDeps(
      { orgSlug: "x", name: "  ", phone: "", need: "Z" },
      deps,
    );
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /name and phone/i);
    assert.equal(inserts.length, 0);
  });

  test("unknown org returns ok=false", async () => {
    const { deps } = makeDeps({ resolveOrgIdBySlug: async () => null });
    const result = await submitLeadFormWithDeps(INPUT, deps);
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /not found/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit`
Expected: FAIL — `@/lib/landing/lead-form-action` does not exist (module-not-found in the new spec).

- [ ] **Step 3: Write minimal implementation**

Create `packages/crm/src/lib/landing/lead-form-action.ts`:

```ts
"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, organizations } from "@/db/schema";
import { assertWritable as assertWritableImpl } from "@/lib/demo/server";
import { enforceContactLimit as enforceContactLimitImpl } from "@/lib/billing/limits";
import { emitSeldonEvent } from "@/lib/events/bus";
import { findContactByPhone as findContactByPhoneImpl } from "@/lib/sms/api";
import { sendSmsFromApi } from "@/lib/sms/api";
import { normalizePhone } from "@/lib/sms/suppression";
import { buildWorkspaceUrls } from "@/lib/billing/anonymous-workspace";
import { sendNewLeadAlert } from "@/lib/notifications/ops-notifications";
import type { LimitDecision } from "@/lib/billing/limits";

// ── Public contract ───────────────────────────────────────────────────────

export type LeadFormInput = {
  orgSlug: string;
  name: string;
  phone: string;
  need: string;
};

export type LeadFormActionResult = {
  ok: boolean;
  smsSent: boolean;
  bookUrl: string;
  /** Set only when ok=false — a friendly message the form surfaces inline. */
  error?: string;
};

// ── Injectable boundary (the repo's testable-deps idiom; see
//    src/lib/events/listeners-testable.ts). The "use server" action below
//    wires the production implementations; unit tests inject fakes so no
//    DB / Twilio / Resend is touched. ───────────────────────────────────────

export type LeadFormDeps = {
  assertWritable: () => void;
  resolveOrgIdBySlug: (slug: string) => Promise<string | null>;
  enforceContactLimit: (orgId: string) => Promise<LimitDecision>;
  findContactByPhone: (orgId: string, phone: string) => Promise<string | null>;
  getContactById: (
    orgId: string,
    contactId: string,
  ) => Promise<{ firstName: string | null; lastName: string | null } | null>;
  createContact: (values: {
    orgId: string;
    firstName: string;
    lastName: string | null;
    phone: string;
    status: "lead";
    source: "landing-leadform";
    customFields: Record<string, unknown>;
  }) => Promise<string>;
  updateContact: (
    contactId: string,
    patch: Record<string, unknown>,
  ) => Promise<void>;
  emit: (type: "contact.created" | "form.submitted", data: Record<string, unknown>) => Promise<void>;
  buildBookUrl: (slug: string, orgId: string) => string;
  sendSms: (params: {
    orgId: string;
    contactId: string;
    toNumber: string;
    body: string;
  }) => Promise<{ suppressed: boolean }>;
  sendOperatorEmail: (params: {
    businessName: string;
    name: string;
    phone: string;
    need: string;
    orgSlug: string;
  }) => Promise<void>;
  getBusinessName: (orgId: string) => Promise<string>;
  now: () => Date;
};

// ── In-memory idempotency (mirrors the public intake route). Dedup by
//    orgId+phone for a short window so a double-tap doesn't double-create
//    the contact or double-send the SMS. Lives for the lambda's lifetime. ──
const LEAD_IDEMPOTENCY_CACHE = new Map<string, number>();
const LEAD_IDEMPOTENCY_TTL_MS = 60_000;

function leadDedupSeen(key: string, now: number): boolean {
  for (const [k, expires] of LEAD_IDEMPOTENCY_CACHE) {
    if (expires < now) LEAD_IDEMPOTENCY_CACHE.delete(k);
  }
  const existing = LEAD_IDEMPOTENCY_CACHE.get(key);
  if (existing && existing > now) return true;
  LEAD_IDEMPOTENCY_CACHE.set(key, now + LEAD_IDEMPOTENCY_TTL_MS);
  return false;
}

/** Naive "first last" split — matches the public intake route's behavior. */
function splitName(full: string): { firstName: string; lastName: string | null } {
  const parts = full.trim().split(/\s+/);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
  };
}

/**
 * Pure, injectable core. Returns a result object; never throws for the
 * expected branches (limit/suppressed/no-Twilio/validation). Order mirrors
 * app/api/v1/public/intake/route.ts: dedup → resolve → assertWritable →
 * find-or-create → emit → SMS (try/catch) → operator email.
 */
export async function submitLeadFormWithDeps(
  input: LeadFormInput,
  deps: LeadFormDeps,
): Promise<LeadFormActionResult> {
  const name = input.name.trim();
  const phoneRaw = input.phone.trim();
  const need = input.need.trim();
  const orgSlug = input.orgSlug.trim();

  if (!name || !phoneRaw) {
    return { ok: false, smsSent: false, bookUrl: "", error: "Please enter your name and phone." };
  }

  const orgId = await deps.resolveOrgIdBySlug(orgSlug);
  if (!orgId) {
    return { ok: false, smsSent: false, bookUrl: "", error: "Workspace not found." };
  }

  // Demo-readonly guard (no-op in normal workspaces). Throws DEMO_BLOCK_MESSAGE
  // when NEXT_PUBLIC_DEMO_READONLY=true — surfaced to the form as a friendly error.
  try {
    deps.assertWritable();
  } catch (err) {
    return {
      ok: false,
      smsSent: false,
      bookUrl: "",
      error: err instanceof Error ? err.message : "This workspace is read-only.",
    };
  }

  const normalizedPhone = normalizePhone(phoneRaw) || phoneRaw;
  const bookUrl = deps.buildBookUrl(orgSlug, orgId);

  // Idempotency: short-circuit a duplicate submission (same orgId+phone).
  const nowMs = deps.now().getTime();
  if (leadDedupSeen(`${orgId}:${normalizedPhone}`, nowMs)) {
    return { ok: true, smsSent: false, bookUrl };
  }

  // ── Find-or-create contact by phone ──
  const customFields: Record<string, unknown> = need ? { need } : {};
  let contactId = await deps.findContactByPhone(orgId, normalizedPhone);
  let created = false;
  const { firstName, lastName } = splitName(name);

  if (contactId) {
    // Upsert: backfill name ONLY when the existing record's is blank; always
    // merge the latest need into customFields.
    const existing = await deps.getContactById(orgId, contactId);
    const patch: Record<string, unknown> = { customFields, updatedAt: deps.now() };
    if (existing && !(existing.firstName ?? "").trim()) patch.firstName = firstName;
    if (existing && !(existing.lastName ?? "")?.trim()) patch.lastName = lastName;
    await deps.updateContact(contactId, patch);
  } else {
    // Free-tier cap only blocks NEW contacts (mirrors the intake route).
    const limit = await deps.enforceContactLimit(orgId);
    if (!limit.allowed) {
      return { ok: false, smsSent: false, bookUrl, error: limit.message };
    }
    contactId = await deps.createContact({
      orgId,
      firstName,
      lastName,
      phone: normalizedPhone,
      status: "lead",
      source: "landing-leadform",
      customFields,
    });
    created = true;
  }

  // ── Events: contact.created (create only) + form.submitted (always) ──
  if (created) {
    await deps.emit("contact.created", { contactId });
  }
  await deps.emit("form.submitted", {
    formId: "landing-leadform",
    contactId,
    data: { name, phone: normalizedPhone, need, source: "landing-leadform" },
  });

  // ── Text the lead. try/catch → graceful skip when no Twilio fromNumber
  //    (sendSmsFromApi throws). suppressed=true (no throw) also ⇒ smsSent:false. ──
  let smsSent = false;
  const businessName = await deps.getBusinessName(orgId);
  try {
    const res = await deps.sendSms({
      orgId,
      contactId,
      toNumber: normalizedPhone,
      body: `Hi ${firstName || name}, thanks for reaching out to ${businessName}! Grab a time here: ${bookUrl} — or reply and we'll get you booked.`,
    });
    smsSent = !res.suppressed;
  } catch {
    smsSent = false;
  }

  // ── Email the operator (platform-level; no Twilio/workspace dependency). ──
  await deps.sendOperatorEmail({ businessName, name, phone: normalizedPhone, need, orgSlug });

  return { ok: true, smsSent, bookUrl };
}

// ── Production deps factory ──────────────────────────────────────────────

function makeDefaultDeps(): LeadFormDeps {
  return {
    assertWritable: assertWritableImpl,
    resolveOrgIdBySlug: async (slug) => {
      const [org] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.slug, slug))
        .limit(1);
      return org?.id ?? null;
    },
    enforceContactLimit: enforceContactLimitImpl,
    findContactByPhone: findContactByPhoneImpl,
    getContactById: async (orgId, contactId) => {
      const [row] = await db
        .select({ firstName: contacts.firstName, lastName: contacts.lastName })
        .from(contacts)
        .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)))
        .limit(1);
      return row ?? null;
    },
    createContact: async (values) => {
      const [row] = await db.insert(contacts).values(values).returning({ id: contacts.id });
      if (!row) throw new Error("Could not create contact");
      return row.id;
    },
    updateContact: async (contactId, patch) => {
      await db.update(contacts).set(patch).where(eq(contacts.id, contactId));
    },
    emit: (type, data) =>
      emitSeldonEvent(
        type,
        // The bus is generically typed; both event shapes are satisfied by
        // the records we build in the core. orgId rides via the options arg.
        data as never,
        { orgId: (data.__orgId as string) ?? "" },
      ),
    buildBookUrl: (slug, orgId) =>
      buildWorkspaceUrls(slug, process.env.WORKSPACE_BASE_DOMAIN ?? "app.seldonframe.com", orgId).book,
    sendSms: async ({ orgId, contactId, toNumber, body }) => {
      const res = await sendSmsFromApi({ orgId, userId: null, contactId, toNumber, body });
      return { suppressed: res.suppressed };
    },
    sendOperatorEmail: (params) => sendNewLeadAlert(params),
    getBusinessName: async (orgId) => {
      const [org] = await db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);
      return org?.name ?? "us";
    },
    now: () => new Date(),
  };
}

/**
 * The "use server" action the client form imports directly (mirrors
 * components/bookings/public-booking-form.tsx importing submitPublicBookingAction).
 * Thin wrapper over the injectable core with production deps.
 */
export async function submitLeadFormAction(input: LeadFormInput): Promise<LeadFormActionResult> {
  return submitLeadFormWithDeps(input, makeDefaultDeps());
}
```

> **Implementation note on `emit` + `orgId`:** `emitSeldonEvent` requires `{ orgId }` as its third argument, but the injectable `emit(type, data)` signature in `LeadFormDeps` only passes `(type, data)` so the unit tests stay DB-free. To thread `orgId` to the real bus without changing the test contract, the production `emit` reads it from a private `data.__orgId` field. Update the two `deps.emit(...)` calls in `submitLeadFormWithDeps` to include it: `await deps.emit("contact.created", { contactId, __orgId: orgId });` and add `__orgId: orgId` to the `form.submitted` data object. The test asserts on `contactId`/`formId` only, so the extra key is harmless there; the production `emit` strips it into the options arg. (Alternative if you prefer no magic key: widen `LeadFormDeps.emit` to `(type, data, orgId)` and pass `orgId` explicitly at both call sites and in the fake — also acceptable. Pick one and keep it consistent.)

Adjust the two emit calls in the core accordingly (per the note). Re-run after the edit.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit`
Expected: PASS — all `submitLeadFormWithDeps` describe blocks pass.

- [ ] **Step 5: Confirm the `"use server"` export shape is valid**

Run: `cd packages/crm && bash scripts/check-use-server.sh src`
Expected: PASS — `lead-form-action.ts` exports only async functions (`submitLeadFormAction`, `submitLeadFormWithDeps`) + types; no disallowed non-async exports. (The exported `type`s are erased at runtime; if the checker flags the exported deps factory, keep `makeDefaultDeps` **non-exported** as written.)

- [ ] **Step 6: Commit**

```bash
git add packages/crm/src/lib/landing/lead-form-action.ts packages/crm/tests/unit/landing/lead-form-action.spec.ts
git commit -m "feat(landing): lead-form server action (find-or-create contact, lead SMS, operator email)"
```

---

## Task 4: Lead-form section — confirmation helper (TDD) + component

The `"use client"` section. The confirm-copy decision is a pure exported helper (unit-tested); the visual shell is verified manually (every `landing-r1` component has zero unit tests — the runner has no jsdom env wired, so interaction-driven state can't be exercised in `node:test`).

**Files:**
- Create: `packages/crm/src/components/landing-r1/sections/lead-form.tsx`
- Test: `packages/crm/tests/unit/landing/lead-form-confirmation.spec.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/crm/tests/unit/landing/lead-form-confirmation.spec.tsx`:

```tsx
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { leadFormConfirmation } from "@/components/landing-r1/sections/lead-form";

describe("leadFormConfirmation", () => {
  test("SMS sent → greets by name and says we texted a booking link", () => {
    const c = leadFormConfirmation({
      name: "Dana Reyes",
      smsSent: true,
      bookUrl: "https://x.app.seldonframe.com/book",
    });
    assert.match(c.headline, /Got it/i);
    assert.match(c.headline, /Dana/); // first name only
    assert.match(c.body, /text/i);
    // No book button when we already texted the link.
    assert.equal(c.showBookButton, false);
  });

  test("no SMS → invites them to book instantly and surfaces the book URL", () => {
    const c = leadFormConfirmation({
      name: "Dana Reyes",
      smsSent: false,
      bookUrl: "https://x.app.seldonframe.com/book",
    });
    assert.match(c.headline, /Got it/i);
    assert.match(c.body, /book/i);
    assert.equal(c.showBookButton, true);
    assert.equal(c.bookUrl, "https://x.app.seldonframe.com/book");
  });

  test("empty name degrades gracefully (no 'undefined')", () => {
    const c = leadFormConfirmation({ name: "", smsSent: true, bookUrl: "" });
    assert.ok(!/undefined/.test(c.headline));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit`
Expected: FAIL — `@/components/landing-r1/sections/lead-form` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `packages/crm/src/components/landing-r1/sections/lead-form.tsx`:

```tsx
// landing-r1/sections/lead-form.tsx
//
// Speed-to-Lead bottom section. Archetype-themed (palette / fonts / radius
// via archetypeStyle() CSS vars — same theming contract as every other
// landing-r1 section; no hard-coded hex). Centered card: heading, subheading,
// Name · Phone · "What do you need?" (select from needOptions, else short
// text), bold submit, trust line, TCPA consent. Imports submitLeadFormAction
// directly (mirrors components/bookings/public-booking-form.tsx).

"use client";

import { useState, useTransition } from "react";
import { ARCHETYPES, archetypeStyle, type AestheticArchetypeId } from "../archetypes";
import { submitLeadFormAction, type R1LeadFormConfig } from "@/lib/landing/lead-form-action";
import type { R1LeadFormSection } from "@/lib/landing/r1-payload-prompt";

const DEFAULTS = {
  heading: "Get a fast callback",
  subheading: "Tell us what you need — we'll text you a time in minutes.",
  needLabel: "What do you need?",
  consentText:
    "By submitting, you agree to receive texts about your request. Msg & data rates may apply. Reply STOP to opt out.",
};

/** First token of a full name, safe for empty input. */
function firstNameOf(full: string): string {
  return full.trim().split(/\s+/)[0] ?? "";
}

/**
 * Pure confirm-copy decision. Exported for unit testing. Returns the
 * post-submit card content; copy adapts to whether the lead SMS went out.
 */
export function leadFormConfirmation(input: {
  name: string;
  smsSent: boolean;
  bookUrl: string;
}): { headline: string; body: string; showBookButton: boolean; bookUrl: string } {
  const first = firstNameOf(input.name);
  if (input.smsSent) {
    return {
      headline: first ? `Got it, ${first} — check your phone` : "Got it — check your phone",
      body: "We just texted you a booking link. Tap it to grab a time, or reply to that text and we'll get you booked.",
      showBookButton: false,
      bookUrl: input.bookUrl,
    };
  }
  return {
    headline: first ? `Got it, ${first}!` : "Got it!",
    body: "Thanks for reaching out — book instantly below and we'll see you soon.",
    showBookButton: true,
    bookUrl: input.bookUrl,
  };
}

export type LeadFormSectionProps = {
  orgSlug: string;
  businessName: string;
  archetype: AestheticArchetypeId;
  leadForm: R1LeadFormSection;
};

export function LeadFormSection({ orgSlug, businessName, archetype, leadForm }: LeadFormSectionProps) {
  const arch = ARCHETYPES[archetype];
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [need, setNeed] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ReturnType<typeof leadFormConfirmation> | null>(null);

  const heading = leadForm.heading || DEFAULTS.heading;
  const subheading = leadForm.subheading || DEFAULTS.subheading;
  const needLabel = leadForm.needLabel || DEFAULTS.needLabel;
  const consentText = leadForm.consentText || DEFAULTS.consentText;
  const options = leadForm.needOptions ?? [];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !phone.trim()) {
      setError("Please enter your name and phone.");
      return;
    }
    startTransition(async () => {
      const res = await submitLeadFormAction({ orgSlug, name, phone, need });
      if (!res.ok) {
        setError(res.error || "Something went wrong. Please call us instead.");
        return;
      }
      setConfirm(leadFormConfirmation({ name, smsSent: res.smsSent, bookUrl: res.bookUrl }));
    });
  }

  return (
    <section
      id="lead-form"
      data-archetype={arch.id}
      style={archetypeStyle(arch.id)}
      className="sf-leadform"
      aria-label={`Contact ${businessName}`}
    >
      <div className="sf-leadform-card">
        {confirm ? (
          <div className="sf-leadform-success" role="status">
            <h2 className="sf-leadform-heading">{confirm.headline}</h2>
            <p className="sf-leadform-sub">{confirm.body}</p>
            {confirm.showBookButton && confirm.bookUrl ? (
              <a className="sf-leadform-submit" href={confirm.bookUrl}>
                Book instantly
              </a>
            ) : null}
          </div>
        ) : (
          <>
            <h2 className="sf-leadform-heading">{heading}</h2>
            <p className="sf-leadform-sub">{subheading}</p>
            <form className="sf-leadform-form" onSubmit={handleSubmit}>
              <label className="sf-leadform-field">
                <span>Your name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  required
                />
              </label>
              <label className="sf-leadform-field">
                <span>Phone</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  required
                />
              </label>
              <label className="sf-leadform-field">
                <span>{needLabel}</span>
                {options.length > 0 ? (
                  <select value={need} onChange={(e) => setNeed(e.target.value)}>
                    <option value="">Select…</option>
                    {options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={need}
                    onChange={(e) => setNeed(e.target.value)}
                    placeholder="Briefly, what do you need?"
                  />
                )}
              </label>

              {error ? (
                <p className="sf-leadform-error" role="alert">
                  {error}
                </p>
              ) : null}

              <button type="submit" className="sf-leadform-submit" disabled={pending}>
                {pending ? "Sending…" : "Get my callback"}
              </button>
              <p className="sf-leadform-trust">★★★★★ Trusted by your neighbors</p>
              <p className="sf-leadform-consent">{consentText}</p>
            </form>
          </>
        )}
      </div>

      <style jsx>{`
        .sf-leadform {
          background: var(--surface, #f5f5f5);
          color: var(--text, #111);
          font-family: var(--font-body);
          padding: clamp(48px, 8vw, 96px) 20px;
          display: flex;
          justify-content: center;
        }
        .sf-leadform-card {
          width: 100%;
          max-width: 520px;
          background: var(--bg, #fff);
          border: 1px solid var(--border, #e5e5e5);
          border-radius: 16px;
          padding: clamp(24px, 5vw, 40px);
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.08);
        }
        .sf-leadform-heading {
          font-family: var(--font-headline);
          font-size: clamp(24px, 4vw, 34px);
          font-weight: 700;
          line-height: 1.1;
          margin: 0 0 8px;
          color: var(--text);
        }
        .sf-leadform-sub {
          font-size: 15px;
          line-height: 1.55;
          margin: 0 0 24px;
          color: color-mix(in oklab, var(--text) 72%, transparent);
        }
        .sf-leadform-form {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .sf-leadform-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .sf-leadform-field span {
          font-size: 13px;
          font-weight: 600;
          color: var(--text);
        }
        .sf-leadform-field input,
        .sf-leadform-field select {
          height: 48px;
          padding: 0 14px;
          font-size: 16px;
          color: var(--text);
          background: var(--bg, #fff);
          border: 1px solid var(--border, #d9d9d9);
          border-radius: 10px;
          outline: none;
        }
        .sf-leadform-field input:focus,
        .sf-leadform-field select:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--primary) 24%, transparent);
        }
        .sf-leadform-submit {
          height: 52px;
          margin-top: 4px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: 700;
          text-decoration: none;
          color: var(--primary-ink, #fff);
          background: var(--primary);
          border: none;
          border-radius: 10px;
          cursor: pointer;
          transition: background 160ms ease, transform 120ms ease;
        }
        .sf-leadform-submit:hover {
          background: color-mix(in oklab, var(--primary) 88%, #000);
        }
        .sf-leadform-submit:active {
          transform: translateY(1px);
        }
        .sf-leadform-submit:disabled {
          opacity: 0.6;
          cursor: default;
        }
        .sf-leadform-trust {
          margin: 12px 0 0;
          text-align: center;
          font-size: 13px;
          color: color-mix(in oklab, var(--text) 60%, transparent);
        }
        .sf-leadform-consent {
          margin: 8px 0 0;
          font-size: 11px;
          line-height: 1.45;
          color: color-mix(in oklab, var(--text) 50%, transparent);
        }
        .sf-leadform-error {
          margin: 0;
          font-size: 14px;
          color: #dc2626;
        }
        .sf-leadform-success {
          text-align: center;
        }
        .sf-leadform-success .sf-leadform-submit {
          margin-top: 16px;
        }
      `}</style>
    </section>
  );
}
```

> **Note:** the import `type R1LeadFormConfig` in the component is **not** used as written above — remove that named import. The component imports only `submitLeadFormAction` from the action and `R1LeadFormSection` from the prompt types. (Self-review caught this; do not ship the unused import.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit`
Expected: PASS — the 3 `leadFormConfirmation` tests pass.

- [ ] **Step 5: Manual verification of the visual shell**

Because the section is a `"use client"` styled-jsx component with `useTransition` (no jsdom in the unit runner), verify visually after the pages are wired (Task 5) using the existing landing preview harness:

1. Run: `pnpm --filter @seldonframe/crm dev`
2. Open `http://localhost:3000/landing-preview/bold-urgency` (the preview route at `app/(public)/landing-preview/[archetype]/page.tsx`) — note this renders a fixture that does NOT yet include `leadForm`, so the section won't appear here. To eyeball the section in isolation, temporarily add `leadForm: { enabled: true }` to one fixture (e.g. `components/landing-r1/fixtures/bold-urgency-stockton.ts`) and render `<LeadFormSection orgSlug="x" businessName={fixture.hero.businessName} archetype="bold-urgency" leadForm={{ enabled: true }} />` in the preview page; confirm the card matches the archetype palette/fonts/radius, the fields stack, and the consent line shows. **Revert the fixture/preview edit before committing.**
3. Real end-to-end submission is verified in Task 8 (manual smoke on a demo + a Twilio workspace).

- [ ] **Step 6: Commit**

```bash
git add packages/crm/src/components/landing-r1/sections/lead-form.tsx packages/crm/tests/unit/landing/lead-form-confirmation.spec.tsx
git commit -m "feat(landing): archetype-themed lead-form section + confirm-copy helper"
```

---

## Task 5: Wire `<LeadFormSection>` into both public R1 pages

Render the section after `<Faq>`, before `<Footer>`, gated on `payload.leadForm?.enabled`.

**Files:**
- Modify: `packages/crm/src/app/(public)/w/[slug]/page.tsx`
- Modify: `packages/crm/src/app/(public)/s/[orgSlug]/[...slug]/page.tsx`

- [ ] **Step 1: Add the import + render in `/w/[slug]`**

In `packages/crm/src/app/(public)/w/[slug]/page.tsx`, add the import next to the other section imports (after the `Faq` import on line ~20):

```ts
import { LeadFormSection } from "@/components/landing-r1/sections/lead-form";
```

Then in the landing-r1 render branch (the final `return (<> … </>)`, ~lines 209–227), insert the section between `<Faq …/>` and `<Footer …/>`:

```tsx
      <Faq {...payload.faq} />
      {payload.leadForm?.enabled && (
        <LeadFormSection
          orgSlug={slug}
          businessName={payload.hero.businessName}
          archetype={payload.hero.archetype}
          leadForm={payload.leadForm}
        />
      )}
      <Footer {...payload.footer} />
```

- [ ] **Step 2: Add the import + render in `/s/[orgSlug]/[...slug]`**

In `packages/crm/src/app/(public)/s/[orgSlug]/[...slug]/page.tsx`, add the import next to the other landing-r1 imports (after the `Faq` import on line ~27):

```ts
import { LeadFormSection } from "@/components/landing-r1/sections/lead-form";
```

Then in the R-framework home branch's `return (<> … </>)` (~lines 124–141), insert between `<Faq …/>` and `<Footer …/>`:

```tsx
          <Faq {...payload.faq} />
          {payload.leadForm?.enabled && (
            <LeadFormSection
              orgSlug={orgSlug}
              businessName={payload.hero.businessName}
              archetype={payload.hero.archetype}
              leadForm={payload.leadForm}
            />
          )}
          <Footer {...payload.footer} />
```

- [ ] **Step 3: Verify the pages typecheck**

Run: `cd packages/crm && npx tsc --noEmit -p tsconfig.json`
Expected: PASS — `payload.leadForm` is typed (Task 1), `slug`/`orgSlug` + `payload.hero.*` are already in scope in both files.

- [ ] **Step 4: Manual verification (deferred to Task 8)**

The section renders only when `payload.leadForm.enabled` is true, which is set by the Task 7 backfill. Full-page verification happens in Task 8 against a backfilled demo. For now, confirm the build compiles (Step 3) and the diff is exactly the import + the gated block in both files.

- [ ] **Step 5: Commit**

```bash
git add "packages/crm/src/app/(public)/w/[slug]/page.tsx" "packages/crm/src/app/(public)/s/[orgSlug]/[...slug]/page.tsx"
git commit -m "feat(landing): render LeadFormSection after FAQ on both public R1 pages"
```

---

## Task 6: Sticky mobile bar — show Text only when `smsHref` is present (TDD)

The component's `resolvedSms` line is convoluted (`smsHref ?? (smsHref === undefined ? null : toSmsHref(phone))` always resolves to `smsHref` or `null`). Simplify so the Text button renders **only** when `smsHref` is a non-empty string and uses that value verbatim. This is the spec's "render Text only when smsHref present" requirement.

**Files:**
- Modify: `packages/crm/src/components/landing-r1/chrome/sticky-mobile-bar.tsx`
- Test: `packages/crm/tests/unit/landing/sticky-mobile-bar-sms.spec.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/crm/tests/unit/landing/sticky-mobile-bar-sms.spec.tsx`:

```tsx
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import { StickyMobileBar } from "@/components/landing-r1/chrome/sticky-mobile-bar";

describe("<StickyMobileBar> — Text button gating", () => {
  test("renders the Text button with the exact sms: href when smsHref is set", () => {
    const html = renderToString(
      <StickyMobileBar
        archetype="bold-urgency"
        phone="(209) 555-0144"
        smsHref="sms:+18395550100"
        bookHref="https://x.app.seldonframe.com/book"
      />,
    );
    assert.match(html, /Text/);
    assert.match(html, /href="sms:\+18395550100"/);
  });

  test("omits the Text button entirely when smsHref is absent", () => {
    const html = renderToString(
      <StickyMobileBar archetype="bold-urgency" phone="(209) 555-0144" />,
    );
    // Call is always present; Text must NOT be.
    assert.match(html, /Call/);
    assert.ok(!/>Text</.test(html), "Text button should be absent without smsHref");
  });

  test("renders nothing for archetypes excluded from the sticky bar", () => {
    const html = renderToString(
      <StickyMobileBar archetype="cinematic-aspirational" phone="(209) 555-0144" smsHref="sms:+1" />,
    );
    assert.equal(html, "");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit`
Expected: FAIL on the second assertion path — today `resolvedSms`/`showText` already keys off `!!smsHref`, so the omit test may pass, BUT the first test asserts `href="sms:+18395550100"` exactly. With the current line, `resolvedSms = smsHref ?? …` = `"sms:+18395550100"` and the JSX uses `href={resolvedSms ?? toSmsHref(phone)}` → passes. The genuinely failing assertion is the brittle `resolvedSms` fallback: when `smsHref` is `""` (empty string from a stale payload), `showText` is `false` (correct) but the convoluted expression is dead code. Run the suite; if all three already pass, this task reduces to the simplification + keeping the green tests as a regression guard. Expected initial state: PASS for omit/excluded, PASS for the explicit-href test. (If the suite is green, proceed to Step 3 to remove the dead code and lock the behavior; the tests then act as the regression net.)

> Rationale for keeping the task: the spec explicitly calls for "StickyMobileBar renders Text only when smsHref present (confirm/adjust the component)." The adjustment is removing the unreachable branch so future readers don't trust the bogus `toSmsHref(phone)` fallback (which would resurrect a dead Text button if someone flips `showText`).

- [ ] **Step 3: Simplify the implementation**

In `packages/crm/src/components/landing-r1/chrome/sticky-mobile-bar.tsx`, replace the block (lines ~72–78):

```tsx
  // Compute the actual SMS href: prefer the explicit prop, fall back to
  // deriving from the phone string.
  const resolvedSms = smsHref ?? (smsHref === undefined ? null : toSmsHref(phone));
  const showText = !!smsHref;
  const showBook = !!bookHref;
```

with:

```tsx
  // Text button is shown ONLY when a non-empty sms: href is supplied.
  // No phone-derived fallback: an empty/absent smsHref means "no Text button"
  // (the Speed-to-Lead contract — the demo backfill sets it to the 839 line).
  const showText = typeof smsHref === "string" && smsHref.length > 0;
  const showBook = !!bookHref;
```

Then update the Text `<a>` to use `smsHref` directly (it now only renders when truthy) — replace line ~96:

```tsx
        <a className="sf-sticky-btn sf-sticky-text" href={resolvedSms ?? toSmsHref(phone)} aria-label="Text us">
```

with:

```tsx
        <a className="sf-sticky-btn sf-sticky-text" href={smsHref} aria-label="Text us">
```

Finally, remove the now-unused `toSmsHref` import — change the import line (line ~20):

```tsx
import { telHref, smsHref as toSmsHref } from "../_shared/phone";
```

to:

```tsx
import { telHref } from "../_shared/phone";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit`
Expected: PASS — all three `<StickyMobileBar>` tests green; the explicit `href="sms:+18395550100"` is now passed verbatim.

- [ ] **Step 5: Verify no unused-symbol type error**

Run: `cd packages/crm && npx tsc --noEmit -p tsconfig.json`
Expected: PASS — `toSmsHref` is gone, `smsHref` is used directly.

- [ ] **Step 6: Commit**

```bash
git add packages/crm/src/components/landing-r1/chrome/sticky-mobile-bar.tsx packages/crm/tests/unit/landing/sticky-mobile-bar-sms.spec.tsx
git commit -m "fix(landing): sticky bar shows Text only when smsHref present"
```

---

## Task 7: Demo DB backfill — enable `leadForm` (8 demos) + 839 line (9 demos)

Data-only step (no repo file). Run against the production Neon branch via `mcp__neon__run_sql`. The demos store their R1 payload in `landing_pages.blueprint_json -> 'payload'`. We (a) enable `leadForm` on the 8 R1 demos and (b) set the Seldon Studio **839** line across Call CTAs / footer / sticky for the 9 demos. **Lumière is excluded** (it renders via the med-spa template, not the R1 sections / `StickyMobileBar`).

> **Inputs to confirm before running** (do not guess): the exact 839 number in E.164 (e.g. `+1XXX839XXXX`), the 9 demo slugs, and which 8 are R1 (`blueprint_json -> 'payload'` non-null, i.e. `_r1 = true`) vs. the 1 template-rendered (Lumière). The integration map + memory note "Seldon Studio setup" (agency phone 839) and task #126 ("Build 9 Seldon Studio demo workspaces") are the source of truth. Resolve these first with the read-only query in Step 1.

**Files:** none (Neon SQL).

- [ ] **Step 1: Identify the demo rows (read-only)**

Run via `mcp__neon__run_sql` (production branch):

```sql
SELECT o.slug,
       o.id AS org_id,
       (lp.blueprint_json -> 'payload') IS NOT NULL          AS has_r1_payload,
       lp.blueprint_json -> 'payload' -> 'footer' ->> 'phone' AS footer_phone,
       lp.blueprint_json -> 'payload' -> 'sticky' ->> 'smsHref' AS sticky_sms,
       (lp.blueprint_json -> 'payload' -> 'leadForm' ->> 'enabled') AS leadform_enabled
FROM organizations o
JOIN landing_pages lp ON lp.org_id = o.id AND lp.slug = 'r1'
WHERE o.slug IN (
  -- TODO: paste the 9 Seldon Studio demo slugs here, confirmed from task #126 / seldonstudio.com
  'demo-slug-1','demo-slug-2','demo-slug-3','demo-slug-4',
  'demo-slug-5','demo-slug-6','demo-slug-7','demo-slug-8','demo-slug-9'
)
ORDER BY o.slug;
```

Expected: 8 rows with `has_r1_payload = true` (the R1 demos) and Lumière either absent from `landing_pages.slug='r1'` or with `has_r1_payload = false`. Record the org_ids + which 8 are R1. If Lumière shows up as an `r1` row, **exclude it from Step 3** (template renderer).

- [ ] **Step 2: Enable `leadForm` on the 8 R1 demos**

Run via `mcp__neon__run_sql`. This merges `{"enabled":true, ...}` into `blueprint_json -> 'payload' -> 'leadForm'` (preserving any existing copy fields) using `jsonb_set` with create-missing=true:

```sql
UPDATE landing_pages lp
SET blueprint_json = jsonb_set(
      lp.blueprint_json,
      '{payload,leadForm}',
      COALESCE(lp.blueprint_json -> 'payload' -> 'leadForm', '{}'::jsonb)
        || jsonb_build_object(
             'enabled', true,
             'heading', 'Get a fast callback',
             'subheading', 'Tell us what you need — we''ll text you a time in minutes.',
             'needLabel', 'What do you need?'
           ),
      true
    ),
    updated_at = now()
FROM organizations o
WHERE lp.org_id = o.id
  AND lp.slug = 'r1'
  AND (lp.blueprint_json -> 'payload') IS NOT NULL
  AND o.slug IN (
    -- TODO: the 8 R1 demo slugs confirmed in Step 1 (exclude Lumière)
    'demo-slug-1','demo-slug-2','demo-slug-3','demo-slug-4',
    'demo-slug-5','demo-slug-6','demo-slug-7','demo-slug-8'
  );
```

Expected: `UPDATE 8`.

- [ ] **Step 3: Wire the 839 line across the demos' payload (Call / footer / sticky)**

Replace the bracketed placeholders with the confirmed values. `<839_TEL>` = `tel:+1XXX839XXXX`, `<839_SMS>` = `sms:+1XXX839XXXX`, `<839_DISPLAY>` = the human-readable form shown in the footer (e.g. `(XXX) 839-XXXX`). Run via `mcp__neon__run_sql`:

```sql
UPDATE landing_pages lp
SET blueprint_json = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            lp.blueprint_json,
            '{payload,footer,phone}', to_jsonb('<839_DISPLAY>'::text), true
          ),
          '{payload,hero,primaryCTA,href}', to_jsonb('<839_TEL>'::text), true
        ),
        '{payload,sticky,callHref}', to_jsonb('<839_TEL>'::text), true
      ),
      '{payload,sticky,smsHref}', to_jsonb('<839_SMS>'::text), true
    ),
    updated_at = now()
FROM organizations o
WHERE lp.org_id = o.id
  AND lp.slug = 'r1'
  AND (lp.blueprint_json -> 'payload') IS NOT NULL
  AND o.slug IN (
    -- TODO: the 8 R1 demo slugs (Lumière excluded — its CTAs are wired separately in the template pass)
    'demo-slug-1','demo-slug-2','demo-slug-3','demo-slug-4',
    'demo-slug-5','demo-slug-6','demo-slug-7','demo-slug-8'
  );
```

> **Notes:** (1) `StickyMobileBar` reads `phone` (for the Call `tel:` href, derived) + `smsHref` + `bookHref`; there is no `callHref` prop on the sticky component, but several demo payloads carry `sticky.callHref` historically — setting it is harmless and keeps the payload internally consistent. The load-bearing sticky fields for this feature are `sticky.phone` (already the display number) and `sticky.smsHref`. If Step 1 shows the sticky uses `phone` rather than a separate display value, also set `'{payload,sticky,phone}'` to `<839_DISPLAY>`. (2) `emergency.phone` and `faq.cta.href`/`services.cta.href` also carry the number on some demos — extend the `jsonb_set` chain to those paths if Step 1 reveals them, using the same `<839_TEL>` / `<839_DISPLAY>` values. (3) Do **not** touch Lumière.

Expected: `UPDATE 8`.

- [ ] **Step 4: Manual verification (SQL read-back)**

Re-run the Step 1 SELECT. Expected for all 8 R1 demos: `leadform_enabled = 'true'`, `footer_phone = '<839_DISPLAY>'`, `sticky_sms = '<839_SMS>'`. Then load one demo's public URL in a browser (`https://<demo-slug>.app.seldonframe.com/`) and confirm: the lead-form section appears below the FAQ, the footer shows the 839 number, and on a narrow viewport the sticky bar's Text button is present and points at `sms:` the 839 line. (No commit — this is a data change, not code.)

---

## Task 8: Full verification — build gate, unit suite, manual end-to-end

The mandatory pre-merge gate per the repo conventions (`check-use-server.sh` + `tsc` + the unit suite), plus the two manual smokes the spec requires.

**Files:** none (verification only).

- [ ] **Step 1: Run the full unit suite**

Run: `pnpm test:unit`
Expected: PASS — all suites green, including the 4 new spec files (ops-new-lead-alert, lead-form-action, lead-form-confirmation, sticky-mobile-bar-sms). Confirm the runner prints them in the "Running N unit test file(s)" header.

- [ ] **Step 2: Run the `"use server"` export checker**

Run: `cd packages/crm && bash scripts/check-use-server.sh src`
Expected: PASS — `lead-form-action.ts` only exports async functions + types.

- [ ] **Step 3: Typecheck the package**

Run: `cd packages/crm && npx tsc --noEmit -p tsconfig.json`
Expected: PASS — no new type errors across the modified prompt type, action, component, both pages, and the sticky bar.

- [ ] **Step 4: Full build gate**

Run: `cd packages/crm && bash scripts/check-use-server.sh src && next build`
Expected: build completes. (This is the authoritative gate — `next build` compiles the `(public)` routes, the `"use client"` lead-form section, and the `"use server"` action together. Treat any new error here as blocking; fix before merge.)

- [ ] **Step 5: Manual smoke — a demo (no Twilio): capture + on-screen confirm + sticky Text → 839**

After Task 7's backfill, open a backfilled demo's public site:
1. Submit the lead form (name + phone + need). Expected: it flips to the success card. Because demos have no Twilio fromNumber, `sendSmsFromApi` throws → graceful skip → the confirm copy is the "book instantly" variant (no "we texted you") and shows the **Book instantly** button. No error toast.
2. In the demo's admin, confirm a new contact exists with `status=lead`, `source=landing-leadform`, and `need` in custom fields; confirm the operator alert email arrived at the OPS recipient.
3. On a narrow viewport, tap **Text** in the sticky bar → the device opens Messages addressed to the 839 line (`sms:+1…839…`). Tap **Call** → dials the 839 line.

- [ ] **Step 6: Manual smoke — a Twilio-configured workspace: real lead SMS received**

On a workspace that has a Twilio `fromNumber` configured (not a demo), enable `leadForm` (one-off `jsonb_set` as in Task 7 Step 2 against that workspace's `r1` row), open its public site, and submit the form with a real phone you control. Expected: the success card is the "we just texted you a booking link" variant (no Book button), and the phone receives the SMS `Hi <name>, thanks for reaching out to <business>! Grab a time here: <book url> …`. Confirm a `contact.created` + `form.submitted` run is visible in the workspace's event/agent surfaces.

- [ ] **Step 7: Final commit / branch handoff**

No code change in this task. If Steps 1–4 surfaced any fix, commit it with a `fix:` message, then re-run Step 4 to confirm green. The branch `feat/hero-lead-form` is ready to merge once the build gate passes and both manual smokes are confirmed.

---

## Spec coverage check (self-review)

- **Component 1 — `leadForm` payload field (top-level, round-trips, enabled via DB):** Task 1 (type) + Task 7 Step 2 (DB enable). `loadLandingPayload` raw passthrough confirmed — no loader change. ✅
- **Component 2 — lead-form section (`"use client"`, archetype-themed, Name·Phone·need, success state, imports action directly, props orgSlug/businessName/archetype/leadForm):** Task 4. ✅
- **Component 3 — server action (resolve org → assertWritable → enforceContactLimit → idempotency → find-or-create by phone with status/source/need→customFields + name-backfill-no-clobber → contact.created+form.submitted → buildWorkspaceUrls → SMS try/catch → operator email → return {ok,smsSent,bookUrl}):** Task 3 (every sub-step is an assertion or a code line). ✅
- **Component 4 — sticky Text button (works on `sms:`, only when smsHref present, generator emits smsHref, backfill existing):** Task 6 (component) + the prompt already emits `smsHref` for phone-first archetypes (noted in Task 1's File Structure) + Task 7 Step 3 (backfill). ✅
- **Component 5 — demo telephony → 839 (Call CTAs, footer.phone, sticky callHref/smsHref, displayed number; Lumière noted/excluded):** Task 7 Step 3. ✅
- **Component 6 — wiring (render after Faq before Footer in both pages, gated on enabled; enable on 8 demos; Lumière excluded):** Task 5 + Task 7. ✅
- **Error handling / edge cases:** no-Twilio graceful skip (Task 3 test + Task 8 Step 5), suppressed→smsSent:false (Task 3 test), contact-cap friendly error (Task 3 test), idempotency (Task 3 core + test path), find-or-create by phone i.e. no email needed (Task 3), template-rendered Lumière out of scope (Task 7 exclusion). ✅
- **Testing:** unit (action create/upsert/events/SMS-skip/suppressed/limit — Task 3; ops email — Task 2; confirm copy — Task 4; sticky gating — Task 6) + manual (demo + Twilio workspace — Task 8). ✅
- **Out of scope (Phase 2B branding, Lumière lead-form/sticky, A2P, chatbot/booking/voice):** untouched. ✅

## Placeholder scan (self-review)

No "TBD" / "similar to above" / "add error handling" left in code steps. The only intentional placeholders are the **demo slugs + the 839 number** in Task 7's SQL, which are explicitly flagged as "confirm before running" inputs (the plan resolves them with the Step 1 read-only query rather than guessing — guessing prod identifiers would be the larger error). Every code block is complete and copy-pasteable.

## Type / signature consistency (self-review)

- `submitLeadFormAction(input: LeadFormInput): Promise<LeadFormActionResult>` — same name imported by the component (Task 4) and defined in the action (Task 3). ✅
- `LeadFormDeps` field names used in the fake (Task 3 Step 1) match the type + the core's `deps.*` calls (Task 3 Step 3) exactly: `assertWritable, resolveOrgIdBySlug, enforceContactLimit, findContactByPhone, getContactById, createContact, updateContact, emit, buildBookUrl, sendSms, sendOperatorEmail, getBusinessName, now`. ✅
- `R1LeadFormSection` (Task 1) is the prop type consumed by `LeadFormSection` (Task 4) and the field on `R1LandingPayload` read in both pages (Task 5). ✅
- `leadFormConfirmation({ name, smsSent, bookUrl })` returns `{ headline, body, showBookButton, bookUrl }` — same shape asserted in its test (Task 4) and consumed by the component's success card. ✅
- `sendNewLeadAlert(params: NewLeadAlertParams, deps?: OpsNotificationDeps)` — `params` fields (`businessName, name, phone, need, orgSlug`) match the action's `sendOperatorEmail` payload (Task 3) and the test (Task 2). ✅
- `findContactByPhone(orgId, phone) → Promise<string | null>`, `sendSmsFromApi(...) → { suppressed }`, `enforceContactLimit(orgId) → LimitDecision`, `emitSeldonEvent(type, data, {orgId})`, `buildWorkspaceUrls(slug, baseDomain, orgId).book`, `assertWritable()`, `normalizePhone()` — all verified against the real source files; the production deps factory (Task 3) calls them with the exact signatures. ✅
