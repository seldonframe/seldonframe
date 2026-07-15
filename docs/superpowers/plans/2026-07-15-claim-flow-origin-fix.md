# Claim-Flow Origin Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** /record works cross-origin: host-pinned to the app host, allowlisted for the post-auth return, with compile failures rendered instead of swallowed.

**Architecture:** Extract signup's host-pin helper to `lib/auth/app-host-redirect.ts` (shared, byte-behavior-preserving); call it first in `/record/page.tsx`; add `/record` to the shared open-redirect allowlist; move canonical+sitemap to the app host; audit-and-fix the compile error rendering in record-client.

**Tech Stack:** Next.js 16 App Router (server `redirect()` from next/navigation, `headers()`), node:test via `node scripts/run-unit-tests.js`.

**Spec:** `docs/superpowers/specs/2026-07-15-claim-flow-origin-fix-design.md` — read fully first.

## Global Constraints

- Worktree: `C:\Users\maxim\CascadeProjects\Seldon Frame\.claude\worktrees\claim-flow-fix`, branch `fix/claim-compile-origin-split`.
- Capture baselines BEFORE Task 1: `node scripts/run-unit-tests.js` (from worktree root) + `cd packages/crm && pnpm exec tsc --noEmit` — record counts; all later judgments are by DELTA (DB-bound failures are the known baseline). If tsc can't resolve, recreate the packages/crm/node_modules junction from the parent repo first.
- The extraction in Task 1 must move signup's host-pin code VERBATIM (comments included) — signup behavior is proven by existing tests + tsc only; do not "improve" it.
- No cookie/auth-config changes of any kind. No new dependencies.
- Commit per task with the messages given; append `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure

```
packages/crm/src/lib/auth/app-host-redirect.ts        (new — extracted helper)
packages/crm/src/app/(auth)/signup/page.tsx           (modify — import from helper, delete local copies)
packages/crm/src/app/(public)/record/page.tsx         (modify — host-pin first + canonical)
packages/crm/src/lib/auth/signup-redirect.ts          (modify — allowlist + dated comment)
packages/crm/src/app/sitemap.ts                       (modify — /record entry → app origin)
packages/crm/src/app/(public)/record/record-client.tsx (audit/modify — error rendering only)
packages/crm/tests/unit/auth/app-host-redirect.spec.ts (new)
packages/crm/tests/unit/auth/signup-redirect.spec.ts   (extend)
```

---

### Task 1: Extract the host-pin helper + wire signup through it

**Files:**
- Create: `packages/crm/src/lib/auth/app-host-redirect.ts`
- Modify: `packages/crm/src/app/(auth)/signup/page.tsx` (delete local `normalizeHost`/`isExemptHost`/`redirectToAppHostIfNeeded` at ~L50-72, import from the new module)
- Test: `packages/crm/tests/unit/auth/app-host-redirect.spec.ts`

**Interfaces:**
- Produces: `redirectToAppHostIfNeeded(path: string, search: string): Promise<void>` (throws Next's redirect when pinning), plus exported-for-test pure helpers `normalizeHost(host: string): string`, `isExemptHost(host: string): boolean`, and `resolveAppHostRedirectTarget(input: { requestHost: string; appOrigin: string; path: string; search: string }): string | null` — a PURE function the async wrapper delegates to (null = no redirect needed). The pure core exists so tests never need to mock `headers()`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/crm/tests/unit/auth/app-host-redirect.spec.ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  isExemptHost,
  normalizeHost,
  resolveAppHostRedirectTarget,
} from "../../../src/lib/auth/app-host-redirect";

const APP = "https://app.seldonframe.com";

describe("resolveAppHostRedirectTarget", () => {
  test("www host → app-origin URL with path and query byte-identical", () => {
    const target = resolveAppHostRedirectTarget({
      requestHost: "www.seldonframe.com",
      appOrigin: APP,
      path: "/record",
      search: "?session=abc-123&claimed=1&shared=x%20y",
    });
    assert.equal(target, "https://app.seldonframe.com/record?session=abc-123&claimed=1&shared=x%20y");
  });

  test("apex host redirects too", () => {
    const target = resolveAppHostRedirectTarget({
      requestHost: "seldonframe.com", appOrigin: APP, path: "/record", search: "",
    });
    assert.equal(target, "https://app.seldonframe.com/record");
  });

  test("already on app host → null", () => {
    assert.equal(
      resolveAppHostRedirectTarget({ requestHost: "app.seldonframe.com", appOrigin: APP, path: "/record", search: "?a=1" }),
      null,
    );
  });

  test("exempt hosts → null (localhost, 127.0.0.1, vercel preview, empty)", () => {
    for (const host of ["localhost", "localhost:3000", "127.0.0.1", "my-preview.vercel.app", ""]) {
      assert.equal(
        resolveAppHostRedirectTarget({ requestHost: host, appOrigin: APP, path: "/record", search: "" }),
        null,
        host || "(empty)",
      );
    }
  });
});

describe("host helpers", () => {
  test("normalizeHost lowercases, trims, strips port", () => {
    assert.equal(normalizeHost(" WWW.SeldonFrame.com:443 "), "www.seldonframe.com");
  });
  test("isExemptHost matrix", () => {
    assert.equal(isExemptHost("localhost"), true);
    assert.equal(isExemptHost("x.vercel.app"), true);
    assert.equal(isExemptHost("www.seldonframe.com"), false);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `node scripts/run-unit-tests.js` → module-not-found for `app-host-redirect`.

- [ ] **Step 3: Create the module**

Move the code from signup/page.tsx VERBATIM — including its 2026-07-04 incident comment block — into the new file, then add the pure core by refactoring the existing async function's body around it (the async wrapper keeps identical observable behavior):

```ts
// packages/crm/src/lib/auth/app-host-redirect.ts
//
// [MOVE the 2026-07-04 prod-incident comment block from signup/page.tsx:37-49 here verbatim]
//
// 2026-07-15 — extracted from (auth)/signup/page.tsx so /record can pin to the
// app host with the SAME policy (claim-flow origin fix — a www-recorded session
// could never see the app-host login, and the compile POST 401'd; see
// docs/superpowers/specs/2026-07-15-claim-flow-origin-fix-design.md).
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveAppOrigin } from "@/lib/marketplace/buy-box-auth";

