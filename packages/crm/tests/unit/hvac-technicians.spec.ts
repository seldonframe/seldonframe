// Tests for technicians Soul-attribute helpers.
// SLICE 9 PR 1 C4 per gate G-9-1 revised.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  getTechnicians,
  getOnCallTechnicians,
  getTechniciansForZip,
  getAvailableTechnicianForZip,
  type Technician,
} from "../../src/lib/hvac/technicians";

const SAMPLE_TECHS: Technician[] = [
  { id: "t1", name: "Alice", employeeId: "DC-001", hireDate: "2020-01-01", skill_level: "master",     certifications: ["NATE"], service_area: ["85003", "85004"], on_call_today: true,  current_assignment: null },
  { id: "t2", name: "Bob",   employeeId: "DC-003", hireDate: "2021-01-01", skill_level: "senior",     certifications: ["EPA 608"], service_area: ["85003", "85013"], on_call_today: true,  current_assignment: "sc_42" },
  { id: "t3", name: "Carol", employeeId: "DC-005", hireDate: "2022-01-01", skill_level: "journeyman", certifications: ["EPA 608"], service_area: ["85020", "85021"], on_call_today: false, current_assignment: null },
  { id: "t4", name: "Dan",   employeeId: "DC-007", hireDate: "2023-01-01", skill_level: "apprentice", certifications: [],          service_area: ["85003"],          on_call_today: true,  current_assignment: null },
];

describe("getTechnicians — extraction + validation", () => {
  test("extracts technicians array from soul", () => {
    const soul = { technicians: SAMPLE_TECHS };
    assert.equal(getTechnicians(soul).length, 4);
  });

  test("returns empty array when soul has no technicians", () => {
    assert.deepEqual(getTechnicians({}), []);
  });

  test("returns empty array when soul is null/undefined", () => {
    assert.deepEqual(getTechnicians(null), []);
    assert.deepEqual(getTechnicians(undefined), []);
  });

  test("filters out malformed technician entries", () => {
    const soul = {
      technicians: [
        SAMPLE_TECHS[0],
        { id: "broken", name: "no-skill-level" }, // missing required fields
      ],
    };
    assert.equal(getTechnicians(soul).length, 1);
  });
});

describe("getOnCallTechnicians", () => {
  test("returns only on_call_today=true techs", () => {
    const soul = { technicians: SAMPLE_TECHS };
    const onCall = getOnCallTechnicians(soul);
    assert.equal(onCall.length, 3); // Alice, Bob, Dan
    assert.ok(onCall.every((t) => t.on_call_today));
  });
});

describe("getTechniciansForZip", () => {
  test("returns techs whose service_area includes the zip", () => {
    const soul = { technicians: SAMPLE_TECHS };
    const phoenixDowntown = getTechniciansForZip(soul, "85003");
    assert.equal(phoenixDowntown.length, 3); // Alice, Bob, Dan
    const northPhoenix = getTechniciansForZip(soul, "85020");
    assert.equal(northPhoenix.length, 1); // Carol only
    const noMatch = getTechniciansForZip(soul, "99999");
    assert.equal(noMatch.length, 0);
  });
});

describe("getAvailableTechnicianForZip", () => {
  test("returns highest-skill available tech for the zip", () => {
    const soul = { technicians: SAMPLE_TECHS };
    // 85003 has Alice (master, available), Bob (senior, busy), Dan (apprentice, available)
    // Should return Alice (master).
    const tech = getAvailableTechnicianForZip(soul, "85003");
    assert.ok(tech);
    assert.equal(tech!.name, "Alice");
  });

  test("returns null when no available tech for the zip", () => {
    // Carol covers 85020 but is off-duty
    const soul = { technicians: SAMPLE_TECHS };
    assert.equal(getAvailableTechnicianForZip(soul, "85020"), null);
  });

  test("excludes techs with current_assignment set", () => {
    // Bob covers 85013 but is assigned to sc_42 → not available
    const soul = { technicians: SAMPLE_TECHS };
    assert.equal(getAvailableTechnicianForZip(soul, "85013"), null);
  });

  test("falls back to next-skill-level tech when master is busy", () => {
    const techs: Technician[] = [
      { ...SAMPLE_TECHS[0], current_assignment: "sc_99" }, // master busy
      { ...SAMPLE_TECHS[3] }, // Dan apprentice available, covers 85003
    ];
    const tech = getAvailableTechnicianForZip({ technicians: techs }, "85003");
    assert.ok(tech);
    assert.equal(tech!.name, "Dan");
  });
});
