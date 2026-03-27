import "dotenv/config";
import { db } from "@/db";
import {
  activities,
  bookings,
  contacts,
  deals,
  emails,
  intakeForms,
  intakeSubmissions,
  landingPages,
  organizations,
  pipelines,
  portalMessages,
  portalResources,
  users,
} from "@/db/schema";

const coachingSoul = {
  businessName: "Summit Coaching",
  businessDescription: "Executive coaching for founders",
  industry: "coaching",
  offerType: "programs",
  entityLabels: {
    contact: { singular: "Client", plural: "Clients" },
    deal: { singular: "Engagement", plural: "Engagements" },
    activity: { singular: "Session", plural: "Sessions" },
    pipeline: { singular: "Journey", plural: "Journeys" },
    intakeForm: { singular: "Application", plural: "Applications" },
  },
  pipeline: {
    name: "Client Journey",
    stages: [
      { name: "Inquiry", color: "#6366f1", probability: 10 },
      { name: "Discovery", color: "#8b5cf6", probability: 30 },
      { name: "Proposal", color: "#a855f7", probability: 55 },
      { name: "Active Program", color: "#22c55e", probability: 90 },
      { name: "Completed", color: "#16a34a", probability: 100 },
    ],
  },
  suggestedFields: {
    contact: [{ key: "goal", label: "Goal", type: "textarea" }],
    deal: [{ key: "program", label: "Program", type: "select", options: ["1:1", "Group", "VIP"] }],
  },
  contactStatuses: [
    { value: "inquiry", label: "Inquiry", color: "#6366f1" },
    { value: "prospect", label: "Prospect", color: "#8b5cf6" },
    { value: "active_client", label: "Active Client", color: "#22c55e" },
    { value: "past_client", label: "Past Client", color: "#94a3b8" },
  ],
  voice: {
    style: "friendly-professional",
    vocabulary: ["clarity", "momentum", "alignment"],
    avoidWords: ["cheap", "hustle"],
    samplePhrases: ["Let's map out your next milestone."],
  },
  priorities: ["client retention", "task management", "pipeline visibility"],
  aiContext:
    "Summit Coaching is an executive coaching business focused on structured accountability and transformational outcomes.",
  suggestedIntakeForm: {
    name: "Coaching Application",
    fields: [
      { key: "name", label: "Full Name", type: "text", required: true },
      { key: "email", label: "Email", type: "email", required: true },
      { key: "goal", label: "Primary Goal", type: "textarea", required: false },
    ],
  },
  branding: { primaryColor: "265 84% 64%", accentColor: "231 89% 72%", mood: "warm" },
  rawInput: {
    processDescription: "Discovery to execution coaching",
    painPoint: "Lack of accountability",
    clientDescription: "Founders and executives",
  },
  blockDefaults: {
    booking: {
      enabled: true,
      defaultDurationMinutes: 60,
      preferredProvider: "zoom",
      bookingPageHeadline: "Book a Discovery Session",
      bookingPageDescription: "Schedule a free 60-minute coaching consultation.",
      bufferMinutes: 15,
      allowWeekends: false,
    },
    landing: {
      enabled: true,
      defaultSections: [
        { type: "hero", title: "Transform Your Leadership" },
        { type: "benefits", title: "What You'll Gain" },
        { type: "testimonials", title: "Client Stories" },
        { type: "cta", title: "Start Your Journey" },
      ],
      defaultCtaLabel: "Book a Free Session",
      defaultCtaTarget: "booking",
      heroHeadline: "Executive Coaching for Founders",
      heroSubheadline: "Structured accountability that drives results.",
    },
    email: {
      enabled: true,
      preferredProvider: "resend",
      defaultFromName: "CoachCRM",
      defaultSubjectPrefix: "",
      welcomeTemplateSubject: "Welcome — let's map your goals",
      welcomeTemplateBody:
        "Hi {{firstName}}, thanks for reaching out. I'd love to learn more about your goals and see how we can work together.",
      followUpDelayHours: 24,
    },
    portal: {
      enabled: true,
      welcomeMessage:
        "Welcome to your coaching portal. Here you'll find session notes, resources, and a direct line to your coach.",
      enableMessaging: true,
      enableResources: true,
      enableInvoices: true,
      resourceCategories: ["Session Notes", "Worksheets", "Recordings", "Invoices"],
    },
  },
};

