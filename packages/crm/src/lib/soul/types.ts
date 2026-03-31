export type SoulField = {
  key: string;
  label: string;
  type: string;
  options?: string[];
};

export type SoulStage = {
  name: string;
  color: string;
  probability: number;
};

export type SoulLabel = {
  singular: string;
  plural: string;
};

export type SoulJourneyStage = {
  name: string;
  duration?: string;
  goal?: string;
  autoActions?: string[];
  ongoing?: boolean;
};

export type SoulClientSegment = {
  name: string;
  needs?: string;
  risk?: string;
  opportunity?: string;
};

export type SoulKeyMoment = {
  trigger: string;
  importance: "critical" | "high" | "medium";
  action: string;
};

export type SoulGoalMetric = {
  metric: string;
  target: number;
};

export type SoulService = {
  name: string;
  duration?: string;
  price?: number;
  description?: string;
};

export type SoulDeepSetupResponse = {
  field: string;
  question: string;
  response: string;
  answeredAt: string;
};

export type SoulDeepSetup = {
  askedFields?: string[];
  responses?: SoulDeepSetupResponse[];
  completedAt?: string;
  skippedAt?: string;
};

export interface OrgSoul {
  businessName: string;
  businessDescription: string;
  industry: string;
  offerType: string;
  entityLabels: {
    contact: SoulLabel;
    deal: SoulLabel;
    activity: SoulLabel;
    pipeline: SoulLabel;
    intakeForm: SoulLabel;
  };
  pipeline: {
    name: string;
    stages: SoulStage[];
  };
  suggestedFields: {
    contact: SoulField[];
    deal: SoulField[];
  };
  contactStatuses: Array<{ value: string; label: string; color: string }>;
  voice: {
    style: string;
    vocabulary: string[];
    avoidWords: string[];
    samplePhrases: string[];
  };
  priorities: string[];
  aiContext: string;
  suggestedIntakeForm: {
    name: string;
    fields: Array<{ key: string; label: string; type: string; required: boolean }>;
  };
  branding: {
    primaryColor: string;
    accentColor: string;
    mood: string;
  };
  rawInput: {
    processDescription: string;
    painPoint: string;
    clientDescription: string;
  };

  journey?: {
    stages: SoulJourneyStage[];
  };
  clientIntelligence?: {
    segments?: SoulClientSegment[];
    keyMoments?: SoulKeyMoment[];
  };
  goals?: {
    monthly?: SoulGoalMetric[];
    dashboardFocus?: {
      primary?: string;
      secondary?: string;
      tertiary?: string;
    };
  };
  ecosystem?: {
    referralSources?: Array<{
      name: string;
      relationship?: string;
    }>;
    differentiators?: string[];
    competitors?: string[];
  };
  services?: SoulService[];
  deepSetup?: SoulDeepSetup;
}

export type SoulWizardInput = {
  businessName: string;
  offerType: string;
  businessDescription: string;
  industry: string;
  clientType: string;
  clientLabel: string;
  leadSources: string[];
  processDescription: string;
  processDuration: string;
  stages: string[];
  communicationStyle: string;
  vocabulary: string[];
  avoidWords: string[];
  priorities: string[];
  painPoint: string;
  clientDescription: string;
};
