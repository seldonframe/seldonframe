// packages/crm/src/db/schema/agency-profile.ts
// Shape of the users.agency_profile JSONB column added in 0045_users_agency_profile.sql.
// Spec: 2026-05-16-seldonframe-web-onboarding-pivot-design.md §"Schema migration".
//
// 2026-05-19 — extended for Proposal Builder. proposalTemplate carries the
// per-agency editable copy for the proposal email + page. Spec:
// 2026-05-19-proposal-builder-design.md §"Per-agency template editor".

export type AgencyProposalTemplate = {
  subject: string;
  introCopy: string;
  scopeCopy: string;
  timelineCopy: string;
  termsCopy: string;
};

export type AgencyProfile = {
  name?: string;
  logo_url?: string;
  brand_color?: string;
  website_url?: string;
  // 2026-05-19 — proposalTemplate is intentionally camelCase. The legacy
  // snake_case fields above (logo_url, brand_color, website_url) predate
  // this convention and are retained for migration compatibility; all new
  // fields use camelCase to match TypeScript idioms + downstream consumer code.
  proposalTemplate?: AgencyProposalTemplate;
};
