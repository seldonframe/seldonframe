import Image from "next/image";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 30%, color-mix(in srgb, var(--primary) 14.00%, transparent) 0%, color-mix(in srgb, var(--primary) 6%, transparent) 28%, transparent 64%)",
        }}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card/95 p-6 shadow-sm backdrop-blur">
        <div className="mb-5 flex justify-center">
          {/* SLICE 9 PR 2 C1: wordmark on auth surfaces per brand README.
              2026-05-23 — Bug #3 fix: the wordmark SVG's viewBox was 320x100
              but the text glyphs extended past x≈360 (font-size:44 starting
              at x:115), so the right portion of "SeldonFrame" got clipped
              to "SeldonFra…" on render. Widened the viewBox to 400x100
              and updated Image dimensions to the new 4:1 aspect ratio so
              the browser doesn't stretch the SVG. */}
          <Image src="/brand/seldonframe-wordmark.svg" alt="SeldonFrame" width={200} height={50} priority />
        </div>
        {children}
      </div>
    </div>
  );
}
