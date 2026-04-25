// Barrel export for the approvals module.
// SLICE 10 PR 1 C3.

export * from "./types";
export * from "./magic-link";
export { DrizzleApprovalStorage } from "./storage-drizzle";
export { makeInMemoryApprovalStorage } from "./storage-memory";
