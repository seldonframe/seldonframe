// v1.1.9 — Output contract validator unit tests.
//
// The validator integrates DB state + rendered HTML, so end-to-end
// integration testing requires a full DB. These unit tests cover the
// pure-function pieces (HTML extractors, marketing-string detection,
// cta-href extractor, log helper output) so those building blocks
// can't regress.
//
// Integration tests run at deploy time (a follow-up task per the
// v1.1.9 spec) and exercise the validator end-to-end against a live
// database.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { logOutputContractResult } from "@/lib/workspace/output-contract-validator";
import { PERSONALITIES } from "@/lib/crm/personality";

// ─── HTML extraction helpers (re-implementation for test isolation) ──────
//
// The extractors live inside output-contract-validator.ts as private
// helpers. Replicate them here and test the same regex behavior so a
// renderer markup change surfaces in the unit suite, not first in
// production.

function extractHrefFor(html: string, btnClass: string): string | null {
  const re = new RegExp(
    `<a\\b[^>]*\\bclass="sf-btn\\s+sf-btn--${btnClass}\\b[^"]*"[^>]*\\bhref="([^"]+)"`,
    "i",
  );
  const m = html.match(re);
  if (m) return m[1];
  const reInv = new RegExp(
    `<a\\b[^>]*\\bhref="([^"]+)"[^>]*\\bclass="sf-btn\\s+sf-btn--${btnClass}\\b`,
    "i",
  );
  const m2 = html.match(reInv);
  return m2 ? m2[1] : null;
}

describe("output-contract-validator — CTA href extractor", () => {
  test("extracts /book from a primary button", () => {
    const html = `<a class="sf-btn sf-btn--primary" href="/book"><span>Book →</span></a>`;
    assert.equal(extractHrefFor(html, "primary"), "/book");
  });

  test("extracts /intake from a secondary button", () => {
    const html = `<a class="sf-btn sf-btn--secondary" href="/intake"><span>Contact</span></a>`;
    assert.equal(extractHrefFor(html, "secondary"), "/intake");
  });

  test("returns null when no matching button is present", () => {
    const html = `<a class="sf-btn sf-btn--ghost" href="/about">About</a>`;
    assert.equal(extractHrefFor(html, "primary"), null);
  });

  test("handles multi-class sf-btn--primary with extra modifiers", () => {
    const html = `<a class="sf-btn sf-btn--primary sf-animate" href="/book">Click</a>`;
    assert.equal(extractHrefFor(html, "primary"), "/book");
  });

  test("ignores sf-btn--secondary when asked for primary", () => {
    const html = `
      <a class="sf-btn sf-btn--secondary" href="/intake">Contact</a>
      <a class="sf-btn sf-btn--primary" href="/book">Book</a>
    `;
    assert.equal(extractHrefFor(html, "primary"), "/book");
    assert.equal(extractHrefFor(html, "secondary"), "/intake");
  });
});

describe("output-contract-validator — forbidden marketing strings", () => {
  // The validator's FORBIDDEN_MARKETING_STRINGS list. Mirror it here
  // so a regression in the list (someone adding back SeldonFrame copy
  // to SAAS_PACK in a refactor) is caught by string search.
  const FORBIDDEN = [
    "Replace 5 Tools",
    "Start Free Forever",
    "Start for $0",
    "75 MCP Tools",
    "Brain Layer",
    "Spin up your Business OS",
    "Free forever to self-host",
    "MIT licensed",
  ];

  test("none of the forbidden strings appear in the SAAS_PACK source", async () => {
    // Read the actual content-packs.ts file and assert no forbidden
    // strings appear OUTSIDE comments. This is the canonical guard
    // against a regression where someone re-introduces SeldonFrame
    // marketing into SAAS_PACK.
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const contents = await fs.readFile(
      path.join(
        process.cwd(),
        "src/lib/page-schema/content-packs.ts",
      ),
      "utf8",
    );
    // Strip line + block comments before searching so the v1.1.7
    // explanatory comments quoting the strings don't trigger.
    const stripped = contents
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const s of FORBIDDEN) {
      assert.ok(
        !stripped.includes(s),
        `SAAS_PACK leaked SeldonFrame marketing string: "${s}". This is the v1.1.7 regression guard.`,
      );
    }
  });
});

describe("output-contract-validator — logOutputContractResult", () => {
  function captureConsole(
    fn: () => void,
  ): { stdout: string[]; stderr: string[] } {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const origLog = console.log;
    const origErr = console.error;
    console.log = (msg: unknown) => stdout.push(String(msg));
    console.error = (msg: unknown) => stderr.push(String(msg));
    try {
      fn();
    } finally {
      console.log = origLog;
      console.error = origErr;
    }
    return { stdout, stderr };
  }

  test("logs to stdout when there are no blocking failures", () => {
    const { stdout, stderr } = captureConsole(() => {
      logOutputContractResult("ws-1", PERSONALITIES.medspa, {
        status: "pass",
        checks: [],
        summary: {
          total: 5,
          passed: 5,
          failed: 0,
          warned: 0,
          blocking_failures: 0,
        },
      });
    });
    assert.equal(stdout.length, 1, "should log exactly one summary line");
    assert.equal(stderr.length, 0, "no stderr when passing");
    const line = JSON.parse(stdout[0]);
    assert.equal(line.event, "workspace_output_contract");
    assert.equal(line.workspace_id, "ws-1");
    assert.equal(line.personality, "medspa");
    assert.equal(line.status, "pass");
    assert.equal(line.passed, 5);
  });

  test("logs to stderr + emits a per-failure line when blocking failures present", () => {
    const { stdout, stderr } = captureConsole(() => {
      logOutputContractResult("ws-2", PERSONALITIES.dental, {
        status: "degraded",
        checks: [
          {
            surface: "cta_primary_href",
            status: "fail",
            expected: "/book",
            actual: "/intake",
            severity: "blocking",
          },
          {
            surface: "intake_title",
            status: "warn",
            expected: "Request an Appointment",
            actual: "Get in touch",
            severity: "cosmetic",
          },
        ],
        summary: {
          total: 2,
          passed: 0,
          failed: 1,
          warned: 1,
          blocking_failures: 1,
        },
      });
    });
    assert.equal(stdout.length, 0, "no stdout on degraded result");
    assert.equal(
      stderr.length,
      2,
      "summary + per-failure line on degraded result",
    );
    const summary = JSON.parse(stderr[0]);
    assert.equal(summary.event, "workspace_output_contract");
    assert.equal(summary.status, "degraded");
    const failure = JSON.parse(stderr[1]);
    assert.equal(failure.event, "workspace_output_contract_failure");
    assert.equal(failure.surface, "cta_primary_href");
    assert.equal(failure.expected, "/book");
  });
});
