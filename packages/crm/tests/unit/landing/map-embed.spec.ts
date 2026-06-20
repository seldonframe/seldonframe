import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { mapEmbedUrl, joinFooterAddress } from "../../../src/lib/landing/map-embed";

describe("joinFooterAddress", () => {
  test("joins line1/city/state/zip into one string", () => {
    assert.equal(
      joinFooterAddress({ line1: "123 Main St", city: "Beacon", state: "NY", zip: "12508" }),
      "123 Main St, Beacon, NY 12508",
    );
  });
  test("tolerates missing parts", () => {
    assert.equal(joinFooterAddress({ line1: "123 Main St", city: "Beacon", state: "", zip: "" }), "123 Main St, Beacon");
    assert.equal(joinFooterAddress(undefined), "");
    assert.equal(joinFooterAddress(null), "");
  });
});

describe("mapEmbedUrl", () => {
  test("builds a keyless google maps embed url from an address", () => {
    assert.equal(
      mapEmbedUrl("123 Main St, Beacon, NY 12508"),
      "https://www.google.com/maps?q=123%20Main%20St%2C%20Beacon%2C%20NY%2012508&output=embed",
    );
  });
  test("returns null for blank / missing input", () => {
    assert.equal(mapEmbedUrl(""), null);
    assert.equal(mapEmbedUrl("   "), null);
    assert.equal(mapEmbedUrl(undefined), null);
    assert.equal(mapEmbedUrl(null), null);
  });
});
