// Tests for reconcileBlockSubscriptions — install-time wiring that
// reads BLOCK.md `## Subscriptions` sections and materializes rows
// into block_subscription_registry with G-4 auto-flip for dormant
// subscriptions (producer not yet installed).
//
// Audit §6.2 + G-4 approval (2026-04-22).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { reconcileBlockSubscriptions } from "../../../src/lib/subscriptions/installer";
import { InMemorySubscriptionStorage } from "./storage-memory";

function blockMdWithSubscription(opts: {
  blockId: string;
  produces?: string[];
  subs: Array<{ event: string; handler: string; retryMax?: number }>;
}): string {
  const header = `# BLOCK: ${opts.blockId}\n\n## Composition Contract\n\n`;
  const producesLine = opts.produces
    ? `produces: ${JSON.stringify(opts.produces.map((e) => ({ event: e })))}\n`
    : "produces: []\n";
  const subsJson = JSON.stringify(
    opts.subs.map((s) => ({
      event: s.event,
      handler: s.handler,
      ...(s.retryMax ? { retry: { max: s.retryMax } } : {}),
    })),
  );
  return (
    header +
    producesLine +
    "verbs: [test]\n" +
    "compose_with: [crm]\n" +
    "\n## Subscriptions\n\n" +
    "<!-- SUBSCRIPTIONS:START -->\n" +
    subsJson +
    "\n<!-- SUBSCRIPTIONS:END -->\n"
  );
}

describe("reconcileBlockSubscriptions — registration", () => {
  test("registers subscription when producer is in the seeded set (active=true)", async () => {
    const storage = new InMemorySubscriptionStorage();
    const seeded = [
      {
        id: "caldiy-booking",
        blockMd: blockMdWithSubscription({
          blockId: "caldiy-booking",
          produces: ["booking.created"],
          subs: [],
        }),
      },
      {
        id: "crm",
        blockMd: blockMdWithSubscription({
          blockId: "crm",
          subs: [
            { event: "caldiy-booking:booking.created", handler: "logActivityOnBookingCreate" },
          ],
        }),
      },
    ];
    const result = await reconcileBlockSubscriptions("org-1", seeded, storage);
    assert.equal(result.registered, 1);
    assert.equal(result.activated, 0, "registered active; nothing to flip");
    assert.equal(storage.subscriptions.length, 1);
    const sub = storage.subscriptions[0];
    assert.equal(sub.blockSlug, "crm");
    assert.equal(sub.eventType, "booking.created");
    assert.equal(sub.handlerName, "logActivityOnBookingCreate");
    assert.equal(sub.active, true, "active because producer in seeded set");
  });

  test("subscription registered dormant (active=false) when producer absent from seeded set (G-4)", async () => {
    const storage = new InMemorySubscriptionStorage();
    const seeded = [
      {
        id: "crm",
        blockMd: blockMdWithSubscription({
          blockId: "crm",
          subs: [
            { event: "caldiy-booking:booking.created", handler: "logActivityOnBookingCreate" },
          ],
        }),
      },
    ];
    const result = await reconcileBlockSubscriptions("org-1", seeded, storage);
    assert.equal(result.registered, 1);
    assert.equal(storage.subscriptions[0].active, false, "dormant — producer not installed");
  });

  test("block subscribing to its own produced event registers as active", async () => {
    // Edge case — a block can subscribe to events it itself emits.
    const storage = new InMemorySubscriptionStorage();
    const seeded = [
      {
        id: "crm",
        blockMd: blockMdWithSubscription({
          blockId: "crm",
          produces: ["contact.created"],
          subs: [{ event: "crm:contact.created", handler: "onContactCreate" }],
        }),
      },
    ];
    const result = await reconcileBlockSubscriptions("org-1", seeded, storage);
    assert.equal(result.registered, 1);
    assert.equal(storage.subscriptions[0].active, true);
  });

  test("idempotent — re-running reconcile doesn't create duplicates", async () => {
    const storage = new InMemorySubscriptionStorage();
    const seeded = [
      {
        id: "caldiy-booking",
        blockMd: blockMdWithSubscription({
          blockId: "caldiy-booking",
          produces: ["booking.created"],
          subs: [],
        }),
      },
      {
        id: "crm",
        blockMd: blockMdWithSubscription({
          blockId: "crm",
          subs: [{ event: "caldiy-booking:booking.created", handler: "logActivityOnBookingCreate" }],
        }),
      },
    ];
    await reconcileBlockSubscriptions("org-1", seeded, storage);
    await reconcileBlockSubscriptions("org-1", seeded, storage);
    assert.equal(storage.subscriptions.length, 1);
  });
});

