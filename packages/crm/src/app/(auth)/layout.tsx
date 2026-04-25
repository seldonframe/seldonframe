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
          {/* SLICE 9 PR 2 C1: wordmark on auth surfaces per brand README */}
          <Image src="/brand/seldonframe-wordmark.svg" alt="SeldonFrame" width={180} height={36} priority />
        </div>
        {children}
      </div>
    </div>
  );
}
