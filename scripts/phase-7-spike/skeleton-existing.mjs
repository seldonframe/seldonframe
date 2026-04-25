#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";

function structuralSkeleton(spec) {
  if (!spec || typeof spec !== "object") return "";
  if (spec.error) return `__error__`;
  const parts = [
    `trigger=${spec?.trigger?.event ?? "?"}`,
    `count=${Array.isArray(spec.steps) ? spec.steps.length : "?"}`,
  ];
  for (const step of spec.steps ?? []) {
    if (step.type === "mcp_tool_call") parts.push(`tool:${step.tool ?? "?"}`);
    else if (step.type === "conversation") parts.push(`conv:${step.channel ?? "?"}`);
    else if (step.type === "branch") parts.push("branch");
    else if (step.type === "wait") parts.push("wait");
    else if (step.type === "end") parts.push("end");
    else parts.push(`?:${step.type}`);
  }
  return parts.join("|");
}

for (const path of process.argv.slice(2)) {
  const obj = JSON.parse(fs.readFileSync(path, "utf8"));
  const sk = structuralSkeleton(obj);
  const h = crypto.createHash("sha256").update(sk).digest("hex").slice(0, 16);
  console.log(`${h}  ${path}  (skeleton: ${sk})`);
}
