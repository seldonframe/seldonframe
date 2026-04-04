import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { assertWritable } from "@/lib/demo/server";

async function enterDashboardAction() {
  "use server";

  assertWritable();

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const [dbUser] = await db
    .select({ orgId: users.orgId })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!dbUser?.orgId) {
    redirect("/setup");
  }

  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, dbUser.orgId))
    .limit(1);

  const settings = ((org?.settings ?? {}) as Record<string, unknown>) || {};

  await db
    .update(organizations)
    .set({
      settings: {
        ...settings,
        welcomeShown: true,
      },
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, dbUser.orgId));

  redirect("/dashboard?fromWelcome=1");
}

export default function WelcomePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl px-6 py-12 sm:py-16 space-y-14">
        <header className="space-y-4 text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Welcome to SeldonFrame</p>
          <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight">One Soul. Every block connected.</h1>
          <p className="mx-auto max-w-2xl text-base sm:text-lg text-muted-foreground">
            You just built something most businesses never have: one system where every tool talks to every other tool.
          </p>
        </header>

        <section className="rounded-2xl border border-border/70 bg-card/60 p-6 sm:p-8 space-y-4">
          <h2 className="text-2xl font-semibold">Your Soul</h2>
          <p className="text-sm sm:text-base text-muted-foreground">
            Your Soul is one file that knows your business: your voice, services, journey, and goals.
          </p>
          <p className="text-sm sm:text-base text-muted-foreground">
            Every block reads from it. When your Soul changes, everything updates.
          </p>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card/60 p-6 sm:p-8 space-y-4">
          <h2 className="text-2xl font-semibold">Your Blocks</h2>
          <p className="text-sm sm:text-base text-muted-foreground">
            Booking, CRM, Email, Pages, Forms, and Automations can each run on their own.
          </p>
          <p className="text-sm sm:text-base text-muted-foreground">
            Because they share the same Soul, they work together automatically without brittle Zap chains.
          </p>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card/60 p-6 sm:p-8 space-y-4">
          <h2 className="text-2xl font-semibold">Seldon It</h2>
          <p className="text-sm sm:text-base text-muted-foreground">
            Need a tool that does not exist yet? Describe it. Seldon builds it as a new block connected to your Soul.
          </p>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card/60 p-6 sm:p-8 space-y-4">
          <h2 className="text-2xl font-semibold">Your Framework</h2>
          <p className="text-sm sm:text-base text-muted-foreground">
            Your selected framework prebuilt sensible defaults for your business type. It is a starting point, not a cage.
          </p>
        </section>

        <form action={enterDashboardAction} className="pt-2 flex justify-center">
          <button type="submit" className="crm-button-primary h-11 px-6 text-sm sm:text-base">
            Enter Your Dashboard →
          </button>
        </form>
      </div>
    </main>
  );
}
