// TDD guardrail for the programmatic-SEO/GEO registry. This is the truthfulness
// + structural contract every agent page depends on:
//   - every job carries a CITED pain stat with a real https source (GEO),
//   - every job has ≥3 FAQ (serialized to schema.org FAQPage),
//   - every canonicalAgentSlug maps to a REAL starter-pack id or archetype id
//     (so the Deploy CTA instantiates a working agent — no dangling links),
//   - vertical composition tailors the copy to the trade,
//   - unknown slugs throw, and the pair-count math is exactly jobs × verticals.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AGENT_JOBS,
  getJob,
  jobForMarketplaceSlug,
  allJobVerticalPairs,
  composePageCopy,
  deployHrefFor,
  relatedJobsForVertical,
  resolveStarterIdForCanonicalAgent,
  TOOL_MARK_KEYS,
  type AgentJob,
} from "./agent-pages";

const TOOL_MARKS = new Set<string>(TOOL_MARK_KEYS);
import { VERTICALS, getVertical } from "./verticals";
import { STARTER_TEMPLATES } from "@/lib/agent-templates/starter-pack";
import { getArchetype } from "@/lib/agents/archetypes";
import { MARKETPLACE_SEED } from "@/components/marketplace/marketplace-seed";

const SEED_SLUGS = new Set(MARKETPLACE_SEED.map((a) => a.slug));

const STARTER_IDS = new Set(STARTER_TEMPLATES.map((s) => s.id));

// ─── registry shape + counts ──────────────────────────────────────────────────

test("registry has ~10 jobs and ~16 verticals", () => {
  assert.ok(AGENT_JOBS.length >= 10, `expected ≥10 jobs, got ${AGENT_JOBS.length}`);
  assert.ok(VERTICALS.length >= 16, `expected ≥16 verticals, got ${VERTICALS.length}`);
});

test("the 10 planned job slugs are all present", () => {
  const expected = [
    "ai-receptionist",
    "google-review-agent",
    "missed-call-text-back",
    "speed-to-lead",
    "ai-lead-qualifier",
    "booking-concierge",
    "quote-estimate-agent",
    "win-back-agent",
    "ai-social-media",
    "website-support-chat",
  ];
  const have = new Set(AGENT_JOBS.map((j) => j.slug));
  for (const slug of expected) {
    assert.ok(have.has(slug), `missing planned job: ${slug}`);
  }
});

test("the 16 planned vertical slugs are all present", () => {
  const expected = [
    "plumbers",
    "hvac",
    "roofers",
    "electricians",
    "landscapers",
    "garage-door",
    "dentists",
    "med-spas",
    "chiropractors",
    "law-firms",
    "real-estate",
    "salons",
    "barbers",
    "auto-repair",
    "restaurants",
    "cleaning",
  ];
  const have = new Set(VERTICALS.map((v) => v.slug));
  for (const slug of expected) {
    assert.ok(have.has(slug), `missing planned vertical: ${slug}`);
  }
});

test("job slugs are unique", () => {
  const slugs = AGENT_JOBS.map((j) => j.slug);
  assert.equal(new Set(slugs).size, slugs.length, "duplicate job slug");
});

test("vertical slugs are unique", () => {
  const slugs = VERTICALS.map((v) => v.slug);
  assert.equal(new Set(slugs).size, slugs.length, "duplicate vertical slug");
});

// ─── GEO truthfulness: every job has a CITED stat with a REAL source ──────────

function assertRealSourceUrl(url: string, ctx: string) {
  assert.ok(typeof url === "string" && url.length > 0, `${ctx}: empty url`);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    assert.fail(`${ctx}: painStat.source url is not a valid URL: ${url}`);
    return;
  }
  assert.equal(parsed.protocol, "https:", `${ctx}: source url must be https (${url})`);
  // A real source has a registrable domain (a dot in the host), not localhost
  // or a bare placeholder.
  assert.ok(parsed.hostname.includes("."), `${ctx}: source url host looks fake (${url})`);
  assert.ok(
    !/example\.(com|org|net)/i.test(parsed.hostname),
    `${ctx}: source url must not be an example.com placeholder (${url})`,
  );
}

