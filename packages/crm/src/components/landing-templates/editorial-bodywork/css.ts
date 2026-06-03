/* SF4 global stylesheet — single source of truth shared by <Styles/>.
   Mobile-first; container queries on .sf4-root. Every value resolves from --sf-* vars. */
export const SF4_CSS = `
.sf4-root{
  --sf-primary-d: color-mix(in oklab, var(--sf-primary) 80%, #000);
  --sf-tint: color-mix(in oklab, var(--sf-primary) 10%, var(--sf-bg));
  --sf-card: color-mix(in oklab, var(--sf-secondary) 5%, var(--sf-bg));
  --sf-card-2: color-mix(in oklab, var(--sf-secondary) 9%, var(--sf-bg));
  --sf-ink-60: color-mix(in oklab, var(--sf-text) 55%, var(--sf-bg));
  --sf-line: color-mix(in oklab, var(--sf-text) 15%, var(--sf-bg));
  --wrap: 1220px;
  container: sf4 / inline-size;
  background: var(--sf-bg); color: var(--sf-text);
  font-family: var(--sf-font-body); font-size: 16px; line-height: 1.62;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
}
.sf4-root *{ box-sizing:border-box; }
.sf4-root img{ display:block; max-width:100%; }
.sf4-wrap{ width:100%; max-width:var(--wrap); margin-inline:auto; padding-inline:24px; }

.sf4-h2{ font-family:var(--sf-font-headline); font-weight:500; letter-spacing:-.01em; line-height:1.08; font-size:clamp(30px,6cqw,50px); margin:0; }
.sf4-h2 em{ font-style:italic; font-weight:500; }
.sf4-eyebrow{ font-weight:700; text-transform:uppercase; letter-spacing:.18em; font-size:11px; color:var(--sf-primary); margin:0 0 16px; }
.sf4-muted{ color:var(--sf-ink-60); }

/* buttons */
.sf4-btn{ display:inline-flex; align-items:center; gap:9px; font-family:var(--sf-font-body); font-weight:700;
  font-size:13.5px; letter-spacing:.02em; line-height:1; padding:14px 24px; border-radius:6px; border:1.5px solid transparent;
  cursor:pointer; text-decoration:none; white-space:nowrap; transition:background .22s, color .22s, border-color .22s, transform .16s; }
.sf4-btn svg{ font-size:17px; }
.sf4-btn:hover{ transform:translateY(-1px); }
.sf4-btn:focus-visible{ outline:2px solid var(--sf-primary); outline-offset:3px; }
.sf4-btn-primary{ background:var(--sf-primary); color:#fff; }
.sf4-btn-primary:hover{ background:var(--sf-primary-d); }
.sf4-btn-dark{ background:var(--sf-secondary); color:var(--sf-bg); }
.sf4-btn-outline{ background:transparent; color:var(--sf-text); border-color:var(--sf-line); }
.sf4-btn-outline:hover{ border-color:var(--sf-text); }
.sf4-btn-onimg{ background:transparent; color:#fff; border-color:rgba(255,255,255,.55); }
.sf4-btn-onimg:hover{ background:#fff; color:var(--sf-secondary); border-color:#fff; }
.sf4-btn-onimg-solid{ background:#fff; color:var(--sf-secondary); }
.sf4-btn-block{ width:100%; justify-content:center; }
.sf4-btn-sm{ padding:11px 18px; font-size:12.5px; }

/* nav */
.sf4-nav{ position:sticky; top:0; z-index:40; background:color-mix(in oklab,var(--sf-bg) 88%,transparent); backdrop-filter:blur(12px); border-bottom:1px solid var(--sf-line); }
.sf4-nav-in{ display:flex; align-items:center; justify-content:space-between; gap:16px; height:72px; }
.sf4-brand{ display:inline-flex; align-items:center; gap:10px; min-width:0; flex-shrink:1; text-decoration:none; color:var(--sf-text); }
.sf4-brand-mark{ flex:none; font-size:22px; color:var(--sf-primary); }
.sf4-brand-name{ font-family:var(--sf-font-headline); font-weight:500; font-size:23px; letter-spacing:.01em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sf4-nav-links{ display:none; gap:32px; }
.sf4-nav-links a{ color:var(--sf-text); text-decoration:none; font-size:14px; font-weight:600; opacity:.82; }
.sf4-nav-links a:hover{ opacity:1; color:var(--sf-primary); }
.sf4-nav-cta{ display:flex; align-items:center; gap:14px; }
.sf4-link-call{ display:none; align-items:center; gap:7px; white-space:nowrap; color:var(--sf-text); text-decoration:none; font-weight:700; font-size:13.5px; }
.sf4-link-call:hover{ color:var(--sf-primary); }
.sf4-nav .sf4-btn{ display:none; }
.sf4-burger{ display:inline-grid; place-items:center; width:44px; height:44px; border-radius:8px; background:transparent; border:1.5px solid var(--sf-line); color:var(--sf-text); font-size:22px; cursor:pointer; }

.sf4-sheet{ position:fixed; inset:0; z-index:60; background:var(--sf-bg); transform:translateY(-100%); transition:transform .32s cubic-bezier(.4,0,.2,1); display:flex; flex-direction:column; visibility:hidden; }
.sf4-sheet.is-open{ transform:translateY(0); visibility:visible; }
.sf4-sheet-top{ display:flex; align-items:center; justify-content:space-between; height:72px; }
.sf4-sheet-links{ display:flex; flex-direction:column; padding:16px 24px; }
.sf4-sheet-links a{ font-family:var(--sf-font-headline); font-weight:500; font-size:30px; color:var(--sf-text); text-decoration:none; padding:13px 0; border-bottom:1px solid var(--sf-line); }
.sf4-sheet-foot{ margin-top:auto; padding:24px; display:flex; flex-direction:column; gap:12px; }

/* hero — split-screen */
.sf4-hero{ display:grid; grid-template-columns:1fr; }
.sf4-hero-left{ position:relative; min-height:440px; display:flex; }
.sf4-hero-left .sf4-img,.sf4-hero-left .sf4-ph{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.sf4-hero-scrim{ position:absolute; inset:0; background:linear-gradient(180deg, color-mix(in oklab,var(--sf-secondary) 50%,transparent), color-mix(in oklab,var(--sf-secondary) 72%,transparent)); }
.sf4-hero-in{ position:relative; z-index:1; align-self:center; padding:56px 24px; width:100%; }
.sf4-hero-eyebrow{ color:rgba(255,255,255,.82); font-weight:700; text-transform:uppercase; letter-spacing:.18em; font-size:11px; margin:0 0 20px; }
.sf4-hero-h1{ font-family:var(--sf-font-headline); font-weight:500; color:#fff; line-height:1.04; font-size:clamp(44px,9cqw,82px); margin:0 0 22px; }
.sf4-hero-h1 em{ font-style:italic; font-weight:500; }
.sf4-hero-sub{ color:rgba(255,255,255,.88); font-size:clamp(15px,2.4cqw,18px); max-width:38ch; margin:0 0 30px; }
.sf4-hero-actions{ display:flex; flex-wrap:wrap; gap:14px; }
.sf4-hero-right{ position:relative; min-height:300px; }
.sf4-hero-right .sf4-img,.sf4-hero-right .sf4-ph{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }

/* trust */
.sf4-trust{ background:var(--sf-secondary); color:var(--sf-bg); }
.sf4-trust-in{ display:flex; flex-wrap:wrap; justify-content:center; gap:14px 0; padding-block:20px; }
.sf4-trust-item{ display:inline-flex; align-items:center; gap:10px; padding:0 26px; font-size:13px; font-weight:600; color:color-mix(in oklab,var(--sf-bg) 84%,var(--sf-secondary)); }
.sf4-trust-item + .sf4-trust-item{ border-left:1px solid color-mix(in oklab,var(--sf-bg) 20%,var(--sf-secondary)); }
.sf4-trust-item svg{ color:var(--sf-primary); font-size:15px; }
.sf4-trust-item b{ font-family:var(--sf-font-headline); font-weight:500; font-size:17px; color:var(--sf-bg); }

/* sections */
.sf4-sec{ padding-block:84px; }
.sf4-sec-head{ display:flex; flex-direction:column; gap:14px; max-width:54ch; margin-bottom:40px; }

/* treatments — numbered rows, price+duration+book each */
.sf4-treat{ border-top:1px solid var(--sf-line); }
.sf4-row{ display:grid; grid-template-columns:1fr; gap:18px; align-items:center; padding:26px 0; border-bottom:1px solid var(--sf-line); }
.sf4-row-lead{ display:flex; align-items:center; gap:20px; }
.sf4-row-thumb{ position:relative; width:84px; height:84px; flex:none; border-radius:10px; overflow:hidden; }
.sf4-row-thumb .sf4-img,.sf4-row-thumb .sf4-ph{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.sf4-row-num{ font-family:var(--sf-font-headline); font-style:italic; font-size:18px; color:var(--sf-primary); flex:none; width:34px; }
.sf4-row-info{ min-width:0; }
.sf4-row-name{ font-family:var(--sf-font-headline); font-weight:500; font-size:24px; margin:0 0 4px; letter-spacing:-.01em; }
.sf4-row-desc{ margin:0; color:var(--sf-ink-60); font-size:15px; }
.sf4-row-end{ display:flex; align-items:center; justify-content:space-between; gap:18px; padding-left:54px; }
.sf4-row-meta{ display:flex; flex-direction:column; gap:2px; }
.sf4-row-price{ font-family:var(--sf-font-headline); font-weight:500; font-size:22px; }
.sf4-row-dur{ display:inline-flex; align-items:center; gap:6px; white-space:nowrap; color:var(--sf-ink-60); font-size:13px; font-weight:600; }
.sf4-row-dur svg{ color:var(--sf-primary); font-size:14px; }

/* about — split editorial */
.sf4-about{ display:grid; grid-template-columns:1fr; gap:34px; align-items:center; }
.sf4-about-media{ position:relative; aspect-ratio:4/5; overflow:hidden; border-radius:12px; }
.sf4-about-media .sf4-img,.sf4-about-media .sf4-ph{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.sf4-about-text{ margin:0 0 20px; font-size:18px; color:var(--sf-text); max-width:48ch; line-height:1.72; }
.sf4-about-text em{ font-family:var(--sf-font-headline); font-style:italic; font-size:1.05em; }
.sf4-creds{ list-style:none; padding:20px 0 22px; margin:0; display:flex; flex-wrap:wrap; gap:10px; border-top:1px solid var(--sf-line); }
.sf4-creds li{ display:inline-flex; align-items:center; gap:8px; background:var(--sf-tint); border-radius:999px; padding:9px 15px; font-weight:600; font-size:13px; }
.sf4-creds svg{ color:var(--sf-primary); }

/* stats */
.sf4-stats{ background:var(--sf-card-2); }
.sf4-stats-in{ display:flex; flex-wrap:wrap; gap:28px 56px; justify-content:center; padding-block:50px; }
.sf4-stat{ text-align:center; }
.sf4-stat-n{ display:block; font-family:var(--sf-font-headline); font-weight:500; font-size:clamp(36px,6cqw,52px); line-height:1; color:var(--sf-primary); }
.sf4-stat-l{ display:block; margin-top:6px; font-size:13px; font-weight:600; color:var(--sf-ink-60); }

/* testimonials */
.sf4-rev-grid{ display:grid; grid-template-columns:1fr; gap:20px; }
.sf4-rev{ background:var(--sf-card); border:1px solid var(--sf-line); border-radius:14px; padding:30px; margin:0; display:flex; flex-direction:column; gap:16px; }
.sf4-rev-stars{ color:var(--sf-primary); font-size:14px; }
.sf4-rev blockquote{ margin:0; font-family:var(--sf-font-headline); font-weight:500; font-size:20px; line-height:1.45; }
.sf4-rev figcaption{ font-weight:700; font-size:14px; color:var(--sf-ink-60); }

/* faq */
.sf4-faq-in{ display:grid; grid-template-columns:1fr; gap:30px; }
.sf4-faq-list{ border-top:1px solid var(--sf-line); }
.sf4-faq-item{ border-bottom:1px solid var(--sf-line); }
.sf4-faq-q{ width:100%; display:flex; align-items:center; justify-content:space-between; gap:18px; background:none; border:0; cursor:pointer; text-align:left; padding:24px 2px; font-family:var(--sf-font-headline); font-weight:500; font-size:20px; color:var(--sf-text); }
.sf4-faq-chev{ flex:none; font-size:21px; color:var(--sf-primary); transition:transform .25s; }
.sf4-faq-item.is-open .sf4-faq-chev{ transform:rotate(180deg); }
.sf4-faq-a{ display:grid; grid-template-rows:0fr; transition:grid-template-rows .28s; }
.sf4-faq-item.is-open .sf4-faq-a{ grid-template-rows:1fr; }
.sf4-faq-a > p{ overflow:hidden; margin:0; color:var(--sf-ink-60); font-size:16px; max-width:60ch; padding-bottom:0; transition:padding-bottom .28s; }
.sf4-faq-item.is-open .sf4-faq-a > p{ padding-bottom:24px; }

/* cta */
.sf4-cta{ position:relative; overflow:hidden; }
.sf4-cta-media{ position:absolute; inset:0; }
.sf4-cta-media .sf4-img,.sf4-cta-media .sf4-ph{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.sf4-cta-scrim{ position:absolute; inset:0; background:linear-gradient(90deg,color-mix(in oklab,var(--sf-secondary) 84%,transparent),color-mix(in oklab,var(--sf-secondary) 56%,transparent)); }
.sf4-cta-in{ position:relative; padding-block:104px; }
.sf4-cta-h{ font-family:var(--sf-font-headline); font-weight:500; color:#fff; line-height:1.06; font-size:clamp(34px,7cqw,58px); margin:0 0 14px; max-width:18ch; }
.sf4-cta-h em{ font-style:italic; }
.sf4-cta-sub{ color:rgba(255,255,255,.86); font-size:18px; margin:0 0 28px; max-width:42ch; }

/* footer */
.sf4-foot{ background:var(--sf-secondary); color:var(--sf-bg); padding-top:66px; }
.sf4-foot-in{ display:grid; grid-template-columns:1fr; gap:40px; padding-bottom:48px; }
.sf4-foot-brand .sf4-brand-name{ color:var(--sf-bg); }
.sf4-foot-brand .sf4-brand-mark{ color:var(--sf-primary); }
.sf4-foot-tag{ color:color-mix(in oklab,var(--sf-bg) 66%,var(--sf-secondary)); margin:16px 0 22px; max-width:34ch; }
.sf4-foot-cols{ display:grid; grid-template-columns:1fr 1fr; gap:32px 24px; }
.sf4-foot-col h3{ font-size:11px; letter-spacing:.16em; text-transform:uppercase; color:var(--sf-primary); margin:0 0 14px; }
.sf4-foot-col ul{ list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:10px; }
.sf4-foot-col li,.sf4-foot-col a{ color:color-mix(in oklab,var(--sf-bg) 78%,var(--sf-secondary)); font-size:14px; text-decoration:none; }
.sf4-foot-col a:hover{ color:#fff; }
.sf4-foot-legal{ display:flex; flex-wrap:wrap; gap:8px 20px; justify-content:space-between; border-top:1px solid color-mix(in oklab,var(--sf-bg) 16%,var(--sf-secondary)); padding-block:22px; font-size:12.5px; color:color-mix(in oklab,var(--sf-bg) 56%,var(--sf-secondary)); }

/* mobile bar */
.sf4-mbar{ position:sticky; bottom:0; z-index:50; display:flex; gap:10px; padding:12px 16px calc(12px + env(safe-area-inset-bottom)); background:color-mix(in oklab,var(--sf-bg) 93%,transparent); backdrop-filter:blur(10px); border-top:1px solid var(--sf-line); }
.sf4-mbar-call{ display:inline-flex; align-items:center; justify-content:center; gap:8px; padding:14px 20px; border-radius:8px; border:1.5px solid var(--sf-line); color:var(--sf-text); text-decoration:none; font-weight:700; }
.sf4-mbar-book{ flex:1; display:inline-flex; align-items:center; justify-content:center; padding:14px 20px; border-radius:8px; background:var(--sf-primary); color:#fff; text-decoration:none; font-weight:700; }

/* placeholder + image */
.sf4-img{ width:100%; height:100%; object-fit:cover; }
.sf4-ph{ position:relative; width:100%; height:100%; min-height:120px; overflow:hidden;
  background: repeating-linear-gradient(135deg, color-mix(in oklab,var(--sf-primary) 14%,var(--sf-card)) 0 14px, color-mix(in oklab,var(--sf-primary) 6%,var(--sf-card)) 14px 28px), var(--sf-card-2);
  display:grid; place-items:center; }
.sf4-ph::after{ content:""; position:absolute; inset:0; background:radial-gradient(120% 90% at 30% 20%, transparent 42%, color-mix(in oklab,var(--sf-secondary) 14%,transparent)); }
.sf4-ph-tag{ position:relative; z-index:1; font-family:ui-monospace,Menlo,monospace; font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:color-mix(in oklab,var(--sf-secondary) 64%,var(--sf-bg)); background:color-mix(in oklab,var(--sf-bg) 84%,transparent); padding:5px 10px; border-radius:4px; border:1px solid var(--sf-line); text-align:center; }

@media (prefers-reduced-motion: reduce){ .sf4-root *{ transition:none !important; } }

/* container queries */
@container sf4 (min-width:760px){
  .sf4-wrap{ padding-inline:40px; }
  .sf4-nav-links{ display:flex; }
  .sf4-link-call{ display:inline-flex; }
  .sf4-nav .sf4-btn{ display:inline-flex; }
  .sf4-burger{ display:none; }
  .sf4-mbar{ display:none; }
  .sf4-hero{ grid-template-columns:1.1fr .9fr; }
  .sf4-hero-left{ min-height:78cqh; }
  .sf4-hero-in{ padding:80px max(40px,calc((100cqw - var(--wrap))/2 + 40px)) 80px; }
  .sf4-hero-right{ min-height:auto; }
  .sf4-row{ grid-template-columns:1.5fr 1fr; gap:30px; }
  .sf4-row-end{ justify-content:flex-end; padding-left:0; }
  .sf4-about{ grid-template-columns:.85fr 1.15fr; gap:56px; }
  .sf4-about-media{ aspect-ratio:4/5; }
  .sf4-rev-grid{ grid-template-columns:repeat(2,1fr); gap:24px; }
  .sf4-faq-in{ grid-template-columns:.8fr 1.2fr; gap:52px; }
  .sf4-foot-in{ grid-template-columns:1.2fr 2fr; gap:60px; }
  .sf4-foot-cols{ grid-template-columns:repeat(4,1fr); }
  .sf4-cta-in{ padding-block:130px; }
}
@container sf4 (min-width:1040px){
  .sf4-rev-grid{ grid-template-columns:repeat(2,1fr); }
}
`;
