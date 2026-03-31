import type { LandingSection } from "@/lib/landing/types";
import { PageRenderer } from "./page-renderer";

type Props = {
  sections: LandingSection[];
  orgSlug?: string;
  pageSlug?: string;
};
export function LandingSectionRenderer({ sections }: Props) {
  return <PageRenderer sections={sections} />;
}