for (const job of AGENT_JOBS) {
  test(`job '${job.slug}' carries a cited pain stat with a real source`, () => {
    assert.ok(job.painStat, `${job.slug}: missing painStat`);
    assert.ok(
      job.painStat.text.trim().length > 12,
      `${job.slug}: painStat.text too short to be a real claim`,
    );
    assert.ok(
      job.painStat.source.trim().length > 2,
      `${job.slug}: painStat.source (the attributed body) is empty`,
    );
    assertRealSourceUrl(job.painStat.url, `${job.slug}`);
  });

  test(`job '${job.slug}' has ≥3 FAQ entries with non-empty Q and A`, () => {
    assert.ok(job.faq.length >= 3, `${job.slug}: expected ≥3 FAQ, got ${job.faq.length}`);
    for (const item of job.faq) {
      assert.ok(item.q.trim().length > 0, `${job.slug}: empty FAQ question`);
      assert.ok(item.a.trim().length > 0, `${job.slug}: empty FAQ answer`);
    }
  });

  test(`job '${job.slug}' has a valid canonicalAgentSlug (real starter or archetype)`, () => {
    if (job.canonicalKind === "starter") {
      assert.ok(
        STARTER_IDS.has(job.canonicalAgentSlug),
        `${job.slug}: canonicalAgentSlug '${job.canonicalAgentSlug}' is not a real starter id`,
      );
    } else {
      assert.ok(
        getArchetype(job.canonicalAgentSlug) !== null,
        `${job.slug}: canonicalAgentSlug '${job.canonicalAgentSlug}' is not a real archetype id`,
      );
    }
  });

  test(`job '${job.slug}' declares at least one surface + an mcp tool hint`, () => {
    assert.ok(job.surfaces.length >= 1, `${job.slug}: no surfaces declared`);
    for (const s of job.surfaces) {
      assert.ok(
        ["voice", "chat", "sms", "email"].includes(s),
        `${job.slug}: invalid surface '${s}'`,
      );
    }
    assert.ok(job.mcpToolHint.trim().length > 0, `${job.slug}: empty mcpToolHint`);
  });

  // ── "How it works" 3-step visual (Task B) ──
  test(`job '${job.slug}' has EXACTLY 3 howItWorks steps with non-empty label + detail`, () => {
    assert.ok(Array.isArray(job.howItWorks), `${job.slug}: missing howItWorks`);
    assert.equal(
      job.howItWorks.length,
      3,
      `${job.slug}: howItWorks must be exactly 3 steps, got ${job.howItWorks.length}`,
    );
    for (const step of job.howItWorks) {
      assert.ok(step.label.trim().length > 0, `${job.slug}: empty howItWorks label`);
      assert.ok(
        step.detail.trim().length > 8,
        `${job.slug}: howItWorks detail too short to be useful`,
      );
    }
  });

  // ── "Works with" tool logos (Task B) ──
  test(`job '${job.slug}' names ≥1 tool, each with a valid mark + non-empty name`, () => {
    assert.ok(Array.isArray(job.tools), `${job.slug}: missing tools`);
    assert.ok(job.tools.length >= 1, `${job.slug}: must name at least one tool`);
    for (const tool of job.tools) {
      assert.ok(tool.name.trim().length > 0, `${job.slug}: empty tool name`);
      assert.ok(
        TOOL_MARKS.has(tool.mark),
        `${job.slug}: tool '${tool.name}' has unknown mark '${tool.mark}'`,
      );
    }
  });
}

// ─── verticals shape ──────────────────────────────────────────────────────────