const now = new Date();
const oneDay = 24 * 60 * 60_000;
const oneHour = 60 * 60_000;

async function seedDemo() {
  console.log("Seeding demo data (coaching niche, all blocks)...");

  // ── Org ──
  const [org] = await db
    .insert(organizations)
    .values({
      name: "Summit Coaching",
      slug: "demo-coaching",
      plan: "pro",
      soul: coachingSoul,
      soulCompletedAt: now,
    })
    .onConflictDoNothing({ target: organizations.slug })
    .returning();

  if (!org) {
    console.log("Demo org already exists — skipping seed.");
    return;
  }

  // ── Owner ──
  const [owner] = await db
    .insert(users)
    .values({
      orgId: org.id,
      name: "Alex Rivera",
      email: "alex@summitcoaching.demo",
      role: "owner",
      passwordHash: "$2b$10$demohashdemohashdemohashdemohashdemohashdemoha",
    })
    .returning();

  if (!owner) throw new Error("Failed to create owner");

  // ── Pipeline ──
  const [pipeline] = await db
    .insert(pipelines)
    .values({
      orgId: org.id,
      name: "Client Journey",
      isDefault: true,
      stages: coachingSoul.pipeline.stages,
    })
    .returning();

  if (!pipeline) throw new Error("Failed to create pipeline");

  // ── Contacts ──
  const contactData = [
    { firstName: "Sarah", lastName: "Chen", email: "sarah.chen@example.com", status: "active_client", company: "TechStart Inc", title: "CEO", score: 92, source: "referral" },
    { firstName: "Marcus", lastName: "Johnson", email: "marcus.j@example.com", status: "active_client", company: "GreenLeaf Ventures", title: "Founder", score: 85, source: "landing" },
    { firstName: "Elena", lastName: "Petrova", email: "elena.p@example.com", status: "prospect", company: "DataFlow AI", title: "CTO", score: 68, source: "intake" },
    { firstName: "James", lastName: "Wright", email: "james.w@example.com", status: "inquiry", company: "Wright & Associates", title: "Managing Partner", score: 42, source: "landing" },
    { firstName: "Priya", lastName: "Sharma", email: "priya.s@example.com", status: "active_client", company: "Elevate Health", title: "Founder & CEO", score: 88, source: "referral" },
    { firstName: "David", lastName: "Kim", email: "david.k@example.com", status: "past_client", company: "Nexus Labs", title: "VP Engineering", score: 75, source: "intake" },
    { firstName: "Olivia", lastName: "Morgan", email: "olivia.m@example.com", status: "prospect", company: "Creative Surge", title: "Creative Director", score: 55, source: "landing" },
    { firstName: "Raj", lastName: "Patel", email: "raj.p@example.com", status: "inquiry", company: "FinScale", title: "CEO", score: 30, source: "landing" },
  ];

  const insertedContacts = await db
    .insert(contacts)
    .values(
      contactData.map((c) => ({
        orgId: org.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        status: c.status,
        company: c.company,
        title: c.title,
        score: c.score,
        source: c.source,
        customFields: { goal: `${c.firstName}'s leadership growth plan` },
      }))
    )
    .returning({ id: contacts.id, email: contacts.email, firstName: contacts.firstName });

  const cx = (index: number) => insertedContacts[index]!;

  // ── Deals ──
  const dealData = [
    { contact: 0, title: "Sarah — VIP 6-Month", value: "12000", stage: "Active Program", probability: 90 },
    { contact: 1, title: "Marcus — Group Coaching Q2", value: "4500", stage: "Active Program", probability: 90 },
    { contact: 2, title: "Elena — 1:1 Leadership Sprint", value: "8000", stage: "Proposal", probability: 55 },
    { contact: 3, title: "James — Discovery Consultation", value: "3000", stage: "Discovery", probability: 30 },
    { contact: 4, title: "Priya — VIP 12-Month", value: "24000", stage: "Active Program", probability: 90 },
    { contact: 5, title: "David — Group Coaching (completed)", value: "4500", stage: "Completed", probability: 100 },
    { contact: 6, title: "Olivia — Proposal Pending", value: "6000", stage: "Proposal", probability: 55 },
    { contact: 7, title: "Raj — Inquiry", value: "0", stage: "Inquiry", probability: 10 },
  ];

  const insertedDeals = await db
    .insert(deals)
    .values(
      dealData.map((d) => ({
        orgId: org.id,
        contactId: cx(d.contact).id,
        pipelineId: pipeline.id,
        title: d.title,
        value: d.value,
        stage: d.stage,
        probability: d.probability,
        assignedTo: owner.id,
        customFields: { program: d.stage === "Active Program" ? "VIP" : "1:1" },
      }))
    )
    .returning({ id: deals.id });

  void insertedDeals;

  // ── Activities ──
  const activityData = [
    { contact: 0, type: "session", subject: "Weekly check-in with Sarah", body: "Discussed Q2 OKRs and delegation strategy.", daysAgo: 2 },
    { contact: 0, type: "note", subject: "Sarah feeling more confident", body: "She mentioned the team trusts her process now.", daysAgo: 5 },
    { contact: 1, type: "session", subject: "Group session — Vision mapping", body: "Marcus engaged well. Needs follow-up on fundraise prep.", daysAgo: 1 },
    { contact: 2, type: "call", subject: "Discovery call with Elena", body: "She wants help with exec team alignment. Proposal sent.", daysAgo: 3 },
    { contact: 3, type: "email", subject: "Initial outreach to James", body: "Sent intro email with coaching overview.", daysAgo: 7 },
    { contact: 4, type: "session", subject: "Priya — Monthly deep dive", body: "Working on board presentation skills.", daysAgo: 0 },
    { contact: 5, type: "task", subject: "Send David alumni survey", body: "Follow up on post-program satisfaction.", daysAgo: 14, completed: true },
    { contact: 6, type: "meeting", subject: "Intro meeting with Olivia", body: "She's interested in creative leadership coaching.", daysAgo: 4 },
  ];

  await db.insert(activities).values(
    activityData.map((a) => ({
      orgId: org.id,
      contactId: cx(a.contact).id,
      userId: owner.id,
      type: a.type,
      subject: a.subject,
      body: a.body,
      scheduledAt: new Date(now.getTime() - a.daysAgo * oneDay),
      completedAt: "completed" in a ? new Date(now.getTime() - a.daysAgo * oneDay) : undefined,
    }))
  );

  // ── Bookings ──
  const bookingData = [
    { contact: 0, title: "Sarah — Weekly Session", status: "completed", daysOffset: -2 },
    { contact: 1, title: "Marcus — Group Session", status: "completed", daysOffset: -1 },
    { contact: 2, title: "Elena — Discovery Call", status: "scheduled", daysOffset: 2 },
    { contact: 3, title: "James — Intro Call", status: "scheduled", daysOffset: 5 },
    { contact: 4, title: "Priya — Monthly Deep Dive", status: "completed", daysOffset: 0 },
    { contact: 6, title: "Olivia — Follow-up", status: "scheduled", daysOffset: 3 },
  ];

  await db.insert(bookings).values(
    bookingData.map((b) => {
      const start = new Date(now.getTime() + b.daysOffset * oneDay + 10 * oneHour);
      const end = new Date(start.getTime() + oneHour);
      return {
        orgId: org.id,
        contactId: cx(b.contact).id,
        userId: owner.id,
        title: b.title,
        bookingSlug: "default",
        provider: "zoom" as const,
        status: b.status,
        startsAt: start,
        endsAt: end,
        meetingUrl: b.status === "scheduled" ? "https://zoom.us/j/demo123456" : undefined,
        completedAt: b.status === "completed" ? new Date(now.getTime() + b.daysOffset * oneDay + 11 * oneHour) : undefined,
        metadata: { source: "demo-seed" },
      };
    })
  );

  // ── Emails ──
  const emailData = [
    { contact: 0, subject: "Session recap — Q2 OKRs", status: "sent", daysAgo: 2, opens: 3, clicks: 1 },
    { contact: 1, subject: "Group coaching materials", status: "sent", daysAgo: 1, opens: 1, clicks: 0 },
    { contact: 2, subject: "Your coaching proposal", status: "sent", daysAgo: 3, opens: 2, clicks: 1 },
    { contact: 3, subject: "Welcome to Summit Coaching", status: "sent", daysAgo: 7, opens: 1, clicks: 0 },
    { contact: 4, subject: "Monthly progress report", status: "sent", daysAgo: 0, opens: 0, clicks: 0 },
    { contact: 5, subject: "Program completion survey", status: "sent", daysAgo: 14, opens: 1, clicks: 1 },
    { contact: 6, subject: "Creative leadership resources", status: "queued", daysAgo: 0, opens: 0, clicks: 0 },
  ];

  await db.insert(emails).values(
    emailData.map((e) => ({
      orgId: org.id,
      contactId: cx(e.contact).id,
      userId: owner.id,
      provider: "resend",
      fromEmail: "alex@summitcoaching.demo",
      toEmail: cx(e.contact).email ?? "unknown@example.com",
      subject: e.subject,
      bodyText: `Hi ${cx(e.contact).firstName}, ${e.subject.toLowerCase()}.`,
      bodyHtml: `<p>Hi ${cx(e.contact).firstName},</p><p>${e.subject}.</p>`,
      status: e.status,
      openCount: e.opens,
      clickCount: e.clicks,
      sentAt: e.status === "sent" ? new Date(now.getTime() - e.daysAgo * oneDay) : undefined,
      openedAt: e.opens > 0 ? new Date(now.getTime() - e.daysAgo * oneDay + 2 * oneHour) : undefined,
      lastClickedAt: e.clicks > 0 ? new Date(now.getTime() - e.daysAgo * oneDay + 3 * oneHour) : undefined,
    }))
  );

  // ── Landing Pages ──
  await db.insert(landingPages).values([
    {
      orgId: org.id,
      title: "Executive Coaching for Founders",
      slug: "coaching-founders",
      status: "published",
      sections: [
        { id: "hero", type: "hero", title: "Transform Your Leadership", content: "Structured accountability for founders who want to scale themselves, not just their company." },
        { id: "benefits", type: "benefits", title: "What You'll Gain", items: ["Clarity on priorities", "Stronger delegation", "Confident decision-making", "Work-life alignment"] },
        { id: "testimonials", type: "testimonials", title: "Client Stories", items: [{ name: "Sarah C.", quote: "Working with Alex changed how I lead my team." }] },
        { id: "cta", type: "cta", title: "Start Your Journey", label: "Book a Free Session", target: "/book" },
      ],
      seo: { title: "Executive Coaching | Summit Coaching", description: "Structured coaching programs for startup founders and executives." },
    },
    {
      orgId: org.id,
      title: "Group Coaching Programs",
      slug: "group-coaching",
      status: "published",
      sections: [
        { id: "hero", type: "hero", title: "Grow Together", content: "Join a cohort of ambitious founders in our group coaching program." },
        { id: "pricing", type: "pricing", title: "Program Options", items: [{ name: "Quarterly", price: "$1,500" }, { name: "Annual", price: "$4,500" }] },
        { id: "cta", type: "cta", title: "Apply Now", label: "Submit Application", target: "/intake/coaching-application" },
      ],
    },
  ]);

  // ── Intake Forms ──
  const [form] = await db
    .insert(intakeForms)
    .values({
      orgId: org.id,
      name: "Coaching Application",
      slug: "coaching-application",
      fields: [
        { key: "name", label: "Full Name", type: "text", required: true },
        { key: "email", label: "Email", type: "email", required: true },
        { key: "company", label: "Company", type: "text", required: true },
        { key: "goal", label: "What do you hope to achieve?", type: "textarea", required: false },
        { key: "program", label: "Preferred Program", type: "select", required: true, options: ["1:1 Coaching", "Group Coaching", "VIP Intensive"] },
      ],
    })
    .returning();

  if (form) {
    await db.insert(intakeSubmissions).values([
      { orgId: org.id, formId: form.id, contactId: cx(2).id, data: { name: "Elena Petrova", email: "elena.p@example.com", company: "DataFlow AI", goal: "Align exec team on product vision", program: "1:1 Coaching" } },
      { orgId: org.id, formId: form.id, contactId: cx(3).id, data: { name: "James Wright", email: "james.w@example.com", company: "Wright & Associates", goal: "Improve team leadership", program: "Group Coaching" } },
      { orgId: org.id, formId: form.id, contactId: cx(7).id, data: { name: "Raj Patel", email: "raj.p@example.com", company: "FinScale", goal: "Scale without burnout", program: "VIP Intensive" } },
    ]);
  }

  // ── Portal Messages ──
  await db.insert(portalMessages).values([
    { orgId: org.id, contactId: cx(0).id, senderType: "client", senderName: "Sarah Chen", subject: "Session prep", body: "Hi Alex, I wanted to share my wins from last week before our next session. The delegation framework really clicked!" },
    { orgId: org.id, contactId: cx(0).id, senderType: "coach", senderName: "Alex Rivera", subject: "Re: Session prep", body: "That's great to hear, Sarah! I'll review your notes before our call. Let's dig deeper into the Q2 roadmap." },
    { orgId: org.id, contactId: cx(1).id, senderType: "client", senderName: "Marcus Johnson", subject: "Group materials", body: "Could you share the vision mapping worksheet from last week's group session?" },
    { orgId: org.id, contactId: cx(4).id, senderType: "client", senderName: "Priya Sharma", subject: "Board presentation", body: "I'm preparing for my board meeting next week. Can we schedule an extra session to practice?" },
    { orgId: org.id, contactId: cx(4).id, senderType: "coach", senderName: "Alex Rivera", subject: "Re: Board presentation", body: "Absolutely, Priya! I've opened up a slot on Thursday at 2pm. Check your booking link." },
  ]);

  // ── Portal Resources ──
  await db.insert(portalResources).values([
    { orgId: org.id, contactId: cx(0).id, title: "Session Notes — Week 12", description: "Q2 OKR alignment and delegation strategy recap.", url: "https://example.com/notes/sarah-w12", resourceType: "link" },
    { orgId: org.id, contactId: cx(0).id, title: "Leadership Framework PDF", description: "Core framework from the VIP program.", url: "https://example.com/docs/leadership-framework.pdf", resourceType: "document" },
    { orgId: org.id, contactId: cx(1).id, title: "Vision Mapping Worksheet", description: "Template from group session #4.", url: "https://example.com/worksheets/vision-mapping", resourceType: "link" },
    { orgId: org.id, contactId: cx(4).id, title: "Board Presentation Template", description: "Structure for confident board room delivery.", url: "https://example.com/templates/board-deck", resourceType: "document" },
    { orgId: org.id, contactId: cx(4).id, title: "Monthly Progress Report — March", description: "Your coaching milestones and next steps.", url: "https://example.com/reports/priya-march", resourceType: "link" },
    { orgId: org.id, contactId: cx(5).id, title: "Program Completion Certificate", description: "Congratulations on completing the group coaching program!", url: "https://example.com/certs/david-completion", resourceType: "document" },
  ]);

  console.log("Demo seed complete:", {
    orgId: org.id,
    orgSlug: org.slug,
    ownerId: owner.id,
    contacts: insertedContacts.length,
    pipeline: pipeline.id,
  });
}

seedDemo().catch((error) => {
  console.error("Demo seed failed:", error);
  process.exit(1);
});
