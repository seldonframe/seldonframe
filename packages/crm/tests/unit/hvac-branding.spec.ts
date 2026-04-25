// Tests for Desert Cool HVAC branding constants.
// SLICE 9 PR 1 C5.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  DESERT_COOL_HVAC_BRAND,
  DESERT_COOL_HVAC_THEME,
  DESERT_COOL_HVAC_COPY,
} from "../../src/lib/hvac/branding";

describe("DESERT_COOL_HVAC_BRAND — workspace identity", () => {
  test("identifies Desert Cool HVAC + Phoenix AZ", () => {
    assert.equal(DESERT_COOL_HVAC_BRAND.workspaceName, "Desert Cool HVAC");
    assert.equal(DESERT_COOL_HVAC_BRAND.city, "Phoenix");
    assert.equal(DESERT_COOL_HVAC_BRAND.state, "AZ");
  });

  test("ownerName + technician + customer counts match scenario doc", () => {
    assert.equal(DESERT_COOL_HVAC_BRAND.ownerName, "Jordan Reyes");
    assert.equal(DESERT_COOL_HVAC_BRAND.technicianCount, 14);
    assert.equal(DESERT_COOL_HVAC_BRAND.customerCount, 1800);
  });
});

describe("DESERT_COOL_HVAC_THEME — visual identity", () => {
  test("primary red + accent cyan (heat/cool palette)", () => {
    assert.equal(DESERT_COOL_HVAC_THEME.primaryColor, "#dc2626");
    assert.equal(DESERT_COOL_HVAC_THEME.accentColor, "#0891b2");
  });

  test("Outfit font + light mode (Phoenix sun readability)", () => {
    assert.equal(DESERT_COOL_HVAC_THEME.fontFamily, "Outfit");
    assert.equal(DESERT_COOL_HVAC_THEME.mode, "light");
  });

  test("rounded corners (warmer than sharp)", () => {
    assert.equal(DESERT_COOL_HVAC_THEME.borderRadius, "rounded");
  });
});

describe("DESERT_COOL_HVAC_COPY — brand voice fragments", () => {
  test("emergencyAck includes 4-hour SLA + CONFIRM keyword", () => {
    assert.match(DESERT_COOL_HVAC_COPY.emergencyAck, /4 hours/);
    assert.match(DESERT_COOL_HVAC_COPY.emergencyAck, /CONFIRM/);
  });

  test("preSeasonInvite uses {{firstName}} interpolation token", () => {
    assert.match(DESERT_COOL_HVAC_COPY.preSeasonInvite, /\{\{firstName\}\}/);
  });

  test("followUp asks for 1-5 stars", () => {
    assert.match(DESERT_COOL_HVAC_COPY.followUp, /1-5 stars/);
  });

  test("followUpThanks routes high vs low rating", () => {
    const high = DESERT_COOL_HVAC_COPY.followUpThanks(5);
    const low = DESERT_COOL_HVAC_COPY.followUpThanks(2);
    assert.match(high, /Google/);
    assert.match(low, /reach out/);
  });

  test("heatAdvisory mentions 110°+ + YES reply", () => {
    assert.match(DESERT_COOL_HVAC_COPY.heatAdvisory, /110°/);
    assert.match(DESERT_COOL_HVAC_COPY.heatAdvisory, /YES/);
  });
});