for (const v of VERTICALS) {
  test(`vertical '${v.slug}' has name, plural, painHook, exampleService`, () => {
    assert.ok(v.name.trim().length > 0, `${v.slug}: empty name`);
    assert.ok(v.plural.trim().length > 0, `${v.slug}: empty plural`);
    assert.ok(v.painHook.trim().length > 10, `${v.slug}: painHook too short`);
    assert.ok(v.exampleService.trim().length > 0, `${v.slug}: empty exampleService`);
  });
}

// ─── lookups + pair math ──────────────────────────────────────────────────────

test("getJob returns the right job and throws on unknown", () => {
  assert.equal(getJob("ai-receptionist").name, "AI Receptionist");
  assert.throws(() => getJob("not-a-real-job"), /unknown job/);
});

test("getVertical returns the right vertical and throws on unknown", () => {
  assert.equal(getVertical("plumbers").plural, "plumbers");
  assert.throws(() => getVertical("not-a-real-vertical"), /unknown vertical/);
});

test("allJobVerticalPairs is exactly jobs × verticals and well-formed", () => {
  const pairs = allJobVerticalPairs();
  assert.equal(pairs.length, AGENT_JOBS.length * VERTICALS.length);
  // No duplicates.
  const keys = pairs.map((p) => `${p.job}__${p.vertical}`);
  assert.equal(new Set(keys).size, keys.length, "duplicate (job,vertical) pair");
  // Every referenced slug resolves.
  for (const p of pairs.slice(0, 5)) {
    assert.doesNotThrow(() => getJob(p.job));
    assert.doesNotThrow(() => getVertical(p.vertical));
  }
});

test("there are at least ~160 total pages (Tier-1 + Tier-2)", () => {
  const total = AGENT_JOBS.length + allJobVerticalPairs().length;
  assert.ok(total >= 160, `expected ≥160 pages, got ${total}`);
});

// ─── copy composition ─────────────────────────────────────────────────────────

test("Tier-1 composition uses the job's own h1 and a stat-backed intro", () => {
  const job = getJob("ai-receptionist");
  const copy = composePageCopy(job);
  assert.equal(copy.h1, job.h1);
  assert.match(copy.title, /SeldonFrame/);
  // The cited stat text is woven into the intro (GEO answer-shaping).
  assert.ok(copy.intro.includes(job.painStat.text), "Tier-1 intro should weave the cited stat");
  assert.ok(copy.metaDescription.length <= 160, "meta description should be ≤160 chars");
  assert.equal(copy.faq.length, job.faq.length);
});

test("Tier-2 composition tailors the headline + intro to the vertical", () => {
  const job = getJob("ai-receptionist");
  const vertical = getVertical("plumbers");
  const copy = composePageCopy(job, vertical);
  // Headline names the trade.
  assert.match(copy.h1, /Plumbers/);
  assert.match(copy.title, /Plumbers/);
  // Intro weaves the vertical pain hook + example service + the cited stat.
  assert.ok(copy.intro.includes(vertical.painHook), "Tier-2 intro should weave the vertical painHook");
  assert.ok(
    copy.intro.includes(vertical.exampleService),
    "Tier-2 intro should mention the vertical example service",
  );
  assert.ok(copy.intro.includes(job.painStat.text), "Tier-2 intro should weave the cited stat");
  // The first FAQ is localized to the trade.
  assert.match(copy.faq[0].q, /plumbers/);
});

test("Tier-2 composition differs from Tier-1 for the same job", () => {
  const job = getJob("google-review-agent");
  const t1 = composePageCopy(job);
  const t2 = composePageCopy(job, getVertical("dentists"));
  assert.notEqual(t1.h1, t2.h1);
  assert.notEqual(t1.title, t2.title);
  assert.notEqual(t1.intro, t2.intro);
});

