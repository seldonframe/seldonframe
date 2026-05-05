# Behavioral Contracts (v1.9.0+)

Three production bugs in 7 days hit the same shape: a server-side
function `throw new Error()`s for a predictable user/workspace state,
and the throw cascades through the SSR boundary to the user as
*"This page couldn't load — A server error occurred."*

| Version | Bug                                       | Where it lived                       |
|---------|-------------------------------------------|--------------------------------------|
| v1.4.2  | Booking persist wiped form_fields name+email | `lib/page-blocks/persist.ts`        |
| v1.7.3  | Dashboard `Unauthorized` on missing users row | `lib/billing/orgs.ts::getBillingUserById` |
| v1.8.1  | Billing portal `No Stripe customer` on free tier | `lib/billing/actions.ts::createBillingPortalSessionAction` |

All three are the **handler-execution-state-drift** bug class — the
function works fine for the happy path but throws ungracefully for
edge states (no users row, no Stripe customer, free tier, empty
form_fields). Codegen (v1.5.0) prevents schema-shape drift but doesn't
catch these.

This document defines the contracts that prevent that bug class going
forward. Two layers:

1. **Static analysis** — the
   `tests/unit/contract-no-uncaught-throws.spec.ts` test scans
   designated source directories for `throw new Error(...)` patterns
   and fails CI if any throw isn't annotated or wrapped in a try/catch.
2. **Behavioral runtime tests** — focused unit tests for the specific
   functions that bit us, asserting they handle edge states gracefully.

## The throw contract

In user-reachable server-side code (server actions, API routes, page
server components, auth helpers used by all of the above), every
`throw new Error()` must satisfy one of:

1. **Be wrapped in a try/catch** that converts the throw to a
   structured response (JSON 4xx, NextResponse.redirect, return
   `{ ok: false, error: "..." }`).
2. **Carry a `// contract:throw-ok: <reason>` annotation** explaining
   why this throw is safe — typically because:
   - It's a programmer-error sentinel (unreachable in valid state)
   - It's a config error that should crash loudly during deployment
   - It's inside a try/catch the static analyzer didn't recognize
   - It's a form-submit handler whose throw becomes Next's generic
     server-action error toast (not the SSR "page couldn't load")

The annotation goes on the line immediately above the throw OR
trailing the throw line itself. Multi-line comment blocks above the
throw are scanned — the marker can be on any line of the block.

### Examples

**Form-submit error UX is acceptable:**

```typescript
if (!response.ok) {
  // contract:throw-ok: Stripe API error; bubbles up to selectPlanAction
  // which doesn't catch — but that path is only reachable from a
  // form submit, and Next.js server-action error handling shows the
  // operator a generic error toast rather than crashing the page.
  throw new Error("Failed to create Stripe customer");
}
```

**Programmer-error sentinel:**

```typescript
if (!toSection) {
  // contract:throw-ok: registry misconfiguration — every
  // surface=landing-section block MUST have toSection. This branch
  // is unreachable in valid registry state.
  throw new Error(`block "${blockName}" surface=landing-section but no toSection`);
}
```

**Config error (deployment):**

```typescript
if (!secret) {
  // contract:throw-ok: deployment-config error (env var missing).
  // The throw signal is what surfaces this misconfig in observability
  // before it silently breaks magic-link auth.
  throw new Error("Cannot mint magic link: AUTH_SECRET is not set.");
}
```

**Wrap-in-try is preferred when graceful handling exists:**

```typescript
try {
  return await someAction();
} catch (err) {
  return NextResponse.json(
    { ok: false, error: err instanceof Error ? err.message : String(err) },
    { status: 500 },
  );
}
```

### When NOT to throw

If the edge state is **predictable** (free tier, missing users row,
empty workspace, etc.), don't throw — return a structured response or
redirect. Examples:

- `getBillingUserById(userId-not-in-db)` — return synthesized empty
  record, not throw. (v1.7.3 fix)
- `createBillingPortalSessionAction()` for free tier — redirect to
  `/settings/billing?upgrade=needed`, not throw. (v1.8.1 fix)
- API route `/api/v1/foo` for unauthenticated request — return 401
  JSON, not throw.

The throw is reserved for genuinely-exceptional states (DB
unreachable, type-level invariants violated, programmer-error guards).

## Scoped directories

The static analysis check runs on these paths (defined in
`tests/unit/contract-no-uncaught-throws.spec.ts::SCOPED_DIRS`):

- `src/lib/billing/**` — billing actions called from forms (v1.8.1)
- `src/lib/auth/**` — auth helpers used by every dashboard page (v1.7.3)
- `src/lib/page-blocks/persist.ts` — v2 persist path (v1.4.2)
- `src/app/(dashboard)/**` — server components rendered to the user

To **add a new directory to scope**: append its prefix to `SCOPED_DIRS`,
then run `pnpm test:unit` and either fix or annotate every existing
throw in that directory. Worth doing one directory at a time so the
annotation pass stays meaningful.

Out of scope (intentionally) for now:

- `src/lib/agents/`, `src/lib/blueprint/`, `src/lib/blocks/` — deeper
  internals where most throws are legitimate programmer-error checks.
  Bugs we've actually shipped came from the four directories above;
  expanding scope without need just adds noise.

## Behavioral runtime tests

Static analysis catches the **shape** of the bug class. Behavioral
tests catch **regressions of specific bugs** with concrete assertions.

Each known bug gets a dedicated test file:

- `contract-booking-form-fields.spec.ts` — v1.4.2 (mergeBookingFormFields
  always preserves fullName + email)
- *(future)* `contract-billing-orgs.spec.ts` — v1.7.3 (getBillingUserById
  returns synthesized record on missing users row)
- *(future)* `contract-billing-portal-action.spec.ts` — v1.8.1
  (createBillingPortalSessionAction redirects on no Stripe customer)

The v1.7.3 + v1.8.1 tests need integration-test infrastructure
(test DB, mocked auth context) which we don't have yet. Until that
lands, the static check + the scoped-directory annotation requirement
catches additions. Adding the integration harness is queued as a
separate v1.10+ task.

## How to add a contract test for a new bug

When fixing a bug that fits this class:

1. **Write the test first** — `tests/unit/contract-<area>.spec.ts`.
   Assert the function handles the edge state gracefully (returns
   structured error / redirects / synthesizes empty record).
2. **Run it** — should fail.
3. **Fix the function** — make the test pass.
4. **Add the annotation** if you keep a throw — the static check will
   fail otherwise.
5. **Update this doc** — add the new test file to the table above.

The discipline: every bug from this class gets a contract test. The
test prevents the same bug from regressing. The annotation makes new
throws explicit decisions, not accidents.
