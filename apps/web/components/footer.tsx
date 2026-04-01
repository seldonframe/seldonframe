import Image from "next/image";

export function Footer() {
  return (
    <footer className="web-section pt-10">
      <div className="web-container">
        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <Image src="/logo-full.svg" alt="SeldonFrame" width={180} height={32} className="h-8 w-auto" />
            <p className="mt-3 text-sm text-[hsl(var(--color-text-secondary))]">Open source business OS for service professionals.</p>
          </div>
          <div className="space-y-2 text-sm text-[hsl(var(--color-text-secondary))]">
            <a className="block hover:text-foreground" href="https://github.com/seldonframe/crm">GitHub</a>
            <a className="block hover:text-foreground" href="https://github.com/seldonframe/crm/blob/main/QUICKSTART.md">Documentation</a>
            <a className="block hover:text-foreground" href="https://github.com/seldonframe/crm/tree/main/showcase">Showcase</a>
            <span className="block">Blog (Coming soon)</span>
          </div>
          <div className="space-y-2 text-sm text-[hsl(var(--color-text-secondary))]">
            <a className="block hover:text-foreground" href="https://x.com">X / Twitter</a>
            <a className="block hover:text-foreground" href="https://github.com/seldonframe/crm/releases">Changelog</a>
            <a className="block hover:text-foreground" href="https://github.com/seldonframe/crm/blob/main/LICENSE">License (MIT)</a>
            <a className="block hover:text-foreground" href="/policy">Privacy Policy</a>
            <a className="block hover:text-foreground" href="/terms-of-service">Terms of Service</a>
          </div>
        </div>
        <div className="section-divider my-8" />
        <p className="text-center text-xs text-[hsl(var(--color-text-secondary))]">Built with Next.js, Neon, Vercel, and Claude. MIT Licensed.</p>
      </div>
    </footer>
  );
}
