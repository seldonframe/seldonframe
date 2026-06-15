// NOT "use server" — called from both the admin server action and the
// operator-portal action. Accepts injected deps for testability.
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { emitSeldonEvent } from "@/lib/events/bus";
import { inferClientLifecycleFromStatus } from "@/lib/soul/learning";

export type CreateContactForOrgInput = {
  orgId: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  source: string;
  notes?: string;
};

export type CreateContactForOrgDeps = {
  insertContact: (values: {
    orgId: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    status: string;
    source: string;
    customFields: Record<string, unknown>;
  }) => Promise<{ id: string } | null>;
  emitContactCreated: (contactId: string, orgId: string) => Promise<void>;
  inferLifecycle: (opts: { orgId: string; status: string; source: string }) => Promise<void>;
};

function defaultDeps(): CreateContactForOrgDeps {
  return {
    insertContact: async (values) => {
      const [created] = await db
        .insert(contacts)
        .values(values)
        .returning({ id: contacts.id });
      return created ?? null;
    },
    emitContactCreated: async (contactId, orgId) => {
      await emitSeldonEvent("contact.created", { contactId }, { orgId });
    },
    inferLifecycle: async (opts) => {
      await inferClientLifecycleFromStatus(opts);
    },
  };
}

/**
 * Insert a contact under a specific orgId without relying on NextAuth's
 * getOrgId(). Used by both the admin createContactAction (which can pass
 * the session orgId directly) and the operator-portal contact-create flow.
 */
export async function createContactForOrg(
  input: CreateContactForOrgInput,
  deps: CreateContactForOrgDeps = defaultDeps()
): Promise<{ id: string | null }> {
  const created = await deps.insertContact({
    orgId: input.orgId,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    status: input.status,
    source: input.source,
    customFields: input.notes ? { notes: input.notes } : {},
  });

  if (created?.id) {
    await deps.emitContactCreated(created.id, input.orgId);
    await deps.inferLifecycle({
      orgId: input.orgId,
      status: input.status,
      source: input.source,
    });
  }

  return { id: created?.id ?? null };
}
