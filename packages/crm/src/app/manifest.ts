import type { MetadataRoute } from "next";
import { generatePwaManifest } from "@seldonframe/core/virality";

export default function manifest(): MetadataRoute.Manifest {
  const base = generatePwaManifest({
    name: "SeldonFrame CRM",
    shortName: "SeldonFrame",
    description: "Soul-driven CRM framework",
    startUrl: "/hub",
    themeColor: "#0a0e14",
    backgroundColor: "#0a0e14",
    icons: [
      { src: "/logo.svg", sizes: "any", type: "image/svg+xml" },
    ],
  }) as MetadataRoute.Manifest;

  return {
    ...base,
    // Web Share Target (record-to-agent mobile-P3): lets Android's native
    // Share sheet send a screen recording straight into /record instead of
    // the operator hunting the file down in their Files app. MetadataRoute
    // .Manifest doesn't type `share_target` — cast through `unknown` so
    // this stays a plain object literal Next serializes as-is.
    share_target: {
      action: "/record/share-target",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        files: [
          {
            name: "recording",
            accept: ["video/mp4", "video/quicktime", "video/webm"],
          },
        ],
      },
    },
  } as unknown as MetadataRoute.Manifest;
}
