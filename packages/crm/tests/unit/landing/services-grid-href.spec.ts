// Unit test for the services-grid card href builder. Markup is manual; only the
// link target logic (route vs. legacy anchor) is tested.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { serviceCardHref } from "../../../src/components/landing-r1/sections/services-grid";

describe("serviceCardHref", () => {
  test("links to the service route when a base href is provided", () => {
    assert.equal(
      serviceCardHref("Kitchen Remodeling", "/w/greenwood"),
      "/w/greenwood/services/kitchen-remodeling",
    );
  });

  test("normalizes a trailing slash on the base href", () => {
    assert.equal(
      serviceCardHref("Decks", "/w/greenwood/"),
      "/w/greenwood/services/decks",
    );
  });

  test("treats '/' base as root", () => {
    assert.equal(serviceCardHref("Decks", "/"), "/services/decks");
  });

  test("falls back to the legacy in-page anchor when no base href", () => {
    assert.equal(serviceCardHref("Kitchen Remodeling", undefined), "#service-kitchen-remodeling");
    assert.equal(serviceCardHref("Kitchen Remodeling", ""), "#service-kitchen-remodeling");
  });
});
