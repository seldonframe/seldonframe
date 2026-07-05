// packages/crm/scripts/vision-shot.mjs
//
// Vision-verify render helper — screenshot a PUBLIC url to a PNG via microlink.
// Reliable headless render: the Chrome-MCP screenshot path is flaky here (the
// CDP `clip.scale` bug + backgrounded-tab 0-viewport), so we render off-box.
// Cache-busts the target url so a JUST-deployed change is captured fresh, not a
// stale cached shot.
//
// Usage:  node scripts/vision-shot.mjs <url> <outPath> [viewportWidth=1280]
// Env:    MICROLINK_API_KEY (optional) → higher rate limits via x-api-key header.
// Exit:   0 + prints the saved path on success; 1 on render failure; 2 on bad args.
//
// Then Read the PNG and grade it against a rubric (see the vision-verify skill).

import { writeFileSync } from "node:fs";

const [, , url, outPath, widthArg] = process.argv;
if (!url || !outPath) {
  console.error("usage: node scripts/vision-shot.mjs <url> <outPath> [viewportWidth=1280]");
  process.exit(2);
}

const width = /^\d+$/.test(widthArg ?? "") ? widthArg : "1280";
const cacheBust = Math.floor(Math.random() * 1e9);
const sep = url.includes("?") ? "&" : "?";
const target = `${url}${sep}vcb=${cacheBust}`;
const api =
  `https://api.microlink.io/?url=${encodeURIComponent(target)}` +
  `&screenshot=true&meta=false&viewport.width=${width}&viewport.height=900&waitUntil=networkidle2`;
const headers = process.env.MICROLINK_API_KEY ? { "x-api-key": process.env.MICROLINK_API_KEY } : {};

const meta = await fetch(api, { headers })
  .then((r) => r.json())
  .catch((e) => ({ status: "fetch_failed", message: String(e) }));

const shotUrl = meta?.data?.screenshot?.url;
if (meta.status !== "success" || !shotUrl) {
  console.error(
    `microlink render failed: status=${meta.status} ${meta.message ?? meta.code ?? ""}`.trim(),
  );
  process.exit(1);
}

const bytes = await fetch(shotUrl).then((r) => r.arrayBuffer());
writeFileSync(outPath, Buffer.from(bytes));
console.log(outPath);
