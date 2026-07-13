import { describe, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { AvatarCircles } from "../../../src/components/ui/magic/avatar-circles";

describe("<AvatarCircles>", () => {
  test("renders +N overflow when numPeople given", () => {
    const html = renderToString(React.createElement(AvatarCircles, {
      numPeople: 99, avatarUrls: [{ imageUrl: "/brand/maxime-houle.png", profileUrl: "#" }],
    }));
    assert.match(html, /\+99/);
  });
});
