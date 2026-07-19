// Agent truth slice (Task 2) — the /automations "Custom Workflow — COMING
// SOON" dead-end replaced by an ENABLED two-doors card (Describe it / Record
// it). renderToString, no jsdom (repo convention).

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import { TwoDoorsCard } from "../../../src/components/automations/two-doors-card";

describe("<TwoDoorsCard>", () => {
  test("renders the enabled card with both real links", () => {
    const html = renderToString(<TwoDoorsCard />);
    assert.match(html, /data-two-doors-card/);
    assert.match(html, /Custom Agent/);
  });

  test("'Describe it' links to /studio/agents", () => {
    const html = renderToString(<TwoDoorsCard />);
    assert.match(html, /data-two-doors-describe-link/);
    const m = html.match(/<a[^>]*data-two-doors-describe-link[^>]*href="([^"]+)"/);
    assert.equal(m?.[1], "/studio/agents");
  });

  test("'Record it' links to /record", () => {
    const html = renderToString(<TwoDoorsCard />);
    assert.match(html, /data-two-doors-record-link/);
    const m = html.match(/<a[^>]*data-two-doors-record-link[^>]*href="([^"]+)"/);
    assert.equal(m?.[1], "/record");
  });

  test("no 'COMING SOON' text remains anywhere in the card", () => {
    const html = renderToString(<TwoDoorsCard />);
    assert.ok(!/coming soon/i.test(html));
  });

  test("both links are ALWAYS present in markup — never conditionally hidden (L-36)", () => {
    const html = renderToString(<TwoDoorsCard />);
    const describeCount = (html.match(/data-two-doors-describe-link/g) ?? []).length;
    const recordCount = (html.match(/data-two-doors-record-link/g) ?? []).length;
    assert.equal(describeCount, 1);
    assert.equal(recordCount, 1);
  });
});
