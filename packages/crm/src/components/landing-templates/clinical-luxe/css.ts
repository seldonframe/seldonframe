/* SF1 global stylesheet — single source of truth shared by <Styles/>.
   Mobile-first; container queries on .sf1-root. Every value resolves from --sf-* vars. */
export const SF1_CSS = `
.sf1-root{
  --sf-primary-d: color-mix(in oklab, var(--sf-primary) 80%, #000);
  --sf-primary-12: color-mix(in oklab, var(--sf-primary) 14%, var(--sf-bg));
  --sf-card: color-mix(in oklab, var(--sf-secondary) 4%, var(--sf-bg));
  --sf-card-2: color-mix(in oklab, var(--sf-secondary) 8%, var(--sf-bg));
  --sf-ink-60: color-mix(in oklab, var(--sf-text) 58%, var(--sf-bg));
  --sf-line: color-mix(in oklab, var(--sf-text) 16%, var(--sf-bg));
  --wrap: 1240px;
  container: sf1 / inline-size;
  background: var(--sf-bg); color: var(--sf-text);
  font-family: var(--sf-font-body); font-size: 16px; line-height: 1.6;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
}
.sf1-root *{ box-sizing: border-box; }
.sf1-root img{ display:block; max-width:100%; }
.sf1-wrap{ width:100%; max-width:var(--wrap); margin-inline:auto; padding-inline:22px; }

/* type — editorial serif display */
.sf1-h2{ font-family:var(--sf-font-headline); font-weight:500; letter-spacing:-.01em;
  line-height:1.05; font-size:clamp(32px,7cqw,54px); margin:0; }
.sf1-eyebrow{ font-family:var(--sf-font-body); font-weight:700; text-transform:uppercase;
  letter-spacing:.22em; font-size:11.5px; color:var(--sf-primary); margin:0 0 18px; }
.sf1-muted{ color:var(--sf-ink-60); }

/* buttons — rectangular, refined */
.sf1-btn{ display:inline-flex; align-items:center; gap:9px; font-family:var(--sf-font-body);
  font-weight:700; font-size:12px; letter-spacing:.14em; text-transform:uppercase; line-height:1;
  padding:15px 26px; border-radius:3px; border:1.5px solid transparent; cursor:pointer;
  text-decoration:none; white-space:nowrap; transition:background .25s, color .25s, border-color .25s, transform .2s; }
.sf1-btn svg{ font-size:15px; }
.sf1-btn:hover{ transform:translateY(-1px); }
.sf1-btn:focus-visible{ outline:2px solid var(--sf-primary); outline-offset:3px; }
.sf1-btn-primary{ background:var(--sf-primary); color:#fff; }
.sf1-btn-primary:hover{ background:var(--sf-primary-d); }
.sf1-btn-dark{ background:var(--sf-secondary); color:var(--sf-bg); }
.sf1-btn-outline{ background:transparent; color:var(--sf-text); border-color:var(--sf-line); }
.sf1-btn-outline:hover{ border-color:var(--sf-text); }
.sf1-btn-onimg{ background:transparent; color:#fff; border-color:rgba(255,255,255,.55); }
.sf1-btn-onimg:hover{ background:rgba(255,255,255,.12); border-color:#fff; }
.sf1-btn-gold-onimg{ background:var(--sf-primary); color:#fff; }
.sf1-btn-block{ width:100%; justify-content:center; }

/* nav */
.sf1-nav{ position:sticky; top:0; z-index:40; background:color-mix(in oklab,var(--sf-bg) 88%,transparent);
  backdrop-filter:blur(12px); border-bottom:1px solid var(--sf-line); }
.sf1-nav-in{ display:flex; align-items:center; justify-content:space-between; gap:18px; height:78px; }
.sf1-brand{ display:inline-flex; align-items:center; gap:11px; min-width:0; flex-shrink:1; text-decoration:none; color:var(--sf-text); }
.sf1-brand-mark{ flex:none; font-size:26px; color:var(--sf-primary); }
.sf1-brand-name{ font-family:var(--sf-font-headline); font-weight:600; font-size:23px; letter-spacing:.02em;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sf1-nav-links{ display:none; gap:34px; }
.sf1-nav-links a{ color:var(--sf-text); text-decoration:none; font-size:12px; font-weight:700;
  letter-spacing:.16em; text-transform:uppercase; opacity:.82; }
.sf1-nav-links a:hover{ opacity:1; color:var(--sf-primary); }
.sf1-nav-cta{ display:flex; align-items:center; gap:16px; }
.sf1-link-call{ display:none; align-items:center; gap:7px; white-space:nowrap; color:var(--sf-text);
  text-decoration:none; font-weight:700; font-size:13px; letter-spacing:.04em; }
.sf1-link-call:hover{ color:var(--sf-primary); }
.sf1-nav .sf1-btn{ display:none; }
.sf1-burger{ display:inline-grid; place-items:center; width:44px; height:44px; border-radius:4px;
  background:transparent; border:1.5px solid var(--sf-line); color:var(--sf-text); font-size:22px; cursor:pointer; }

.sf1-sheet{ position:fixed; inset:0; z-index:60; background:var(--sf-bg); transform:translateY(-100%);
  transition:transform .35s cubic-bezier(.4,0,.2,1); display:flex; flex-direction:column; visibility:hidden; }
.sf1-sheet.is-open{ transform:translateY(0); visibility:visible; }
.sf1-sheet-top{ display:flex; align-items:center; justify-content:space-between; height:78px; }
.sf1-sheet-links{ display:flex; flex-direction:column; padding:14px 24px; }
.sf1-sheet-links a{ font-family:var(--sf-font-headline); font-weight:500; font-size:32px; color:var(--sf-text);
  text-decoration:none; padding:14px 0; border-bottom:1px solid var(--sf-line); }
.sf1-sheet-foot{ margin-top:auto; padding:24px; display:flex; flex-direction:column; gap:12px; }

/* hero — full-bleed image, left-anchored copy */
.sf1-hero{ position:relative; min-height:62cqh; display:flex; }
.sf1-hero-media{ position:absolute; inset:0; }
.sf1-hero-media .sf1-img,.sf1-hero-media .sf1-ph{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.sf1-hero-scrim{ position:absolute; inset:0;
  background:linear-gradient(100deg, color-mix(in oklab,var(--sf-secondary) 82%,transparent) 0%, color-mix(in oklab,var(--sf-secondary) 55%,transparent) 42%, color-mix(in oklab,var(--sf-secondary) 12%,transparent) 78%); }
.sf1-hero-in{ position:relative; z-index:1; align-self:center; padding:64px 22px; width:100%; }
.sf1-hero-eyebrow{ color:color-mix(in oklab,var(--sf-primary) 70%,#fff); font-weight:700; text-transform:uppercase;
  letter-spacing:.24em; font-size:12px; margin:0 0 20px; }
.sf1-hero-h1{ font-family:var(--sf-font-headline); font-weight:500; color:#fff; letter-spacing:-.01em;
  line-height:1.04; font-size:clamp(42px,9cqw,80px); margin:0 0 22px; max-width:16ch; text-wrap:balance; }
.sf1-hero-sub{ color:rgba(255,255,255,.9); font-size:clamp(16px,2.4cqw,20px); max-width:50ch; margin:0 0 32px; }
.sf1-hero-actions{ display:flex; flex-wrap:wrap; gap:14px; }
.sf1-hero-chips{ list-style:none; display:flex; flex-wrap:wrap; gap:14px 30px; margin:38px 0 0; padding:30px 0 0;
  border-top:1px solid rgba(255,255,255,.25); }
.sf1-hero-chips li{ display:inline-flex; align-items:center; gap:9px; color:#fff; font-size:13px; font-weight:600; letter-spacing:.02em; }
.sf1-hero-chips b{ font-family:var(--sf-font-headline); font-size:20px; font-weight:600; }
.sf1-hero-chips svg{ color:color-mix(in oklab,var(--sf-primary) 70%,#fff); font-size:17px; }
.sf1-hero-stars{ color:color-mix(in oklab,var(--sf-primary) 70%,#fff); }

/* trust strip */
.sf1-trust{ border-bottom:1px solid var(--sf-line); }
.sf1-trust-in{ display:flex; flex-wrap:wrap; justify-content:center; gap:14px 0; padding-block:24px; }
.sf1-trust-item{ display:flex; align-items:center; gap:11px; padding:0 30px; font-size:12.5px; font-weight:700;
  letter-spacing:.08em; text-transform:uppercase; color:var(--sf-ink-60); }
.sf1-trust-item + .sf1-trust-item{ border-left:1px solid var(--sf-line); }
.sf1-trust-item svg{ color:var(--sf-primary); font-size:16px; }
.sf1-trust-lead{ font-family:var(--sf-font-headline); font-size:18px; font-weight:600; color:var(--sf-primary); letter-spacing:0; text-transform:none; }

/* section heads */
.sf1-sec{ padding-block:84px; }
.sf1-sec-head{ display:flex; flex-direction:column; gap:14px; max-width:60ch; margin-bottom:18px; }

/* services — editorial rows */
.sf1-rows{ border-top:1px solid var(--sf-line); }
.sf1-row{ display:grid; grid-template-columns:1fr; border-bottom:1px solid var(--sf-line); }
.sf1-row-media{ position:relative; aspect-ratio:16/11; }
.sf1-row-media .sf1-img,.sf1-row-media .sf1-ph{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.sf1-row-body{ padding:34px 4px; display:flex; flex-direction:column; gap:14px; }
.sf1-row-num{ font-family:var(--sf-font-headline); font-size:15px; color:var(--sf-primary); font-weight:600; letter-spacing:.1em; }
.sf1-row-name{ font-family:var(--sf-font-headline); font-weight:500; font-size:clamp(26px,3.6cqw,38px); margin:0; line-height:1.08; }
.sf1-row-desc{ margin:0; color:var(--sf-ink-60); font-size:16px; max-width:46ch; }
.sf1-row-meta{ display:flex; align-items:center; gap:22px; margin-top:4px; }
.sf1-row-meta .sf1-price{ font-family:var(--sf-font-headline); font-size:24px; font-weight:600; }
.sf1-row-meta .sf1-dur{ display:inline-flex; align-items:center; gap:7px; color:var(--sf-ink-60); font-size:14px; font-weight:600; }
.sf1-row-meta svg{ color:var(--sf-primary); font-size:16px; }
.sf1-row-body .sf1-btn{ align-self:flex-start; margin-top:6px; }

/* about */
.sf1-about{ display:grid; grid-template-columns:1fr; gap:0; align-items:stretch; }
.sf1-about-media{ position:relative; min-height:420px; }
.sf1-about-media .sf1-img,.sf1-about-media .sf1-ph{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.sf1-about-body{ background:var(--sf-card); padding:56px 22px; display:flex; flex-direction:column; gap:18px; justify-content:center; }
.sf1-about-text{ margin:0; font-size:18px; color:var(--sf-text); max-width:48ch; line-height:1.7; }
.sf1-creds{ list-style:none; padding:18px 0 0; margin:6px 0 0; display:flex; flex-direction:column; gap:11px; border-top:1px solid var(--sf-line); }
.sf1-creds li{ display:flex; align-items:center; gap:10px; font-weight:600; font-size:15px; }
.sf1-creds svg{ color:var(--sf-primary); }

/* stats */
.sf1-stats{ background:var(--sf-secondary); color:var(--sf-bg); }
.sf1-stats-in{ display:flex; flex-wrap:wrap; gap:30px 64px; padding-block:54px; justify-content:center; }
.sf1-stat{ text-align:center; }
.sf1-stat-n{ display:block; font-family:var(--sf-font-headline); font-weight:500; font-size:clamp(40px,6cqw,58px); line-height:1; color:#fff; }
.sf1-stat-l{ display:block; margin-top:8px; font-size:12px; letter-spacing:.16em; text-transform:uppercase; color:color-mix(in oklab,var(--sf-bg) 64%,var(--sf-secondary)); }

/* testimonials */
.sf1-revs{ padding-block:84px; }
.sf1-rev-grid{ display:grid; grid-template-columns:1fr; gap:34px; margin-top:40px; }
.sf1-rev{ margin:0; display:flex; flex-direction:column; gap:18px; padding-right:10px; }
.sf1-rev blockquote{ margin:0; font-family:var(--sf-font-headline); font-weight:500; font-size:clamp(21px,2.6cqw,26px); line-height:1.35; }
.sf1-rev-stars{ color:var(--sf-primary); font-size:15px; }
.sf1-rev figcaption{ font-size:12px; letter-spacing:.16em; text-transform:uppercase; color:var(--sf-ink-60); font-weight:700; }

/* faq */
.sf1-faq-in{ display:grid; grid-template-columns:1fr; gap:32px; }
.sf1-faq-list{ border-top:1px solid var(--sf-line); }
.sf1-faq-item{ border-bottom:1px solid var(--sf-line); }
.sf1-faq-q{ width:100%; display:flex; align-items:center; justify-content:space-between; gap:18px; background:none;
  border:0; cursor:pointer; text-align:left; padding:26px 2px; font-family:var(--sf-font-headline); font-weight:500;
  font-size:clamp(19px,2.4cqw,23px); color:var(--sf-text); }
.sf1-faq-chev{ flex:none; font-size:22px; color:var(--sf-primary); transition:transform .25s; }
.sf1-faq-item.is-open .sf1-faq-chev{ transform:rotate(180deg); }
.sf1-faq-a{ display:grid; grid-template-rows:0fr; transition:grid-template-rows .3s ease; }
.sf1-faq-item.is-open .sf1-faq-a{ grid-template-rows:1fr; }
.sf1-faq-a > p{ overflow:hidden; margin:0; color:var(--sf-ink-60); font-size:16px; padding-right:30px; padding-bottom:0; transition:padding-bottom .3s; }
.sf1-faq-item.is-open .sf1-faq-a > p{ padding-bottom:26px; }

/* cta band */
.sf1-cta{ position:relative; overflow:hidden; }
.sf1-cta-media{ position:absolute; inset:0; }
.sf1-cta-media .sf1-img,.sf1-cta-media .sf1-ph{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.sf1-cta-scrim{ position:absolute; inset:0; background:linear-gradient(90deg,color-mix(in oklab,var(--sf-secondary) 86%,transparent),color-mix(in oklab,var(--sf-secondary) 52%,transparent)); }
.sf1-cta-in{ position:relative; padding-block:96px; text-align:left; }
.sf1-cta-h{ font-family:var(--sf-font-headline); font-weight:500; color:#fff; line-height:1.05; font-size:clamp(34px,7cqw,60px); margin:0 0 16px; max-width:18ch; }
.sf1-cta-sub{ color:rgba(255,255,255,.88); font-size:18px; margin:0 0 30px; max-width:44ch; }

/* footer */
.sf1-foot{ background:var(--sf-secondary); color:var(--sf-bg); padding-top:70px; }
.sf1-foot-in{ display:grid; grid-template-columns:1fr; gap:42px; padding-bottom:52px; }
.sf1-foot-brand .sf1-brand-name{ color:var(--sf-bg); }
.sf1-foot-brand .sf1-brand-mark{ color:var(--sf-primary); }
.sf1-foot-tag{ color:color-mix(in oklab,var(--sf-bg) 68%,var(--sf-secondary)); margin:16px 0 22px; max-width:36ch; }
.sf1-foot-cols{ display:grid; grid-template-columns:1fr 1fr; gap:34px 24px; }
.sf1-foot-col h3{ font-size:11px; letter-spacing:.18em; text-transform:uppercase; color:var(--sf-primary); margin:0 0 16px; }
.sf1-foot-col ul{ list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:10px; }
.sf1-foot-col li,.sf1-foot-col a{ color:color-mix(in oklab,var(--sf-bg) 80%,var(--sf-secondary)); font-size:14px; text-decoration:none; }
.sf1-foot-col a:hover{ color:#fff; }
.sf1-foot-legal{ display:flex; flex-wrap:wrap; gap:8px 20px; justify-content:space-between;
  border-top:1px solid color-mix(in oklab,var(--sf-bg) 16%,var(--sf-secondary)); padding-block:24px;
  font-size:12px; letter-spacing:.04em; color:color-mix(in oklab,var(--sf-bg) 56%,var(--sf-secondary)); }

/* sticky mobile bar */
.sf1-mbar{ position:sticky; bottom:0; z-index:50; display:flex; gap:10px; padding:12px 16px calc(12px + env(safe-area-inset-bottom));
  background:color-mix(in oklab,var(--sf-bg) 94%,transparent); backdrop-filter:blur(10px); border-top:1px solid var(--sf-line); }
.sf1-mbar-call{ display:inline-flex; align-items:center; justify-content:center; gap:8px; padding:15px 22px; border-radius:3px;
  border:1.5px solid var(--sf-line); color:var(--sf-text); text-decoration:none; font-weight:700; font-size:12px; letter-spacing:.12em; text-transform:uppercase; }
.sf1-mbar-book{ flex:1; display:inline-flex; align-items:center; justify-content:center; padding:15px 22px; border-radius:3px;
  background:var(--sf-primary); color:#fff; text-decoration:none; font-weight:700; font-size:12px; letter-spacing:.12em; text-transform:uppercase; }

/* placeholder + image */
.sf1-img{ width:100%; height:100%; object-fit:cover; }
.sf1-ph{ position:relative; width:100%; height:100%; min-height:160px; overflow:hidden;
  background: repeating-linear-gradient(135deg, color-mix(in oklab,var(--sf-primary) 13%,var(--sf-card-2)) 0 13px, color-mix(in oklab,var(--sf-primary) 5%,var(--sf-card-2)) 13px 26px), var(--sf-card-2);
  display:grid; place-items:center; }
.sf1-ph::after{ content:""; position:absolute; inset:0; background:radial-gradient(120% 90% at 30% 18%, transparent 42%, color-mix(in oklab,var(--sf-secondary) 13%,transparent)); }
.sf1-ph-tag{ position:relative; z-index:1; font-family:ui-monospace,Menlo,monospace; font-size:10.5px; letter-spacing:.1em; text-transform:uppercase;
  color:color-mix(in oklab,var(--sf-secondary) 66%,var(--sf-bg)); background:color-mix(in oklab,var(--sf-bg) 84%,transparent); padding:6px 11px; border-radius:2px; border:1px solid var(--sf-line); }

@media (prefers-reduced-motion: reduce){ .sf1-root *{ transition:none !important; } }

/* container queries */
@container sf1 (min-width:760px){
  .sf1-wrap{ padding-inline:40px; }
  .sf1-nav-links{ display:flex; }
  .sf1-nav .sf1-btn{ display:inline-flex; }
  .sf1-burger{ display:none; }
  .sf1-mbar{ display:none; }
  .sf1-hero-in{ padding:96px 40px; }
  .sf1-hero-actions{ gap:16px; }
  .sf1-row{ grid-template-columns:1fr 1fr; align-items:center; gap:48px; }
  .sf1-row-media{ aspect-ratio:4/3; }
  .sf1-row:nth-child(even) .sf1-row-media{ order:2; }
  .sf1-row-body{ padding:48px 0; }
  .sf1-about{ grid-template-columns:1fr 1fr; }
  .sf1-about-media{ min-height:560px; }
  .sf1-about-body{ padding:72px 6cqw; }
  .sf1-rev-grid{ grid-template-columns:repeat(2,1fr); gap:48px; }
  .sf1-faq-in{ grid-template-columns:.7fr 1.3fr; gap:56px; }
  .sf1-foot-in{ grid-template-columns:1.2fr 2fr; gap:64px; }
  .sf1-foot-cols{ grid-template-columns:repeat(4,1fr); }
  .sf1-cta-in{ padding-block:130px; }
}
@container sf1 (min-width:1080px){
  .sf1-hero-in{ max-width:var(--wrap); margin-inline:auto; }
  .sf1-rev-grid{ grid-template-columns:repeat(2,1fr); }
}
`;
