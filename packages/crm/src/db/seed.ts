import "dotenv/config";
import { db } from "@/db";
import { organizations, pipelines, users } from "@/db/schema";

async function seed() {
  const [org] = await db
    .insert(organizations)
    .values({
      name: "Demo Coaching Co",
      slug: "demo-coaching",
      plan: "free",
    })
    .onConflictDoNothing({ target: organizations.slug })
    .returning();

  if (!org) {
    return;
  }

  const [owner] = await db
    .insert(users)
    .values({
      orgId: org.id,
      name: "Owner",
      email: "owner@example.com",
      role: "owner",
      passwordHash: "seed-password-hash",
    })
    .returning();

  await db.insert(pipelines).values({
    orgId: org.id,
    name: "Client Journey",
    isDefault: true,
    stages: [
      { name: "Inquiry", color: "#6366f1", probability: 10 },
      { name: "Discovery Call", color: "#8b5cf6", probability: 25 },
      { name: "Proposal Sent", color: "#a855f7", probability: 50 },
      { name: "Negotiation", color: "#d946ef", probability: 75 },
      { name: "Won", color: "#22c55e", probability: 100 },
      { name: "Lost", color: "#ef4444", probability: 0 },
    ],
  });

  console.log("Seed complete", { orgId: org.id, ownerId: owner?.id });
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