test("composition is well-formed for EVERY job × vertical (no empty/blank fields)", () => {
  for (const job of AGENT_JOBS) {
    const t1 = composePageCopy(job);
    assert.ok(t1.h1.length > 0 && t1.title.length > 0 && t1.intro.length > 0, `${job.slug} T1 blank`);
    assert.ok(t1.metaDescription.length > 0, `${job.slug} T1 empty meta`);
    for (const v of VERTICALS) {
      const t2 = composePageCopy(job, v);
      assert.ok(
        t2.h1.length > 0 && t2.title.length > 0 && t2.intro.length > 0,
        `${job.slug} × ${v.slug} blank`,
      );
      assert.ok(t2.faq.length >= 3, `${job.slug} × ${v.slug} lost FAQ`);
      // No stray "undefined"/"null" leaked into composed prose.
      assert.ok(!/\bundefined\b|\bnull\b/.test(t2.intro), `${job.slug} × ${v.slug} leaked undefined/null`);
      assert.ok(!/\bundefined\b|\bnull\b/.test(t2.title), `${job.slug} × ${v.slug} title leaked`);
    }
  }
});

// ─── CTA wiring ───────────────────────────────────────────────────────────────

test("deployHrefFor carries the canonical agent + build intent", () => {
  const job = getJob("ai-receptionist");
  const href = deployHrefFor(job);
  assert.ok(href.startsWith("/clients/new?"), "deploy href targets the build flow");
  assert.match(href, /agent=ai-phone-receptionist/, "carries the canonical agent slug");
  assert.match(href, /intent=build/, "carries the build intent");
  // Tier-2 adds the vertical hint.
  const href2 = deployHrefFor(job, getVertical("plumbers"));
  assert.match(href2, /vertical=plumbers/, "Tier-2 deploy href carries the vertical");
});

test("every job's deploy href uses a REAL canonical agent slug", () => {
  for (const job of AGENT_JOBS) {
    const href = deployHrefFor(job);
    // The slug in the href must equal the canonical slug we validated above.
    assert.match(href, new RegExp(`agent=${job.canonicalAgentSlug.replace(/[-]/g, "[-]")}`));
  }
});

test("every job.marketplaceSlug (when set) resolves to a real listing + reverse lookup is symmetric", () => {
  for (const job of AGENT_JOBS) {
    if (!job.marketplaceSlug) continue;
    assert.ok(
      SEED_SLUGS.has(job.marketplaceSlug),
      `${job.slug}: marketplaceSlug '${job.marketplaceSlug}' has no matching listing (would 404)`,
    );
    // Reverse lookup must round-trip to the same job.
    const back = jobForMarketplaceSlug(job.marketplaceSlug);
    assert.equal(back?.slug, job.slug, `${job.slug}: jobForMarketplaceSlug round-trip mismatch`);
  }
  // Unknown listing slug → undefined.
  assert.equal(jobForMarketplaceSlug("not-a-listing"), undefined);
});

test("relatedJobsForVertical returns siblings (excludes self), capped", () => {
  const related = relatedJobsForVertical("ai-receptionist", 5);
  assert.ok(related.length > 0 && related.length <= 5);
  assert.ok(!related.some((j) => j.slug === "ai-receptionist"), "must exclude the current job");
});

// Readability checks on the composed Tier-2 intro: correct article ("An AI…",
// not "A AI…"), no doubled articles, no "company business" redundancy, and the
// vertical lede actually got woven in.
test("composed Tier-2 intro reads cleanly (articles + no redundancy)", () => {
  for (const job of AGENT_JOBS as AgentJob[]) {
    for (const vSlug of ["hvac", "plumbers", "dentists", "auto-repair", "law-firms"]) {
      const v = getVertical(vSlug);
      const copy = composePageCopy(job, v);
      assert.ok(!/\bA A\b|\ba a\b|\bA an\b/i.test(copy.intro), `${job.slug}×${vSlug}: doubled article`);
      // "An" before a vowel-initial name, "A" before a consonant.
      assert.ok(!/\bA AI\b/.test(copy.intro), `${job.slug}×${vSlug}: should be 'An AI', not 'A AI'`);
      assert.ok(!/company business|business business/i.test(copy.intro), `${job.slug}×${vSlug}: redundant noun`);
      // The lede was woven in (use a stable fragment from each lede's start).
      const ledeHead = job.verticalLede.split(",")[0].trim();
      assert.ok(copy.intro.includes(ledeHead), `${job.slug}×${vSlug}: lede not woven in`);
    }
  }
});

