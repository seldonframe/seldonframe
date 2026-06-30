// SKILL.md is served at the ADVERTISED host — a regression guard.
//
// `set up https://seldonframe.com/SKILL.md` is the line every builder pastes, so
// the marketing host MUST resolve it. SeldonFrame is ONE Next deployment serving
// both seldonframe.com (marketing) and app.seldonframe.com (app) by host routing
// in src/proxy.ts — and the `/SKILL.md` route is host-agnostic: its GET takes no
// request/host and always returns buildSkillMd(). The ONLY way the advertised URL
// could silently break is if a future edit to the proxy `config.matcher` started
// capturing `/SKILL.md` — then a marketing-host request would hit the workspace
// domain-lookup branch and get rewritten to `/s/<slug>/SKILL.md` (a 404). This
// test pins both halves so that regression is caught in CI, not in prod.
//
// Pure + dependency-light: it reads the route's pure builder, and asserts the
// matcher LIST in proxy.ts (read as source text, so we don't drag @/auth + @/db
// into a unit test) has no entry that would capture `/SKILL.md`.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { buildSkillMd, SKILL_MD_BUILD_PATH } from "../../../src/lib/build/skill-md";

const here = path.dirname(fileURLToPath(import.meta.url));
const proxyPath = path.resolve(here, "../../../src/proxy.ts");

/** Extract the literal matcher patterns from proxy.ts's `config.matcher` array,
 *  by source text — avoids importing proxy.ts (which pulls in @/auth, @/db). */
function readProxyMatcherPatterns(): string[] {
  const src = readFileSync(proxyPath, "utf8");
  const block = /matcher:\s*\[([\s\S]*?)\]/.exec(src);
  assert.ok(block, "proxy.ts must declare a config.matcher array");
  return Array.from(block[1].matchAll(/"([^"]+)"/g)).map((m) => m[1]);
}

/** Next matcher semantics, conservatively: an entry matches `pathname` if it is
 *  the exact path, or a `/prefix/:path*` (or `/:path*`) whose prefix the path is
 *  under. That's all this codebase's matcher uses. */
function matcherCapturesSkillMd(pattern: string): boolean {
  const pathname = "/SKILL.md";
  if (pattern === pathname) return true;
  const glob = /^(.*)\/:path\*$/.exec(pattern);
  if (glob) {
    const prefix = glob[1]; // "" for "/:path*"
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  }
  return false;
}

describe("SKILL.md at the advertised host", () => {
  test("the route body is host-agnostic — buildSkillMd() takes no host and is substantial", () => {
    // The route's GET() returns buildSkillMd() unconditionally (no host branch),
    // so the SAME bytes serve on seldonframe.com and app.seldonframe.com.
    const md = buildSkillMd();
    assert.ok(md.length > 800, "SKILL.md should be a substantial doc");
    assert.match(md.split("\n").find((l) => l.trim().length > 0) ?? "", /^#\s/);
  });

  test("the route advertises the /build HTML twin", () => {
    // The Link rel=alternate target the route emits is the human quickstart.
    assert.equal(SKILL_MD_BUILD_PATH, "/build");
  });

  test("the proxy matcher does NOT capture /SKILL.md (so the marketing host serves it directly)", () => {
    const patterns = readProxyMatcherPatterns();
    assert.ok(patterns.length > 0, "sanity: found matcher patterns");
    const offenders = patterns.filter(matcherCapturesSkillMd);
    assert.deepEqual(
      offenders,
      [],
      `proxy matcher must not capture /SKILL.md — offending pattern(s): ${offenders.join(", ")}. ` +
        "If you intend to match it, the marketing-host workspace-rewrite branch will 404 it; " +
        "exclude /SKILL.md from the rewrite instead.",
    );
  });
});
