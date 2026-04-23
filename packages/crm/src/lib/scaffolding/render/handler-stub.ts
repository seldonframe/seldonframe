// Subscription handler stub — one file per declared subscription.
//
// Shipped in SLICE 2 PR 1 Commit 3 per audit §3.6. Produces a
// compileable TypeScript file whose body is a TODO marker + a log
// call. The builder replaces the TODO with real logic; until then,
// the handler registers with the dispatcher and logs on invocation
// (useful for dry-run verification).

import type { BlockSpecSubscription } from "../spec";

export function renderHandlerStub(subscription: BlockSpecSubscription): string {
  const { handlerName, description } = subscription;

  return [
    `// ${handlerName} — subscription handler scaffolded ${new Date().toISOString().slice(0, 10)}.`,
    "//",
    `// Intent: ${description}`,
    "//",
    "// TODO (scaffold-default): implement the handler body. The runtime",
    "// (lib/subscriptions/dispatcher.ts cron sweep) invokes this with:",
    "//   - event: SubscriptionEvent — { type, data, orgId, eventLogId, emittedAt }",
    "//   - ctx:   SubscriptionHandlerContext — { orgId, log }",
    "// Return void or Promise<void>. Throw to trigger retry (audit §4.7).",
    "",
    'import type { SubscriptionEvent, SubscriptionHandler, SubscriptionHandlerContext } from "@/lib/subscriptions/dispatcher";',
    'import { registerSubscriptionHandler } from "@/lib/subscriptions/handler-registry";',
    "",
    `export const ${handlerName}: SubscriptionHandler = async (`,
    "  event: SubscriptionEvent,",
    "  ctx: SubscriptionHandlerContext,",
    "): Promise<void> => {",
    "  // TODO (scaffold-default): implement",
    `  ctx.log("${handlerName} invoked", { eventLogId: event.eventLogId, eventType: event.type });`,
    "};",
    "",
    `registerSubscriptionHandler("${handlerName}", ${handlerName});`,
    "",
  ].join("\n");
}
