export type SeldonEvent =
  | { type: "contact.created"; data: { contactId: string } }
  | { type: "contact.updated"; data: { contactId: string } }
  | { type: "deal.stage_changed"; data: { dealId: string; from: string; to: string } }
  | { type: "form.submitted"; data: { formId: string; contactId: string; data: Record<string, unknown> } }
  | { type: "booking.created"; data: { appointmentId: string; contactId: string } }
  | { type: "booking.completed"; data: { appointmentId: string; contactId: string } }
  | { type: "booking.cancelled"; data: { appointmentId: string; contactId: string } }
  | { type: "booking.no_show"; data: { appointmentId: string; contactId: string } }
  | { type: "email.sent"; data: { emailId: string; contactId: string } }
  | { type: "email.delivered"; data: { emailId: string; contactId: string | null } }
  | { type: "email.opened"; data: { emailId: string; contactId: string } }
  | { type: "email.clicked"; data: { emailId: string; contactId: string; url: string } }
  | { type: "email.bounced"; data: { emailId: string; contactId: string | null; reason: string } }
  | { type: "email.replied"; data: { emailId: string; contactId: string | null; conversationId: string | null } }
  | { type: "email.suppressed"; data: { email: string; reason: string; contactId: string | null } }
  | { type: "sms.sent"; data: { smsMessageId: string; contactId: string | null } }
  | { type: "sms.delivered"; data: { smsMessageId: string; contactId: string | null } }
  | { type: "sms.replied"; data: { smsMessageId: string; contactId: string | null; conversationId: string | null } }
  | { type: "sms.failed"; data: { smsMessageId: string; contactId: string | null; reason: string } }
  | { type: "sms.suppressed"; data: { phone: string; reason: string; contactId: string | null } }
  | { type: "conversation.turn.received"; data: { conversationId: string; turnId: string; contactId: string; channel: "email" | "sms" } }
  | { type: "conversation.turn.sent"; data: { conversationId: string; turnId: string; contactId: string; channel: "email" | "sms" } }
  | { type: "landing.visited"; data: { pageId: string; visitorId: string } }
  | { type: "landing.converted"; data: { pageId: string; contactId: string } }
  | { type: "landing.published"; data: { pageId: string; slug: string; orgId: string } }
  | { type: "landing.unpublished"; data: { pageId: string; orgId: string } }
  | { type: "landing.updated"; data: { pageId: string; orgId: string } }
  | { type: "payment.completed"; data: { contactId: string; amount: number; currency: string; source: string } }
  | { type: "payment.failed"; data: { contactId: string; amount: number; reason: string } }
  | { type: "payment.refunded"; data: { contactId: string | null; paymentId: string; amount: number; currency: string } }
  | { type: "payment.disputed"; data: { contactId: string | null; paymentId: string; amount: number; reason: string } }
  | { type: "subscription.created"; data: { contactId: string; planId: string } }
  | { type: "subscription.updated"; data: { contactId: string | null; subscriptionId: string; status: string } }
  | { type: "subscription.renewed"; data: { contactId: string | null; subscriptionId: string; amount: number; currency: string } }
  | { type: "subscription.cancelled"; data: { contactId: string; planId: string } }
  | { type: "subscription.trial_will_end"; data: { contactId: string | null; subscriptionId: string; trialEnd: string } }
  | { type: "invoice.created"; data: { contactId: string; invoiceId: string; amount: number } }
  | { type: "invoice.sent"; data: { contactId: string | null; invoiceId: string } }
  | { type: "invoice.paid"; data: { contactId: string | null; invoiceId: string; amount: number; currency: string } }
  | { type: "invoice.past_due"; data: { contactId: string | null; invoiceId: string; amountDue: number } }
  | { type: "invoice.voided"; data: { contactId: string | null; invoiceId: string } }
  | { type: "portal.login"; data: { contactId: string } }
  | { type: "portal.message_sent"; data: { contactId: string; messageId: string } }
  | { type: "portal.resource_viewed"; data: { contactId: string; resourceId: string } };

export type BuiltInEventType = SeldonEvent["type"];
export type EventType = BuiltInEventType | `${string}.${string}`;
export type EventPayload<T extends EventType> = T extends BuiltInEventType
  ? Extract<SeldonEvent, { type: T }>["data"]
  : Record<string, unknown>;

export type EventEnvelope<T extends EventType = EventType> = {
  type: T;
  data: EventPayload<T>;
  createdAt: Date;
};

export type EventHandler<T extends EventType> = (event: EventEnvelope<T>) => void | Promise<void>;
type AnyHandler = EventHandler<EventType>;

export interface SeldonEventBus {
  emit<T extends EventType>(type: T, data: EventPayload<T>): Promise<void>;
  on<T extends EventType>(type: T, handler: EventHandler<T>): () => void;
  once<T extends EventType>(type: T, handler: EventHandler<T>): () => void;
  off<T extends EventType>(type: T, handler: EventHandler<T>): void;
  onAny(handler: EventHandler<EventType>): () => void;
  offAny(handler: EventHandler<EventType>): void;
}

export class InMemorySeldonEventBus implements SeldonEventBus {
  private readonly handlers = new Map<EventType, Set<AnyHandler>>();
  private readonly anyHandlers = new Set<AnyHandler>();

  async emit<T extends EventType>(type: T, data: EventPayload<T>) {
    const listeners = this.handlers.get(type) ?? new Set<AnyHandler>();

    if (listeners.size === 0 && this.anyHandlers.size === 0) {
      return;
    }

    const event: EventEnvelope<T> = { type, data, createdAt: new Date() };
    await Promise.allSettled(
      [...listeners, ...this.anyHandlers].map((handler) => handler(event as unknown as EventEnvelope<EventType>))
    );
  }

  on<T extends EventType>(type: T, handler: EventHandler<T>) {
    const listeners = this.handlers.get(type) ?? new Set<AnyHandler>();
    listeners.add(handler as unknown as AnyHandler);
    this.handlers.set(type, listeners);
    return () => this.off(type, handler);
  }

  once<T extends EventType>(type: T, handler: EventHandler<T>) {
    const wrapped: EventHandler<T> = async (event) => {
      this.off(type, wrapped);
      await handler(event);
    };

    return this.on(type, wrapped);
  }

  off<T extends EventType>(type: T, handler: EventHandler<T>) {
    const listeners = this.handlers.get(type);
    if (!listeners) {
      return;
    }

    listeners.delete(handler as unknown as AnyHandler);
    if (listeners.size === 0) {
      this.handlers.delete(type);
    }
  }

  onAny(handler: EventHandler<EventType>) {
    this.anyHandlers.add(handler as unknown as AnyHandler);
    return () => this.offAny(handler);
  }

  offAny(handler: EventHandler<EventType>) {
    this.anyHandlers.delete(handler as unknown as AnyHandler);
  }
}

let globalEventBus: SeldonEventBus | null = null;

export function createInMemoryEventBus() {
  return new InMemorySeldonEventBus();
}

export function setSeldonEventBus(bus: SeldonEventBus) {
  globalEventBus = bus;
}

export function getSeldonEventBus() {
  if (!globalEventBus) {
    globalEventBus = createInMemoryEventBus();
  }

  return globalEventBus;
}