export function normalizeHost(host: string) {
  return host.trim().toLowerCase().replace(/:\d+$/, "");
}

export function isExemptHost(host: string) {
  return (
    host === "" ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".vercel.app")
  );
}

/** Pure core — null means "already in the right place / exempt, don't redirect". */
export function resolveAppHostRedirectTarget(input: {
  requestHost: string;
  appOrigin: string;
  path: string;
  search: string;
}): string | null {
  const requestHost = normalizeHost(input.requestHost);
  if (isExemptHost(requestHost)) return null;
  const appHost = normalizeHost(new URL(input.appOrigin).host);
  if (requestHost === appHost) return null;
  return `${input.appOrigin}${input.path}${input.search}`;
}

export async function redirectToAppHostIfNeeded(path: string, search: string) {
  const requestHost = (await headers()).get("host") ?? "";
  const target = resolveAppHostRedirectTarget({
    requestHost,
    appOrigin: resolveAppOrigin(process.env.NEXT_PUBLIC_APP_URL),
    path,
    search,
  });
  if (target) redirect(target);
}
```

In `signup/page.tsx`: delete the three local declarations, add `import { redirectToAppHostIfNeeded } from "@/lib/auth/app-host-redirect";` — call sites unchanged. Leave a one-line pointer comment where the block lived.

- [ ] **Step 4: Run tests + tsc** — new spec green; zero new tsc errors; existing auth/signup specs untouched-green.
- [ ] **Step 5: Commit** — `git add ... && git commit -m "refactor(auth): extract app-host pin helper from signup (verbatim policy, pure core for tests)"`

---

### Task 2: Pin /record + allowlist + canonical/sitemap

**Files:**
- Modify: `packages/crm/src/app/(public)/record/page.tsx`
- Modify: `packages/crm/src/lib/auth/signup-redirect.ts`
- Modify: `packages/crm/src/app/sitemap.ts`
- Test: extend `packages/crm/tests/unit/auth/signup-redirect.spec.ts`

**Interfaces:**
- Consumes: `redirectToAppHostIfNeeded` (Task 1).

- [ ] **Step 1: Failing allowlist tests** (append to signup-redirect.spec.ts, matching its existing style — read the file's helpers first):

```ts
describe("SAFE_REDIRECT_PREFIXES — /record (claim-flow origin fix)", () => {
  test("accepts /record and /record with claim query", () => {
    assert.equal(toInternalRedirectPath("/record"), "/record");
    assert.equal(
      toInternalRedirectPath("/record?session=abc&claimed=1"),
      "/record?session=abc&claimed=1",
    );
  });
  test("segment boundary: /recordings and /recordx still rejected", () => {
    assert.equal(toInternalRedirectPath("/recordings"), null);
    assert.equal(toInternalRedirectPath("/recordx?session=a"), null);
  });
  test("traversal and protocol-relative still rejected", () => {
    assert.equal(toInternalRedirectPath("//record"), null);
    assert.equal(toInternalRedirectPath("/record/../oauth/authorize"), null);
  });
});
```

- [ ] **Step 2: Run → fail** (first block fails today; boundary/traversal blocks pass — they pin existing behavior).

- [ ] **Step 3: Implement**

`signup-redirect.ts` — append to `SAFE_REDIRECT_PREFIXES`:

```ts
  // 2026-07-15 — claim-flow origin fix: the /record claim round-trip
  // (record → /signup?callbackUrl=/record?session=…&claimed=1 → back to the
  // recap) was collapsing to /dashboard for EVERY claimer because /record was
  // never allowlisted (log-proven 401+dashboard-dump incident, spec
  // 2026-07-15-claim-flow-origin-fix-design.md).
  "/record",
