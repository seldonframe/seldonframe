import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { activities, bookings, contacts, organizations, users } from "@/db/schema";
import type { OrgSoul } from "@/lib/soul/types";

type StageLike = {
  name: string;
  autoActions?: string[];
};

function toHoursFromAction(action: string) {
  const match = action.match(/after\s*(\d+)\s*(hours?|days?)/i);

  if (!match) {
    return null;
  }

  const amount = Number.parseInt(match[1] ?? "0", 10);
  const unit = (match[2] ?? "hour").toLowerCase();

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return unit.startsWith("day") ? amount * 24 : amount;
}

function normalizeStageName(value: string) {
  return value.trim().toLowerCase();
}

function contactMatchesStage(status: string, stageName: string) {
  const normalizedStatus = normalizeStageName(status);
  const normalizedStage = normalizeStageName(stageName);

  if (!normalizedStage) {
    return false;
  }

  if (normalizedStatus === normalizedStage || normalizedStatus.includes(normalizedStage) || normalizedStage.includes(normalizedStatus)) {
    return true;
  }

  if (normalizedStage.includes("inquiry") && (normalizedStatus === "lead" || normalizedStatus === "inquiry")) {
    return true;
  }

  return false;
}

async function resolveOwnerUserId(orgId: string) {
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.orgId, orgId), eq(users.role, "owner")))
    .limit(1);

  if (owner?.id) {
    return owner.id;
  }

  const [fallback] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.orgId, orgId))
    .limit(1);

  return fallback?.id ?? null;
}

async function hasAutomationTask(params: {
  orgId: string;
  contactId: string;
  subject: string;
}) {
  const [existing] = await db
    .select({ id: activities.id })
    .from(activities)
    .where(
      and(
        eq(activities.orgId, params.orgId),
        eq(activities.contactId, params.contactId),
        eq(activities.type, "task"),
        eq(activities.subject, params.subject)
      )
    )
    .limit(1);

  return Boolean(existing?.id);
}

async function createAutomationTask(params: {
  orgId: string;
  ownerUserId: string;
  contactId: string;
  subject: string;
  body: string;
  stageName: string;
  action: string;
}) {
  const alreadyExists = await hasAutomationTask({
    orgId: params.orgId,
    contactId: params.contactId,
    subject: params.subject,
  });

  if (alreadyExists) {
    return false;
  }

  await db.insert(activities).values({
    orgId: params.orgId,
    userId: params.ownerUserId,
    contactId: params.contactId,
    type: "task",
    subject: params.subject,
    body: params.body,
    metadata: {
      source: "soul-automation",
      stage: params.stageName,
      action: params.action,
    },
    scheduledAt: new Date(),
  });

  return true;
}

async function processConditionalFollowUp(params: {
  orgId: string;
  ownerUserId: string;
  stageName: string;
  action: string;
  delayHours: number;
}) {
  const cutoff = new Date(Date.now() - params.delayHours * 60 * 60 * 1000);

  const contactRows = await db
    .select({ id: contacts.id, status: contacts.status, createdAt: contacts.createdAt })
    .from(contacts)
    .where(eq(contacts.orgId, params.orgId));

  let created = 0;

  for (const contact of contactRows) {
    if (!contactMatchesStage(contact.status, params.stageName)) {
      continue;
    }

    if (new Date(contact.createdAt) > cutoff) {
      continue;
    }

    const [existingBooking] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.orgId, params.orgId), eq(bookings.contactId, contact.id), ne(bookings.status, "template")))
      .limit(1);

    if (existingBooking?.id) {
      continue;
    }

    const taskCreated = await createAutomationTask({
      orgId: params.orgId,
      ownerUserId: params.ownerUserId,
      contactId: contact.id,
      subject: `Automation: Follow up (${params.stageName})`,
      body: params.action,
      stageName: params.stageName,
      action: params.action,
    });

    if (taskCreated) {
      created += 1;
    }
  }

  return created;
}

async function processStageFollowUp(params: {
  orgId: string;
  ownerUserId: string;
  stageName: string;
  action: string;
  delayHours: number;
}) {
  const cutoff = new Date(Date.now() - params.delayHours * 60 * 60 * 1000);

  const contactRows = await db
    .select({ id: contacts.id, status: contacts.status, createdAt: contacts.createdAt })
    .from(contacts)
    .where(eq(contacts.orgId, params.orgId));

  let created = 0;

  for (const contact of contactRows) {
    if (!contactMatchesStage(contact.status, params.stageName)) {
      continue;
    }

    if (new Date(contact.createdAt) > cutoff) {
      continue;
    }

    const taskCreated = await createAutomationTask({
      orgId: params.orgId,
      ownerUserId: params.ownerUserId,
      contactId: contact.id,
      subject: `Automation: Timed email (${params.stageName})`,
      body: params.action,
      stageName: params.stageName,
      action: params.action,
    });

    if (taskCreated) {
      created += 1;
    }
  }

  return created;
}

