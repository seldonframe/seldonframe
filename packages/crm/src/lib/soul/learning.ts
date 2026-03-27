import { eq } from "drizzle-orm";
import { emptySoulLearning, type SoulLearning } from "@seldonframe/core/soul";
import { db } from "@/db";
import { organizations } from "@/db/schema";

function clampRate(value: number) {
  return Math.max(0, Math.min(1, value));
}

function toLearning(value: unknown): SoulLearning {
  const incoming = (value ?? {}) as Partial<SoulLearning>;

  return {
    emailPatterns: {
      ...emptySoulLearning.emailPatterns,
      ...(incoming.emailPatterns ?? {}),
      bestSubjectPhrases: [...(incoming.emailPatterns?.bestSubjectPhrases ?? [])],
      bestSendTimes: [...(incoming.emailPatterns?.bestSendTimes ?? [])],
    },
    bookingPatterns: {
      ...emptySoulLearning.bookingPatterns,
      ...(incoming.bookingPatterns ?? {}),
      preferredDays: [...(incoming.bookingPatterns?.preferredDays ?? [])],
      preferredTimes: [...(incoming.bookingPatterns?.preferredTimes ?? [])],
      noShowRiskFactors: [...(incoming.bookingPatterns?.noShowRiskFactors ?? [])],
    },
    dealPatterns: {
      ...emptySoulLearning.dealPatterns,
      ...(incoming.dealPatterns ?? {}),
      highValueLeadSignals: [...(incoming.dealPatterns?.highValueLeadSignals ?? [])],
      bestSources: [...(incoming.dealPatterns?.bestSources ?? [])],
    },
    clientPatterns: {
      ...emptySoulLearning.clientPatterns,
      ...(incoming.clientPatterns ?? {}),
      churnRiskSignals: [...(incoming.clientPatterns?.churnRiskSignals ?? [])],
      expansionSignals: [...(incoming.clientPatterns?.expansionSignals ?? [])],
    },
  };
}

async function updateSoulLearning(orgId: string, updater: (learning: SoulLearning) => SoulLearning) {
  const [org] = await db
    .select({ soulLearning: organizations.soulLearning })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) {
    return;
  }

  const learning = toLearning(org.soulLearning);
  const next = updater(learning);

  await db
    .update(organizations)
    .set({
      soulLearning: next,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, orgId));
}

function addUnique<T>(items: T[], value: T, limit = 12) {
  const next = [value, ...items.filter((item) => item !== value)];
  return next.slice(0, limit);
}

export async function recordEmailSentLearning(params: {
  orgId: string;
  subject: string;
  sentAt?: Date;
}) {
  await updateSoulLearning(params.orgId, (learning) => {
    const sentAt = params.sentAt ?? new Date();
    const dayOfWeek = sentAt.getUTCDay();
    const hour = sentAt.getUTCHours();
    const prevAvg = learning.emailPatterns.avgOpenRate;
    const nextAvg = clampRate((prevAvg * 9 + 0) / 10);

    const normalizedSubject = params.subject.trim();
    const subjectPhrase = normalizedSubject.split(/\s+/).slice(0, 4).join(" ");

    return {
      ...learning,
      emailPatterns: {
        ...learning.emailPatterns,
        bestSubjectPhrases: subjectPhrase
          ? addUnique(learning.emailPatterns.bestSubjectPhrases, subjectPhrase, 16)
          : learning.emailPatterns.bestSubjectPhrases,
        bestSendTimes: addUnique(learning.emailPatterns.bestSendTimes, { dayOfWeek, hour }, 16),
        avgOpenRate: nextAvg,
        openRateTrend: nextAvg - prevAvg,
      },
    };
  });
}

export async function recordEmailOpenedLearning(orgId: string) {
  await updateSoulLearning(orgId, (learning) => {
    const prevAvg = learning.emailPatterns.avgOpenRate;
    const nextAvg = clampRate((prevAvg * 9 + 1) / 10);

    return {
      ...learning,
      emailPatterns: {
        ...learning.emailPatterns,
        avgOpenRate: nextAvg,
        openRateTrend: nextAvg - prevAvg,
      },
    };
  });
}

export async function recordBookingOutcomeLearning(params: {
  orgId: string;
  startsAt?: Date;
  status: "completed" | "no_show";
}) {
  await updateSoulLearning(params.orgId, (learning) => {
    const startsAt = params.startsAt ?? new Date();
    const day = startsAt.getUTCDay();
    const hour = startsAt.getUTCHours();

    const preferredTimes = [...learning.bookingPatterns.preferredTimes];
    const existingHour = preferredTimes.find((item) => item.hour === hour);

    if (existingHour) {
      existingHour.count += 1;
    } else {
      preferredTimes.push({ hour, count: 1 });
    }

    preferredTimes.sort((a, b) => b.count - a.count);

    const prevNoShowRate = learning.bookingPatterns.avgNoShowRate;
    const eventNoShow = params.status === "no_show" ? 1 : 0;
    const nextNoShowRate = clampRate((prevNoShowRate * 9 + eventNoShow) / 10);

    return {
      ...learning,
      bookingPatterns: {
        ...learning.bookingPatterns,
        preferredDays: addUnique(learning.bookingPatterns.preferredDays, day, 7),
        preferredTimes: preferredTimes.slice(0, 12),
        avgNoShowRate: nextNoShowRate,
        noShowRiskFactors:
          params.status === "no_show"
            ? addUnique(learning.bookingPatterns.noShowRiskFactors, "historical_no_show", 12)
            : learning.bookingPatterns.noShowRiskFactors,
      },
    };
  });
}

