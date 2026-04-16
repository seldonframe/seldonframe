import { and, eq, gt, lte } from "drizzle-orm";
import { db } from "@/db";
import { brainCompilationRuns, brainEvents } from "@/db/schema";

type DreamRunMetrics = {
  semanticPromotions: number;
  personalPromotions: number;
  prunedEvents: number;
  prunedUsefulEvents: number;
};

type BrainHealthWindow = {
  windowDays: number;
  startAt: string;
  endAt: string;
  generatedAt: string;
  overallHealthScore: number;
  salience: {
    average: number;
    distribution: {
      low: number;
      medium: number;
      high: number;
    };
    counts: {
      total: number;
      low: number;
      medium: number;
      high: number;
    };
  };
  feedback: {
    builderSeldonEvents: number;
    withFeedback: number;
    positive: number;
    negative: number;
    neutral: number;
    positiveRatePercent: number;
  };
  context: {
    eventsWithContext: number;
    averageContextChars: number;
    averageSelectedArticles: number;
    averageSelectedPersonalInsights: number;
  };
  dreamCycle: {
    runs: number;
    eventsProcessed: number;
    semanticPromotions: number;
    personalPromotions: number;
    compressionRatio: number;
  };
  pruning: {
    prunedEvents: number;
    usefulPrunedEvents: number;
    pruningSafetyRatio: number;
  };
};

type TrendDirection = "↑ improving" | "↓ worsening" | "→ stable";

type BrainHealthTrends = {
  overallHealthScore: TrendDirection;
  salienceAverage: TrendDirection;
  positiveFeedbackRate: TrendDirection;
  averageContextSize: TrendDirection;
  compressionRatio: TrendDirection;
  pruningSafetyRatio: TrendDirection;
};

type BrainHealthWindowWithTrends = BrainHealthWindow & {
  trends: BrainHealthTrends;
};

type BrainHealthSummary = {
  generatedAt: string;
  windows: {
    last7Days: BrainHealthWindowWithTrends;
    last30Days: BrainHealthWindowWithTrends;
  };
};

const CURRENT_RUN_WINDOW_GRACE_MS = 5 * 60 * 1000;

