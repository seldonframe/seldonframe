import { getSeldonEventBus, type EventPayload, type EventType } from "@seldonframe/core/events";

export async function emitSeldonEvent<T extends EventType>(type: T, data: EventPayload<T>) {
  const bus = getSeldonEventBus();
  await bus.emit(type, data);
}