async function processCompletedBookingAction(params: {
  orgId: string;
  ownerUserId: string;
  stageName: string;
  action: string;
  subjectPrefix: string;
  delayHours?: number;
}) {
  const completedRows = await db
    .select({ contactId: bookings.contactId, completedAt: bookings.completedAt })
    .from(bookings)
    .where(and(eq(bookings.orgId, params.orgId), eq(bookings.status, "completed")));

  const minCompletedAt =
    typeof params.delayHours === "number"
      ? new Date(Date.now() - params.delayHours * 60 * 60 * 1000)
      : null;

  let created = 0;

  for (const row of completedRows) {
    if (!row.contactId) {
      continue;
    }

    if (minCompletedAt && row.completedAt && new Date(row.completedAt) > minCompletedAt) {
      continue;
    }

    const taskCreated = await createAutomationTask({
      orgId: params.orgId,
      ownerUserId: params.ownerUserId,
      contactId: row.contactId,
      subject: `${params.subjectPrefix} (${params.stageName})`,
      body: params.action,
      stageName: params.stageName,
      action: params.action,
    });

    if (taskCreated) {
      created += 1;
    }
  }

  return created;
}

export async function processSoulAutomations(orgId: string) {
  const [org] = await db
    .select({ soul: organizations.soul })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const soul = (org?.soul ?? null) as OrgSoul | null;

  if (!soul?.journey?.stages?.length) {
    return {
      orgId,
      processedStages: 0,
      actionsEvaluated: 0,
      tasksCreated: 0,
    };
  }

  const ownerUserId = await resolveOwnerUserId(orgId);

  if (!ownerUserId) {
    return {
      orgId,
      processedStages: 0,
      actionsEvaluated: 0,
      tasksCreated: 0,
    };
  }

  let actionsEvaluated = 0;
  let tasksCreated = 0;

  for (const stage of soul.journey.stages as StageLike[]) {
    const actions = Array.isArray(stage.autoActions) ? stage.autoActions : [];

    for (const action of actions) {
      actionsEvaluated += 1;

      const conditionalMatch = action.match(/if\s+no\s*(booking|response|reply).*?(\d+)\s*(hours?|days?)/i);

      if (conditionalMatch) {
        const amount = Number.parseInt(conditionalMatch[2] ?? "0", 10);
        const unit = (conditionalMatch[3] ?? "hour").toLowerCase();
        const delayHours = unit.startsWith("day") ? amount * 24 : amount;

        if (Number.isFinite(delayHours) && delayHours > 0) {
          tasksCreated += await processConditionalFollowUp({
            orgId,
            ownerUserId,
            stageName: stage.name,
            action,
            delayHours,
          });
          continue;
        }
      }

      const delayedEmailMatch = /send.*email.*after\s*(\d+)\s*(hours?|days?)/i.test(action);
      if (delayedEmailMatch) {
        const delayHours = toHoursFromAction(action) ?? 24;
        tasksCreated += await processStageFollowUp({
          orgId,
          ownerUserId,
          stageName: stage.name,
          action,
          delayHours,
        });
        continue;
      }

      if (/request.*review/i.test(action)) {
        tasksCreated += await processCompletedBookingAction({
          orgId,
          ownerUserId,
          stageName: stage.name,
          action,
          subjectPrefix: "Automation: Request review",
          delayHours: toHoursFromAction(action) ?? 0,
        });
        continue;
      }

      if (/referral.*request/i.test(action)) {
        tasksCreated += await processCompletedBookingAction({
          orgId,
          ownerUserId,
          stageName: stage.name,
          action,
          subjectPrefix: "Automation: Referral request",
          delayHours: toHoursFromAction(action) ?? 0,
        });
        continue;
      }

      if (/send.*welcome/i.test(action)) {
        tasksCreated += await processStageFollowUp({
          orgId,
          ownerUserId,
          stageName: stage.name,
          action,
          delayHours: toHoursFromAction(action) ?? 0,
        });
      }
    }
  }

  return {
    orgId,
    processedStages: soul.journey.stages.length,
    actionsEvaluated,
    tasksCreated,
  };
}
