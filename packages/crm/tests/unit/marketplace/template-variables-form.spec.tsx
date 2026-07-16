import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import {
  TemplateVariablesForm,
  templateVariablesComplete,
  type TemplateVariableDecl,
} from "../../../src/components/marketplace/template-variables-form";

const VARS: TemplateVariableDecl[] = [
  { name: "contact_email", description: "The email replies get forwarded to", example: "hi@acme.test" },
  { name: "contact_phone", description: "The callback number", example: "555-1234" },
];

describe("templateVariablesComplete", () => {
  test("empty variables list → always complete", () => {
    assert.equal(templateVariablesComplete([], {}), true);
  });

  test("all filled → complete", () => {
    assert.equal(
      templateVariablesComplete(VARS, { contact_email: "hi@acme.test", contact_phone: "555-1234" }),
      true,
    );
  });

  test("one missing → incomplete", () => {
    assert.equal(templateVariablesComplete(VARS, { contact_email: "hi@acme.test" }), false);
  });

  test("blank/whitespace value → incomplete", () => {
    assert.equal(
      templateVariablesComplete(VARS, { contact_email: "hi@acme.test", contact_phone: "   " }),
      false,
    );
  });
});

describe("<TemplateVariablesForm>", () => {
  test("renders NOTHING when variables is empty (no form for an ungeneralized template)", () => {
    const html = renderToString(
      <TemplateVariablesForm variables={[]} values={{}} onChange={() => {}} />,
    );
    assert.equal(html, "");
    assert.ok(!html.includes("data-template-variables-form"));
  });

  test("renders one input row per declared variable", () => {
    const html = renderToString(
      <TemplateVariablesForm variables={VARS} values={{}} onChange={() => {}} />,
    );
    const rows = html.match(/data-template-variable-row/g) ?? [];
    assert.equal(rows.length, 2);
    assert.match(html, /placeholder="hi@acme\.test"/);
    assert.match(html, /placeholder="555-1234"/);
  });

  test("an unfilled variable shows the required marker; a filled one does not", () => {
    const html = renderToString(
      <TemplateVariablesForm
        variables={VARS}
        values={{ contact_email: "hi@acme.test" }}
        onChange={() => {}}
      />,
    );
    const requiredMarks = html.match(/data-template-variable-required/g) ?? [];
    // Only contact_phone is unfilled -> exactly one marker.
    assert.equal(requiredMarks.length, 1);
  });

  test("a filled field's value renders into the input", () => {
    const html = renderToString(
      <TemplateVariablesForm
        variables={VARS}
        values={{ contact_email: "hi@acme.test" }}
        onChange={() => {}}
      />,
    );
    assert.match(html, /value="hi@acme\.test"/);
  });
});
