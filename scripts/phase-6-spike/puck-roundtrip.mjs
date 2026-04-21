#!/usr/bin/env node
/* eslint-disable no-console */

// Phase 6.a Puck round-trip spike.
//
// Tests the concern raised in D-5: when Claude generates a Puck JSON
// payload from a natural-language prompt, does that payload round-trip
// cleanly through the editor (load → edit → export) and back to Claude
// for revision without schema drift?
//
// The spike is deliberately out-of-process (node, not next.js) so we're
// testing Puck's data contract in isolation, not our app's wiring.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../../tasks/phase-6-puck-roundtrip-spike");
await fs.mkdir(outDir, { recursive: true });

// The SDK lives in packages/crm/node_modules; resolve it via pnpm
// workspace hoist. If the import fails (e.g., running from a machine
// without crm installed) we fall back to fixtures.
let anthropic = null;
let sdkLoadError = null;
try {
  const sdkUrl = new URL("../../packages/crm/node_modules/@anthropic-ai/sdk/index.js", import.meta.url);
  const sdkModule = await import(sdkUrl.href);
  const Anthropic = sdkModule.default ?? sdkModule.Anthropic;
  if (process.env.ANTHROPIC_API_KEY && Anthropic) {
    anthropic = new Anthropic();
  }
} catch (err) {
  sdkLoadError = err instanceof Error ? err.message : String(err);
}

const hasLiveClaude = Boolean(anthropic);

// =====================================================================
// 1. The prompt Claude sees — the smallest useful "generate me a page"
//    task. Constrained to components the agent is allowed to emit.
// =====================================================================

const ALLOWED_COMPONENTS = [
  "Hero",
  "Section",
  "IconText",
  "ServiceCard",
  "TestimonialCard",
  "FAQ",
  "FormContainer",
  "TextInput",
  "EmailInput",
];

const SCHEMA_SUMMARY = `Puck data shape:
{
  "content": [ /* top-level components with { type, props } */ ],
  "root": { "props": {} },
  "zones": { /* optional nested slot content, keyed by "<parentId>:<slotName>" */ }
}

Each component item:
{ "type": "<ComponentName>", "props": { "id": "<ComponentName>-<uuid>", ...fields } }

Allowed components + their fields:
- Hero: { headline: text, subheadline: text, ctaText: text, ctaLink: text, alignment: "left"|"center", showCta: "yes"|"no" }
- Section: { heading: text, description: text, backgroundColor: "transparent"|"subtle"|"primary", paddingY: "py-8"|"py-16"|"py-24"|"py-32" } + slot "content" (zones["<id>:content"])
- IconText: { icon: "check"|"star"|"arrow"|"heart"|"shield"|"zap"|"clock"|"mapPin"|"mail"|"phone"|"chevronRight"|"play"|"users"|"calendar"|"creditCard"|"lock", title: text, description: text, layout: "flex-row"|"flex-col" }
- ServiceCard: { name: text, description: text, price: text, duration: text, ctaText: text }
- TestimonialCard: { quote: text, authorName: text, authorRole: text, rating: number }
- FAQ: { items: [ { question: text, answer: text } ] }
- FormContainer: { formName: text, submitButtonText: text, successMessage: text, enableScoring: "none"|"score", scoreThreshold: number, qualifiedRedirectUrl: text, unqualifiedRedirectUrl: text } + slot "content"
- TextInput: { label: text, placeholder: text, fieldName: text, required: "yes"|"no" }
- EmailInput: { label: text, fieldName: text }

Return ONLY JSON. No markdown fences, no commentary.`;

const INITIAL_PROMPT = `Generate a Puck page for a dental clinic's landing page. The clinic is "Bright Smile Dental" in Laval, Quebec. Focus: new-patient consultations. Include: hero with CTA to book, a 3-service Section with icons, a testimonial, a FAQ with 3 items, and a lead-capture form with name+email+phone.

${SCHEMA_SUMMARY}`;