describe("reconcileBlockSubscriptions — G-4 auto-flip on later install", () => {
  test("dormant subscription flips to active=true when producer block arrives later", async () => {
    const storage = new InMemorySubscriptionStorage();

    // Install 1: only CRM — its subscription goes dormant.
    await reconcileBlockSubscriptions("org-1", [
      {
        id: "crm",
        blockMd: blockMdWithSubscription({
          blockId: "crm",
          subs: [{ event: "caldiy-booking:booking.created", handler: "onBookingCreate" }],
        }),
      },
    ], storage);
    assert.equal(storage.subscriptions[0].active, false, "dormant after first install");

    // Install 2: CRM (existing) + caldiy-booking (new producer). The
    // dormant subscription must flip to active=true atomically.
    const result = await reconcileBlockSubscriptions("org-1", [
      {
        id: "crm",
        blockMd: blockMdWithSubscription({
          blockId: "crm",
          subs: [{ event: "caldiy-booking:booking.created", handler: "onBookingCreate" }],
        }),
      },
      {
        id: "caldiy-booking",
        blockMd: blockMdWithSubscription({
          blockId: "caldiy-booking",
          produces: ["booking.created"],
          subs: [],
        }),
      },
    ], storage);
    assert.equal(result.activated, 1, "one dormant subscription auto-flipped");
    assert.equal(storage.subscriptions[0].active, true);
  });

  test("cross-org isolation — org A's dormant sub not flipped by org B's install", async () => {
    const storage = new InMemorySubscriptionStorage();
    // Org A: CRM with dormant subscription.
    await reconcileBlockSubscriptions("org-A", [
      {
        id: "crm",
        blockMd: blockMdWithSubscription({
          blockId: "crm",
          subs: [{ event: "caldiy-booking:booking.created", handler: "h" }],
        }),
      },
    ], storage);
    // Org B installs caldiy-booking — must NOT flip org A's sub.
    await reconcileBlockSubscriptions("org-B", [
      {
        id: "caldiy-booking",
        blockMd: blockMdWithSubscription({
          blockId: "caldiy-booking",
          produces: ["booking.created"],
          subs: [],
        }),
      },
    ], storage);
    const orgASubs = storage.subscriptions.filter((s) => s.orgId === "org-A");
    assert.equal(orgASubs[0].active, false, "org A's sub still dormant");
  });
});

describe("reconcileBlockSubscriptions — malformed / empty", () => {
  test("block with no subscriptions section is a no-op", async () => {
    const storage = new InMemorySubscriptionStorage();
    const result = await reconcileBlockSubscriptions("org-1", [
      {
        id: "empty",
        blockMd: "# BLOCK: empty\n\n## Composition Contract\n\nproduces: []\n",
      },
    ], storage);
    assert.equal(result.registered, 0);
    assert.equal(storage.subscriptions.length, 0);
  });

  test("block with malformed subscriptions section — registers nothing, surfaces no crash", async () => {
    const storage = new InMemorySubscriptionStorage();
    const bad =
      "# BLOCK: bad\n\n## Composition Contract\n\nproduces: []\n" +
      "\n## Subscriptions\n\n<!-- SUBSCRIPTIONS:START -->\nnot valid json\n<!-- SUBSCRIPTIONS:END -->\n";
    const result = await reconcileBlockSubscriptions("org-1", [{ id: "bad", blockMd: bad }], storage);
    assert.equal(result.registered, 0);
    assert.equal(storage.subscriptions.length, 0);
  });
});
