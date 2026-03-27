import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  bookings,
  contacts,
  emails,
  intakeForms,
  intakeSubmissions,
  landingPages,
  organizations,
  portalMessages,
  portalResources,
  users,
} from "@/db/schema";
import { resolveBookingProvider } from "@/lib/bookings/providers";
import { getAvailableEmailProviders, resolveEmailProvider } from "@/lib/emails/providers";
import { getSeldonEventBus, type EventType } from "@seldonframe/core/events";

const now = new Date();

async function ensureOrgAndOwner() {
  const smokeSlug = `smoke-${randomUUID().slice(0, 8)}`;

  const [org] = await db
    .insert(organizations)
    .values({
      name: `Smoke Org ${smokeSlug}`,
      slug: smokeSlug,
      plan: "pro",
    })
    .returning({ id: organizations.id, slug: organizations.slug });

  if (!org) {
    throw new Error("Failed to create smoke org");
  }

  const [owner] = await db
    .insert(users)
    .values({
      orgId: org.id,
      name: "Smoke Owner",
      email: `owner+${smokeSlug}@example.com`,
      role: "owner",
      passwordHash: "smoke",
    })
    .returning({ id: users.id });

  if (!owner) {
    throw new Error("Failed to create smoke owner");
  }

  return {
    orgId: org.id,
    orgSlug: org.slug,
    ownerId: owner.id,
  };
}