function round(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function avg(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}

function computeOverallHealthScore(metrics: {
  positiveFeedbackRatePercent: number;
  compressionRatio: number;
  pruningSafetyRatio: number;
}) {
  const feedbackScore = clamp01(metrics.positiveFeedbackRatePercent / 100);
  const compressionScore = clamp01(metrics.compressionRatio);
  const pruningSafetyScore = 1 - clamp01(metrics.pruningSafetyRatio);

  const weighted = feedbackScore * 0.4 + compressionScore * 0.3 + pruningSafetyScore * 0.3;
  return round(weighted * 100, 2);
}

function trendDirection(current: number, previous: number, options?: { higherIsBetter?: boolean; epsilon?: number }): TrendDirection {
  const epsilon = options?.epsilon ?? 0.001;
  const higherIsBetter = options?.higherIsBetter ?? true;
  const delta = current - previous;

  if (Math.abs(delta) <= epsilon) {
    return "→ stable";
  }

  if (higherIsBetter) {
    return delta > 0 ? "↑ improving" : "↓ worsening";
  }

  return delta < 0 ? "↑ improving" : "↓ worsening";
}

function parseDreamRunMetrics(articlesUpdated: string[]) {
  const metrics: DreamRunMetrics = {
    semanticPromotions: 0,
    personalPromotions: 0,
    prunedEvents: 0,
    prunedUsefulEvents: 0,
  };

  const parseMetric = (metricKey: string) => {
    const marker = `meta://dream-cycle/${metricKey}=`;
    const row = articlesUpdated.find((entry) => entry.startsWith(marker));
    if (!row) {
      return 0;
    }

    const raw = row.slice(marker.length).trim();
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  metrics.semanticPromotions = parseMetric("semantic_promotions");
  metrics.personalPromotions = parseMetric("personal_promotions");
  metrics.prunedEvents = parseMetric("pruned_events");
  metrics.prunedUsefulEvents = parseMetric("pruned_useful_events");

  return metrics;
}

export async function computeBrainHealthMetrics(
  windowDays: number,
  options?: { endAt?: Date; runWindowGraceMs?: number }
): Promise<BrainHealthWindow> {
  const endAt = options?.endAt ?? new Date();
  const since = new Date(endAt.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const runWindowEndAt = new Date(endAt.getTime() + Math.max(0, options?.runWindowGraceMs ?? 0));

  const [eventRows, runRows] = await Promise.all([
    db
      .select({
        eventType: brainEvents.eventType,
        salienceScore: brainEvents.salienceScore,
        feedbackScore: brainEvents.feedbackScore,
        payload: brainEvents.payload,
      })
      .from(brainEvents)
      .where(and(gt(brainEvents.timestamp, since), lte(brainEvents.timestamp, endAt))),
    db
      .select({
        status: brainCompilationRuns.status,
        eventsProcessed: brainCompilationRuns.eventsProcessed,
        articlesUpdated: brainCompilationRuns.articlesUpdated,
      })
      .from(brainCompilationRuns)
      .where(
        and(
          eq(brainCompilationRuns.status, "success"),
          gt(brainCompilationRuns.runAt, since),
          lte(brainCompilationRuns.runAt, runWindowEndAt)
        )
      ),
  ]);

  const salienceValues = eventRows
    .map((row) => (typeof row.salienceScore === "number" ? row.salienceScore : 0.5))
    .filter((value) => Number.isFinite(value));

  const lowCount = salienceValues.filter((value) => value < 0.4).length;
  const mediumCount = salienceValues.filter((value) => value >= 0.4 && value <= 0.7).length;
  const highCount = salienceValues.filter((value) => value > 0.7).length;
  const salienceTotal = salienceValues.length || 1;

  const builderSeldonEvents = eventRows.filter((row) => {
    if (row.eventType !== "seldon_it_applied") {
      return false;
    }

    const payload = (row.payload ?? {}) as Record<string, unknown>;
    return String(payload.mode ?? "") === "builder";
  });

  const feedbackRows = builderSeldonEvents.filter((row) => typeof row.feedbackScore === "number");
  const positive = feedbackRows.filter((row) => (row.feedbackScore ?? 0) > 0).length;
  const negative = feedbackRows.filter((row) => (row.feedbackScore ?? 0) < 0).length;
  const neutral = feedbackRows.filter((row) => row.feedbackScore === 0).length;

  const contextRows = builderSeldonEvents
    .map((row) => {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      return {
        contextChars: Number(payload.context_chars ?? 0),
        selectedArticles: Number(payload.context_selected_articles ?? 0),
        selectedPersonalInsights: Number(payload.context_selected_personal_insights ?? 0),
      };
    })
    .filter((row) => Number.isFinite(row.contextChars) && row.contextChars > 0);

  const dreamRunMetrics = runRows.map((row) => parseDreamRunMetrics(Array.isArray(row.articlesUpdated) ? row.articlesUpdated : []));
  const eventsProcessed = runRows.reduce((sum, row) => sum + Number(row.eventsProcessed ?? 0), 0);
  const semanticPromotions = dreamRunMetrics.reduce((sum, row) => sum + row.semanticPromotions, 0);
  const personalPromotions = dreamRunMetrics.reduce((sum, row) => sum + row.personalPromotions, 0);
  const prunedEvents = dreamRunMetrics.reduce((sum, row) => sum + row.prunedEvents, 0);
  const usefulPrunedEvents = dreamRunMetrics.reduce((sum, row) => sum + row.prunedUsefulEvents, 0);

  const positiveRatePercent = round(feedbackRows.length > 0 ? (positive / feedbackRows.length) * 100 : 0, 2);
  const compressionRatio = round(eventsProcessed > 0 ? (semanticPromotions + personalPromotions) / eventsProcessed : 0, 4);
  const pruningSafetyRatio = round(prunedEvents > 0 ? usefulPrunedEvents / prunedEvents : 0, 4);
  const overallHealthScore = computeOverallHealthScore({
    positiveFeedbackRatePercent: positiveRatePercent,
    compressionRatio,
    pruningSafetyRatio,
  });

  return {
    windowDays,
    startAt: since.toISOString(),
    endAt: endAt.toISOString(),
    generatedAt: new Date().toISOString(),
    overallHealthScore,
    salience: {
      average: round(avg(salienceValues)),
      distribution: {
        low: round(lowCount / salienceTotal),
        medium: round(mediumCount / salienceTotal),
        high: round(highCount / salienceTotal),
      },
      counts: {
        total: salienceValues.length,
        low: lowCount,
        medium: mediumCount,
        high: highCount,
      },
    },
    feedback: {
      builderSeldonEvents: builderSeldonEvents.length,
      withFeedback: feedbackRows.length,
      positive,
      negative,
      neutral,
      positiveRatePercent,
    },
    context: {
      eventsWithContext: contextRows.length,
      averageContextChars: round(avg(contextRows.map((row) => row.contextChars)), 1),
      averageSelectedArticles: round(avg(contextRows.map((row) => row.selectedArticles)), 2),
      averageSelectedPersonalInsights: round(avg(contextRows.map((row) => row.selectedPersonalInsights)), 2),
    },
    dreamCycle: {
      runs: runRows.length,
      eventsProcessed,
      semanticPromotions,
      personalPromotions,
      compressionRatio,
    },
    pruning: {
      prunedEvents,
      usefulPrunedEvents,
      pruningSafetyRatio,
    },
  };
}

function buildTrends(current: BrainHealthWindow, previous: BrainHealthWindow): BrainHealthTrends {
  return {
    overallHealthScore: trendDirection(current.overallHealthScore, previous.overallHealthScore, { epsilon: 0.1 }),
    salienceAverage: trendDirection(current.salience.average, previous.salience.average, { epsilon: 0.01 }),
    positiveFeedbackRate: trendDirection(current.feedback.positiveRatePercent, previous.feedback.positiveRatePercent, { epsilon: 0.5 }),
    averageContextSize: trendDirection(current.context.averageContextChars, previous.context.averageContextChars, {
      higherIsBetter: false,
      epsilon: 25,
    }),
    compressionRatio: trendDirection(current.dreamCycle.compressionRatio, previous.dreamCycle.compressionRatio, { epsilon: 0.005 }),
    pruningSafetyRatio: trendDirection(current.pruning.pruningSafetyRatio, previous.pruning.pruningSafetyRatio, {
      higherIsBetter: false,
      epsilon: 0.001,
    }),
  };
}

export async function getBrainHealthSummary(): Promise<BrainHealthSummary> {
  const now = new Date();
  const [last7Days, previous7Days, last30Days, previous30Days] = await Promise.all([
    computeBrainHealthMetrics(7, { endAt: now, runWindowGraceMs: CURRENT_RUN_WINDOW_GRACE_MS }),
    computeBrainHealthMetrics(7, { endAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) }),
    computeBrainHealthMetrics(30, { endAt: now, runWindowGraceMs: CURRENT_RUN_WINDOW_GRACE_MS }),
    computeBrainHealthMetrics(30, { endAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) }),
  ]);

  const last7DaysWithTrends: BrainHealthWindowWithTrends = {
    ...last7Days,
    trends: buildTrends(last7Days, previous7Days),
  };

  const last30DaysWithTrends: BrainHealthWindowWithTrends = {
    ...last30Days,
    trends: buildTrends(last30Days, previous30Days),
  };

  return {
    generatedAt: new Date().toISOString(),
    windows: {
      last7Days: last7DaysWithTrends,
      last30Days: last30DaysWithTrends,
    },
  };
}