```

`record/page.tsx` — immediately after `const params = await searchParams;`, rebuild the search string and pin (order matters — pin BEFORE the auth() call so the cookie read happens on the right host):

```ts
  const search = new URLSearchParams(
    Object.entries({ session: params.session, claimed: params.claimed, shared: params.shared })
      .filter((pair): pair is [string, string] => typeof pair[1] === "string"),
  ).toString();
  await redirectToAppHostIfNeeded("/record", search ? `?${search}` : "");
```

Also update `metadata.alternates.canonical` to `"https://app.seldonframe.com/record"` (keep the rest of the metadata block untouched).

`sitemap.ts` — read how `base` is computed; make the `/record` entry emit `https://app.seldonframe.com/record` explicitly (one-line change + comment referencing the canonical move; do not touch other entries).

- [ ] **Step 4: Run tests + tsc** — allowlist suite green; `record-page-render.spec.ts` green (if it renders the page with mocked headers, the exempt-host default should keep it non-redirecting — if it fails on the new redirect, mock host as `localhost`, which is exempt — do NOT weaken the pin).
- [ ] **Step 5: Commit** — `fix(record): pin /record to app host + allowlist claim return + canonical/sitemap move`

---

### Task 3: Compile-error honesty audit + full regression

**Files:**
- Audit/Modify: `packages/crm/src/app/(public)/record/record-client.tsx`
- Test: extend the existing record UI spec only if a code change is made.

- [ ] **Step 1: Audit** the compile path (`handleCompileAgent`/`handleCompileNow` and the `message` state): verify (a) no `window.location`/router navigation occurs while `compiling` is true or on failure, (b) the `message` state renders visibly adjacent to the compile CTA, (c) failure leaves a retry affordance (the CTA re-enabled). Quote the findings in the task report.
- [ ] **Step 2: Fix ONLY confirmed gaps** — e.g., if `message` renders nowhere near the CTA, render it under the button:

```tsx
{message ? (
  <p role="alert" className="mt-2 text-[13px] text-red-300">
    {message} — nothing was lost; fix the issue or try again.
  </p>
) : null}
```

(match the recap panel's existing classes; if all three audit points already hold, make NO change and say so.)

- [ ] **Step 3: Full regression** — `node scripts/run-unit-tests.js` + tsc: zero new failures/errors vs baseline. Pre-check verify-build greps: no `sql.raw`, `"use server"` placement untouched, no migration changes (none in this slice).
- [ ] **Step 4: Commit** (only if changes) — `fix(record): render compile failures at the CTA, never navigate away mid-compile` — then write `docs/superpowers/plans/2026-07-15-claim-flow-origin-fix.build-report.md` (baselines, deltas, audit findings, deviations) and commit it.

## Self-Review

- Spec §3.1→Task 1, §3.2+3.3+3.4→Task 2, §3.5→Task 3, §4 tests distributed per task, §5 smoke is controller-level post-merge. No placeholders; types consistent (`resolveAppHostRedirectTarget` signature used in both Task 1 code and tests).
- Deliberate cut: no integration test of the live 307 (needs a running server) — covered by the pure-core unit tests + post-deploy smoke (a).