async function runCrossBlockFlow() {
  const eventBus = getSeldonEventBus();
  const observedEvents: EventType[] = [];

  const unregister = [
    eventBus.on("landing.visited", async () => {
      observedEvents.push("landing.visited");
    }),
    eventBus.on("landing.converted", async () => {
      observedEvents.push("landing.converted");
    }),
    eventBus.on("email.sent", async () => {
      observedEvents.push("email.sent");
    }),
    eventBus.on("email.opened", async () => {
      observedEvents.push("email.opened");
    }),
    eventBus.on("email.clicked", async () => {
      observedEvents.push("email.clicked");
    }),
    eventBus.on("booking.created", async () => {
      observedEvents.push("booking.created");
    }),
    eventBus.on("booking.completed", async () => {
      observedEvents.push("booking.completed");
    }),
    eventBus.on("portal.login", async () => {
      observedEvents.push("portal.login");
    }),
    eventBus.on("portal.message_sent", async () => {
      observedEvents.push("portal.message_sent");
    }),
    eventBus.on("portal.resource_viewed", async () => {
      observedEvents.push("portal.resource_viewed");
    }),
  ];

  try {
    const { orgId, orgSlug, ownerId } = await ensureOrgAndOwner();

    const [landing] = await db
      .insert(landingPages)
      .values({
        orgId,
        title: "Smoke Landing",
        slug: `landing-${randomUUID().slice(0, 6)}`,
        status: "published",
        sections: [{ id: "hero", type: "hero", title: "Smoke Hero" }],
      })
      .returning({ id: landingPages.id, slug: landingPages.slug });

    if (!landing) {
      throw new Error("Failed to create landing page");
    }

    await eventBus.emit("landing.visited", {
      pageId: landing.id,
      visitorId: `visitor-${randomUUID().slice(0, 6)}`,
    });

    const [form] = await db
      .insert(intakeForms)
      .values({
        orgId,
        name: "Smoke Intake",
        slug: `intake-${randomUUID().slice(0, 6)}`,
        fields: [{ key: "email", label: "Email", type: "email", required: true }],
      })
      .returning({ id: intakeForms.id });

    if (!form) {
      throw new Error("Failed to create intake form");
    }

    const [contact] = await db
      .insert(contacts)
      .values({
        orgId,
        firstName: "Smoke",
        lastName: "Lead",
        email: `lead+${randomUUID().slice(0, 6)}@example.com`,
        status: "lead",
        source: "landing",
      })
      .returning({ id: contacts.id, email: contacts.email });

    if (!contact) {
      throw new Error("Failed to create contact");
    }

    await db.insert(intakeSubmissions).values({
      orgId,
      formId: form.id,
      contactId: contact.id,
      data: { email: contact.email, source: "smoke" },
    });

    await eventBus.emit("landing.converted", {
      pageId: landing.id,
      contactId: contact.id,
    });

    const emailProvider = await resolveEmailProvider(null);
    const availableEmailProviders = await getAvailableEmailProviders();

    const [email] = await db
      .insert(emails)
      .values({
        orgId,
        contactId: contact.id,
        userId: ownerId,
        provider: emailProvider,
        fromEmail: "smoke@seldonframe.local",
        toEmail: contact.email ?? "unknown@example.com",
        subject: "Smoke Follow-up",
        bodyText: "Thanks for your interest.",
        bodyHtml: "<p>Thanks for your interest.</p>",
        status: "sent",
        sentAt: now,
      })
      .returning({ id: emails.id });

    if (!email) {
      throw new Error("Failed to create email");
    }

    await eventBus.emit("email.sent", { emailId: email.id, contactId: contact.id });
    await eventBus.emit("email.opened", { emailId: email.id, contactId: contact.id });
    await eventBus.emit("email.clicked", { emailId: email.id, contactId: contact.id, url: "https://example.com" });

    const bookingProvider = await resolveBookingProvider(null);
    const bookingStart = new Date(now.getTime() + 60 * 60_000);
    const bookingEnd = new Date(bookingStart.getTime() + 30 * 60_000);

    const [booking] = await db
      .insert(bookings)
      .values({
        orgId,
        contactId: contact.id,
        userId: ownerId,
        title: "Smoke Appointment",
        bookingSlug: "default",
        provider: bookingProvider,
        status: "scheduled",
        startsAt: bookingStart,
        endsAt: bookingEnd,
        metadata: {
          source: "smoke-test",
        },
      })
      .returning({ id: bookings.id });

    if (!booking) {
      throw new Error("Failed to create booking");
    }

    await eventBus.emit("booking.created", { appointmentId: booking.id, contactId: contact.id });

    const checkoutPayload = {
      orgId,
      contactId: contact.id,
      amount: 99,
      currency: "USD",
      sourceBlock: "manual",
      sourceId: "smoke-flow",
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
      customerEmail: contact.email ?? undefined,
      metadata: {
        smoke: "true",
      },
    };

    await db
      .update(bookings)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(bookings.orgId, orgId), eq(bookings.id, booking.id)));

    await eventBus.emit("booking.completed", { appointmentId: booking.id, contactId: contact.id });

    await db.insert(activities).values({
      orgId,
      userId: ownerId,
      contactId: contact.id,
      type: "follow_up",
      subject: "Send post-appointment summary",
      body: "Triggered by smoke cross-block flow",
      scheduledAt: new Date(now.getTime() + 24 * 60 * 60_000),
    });

    const [portalMessage] = await db
      .insert(portalMessages)
      .values({
        orgId,
        contactId: contact.id,
        senderType: "client",
        senderName: "Smoke Lead",
        subject: "Portal question",
        body: "Can you share the next steps?",
      })
      .returning({ id: portalMessages.id });

    const [portalResource] = await db
      .insert(portalResources)
      .values({
        orgId,
        contactId: contact.id,
        title: "Onboarding Pack",
        description: "Smoke resource",
        url: "https://example.com/resource",
        resourceType: "link",
      })
      .returning({ id: portalResources.id });

    await eventBus.emit("portal.login", { contactId: contact.id });

    if (portalMessage) {
      await eventBus.emit("portal.message_sent", { contactId: contact.id, messageId: portalMessage.id });
    }

    if (portalResource) {
      await eventBus.emit("portal.resource_viewed", { contactId: contact.id, resourceId: portalResource.id });
    }

    const summary = {
      flow: "landing -> form -> CRM -> email -> booking -> Stripe -> Calendar -> appointment -> follow-up -> portal",
      orgSlug,
      landingId: landing.id,
      contactId: contact.id,
      emailId: email.id,
      bookingId: booking.id,
      portalMessageId: portalMessage?.id ?? null,
      portalResourceId: portalResource?.id ?? null,
      calendarProvider: bookingProvider,
      emailProvider,
      availableEmailProviders,
      stripePayload: {
        sourceBlock: checkoutPayload.sourceBlock,
        amount: checkoutPayload.amount,
        currency: checkoutPayload.currency,
        metadata: checkoutPayload.metadata,
      },
      observedEvents,
    };

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    unregister.forEach((off) => off());
  }
}

runCrossBlockFlow().catch((error) => {
  console.error("Cross-block smoke flow failed", error);
  process.exitCode = 1;
});
