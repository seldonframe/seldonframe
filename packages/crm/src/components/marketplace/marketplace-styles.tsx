// Marketplace global styles — the keyframes + .sf-* helper classes from the
// Claude Design output's <style> block, scoped to the storefront. Injected once
// per page as a plain <style> tag so animations (hover lift, typing dots, the
// install-ceremony ring/float/glow) match the design exactly without pulling in
// a CSS-in-JS runtime. Also loads the design's Google Fonts (incl. DM Mono).

import type { ReactElement } from "react";
import { MKT_FONTS_HREF } from "./marketplace-data";

const CSS = `
  .sf-mkt{overflow-x:hidden}
  .sf-mkt *{box-sizing:border-box}
  /* Root cause of grid/flex overflow on phones: flex/grid items default to a
     min-size of 'auto', so nowrap labels and long taglines force tracks wider
     than the viewport. Allowing items to shrink below content size lets the
     existing ellipses/wrapping take over instead of pushing the page sideways. */
  .sf-mkt :where(div,section,main,header,footer,a,span,p,h1,h2,h3,nav,form,pre,code){min-width:0}
  .sf-mkt img{max-width:100%;height:auto}
  @keyframes sfPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(.82)}}
  @keyframes sfBlink{0%,100%{opacity:.25}50%{opacity:1}}
  @keyframes sfRise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes sfPop{0%{opacity:0;transform:scale(.8)}60%{transform:scale(1.08)}100%{opacity:1;transform:scale(1)}}
  @keyframes sfFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
  @keyframes sfGlow{0%,100%{box-shadow:0 0 0 0 rgba(0,137,123,0.0)}50%{box-shadow:0 0 44px 6px rgba(0,137,123,0.28)}}
  @keyframes sfRing{0%{transform:scale(.6);opacity:.7}100%{transform:scale(1.8);opacity:0}}
  .sf-rise{animation:sfRise .5s cubic-bezier(0.22,1,0.36,1) both}
  .sf-link{cursor:pointer;transition:color .15s}
  .sf-link:hover{color:#00897B}
  .sf-press{transition:transform .12s cubic-bezier(0.22,1,0.36,1),box-shadow .2s,border-color .2s}
  .sf-press:active{transform:scale(.985)}
  .sf-cardhover{transition:transform .2s cubic-bezier(0.22,1,0.36,1),box-shadow .2s,border-color .2s}
  .sf-cardhover:hover{transform:translateY(-3px);box-shadow:0 2px 4px rgba(34,29,23,0.05),0 22px 44px rgba(34,29,23,0.12);border-color:rgba(34,29,23,0.18)}
  .sf-btn{transition:transform .12s,box-shadow .2s,background .2s}
  .sf-btn:active{transform:scale(.97)}
  .sf-typing span{display:inline-block;width:6px;height:6px;border-radius:99px;background:#00897B;margin:0 2px;animation:sfBlink 1.1s infinite}
  .sf-typing span:nth-child(2){animation-delay:.18s}
  .sf-typing span:nth-child(3){animation-delay:.36s}
  .sf-mkt ::selection{background:rgba(0,137,123,0.18)}

  /* ── Mobile responsiveness (≤640px) ──────────────────────────────────────
     The storefront is inline-styled (no Tailwind on these nodes), so every
     phone override lives here, keyed off stable class hooks on the inline-styled
     containers. Desktop inline styles remain the default; these only kick in on
     small screens. Each rule needs !important to beat the element's inline style. */
  @media (max-width:640px){
    /* shared chrome ---------------------------------------------------------- */
    .sf-mkt-nav{padding:0 16px !important;gap:14px !important}
    .sf-mkt-navword{display:none !important}
    .sf-mkt-navlinks{margin-left:0 !important;gap:2px !important;overflow-x:auto;-webkit-overflow-scrolling:touch;flex:1 1 auto}
    .sf-mkt-navsearch{display:none !important}
    .sf-foot-grid{grid-template-columns:1fr 1fr !important;gap:26px !important;padding:40px 20px 32px !important}
    .sf-foot-bottom{padding:16px 20px !important}

    /* browse storefront ------------------------------------------------------ */
    .sf-sec{padding-left:18px !important;padding-right:18px !important}
    .sf-hero-sec{padding-top:40px !important;padding-bottom:18px !important}
    .sf-hero-grid{grid-template-columns:1fr !important;gap:34px !important}
    .sf-hero-h1{font-size:40px !important}
    .sf-hero-search{max-width:none !important}
    .sf-cat-grid{grid-template-columns:repeat(2,minmax(0,1fr)) !important;gap:10px !important}
    .sf-feat-grid{grid-template-columns:1fr !important}
    .sf-all-grid{grid-template-columns:1fr !important}
    .sf-sech2{white-space:normal !important}

    /* listing detail --------------------------------------------------------- */
    .sf-listing-main{padding:22px 18px 56px !important}
    .sf-listing-grid{grid-template-columns:1fr !important;gap:30px !important}
    .sf-listing-aside{position:static !important;top:auto !important}
    .sf-listing-head{gap:14px !important}
    .sf-listing-h1{font-size:30px !important}
    .sf-2col{grid-template-columns:1fr !important}
    .sf-seo-grid{grid-template-columns:1fr !important}

    /* build page ------------------------------------------------------------- */
    .sf-build-main{padding:18px 18px 56px !important}
    .sf-build-h1{font-size:34px !important}
    .sf-build-dark{padding:30px 22px 26px !important}
    .sf-build-steps{grid-template-columns:1fr !important}
    .sf-build-cta{padding:28px 22px !important}
    /* developer landing (additive sections) */
    .sf-build-hero-grid{grid-template-columns:1fr !important;gap:30px !important}
    .sf-build-flow-grid{grid-template-columns:1fr !important}
    .sf-build-type-grid{grid-template-columns:1fr !important}
    .sf-build-foot-grid{grid-template-columns:1fr !important}
    .sf-build-price{grid-template-columns:1fr !important;gap:26px !important}

    /* industry directory ----------------------------------------------------- */
    .sf-dir-sec{padding-left:18px !important;padding-right:18px !important}
    .sf-dir-card{padding:26px 22px !important}
    .sf-dir-grid{grid-template-columns:1fr !important}
  }
`;

/** Drop into the top of each storefront page. */
export function MarketplaceStyles(): ReactElement {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={MKT_FONTS_HREF} />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </>
  );
}

/** The three-dot typing indicator used in chat bubbles + the ceremony heading. */
export function TypingDots({ style }: { style?: React.CSSProperties }): ReactElement {
  return (
    <span className="sf-typing" style={style}>
      <span />
      <span />
      <span />
    </span>
  );
}
