import type { MetadataRoute } from "next";
import { generatePwaManifest } from "@seldonframe/core/virality";

export default function manifest(): MetadataRoute.Manifest {
  return generatePwaManifest({
    name: "SeldonFrame CRM",
    shortName: "SeldonFrame",
    description: "Soul-driven CRM framework",
    startUrl: "/hub",
    themeColor: "#0a0e14",
    backgroundColor: "#0a0e14",
  }) as MetadataRoute.Manifest;
}
