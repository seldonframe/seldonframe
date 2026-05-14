import { test } from "node:test";
import assert from "node:assert/strict";

test("parallel eval: total time ≈ slowest scenario, not sum", async () => {
  const scenarios = ["s1", "s2", "s3"];
  const delays = [100, 200, 50];

  async function runOne(name: string, delayMs: number): Promise<{ id: string; passed: boolean }> {
    await new Promise((r) => setTimeout(r, delayMs));
    return { id: name, passed: true };
  }

  const t0 = Date.now();
  const results = await Promise.all(
    scenarios.map((s, i) => runOne(s, delays[i]))
  );
  const elapsed = Date.now() - t0;

  assert.ok(elapsed < 300, `parallel elapsed ${elapsed}ms should be < 300ms`);
  assert.equal(results.length, 3);
  assert.equal(results[0].id, "s1");
  assert.equal(results[1].id, "s2");
  assert.equal(results[2].id, "s3");
});

test("parallel eval: rejected scenario doesn't break others", async () => {
  async function runOne(i: number): Promise<{ id: number; passed: boolean }> {
    if (i === 1) throw new Error("boom");
    return { id: i, passed: true };
  }

  const results = await Promise.all(
    [0, 1, 2].map(async (i) => {
      try {
        return await runOne(i);
      } catch (err) {
        return { id: i, passed: false, error: String(err) };
      }
    })
  );

  assert.equal(results.length, 3);
  assert.equal(results[0].passed, true);
  assert.equal(results[1].passed, false);
  assert.equal((results[1] as any).error, "Error: boom");
  assert.equal(results[2].passed, true);
});
