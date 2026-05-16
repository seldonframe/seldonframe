// packages/crm/src/db/schema/agency-profile.ts
// Shape of the users.agency_profile JSONB column added in 0045_users_agency_profile.sql.
// Spec: 2026-05-16-seldonframe-web-onboarding-pivot-design.md §"Schema migration".

export type AgencyProfile = {
  name?: string;
  logo_url?: string;
  brand_color?: string;
  website_url?: string;
};
