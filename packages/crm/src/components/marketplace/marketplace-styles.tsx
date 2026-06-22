// Marketplace global styles — the keyframes + .sf-* helper classes from the
// Claude Design output's <style> block, scoped to the storefront. Injected once
// per page as a plain <style> tag so animations (hover lift, typing dots, the
// install-ceremony ring/float/glow) match the design exactly without pulling in
// a CSS-in-JS runtime. Also loads the design's Google Fonts (incl. DM Mono).

import type { ReactElement } from "react";
import { MKT_FONTS_HREF } from "./marketplace-data";

const CSS = `
  .sf-mkt *{box-sizing:border-box}
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
