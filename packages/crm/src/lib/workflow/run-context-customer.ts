// CustomerRunContext — the customer-facing slice of RunContext.
// Customer-facing tool invokers (send_email, send_sms, create_booking,
// create_activity) and customer-facing render code (intake form
// chrome, booking page) import THIS type only. The agency field is
// physically absent so accidental leaks ("Max agency" footer on a
// booking confirmation) can't happen.
import type { RunContext } from "./run-context";

export type CustomerRunContext = Omit<RunContext, "agency">;

/**
 * Drop the agency field. Customer-facing code calls this on the
 * loaded RunContext before passing it to a tool invoker / email
 * branding loader / etc.
 */
export function asCustomerContext(rc: RunContext): CustomerRunContext {
  const { agency: _agency, ...customerFacing } = rc;
  return customerFacing;
}