export async function recordDealStageLearning(params: {
  orgId: string;
  source?: string | null;
  stage: string;
  probability: number;
  value?: number;
  createdAt?: Date;
}) {
  await updateSoulLearning(params.orgId, (learning) => {
    const stageLower = params.stage.toLowerCase();
    const isClosed = params.probability === 100 || stageLower.includes("won") || stageLower.includes("lost");

    const cycleDays =
      isClosed && params.createdAt
        ? Math.max(0, (Date.now() - params.createdAt.getTime()) / (24 * 60 * 60 * 1000))
        : null;

    const prevCycle = learning.dealPatterns.avgCycleDays;
    const nextCycle = cycleDays === null ? prevCycle : (prevCycle * 4 + cycleDays) / 5;

    const bestSources = [...learning.dealPatterns.bestSources];
    if (params.source) {
      const existing = bestSources.find((item) => item.source === params.source);
      const conversionSignal = params.probability >= 80 ? 1 : 0;

      if (existing) {
        existing.conversionRate = clampRate((existing.conversionRate * 4 + conversionSignal) / 5);
      } else {
        bestSources.push({ source: params.source, conversionRate: conversionSignal });
      }
    }

    bestSources.sort((a, b) => b.conversionRate - a.conversionRate);

    const highValueSignals = [...learning.dealPatterns.highValueLeadSignals];
    if ((params.value ?? 0) >= 10000 && params.source) {
      highValueSignals.unshift(`source:${params.source}`);
    }

    const dedupSignals = Array.from(new Set(highValueSignals)).slice(0, 16);

    let churnSignals = learning.clientPatterns.churnRiskSignals;
    let expansionSignals = learning.clientPatterns.expansionSignals;

    if (stageLower.includes("lost") || stageLower.includes("churn")) {
      churnSignals = addUnique(churnSignals, `stage:${params.stage}`, 16);
    }

    if (stageLower.includes("expansion") || stageLower.includes("upgrade")) {
      expansionSignals = addUnique(expansionSignals, `stage:${params.stage}`, 16);
    }

    return {
      ...learning,
      dealPatterns: {
        ...learning.dealPatterns,
        avgCycleDays: nextCycle,
        highValueLeadSignals: dedupSignals,
        bestSources: bestSources.slice(0, 12),
        commonDropoffStage:
          stageLower.includes("lost") || stageLower.includes("churn")
            ? params.stage
            : learning.dealPatterns.commonDropoffStage,
      },
      clientPatterns: {
        ...learning.clientPatterns,
        churnRiskSignals: churnSignals,
        expansionSignals,
      },
    };
  });
}

export async function recordClientLifecycleLearning(params: {
  orgId: string;
  event: "churn" | "expansion";
  signal: string;
  lifetimeValue?: number;
}) {
  await updateSoulLearning(params.orgId, (learning) => {
    const prevAvg = learning.clientPatterns.avgLifetimeValue;
    const nextAvg =
      typeof params.lifetimeValue === "number" ? (prevAvg * 4 + Math.max(0, params.lifetimeValue)) / 5 : prevAvg;

    return {
      ...learning,
      clientPatterns: {
        ...learning.clientPatterns,
        avgLifetimeValue: nextAvg,
        churnRiskSignals:
          params.event === "churn"
            ? addUnique(learning.clientPatterns.churnRiskSignals, params.signal, 16)
            : learning.clientPatterns.churnRiskSignals,
        expansionSignals:
          params.event === "expansion"
            ? addUnique(learning.clientPatterns.expansionSignals, params.signal, 16)
            : learning.clientPatterns.expansionSignals,
      },
    };
  });
}

export async function inferClientLifecycleFromStatus(params: {
  orgId: string;
  status: string;
  source?: string;
  lifetimeValue?: number;
}) {
  const status = params.status.toLowerCase();

  if (status.includes("churn") || status.includes("inactive")) {
    await recordClientLifecycleLearning({
      orgId: params.orgId,
      event: "churn",
      signal: params.source ? `source:${params.source}` : `status:${params.status}`,
      lifetimeValue: params.lifetimeValue,
    });
  }

  if (status.includes("expansion") || status.includes("upsell") || status.includes("vip")) {
    await recordClientLifecycleLearning({
      orgId: params.orgId,
      event: "expansion",
      signal: params.source ? `source:${params.source}` : `status:${params.status}`,
      lifetimeValue: params.lifetimeValue,
    });
  }
}
