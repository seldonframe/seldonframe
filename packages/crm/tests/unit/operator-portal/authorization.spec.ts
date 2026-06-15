import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  isEmailAuthorizedForWorkspace,
  normalizeEmail,
  parseAdminAllowlist,
} from "../../../src/lib/operator-portal/authorization";

describe("normalizeEmail", () => {
  test("trims + lowercases", () => {
    assert.equal(normalizeEmail("  Owner@Example.COM  "), "owner@example.com");
  });
  test("returns empty string for null/undefined/blank/non-string", () => {
    assert.equal(normalizeEmail(null), "");
    assert.equal(normalizeEmail(undefined), "");
    assert.equal(normalizeEmail("   "), "");
    assert.equal(normalizeEmail(123 as unknown as string), "");
  });
});

describe("parseAdminAllowlist", () => {
  test("splits comma-separated, trims, lowercases, drops blanks", () => {
    assert.deepEqual(
      parseAdminAllowlist("  Max@SeldonFrame.com , alice@seldonframe.com ,, "),
      ["max@seldonframe.com", "alice@seldonframe.com"],
    );
  });
  test("returns [] for null/undefined/empty", () => {
    assert.deepEqual(parseAdminAllowlist(null), []);
    assert.deepEqual(parseAdminAllowlist(undefined), []);
    assert.deepEqual(parseAdminAllowlist(""), []);
    assert.deepEqual(parseAdminAllowlist("   "), []);
  });
});

describe("isEmailAuthorizedForWorkspace", () => {
  const sources = {
    ownerEmail: "owner@acme.com",
    agencyOwnerEmail: "agency@partner.com",
    adminEmails: ["admin1@seldonframe.com", "admin2@seldonframe.com"],
  };

  test("workspace owner is allowed", () => {
    assert.equal(isEmailAuthorizedForWorkspace("owner@acme.com", sources), true);
  });

  test("parent-agency owner is allowed", () => {
    assert.equal(
      isEmailAuthorizedForWorkspace("agency@partner.com", sources),
      true,
    );
  });

  test("platform admin (allowlist) is allowed", () => {
    assert.equal(
      isEmailAuthorizedForWorkspace("admin2@seldonframe.com", sources),
      true,
    );
  });

  test("unrelated email is denied", () => {
    assert.equal(
      isEmailAuthorizedForWorkspace("attacker@evil.com", sources),
      false,
    );
  });

  test("match is case-insensitive (owner)", () => {
    assert.equal(isEmailAuthorizedForWorkspace("OWNER@ACME.COM", sources), true);
  });

  test("match is whitespace-insensitive (owner)", () => {
    assert.equal(
      isEmailAuthorizedForWorkspace("  owner@acme.com  ", sources),
      true,
    );
  });

  test("case + whitespace tolerated against a messy source value", () => {
    assert.equal(
      isEmailAuthorizedForWorkspace("Agency@Partner.com", {
        ownerEmail: null,
        agencyOwnerEmail: "  AGENCY@partner.COM ",
        adminEmails: [],
      }),
      true,
    );
  });

  test("admin match is case-insensitive on both sides", () => {
    assert.equal(
      isEmailAuthorizedForWorkspace("Admin1@SeldonFrame.com", {
        adminEmails: ["  ADMIN1@seldonframe.com "],
      }),
      true,
    );
  });

  test("null / empty submitted email is denied", () => {
    assert.equal(isEmailAuthorizedForWorkspace(null, sources), false);
    assert.equal(isEmailAuthorizedForWorkspace(undefined, sources), false);
    assert.equal(isEmailAuthorizedForWorkspace("", sources), false);
    assert.equal(isEmailAuthorizedForWorkspace("   ", sources), false);
  });

  test("denied when all sources are null/empty even with a real email", () => {
    assert.equal(
      isEmailAuthorizedForWorkspace("anyone@anywhere.com", {
        ownerEmail: null,
        agencyOwnerEmail: undefined,
        adminEmails: null,
      }),
      false,
    );
    // and with a completely empty sources object
    assert.equal(
      isEmailAuthorizedForWorkspace("anyone@anywhere.com", {}),
      false,
    );
  });

  test("empty-string source values never match an empty candidate", () => {
    // Defensive: a blank owner email must not authorize a blank submission.
    assert.equal(
      isEmailAuthorizedForWorkspace("", { ownerEmail: "", agencyOwnerEmail: "" }),
      false,
    );
  });

  // ── Production demo invariants (must never regress) ──────────────────────
  // Seldon Studio agency (aa4c7c52, owner dresslikeag@gmail.com) owns its
  // demo workspaces directly, so dresslikeag matches BOTH owner and
  // agency-owner. maximehoule100 is the SF platform admin (SF_SUPERADMIN_EMAILS)
  // and is NOT the owner of those workspaces — they get in via the admin path.
  describe("demo login invariants", () => {
    const studioWorkspace = {
      ownerEmail: "dresslikeag@gmail.com",
      agencyOwnerEmail: "dresslikeag@gmail.com",
      adminEmails: ["maximehoule100@gmail.com"],
    };

    test("dresslikeag@gmail.com can log into a Seldon Studio workspace", () => {
      assert.equal(
        isEmailAuthorizedForWorkspace("dresslikeag@gmail.com", studioWorkspace),
        true,
      );
    });

    test("maximehoule100@gmail.com (platform admin) can log into a Seldon Studio workspace", () => {
      assert.equal(
        isEmailAuthorizedForWorkspace("maximehoule100@gmail.com", studioWorkspace),
        true,
      );
    });

    test("maximehoule100@gmail.com can log into his own workspace as owner", () => {
      assert.equal(
        isEmailAuthorizedForWorkspace("maximehoule100@gmail.com", {
          ownerEmail: "maximehoule100@gmail.com",
          agencyOwnerEmail: null,
          adminEmails: [],
        }),
        true,
      );
    });

    test("a random stranger still cannot log into a Seldon Studio workspace", () => {
      assert.equal(
        isEmailAuthorizedForWorkspace("stranger@gmail.com", studioWorkspace),
        false,
      );
    });
  });
});
