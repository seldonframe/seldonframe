/* SF3 global stylesheet — single source of truth shared by <Styles/>.
   Mobile-first; container queries on .sf3-root. Every value resolves from --sf-* vars. */
export const SF3_CSS = `
.sf3-root{
  --sf-primary-d: color-mix(in oklab, var(--sf-primary) 80%, #000);
  --sf-tint: color-mix(in oklab, var(--sf-primary) 8%, var(--sf-bg));
  --sf-card: color-mix(in oklab, var(--sf-text) 5%, var(--sf-bg));
  --sf-ink-55: color-mix(in oklab, var(--sf-text) 52%, var(--sf-bg));
  --sf-line: color-mix(in oklab, var(--sf-text) 16%, var(--sf-bg));
  --wrap: 1280px;
  container: sf3 / inline-size;
  background: var(--sf-bg); color: var(--sf-text);
  font-family: var(--sf-font-body); font-size: 16px; line-height: 1.7;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
}
.sf3-root *{ box-sizing:border-box; }
.sf3-root img{ display:block; max-width:100%; }
.sf3-wrap{ width:100%; max-width:var(--wrap); margin-inline:auto; padding-inline:26px; }

/* type — letter-spaced serif */
.sf3-h2{ font-family:var(--sf-font-headline); font-weight:400; letter-spacing:.04em; line-height:1.16; font-size:clamp(28px,5.6cqw,46px); margin:0; }
.sf3-eyebrow{ font-weight:600; text-transform:uppercase; letter-spacing:.34em; font-size:11px; color:var(--sf-primary); margin:0 0 22px; }
.sf3-muted{ color:var(--sf-ink-55); }

/* buttons — quiet, underlined / outlined */
.sf3-btn{ display:inline-flex; align-items:center; gap:10px; font-family:var(--sf-font-body); font-weight:600;
  font-size:12px; letter-spacing:.2em; text-transform:uppercase; line-height:1; padding:16px 30px; border-radius:0;
  border:1px solid transparent; cursor:pointer; text-decoration:none; white-space:nowrap; transition:background .3s, color .3s, border-color .3s, opacity .3s; }
.sf3-btn svg{ font-size:14px; }
.sf3-btn:focus-visible{ outline:2px solid var(--sf-primary); outline-offset:3px; }
.sf3-btn-solid{ background:var(--sf-secondary); color:var(--sf-bg); }
.sf3-btn-solid:hover{ background:var(--sf-primary); }
.sf3-btn-line{ background:transparent; color:var(--sf-text); border-color:var(--sf-line); }
.sf3-btn-line:hover{ border-color:var(--sf-text); }
.sf3-btn-onimg{ background:transparent; color:#fff; border-color:rgba(255,255,255,.5); }
.sf3-btn-onimg:hover{ background:#fff; color:var(--sf-secondary); border-color:#fff; }
.sf3-btn-onimg-solid{ background:#fff; color:var(--sf-secondary); }
.sf3-btn-block{ width:100%; justify-content:center; }
.sf3-link{ display:inline-flex; align-items:center; gap:9px; font-weight:600; font-size:12px; letter-spacing:.18em; text-transform:uppercase; color:var(--sf-primary); text-decoration:none; }
.sf3-link:hover{ gap:14px; }

/* nav */
.sf3-nav{ position:sticky; top:0; z-index:40; background:color-mix(in oklab,var(--sf-bg) 85%,transparent); backdrop-filter:blur(12px); }
.sf3-nav-in{ display:flex; align-items:center; justify-content:space-between; gap:16px; height:84px; }
.sf3-brand{ display:inline-flex; align-items:center; gap:12px; min-width:0; flex-shrink:1; text-decoration:none; color:var(--sf-text); }
.sf3-brand-mark{ flex:none; font-size:22px; color:var(--sf-primary); }
.sf3-brand-name{ font-family:var(--sf-font-headline); font-weight:400; font-size:20px; letter-spacing:.15em; text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sf3-nav-links{ display:none; gap:32px; }
.sf3-nav-links a{ color:var(--sf-text); text-decoration:none; font-size:11px; font-weight:600; letter-spacing:.2em; text-transform:uppercase; opacity:.78; }
.sf3-nav-links a:hover{ opacity:1; color:var(--sf-primary); }
.sf3-nav-cta{ display:flex; align-items:center; gap:18px; }
.sf3-link-call{ display:none; color:var(--sf-text); text-decoration:none; font-size:11px; font-weight:600; letter-spacing:.16em; text-transform:uppercase; }
.sf3-link-call:hover{ color:var(--sf-primary); }
.sf3-nav .sf3-btn{ display:none; }
.sf3-burger{ display:inline-grid; place-items:center; width:44px; height:44px; border:1px solid var(--sf-line); color:var(--sf-text); font-size:22px; cursor:pointer; background:transparent; }

.sf3-sheet{ position:fixed; inset:0; z-index:60; background:var(--sf-bg); transform:translateY(-100%); transition:transform .4s cubic-bezier(.4,0,.2,1); display:flex; flex-direction:column; visibility:hidden; }
.sf3-sheet.is-open{ transform:translateY(0); visibility:visible; }
.sf3-sheet-top{ display:flex; align-items:center; justify-content:space-between; height:84px; }
.sf3-sheet-links{ display:flex; flex-direction:column; padding:20px 26px; }
.sf3-sheet-links a{ font-family:var(--sf-font-headline); font-weight:400; font-size:30px; letter-spacing:.08em; color:var(--sf-text); text-decoration:none; padding:16px 0; border-bottom:1px solid var(--sf-line); }
.sf3-sheet-foot{ margin-top:auto; padding:26px; display:flex; flex-direction:column; gap:12px; }

/* hero — cinematic, asymmetric (text lower-left), big negative space */
.sf3-hero{ position:relative; }
.sf3-hero-media{ position:relative; height:clamp(520px,82cqh,860px); }
.sf3-hero-media .sf3-img,.sf3-hero-media .sf3-ph{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.sf3-hero-scrim{ position:absolute; inset:0; background:linear-gradient(180deg, color-mix(in oklab,var(--sf-secondary) 28%,transparent) 0%, transparent 34%, color-mix(in oklab,var(--sf-secondary) 64%,transparent) 100%); }
.sf3-hero-in{ position:absolute; left:0; right:0; bottom:0; padding:0 26px 56px; }
.sf3-hero-eyebrow{ color:rgba(255,255,255,.86); font-weight:600; text-transform:uppercase; letter-spacing:.34em; font-size:11px; margin:0 0 22px; }
.sf3-hero-h1{ font-family:var(--sf-font-headline); font-weight:400; color:#fff; letter-spacing:.06em; line-height:1.1; font-size:clamp(38px,8.4cqw,86px); margin:0 0 26px; max-width:15ch; }
.sf3-hero-sub{ color:rgba(255,255,255,.86); font-size:clamp(15px,2.2cqw,18px); max-width:46ch; margin:0 0 32px; }
.sf3-hero-actions{ display:flex; flex-wrap:wrap; gap:16px; align-items:center; }
.sf3-hero-meta{ display:flex; gap:8px; align-items:center; color:#fff; font-size:12px; letter-spacing:.12em; text-transform:uppercase; }
.sf3-hero-meta svg{ color:#fff; }

/* micro-motion (restrained, reduced-motion safe) */
@media (prefers-reduced-motion: no-preference){
  .sf3-reveal{ opacity:0; transform:translateY(20px); animation:sf3up 1.1s cubic-bezier(.2,.7,.2,1) .12s both; }
  .sf3-reveal-2{ animation-delay:.26s; }
  .sf3-reveal-3{ animation-delay:.4s; }
  @keyframes sf3up{ to{ opacity:1; transform:none; } }
}

/* trust */
.sf3-trust{ border-bottom:1px solid var(--sf-line); }
.sf3-trust-in{ display:flex; flex-wrap:wrap; justify-content:center; gap:14px 44px; padding-block:26px; }
.sf3-trust-item{ display:inline-flex; align-items:center; gap:10px; font-size:11px; font-weight:600; letter-spacing:.18em; text-transform:uppercase; color:var(--sf-ink-55); }
.sf3-trust-item svg{ color:var(--sf-primary); font-size:15px; }
.sf3-trust-item b{ font-family:var(--sf-font-headline); font-weight:400; font-size:17px; letter-spacing:.04em; color:var(--sf-primary); }

/* sections */
.sf3-sec{ padding-block:104px; }
.sf3-intro{ max-width:30ch; }
.sf3-intro .sf3-h2{ font-size:clamp(26px,4.6cqw,40px); }

/* numbered vignettes */
.sf3-vig{ display:grid; grid-template-columns:1fr; gap:30px; align-items:center; padding-block:54px; border-top:1px solid var(--sf-line); }
.sf3-vig-media{ position:relative; aspect-ratio:3/2; overflow:hidden; }
.sf3-vig-media .sf3-img,.sf3-vig-media .sf3-ph{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; transition:transform 1.2s cubic-bezier(.2,.7,.2,1); }
.sf3-vig:hover .sf3-vig-media .sf3-img{ transform:scale(1.04); }
.sf3-vig-body{ display:flex; flex-direction:column; gap:16px; }
.sf3-vig-num{ font-family:var(--sf-font-headline); font-size:14px; letter-spacing:.3em; color:var(--sf-primary); }
.sf3-vig-name{ font-family:var(--sf-font-headline); font-weight:400; letter-spacing:.03em; line-height:1.1; font-size:clamp(26px,3.8cqw,40px); margin:0; }
.sf3-vig-desc{ margin:0; color:var(--sf-ink-55); font-size:16px; max-width:42ch; }
.sf3-vig-meta{ display:flex; align-items:center; gap:24px; padding-top:8px; }
.sf3-vig-price{ font-family:var(--sf-font-headline); font-size:22px; letter-spacing:.04em; }
.sf3-vig-dur{ display:inline-flex; align-items:center; gap:8px; white-space:nowrap; color:var(--sf-ink-55); font-size:12px; letter-spacing:.14em; text-transform:uppercase; }
.sf3-vig-dur svg{ color:var(--sf-primary); }
.sf3-vig-body .sf3-link{ margin-top:4px; }

/* about */
.sf3-about{ display:grid; grid-template-columns:1fr; gap:40px; align-items:center; }
.sf3-about-media{ position:relative; aspect-ratio:4/5; overflow:hidden; }
.sf3-about-media .sf3-img,.sf3-about-media .sf3-ph{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.sf3-about-text{ margin:0 0 20px; font-size:18px; color:var(--sf-text); max-width:50ch; line-height:1.8; }
.sf3-creds{ list-style:none; padding:22px 0 24px; margin:0; display:flex; flex-direction:column; gap:12px; border-top:1px solid var(--sf-line); }
.sf3-creds li{ display:flex; align-items:center; gap:12px; font-size:14px; letter-spacing:.04em; }
.sf3-creds svg{ color:var(--sf-primary); }

/* gallery */
.sf3-gallery{ display:grid; grid-template-columns:repeat(2,1fr); gap:12px; }
.sf3-gal{ position:relative; overflow:hidden; }
.sf3-gal .sf3-img,.sf3-gal .sf3-ph{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; transition:transform 1.2s cubic-bezier(.2,.7,.2,1); }
.sf3-gal:hover .sf3-img{ transform:scale(1.05); }
.sf3-gal-1{ aspect-ratio:1; } .sf3-gal-2{ aspect-ratio:1; } .sf3-gal-3{ aspect-ratio:1; } .sf3-gal-4{ aspect-ratio:1; }

/* testimonial — single large quote */
.sf3-quote{ text-align:center; max-width:30ch; margin-inline:auto; }
.sf3-quote-mark{ font-family:var(--sf-font-headline); font-size:64px; line-height:0.5; color:var(--sf-primary); display:block; margin-bottom:24px; }
.sf3-quote blockquote{ margin:0 0 24px; font-family:var(--sf-font-headline); font-weight:400; letter-spacing:.02em; line-height:1.4; font-size:clamp(24px,4cqw,38px); }
.sf3-quote figcaption{ font-size:11px; letter-spacing:.24em; text-transform:uppercase; color:var(--sf-ink-55); }

/* faq */
.sf3-faq-in{ display:grid; grid-template-columns:1fr; gap:36px; }
.sf3-faq-list{ border-top:1px solid var(--sf-line); }
.sf3-faq-item{ border-bottom:1px solid var(--sf-line); }
.sf3-faq-q{ width:100%; display:flex; align-items:center; justify-content:space-between; gap:18px; background:none; border:0; cursor:pointer; text-align:left; padding:28px 2px; font-family:var(--sf-font-headline); font-weight:400; letter-spacing:.03em; font-size:clamp(19px,2.4cqw,24px); color:var(--sf-text); }
.sf3-faq-chev{ flex:none; font-size:20px; color:var(--sf-primary); transition:transform .35s; }
.sf3-faq-item.is-open .sf3-faq-chev{ transform:rotate(180deg); }
.sf3-faq-a{ display:grid; grid-template-rows:0fr; transition:grid-template-rows .35s ease; }
.sf3-faq-item.is-open .sf3-faq-a{ grid-template-rows:1fr; }
.sf3-faq-a > p{ overflow:hidden; margin:0; color:var(--sf-ink-55); font-size:16px; max-width:60ch; padding-bottom:0; transition:padding-bottom .35s; }
.sf3-faq-item.is-open .sf3-faq-a > p{ padding-bottom:28px; }

/* cta */
.sf3-cta{ position:relative; overflow:hidden; }
.sf3-cta-media{ position:absolute; inset:0; }
.sf3-cta-media .sf3-img,.sf3-cta-media .sf3-ph{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.sf3-cta-scrim{ position:absolute; inset:0; background:color-mix(in oklab,var(--sf-secondary) 58%,transparent); }
.sf3-cta-in{ position:relative; text-align:center; padding-block:130px; }
.sf3-cta-eyebrow{ color:rgba(255,255,255,.8); font-weight:600; text-transform:uppercase; letter-spacing:.34em; font-size:11px; margin:0 0 22px; }
.sf3-cta-h{ font-family:var(--sf-font-headline); font-weight:400; color:#fff; letter-spacing:.06em; line-height:1.1; font-size:clamp(32px,6.4cqw,62px); margin:0 auto 30px; max-width:18ch; }
.sf3-cta-actions{ display:flex; flex-wrap:wrap; gap:16px; justify-content:center; }

/* footer */
.sf3-foot{ background:var(--sf-secondary); color:var(--sf-bg); padding-top:80px; }
.sf3-foot-in{ display:grid; grid-template-columns:1fr; gap:44px; padding-bottom:54px; }
.sf3-foot-brand .sf3-brand-name{ color:var(--sf-bg); }
.sf3-foot-brand .sf3-brand-mark{ color:var(--sf-primary); }
.sf3-foot-tag{ color:color-mix(in oklab,var(--sf-bg) 64%,var(--sf-secondary)); margin:18px 0 24px; max-width:34ch; letter-spacing:.02em; }
.sf3-foot-cols{ display:grid; grid-template-columns:1fr 1fr; gap:34px 24px; }
.sf3-foot-col h3{ font-size:10px; letter-spacing:.22em; text-transform:uppercase; color:var(--sf-primary); margin:0 0 16px; }
.sf3-foot-col ul{ list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:11px; }
.sf3-foot-col li,.sf3-foot-col a{ color:color-mix(in oklab,var(--sf-bg) 76%,var(--sf-secondary)); font-size:13.5px; letter-spacing:.03em; text-decoration:none; }
.sf3-foot-col a:hover{ color:#fff; }
.sf3-foot-legal{ display:flex; flex-wrap:wrap; gap:8px 20px; justify-content:space-between; border-top:1px solid color-mix(in oklab,var(--sf-bg) 16%,var(--sf-secondary)); padding-block:24px; font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:color-mix(in oklab,var(--sf-bg) 52%,var(--sf-secondary)); }

/* mobile bar */
.sf3-mbar{ position:sticky; bottom:0; z-index:50; display:flex; gap:10px; padding:12px 16px calc(12px + env(safe-area-inset-bottom)); background:color-mix(in oklab,var(--sf-bg) 94%,transparent); backdrop-filter:blur(10px); border-top:1px solid var(--sf-line); }
.sf3-mbar-call{ display:inline-flex; align-items:center; justify-content:center; gap:8px; padding:15px 22px; border:1px solid var(--sf-line); color:var(--sf-text); text-decoration:none; font-weight:600; font-size:11px; letter-spacing:.16em; text-transform:uppercase; }
.sf3-mbar-book{ flex:1; display:inline-flex; align-items:center; justify-content:center; padding:15px 22px; background:var(--sf-secondary); color:var(--sf-bg); text-decoration:none; font-weight:600; font-size:11px; letter-spacing:.16em; text-transform:uppercase; }

/* placeholder + image */
.sf3-img{ width:100%; height:100%; object-fit:cover; }
.sf3-ph{ position:relative; width:100%; height:100%; min-height:160px; overflow:hidden;
  background: repeating-linear-gradient(135deg, color-mix(in oklab,var(--sf-primary) 12%,var(--sf-card)) 0 16px, color-mix(in oklab,var(--sf-primary) 5%,var(--sf-card)) 16px 32px), var(--sf-card);
  display:grid; place-items:center; }
.sf3-ph::after{ content:""; position:absolute; inset:0; background:radial-gradient(120% 90% at 32% 22%, transparent 44%, color-mix(in oklab,var(--sf-secondary) 12%,transparent)); }
.sf3-ph-tag{ position:relative; z-index:1; font-family:ui-monospace,Menlo,monospace; font-size:10px; letter-spacing:.14em; text-transform:uppercase; color:color-mix(in oklab,var(--sf-secondary) 62%,var(--sf-bg)); background:color-mix(in oklab,var(--sf-bg) 82%,transparent); padding:6px 12px; border:1px solid var(--sf-line); }

@media (prefers-reduced-motion: reduce){ .sf3-root *{ transition:none !important; } }

/* container queries */
@container sf3 (min-width:760px){
  .sf3-wrap{ padding-inline:44px; }
  .sf3-nav-links{ display:flex; }
  .sf3-link-call{ display:inline-flex; }
  .sf3-nav .sf3-btn{ display:inline-flex; }
  .sf3-burger{ display:none; }
  .sf3-mbar{ display:none; }
  .sf3-hero-in{ padding:0 44px 80px; }
  .sf3-vig{ grid-template-columns:1fr 1fr; gap:56px; padding-block:64px; }
  .sf3-vig:nth-child(even) .sf3-vig-media{ order:2; }
  .sf3-vig-media{ aspect-ratio:4/3; }
  .sf3-about{ grid-template-columns:1fr 1fr; gap:64px; }
  .sf3-gallery{ grid-template-columns:repeat(4,1fr); grid-auto-rows:1fr; }
  .sf3-gal-1{ grid-column:span 2; grid-row:span 2; aspect-ratio:auto; }
  .sf3-faq-in{ grid-template-columns:.8fr 1.2fr; gap:64px; }
  .sf3-foot-in{ grid-template-columns:1.2fr 2fr; gap:64px; }
  .sf3-foot-cols{ grid-template-columns:repeat(4,1fr); }
}
@container sf3 (min-width:1080px){
  .sf3-hero-in{ max-width:var(--wrap); margin-inline:auto; left:0; right:0; }
  .sf3-intro{ padding-left:0; }
}
`;
