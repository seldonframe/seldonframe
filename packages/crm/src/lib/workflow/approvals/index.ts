// Barrel export for the approvals module.
// SLICE 10 PR 1 C3 + C5.

export * from "./types";
export * from "./magic-link";
export * from "./api";
export * from "./workspace-secret";
export { DrizzleApprovalStorage } from "./storage-drizzle";
export { makeInMemoryApprovalStorage } from "./storage-memory";
