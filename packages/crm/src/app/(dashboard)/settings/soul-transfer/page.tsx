import { SoulTransferPanel } from "./soul-transfer-panel";

export default function SoulTransferPage() {
  return (
    <section className="animate-page-enter space-y-4">
      <h1 className="text-page-title">Soul Export / Import</h1>
      <p className="text-label text-[hsl(var(--color-text-secondary))]">
        Export your Soul configuration as a portable JSON file, or import one from another workspace.
      </p>
      <SoulTransferPanel />
    </section>
  );
}
