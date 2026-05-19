// 2026-05-19 — Phase 2 Task 2.3 — shared CustomerRunContext stub for
// step-dispatcher specs. The 4th-param threading is a signature
// uniformity change; most dispatchers don't READ runContext, but
// every call site must supply a typed value. Centralizing the stub
// here avoids each spec carrying its own copy and drifting out of
// sync with the type as RunContext evolves.

import type { CustomerRunContext } from "../../src/lib/workflow/run-context-customer";

const NOW_ISO = "2026-05-19T12:00:00.000Z";

export function makeCustomerRunContext(
  overrides: Partial<CustomerRunContext> = {},
): CustomerRunContext {
  return {
    runId: "run_test",
    orgId: "org_test",
    archetypeId: "test-archetype",
    startedAt: NOW_ISO,
    customer: {
      contactId: "contact_test",
      firstName: "Test",
      lastName: "User",
      email: "test@example.com",
      phone: "+15555550100",
    },
    workspace: {
      id: "ws_test",
      name: "Test Workspace",
      slug: "test-workspace",
      timezone: "America/New_York",
      soul: {} as unknown as CustomerRunContext["workspace"]["soul"],
      theme: {},
    },
    clock: {
      nowIso: NOW_ISO,
      today: "2026-05-19",
      tomorrow: "2026-05-20",
      todayWeekday: "Tuesday",
    },
    source: { type: "manual", triggerEventId: null },
    ...overrides,
  };
}

/** Sealed convenience constant — most specs don't need overrides. */
export const customerRunContextStub: CustomerRunContext = makeCustomerRunContext();
