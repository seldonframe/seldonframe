// Barrel export for the approvals module.
// SLICE 10 PR 1 C3 + C5; PR 2 C1 (notifier).

export * from "./types";
export * from "./magic-link";
export * from "./api";
export * from "./workspace-secret";
export * from "./notifier";
export * from "./contact-resolver";
export * from "./cron-sweep";
export { DrizzleApprovalStorage } from "./storage-drizzle";
export { makeInMemoryApprovalStorage } from "./storage-memory";
