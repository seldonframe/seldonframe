import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import {
  handleIncomingTurn,
  type ConversationChannel,
} from "@/lib/conversation/runtime";

const VALID_CHANNELS: readonly ConversationChannel[] = ["email", "sms"];

function isChannel(value: unknown): value is ConversationChannel {
  return typeof value === "string" && (VALID_CHANNELS as readonly string[]).includes(value);
}

export async function POST(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const body = (await request.json()) as {
    contactId?: unknown;
    channel?: unknown;
    message?: unknown;
    conversationId?: unknown;
    subject?: unknown;
    emailId?: unknown;
    smsMessageId?: unknown;
    metadata?: unknown;
  };

  if (typeof body.contactId !== "string" || !body.contactId.trim()) {
    return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  }
  if (!isChannel(body.channel)) {
    return NextResponse.json({ error: "channel must be 'email' or 'sms'" }, { status: 400 });
  }
  if (typeof body.message !== "string" || !body.message.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  try {
    const result = await handleIncomingTurn({
      orgId: guard.orgId,
      contactId: body.contactId,
      channel: body.channel,
      incomingMessage: body.message,
      conversationId: typeof body.conversationId === "string" ? body.conversationId : null,
      subject: typeof body.subject === "string" ? body.subject : null,
      emailId: typeof body.emailId === "string" ? body.emailId : null,
      smsMessageId: typeof body.smsMessageId === "string" ? body.smsMessageId : null,
      metadata:
        body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
          ? (body.metadata as Record<string, unknown>)
          : undefined,
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Runtime error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
