/* SF5 global stylesheet â€” single source of truth, shared by <Styles/>.
   Mobile-first; container queries on .sf5-root so the layout reflows by
   available width (works for desktop, tablet, and embedded/preview contexts).
   Every value resolves from --sf-* theme variables â€” no hardcoded brand color. */
export const SF5_CSS = `
.sf5-root{
  /* tints derived from theme vars â€” never hardcoded */
  --sf-primary-d: color-mix(in oklab, var(--sf-primary) 82%, #000);
  --sf-primary-12: color-mix(in oklab, var(--sf-primary) 12%, var(--sf-bg));
  --sf-card: color-mix(in oklab, var(--sf-secondary) 6%, var(--sf-bg));
  --sf-card-2: color-mix(in oklab, var(--sf-secondary) 11%, var(--sf-bg));
  --sf-ink-60: color-mix(in oklab, var(--sf-text) 62%, var(--sf-bg));
  --sf-onp: color-mix(in oklab, var(--sf-bg) 92%, var(--sf-primary));
  --sf-onp-60: color-mix(in oklab, var(--sf-bg) 70%, var(--sf-primary));
  --wrap: 1200px;
  container: sf5 / inline-size;
  background: var(--sf-bg); color: var(--sf-text);
  font-family: var(--sf-font-body);
  font-size: 16px; line-height: 1.55; -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
.sf5-root *{ box-sizing: border-box; }
.sf5-root img{ display:block; max-width:100%; }
.sf5-wrap{ width:100%; max-width:var(--wrap); margin-inline:auto; padding-inline:20px; }

/* ---- type ---- */
.sf5-h2{ font-family:var(--sf-font-headline); font-weight:700; letter-spacing:-.02em;
  line-height:1.02; font-size:clamp(30px,8cqw,52px); margin:0; color:var(--sf-text); }
.sf5-eyebrow{ font-family:var(--sf-font-body); font-weight:700; text-transform:uppercase;
  letter-spacing:.14em; font-size:12px; color:var(--sf-primary); margin:0 0 14px; }
.sf5-muted{ color:var(--sf-ink-60); }

/* ---- buttons ---- */
.sf5-btn{ --b:var(--sf-secondary); display:inline-flex; align-items:center; gap:9px;
  font-family:var(--sf-font-body); font-weight:700; font-size:15px; line-height:1;
  padding:13px 22px; border-radius:999px; border:1.5px solid transparent; cursor:pointer;
  text-decoration:none; white-space:nowrap; transition:transform .15s ease, background .2s ease, color .2s ease, box-shadow .2s; }
.sf5-btn svg{ font-size:18px; }
.sf5-btn:hover{ transform:translateY(-1px); }
.sf5-btn:focus-visible{ outline:3px solid var(--sf-primary); outline-offset:2px; }
.sf5-btn-lg{ padding:16px 28px; font-size:16px; }
.sf5-btn-block{ width:100%; justify-content:center; }
.sf5-btn-primary{ background:var(--sf-primary); color:#fff; }
.sf5-btn-primary:hover{ background:var(--sf-primary-d); }
.sf5-btn-secondary{ background:var(--sf-secondary); color:var(--sf-bg); }
.sf5-btn-outline{ background:transparent; color:var(--sf-text); border-color:color-mix(in oklab,var(--sf-text) 30%,transparent); }
.sf5-btn-outline:hover{ border-color:var(--sf-text); }
.sf5-btn-ghost{ background:transparent; color:var(--sf-text); border-color:var(--sf-border); }
.sf5-btn-on-primary{ background:var(--sf-bg); color:var(--sf-secondary); }
.sf5-btn-on-dark{ background:transparent; color:#fff; border-color:color-mix(in oklab,#fff 45%,transparent); }
.sf5-btn-on-dark:hover{ border-color:#fff; }

/* ---- nav ---- */
.sf5-nav{ position:sticky; top:0; z-index:40; background:color-mix(in oklab,var(--sf-bg) 86%,transparent);
  backdrop-filter:blur(10px); border-bottom:1px solid var(--sf-border); }
.sf5-nav-in{ display:flex; align-items:center; justify-content:space-between; gap:16px; height:70px; }
.sf5-brand{ display:inline-flex; align-items:center; gap:10px; min-width:0; flex-shrink:1; font-family:var(--sf-font-headline);
  font-weight:700; font-size:19px; letter-spacing:-.01em; color:var(--sf-text); text-decoration:none; }
.sf5-brand > span{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sf5-brand-mark{ flex:none; font-size:22px; color:var(--sf-primary); }
.sf5-nav-links{ display:none; gap:30px; }
.sf5-nav-links a{ color:var(--sf-text); text-decoration:none; font-weight:600; font-size:15px; opacity:.85; }
.sf5-nav-links a:hover{ opacity:1; color:var(--sf-primary); }
.sf5-nav-cta{ display:flex; align-items:center; gap:14px; }
.sf5-link-call{ display:none; align-items:center; gap:7px; white-space:nowrap; color:var(--sf-text); text-decoration:none; font-weight:700; font-size:14px; }
.sf5-link-call:hover{ color:var(--sf-primary); }
.sf5-nav .sf5-btn-primary{ display:none; }
.sf5-burger{ display:inline-grid; place-items:center; width:42px; height:42px; border-radius:12px;
  background:transparent; border:1.5px solid var(--sf-border); color:var(--sf-text); font-size:22px; cursor:pointer; }

/* mobile sheet */
.sf5-sheet{ position:fixed; inset:0; z-index:60; background:var(--sf-bg); transform:translateY(-100%);
  transition:transform .3s cubic-bezier(.4,0,.2,1); display:flex; flex-direction:column; visibility:hidden; }
.sf5-sheet.is-open{ transform:translateY(0); visibility:visible; }
.sf5-sheet-top{ display:flex; align-items:center; justify-content:space-between; height:70px; }
.sf5-sheet-links{ display:flex; flex-direction:column; gap:4px; padding:18px 24px; }
.sf5-sheet-links a{ font-family:var(--sf-font-headline); font-weight:600; font-size:30px; color:var(--sf-text);
  text-decoration:none; padding:12px 0; border-bottom:1px solid var(--sf-border); }
.sf5-sheet-foot{ margin-top:auto; padding:24px; display:flex; flex-direction:column; gap:12px; }

/* ---- hero (mobile-first: stacked) ---- */
.sf5-hero{ position:relative; display:flex; flex-direction:column; }
.sf5-hero-media{ position:relative; min-height:340px; }
.sf5-hero-img,.sf5-hero-media .sf5-ph,.sf5-hero-media .sf5-img{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.sf5-hero-scrim{ position:absolute; inset:0; background:linear-gradient(180deg,color-mix(in oklab,var(--sf-secondary) 30%,transparent),color-mix(in oklab,var(--sf-secondary) 8%,transparent)); }
.sf5-hero-body{ padding:34px 20px 40px; }
.sf5-eyebrow{}
.sf5-hero-h1{ font-family:var(--sf-font-headline); font-weight:700; letter-spacing:-.025em; line-height:1.0;
  font-size:clamp(38px,12cqw,76px); margin:0 0 18px; color:var(--sf-text); text-wrap:balance; }
.sf5-hero-sub{ font-size:clamp(16px,4cqw,19px); color:var(--sf-ink-60); max-width:46ch; margin:0 0 26px; }
.sf5-hero-actions{ display:flex; flex-wrap:wrap; gap:12px; }
.sf5-hero-chips{ list-style:none; display:flex; flex-wrap:wrap; gap:10px 22px; margin:28px 0 0; padding:0; }
.sf5-hero-chips li{ display:inline-flex; align-items:center; gap:8px; font-weight:600; font-size:14px; }
.sf5-hero-chips b{ font-weight:800; }
.sf5-stars{ color:var(--sf-primary); display:inline-flex; }
.sf5-chip-ic{ color:var(--sf-primary); font-size:16px; }

/* ---- trust strip ---- */
.sf5-trust{ border-top:1px solid var(--sf-border); border-bottom:1px solid var(--sf-border); background:var(--sf-card); }
.sf5-trust-in{ display:flex; flex-wrap:wrap; gap:18px 40px; padding-block:22px; }
.sf5-trust-item{ display:flex; align-items:center; gap:11px; }
.sf5-trust-lead{ font-family:var(--sf-font-headline); font-weight:800; font-size:20px; color:var(--sf-primary); }
.sf5-trust-ic{ color:var(--sf-primary); font-size:20px; }
.sf5-trust-sub{ font-weight:600; font-size:14px; color:var(--sf-text); }

/* ---- section heads ---- */
.sf5-sec-head{ display:flex; flex-direction:column; gap:18px; align-items:flex-start; padding-top:64px; }

/* ---- services ---- */
.sf5-services{ padding-bottom:84px; }
.sf5-svc-grid{ display:grid; gap:16px; margin-top:34px; grid-template-columns:1fr; }
.sf5-svc{ background:var(--sf-card); border:1px solid var(--sf-border); border-radius:18px; overflow:hidden; display:flex; flex-direction:column; transition:transform .18s ease, box-shadow .25s ease; }
.sf5-svc:hover{ transform:translateY(-3px); box-shadow:0 22px 44px -28px color-mix(in oklab,var(--sf-secondary) 60%,transparent); }
.sf5-svc-media{ position:relative; aspect-ratio:16/10; }
.sf5-svc-media .sf5-img,.sf5-svc-media .sf5-ph{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.sf5-svc-body{ padding:22px; display:flex; flex-direction:column; gap:12px; flex:1; }
.sf5-svc-name{ font-family:var(--sf-font-headline); font-weight:700; font-size:21px; margin:0; letter-spacing:-.01em; }
.sf5-svc-desc{ margin:0; color:var(--sf-ink-60); font-size:15px; }
.sf5-svc-meta{ display:flex; align-items:center; gap:16px; margin-top:auto; font-weight:600; font-size:14px; color:var(--sf-text); }
.sf5-svc-meta span{ display:inline-flex; align-items:center; gap:6px; white-space:nowrap; }
.sf5-svc-meta svg{ color:var(--sf-primary); font-size:16px; }
.sf5-price{ font-family:var(--sf-font-headline); font-weight:800; font-size:18px; }
.sf5-svc-book{ display:inline-flex; align-items:center; gap:7px; white-space:nowrap; font-weight:700; font-size:14px; color:var(--sf-primary); text-decoration:none; }
.sf5-svc-book:hover{ gap:11px; }
.sf5-svc--feature .sf5-btn{ align-self:flex-start; }

/* ---- about ---- */
.sf5-about{ display:grid; grid-template-columns:1fr; }
.sf5-about-panel{ background:var(--sf-primary); color:var(--sf-bg); padding:48px 20px; display:flex; flex-direction:column; gap:26px; }
.sf5-on-primary{ color:#fff; }
.sf5-about-copy{ display:flex; flex-direction:column; gap:16px; max-width:54ch; }
.sf5-about-role{ font-weight:800; text-transform:uppercase; letter-spacing:.12em; font-size:12px; color:var(--sf-onp); margin:0; }
.sf5-about-text{ margin:0; font-size:17px; color:color-mix(in oklab,#fff 88%,var(--sf-primary)); }
.sf5-creds{ list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:9px; }
.sf5-creds li{ display:flex; align-items:center; gap:9px; font-weight:600; font-size:15px; color:#fff; }
.sf5-creds svg{ color:var(--sf-bg); }
.sf5-about-media{ position:relative; min-height:360px; }
.sf5-about-media .sf5-img,.sf5-about-media .sf5-ph{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }

/* ---- stats ---- */
.sf5-stats{ background:var(--sf-secondary); color:var(--sf-bg); }
.sf5-stats-in{ display:flex; flex-wrap:wrap; gap:28px 56px; padding-block:46px; }
.sf5-stat{ display:flex; flex-direction:column; gap:4px; }
.sf5-stat-n{ font-family:var(--sf-font-headline); font-weight:800; font-size:clamp(34px,7cqw,52px); line-height:1; color:var(--sf-bg); }
.sf5-stat-l{ font-size:14px; color:color-mix(in oklab,var(--sf-bg) 72%,var(--sf-secondary)); font-weight:600; }

/* ---- testimonials ---- */
.sf5-revs{ padding-block:72px; }
.sf5-rev-grid{ display:grid; gap:16px; margin-top:32px; grid-template-columns:1fr; }
.sf5-rev{ background:var(--sf-card-2); border-radius:16px; padding:28px; margin:0; display:flex; flex-direction:column; gap:16px; }
.sf5-rev-stars{ font-size:15px; }
.sf5-rev blockquote{ margin:0; font-family:var(--sf-font-headline); font-weight:500; font-size:19px; line-height:1.4; letter-spacing:-.01em; }
.sf5-rev figcaption{ font-weight:700; font-size:14px; color:var(--sf-ink-60); }

/* ---- faq ---- */
.sf5-faq{ padding-bottom:84px; }
.sf5-faq-in{ display:grid; grid-template-columns:1fr; gap:32px; }
.sf5-faq-list{ border-top:1px solid var(--sf-border); }
.sf5-faq-item{ border-bottom:1px solid var(--sf-border); }
.sf5-faq-q{ width:100%; display:flex; align-items:center; justify-content:space-between; gap:18px;
  background:none; border:0; cursor:pointer; text-align:left; padding:22px 4px;
  font-family:var(--sf-font-headline); font-weight:600; font-size:19px; color:var(--sf-text); }
.sf5-faq-chev{ flex:none; font-size:22px; color:var(--sf-primary); transition:transform .25s ease; }
.sf5-faq-item.is-open .sf5-faq-chev{ transform:rotate(180deg); }
.sf5-faq-a{ display:grid; grid-template-rows:0fr; transition:grid-template-rows .28s ease; }
.sf5-faq-item.is-open .sf5-faq-a{ grid-template-rows:1fr; }
.sf5-faq-a > p{ overflow:hidden; margin:0; color:var(--sf-ink-60); font-size:16px; padding-right:30px;
  padding-bottom:0; transition:padding-bottom .28s ease; }
.sf5-faq-item.is-open .sf5-faq-a > p{ padding-bottom:22px; }

/* ---- cta band ---- */
.sf5-cta{ position:relative; overflow:hidden; }
.sf5-cta-media{ position:absolute; inset:0; }
.sf5-cta-media .sf5-img,.sf5-cta-media .sf5-ph{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.sf5-cta-scrim{ position:absolute; inset:0; background:linear-gradient(90deg,color-mix(in oklab,var(--sf-secondary) 88%,transparent),color-mix(in oklab,var(--sf-secondary) 55%,transparent)); }
.sf5-cta-in{ position:relative; padding-block:84px; }
.sf5-cta-h{ font-family:var(--sf-font-headline); font-weight:700; letter-spacing:-.02em; line-height:1.0;
  font-size:clamp(34px,9cqw,60px); margin:0 0 14px; color:#fff; }
.sf5-cta-sub{ color:color-mix(in oklab,#fff 86%,var(--sf-secondary)); font-size:18px; margin:0 0 28px; max-width:42ch; }

/* ---- footer ---- */
.sf5-foot{ background:var(--sf-secondary); color:var(--sf-bg); padding-top:64px; }
.sf5-foot-in{ display:grid; grid-template-columns:1fr; gap:40px; padding-bottom:48px; }
.sf5-brand--foot{ color:var(--sf-primary); }
.sf5-foot-tag{ color:color-mix(in oklab,var(--sf-bg) 72%,var(--sf-secondary)); margin:14px 0 22px; max-width:34ch; }
.sf5-foot-cols{ display:grid; grid-template-columns:1fr 1fr; gap:32px 24px; }
.sf5-foot-col h3{ font-family:var(--sf-font-headline); font-size:13px; text-transform:uppercase; letter-spacing:.1em;
  color:var(--sf-primary); margin:0 0 14px; }
.sf5-foot-col ul{ list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:9px; }
.sf5-foot-col li,.sf5-foot-col a{ color:color-mix(in oklab,var(--sf-bg) 82%,var(--sf-secondary)); font-size:14px; text-decoration:none; }
.sf5-foot-col a:hover{ color:#fff; }
.sf5-foot-legal{ display:flex; flex-wrap:wrap; gap:8px 20px; justify-content:space-between;
  border-top:1px solid color-mix(in oklab,var(--sf-bg) 18%,var(--sf-secondary)); padding-block:22px;
  font-size:13px; color:color-mix(in oklab,var(--sf-bg) 62%,var(--sf-secondary)); }

/* ---- sticky mobile bar ---- */
.sf5-mbar{ position:sticky; bottom:0; z-index:50; display:flex; gap:10px; padding:12px 16px calc(12px + env(safe-area-inset-bottom));
  background:color-mix(in oklab,var(--sf-bg) 92%,transparent); backdrop-filter:blur(10px);
  border-top:1px solid var(--sf-border); }
.sf5-mbar-call{ display:inline-flex; align-items:center; justify-content:center; gap:8px; padding:14px 20px;
  border-radius:999px; border:1.5px solid var(--sf-border); color:var(--sf-text); text-decoration:none; font-weight:700; }
.sf5-mbar-book{ flex:1; display:inline-flex; align-items:center; justify-content:center; padding:14px 20px;
  border-radius:999px; background:var(--sf-primary); color:#fff; text-decoration:none; font-weight:700; }

/* ---- placeholder + image ---- */
.sf5-img{ width:100%; height:100%; object-fit:cover; }
.sf5-ph{ position:relative; width:100%; height:100%; min-height:160px; overflow:hidden;
  background:
    repeating-linear-gradient(135deg, color-mix(in oklab,var(--sf-primary) 16%,var(--sf-card)) 0 14px, color-mix(in oklab,var(--sf-primary) 7%,var(--sf-card)) 14px 28px),
    var(--sf-card-2);
  display:grid; place-items:center; }
.sf5-ph::after{ content:""; position:absolute; inset:0;
  background:radial-gradient(120% 90% at 30% 20%, transparent 40%, color-mix(in oklab,var(--sf-secondary) 14%,transparent)); }
.sf5-ph-tag{ position:relative; z-index:1; font-family:ui-monospace,'SFMono-Regular',Menlo,monospace;
  font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:color-mix(in oklab,var(--sf-secondary) 70%,var(--sf-bg));
  background:color-mix(in oklab,var(--sf-bg) 86%,transparent); padding:6px 11px; border-radius:999px; border:1px solid var(--sf-border); }

@media (prefers-reduced-motion: reduce){ .sf5-root *{ transition:none !important; } }

/* ===================== container queries (tablet â‰¥ 720) =================== */
@container sf5 (min-width:720px){
  .sf5-wrap{ padding-inline:32px; }
  .sf5-nav-links{ display:flex; }
  .sf5-nav .sf5-btn-primary{ display:inline-flex; }
  .sf5-burger{ display:none; }
  .sf5-mbar{ display:none; }
  .sf5-hero{ display:grid; grid-template-columns:1.05fr .95fr; align-items:stretch; min-height:78cqh; }
  .sf5-hero-media{ order:2; min-height:520px; }
  .sf5-hero-body{ order:1; align-self:center; padding:64px 48px 64px max(32px,calc((100cqw - var(--wrap))/2 + 32px)); }
  .sf5-hero-scrim{ background:linear-gradient(90deg,transparent 30%,color-mix(in oklab,var(--sf-secondary) 12%,transparent)); }
  .sf5-sec-head{ flex-direction:row; align-items:flex-end; justify-content:space-between; }
  .sf5-svc-grid{ grid-template-columns:1fr 1fr; }
  .sf5-svc--feature{ grid-column:1 / -1; flex-direction:row; }
  .sf5-svc--feature .sf5-svc-media{ flex:1.1; aspect-ratio:auto; min-height:300px; }
  .sf5-svc--feature .sf5-svc-body{ flex:1; padding:34px; }
  .sf5-about{ grid-template-columns:1.15fr .85fr; }
  .sf5-about-panel{ padding:72px 8cqw 72px max(48px,calc((100cqw - var(--wrap))/2 + 8px)); justify-content:center; }
  .sf5-about-media{ min-height:560px; }
  .sf5-rev-grid{ grid-template-columns:repeat(3,1fr); }
  .sf5-faq-in{ grid-template-columns:.7fr 1.3fr; gap:48px; }
  .sf5-foot-in{ grid-template-columns:1.2fr 2fr; gap:64px; }
  .sf5-foot-cols{ grid-template-columns:repeat(4,1fr); }
  .sf5-cta-in{ padding-block:110px; }
}
@container sf5 (min-width:1040px){
  .sf5-link-call{ display:inline-flex; }
  .sf5-hero-h1{ font-size:clamp(56px,6.2cqw,82px); }
  .sf5-svc-grid{ grid-template-columns:repeat(3,1fr); }
  .sf5-svc--feature .sf5-svc-body{ padding:44px; max-width:560px; }
}
`;