// ─── Deploy-CTA → starter instantiation mapping ────────────────────────────────
//
// The pure mapper the build pipeline calls post-build: it turns the SEO page's
// canonicalAgentSlug (which may name a starter OR an /automations archetype) into
// a REAL starter-pack id to instantiate into the new workspace — or null when the
// slug is unknown/junk (soft-fail: the build proceeds, no agent is forked). This
// is the load-bearing logic for "click Deploy → land with that agent", so it's
// covered exhaustively here (no DB; the orchestration wiring is integration-level).

test("resolveStarterIdForCanonicalAgent maps a starter-kind slug to itself", () => {
  // The 6 starter-kind canonical slugs ARE starter ids — identity passthrough.
  for (const job of AGENT_JOBS) {
    if (job.canonicalKind !== "starter") continue;
    const starterId = resolveStarterIdForCanonicalAgent(job.canonicalAgentSlug);
    assert.equal(
      starterId,
      job.canonicalAgentSlug,
      `${job.slug}: starter-kind slug should map to itself`,
    );
  }
});

test("resolveStarterIdForCanonicalAgent maps EVERY job's canonical slug to a real starter id", () => {
  // The whole point: no Deploy CTA on any /ai-agents page should be unmappable.
  // Archetype-kind slugs fall back to their closest conversational starter.
  for (const job of AGENT_JOBS) {
    const starterId = resolveStarterIdForCanonicalAgent(job.canonicalAgentSlug);
    assert.ok(
      starterId !== null,
      `${job.slug}: canonical slug '${job.canonicalAgentSlug}' resolved to null — Deploy would land no agent`,
    );
    assert.ok(
      STARTER_IDS.has(starterId as string),
      `${job.slug}: resolved '${starterId}' is not a real starter id`,
    );
  }
});

test("resolveStarterIdForCanonicalAgent maps the 4 archetype slugs to their closest starter", () => {
  // Archetypes are event-triggered automations, not forkable conversational
  // templates — so the Deploy CTA instantiates the closest conversational starter
  // and the build proceeds (graceful handling, never a dangling deploy).
  assert.equal(resolveStarterIdForCanonicalAgent("review-requester"), "website-support-chat");
  assert.equal(resolveStarterIdForCanonicalAgent("missed-call-text-back"), "ai-phone-receptionist");
  assert.equal(resolveStarterIdForCanonicalAgent("speed-to-lead"), "lead-qualifier-intake");
  assert.equal(resolveStarterIdForCanonicalAgent("win-back"), "lead-qualifier-intake");
});

test("resolveStarterIdForCanonicalAgent returns null for unknown / junk / empty input (soft-fail)", () => {
  assert.equal(resolveStarterIdForCanonicalAgent("not-a-real-agent"), null);
  assert.equal(resolveStarterIdForCanonicalAgent(""), null);
  assert.equal(resolveStarterIdForCanonicalAgent("   "), null);
  // Defensive against hostile/garbage params smuggled onto the query string.
  assert.equal(resolveStarterIdForCanonicalAgent("../../etc/passwd"), null);
});

test("resolveStarterIdForCanonicalAgent trims surrounding whitespace before resolving", () => {
  assert.equal(resolveStarterIdForCanonicalAgent("  ai-phone-receptionist  "), "ai-phone-receptionist");
  assert.equal(resolveStarterIdForCanonicalAgent(" speed-to-lead "), "lead-qualifier-intake");
});
