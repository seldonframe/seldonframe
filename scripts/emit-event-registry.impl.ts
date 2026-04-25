// TypeScript implementation for event-registry codegen. Invoked by
// scripts/emit-event-registry.js under `node --import tsx`.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

import {
  buildEventRegistry,
  serializeRegistry,
} from "../packages/crm/src/lib/events/parse-registry";

const checkMode = process.argv.includes("--check");
const repoRoot = path.resolve(__dirname, "..");
const sourcePath = path.join(repoRoot, "packages/core/src/events/index.ts");
const registryPath = path.join(repoRoot, "packages/core/src/events/event-registry.json");

const source = readFileSync(sourcePath, "utf8");
const registry = buildEventRegistry(source);
const serialized = serializeRegistry(registry);

if (checkMode) {
  if (!existsSync(registryPath)) {
    console.error(`[drift] ${path.relative(repoRoot, registryPath)} is missing`);
    console.error("  Run `pnpm emit:event-registry` to generate it, then commit the result.");
    process.exit(1);
  }
  const current = readFileSync(registryPath, "utf8");
  if (current !== serialized) {
    console.error(`[drift] ${path.relative(repoRoot, registryPath)} is out of date`);
    console.error("  Run `pnpm emit:event-registry` to regenerate, then commit the result.");
    process.exit(1);
  }
  console.log(`No drift. ${registry.events.length} events in registry; committed file matches source.`);
  process.exit(0);
}

writeFileSync(registryPath, serialized);
console.log(`[update] wrote ${registry.events.length} events to ${path.relative(repoRoot, registryPath)}`);
