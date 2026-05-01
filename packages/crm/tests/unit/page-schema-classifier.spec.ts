// Unit tests for the business-type classifier (B1).
//
// Pins the keyword → BusinessType mapping so a regression in the rules can't
// silently send a SaaS workspace through the local-service content pack
// (with "Licensed and insured" / "(555) 555-0100" placeholder copy).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyBusinessType,
  classifyBusinessTypeFromSoul,
} from "@/lib/page-schema/classify-business";

describe("classifyBusinessType — direct keyword match", () => {
  test("'open source platform for developers' → saas", () => {
    assert.equal(
      classifyBusinessType("Open source platform for developers"),
      "saas"
    );
  });

  test("'SaaS for indie hackers' → saas", () => {
    assert.equal(classifyBusinessType("SaaS for indie hackers"), "saas");
  });

  test("'developer tools company' → saas", () => {
    assert.equal(classifyBusinessType("Developer tools company"), "saas");
  });

  test("'HVAC repair and installation' → local_service", () => {
    assert.equal(
      classifyBusinessType("HVAC repair and installation in Toronto"),
      "local_service"
    );
  });

  test("'roofing contractor' → local_service", () => {
    assert.equal(classifyBusinessType("Roofing contractor"), "local_service");
  });

  test("'life coaching practice' → professional_service", () => {
    assert.equal(
      classifyBusinessType("Life coaching practice for executives"),
      "professional_service"
    );
  });

  test("'tax accountant' → professional_service", () => {
    assert.equal(classifyBusinessType("Tax accountant"), "professional_service");
  });

  test("'creative design agency' → agency", () => {
    assert.equal(
      classifyBusinessType("Creative design agency for SaaS clients"),
      "agency"
    );
  });

  test("'production studio' → agency", () => {
    assert.equal(classifyBusinessType("Production studio"), "agency");
  });

  test("'online store for sneakers' → ecommerce", () => {
    assert.equal(
      classifyBusinessType("Online store for sneakers, free shipping"),
      "ecommerce"
    );
  });

  test("empty input → professional_service (safe default)", () => {
    assert.equal(classifyBusinessType(""), "professional_service");
  });

  test("unrelated text → professional_service (safe default)", () => {
    assert.equal(
      classifyBusinessType("Some text that mentions nothing relevant"),
      "professional_service"
    );
  });

  test("punctuation doesn't break matching ('open-source' / 'open source')", () => {
    assert.equal(classifyBusinessType("open-source platform"), "saas");
    assert.equal(classifyBusinessType("open source CRM"), "saas");
  });
});

describe("classifyBusinessTypeFromSoul — Soul object", () => {
  test("explicit soul.business_type wins over inferred", () => {
    const soul = {
      business_type: "saas",
      soul_description: "We do roofing repairs and HVAC installation.",
    };
    assert.equal(classifyBusinessTypeFromSoul(soul), "saas");
  });

  test("soul.industry takes precedence over soul.soul_description", () => {
    const soul = {
      industry: "saas-developer-tools",
      soul_description: "Generic catchall description.",
    };
    assert.equal(classifyBusinessTypeFromSoul(soul), "saas");
  });

  test("falls through to soul_description when industry doesn't match", () => {
    const soul = {
      industry: "unknown-vertical",
      soul_description: "Roofing contractor in Phoenix.",
    };
    assert.equal(classifyBusinessTypeFromSoul(soul), "local_service");
  });

  test("falls through to mission when description missing", () => {
    const soul = {
      mission: "Help SaaS founders build faster with developer tools.",
    };
    assert.equal(classifyBusinessTypeFromSoul(soul), "saas");
  });

  test("null/undefined → professional_service", () => {
    assert.equal(classifyBusinessTypeFromSoul(null), "professional_service");
    assert.equal(classifyBusinessTypeFromSoul(undefined), "professional_service");
  });

  test("empty soul → professional_service", () => {
    assert.equal(classifyBusinessTypeFromSoul({}), "professional_service");
  });

  test("invalid explicit business_type → falls through to inferred", () => {
    const soul = {
      business_type: "not-a-real-type",
      soul_description: "Roofing contractor.",
    };
    assert.equal(classifyBusinessTypeFromSoul(soul), "local_service");
  });

  test("seldonframe-style Soul → saas", () => {
    // The Soul we submitted for the SeldonFrame workspace earlier in the
    // session. This is the regression test for B7 — ensures the SeldonFrame
    // workspace would be classified as SaaS rather than the default
    // professional_service (which would have given it the wrong content
    // pack).
    const soul = {
      business_name: "SeldonFrame",
      audience_type: "developer-tools",
      industry: "saas-developer-tools",
      base_framework: "saas-developer-tools",
      soul_description:
        "SeldonFrame is the open-source AI-native Business OS platform. Indie operators, agencies, and SMBs scaffold real, hosted Business OS deployments — landing pages, booking, intake forms, CRM, deal pipeline, and AI agent archetypes — from a single Claude Code conversation, in 2 minutes, via MCP.",
    };
    assert.equal(classifyBusinessTypeFromSoul(soul), "saas");
  });
});
