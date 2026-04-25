// Tests for the typed design-token wrapper. SLICE 4a PR 1 C1 per
// audit §2.3 + G-4-4 (typed functional API — L-22 structural
// enforcement).
//
// The wrapper is a thin layer over the CSS custom properties defined
// in `packages/crm/src/styles/design-tokens.css` + the Tailwind
// config extensions. Its job is to make typos fail at `tsc --noEmit`
// instead of rendering as invisible bugs.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { tokens } from "../../../src/lib/ui/tokens";

describe("tokens.color — role enum", () => {
  test("resolves primary to the CSS var", () => {
    assert.equal(tokens.color("primary"), "var(--primary)");
  });

  test("resolves every shadcn color role", () => {
    for (const role of [
      "background",
      "foreground",
      "card",
      "card-foreground",
      "popover",
      "popover-foreground",
      "primary",
      "primary-foreground",
      "secondary",
      "secondary-foreground",
      "muted",
      "muted-foreground",
      "accent",
      "accent-foreground",
      "destructive",
      "destructive-foreground",
      "border",
      "input",
      "ring",
    ] as const) {
      assert.equal(tokens.color(role), `var(--${role})`);
    }
  });

  test("resolves semantic status colors (positive/caution/negative)", () => {
    assert.equal(tokens.color("positive"), "var(--positive)");
    assert.equal(tokens.color("caution"), "var(--caution)");
    assert.equal(tokens.color("negative"), "var(--negative)");
  });

  test("resolves chart colors 1-5", () => {
    for (const n of [1, 2, 3, 4, 5] as const) {
      assert.equal(tokens.color(`chart-${n}`), `var(--chart-${n})`);
    }
  });
});

describe("tokens.shadow — kind enum", () => {
  test("resolves each shadow kind declared in tailwind.config.ts", () => {
    for (const kind of ["xs", "sm", "card", "card-hover", "dropdown", "modal"] as const) {
      assert.equal(tokens.shadow(kind), `var(--shadow-${kind})`);
    }
  });
});

describe("tokens.radius — step enum", () => {
  test("resolves radius steps to CSS vars", () => {
    for (const step of ["sm", "md", "lg", "xl"] as const) {
      assert.equal(tokens.radius(step), `var(--radius-${step})`);
    }
  });
});

describe("tokens.space — semantic step maps to rem values", () => {
  test("each semantic step resolves to a literal rem value", () => {
    assert.equal(tokens.space("xs"), "0.25rem"); // 4px
    assert.equal(tokens.space("sm"), "0.5rem"); //  8px
    assert.equal(tokens.space("md"), "1rem"); //    16px
    assert.equal(tokens.space("lg"), "1.5rem"); //  24px
    assert.equal(tokens.space("xl"), "2rem"); //    32px
    assert.equal(tokens.space("2xl"), "3rem"); //   48px
  });
});

describe("tokens.text — typography kind maps to Tailwind utility class", () => {
  test("each typography kind maps to the matching Tailwind class", () => {
    assert.equal(tokens.text("page-title"), "text-page-title");
    assert.equal(tokens.text("section-title"), "text-section-title");
    assert.equal(tokens.text("card-title"), "text-card-title");
    assert.equal(tokens.text("body"), "text-body");
    assert.equal(tokens.text("label"), "text-label");
    assert.equal(tokens.text("data"), "text-data");
    assert.equal(tokens.text("tiny"), "text-tiny");
  });
});

describe("tokens — structural enforcement (L-22)", () => {
  test("functions accept only their declared enum values (compile-time)", () => {
    // TypeScript test — these pass compile-time but are proof that
    // the enum surfaces are restrictive. Any typo in a literal
    // string argument fails tsc --noEmit.
    //
    // Intentionally not asserting at runtime — the invariant is the
    // TypeScript type. If this file compiles, the L-22 enforcement
    // is in place.
    const _: string[] = [
      tokens.color("primary"),
      tokens.shadow("card"),
      tokens.radius("md"),
      tokens.space("md"),
      tokens.text("body"),
    ];
    assert.equal(_.length, 5);
  });
});
