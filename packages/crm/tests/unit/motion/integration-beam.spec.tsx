import { describe, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { IntegrationBeam } from "../../../src/components/landing/integration-beam";

describe("<IntegrationBeam>", () => {
  test("renders the SF center + outward tool nodes (labels present for a11y/crawlers)", () => {
    const html = renderToString(React.createElement(IntegrationBeam));
    assert.match(html, /SeldonFrame|SF/);
    assert.match(html, /Calendar|Gmail|Phone|Slack/);
  });
});
