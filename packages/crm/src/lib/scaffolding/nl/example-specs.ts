// Canonical NL → BlockSpec example pairs Claude consults when
// translating a new intent. Shipped in SLICE 2 PR 2 C2.
//
// Two examples on purpose — cover both the common cases:
//   1. Tool-only block (most common): the builder describes an
//      entity + the operations they want to perform on it.
//   2. Reactive block with subscriptions: the builder describes a
//      block that reacts to another block's events.
//
// Adding more examples is cheap but each added example eats prompt
// tokens. Keep the set tight; each example should teach a distinct
// anatomy lesson.

import type { BlockSpec } from "../spec";

export type NLExample = {
  /** Builder-facing NL intent. */
  nlIntent: string;
  /** The BlockSpec Claude should produce from it. */
  blockSpec: BlockSpec;
};

export const EXAMPLE_SPECS: NLExample[] = [
  {
    nlIntent:
      "Build me a block that lets me attach internal notes to contacts. Notes should be plain text, with the ability to list them for a given contact.",
    blockSpec: {
      slug: "contact-notes",
      title: "Contact Notes",
      description: "Internal notes attached to contacts.",
      triggerPhrases: [
        "Add a contact-notes block",
        "Let me add notes to contacts",
        "Install contact notes",
      ],
      frameworks: ["universal"],
      produces: [
        {
          name: "note.created",
          fields: [
            { name: "noteId", type: "string", nullable: false },
            { name: "contactId", type: "string", nullable: false },
          ],
        },
      ],
      consumes: [],
      tools: [
        {
          name: "create_note",
          description: "Create an internal note on a contact.",
          args: [
            { name: "contactId", type: "string", nullable: false, required: true },
            { name: "body", type: "string", nullable: false, required: true },
          ],
          returns: [
            { name: "noteId", type: "string", nullable: false, required: true },
          ],
          emits: ["note.created"],
        },
        {
          name: "list_notes",
          description: "List all notes for a given contact.",
          args: [
            { name: "contactId", type: "string", nullable: false, required: true },
          ],
          returns: [],
          emits: [],
        },
      ],
      subscriptions: [],
      entities: [],
    },
  },
  {
    nlIntent:
      "When a contact books a meeting, I want to automatically log that as an activity on the contact's timeline. I don't need new tools — just the reactive piece.",
    blockSpec: {
      slug: "auto-activity-log",
      title: "Auto Activity Log",
      description:
        "Automatically logs activities on a contact's timeline in reaction to other blocks' events.",
      triggerPhrases: [
        "Log activities automatically",
        "Add auto activity logging",
      ],
      frameworks: ["universal"],
      produces: [],
      consumes: [],
      tools: [],
      subscriptions: [
        {
          event: "caldiy-booking:booking.created",
          handlerName: "logBookingActivity",
          description:
            "Log a 'booking created' activity on the contact when a booking is made.",
          idempotencyKey: "{{id}}",
        },
      ],
      entities: [],
    },
  },
];