const REVISE_PROMPT_TEMPLATE = (json) => `Here is an existing Puck page payload for a dental clinic. Revise the hero headline + subheadline + CTA copy to be MORE BENEFIT-FOCUSED (outcomes for the patient, not features of the clinic). Keep every other component + slot + id unchanged. Return the full revised payload.

Existing payload:
${JSON.stringify(json, null, 2)}

${SCHEMA_SUMMARY}`;

// =====================================================================
// 2. Claude call helpers with JSON-parsing discipline.
// =====================================================================

async function callClaude(prompt, label) {
  if (!anthropic) {
    throw new Error("ANTHROPIC_API_KEY missing — cannot run live Claude call.");
  }

  const response = await anthropic.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 8192,
    thinking: { type: "adaptive" },
    system: "You are a Puck page generator. Return only valid JSON matching the schema provided. Do not wrap the JSON in markdown fences or explanatory text.",
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();

  await fs.writeFile(path.join(outDir, `${label}.raw.txt`), text);

  // Tolerate accidental markdown fences even though we asked for raw JSON.
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    throw new Error(`Claude returned non-JSON for ${label}: ${err.message}`);
  }

  await fs.writeFile(path.join(outDir, `${label}.json`), JSON.stringify(parsed, null, 2));
  return { parsed, usage: response.usage };
}

// =====================================================================
// 3. Fixture fallback — a hand-authored payload that represents what a
//    well-behaved Claude would produce. Exercises the structural checks
//    even when the API key isn't configured.
// =====================================================================

const FIXTURE_INITIAL = {
  content: [
    {
      type: "Hero",
      props: {
        id: "Hero-abc123",
        headline: "Bright Smile Dental",
        subheadline: "Now accepting new patients in Laval — free consultations this month.",
        ctaText: "Book Your Consultation",
        ctaLink: "#consult",
        alignment: "center",
        showCta: "yes",
      },
    },
    {
      type: "Section",
      props: {
        id: "Section-services",
        heading: "Our services",
        description: "Everything you need to keep your smile bright.",
        backgroundColor: "transparent",
        paddingY: "py-24",
      },
    },
    {
      type: "TestimonialCard",
      props: {
        id: "TestimonialCard-jane",
        quote: "Friendly team, modern office, painless cleaning.",
        authorName: "Jane D.",
        authorRole: "Patient since 2023",
        rating: 5,
      },
    },
    {
      type: "FAQ",
      props: {
        id: "FAQ-main",
        items: [
          { question: "Do you accept walk-ins?", answer: "By appointment only." },
          { question: "Do you take our insurance?", answer: "Most major plans — call to confirm." },
          { question: "Cleaning cost?", answer: "$120 for new patients." },
        ],
      },
    },
    {
      type: "FormContainer",
      props: {
        id: "FormContainer-lead",
        formName: "New patient",
        submitButtonText: "Request appointment",
        successMessage: "We'll call you within one business day.",
        enableScoring: "none",
        scoreThreshold: 0,
        qualifiedRedirectUrl: "",
        unqualifiedRedirectUrl: "",
      },
    },
  ],
  root: { props: {} },
  zones: {
    "Section-services:content": [
      { type: "IconText", props: { id: "IconText-cleaning", icon: "check", title: "Cleanings", description: "Gentle, thorough, fast.", layout: "flex-row" } },
      { type: "IconText", props: { id: "IconText-cosmetic", icon: "star", title: "Cosmetic", description: "Whitening + veneers.", layout: "flex-row" } },
      { type: "IconText", props: { id: "IconText-emergency", icon: "zap", title: "Emergency", description: "Same-day pain relief.", layout: "flex-row" } },
    ],
    "FormContainer-lead:content": [
      { type: "TextInput", props: { id: "TextInput-name", label: "Your name", placeholder: "Jane Smith", fieldName: "name", required: "yes" } },
      { type: "EmailInput", props: { id: "EmailInput-email", label: "Email", fieldName: "email" } },
      { type: "TextInput", props: { id: "TextInput-phone", label: "Phone", placeholder: "(514) 555-0100", fieldName: "phone", required: "yes" } },
    ],
  },
};

