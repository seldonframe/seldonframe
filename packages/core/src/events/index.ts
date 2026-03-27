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
  | { type: "email.opened"; data: { emailId: string; contactId: string } }
  | { type: "email.clicked"; data: { emailId: string; contactId: string; url: string } }
  | { type: "landing.visited"; data: { pageId: string; visitorId: string } }
  | { type: "landing.converted"; data: { pageId: string; contactId: string } }
  | { type: "payment.completed"; data: { contactId: string; amount: number; currency: string; source: string } }
  | { type: "payment.failed"; data: { contactId: string; amount: number; reason: string } }
  | { type: "subscription.created"; data: { contactId: string; planId: string } }
  | { type: "subscription.cancelled"; data: { contactId: string; planId: string } }
  | { type: "invoice.created"; data: { contactId: string; invoiceId: string; amount: number } }
  | { type: "portal.login"; data: { contactId: string } }
  | { type: "portal.message_sent"; data: { contactId: string; messageId: string } }
  | { type: "portal.resource_viewed"; data: { contactId: string; resourceId: string } };

export type EventType = SeldonEvent["type"];
export type EventPayload<T extends EventType> = Extract<SeldonEvent, { type: T }>["data"];

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
}

export class InMemorySeldonEventBus implements SeldonEventBus {
  private readonly handlers = new Map<EventType, Set<AnyHandler>>();

  async emit<T extends EventType>(type: T, data: EventPayload<T>) {
    const listeners = this.handlers.get(type);
    if (!listeners || listeners.size === 0) {
      return;
    }

    const event: EventEnvelope<T> = { type, data, createdAt: new Date() };
    await Promise.allSettled([...listeners].map((handler) => handler(event as unknown as EventEnvelope<EventType>)));
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
