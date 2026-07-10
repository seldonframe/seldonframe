// TDD guardrail for the AI Recommendation Index data registry
// (src/lib/seo/ai-reco-index-data.ts): scoring math, brand-name
// normalization (GoHighLevel/HighLevel/GHL -> one brand), snapshot shape
// (has a date + at least one engine + at least 5 brands), and the
// no-brand-without-a-receipt integrity rule (every scored brand has >=1
// question appearance it can be traced back to).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  BRANDS,
  QUESTIONS,
  QUESTION_BY_ID,
  SNAPSHOT_DATE,
  ENGINES_SHIPPED,
  METHODOLOGY,
  normalizeBrandName,
  pointsForRank,
  scoreBrand,
  buildLeaderboard,
} from "../../../src/lib/seo/ai-reco-index-data";

describe("pointsForRank", () => {
  test("rank 1 earns the maximum 5 points", () => {
    assert.equal(pointsForRank(1), 5);
  });

  test("rank 5 earns the minimum 1 point", () => {
    assert.equal(pointsForRank(5), 1);
  });

  test("scoring is linear: rank + points always sums to 6", () => {
    for (let rank = 1; rank <= 5; rank++) {
      assert.equal(rank + pointsForRank(rank), 6);
    }
  });
});

describe("normalizeBrandName", () => {
  test("collapses GoHighLevel, HighLevel and GHL to one canonical brand", () => {
    const canonical = normalizeBrandName("GoHighLevel");
    assert.equal(normalizeBrandName("HighLevel"), canonical);
    assert.equal(normalizeBrandName("GHL"), canonical);
    assert.equal(normalizeBrandName("GoHighLevel (GHL)"), canonical);
    assert.equal(normalizeBrandName("GoHighLevel (LeadConnector)"), canonical);
  });

  test("is case-insensitive on aliases", () => {
    assert.equal(normalizeBrandName("ghl"), normalizeBrandName("GoHighLevel"));
  });

  test("passes through an unrecognized brand name unchanged (trimmed)", () => {
    assert.equal(normalizeBrandName("  Some New Tool  "), "Some New Tool");
  });
});

describe("scoreBrand", () => {
  test("sums (6 - rank) across every appearance", () => {
    const jobber = BRANDS.find((b) => b.name === "Jobber");
    assert.ok(jobber, "Jobber must exist in the registry");
    // Jobber appears at rank 1 in two questions in the July 2026 snapshot.
    const expected = jobber.appearances.reduce((sum, a) => sum + pointsForRank(a.rank), 0);
    assert.equal(scoreBrand(jobber), expected);
    assert.ok(expected > 0, "a brand with appearances must score > 0");
  });

  test("a brand with a single rank-1 appearance scores exactly 5", () => {
    const singleRank1 = BRANDS.find((b) => b.appearances.length === 1 && b.appearances[0].rank === 1);
    if (singleRank1) {
      assert.equal(scoreBrand(singleRank1), 5);
    }
  });
});

describe("snapshot shape", () => {
  test("has a snapshot date in YYYY-MM-DD form", () => {
    assert.match(SNAPSHOT_DATE, /^\d{4}-\d{2}-\d{2}$/);
  });

  test("ships at least one engine", () => {
    assert.ok(ENGINES_SHIPPED.length >= 1);
  });

  test("has at least 5 distinct brands on the leaderboard", () => {
    const leaderboard = buildLeaderboard();
    assert.ok(leaderboard.length >= 5, `expected >=5 brands, got ${leaderboard.length}`);
  });

  test("has exactly 10 fixed questions", () => {
    assert.equal(QUESTIONS.length, 10);
  });

  test("every question resolves via QUESTION_BY_ID", () => {
    for (const q of QUESTIONS) {
      assert.equal(QUESTION_BY_ID[q.id]?.text, q.text);
    }
  });

  test("methodology documents the Google AI Overview attempt honestly (not fabricated)", () => {
    if (!ENGINES_SHIPPED.includes("claude" as never)) return;
    // v1 ships Claude-only; the methodology string must say so rather than
    // silently omitting any mention of the second engine.
    assert.match(METHODOLOGY.googleAiOverviewStatus.toLowerCase(), /not (shipped|ship)|attempted/);
  });
});

describe("no brand without a receipt (integrity rule)", () => {
  test("every brand in the registry has at least one appearance", () => {
    for (const brand of BRANDS) {
      assert.ok(
        brand.appearances.length >= 1,
        `${brand.name} has no appearances — every scored brand needs a receipt`,
      );
    }
  });

  test("every appearance references a real question id", () => {
    const validIds = new Set(QUESTIONS.map((q) => q.id));
    for (const brand of BRANDS) {
      for (const a of brand.appearances) {
        assert.ok(validIds.has(a.questionId), `${brand.name} references unknown question "${a.questionId}"`);
      }
    }
  });

  test("every appearance has a rank between 1 and 5 inclusive", () => {
    for (const brand of BRANDS) {
      for (const a of brand.appearances) {
        assert.ok(a.rank >= 1 && a.rank <= 5, `${brand.name} has out-of-range rank ${a.rank}`);
      }
    }
  });

  test("every leaderboard row's score matches the sum of its own appearances", () => {
    const leaderboard = buildLeaderboard();
    for (const row of leaderboard) {
      const expected = row.appearances.reduce((sum, a) => sum + pointsForRank(a.rank), 0);
      assert.equal(row.score, expected, `${row.brand} score mismatch`);
    }
  });
});

describe("buildLeaderboard", () => {
  test("sorts descending by score", () => {
    const leaderboard = buildLeaderboard();
    for (let i = 1; i < leaderboard.length; i++) {
      assert.ok(leaderboard[i - 1].score >= leaderboard[i].score, "leaderboard must be sorted descending");
    }
  });

  test("category filter only returns brands that appeared in that category's questions", () => {
    const crmLeaderboard = buildLeaderboard("crm");
    const crmQuestionIds = new Set(QUESTIONS.filter((q) => q.categories.includes("crm")).map((q) => q.id));
    for (const row of crmLeaderboard) {
      assert.ok(
        row.appearances.every((a) => crmQuestionIds.has(a.questionId)),
        `${row.brand} has a non-CRM appearance leaking into the CRM leaderboard`,
      );
    }
  });

  test("the overall leaderboard includes brands from every category", () => {
    const overall = buildLeaderboard();
    assert.ok(overall.some((r) => r.brand === "Jobber"), "expected a CRM brand on the overall board");
    assert.ok(overall.some((r) => r.brand === "Calendly"), "expected a booking brand on the overall board");
    assert.ok(overall.some((r) => r.brand === "Bland AI"), "expected a voice-AI brand on the overall board");
  });
});