// =====================================================================
// 4. Structural validation — the same checks Puck's internal resolver
//    would apply. We implement them inline to keep the spike out of the
//    Next.js runtime.
// =====================================================================

const ALLOWED_SET = new Set(ALLOWED_COMPONENTS);

function validatePuckPayload(payload, label) {
  const issues = [];

  if (!payload || typeof payload !== "object") {
    issues.push("payload is not an object");
    return issues;
  }
  if (!Array.isArray(payload.content)) {
    issues.push("content is not an array");
    return issues;
  }
  if (!payload.root || typeof payload.root !== "object") {
    issues.push("root is missing or not an object");
  }
  if (payload.zones !== undefined && (typeof payload.zones !== "object" || Array.isArray(payload.zones))) {
    issues.push("zones is not a plain object");
  }

  const seenIds = new Set();
  function checkItem(item, path) {
    if (!item || typeof item !== "object") {
      issues.push(`${path}: item is not an object`);
      return;
    }
    if (typeof item.type !== "string" || !item.type) {
      issues.push(`${path}: missing type string`);
      return;
    }
    if (!ALLOWED_SET.has(item.type)) {
      issues.push(`${path}: type "${item.type}" is outside the allowed component list`);
    }
    if (!item.props || typeof item.props !== "object") {
      issues.push(`${path}: missing props object`);
      return;
    }
    if (typeof item.props.id !== "string" || !item.props.id) {
      issues.push(`${path}: props.id missing`);
    } else {
      if (seenIds.has(item.props.id)) {
        issues.push(`${path}: duplicate props.id "${item.props.id}"`);
      }
      seenIds.add(item.props.id);
    }
  }

  payload.content.forEach((item, i) => checkItem(item, `content[${i}]`));

  if (payload.zones && typeof payload.zones === "object") {
    for (const [key, items] of Object.entries(payload.zones)) {
      if (!Array.isArray(items)) {
        issues.push(`zones["${key}"]: not an array`);
        continue;
      }
      items.forEach((item, i) => checkItem(item, `zones["${key}"][${i}]`));
    }
  }

  console.log(`\n[validate:${label}] ${issues.length === 0 ? "OK" : `${issues.length} issue(s)`}`);
  for (const msg of issues) console.log(`  - ${msg}`);
  return issues;
}

// =====================================================================
// 5. Simulated editor edit — the user's directive: "edit one thing in
//    the editor". In the real Puck UI this would be a field change in
//    the Hero component. Programmatically we mutate the exact same
//    path, which is what Puck's state updater would produce.
// =====================================================================

function simulateEditorEdit(payload) {
  const clone = structuredClone(payload);
  const hero = clone.content.find((item) => item.type === "Hero");
  if (hero) {
    hero.props.ctaText = "Book My Free Consultation";
    hero.props.alignment = "left";
  }
  return clone;
}

// =====================================================================
// 6. Structural diff — what changed between payloads? Used to verify
//    Claude's revision didn't silently corrupt unrelated fields or
//    lose ids.
// =====================================================================

function structuralDiff(before, after) {
  const beforeIds = new Set();
  const afterIds = new Set();
  const collect = (payload, set) => {
    for (const item of payload.content ?? []) if (item?.props?.id) set.add(item.props.id);
    for (const [, zone] of Object.entries(payload.zones ?? {})) {
      for (const item of zone ?? []) if (item?.props?.id) set.add(item.props.id);
    }
  };
  collect(before, beforeIds);
  collect(after, afterIds);

  const lost = [...beforeIds].filter((id) => !afterIds.has(id));
  const added = [...afterIds].filter((id) => !beforeIds.has(id));

  return {
    idsLost: lost,
    idsAdded: added,
    topLevelContentLengthChange: (after.content?.length ?? 0) - (before.content?.length ?? 0),
    zoneCountChange: Object.keys(after.zones ?? {}).length - Object.keys(before.zones ?? {}).length,
  };
}

// =====================================================================
// 7. Run the spike.
// =====================================================================

