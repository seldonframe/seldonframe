import { getLandingBlockManifest } from "./block-registry";
import type { LandingPageSection } from "./sections/types";

export function PageRenderer({ sections }: { sections: LandingPageSection[] }) {
  const ordered = [...sections].sort((a, b) => a.order - b.order);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--sf-bg)", color: "var(--sf-text)" }}>
      {ordered.map((section, index) => {
        const key = `${section.type}-${index}`;
        const manifest = getLandingBlockManifest(section.type);
        if (!manifest) {
          return null;
        }

        return manifest.render(section.content, key);
      })}
    </div>
  );
}
