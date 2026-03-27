export type EntityLabel = {
  singular: string;
  plural: string;
};

export type PipelineStageConfig = {
  name: string;
  color: string;
  probability: number;
};

export type CustomFieldConfig = {
  key: string;
  label: string;
  type: string;
  options?: string[];
};

export type BookingBlockConfig = {
  enabled: boolean;
  defaultDurationMinutes: number;
  preferredProvider: "zoom" | "google-meet" | "google-calendar" | "microsoft-graph" | "manual";
  bookingPageHeadline: string;
  bookingPageDescription: string;
  bufferMinutes: number;
  allowWeekends: boolean;
};

export type LandingBlockConfig = {
  enabled: boolean;
  defaultSections: Array<{ type: string; title: string }>;
  defaultCtaLabel: string;
  defaultCtaTarget: "intake" | "booking" | "external";
  heroHeadline: string;
  heroSubheadline: string;
};

export type EmailBlockConfig = {
  enabled: boolean;
  preferredProvider: "resend" | "sendgrid" | "postmark" | "manual";
  defaultFromName: string;
  defaultSubjectPrefix: string;
  welcomeTemplateSubject: string;
  welcomeTemplateBody: string;
  followUpDelayHours: number;
};

export type PortalBlockConfig = {
  enabled: boolean;
  welcomeMessage: string;
  enableMessaging: boolean;
  enableResources: boolean;
  enableInvoices: boolean;
  resourceCategories: string[];
};

export interface FrameworkConfig {
  appName: string;
  appDescription: string;
  logo: string;
  entities: {
    contact: EntityLabel;
    deal: EntityLabel;
    activity: EntityLabel;
    pipeline: EntityLabel;
  };
  defaultPipeline: {
    name: string;
    stages: PipelineStageConfig[];
  };
  defaultCustomFields: {
    contact: CustomFieldConfig[];
    deal: CustomFieldConfig[];
  };
  features: {
    deals: boolean;
    intakeForms: boolean;
    aiFeatures: boolean;
    soulSystem: boolean;
    import: boolean;
    export: boolean;
    webhooks: boolean;
    api: boolean;
  };
  contactStatuses: string[];
  activityTypes: string[];
  booking?: BookingBlockConfig;
  landing?: LandingBlockConfig;
  email?: EmailBlockConfig;
  portal?: PortalBlockConfig;
}
