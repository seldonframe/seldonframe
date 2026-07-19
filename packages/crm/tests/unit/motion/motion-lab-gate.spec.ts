import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { isMotionLabOn } from "../../../src/app/(dev)/motion-lab/gate";

describe("motion-lab gate", () => {
  test("strict '1' only", () => {
    assert.equal(isMotionLabOn({ SF_MOTION_LAB: "1" }), true);
    assert.equal(isMotionLabOn({ SF_MOTION_LAB: "true" }), false);
    assert.equal(isMotionLabOn({ SF_MOTION_LAB: undefined }), false);
  });
});
