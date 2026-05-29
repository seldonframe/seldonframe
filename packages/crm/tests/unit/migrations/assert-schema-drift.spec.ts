import { test } from "node:test";
import assert from "node:assert/strict";

import { missingColumns, CRITICAL_COLUMNS } from "../../../scripts/assert-schema-drift.mjs";

type Col = { table: string; column: string };

test("missingColumns: returns columns absent from the live set", () => {
  const required: Col[] = [
    { table: "users", column: "stripe_payment_method_id" },
    { table: "users", column: "onboarding_completed_at" },
  ];
  const live = new Set(["users.stripe_payment_method_id"]); // onboarding missing

  const missing = missingColumns(live, required);
  assert.deepEqual(missing, [{ table: "users", column: "onboarding_completed_at" }]);
});

test("missingColumns: nothing missing when all present", () => {
  const required: Col[] = [
    { table: "users", column: "stripe_payment_method_id" },
    { table: "organizations", column: "timezone" },
  ];
  const live = new Set(["users.stripe_payment_method_id", "organizations.timezone"]);

  assert.deepEqual(missingColumns(live, required), []);
});

test("missingColumns: all missing when live set is empty", () => {
  const required: Col[] = [
    { table: "users", column: "a" },
    { table: "users", column: "b" },
  ];
  assert.deepEqual(missingColumns(new Set(), required), required);
});

test("missingColumns: a column with the same name on a different table is not a match", () => {
  // stripe_customer_id exists on several tables; presence on invoices must NOT
  // satisfy a requirement for users.stripe_customer_id.
  const required: Col[] = [{ table: "users", column: "stripe_customer_id" }];
  const live = new Set(["invoices.stripe_customer_id"]); // wrong table

  assert.deepEqual(missingColumns(live, required), required);
});

test("missingColumns: accepts an array for liveColumns too", () => {
  const required: Col[] = [{ table: "users", column: "x" }];
  assert.deepEqual(missingColumns(["users.x"], required), []);
});

test("CRITICAL_COLUMNS seeds the two incident columns", () => {
  const keys = new Set(CRITICAL_COLUMNS.map((c: any) => `${c.table}.${c.column}`));
  assert.ok(keys.has("users.stripe_payment_method_id"), "incident 1 column must be guarded");
  assert.ok(keys.has("users.onboarding_completed_at"), "incident 2 column must be guarded");
  // Every entry names the migration that should add it, so a failure is actionable.
  for (const c of CRITICAL_COLUMNS as any[]) {
    assert.ok(c.migration && typeof c.migration === "string", `${c.table}.${c.column} needs a migration ref`);
  }
});