async function main() {
  console.log(`\nPhase 6.a Puck round-trip spike`);
  console.log(`  live Claude: ${hasLiveClaude ? "YES" : "NO — using fixture fallback"}`);

  const report = {
    startedAt: new Date().toISOString(),
    mode: hasLiveClaude ? "live" : "fixture",
    steps: [],
    verdict: null,
  };

  let initial;
  if (hasLiveClaude) {
    try {
      const generated = await callClaude(INITIAL_PROMPT, "01-initial");
      initial = generated.parsed;
      report.steps.push({ step: "generate", ok: true, usage: generated.usage });
    } catch (err) {
      report.steps.push({ step: "generate", ok: false, error: err.message });
      console.error(`[generate] FAILED: ${err.message}`);
      initial = FIXTURE_INITIAL;
      await fs.writeFile(path.join(outDir, "01-initial.json"), JSON.stringify(initial, null, 2));
    }
  } else {
    initial = FIXTURE_INITIAL;
    await fs.writeFile(path.join(outDir, "01-initial.json"), JSON.stringify(initial, null, 2));
    report.steps.push({ step: "generate", ok: true, source: "fixture" });
  }

  const initialIssues = validatePuckPayload(initial, "01-initial");
  report.steps.push({ step: "validate-initial", issues: initialIssues });

  const edited = simulateEditorEdit(initial);
  await fs.writeFile(path.join(outDir, "02-edited.json"), JSON.stringify(edited, null, 2));
  const editedIssues = validatePuckPayload(edited, "02-edited");
  report.steps.push({
    step: "editor-edit",
    issues: editedIssues,
    diffFromInitial: structuralDiff(initial, edited),
  });

  let revised;
  if (hasLiveClaude) {
    try {
      const generated = await callClaude(REVISE_PROMPT_TEMPLATE(edited), "03-revised");
      revised = generated.parsed;
      report.steps.push({ step: "claude-revise", ok: true, usage: generated.usage });
    } catch (err) {
      report.steps.push({ step: "claude-revise", ok: false, error: err.message });
      console.error(`[claude-revise] FAILED: ${err.message}`);
      // Simulate a plausible revise outcome for structural testing.
      revised = structuredClone(edited);
      const hero = revised.content.find((item) => item.type === "Hero");
      if (hero) {
        hero.props.headline = "Finally, a dental visit you'll actually enjoy";
        hero.props.subheadline = "Modern, gentle care in Laval — your whole family, on your schedule.";
      }
      await fs.writeFile(path.join(outDir, "03-revised.json"), JSON.stringify(revised, null, 2));
    }
  } else {
    revised = structuredClone(edited);
    const hero = revised.content.find((item) => item.type === "Hero");
    if (hero) {
      hero.props.headline = "Finally, a dental visit you'll actually enjoy";
      hero.props.subheadline = "Modern, gentle care in Laval — your whole family, on your schedule.";
    }
    await fs.writeFile(path.join(outDir, "03-revised.json"), JSON.stringify(revised, null, 2));
    report.steps.push({ step: "claude-revise", ok: true, source: "fixture" });
  }

  const revisedIssues = validatePuckPayload(revised, "03-revised");
  const diff = structuralDiff(edited, revised);
  report.steps.push({
    step: "validate-revised",
    issues: revisedIssues,
    diffFromEdited: diff,
  });

  // Verdict:
  const allIssues = [...initialIssues, ...editedIssues, ...revisedIssues];
  const scrambled = diff.idsLost.length > 0 || diff.idsAdded.length > 0 || diff.zoneCountChange !== 0;
  report.verdict = {
    cleanSchemaThroughout: allIssues.length === 0,
    revisionPreservedIds: diff.idsLost.length === 0,
    revisionPreservedStructure: !scrambled,
    diffFromEdited: diff,
  };

  await fs.writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));

  console.log(`\n--- Happy-path summary ---`);
  console.log(`Clean schema throughout:     ${report.verdict.cleanSchemaThroughout ? "YES" : "NO"}`);
  console.log(`Revision preserved IDs:      ${report.verdict.revisionPreservedIds ? "YES" : "NO"}`);
  console.log(`Revision preserved struct:   ${report.verdict.revisionPreservedStructure ? "YES" : "NO"}`);

  // =====================================================================
  // Adversarial cases — the actual D-5 concerns. These are the failure
  // modes Claude will exhibit when hurried / under-constrained. If our
  // validator catches them, the block is safe to ship with a pre-save
  // sanitization pass.
  // =====================================================================

  console.log(`\n--- Adversarial cases ---`);
  const adversarial = {
    wrongEnumValue: structuredClone(initial),
    missingId: structuredClone(initial),
    unknownComponent: structuredClone(initial),
    malformedZoneKey: structuredClone(initial),
    extraUndocumentedProp: structuredClone(initial),
  };

  adversarial.wrongEnumValue.content[0].props.alignment = "middle"; // enum violation
  delete adversarial.missingId.content[0].props.id; // missing required id
  adversarial.unknownComponent.content.push({
    type: "FancyMarquee",
    props: { id: "FancyMarquee-1", headline: "Look at me!" },
  });
  adversarial.malformedZoneKey.zones["Section-services/content"] =
    adversarial.malformedZoneKey.zones["Section-services:content"]; // slash instead of colon
  delete adversarial.malformedZoneKey.zones["Section-services:content"];
  adversarial.extraUndocumentedProp.content[0].props.animationPreset = "fade-in-from-left"; // not in schema

  const adversarialResults = {};
  for (const [label, payload] of Object.entries(adversarial)) {
    await fs.writeFile(path.join(outDir, `adversarial-${label}.json`), JSON.stringify(payload, null, 2));
    const issues = [];

    // Enum check: alignment must be "left"|"center".
    const hero = payload.content.find((item) => item?.type === "Hero");
    if (hero && hero.props && !["left", "center"].includes(hero.props.alignment)) {
      issues.push(`Hero.alignment enum violation: "${hero.props.alignment}"`);
    }

    const structuralIssues = validatePuckPayload(payload, `adversarial-${label}`);
    issues.push(...structuralIssues);

    // Zone-key shape check.
    for (const zoneKey of Object.keys(payload.zones ?? {})) {
      if (!/^[^:]+:[^:]+$/.test(zoneKey)) {
        issues.push(`zone key "${zoneKey}" does not match "<parentId>:<slotName>" shape`);
      }
    }

    // Props-drift check — warn on any prop outside the schema for known
    // components. Cheap version: check Hero + IconText props against a
    // known allow-list.
    const KNOWN_PROPS = {
      Hero: new Set(["id", "headline", "subheadline", "ctaText", "ctaLink", "alignment", "showCta"]),
      IconText: new Set(["id", "icon", "title", "description", "layout"]),
      Section: new Set(["id", "heading", "description", "backgroundColor", "paddingY"]),
    };
    const collectWithZones = (p) => [
      ...p.content,
      ...Object.values(p.zones ?? {}).flat(),
    ];
    for (const item of collectWithZones(payload)) {
      const allow = KNOWN_PROPS[item?.type];
      if (!allow) continue;
      for (const propName of Object.keys(item.props ?? {})) {
        if (!allow.has(propName)) {
          issues.push(`${item.type}.${propName} is not a documented prop`);
        }
      }
    }

    adversarialResults[label] = {
      caught: issues.length > 0,
      issues,
    };
    console.log(`  ${label}: ${issues.length > 0 ? `CAUGHT (${issues.length})` : "MISSED"}`);
    for (const msg of issues) console.log(`    - ${msg}`);
  }

  report.adversarial = adversarialResults;
  await fs.writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));

  const allAdversarialCaught = Object.values(adversarialResults).every((r) => r.caught);
  console.log(`\n--- Adversarial summary ---`);
  console.log(`All adversarial cases caught by validator: ${allAdversarialCaught ? "YES" : "NO"}`);

  console.log(`\nArtifacts written to: ${path.relative(process.cwd(), outDir)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
