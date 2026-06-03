/* SF2 global stylesheet — single source of truth shared by <Styles/>.
   Mobile-first; container queries on .sf2-root. Every value resolves from --sf-* vars. */
export const SF2_CSS = `
.sf2-root{
  --sf-primary-d: color-mix(in oklab, var(--sf-primary) 78%, #000);
  --sf-primary-soft: color-mix(in oklab, var(--sf-primary) 16%, var(--sf-bg));
  --sf-primary-tint: color-mix(in oklab, var(--sf-primary) 9%, var(--sf-bg));
  --sf-card: color-mix(in oklab, var(--sf-secondary) 4%, var(--sf-bg));
  --sf-ink-60: color-mix(in oklab, var(--sf-text) 56%, var(--sf-bg));
  --sf-line: color-mix(in oklab, var(--sf-text) 13%, var(--sf-bg));
  --wrap: 1180px;
  container: sf2 / inline-size;
  background: var(--sf-bg); color: var(--sf-text);
  font-family: var(--sf-font-body); font-size: 16px; line-height: 1.6;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
}
.sf2-root *{ box-sizing:border-box; }
.sf2-root img{ display:block; max-width:100%; }
.sf2-wrap{ width:100%; max-width:var(--wrap); margin-inline:auto; padding-inline:22px; }

.sf2-h2{ font-family:var(--sf-font-headline); font-weight:600; letter-spacing:-.01em; line-height:1.08; font-size:clamp(30px,6.6cqw,50px); margin:0; }
.sf2-eyebrow{ font-weight:800; text-transform:uppercase; letter-spacing:.16em; font-size:11.5px; color:var(--sf-primary); margin:0 0 16px; }
.sf2-muted{ color:var(--sf-ink-60); }

/* buttons — soft pills */
.sf2-btn{ display:inline-flex; align-items:center; gap:9px; font-family:var(--sf-font-body); font-weight:800;
  font-size:14.5px; line-height:1; padding:14px 24px; border-radius:999px; border:2px solid transparent; cursor:pointer;
  text-decoration:none; white-space:nowrap; transition:transform .16s, background .2s, color .2s, box-shadow .25s; }
.sf2-btn svg{ font-size:18px; }
.sf2-btn:hover{ transform:translateY(-2px); }
.sf2-btn:focus-visible{ outline:3px solid var(--sf-primary); outline-offset:2px; }
.sf2-btn-primary{ background:var(--sf-primary); color:#fff; box-shadow:0 12px 24px -12px color-mix(in oklab,var(--sf-primary) 70%,transparent); }
.sf2-btn-primary:hover{ background:var(--sf-primary-d); }
.sf2-btn-dark{ background:var(--sf-secondary); color:var(--sf-bg); }
.sf2-btn-soft{ background:var(--sf-primary-soft); color:var(--sf-primary-d); }
.sf2-btn-soft:hover{ background:color-mix(in oklab,var(--sf-primary) 24%,var(--sf-bg)); }
.sf2-btn-ghost{ background:transparent; color:var(--sf-text); border-color:var(--sf-line); }
.sf2-btn-block{ width:100%; justify-content:center; }

/* nav */
.sf2-nav{ position:sticky; top:0; z-index:40; background:color-mix(in oklab,var(--sf-bg) 85%,transparent); backdrop-filter:blur(12px); }
.sf2-nav-in{ display:flex; align-items:center; justify-content:space-between; gap:14px; height:76px; }
.sf2-brand{ display:inline-flex; align-items:center; gap:11px; min-width:0; flex-shrink:1; text-decoration:none; color:var(--sf-text); }
.sf2-brand-mark{ flex:none; width:40px; height:40px; border-radius:50%; background:var(--sf-primary-soft); color:var(--sf-primary-d);
  display:grid; place-items:center; font-family:var(--sf-font-headline); font-weight:700; font-size:19px; }
.sf2-brand-name{ font-family:var(--sf-font-headline); font-weight:600; font-size:21px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sf2-nav-mid{ display:none; align-items:center; gap:28px; }
.sf2-nav-mid a{ color:var(--sf-text); text-decoration:none; font-weight:700; font-size:14.5px; opacity:.82; }
.sf2-nav-mid a:hover{ opacity:1; color:var(--sf-primary); }
.sf2-promo{ display:none; align-items:center; gap:7px; background:var(--sf-primary-soft); color:var(--sf-primary-d);
  font-weight:800; font-size:12px; letter-spacing:.04em; padding:9px 15px; border-radius:999px; text-transform:uppercase; }
.sf2-nav-cta{ display:flex; align-items:center; gap:12px; }
.sf2-nav .sf2-btn-primary{ display:none; }
.sf2-burger{ display:inline-grid; place-items:center; width:44px; height:44px; border-radius:50%; background:var(--sf-card); border:1.5px solid var(--sf-line); color:var(--sf-text); font-size:22px; cursor:pointer; }

.sf2-sheet{ position:fixed; inset:0; z-index:60; background:var(--sf-bg); transform:translateY(-100%); transition:transform .32s cubic-bezier(.4,0,.2,1); display:flex; flex-direction:column; visibility:hidden; }
.sf2-sheet.is-open{ transform:translateY(0); visibility:visible; }
.sf2-sheet-top{ display:flex; align-items:center; justify-content:space-between; height:76px; }
.sf2-sheet-links{ display:flex; flex-direction:column; padding:14px 24px; }
.sf2-sheet-links a{ font-family:var(--sf-font-headline); font-weight:600; font-size:30px; color:var(--sf-text); text-decoration:none; padding:13px 0; border-bottom:1px solid var(--sf-line); }
.sf2-sheet-foot{ margin-top:auto; padding:24px; display:flex; flex-direction:column; gap:12px; }

/* hero — split, soft */
.sf2-hero{ display:grid; grid-template-columns:1fr; gap:0; align-items:center; }
.sf2-hero-body{ padding:40px 22px 24px; }
.sf2-hero-h1{ font-family:var(--sf-font-headline); font-weight:600; line-height:1.05; letter-spacing:-.015em; font-size:clamp(38px,10cqw,68px); margin:0 0 20px; text-wrap:balance; }
.sf2-hero-sub{ color:var(--sf-ink-60); font-size:clamp(16px,3cqw,19px); max-width:44ch; margin:0 0 28px; }
.sf2-hero-actions{ display:flex; flex-wrap:wrap; gap:12px; align-items:center; }
.sf2-hero-note{ font-weight:800; font-size:13px; color:var(--sf-primary); display:inline-flex; align-items:center; gap:7px; }
.sf2-hero-chips{ list-style:none; display:flex; flex-wrap:wrap; gap:10px 12px; margin:30px 0 0; padding:0; }
.sf2-hero-chips li{ display:inline-flex; align-items:center; gap:8px; background:var(--sf-card); border:1px solid var(--sf-line); border-radius:999px; padding:9px 16px; font-weight:700; font-size:13.5px; }
.sf2-hero-chips svg{ color:var(--sf-primary); font-size:16px; }
.sf2-hero-chips b{ font-weight:800; }
.sf2-hero-media{ position:relative; padding:0 22px 36px; }
.sf2-hero-photo{ position:relative; border-radius:28px; overflow:hidden; aspect-ratio:4/5; box-shadow:0 30px 60px -34px color-mix(in oklab,var(--sf-secondary) 60%,transparent); }
.sf2-hero-photo .sf2-img,.sf2-hero-photo .sf2-ph{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.sf2-hero-badge{ position:absolute; left:18px; bottom:18px; background:color-mix(in oklab,var(--sf-bg) 92%,transparent); backdrop-filter:blur(6px);
  border-radius:18px; padding:13px 17px; display:flex; align-items:center; gap:11px; box-shadow:0 14px 30px -16px color-mix(in oklab,var(--sf-secondary) 60%,transparent); }
.sf2-hero-badge .sf2-stars{ color:var(--sf-primary); font-size:13px; }
.sf2-hero-badge b{ font-family:var(--sf-font-headline); font-size:17px; }
.sf2-hero-badge small{ display:block; font-size:11.5px; color:var(--sf-ink-60); }

/* trust */
.sf2-trust{ background:var(--sf-primary-tint); }
.sf2-trust-in{ display:flex; flex-wrap:wrap; justify-content:center; gap:12px 14px; padding-block:24px; }
.sf2-trust-item{ display:inline-flex; align-items:center; gap:9px; font-weight:700; font-size:13.5px; color:var(--sf-text); }
.sf2-trust-item svg{ color:var(--sf-primary); font-size:17px; }
.sf2-trust-item .sf2-lead{ font-family:var(--sf-font-headline); font-weight:700; color:var(--sf-primary); font-size:17px; }
.sf2-trust-dot{ width:4px; height:4px; border-radius:50%; background:var(--sf-line); }

/* sections */
.sf2-sec{ padding-block:80px; }
.sf2-sec-head{ display:flex; flex-direction:column; gap:14px; max-width:54ch; margin-bottom:36px; }

/* services — rounded varied cards */
.sf2-svc-grid{ display:grid; grid-template-columns:1fr; gap:18px; }
.sf2-svc{ background:var(--sf-card); border:1px solid var(--sf-line); border-radius:24px; overflow:hidden; display:flex; flex-direction:column; transition:transform .18s, box-shadow .25s; }
.sf2-svc:hover{ transform:translateY(-4px); box-shadow:0 26px 50px -30px color-mix(in oklab,var(--sf-secondary) 55%,transparent); }
.sf2-svc-media{ position:relative; aspect-ratio:5/4; }
.sf2-svc-media .sf2-img,.sf2-svc-media .sf2-ph{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.sf2-svc-body{ padding:24px; display:flex; flex-direction:column; gap:11px; flex:1; }
.sf2-svc-name{ font-family:var(--sf-font-headline); font-weight:600; font-size:23px; margin:0; }
.sf2-svc-desc{ margin:0; color:var(--sf-ink-60); font-size:15px; }
.sf2-svc-meta{ display:flex; align-items:center; gap:14px; margin-top:auto; padding-top:6px; }
.sf2-svc-meta .sf2-price{ font-family:var(--sf-font-headline); font-weight:700; font-size:20px; }
.sf2-svc-meta .sf2-dur{ display:inline-flex; align-items:center; gap:6px; white-space:nowrap; color:var(--sf-ink-60); font-weight:700; font-size:13.5px; }
.sf2-svc-meta .sf2-price{ white-space:nowrap; }
.sf2-svc-meta svg{ color:var(--sf-primary); font-size:15px; }
.sf2-svc .sf2-btn{ margin-top:4px; }
.sf2-svc--wide .sf2-btn{ align-self:flex-start; }

/* about — Hi, I'm … */
.sf2-about{ display:grid; grid-template-columns:1fr; gap:30px; align-items:center; }
.sf2-about-media{ position:relative; border-radius:28px; overflow:hidden; aspect-ratio:4/5; box-shadow:0 30px 60px -34px color-mix(in oklab,var(--sf-secondary) 55%,transparent); }
.sf2-about-media .sf2-img,.sf2-about-media .sf2-ph{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.sf2-about-hi{ font-family:var(--sf-font-headline); font-weight:600; font-size:clamp(30px,5.4cqw,46px); margin:0 0 16px; line-height:1.1; }
.sf2-about-text{ margin:0 0 18px; font-size:17px; color:var(--sf-text); max-width:50ch; }
.sf2-creds{ list-style:none; padding:0; margin:0 0 22px; display:flex; flex-wrap:wrap; gap:10px; }
.sf2-creds li{ display:inline-flex; align-items:center; gap:8px; background:var(--sf-primary-tint); border-radius:999px; padding:9px 15px; font-weight:700; font-size:13px; }
.sf2-creds svg{ color:var(--sf-primary); }

/* stats */
.sf2-stats-in{ display:grid; grid-template-columns:repeat(2,1fr); gap:18px; }
.sf2-stat{ background:var(--sf-primary-tint); border-radius:22px; padding:28px 24px; text-align:center; }
.sf2-stat-n{ display:block; font-family:var(--sf-font-headline); font-weight:700; font-size:clamp(34px,6cqw,48px); line-height:1; color:var(--sf-primary); }
.sf2-stat-l{ display:block; margin-top:8px; font-size:13px; font-weight:700; color:var(--sf-ink-60); }

/* testimonials */
.sf2-rev-grid{ display:grid; grid-template-columns:1fr; gap:18px; }
.sf2-rev{ background:var(--sf-card); border:1px solid var(--sf-line); border-radius:24px; padding:28px; margin:0; display:flex; flex-direction:column; gap:15px; }
.sf2-rev-stars{ color:var(--sf-primary); font-size:14px; }
.sf2-rev blockquote{ margin:0; font-size:17px; line-height:1.55; }
.sf2-rev figcaption{ display:flex; align-items:center; gap:11px; font-weight:800; font-size:14px; }
.sf2-rev-av{ width:38px; height:38px; border-radius:50%; background:var(--sf-primary-soft); color:var(--sf-primary-d); display:grid; place-items:center; font-family:var(--sf-font-headline); font-weight:700; }

/* faq */
.sf2-faq-in{ display:grid; grid-template-columns:1fr; gap:30px; }
.sf2-faq-list{ display:flex; flex-direction:column; gap:12px; }
.sf2-faq-item{ background:var(--sf-card); border:1px solid var(--sf-line); border-radius:18px; overflow:hidden; }
.sf2-faq-item.is-open{ border-color:color-mix(in oklab,var(--sf-primary) 40%,var(--sf-line)); }
.sf2-faq-q{ width:100%; display:flex; align-items:center; justify-content:space-between; gap:16px; background:none; border:0; cursor:pointer; text-align:left; padding:20px 22px; font-family:var(--sf-font-headline); font-weight:600; font-size:18.5px; color:var(--sf-text); }
.sf2-faq-chev{ flex:none; font-size:21px; color:var(--sf-primary); transition:transform .25s; }
.sf2-faq-item.is-open .sf2-faq-chev{ transform:rotate(180deg); }
.sf2-faq-a{ display:grid; grid-template-rows:0fr; transition:grid-template-rows .28s; }
.sf2-faq-item.is-open .sf2-faq-a{ grid-template-rows:1fr; }
.sf2-faq-a > p{ overflow:hidden; margin:0; color:var(--sf-ink-60); font-size:15.5px; padding:0 22px; transition:padding .28s; }
.sf2-faq-item.is-open .sf2-faq-a > p{ padding:0 22px 22px; }

/* cta */
.sf2-cta{ padding-block:30px; }
.sf2-cta-card{ position:relative; overflow:hidden; border-radius:34px; padding:60px 28px; background:var(--sf-primary); color:#fff; text-align:center; }
.sf2-cta-card::after{ content:""; position:absolute; right:-60px; top:-60px; width:240px; height:240px; border-radius:50%; background:color-mix(in oklab,#fff 14%,transparent); }
.sf2-cta-card::before{ content:""; position:absolute; left:-50px; bottom:-70px; width:200px; height:200px; border-radius:50%; background:color-mix(in oklab,#fff 10%,transparent); }
.sf2-cta-h{ position:relative; font-family:var(--sf-font-headline); font-weight:600; line-height:1.06; font-size:clamp(30px,6cqw,50px); margin:0 0 14px; }
.sf2-cta-sub{ position:relative; color:rgba(255,255,255,.9); font-size:18px; margin:0 auto 26px; max-width:42ch; }
.sf2-cta-actions{ position:relative; display:flex; flex-wrap:wrap; gap:12px; justify-content:center; }
.sf2-btn-onrose{ background:#fff; color:var(--sf-primary-d); }
.sf2-btn-onrose-out{ background:transparent; color:#fff; border-color:rgba(255,255,255,.6); }

/* footer */
.sf2-foot{ background:var(--sf-secondary); color:var(--sf-bg); padding-top:64px; }
.sf2-foot-in{ display:grid; grid-template-columns:1fr; gap:40px; padding-bottom:46px; }
.sf2-foot-brand .sf2-brand-name{ color:var(--sf-bg); }
.sf2-foot-tag{ color:color-mix(in oklab,var(--sf-bg) 70%,var(--sf-secondary)); margin:16px 0 22px; max-width:34ch; }
.sf2-foot-cols{ display:grid; grid-template-columns:1fr 1fr; gap:32px 24px; }
.sf2-foot-col h3{ font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--sf-primary); margin:0 0 14px; }
.sf2-foot-col ul{ list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:10px; }
.sf2-foot-col li,.sf2-foot-col a{ color:color-mix(in oklab,var(--sf-bg) 80%,var(--sf-secondary)); font-size:14px; text-decoration:none; }
.sf2-foot-col a:hover{ color:#fff; }
.sf2-foot-legal{ display:flex; flex-wrap:wrap; gap:8px 20px; justify-content:space-between; border-top:1px solid color-mix(in oklab,var(--sf-bg) 16%,var(--sf-secondary)); padding-block:22px; font-size:12.5px; color:color-mix(in oklab,var(--sf-bg) 58%,var(--sf-secondary)); }

/* mobile bar */
.sf2-mbar{ position:sticky; bottom:0; z-index:50; display:flex; gap:10px; padding:12px 16px calc(12px + env(safe-area-inset-bottom)); background:color-mix(in oklab,var(--sf-bg) 93%,transparent); backdrop-filter:blur(10px); border-top:1px solid var(--sf-line); }
.sf2-mbar-call{ display:inline-flex; align-items:center; justify-content:center; gap:8px; padding:14px 20px; border-radius:999px; border:2px solid var(--sf-line); color:var(--sf-text); text-decoration:none; font-weight:800; }
.sf2-mbar-book{ flex:1; display:inline-flex; align-items:center; justify-content:center; padding:14px 20px; border-radius:999px; background:var(--sf-primary); color:#fff; text-decoration:none; font-weight:800; }

/* placeholder + image */
.sf2-img{ width:100%; height:100%; object-fit:cover; }
.sf2-ph{ position:relative; width:100%; height:100%; min-height:160px; overflow:hidden;
  background: repeating-linear-gradient(135deg, color-mix(in oklab,var(--sf-primary) 15%,var(--sf-card)) 0 14px, color-mix(in oklab,var(--sf-primary) 6%,var(--sf-card)) 14px 28px), var(--sf-card);
  display:grid; place-items:center; }
.sf2-ph::after{ content:""; position:absolute; inset:0; background:radial-gradient(120% 90% at 32% 20%, transparent 44%, color-mix(in oklab,var(--sf-secondary) 11%,transparent)); }
.sf2-ph-tag{ position:relative; z-index:1; font-family:ui-monospace,Menlo,monospace; font-size:10.5px; letter-spacing:.08em; text-transform:uppercase; color:color-mix(in oklab,var(--sf-secondary) 62%,var(--sf-bg)); background:color-mix(in oklab,var(--sf-bg) 84%,transparent); padding:6px 11px; border-radius:999px; border:1px solid var(--sf-line); }

@media (prefers-reduced-motion: reduce){ .sf2-root *{ transition:none !important; } }

/* container queries */
@container sf2 (min-width:720px){
  .sf2-wrap{ padding-inline:36px; }
  .sf2-nav-mid{ display:flex; }
  .sf2-promo{ display:inline-flex; }
  .sf2-nav .sf2-btn-primary{ display:inline-flex; }
  .sf2-burger{ display:none; }
  .sf2-mbar{ display:none; }
  .sf2-hero{ grid-template-columns:1.02fr .98fr; gap:24px; }
  .sf2-hero-body{ padding:72px 16px 72px max(36px,calc((100cqw - var(--wrap))/2 + 36px)); }
  .sf2-hero-media{ padding:48px max(36px,calc((100cqw - var(--wrap))/2 + 36px)) 48px 0; }
  .sf2-svc-grid{ grid-template-columns:1fr 1fr; }
  .sf2-svc--wide{ grid-column:1 / -1; flex-direction:row; }
  .sf2-svc--wide .sf2-svc-media{ flex:1; aspect-ratio:auto; min-height:280px; }
  .sf2-svc--wide .sf2-svc-body{ flex:1.1; padding:34px; }
  .sf2-about{ grid-template-columns:.9fr 1.1fr; gap:48px; }
  .sf2-stats-in{ grid-template-columns:repeat(4,1fr); }
  .sf2-rev-grid{ grid-template-columns:repeat(3,1fr); }
  .sf2-faq-in{ grid-template-columns:.8fr 1.2fr; gap:48px; }
  .sf2-foot-in{ grid-template-columns:1.2fr 2fr; gap:60px; }
  .sf2-foot-cols{ grid-template-columns:repeat(4,1fr); }
  .sf2-cta-card{ padding:84px 40px; }
}
@container sf2 (min-width:1040px){
  .sf2-hero-h1{ font-size:clamp(48px,5.4cqw,68px); }
  .sf2-svc-grid{ grid-template-columns:repeat(3,1fr); }
}
`;
