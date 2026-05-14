import { test } from "node:test";
import assert from "node:assert/strict";
import { stripUnsourcedFacts } from "@/lib/soul-compiler/fact-validator";

test("fact-validator: strips license-style numbers not in source", () => {
  const result = stripUnsourcedFacts({
    tagline: "Licensed (RMP 45127), bonded, insured",
    soulDescription: "Family-owned plumber since 1988.",
    sourceMarkdown: "We are a family-owned plumber serving Dallas since 1988. Licensed, bonded, insured.",
  });

  assert.ok(!result.tagline.includes("45127"), "RMP 45127 not in source — should strip");
  assert.ok(result.tagline.includes("Licensed"), "generic 'Licensed' should stay");
  assert.equal(result.soulDescription, "Family-owned plumber since 1988.", "1988 IS in source — keep");
});

test("fact-validator: strips review counts not in source", () => {
  const result = stripUnsourcedFacts({
    tagline: "4.9★ from 162+ neighbors",
    soulDescription: "Trusted plumbing in Denton.",
    sourceMarkdown: "Award-winning plumbing for your home and business.",
  });

  assert.ok(!result.tagline.includes("162"), "162 not in source — strip");
});

test("fact-validator: KEEPS numbers that appear in source", () => {
  const result = stripUnsourcedFacts({
    tagline: "Serving Dallas since 1988",
    soulDescription: "Call us at (940) 999-7742 for 24/7 emergency service.",
    sourceMarkdown: "Founded 1988. Phone (940) 999-7742. 24/7 emergency service available.",
  });

  assert.ok(result.tagline.includes("1988"), "1988 in source — keep");
  assert.ok(result.soulDescription.includes("(940) 999-7742"), "phone in source — keep");
  assert.ok(result.soulDescription.includes("24/7"), "24/7 in source — keep");
});

test("fact-validator: case-insensitive source check", () => {
  const result = stripUnsourcedFacts({
    tagline: "Licensed RMP 45127 contractor",
    soulDescription: "",
    sourceMarkdown: "We are licensed under rmp 45127 in Texas.",
  });

  assert.ok(result.tagline.includes("45127"), "45127 matches in source case-insensitively");
});

test("fact-validator: empty source -> strip all 3+ digit numbers", () => {
  const result = stripUnsourcedFacts({
    tagline: "Founded 1995, 500+ jobs done",
    soulDescription: "",
    sourceMarkdown: "",
  });

  assert.ok(!result.tagline.match(/\d{3,}/), "no 3+ digit numbers should survive empty source");
});

test("fact-validator: preserves short numbers (1-2 digits) — too noisy to strip", () => {
  const result = stripUnsourcedFacts({
    tagline: "Best of the year",
    soulDescription: "Open 7 days a week.",
    sourceMarkdown: "Open daily.",
  });

  assert.ok(result.soulDescription.includes("7"), "single-digit 7 stays");
});
