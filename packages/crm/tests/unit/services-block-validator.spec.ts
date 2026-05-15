import { test } from "node:test";
import assert from "node:assert/strict";

import { BLOCK_REGISTRY } from "@/lib/page-blocks/registry";
import type { Props as ServicesProps } from "@/blocks/services/__generated__/block";

// ─── helpers ────────────────────────────────────────────────────────────

type ServicesItem = {
  icon: string;
  title: string;
  description?: string;
  price_from?: number;
  category?: string;
};

function makeProps(items: Array<{ icon: string; title: string; description?: string }>): ServicesProps {
  return {
    headline: "Our specialized HVAC repair and maintenance services",
    items: items.map((i) => ({
      icon: i.icon,
      title: i.title,
      description:
        i.description ??
        "Detailed service description with adequate length to pass any min-length checks for verbose copy that explains the benefits.",
    })),
  } as ServicesProps;
}

function runValidators(props: ServicesProps): string[] {
  const block = BLOCK_REGISTRY.services;
  if (!block) throw new Error("services block not found in registry");

  return (block.validators ?? [])
    .map((fn: (p: ServicesProps) => string | null) => fn(props))
    .filter((s): s is string => s !== null);
}

// ─── tests ──────────────────────────────────────────────────────────────

test("accepts non-empty distinct icon names without checking an allowlist", () => {
  // These were rejected by the old allowlist on 2026-05-15.
  const errors = runValidators(
    makeProps([
      { icon: "shield_check", title: "HVAC Maintenance" },
      { icon: "wind", title: "Duct Services" },
      { icon: "building_2", title: "Commercial HVAC" },
    ])
  );
  const allowlistErrors = errors.filter((e) => e.includes("icon_in_allowlist"));
  assert.equal(
    allowlistErrors.length,
    0,
    `allowlist error should not fire; errors: ${errors.join(" | ")}`
  );
});

test("rejects empty icon strings with icon_required", () => {
  const errors = runValidators(
    makeProps([
      { icon: "", title: "Service A" },
      { icon: "shield", title: "Service B" },
    ])
  );
  const required = errors.find((e) => e.startsWith("icon_required"));
  assert.ok(required, `expected icon_required, got: ${errors.join(" | ")}`);
  assert.match(required!, /Service A/);
});

test("rejects whitespace-only icon strings with icon_required", () => {
  const errors = runValidators(
    makeProps([
      { icon: "   ", title: "Service A" },
      { icon: "shield", title: "Service B" },
    ])
  );
  const required = errors.find((e) => e.startsWith("icon_required"));
  assert.ok(required, `expected icon_required, got: ${errors.join(" | ")}`);
});

test("rejects duplicate icons across cards with distinct_icons", () => {
  const errors = runValidators(
    makeProps([
      { icon: "shield", title: "A" },
      { icon: "shield", title: "B" },
      { icon: "wrench", title: "C" },
    ])
  );
  const distinct = errors.find((e) => e.startsWith("distinct_icons"));
  assert.ok(distinct, `expected distinct_icons, got: ${errors.join(" | ")}`);
  assert.doesNotMatch(distinct!, /from the allowlist/);
});

test("accepts icons previously rejected by the allowlist (regression)", () => {
  for (const icon of ["shield_check", "wind", "building_2", "umbrella", "tornado"]) {
    const errors = runValidators(
      makeProps([
        { icon, title: "A" },
        { icon: "shield", title: "B" },
      ])
    );
    const allowlistErrors = errors.filter((e) => e.includes("icon_in_allowlist"));
    assert.equal(
      allowlistErrors.length,
      0,
      `"${icon}" should be accepted, got: ${errors.join(" | ")}`
    );
  }
});
