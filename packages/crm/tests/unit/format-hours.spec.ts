// packages/crm/tests/unit/format-hours.spec.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeWeeklyHours } from "../../src/lib/workspace/format-hours";

test("Mon-Fri 07:00-17:00 collapses to 'Mon-Fri 7-5'", () => {
  const hours = {
    monday:    { enabled: true,  start: "07:00", end: "17:00" },
    tuesday:   { enabled: true,  start: "07:00", end: "17:00" },
    wednesday: { enabled: true,  start: "07:00", end: "17:00" },
    thursday:  { enabled: true,  start: "07:00", end: "17:00" },
    friday:    { enabled: true,  start: "07:00", end: "17:00" },
    saturday:  { enabled: false, start: "00:00", end: "00:00" },
    sunday:    { enabled: false, start: "00:00", end: "00:00" },
  };
  assert.equal(summarizeWeeklyHours(hours), "Mon-Fri 7-5");
});

test("Mon-Fri + Sat with different hours formats with comma", () => {
  const hours = {
    monday:    { enabled: true,  start: "09:00", end: "17:00" },
    tuesday:   { enabled: true,  start: "09:00", end: "17:00" },
    wednesday: { enabled: true,  start: "09:00", end: "17:00" },
    thursday:  { enabled: true,  start: "09:00", end: "17:00" },
    friday:    { enabled: true,  start: "09:00", end: "17:00" },
    saturday:  { enabled: true,  start: "08:00", end: "12:00" },
    sunday:    { enabled: false, start: "00:00", end: "00:00" },
  };
  assert.equal(summarizeWeeklyHours(hours), "Mon-Fri 9-5, Sat 8-12");
});

test("non-contiguous days fall back to enumeration", () => {
  const hours = {
    monday:    { enabled: true,  start: "09:00", end: "17:00" },
    tuesday:   { enabled: false, start: "00:00", end: "00:00" },
    wednesday: { enabled: true,  start: "09:00", end: "17:00" },
    thursday:  { enabled: false, start: "00:00", end: "00:00" },
    friday:    { enabled: true,  start: "09:00", end: "17:00" },
    saturday:  { enabled: false, start: "00:00", end: "00:00" },
    sunday:    { enabled: false, start: "00:00", end: "00:00" },
  };
  assert.equal(summarizeWeeklyHours(hours), "Mon, Wed, Fri 9-5");
});

test("empty availability returns 'by appointment'", () => {
  assert.equal(summarizeWeeklyHours({}), "by appointment");
});

test("all-disabled days returns 'by appointment'", () => {
  const hours = {
    monday: { enabled: false, start: "09:00", end: "17:00" },
    tuesday: { enabled: false, start: "09:00", end: "17:00" },
  };
  assert.equal(summarizeWeeklyHours(hours), "by appointment");
});

test("single day returns just that day's hours", () => {
  const hours = {
    monday:  { enabled: false, start: "00:00", end: "00:00" },
    tuesday: { enabled: false, start: "00:00", end: "00:00" },
    wednesday: { enabled: true, start: "10:00", end: "14:00" },
  };
  assert.equal(summarizeWeeklyHours(hours), "Wed 10-2");
});

test("two adjacent runs with different hours", () => {
  const hours = {
    monday:    { enabled: true, start: "09:00", end: "17:00" },
    tuesday:   { enabled: true, start: "09:00", end: "17:00" },
    wednesday: { enabled: true, start: "09:00", end: "17:00" },
    thursday:  { enabled: true, start: "12:00", end: "20:00" },
    friday:    { enabled: true, start: "12:00", end: "20:00" },
  };
  assert.equal(summarizeWeeklyHours(hours), "Mon-Wed 9-5, Thu-Fri 12-8");
});

test("midnight-to-midnight is treated as 24/7-style", () => {
  const hours = {
    monday:    { enabled: true, start: "00:00", end: "23:59" },
    tuesday:   { enabled: true, start: "00:00", end: "23:59" },
    wednesday: { enabled: true, start: "00:00", end: "23:59" },
    thursday:  { enabled: true, start: "00:00", end: "23:59" },
    friday:    { enabled: true, start: "00:00", end: "23:59" },
    saturday:  { enabled: true, start: "00:00", end: "23:59" },
    sunday:    { enabled: true, start: "00:00", end: "23:59" },
  };
  assert.equal(summarizeWeeklyHours(hours), "Mon-Sun 12-12");
});
