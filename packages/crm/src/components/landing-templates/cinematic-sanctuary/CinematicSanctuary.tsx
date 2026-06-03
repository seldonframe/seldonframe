import type { TemplateProps } from "../_contract/types";
import { sfThemeVars } from "./theme";
import { Styles } from "./Styles";
import { Nav, Faq } from "./interactive";
import { Hero, TrustStrip, Intro, Services, About, Gallery, Testimonials, CtaBand, Footer, MobileBar } from "./sections";

/**
 * Template 3 — "Cinematic Sanctuary"
 * Shared entry signature: ({ data, ctas, theme }) => JSX
 * Server component; only Nav + Faq opt into the client. Theme via --sf-* vars.
 * Adds a Gallery section (well-suited to spas/sanctuaries). Restrained micro-
 * motion is reduced-motion safe. Bottom-right left clear for the chat bubble.
 */
export function CinematicSanctuary({ data, ctas, theme }: TemplateProps) {
  return (
    <div className="sf3-root" style={sfThemeVars(theme)}>
      <Styles />
      <Nav data={data} ctas={ctas} />
      <main>
        <Hero data={data} ctas={ctas} />
        <TrustStrip data={data} />
        <Intro data={data} />
        <Services data={data} ctas={ctas} />
        <About data={data} ctas={ctas} />
        <Gallery data={data} />
        <Testimonials data={data} />
        <Faq data={data} />
        <CtaBand data={data} ctas={ctas} />
      </main>
      <Footer data={data} ctas={ctas} />
      <MobileBar data={data} ctas={ctas} />
    </div>
  );
}
