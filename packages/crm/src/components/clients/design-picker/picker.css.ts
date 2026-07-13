/* DesignPicker stylesheet — single source of truth shared by <PickerStyles/>.
   Theme-token driven: reads the dashboard host vars (--background/--card/--muted/
   --border/--foreground/--muted-foreground/--primary/--shadow-card) so the control
   tracks light/.dark AND the operator accent. The 5 design thumbnails keep their
   own palettes (they are previews of the landing designs, not chrome). */
export const PICKER_CSS = `
.pk-scope, .pk-scope *{ box-sizing:border-box; }
.pk-scope{
  /* Theme-token driven — reads the dashboard host vars (shadcn-style), so the
     picker tracks light/.dark AND the operator's accent (--primary) with no
     hardcoded chrome. Fallbacks keep it usable in isolation. */
  --pk-surface: var(--card, #ffffff);
  --pk-ink:     var(--foreground, #17181d);
  --pk-muted:   var(--muted-foreground, #646a77);
  --pk-line:    var(--border, #e6e7ec);
  --pk-line-2:  var(--muted, #eef0f3);
  --pk-accent:  var(--primary, #059669);
  --pk-accent-d:    color-mix(in oklab, var(--pk-accent) 84%, #000);
  --pk-accent-tint: color-mix(in oklab, var(--pk-accent) 14%, var(--pk-surface));
  --pk-accent-ink:  color-mix(in oklab, var(--pk-accent) 66%, var(--pk-ink));
  --pk-shadow:  var(--shadow-pop, 0 24px 60px -22px rgba(0,0,0,.38));
  font-family:'Hanken Grotesk',-apple-system,system-ui,sans-serif;
}

/* ====================== Chip (idle-scene control) ======================== */
.pk-anchor{ position:relative; display:inline-block; }
.pk-chip{ display:inline-flex; align-items:center; gap:9px; height:38px; padding:0 13px 0 14px;
  border-radius:999px; border:1px solid var(--pk-line); background:color-mix(in oklab, var(--pk-surface) 86%, transparent);
  backdrop-filter:blur(8px); color:var(--pk-ink); font-family:inherit; font-size:13.5px; font-weight:600;
  cursor:pointer; white-space:nowrap; transition:border-color .18s, box-shadow .18s, transform .12s; }
.pk-chip:hover{ border-color:color-mix(in oklab,var(--pk-accent) 45%,var(--pk-line)); box-shadow:0 6px 18px -10px rgba(18,20,28,.3); }
.pk-chip:focus-visible{ outline:2px solid var(--pk-accent); outline-offset:2px; }
.pk-chip[aria-expanded="true"]{ border-color:var(--pk-accent); box-shadow:0 0 0 3px var(--pk-accent-tint); }
.pk-chip-key{ color:var(--pk-muted); font-weight:600; }
.pk-chip-val{ display:inline-flex; align-items:center; gap:7px; font-weight:700; }
.pk-chip-spark{ color:var(--pk-accent); font-size:14px; display:inline-flex; }
.pk-chip-dot{ width:16px; height:16px; border-radius:5px; background-size:cover; background-position:center; box-shadow:inset 0 0 0 1px rgba(0,0,0,.12); }
.pk-chip-chev{ color:var(--pk-muted); font-size:15px; transition:transform .2s; margin-left:1px; }
.pk-chip[aria-expanded="true"] .pk-chip-chev{ transform:rotate(180deg); }
.pk-chip-best{ display:inline-flex; align-items:center; height:19px; padding:0 7px; border-radius:999px;
  background:var(--pk-accent-tint); color:var(--pk-accent-ink); font-size:10.5px; font-weight:800; letter-spacing:.02em; }

/* ====================== Popover (desktop) ================================ */
.pk-pop{ position:absolute; z-index:90; width:392px; max-width:min(392px, calc(100vw - 28px));
  max-height:min(74vh, 600px); display:flex; flex-direction:column;
  background:var(--pk-surface); border:1px solid var(--pk-line); border-radius:18px; box-shadow:var(--pk-shadow);
  overflow:hidden; transform-origin:top left; animation:pkPop .18s cubic-bezier(.2,.7,.2,1) both; }
.pk-pop[data-place="top"]{ bottom:calc(100% + 10px); left:0; transform-origin:bottom left; }
.pk-pop[data-place="bottom-end"]{ top:calc(100% + 10px); right:0; transform-origin:top right; }
.pk-pop[data-place="bottom"]{ top:calc(100% + 10px); left:0; }
@keyframes pkPop{ from{ opacity:0; transform:translateY(6px) scale(.98); } to{ opacity:1; transform:none; } }

/* ====================== Bottom sheet (mobile) =========================== */
.pk-sheet-scrim{ position:fixed; inset:0; z-index:88; background:rgba(20,16,14,.32);
  animation:pkFade .2s ease both; }
.pk-sheet{ position:fixed; left:0; right:0; bottom:0; z-index:90; background:var(--pk-surface);
  border-radius:22px 22px 0 0; box-shadow:0 -18px 50px -20px rgba(18,20,28,.4); display:flex; flex-direction:column;
  max-height:88%; animation:pkUp .26s cubic-bezier(.2,.7,.2,1) both; }
.pk-sheet-grip{ width:40px; height:4px; border-radius:999px; background:var(--pk-line); margin:10px auto 2px; flex:none; }
@keyframes pkUp{ from{ transform:translateY(100%); } to{ transform:none; } }
@keyframes pkFade{ from{ opacity:0; } to{ opacity:1; } }

/* ====================== Picker contents (shared) ======================== */
.pk-head{ flex:none; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 18px 12px; }
.pk-head h3{ margin:0; font-size:15px; font-weight:800; letter-spacing:-.01em; color:var(--pk-ink); }
.pk-head p{ margin:2px 0 0; font-size:12px; color:var(--pk-muted); }
.pk-x{ flex:none; display:inline-grid; place-items:center; width:30px; height:30px; border-radius:8px; border:1px solid var(--pk-line);
  background:var(--pk-surface); color:var(--pk-muted); cursor:pointer; font-size:17px; transition:background .15s, color .15s; }
.pk-x:hover{ background:var(--pk-line-2); color:var(--pk-ink); }
.pk-body{ flex:1 1 auto; min-height:0; padding:4px 18px 18px; overflow-y:auto; }

/* Auto (recommended) card */
.pk-auto{ position:relative; width:100%; display:flex; align-items:flex-start; gap:13px; text-align:left;
  padding:14px; border-radius:14px; border:1.5px solid var(--pk-line); background:var(--pk-surface); cursor:pointer;
  transition:border-color .16s, box-shadow .16s, background .16s; }
.pk-auto:hover{ border-color:color-mix(in oklab,var(--pk-accent) 50%,var(--pk-line)); }
.pk-auto[aria-pressed="true"]{ border-color:var(--pk-accent); box-shadow:0 0 0 3px var(--pk-accent-tint);
  background:linear-gradient(180deg, var(--pk-accent-tint), var(--pk-surface) 70%); }
.pk-auto-ic{ flex:none; width:42px; height:42px; border-radius:11px; display:grid; place-items:center;
  background:var(--pk-accent-tint); color:var(--pk-accent-ink); font-size:21px; }
.pk-auto-main{ flex:1; min-width:0; }
.pk-auto-top{ display:flex; align-items:center; gap:8px; }
.pk-auto-name{ display:block; font-size:15px; font-weight:800; color:var(--pk-ink); }
.pk-tag{ display:inline-flex; align-items:center; height:19px; padding:0 8px; border-radius:999px;
  background:var(--pk-accent); color:var(--primary-foreground,#fff); font-size:10px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; }
.pk-auto-blurb{ margin:5px 0 0; font-size:12.5px; line-height:1.45; color:var(--pk-muted); }
.pk-auto-check{ flex:none; align-self:center; color:var(--pk-accent); font-size:20px; opacity:0; transition:opacity .15s; }
.pk-auto[aria-pressed="true"] .pk-auto-check{ opacity:1; }

/* Section label */
.pk-sec{ display:flex; align-items:center; gap:10px; margin:18px 2px 12px; }
.pk-sec span{ font-size:10.5px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; color:var(--pk-muted); white-space:nowrap; }
.pk-sec::after{ content:""; height:1px; flex:1; background:var(--pk-line); }

/* Design grid */
.pk-grid{ display:grid; grid-template-columns:1fr 1fr; gap:11px; }
.pk-card{ position:relative; display:flex; flex-direction:column; text-align:left; padding:0; overflow:hidden;
  border:1.5px solid var(--pk-line); border-radius:13px; background:var(--pk-surface); cursor:pointer;
  transition:border-color .16s, box-shadow .16s, transform .14s; }
.pk-card:hover{ border-color:color-mix(in oklab,var(--pk-accent) 55%,var(--pk-line)); transform:translateY(-2px);
  box-shadow:0 16px 30px -20px rgba(18,20,28,.4); }
.pk-card[aria-pressed="true"]{ border-color:var(--pk-accent); box-shadow:0 0 0 3px var(--pk-accent-tint); }
.pk-thumb{ position:relative; aspect-ratio:16/10; background:var(--pk-line-2); overflow:hidden; }
.pk-thumb img{ width:100%; height:100%; object-fit:cover; object-position:top center; display:block;
  transition:transform .5s cubic-bezier(.2,.7,.2,1); }
.pk-card:hover .pk-thumb img{ transform:scale(1.05); }
.pk-thumb-ph{ position:absolute; inset:0; display:grid; place-items:center; font-size:11px; color:var(--pk-muted);
  background:repeating-linear-gradient(135deg,var(--pk-line-2) 0 12px,var(--pk-surface) 12px 24px); }
.pk-check{ position:absolute; top:8px; right:8px; width:23px; height:23px; border-radius:50%; background:var(--pk-accent);
  color:var(--primary-foreground,#fff); display:grid; place-items:center; font-size:14px; box-shadow:0 2px 6px rgba(0,0,0,.25);
  transform:scale(0); transition:transform .18s cubic-bezier(.2,1.4,.4,1); }
.pk-card[aria-pressed="true"] .pk-check{ transform:scale(1); }
.pk-card-b{ padding:10px 12px 12px; }
.pk-card-name{ display:block; font-size:13.5px; font-weight:800; color:var(--pk-ink); letter-spacing:-.01em; line-height:1.2; }
.pk-card-niche{ display:block; margin-top:3px; font-size:11.5px; color:var(--pk-muted); line-height:1.3; }
.pk-card-sw{ display:flex; gap:3px; margin-top:8px; }
.pk-card-sw i{ width:11px; height:11px; border-radius:3px; box-shadow:inset 0 0 0 1px rgba(0,0,0,.1); }

.pk-foot{ margin-top:14px; display:flex; align-items:center; gap:8px; font-size:11.5px; color:var(--pk-muted);
  padding:11px 12px; border-radius:10px; background:var(--pk-line-2); }
.pk-foot svg{ flex:none; color:var(--pk-accent-ink); font-size:15px; }

/* ====================== Ready-page design module ======================= */
.rdm{ position:relative; }
.rdm-eyebrow{ display:inline-flex; align-items:center; gap:8px; font-size:11px; font-weight:800; letter-spacing:.1em;
  text-transform:uppercase; color:var(--pk-accent-ink); margin-bottom:14px; }
.rdm-row{ display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
.rdm-preview{ display:flex; align-items:center; gap:14px; min-width:0; flex:1; transition:opacity .26s ease; }
.rdm-preview.swapping{ opacity:0; }
.rdm-thumb{ position:relative; width:96px; height:62px; flex:none; border-radius:10px; overflow:hidden;
  border:1px solid var(--pk-line); background:var(--pk-line-2); }
.rdm-thumb img{ width:100%; height:100%; object-fit:cover; object-position:top center; }
.rdm-thumb-ph{ position:absolute; inset:0; display:grid; place-items:center; font-size:10px; color:var(--pk-muted);
  background:repeating-linear-gradient(135deg,var(--pk-line-2) 0 10px,var(--pk-surface) 10px 20px); }
.rdm-meta{ min-width:0; }
.rdm-name{ font-size:17px; font-weight:800; letter-spacing:-.01em; color:var(--pk-ink); line-height:1.15; }
.rdm-niche{ margin-top:3px; font-size:12.5px; color:var(--pk-muted); }
.rdm-why{ display:inline-flex; align-items:center; gap:6px; white-space:nowrap; margin-top:9px; padding:4px 10px; border-radius:999px;
  background:var(--pk-accent-tint); color:var(--pk-accent-ink); font-size:11.5px; font-weight:700; }
.rdm-why svg{ font-size:13px; }
.rdm-change{ display:inline-flex; align-items:center; gap:8px; height:42px; padding:0 18px; flex:none; border-radius:10px; white-space:nowrap;
  border:1.5px solid var(--pk-line); background:var(--pk-surface); color:var(--pk-ink); font-family:inherit; font-weight:700;
  font-size:13.5px; cursor:pointer; transition:border-color .16s, background .16s; }
.rdm-change:hover{ border-color:color-mix(in oklab,var(--pk-accent) 45%,var(--pk-line)); background:var(--pk-accent-tint); }
.rdm-change:focus-visible{ outline:2px solid var(--pk-accent); outline-offset:2px; }

/* ====================== Toast ========================================== */
.pk-toast{ position:absolute; left:50%; bottom:26px; transform:translateX(-50%) translateY(10px); z-index:120; white-space:nowrap;
  display:inline-flex; align-items:center; gap:9px; padding:11px 17px; border-radius:999px;
  background:var(--foreground,#16181d); color:var(--background,#fff); font-size:13px; font-weight:700; box-shadow:0 16px 36px -14px rgba(0,0,0,.5);
  opacity:0; pointer-events:none; transition:opacity .24s, transform .24s; }
.pk-toast.show{ opacity:1; transform:translateX(-50%) translateY(0); }
.pk-toast-ic{ display:grid; place-items:center; width:18px; height:18px; border-radius:50%; background:var(--pk-accent); color:var(--primary-foreground,#fff); font-size:11px; }

@media (prefers-reduced-motion: reduce){ .pk-scope *{ animation:none !important; transition:none !important; } }
`;
