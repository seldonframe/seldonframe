// Install-time reconciliation: reads `## Subscriptions` sections from
// BLOCK.md files being seeded into a workspace, materializes rows
// in block_subscription_registry, and handles G-4 auto-flip for
// dormant subscriptions whose producer block wasn't installed yet.
//
// Shipped in SLICE 1 PR 2 Commit 4 per audit §6.2 + G-4 approval
// (2026-04-22). Called at the tail of seedInitialBlocks so every
// workspace-install pass reconciles subscriptions as part of the
// same transaction.
//
// Design:
//   - Block subscription registration is keyed on (orgId, blockSlug,
//     eventType, handlerName). Same key on re-install = upsert skip.
//     Idempotency enforced at the app layer (see isAlreadyRegistered
//     below) rather than a DB unique constraint — adding a unique
//     constraint would require a migration bump; the app-layer check
//     is equivalent for this v1 and keeps C4 schemaless.
//   - active = (producer block's produces list contains this event).
//     On first install, compute producesList from the seeded set.
//     On later install, re-scan existing dormant rows and flip any
//     whose event is now in the producesList (G-4 "atomic flip to
//     active=true, no half-activated state").
//   - Malformed BLOCK.md's `## Subscriptions` section (parser sets
//     __subscriptions_malformed__) registers NOTHING for that block.
//     The parser-side validator already surfaces the malformed
//     signal; this installer treats it as "skip + move on" so one
//     bad block doesn't block a whole workspace install.

import { parseBlockMd } from "../blocks/block-md";
import type { SubscriptionStorage } from "./types";

export type SeededBlockInput = {
  id: string;
  blockMd: string;
};

export type ReconcileResult = {
  /** New subscriptions created this pass. */
  registered: number;
  /** Previously-dormant subscriptions flipped to active=true. */
  activated: number;
};

export async function reconcileBlockSubscriptions(
  orgId: string,
  seededBlocks: SeededBlockInput[],
  storage: SubscriptionStorage,
): Promise<ReconcileResult> {
  // 1. Parse each block. Malformed subscription sections are silently
  // skipped (the parser flag `__subscriptions_malformed__` already
  // surfaces via mixedShapeFields for validators).
  const parsedBlocks = seededBlocks.map((b) => ({
    id: b.id,
    parsed: parseBlockMd(b.blockMd),
  }));

  // 2. Union of produced events across the seeded set. Used for G-4
  // active/dormant decision + later auto-flip.
  const producesList = new Set<string>();
  for (const { parsed } of parsedBlocks) {
    for (const event of parsed.composition.produces) {
      producesList.add(event);
    }
  }

  // 3. Snapshot existing subscriptions for this org so we can skip
  // duplicates and detect dormant rows to flip.
  const existing = await storage.listSubscriptionsByOrg(orgId);
  const existingKey = (
    blockSlug: string,
    eventType: string,
    handlerName: string,
  ) => `${blockSlug}:${eventType}:${handlerName}`;
  const existingMap = new Map(
    existing.map((s) => [existingKey(s.blockSlug, s.eventType, s.handlerName), s]),
  );

  // 4. Register (new) subscriptions from the seeded blocks.
  let registered = 0;
  for (const { id: blockSlug, parsed } of parsedBlocks) {
    const subscriptions = parsed.composition.subscriptions ?? [];
    for (const sub of subscriptions) {
      const bareEvent = stripBlockSlug(sub.event);
      if (!bareEvent) continue; // schema should refuse but defensive

      const key = existingKey(blockSlug, bareEvent, sub.handler);
      if (existingMap.has(key)) continue; // idempotent — already registered

      const active = producesList.has(bareEvent);
      await storage.registerSubscription({
        orgId,
        blockSlug,
        eventType: bareEvent,
        handlerName: sub.handler,
        idempotencyKeyTemplate: sub.idempotency_key,
        filterPredicate: (sub.filter ?? null) as Record<string, unknown> | null,
        retryPolicy: sub.retry,
        active,
      });
      registered += 1;
    }
  }

  // 5. G-4 auto-flip: existing dormant subscriptions whose event is
  // now in the producesList graduate to active=true.
  let activated = 0;
  for (const s of existing) {
    if (!s.active && producesList.has(s.eventType)) {
      await storage.setSubscriptionActive(s.id, true);
      activated += 1;
      // eslint-disable-next-line no-console
      console.log(
        `[subscription-installer] auto-flip: subscription ${s.id} (${s.blockSlug} → ${s.eventType}) activated because producer block now installed`,
      );
    }
  }

  return { registered, activated };
}

function stripBlockSlug(fullyQualified: string): string | null {
  // Split on first colon — audit §3.4 convention.
  const colon = fullyQualified.indexOf(":");
  if (colon === -1) return null;
  return fullyQualified.slice(colon + 1);
}
