export type PwaManifestOptions = {
  name: string;
  shortName?: string;
  description?: string;
  startUrl?: string;
  display?: "standalone" | "fullscreen" | "minimal-ui" | "browser";
  themeColor?: string;
  backgroundColor?: string;
  icons?: Array<{ src: string; sizes: string; type: string }>;
};

export function generatePwaManifest(options: PwaManifestOptions) {
  return {
    name: options.name,
    short_name: options.shortName ?? options.name,
    description: options.description ?? "",
    start_url: options.startUrl ?? "/dashboard",
    display: options.display ?? "standalone",
    theme_color: options.themeColor ?? "#0a0e14",
    background_color: options.backgroundColor ?? "#0a0e14",
    icons: options.icons ?? [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
