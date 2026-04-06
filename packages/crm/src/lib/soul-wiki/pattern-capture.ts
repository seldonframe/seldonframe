import type { EventEnvelope, EventType } from "@seldonframe/core/events";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { seldonPatterns } from "@/db/schema";

type GenericEvent = EventEnvelope<EventType>;

const PATTERN_EVENT_MAP: Record<string, { blockType: string; blockSubtype?: string; outcomeType: string }> = {
  "form.submitted": { blockType: "form", outcomeType: "submitted" },
  "landing.visited": { blockType: "page", outcomeType: "visited" },
  "landing.converted": { blockType: "page", outcomeType: "converted" },
  "booking.created": { blockType: "booking", outcomeType: "created" },
  "booking.completed": { blockType: "booking", outcomeType: "completed" },
  "booking.cancelled": { blockType: "booking", outcomeType: "cancelled" },
  "booking.no_show": { blockType: "booking", outcomeType: "no_show" },
  "email.sent": { blockType: "email", outcomeType: "sent" },
  "email.opened": { blockType: "email", outcomeType: "opened" },
  "email.clicked": { blockType: "email", outcomeType: "clicked" },
};

export async function captureAnonymousPattern(event: GenericEvent) {
  const mapped = PATTERN_EVENT_MAP[event.type];
  if (!mapped) {
    return;
  }

  const structure = buildStructure(event);
  const outcome = {
    eventType: event.type,
    outcomeType: mapped.outcomeType,
    capturedAt: event.createdAt.toISOString(),
  };

  const [existing] = await db
    .select({ id: seldonPatterns.id, sampleSize: seldonPatterns.sampleSize })
    .from(seldonPatterns)
    .where(
      and(
        eq(seldonPatterns.frameworkType, "default"),
        eq(seldonPatterns.blockType, mapped.blockType),
        eq(seldonPatterns.blockSubtype, mapped.blockSubtype ?? event.type)
      )
    )
    .limit(1);

  if (!existing) {
    await db.insert(seldonPatterns).values({
      frameworkType: "default",
      blockType: mapped.blockType,
      blockSubtype: mapped.blockSubtype ?? event.type,
      structure,
      outcome,
      sampleSize: 1,
      confidence: initialConfidence(mapped.outcomeType),
    });
    return;
  }

  const nextSampleSize = Math.max(1, Number(existing.sampleSize ?? 0) + 1);
  await db
    .update(seldonPatterns)
    .set({
      sampleSize: nextSampleSize,
      confidence: blendedConfidence(nextSampleSize, mapped.outcomeType),
      structure,
      outcome,
      updatedAt: sql`now()`,
    })
    .where(eq(seldonPatterns.id, existing.id));
}

function buildStructure(event: GenericEvent) {
  const data = event.data && typeof event.data === "object" ? (event.data as Record<string, unknown>) : {};

  const payloadKeys = Object.keys(data).sort();
  const hasContact = typeof data.contactId === "string";

  return {
    eventType: event.type,
    payloadKeys,
    hasContact,
  };
}

function initialConfidence(outcomeType: string) {
  return successWeight(outcomeType);
}

function blendedConfidence(sampleSize: number, outcomeType: string) {
  const weight = successWeight(outcomeType);
  const boundedSamples = Math.min(sampleSize, 100);
  const ramp = boundedSamples / 100;
  return Number((weight * (0.5 + 0.5 * ramp)).toFixed(4));
}

function successWeight(outcomeType: string) {
  if (["converted", "submitted", "completed", "clicked", "opened"].includes(outcomeType)) {
    return 1;
  }

  if (["visited", "sent", "created"].includes(outcomeType)) {
    return 0.7;
  }

  if (["cancelled", "no_show"].includes(outcomeType)) {
    return 0.2;
  }

  return 0.5;
}
