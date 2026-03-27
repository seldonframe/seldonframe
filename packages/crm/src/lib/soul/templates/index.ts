import { agencySoulTemplate } from "./agency";
import { coachingSoulTemplate } from "./coaching";
import { consultingSoulTemplate } from "./consulting";
import { defaultSoulTemplate } from "./default";
import { ecommerceSoulTemplate } from "./ecommerce";
import { fitnessSoulTemplate } from "./fitness";
import { healthcareSoulTemplate } from "./healthcare";
import { realEstateSoulTemplate } from "./real-estate";
import { saasSoulTemplate } from "./saas";

export const soulTemplates = {
  coaching: coachingSoulTemplate,
  "real-estate": realEstateSoulTemplate,
  agency: agencySoulTemplate,
  ecommerce: ecommerceSoulTemplate,
  saas: saasSoulTemplate,
  fitness: fitnessSoulTemplate,
  consulting: consultingSoulTemplate,
  healthcare: healthcareSoulTemplate,
  default: defaultSoulTemplate,
} as const;
