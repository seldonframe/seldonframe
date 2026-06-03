import type { TemplateProps } from "../_contract/types";
import { sfThemeVars } from "./theme";
import { Styles } from "./Styles";
import { Nav, Faq } from "./interactive";
import { Hero, TrustStrip, Services, About, Stats, Testimonials, CtaBand, Footer, MobileBar } from "./sections";

/**
 * Template 1 — "Clinical Luxe"
 * Shared entry signature: ({ data, ctas, theme }) => JSX
 * Server component; only Nav + Faq opt into the client. Theme applied as
 * --sf-* CSS variables on the root. Bottom-right left clear for the chat bubble.
 */
export function ClinicalLuxe({ data, ctas, theme }: TemplateProps) {
  return (
    <div className="sf1-root" style={sfThemeVars(theme)}>
      <Styles />
      <Nav data={data} ctas={ctas} />
      <main>
        <Hero data={data} ctas={ctas} />
        <TrustStrip data={data} />
        <Services data={data} ctas={ctas} />
        <About data={data} ctas={ctas} />
        <Stats data={data} />
        <Testimonials data={data} />
        <Faq data={data} />
        <CtaBand data={data} ctas={ctas} />
      </main>
      <Footer data={data} ctas={ctas} />
      <MobileBar data={data} ctas={ctas} />
    </div>
  );
}
