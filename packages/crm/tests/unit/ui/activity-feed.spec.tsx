// Tests for <ActivityFeed>. SLICE 4a PR 2 C3 per audit §2.1.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";

import {
  ActivityFeed,
  type ActivityItem,
} from "../../../src/components/ui-composition/activity-feed";

const FIXED_NOW = new Date("2026-04-23T12:00:00Z");

const sampleItems: ActivityItem[] = [
  {
    id: "a1",
    type: "task",
    subject: "Follow up with Alice",
    createdAt: "2026-04-23T08:30:00Z",
    actor: "Max",
  },
  {
    id: "a2",
    type: "note",
    subject: "Cold lead warmed up",
    description: "Replied to last weeks thread.",
    createdAt: "2026-04-22T16:00:00Z",
    actor: "Max",
  },
  {
    id: "a3",
    type: "call",
    subject: "Discovery call",
    createdAt: "2026-04-10T15:00:00Z",
  },
];

describe("<ActivityFeed> — empty state", () => {
  test("renders default empty state when items is empty", () => {
    const html = renderToString(
      <ActivityFeed items={[]} now={FIXED_NOW} />,
    );
    assert.match(html, /data-activity-feed-empty/);
    assert.match(html, /No activity yet/);
  });

  test("renders custom empty state when provided", () => {
    const html = renderToString(
      <ActivityFeed items={[]} emptyState={<span>Nothing to see here.</span>} now={FIXED_NOW} />,
    );
    assert.match(html, /Nothing to see here\./);
  });
});

describe("<ActivityFeed> — structure + landmarks", () => {
  test("renders feed wrapper with data-activity-feed attribute", () => {
    const html = renderToString(
      <ActivityFeed items={sampleItems} now={FIXED_NOW} />,
    );
    assert.match(html, /data-activity-feed=""/);
  });

  test("ariaLabel surfaces on the feed wrapper", () => {
    const html = renderToString(
      <ActivityFeed
        items={sampleItems}
        ariaLabel="Recent activities"
        now={FIXED_NOW}
      />,
    );
    assert.match(html, /aria-label="Recent activities"/);
  });

  test("renders one entry per item with data-activity-item", () => {
    const html = renderToString(
      <ActivityFeed items={sampleItems} now={FIXED_NOW} />,
    );
    const matches = html.match(/data-activity-item=""/g) ?? [];
    assert.equal(matches.length, 3);
  });

  test("each entry surfaces its subject", () => {
    const html = renderToString(
      <ActivityFeed items={sampleItems} now={FIXED_NOW} />,
    );
    assert.match(html, /Follow up with Alice/);
    assert.match(html, /Cold lead warmed up/);
    assert.match(html, /Discovery call/);
  });

  test("description renders when provided", () => {
    const html = renderToString(
      <ActivityFeed items={sampleItems} now={FIXED_NOW} />,
    );
    assert.match(html, /Replied to last weeks thread\./);
  });

  test("actor renders when provided; omitted entry shows no actor slot", () => {
    const html = renderToString(
      <ActivityFeed items={sampleItems} now={FIXED_NOW} />,
    );
    // At least one mention of "Max" as actor.
    assert.match(html, /Max/);
    // Count data-activity-actor attributes: 2 (a1 + a2 have actor).
    const count = (html.match(/data-activity-actor=""/g) ?? []).length;
    assert.equal(count, 2);
  });
});

describe("<ActivityFeed> — date grouping (Today / Yesterday / older)", () => {
  test("groups Today + Yesterday + absolute date sections", () => {
    const html = renderToString(
      <ActivityFeed items={sampleItems} now={FIXED_NOW} />,
    );
    assert.match(html, /Today/);
    assert.match(html, /Yesterday/);
    // "Apr 10" or "Apr 10, 2026" should appear for the older item.
    assert.match(html, /Apr 10/);
  });

  test("items sorted newest-first within each group", () => {
    const today1: ActivityItem = { id: "t1", type: "task", subject: "First today", createdAt: "2026-04-23T05:00:00Z" };
    const today2: ActivityItem = { id: "t2", type: "task", subject: "Second today", createdAt: "2026-04-23T10:00:00Z" };
    const html = renderToString(
      <ActivityFeed items={[today1, today2]} now={FIXED_NOW} />,
    );
    const firstIdx = html.indexOf("Second today");
    const secondIdx = html.indexOf("First today");
    assert.ok(firstIdx > -1 && secondIdx > -1);
    assert.ok(firstIdx < secondIdx, "newer item should render before older within a day");
  });
});

describe("<ActivityFeed> — pagination", () => {
  test("renders no pagination link when nextCursorHref absent", () => {
    const html = renderToString(
      <ActivityFeed items={sampleItems} now={FIXED_NOW} />,
    );
    assert.ok(!html.includes("data-activity-feed-more"));
  });

  test("renders Load more link when nextCursorHref provided", () => {
    const html = renderToString(
      <ActivityFeed
        items={sampleItems}
        nextCursorHref="/activities?cursor=xyz"
        now={FIXED_NOW}
      />,
    );
    assert.match(html, /data-activity-feed-more/);
    assert.match(html, /href="\/activities\?cursor=xyz"/);
    assert.match(html, /Load more/);
  });
});

describe("<ActivityFeed> — type badges", () => {
  test("renders the item type as a visible chip", () => {
    const html = renderToString(
      <ActivityFeed items={[sampleItems[0]]} now={FIXED_NOW} />,
    );
    // type="task" must surface as visible text.
    assert.match(html, /task/);
  });
});
