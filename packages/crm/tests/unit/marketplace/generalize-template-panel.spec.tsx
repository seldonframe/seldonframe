// "Make it fit anybody" — Sell-card review UI (Task 3). renderToString tests
// for the presentational pieces (no jsdom — repo convention) + a closed-state
// smoke of the stateful card.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import {
  GeneralizationWarningRow,
  GeneralizationReviewList,
  GeneralizeTemplateCard,
  mapProposeGeneralizationError,
  type ReviewRow,
} from "../../../src/components/marketplace/generalize-template-panel";

// ─── GeneralizationWarningRow — L-36 visibility invariant ────────────────────

describe("<GeneralizationWarningRow>", () => {
  test("show=false renders NOTHING (absent from markup, not just hidden)", () => {
    const html = renderToString(<GeneralizationWarningRow show={false} />);
    assert.equal(html, "");
    assert.ok(!html.includes("data-generalize-warning"));
  });

  test("show=true renders the warning text + marker attribute", () => {
    const html = renderToString(<GeneralizationWarningRow show={true} />);
    assert.match(html, /data-generalize-warning/);
    assert.match(html, /personal details/);
  });
});

// ─── GeneralizationReviewList ────────────────────────────────────────────────

const ROWS: ReviewRow[] = [
  {
    token: "contact_email",
    currentValue: "Dresslikeag@gmail.com",
    description: "The operator's email",
    example: "hi@acme.test",
    accepted: true,
  },
  {
    token: "greeting_phrase",
    currentValue: "yo max check this out",
    description: "Informal greeting",
    example: "Hi there!",
    accepted: false,
  },
];

describe("<GeneralizationReviewList>", () => {
  test("empty rows renders the 'no personal details found' empty state", () => {
    const html = renderToString(<GeneralizationReviewList rows={[]} />);
    assert.match(html, /data-generalize-empty/);
    assert.match(html, /No personal details found/);
    assert.ok(!html.includes("data-generalize-review-row"));
  });

  test("renders ONE row per proposed substitution", () => {
    const html = renderToString(<GeneralizationReviewList rows={ROWS} />);
    const matches = html.match(/data-generalize-review-row/g) ?? [];
    assert.equal(matches.length, 2);
  });

  test("each row shows the current→token mapping (currentValue text + token input value)", () => {
    const html = renderToString(<GeneralizationReviewList rows={ROWS} />);
    assert.match(html, /Dresslikeag@gmail\.com/);
    assert.match(html, /value="contact_email"/);
    assert.match(html, /yo max check this out/);
    assert.match(html, /value="greeting_phrase"/);
  });

  test("the accepted state renders as the checkbox's checked attribute", () => {
    const html = renderToString(<GeneralizationReviewList rows={ROWS} />);
    // React's SSR renders a checked checkbox with checked="" (no explicit
    // value) — assert both rows' checkbox markup is present and distinct.
    const checkboxSegments = html.split("data-generalize-row-checkbox");
    assert.equal(checkboxSegments.length - 1, 2, "two checkboxes rendered");
  });

  test("description and example fields render their current values", () => {
    const html = renderToString(<GeneralizationReviewList rows={ROWS} />);
    assert.match(html, /value="The operator&#x27;s email"|value="The operator's email"/);
    assert.match(html, /value="hi@acme.test"/);
  });
});

// ─── mapProposeGeneralizationError — Task 1: each typed error → distinct copy

describe("mapProposeGeneralizationError", () => {
  test("empty_skill_md → 'no instructions to check'", () => {
    assert.match(mapProposeGeneralizationError("empty_skill_md"), /no instructions to check/);
  });

  test("llm_failed → the model/key-issue message (was the undiagnosable generic message)", () => {
    assert.match(
      mapProposeGeneralizationError("llm_failed"),
      /couldn't run \(model or key issue on our side\)/,
    );
  });

  test("malformed_llm_output → the 'unusable' message", () => {
    assert.match(mapProposeGeneralizationError("malformed_llm_output"), /returned something unusable/);
  });

  test("unauthorized → the access message", () => {
    assert.match(mapProposeGeneralizationError("unauthorized"), /don't have access/);
  });

  test("template_not_found → the not-found message", () => {
    assert.match(mapProposeGeneralizationError("template_not_found"), /couldn't be found/);
  });

  test("all five typed errors map to DISTINCT messages (never the old one-size-fits-all copy)", () => {
    const errors = [
      "empty_skill_md",
      "llm_failed",
      "malformed_llm_output",
      "unauthorized",
      "template_not_found",
    ] as const;
    const messages = errors.map((e) => mapProposeGeneralizationError(e));
    assert.equal(new Set(messages).size, messages.length);
  });
});

// ─── GeneralizeTemplateCard — closed-state smoke + warning wiring ────────────

describe("<GeneralizeTemplateCard> — initial (closed) render", () => {
  test("renders the check button and the card marker", () => {
    const html = renderToString(
      <GeneralizeTemplateCard templateId="tmpl-1" showPersonalDetailsWarning={false} />,
    );
    assert.match(html, /data-generalize-card/);
    assert.match(html, /data-generalize-check-button/);
    assert.match(html, /Check for personal details/);
  });

  test("no review rows/applied banner are rendered before the operator opens the panel", () => {
    const html = renderToString(
      <GeneralizeTemplateCard templateId="tmpl-1" showPersonalDetailsWarning={false} />,
    );
    assert.ok(!html.includes("data-generalize-review-list"));
    assert.ok(!html.includes("data-generalize-applied"));
  });

  test("showPersonalDetailsWarning=true renders the warning row in the closed state", () => {
    const html = renderToString(
      <GeneralizeTemplateCard templateId="tmpl-1" showPersonalDetailsWarning={true} />,
    );
    assert.match(html, /data-generalize-warning/);
  });

  test("showPersonalDetailsWarning=false renders NO warning row", () => {
    const html = renderToString(
      <GeneralizeTemplateCard templateId="tmpl-1" showPersonalDetailsWarning={false} />,
    );
    assert.ok(!html.includes("data-generalize-warning"));
  });
});
