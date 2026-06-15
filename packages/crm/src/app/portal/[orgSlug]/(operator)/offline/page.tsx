// v1 PWA — offline fallback. Precached by the service worker and
// served when a document fetch fails with no network. Static + tiny
// so it caches cleanly. Lives inside (operator) so it inherits the
// session gate + the mobile shell chrome.

export default function OfflinePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <div
        className="mb-4 flex size-12 items-center justify-center rounded-full"
        style={{ backgroundColor: "#F0F0EC", color: "#666" }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.58 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" />
        </svg>
      </div>
      <h1 className="text-[15px] font-semibold" style={{ color: "#111" }}>
        You&apos;re offline
      </h1>
      <p className="mt-1 max-w-[260px] text-[13px]" style={{ color: "#666" }}>
        Reconnect to see your latest leads, messages, and appointments.
      </p>
    </div>
  );
}
