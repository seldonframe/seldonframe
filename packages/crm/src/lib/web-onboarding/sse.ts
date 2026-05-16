// packages/crm/src/lib/web-onboarding/sse.ts
// Tiny Server-Sent Events helper around the standard ReadableStream interface.
// Next.js 16 App Router routes return a Response with this stream as the body.
// Frames each event as `event: <name>\ndata: <json>\n\n` per the SSE spec.

export type SseStreamHandle = {
  stream: ReadableStream<Uint8Array>;
  emit: (event: string, data: unknown) => void;
  error: (code: number, body: Record<string, unknown>) => void;
  close: () => void;
};

export function createSseStream(): SseStreamHandle {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      closed = true;
      controller = null;
    },
  });

  function write(text: string) {
    if (closed || !controller) return;
    controller.enqueue(encoder.encode(text));
  }

  return {
    stream,
    emit(event, data) {
      write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    error(code, body) {
      write(`event: error\ndata: ${JSON.stringify({ code, ...body })}\n\n`);
    },
    close() {
      if (closed || !controller) return;
      closed = true;
      controller.close();
      controller = null;
    },
  };
}

export const SSE_RESPONSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};
