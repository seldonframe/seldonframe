#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";

const c = (v) => Array.isArray(v) ? v.map(c) :
  (v && typeof v === "object"
    ? Object.keys(v).sort().reduce((o, k) => (o[k] = c(v[k]), o), {})
    : v);

for (const path of process.argv.slice(2)) {
  const obj = JSON.parse(fs.readFileSync(path, "utf8"));
  const h = crypto.createHash("sha256").update(JSON.stringify(c(obj))).digest("hex").slice(0, 16);
  console.log(`${h}  ${path}`);
}
