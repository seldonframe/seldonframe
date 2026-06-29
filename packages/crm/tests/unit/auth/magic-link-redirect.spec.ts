// The magic-link action must thread a SAFE redirectTo into signIn so a buyer's
// marketplace buy intent survives the email round trip and returns them to the
// agent listing (?install=1) — instead of being dumped on /clients/new.
//
// We use the action's DI seam (the repo idiom from buy-box-auth-actions.spec.ts
// / set-booking-policy.spec.ts: prefer dependency injection over mock.module,
// which is unreliable under tsx's CJS interop) so this runs with NO real
// NextAuth and NO Postgres — we capture exactly what `signIn(..., { redirectTo })`
// receives.
//
// Run:
//   node --import tsx --test tests/unit/auth/magic-link-redirect.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { sendMagicLinkAction } from "../../../src/app/(auth)/signup/actions";

type Captured = { provider: string; redirectTo: string; email: string } | null;

/** A fake signIn that records what the action passed, and resolves (no throw). */
function makeFakeSignIn(box: { captured: Captured }) {
  return async (
    provider: string,
    options: { email: string; redirect: boolean; redirectTo: string },
  ) => {
    box.captured = { provider, redirectTo: options.redirectTo, email: options.email };
    return undefined;
  };
}

function formWith(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const deps = (box: { captured: Captured }) => ({
  signIn: makeFakeSignIn(box),
  assertWritable: () => {},
});

describe("sendMagicLinkAction — redirectTo threading (marketplace buy intent)", () => {
  test("threads a /marketplace/<slug>?install=1 redirectTo straight through to signIn", async () => {
    const box: { captured: Captured } = { captured: null };
    const result = await sendMagicLinkAction(
      {},
      formWith({ email: "buyer@example.com", redirectTo: "/marketplace/247-phone-receptionist?install=1" }),
      deps(box),
    );

    assert.equal(result.sent, true);
    assert.equal(result.email, "buyer@example.com");
    assert.ok(box.captured, "signIn must have been called");
    assert.equal(box.captured!.provider, "resend");
    // The buy intent survives: the magic link will land back on the agent listing.
    assert.equal(box.captured!.redirectTo, "/marketplace/247-phone-receptionist?install=1");
  });

  test("a bare /marketplace redirectTo is allowed (index fallback)", async () => {
    const box: { captured: Captured } = { captured: null };
    await sendMagicLinkAction({}, formWith({ email: "b@example.com", redirectTo: "/marketplace" }), deps(box));
    assert.equal(box.captured!.redirectTo, "/marketplace");
  });

  test("a foreign-host redirectTo is rejected → defaults to /clients/new (no open redirect)", async () => {
    const box: { captured: Captured } = { captured: null };
    await sendMagicLinkAction(
      {},
      formWith({ email: "b@example.com", redirectTo: "https://evil.com/marketplace/x" }),
      deps(box),
    );
    // The absolute URL has no leading slash → sanitizeRedirectTo rejects it.
    assert.equal(box.captured!.redirectTo, "/clients/new");
  });

  test("a // protocol-relative redirectTo is rejected → /clients/new", async () => {
    const box: { captured: Captured } = { captured: null };
    await sendMagicLinkAction(
      {},
      formWith({ email: "b@example.com", redirectTo: "//evil.com/marketplace/x" }),
      deps(box),
    );
    assert.equal(box.captured!.redirectTo, "/clients/new");
  });

  test("no redirectTo at all → the existing /clients/new default (unchanged behavior)", async () => {
    const box: { captured: Captured } = { captured: null };
    await sendMagicLinkAction({}, formWith({ email: "b@example.com" }), deps(box));
    assert.equal(box.captured!.redirectTo, "/clients/new");
  });

  test("the existing /clients/new build-flow redirectTo still passes through untouched", async () => {
    const box: { captured: Captured } = { captured: null };
    await sendMagicLinkAction(
      {},
      formWith({ email: "b@example.com", redirectTo: "/clients/new?url=https%3A%2F%2Facme.com&intent=build" }),
      deps(box),
    );
    assert.equal(box.captured!.redirectTo, "/clients/new?url=https%3A%2F%2Facme.com&intent=build");
  });

  test("an invalid email never reaches signIn (validation guards the action)", async () => {
    const box: { captured: Captured } = { captured: null };
    const result = await sendMagicLinkAction({}, formWith({ email: "not-an-email" }), deps(box));
    assert.equal(result.error, "Enter a valid email address.");
    assert.equal(box.captured, null);
  });
});
