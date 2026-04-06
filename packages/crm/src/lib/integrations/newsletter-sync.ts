import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, organizations } from "@/db/schema";
import { decryptValue } from "@/lib/encryption";

type NewsletterProvider = "kit" | "mailchimp" | "beehiiv";

type NewsletterIntegration = {
  provider?: NewsletterProvider;
  apiKey?: string;
  connected?: boolean;
  listId?: string;
  publicationId?: string;
};

function decryptIfNeeded(value: string) {
  if (!value) {
    return "";
  }

  if (!value.startsWith("v1.")) {
    return value;
  }

  return decryptValue(value);
}

async function syncToKit(apiKey: string, email: string, firstName: string) {
  await fetch("https://api.kit.com/v4/subscribers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      email_address: email,
      first_name: firstName,
    }),
  });
}

export async function syncContactToNewsletter(params: { contactId: string }) {
  const [contact] = await db
    .select({ orgId: contacts.orgId, email: contacts.email, firstName: contacts.firstName })
    .from(contacts)
    .where(eq(contacts.id, params.contactId))
    .limit(1);

  if (!contact?.email) {
    return;
  }

  const [org] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, contact.orgId))
    .limit(1);

  const integrations = (org?.integrations ?? {}) as Record<string, unknown>;
  const newsletter = (integrations.newsletter ?? {}) as NewsletterIntegration;
  const provider = newsletter.provider;
  const apiKey = decryptIfNeeded(String(newsletter.apiKey ?? "").trim());

  if (!provider || !newsletter.connected || !apiKey) {
    return;
  }

  const firstName = String(contact.firstName ?? "").trim();

  try {
    if (provider === "kit") {
      await syncToKit(apiKey, contact.email, firstName);
      return;
    }

    if (provider === "mailchimp") {
      const dc = apiKey.split("-").pop();
      const listId = String(newsletter.listId ?? "").trim();

      if (!dc || !listId) {
        return;
      }

      const auth = Buffer.from(`anystring:${apiKey}`).toString("base64");
      await fetch(`https://${dc}.api.mailchimp.com/3.0/lists/${encodeURIComponent(listId)}/members`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email_address: contact.email,
          status: "subscribed",
          merge_fields: {
            FNAME: firstName,
          },
        }),
      });
      return;
    }

    if (provider === "beehiiv") {
      const publicationId = String(newsletter.publicationId ?? "").trim();
      if (!publicationId) {
        return;
      }

      await fetch(`https://api.beehiiv.com/v2/publications/${encodeURIComponent(publicationId)}/subscriptions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: contact.email,
          reactivate_existing: true,
          send_welcome_email: false,
          custom_fields: firstName ? [{ name: "first_name", value: firstName }] : [],
        }),
      });
    }
  } catch {
    return;
  }
}
