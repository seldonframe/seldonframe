export type SoulLearning = {
  emailPatterns: {
    bestSubjectPhrases: string[];
    bestSendTimes: Array<{ dayOfWeek: number; hour: number }>;
    avgOpenRate: number;
    openRateTrend: number;
  };
  bookingPatterns: {
    preferredDays: number[];
    preferredTimes: Array<{ hour: number; count: number }>;
    avgNoShowRate: number;
    noShowRiskFactors: string[];
  };
  dealPatterns: {
    avgCycleDays: number;
    highValueLeadSignals: string[];
    bestSources: Array<{ source: string; conversionRate: number }>;
    commonDropoffStage: string;
  };
  clientPatterns: {
    avgLifetimeValue: number;
    churnRiskSignals: string[];
    expansionSignals: string[];
  };
};

export const emptySoulLearning: SoulLearning = {
  emailPatterns: {
    bestSubjectPhrases: [],
    bestSendTimes: [],
    avgOpenRate: 0,
    openRateTrend: 0,
  },
  bookingPatterns: {
    preferredDays: [],
    preferredTimes: [],
    avgNoShowRate: 0,
    noShowRiskFactors: [],
  },
  dealPatterns: {
    avgCycleDays: 0,
    highValueLeadSignals: [],
    bestSources: [],
    commonDropoffStage: "",
  },
  clientPatterns: {
    avgLifetimeValue: 0,
    churnRiskSignals: [],
    expansionSignals: [],
  },
};
