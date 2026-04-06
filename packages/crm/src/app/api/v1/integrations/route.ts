import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { assertWritable, demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";
import { decryptValue, encryptValue } from "@/lib/encryption";

type Provider = "kit" | "mailchimp" | "beehiiv" | "resend";

const VALID_PROVIDERS: Provider[] = ["kit", "mailchimp", "beehiiv", "resend"];

function readIntegrations(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    return {} as Record<string, unknown>;
  }

  return raw as Record<string, unknown>;
}

function decryptIfNeeded(value: string) {
  if (!value) {
    return "";
  }

  if (!value.startsWith("v1.")) {
    return value;
  }

  return decryptValue(value);
}

function maskLastEight(value: string) {
  if (!value) {
    return "";
  }

  return `••••${value.slice(-8)}`;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [org] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, session.user.orgId))
    .limit(1);

  const integrations = readIntegrations(org?.integrations);
  const resend = (integrations.resend ?? {}) as Record<string, unknown>;
  const newsletter = (integrations.newsletter ?? {}) as Record<string, unknown>;

  const resendKey = decryptIfNeeded(String(resend.apiKey ?? "").trim());
  const newsletterKey = decryptIfNeeded(String(newsletter.apiKey ?? "").trim());
  const provider = String(newsletter.provider ?? "").trim();

  return NextResponse.json({
    resend: {
      connected: Boolean(resend.connected && resendKey),
      maskedKey: maskLastEight(resendKey),
    },
    newsletter: {
      kit: {
        connected: provider === "kit" && Boolean(newsletter.connected && newsletterKey),
        maskedKey: provider === "kit" ? maskLastEight(newsletterKey) : "",
      },
      mailchimp: {
        connected: provider === "mailchimp" && Boolean(newsletter.connected && newsletterKey),
        maskedKey: provider === "mailchimp" ? maskLastEight(newsletterKey) : "",
      },
      beehiiv: {
        connected: provider === "beehiiv" && Boolean(newsletter.connected && newsletterKey),
        maskedKey: provider === "beehiiv" ? maskLastEight(newsletterKey) : "",
      },
    },
  });
}

export async function PUT(req: Request) {
  if (isDemoReadonly()) {
    return demoApiBlockedResponse();
  }

  assertWritable();

  const session = await auth();
  if (!session?.user?.id || !session.user.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    provider?: string;
    apiKey?: string;
  };

  const provider = String(body.provider ?? "").trim() as Provider;
  const apiKey = String(body.apiKey ?? "").trim();

  if (!VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  if (apiKey.length < 10) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 400 });
  }

  const [org] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, session.user.orgId))
    .limit(1);

  const integrations = readIntegrations(org?.integrations);

  if (provider === "resend") {
    integrations.resend = {
      ...(integrations.resend as Record<string, unknown> | undefined),
      apiKey: encryptValue(apiKey),
      connected: true,
    };
  } else {
    integrations.newsletter = {
      ...(integrations.newsletter as Record<string, unknown> | undefined),
      provider,
      apiKey: encryptValue(apiKey),
      connected: true,
    };

    if (provider === "kit") {
      integrations.kit = {
        ...(integrations.kit as Record<string, unknown> | undefined),
        apiKey: encryptValue(apiKey),
        connected: true,
      };
    }
  }

  await db
    .update(organizations)
    .set({ integrations, updatedAt: new Date() })
    .where(eq(organizations.id, session.user.orgId));

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  if (isDemoReadonly()) {
    return demoApiBlockedResponse();
  }

  assertWritable();

  const session = await auth();
  if (!session?.user?.id || !session.user.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    provider?: string;
  };

  const provider = String(body.provider ?? "").trim() as Provider;

  if (!VALID_PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  const [org] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, session.user.orgId))
    .limit(1);

  const integrations = readIntegrations(org?.integrations);

  if (provider === "resend") {
    integrations.resend = {
      ...(integrations.resend as Record<string, unknown> | undefined),
      apiKey: "",
      connected: false,
    };
  } else {
    integrations.newsletter = undefined;
    integrations.kit = undefined;
  }

  await db
    .update(organizations)
    .set({ integrations, updatedAt: new Date() })
    .where(eq(organizations.id, session.user.orgId));

  return NextResponse.json({ success: true });
}
