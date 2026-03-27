export type TelemetryEventMap = {
  soul_config_generated: {
    industry: string;
    stages_count: number;
    fields_generated: number;
  };
  soul_config_modified: {
    field_changed: string;
    old_type: string;
    new_type: string;
    days_after_setup: number;
  };
  pipeline_stage_used: {
    industry: string;
    stage_name: string;
    conversion_rate: number;
  };
  pipeline_stage_deleted: {
    industry: string;
    stage_name: string;
    days_after_creation: number;
  };
  custom_field_added: {
    industry: string;
    field_name: string;
    field_type: string;
    days_after_setup: number;
  };
  email_performance: {
    industry: string;
    email_type: string;
    open_rate: number;
    click_rate: number;
  };
  booking_performance: {
    industry: string;
    type: string;
    no_show_rate: number;
    conversion_rate: number;
  };
  landing_performance: {
    industry: string;
    section_types: string[];
    conversion_rate: number;
  };
  ai_draft_acceptance: {
    feature: string;
    accepted_unchanged: boolean;
    edited: boolean;
    rejected: boolean;
  };
  churn_signal: {
    industry: string;
    days_inactive: number;
    last_action: string;
    churned_30d: boolean;
  };
};

export type TelemetryEventName = keyof TelemetryEventMap;

export type TelemetryEnvelope<T extends TelemetryEventName = TelemetryEventName> = {
  name: T;
  payload: TelemetryEventMap[T];
  timestamp: string;
};

export type AnyTelemetryEnvelope = TelemetryEnvelope<TelemetryEventName>;
