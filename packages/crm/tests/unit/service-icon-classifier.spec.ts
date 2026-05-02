// Unit tests for the service-name → icon classifier.
//
// May 2, 2026 — issue #2 of the Personality-Driven Content Layer spec.
// The classifier feeds the services-grid renderer; if the mapping
// regresses, every workspace's landing page reverts to generic circle
// glyphs. Lock the table with explicit cases.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { classifyServiceIcon } from "@/lib/page-schema/service-icon-classifier";

describe("classifyServiceIcon — HVAC mappings", () => {
  test("'AC Repair' → wrench", () => {
    assert.equal(classifyServiceIcon("AC Repair"), "wrench");
  });
  test("'Air Conditioning Installation' → wrench", () => {
    assert.equal(classifyServiceIcon("Air Conditioning Installation"), "wrench");
  });
  test("'Cooling Maintenance' → wrench", () => {
    assert.equal(classifyServiceIcon("Cooling Maintenance"), "wrench");
  });
  test("'Heating Repair' → flame", () => {
    assert.equal(classifyServiceIcon("Heating Repair"), "flame");
  });
  test("'Furnace Service' → flame", () => {
    assert.equal(classifyServiceIcon("Furnace Service"), "flame");
  });
  test("'Boiler Replacement' → flame", () => {
    assert.equal(classifyServiceIcon("Boiler Replacement"), "flame");
  });
});

describe("classifyServiceIcon — dental mappings", () => {
  test("'Dental Cleaning' → sparkles", () => {
    assert.equal(classifyServiceIcon("Dental Cleaning"), "sparkles");
  });
  test("'Teeth Whitening' → sparkles", () => {
    assert.equal(classifyServiceIcon("Teeth Whitening"), "sparkles");
  });
  test("'Cosmetic Tooth Care' → sparkles", () => {
    assert.equal(classifyServiceIcon("Cosmetic Tooth Care"), "sparkles");
  });
  test("'Dental Implants' → smile", () => {
    assert.equal(classifyServiceIcon("Dental Implants"), "smile");
  });
  test("'Invisalign' → smile", () => {
    assert.equal(classifyServiceIcon("Invisalign"), "smile");
  });
  test("'Orthodontics' → smile", () => {
    assert.equal(classifyServiceIcon("Orthodontics"), "smile");
  });
});

describe("classifyServiceIcon — generic service mappings", () => {
  test("'Emergency Service' → siren", () => {
    assert.equal(classifyServiceIcon("Emergency Service"), "siren");
  });
  test("'Emergency Dental Care' → siren", () => {
    assert.equal(classifyServiceIcon("Emergency Dental Care"), "siren");
  });
  test("'Free Consultation' → message-circle", () => {
    assert.equal(classifyServiceIcon("Free Consultation"), "message-circle");
  });
  test("'Expert Advice' → message-circle", () => {
    assert.equal(classifyServiceIcon("Expert Advice"), "message-circle");
  });
  test("'Free Estimate' → dollar-sign", () => {
    assert.equal(classifyServiceIcon("Free Estimate"), "dollar-sign");
  });
  test("'Get a Quote' → dollar-sign", () => {
    assert.equal(classifyServiceIcon("Get a Quote"), "dollar-sign");
  });
  test("'Transparent Pricing' → dollar-sign", () => {
    assert.equal(classifyServiceIcon("Transparent Pricing"), "dollar-sign");
  });
  test("'Home Inspection' → clipboard-check", () => {
    assert.equal(classifyServiceIcon("Home Inspection"), "clipboard-check");
  });
  test("'Energy Audit' → clipboard-check", () => {
    assert.equal(classifyServiceIcon("Energy Audit"), "clipboard-check");
  });
  test("'Pipe Install' → wrench", () => {
    assert.equal(classifyServiceIcon("Pipe Install"), "wrench");
  });
  test("'General Repair' → wrench", () => {
    assert.equal(classifyServiceIcon("General Repair"), "wrench");
  });
});

describe("classifyServiceIcon — fallback behavior", () => {
  test("empty string → sparkles", () => {
    assert.equal(classifyServiceIcon(""), "sparkles");
  });
  test("whitespace → sparkles", () => {
    assert.equal(classifyServiceIcon("   "), "sparkles");
  });
  test("null → sparkles", () => {
    assert.equal(classifyServiceIcon(null), "sparkles");
  });
  test("undefined → sparkles", () => {
    assert.equal(classifyServiceIcon(undefined), "sparkles");
  });
  test("non-string → sparkles", () => {
    // @ts-expect-error testing runtime guard
    assert.equal(classifyServiceIcon(42), "sparkles");
  });
  test("'Pediatric Dentistry' → sparkles (via 'dentist' keyword)", () => {
    // 'dentist' is a substring of 'dentistry'; sparkles rule fires.
    assert.equal(classifyServiceIcon("Pediatric Dentistry"), "sparkles");
  });
  test("unrecognized service → sparkles fallback", () => {
    assert.equal(classifyServiceIcon("Massage Therapy"), "sparkles");
  });
});

describe("classifyServiceIcon — case + whitespace insensitivity", () => {
  test("UPPERCASE", () => {
    assert.equal(classifyServiceIcon("AC REPAIR"), "wrench");
  });
  test("mixed case", () => {
    assert.equal(classifyServiceIcon("Heating Repair"), "flame");
  });
  test("leading/trailing spaces", () => {
    assert.equal(classifyServiceIcon("  Invisalign  "), "smile");
  });
});

describe("classifyServiceIcon — rule precedence", () => {
  test("'AC Install' → wrench (AC rule wins, install also maps to wrench)", () => {
    assert.equal(classifyServiceIcon("AC Install"), "wrench");
  });
  test("'Implant Consultation' → smile (implant rule beats consultation)", () => {
    // Implants is the more specific keyword on the dental side; the
    // consultation rule fires later in the table.
    assert.equal(classifyServiceIcon("Implant Consultation"), "smile");
  });
  test("'Emergency Heating Repair' → siren (emergency wins over heating)", () => {
    assert.equal(classifyServiceIcon("Emergency Heating Repair"), "siren");
  });
});
