// v1.28.2 — agent embed.js endpoint (SSE + markdown + mobile-first + a11y)
//
// v1.28.2 polish on top of v1.26.2's SSE foundation:
//   - Markdown rendering for agent responses (bold / italic / code spans /
//     links with rel=noopener / bullet lists / line breaks). Inline parser
//     in the IIFE — no external dep on the operator's site.
//   - Mobile-first: full-screen panel below 640px (Intercom pattern).
//   - Brand inheritance: operator's logo (workspace.theme.logoUrl) renders
//     in panel header; falls back to first-letter avatar.
//   - Accessibility: role=dialog + aria-label on panel, role=log +
//     aria-live=polite on messages, screen-reader label on textarea, Esc
//     closes panel + returns focus to bubble, focus-visible outlines.
//   - Spring animations: bubble + panel reveal use cubic-bezier(.34,1.56,.64,1).
//     Per-message slide-in. Respects prefers-reduced-motion.
//   - UX: textarea (auto-grows to 120px), Enter sends, Shift+Enter newline,
//     animated typing dots (was "Typing..." text).
//
// Operators add a single line to their site:
//   <script src="https://app.seldonframe.com/api/v1/public/agent/<orgSlug>--<agentSlug>/embed.js" async></script>
//
// The script injects a bottom-right chat bubble + chat panel. Click
// bubble → panel opens → user types → POST to /turn → response appears.
// Anonymous session id is stored in localStorage so multi-message
// sessions thread together.
//
// The widget itself is intentionally minimal CSS (works on any site
// without conflicts). Theming via the agent's blueprint.greeting +
// the workspace's primaryColor (queried at embed-load time).

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { agents, organizations } from "@/db/schema";
import {
  buildEmbedGoogleFontUrl,
  getArchetypeStyleTokens,
  type ArchetypeStyleTokens,
} from "@/lib/workspace/aesthetic-archetypes";
// 2026-05-23 — Defensive backfill for pre-fix workspaces whose theme
// row is at the legacy DB-default (teal + Inter). v1.55.0 dropped
// enhance-blocks from the default workspace-creation path so the
// archetype was never written, leaving every public chatbot bubble
// teal regardless of vertical. We now call applyArchetypeThemeToOrg
// here so existing workspaces self-heal on next embed request. New
// workspaces hit the same logic in v2/complete BEFORE the chatbot
// activates — this is the safety net for the existing ones.
import { applyArchetypeThemeToOrg } from "@/lib/workspace/apply-archetype-theme";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug: agentSlugPath } = await context.params;
  const [orgSlugPart, agentSlugPart] = agentSlugPath.includes("--")
    ? agentSlugPath.split("--", 2)
    : [agentSlugPath, "default"];

  const [agentRow] = await db
    .select({
      id: agents.id,
      name: agents.name,
      slug: agents.slug,
      status: agents.status,
      blueprint: agents.blueprint,
      orgId: organizations.id,
      orgSlug: organizations.slug,
      orgName: organizations.name,
      theme: organizations.theme,
    })
    .from(agents)
    .innerJoin(organizations, eq(organizations.id, agents.orgId))
    .where(eq(organizations.slug, orgSlugPart))
    .limit(1);

  // Even if not found, return a no-op script (don't 404 — that
  // would log noise on the operator's website console).
  const url = new URL(request.url);
  const turnUrl = `${url.protocol}//${url.host}/api/v1/public/agent/${orgSlugPart}--${agentSlugPart}/turn`;

  if (!agentRow || agentRow.slug !== agentSlugPart || !["live", "test"].includes(agentRow.status)) {
    console.warn(JSON.stringify({
      event: "embed_js_noop_returned",
      slug: agentSlugPath,
      reason: !agentRow ? "agent_not_found" :
              agentRow.slug !== agentSlugPart ? "slug_mismatch" :
              `status_${agentRow.status}`,
    }));
    return new NextResponse(
      `// SF agent embed: agent not live or not found (org=${orgSlugPart}, agent=${agentSlugPart})\n`,
      {
        status: 200,
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "public, max-age=60",
        },
      },
    );
  }

  const blueprint = (agentRow.blueprint ?? {}) as {
    greeting?: string;
  };
  const greeting = (blueprint.greeting ?? "Hi! How can I help?").replace(
    /[\\`$]/g,
    "\\$&",
  );

  // 2026-05-23 — Lazy archetype backfill for pre-fix workspaces.
  // If theme.aestheticArchetype is missing, classify from soul and patch
  // theme so the embed renders the archetype palette/font on THIS
  // request (not just the next one). We then refetch the theme so the
  // tokens reflect the patched values. Idempotent — no-op when the
  // archetype is already set, which is the steady-state hot path.
  let resolvedTheme = agentRow.theme;
  if (!resolvedTheme?.aestheticArchetype) {
    const backfill = await applyArchetypeThemeToOrg(agentRow.orgId);
    if (backfill.wrote) {
      const [reread] = await db
        .select({ theme: organizations.theme })
        .from(organizations)
        .where(eq(organizations.id, agentRow.orgId))
        .limit(1);
      if (reread) resolvedTheme = reread.theme;
    }
  }

  // 2026-05-22 — Brand-aware embed.
  //
  // Previously, only theme.primaryColor + theme.logoUrl were threaded
  // through. Every workspace got the same Inter-on-teal bubble regardless
  // of vertical. Now we also read theme.aestheticArchetype (set at
  // workspace creation in v1.54.0) + theme.fontFamily, and project the
  // archetype onto a palette + font pair via getArchetypeStyleTokens.
  // A bold-urgency plumber gets a red bubble + Outfit headline; a
  // clinical-trust dental office gets a calm navy bubble + Cabinet
  // Grotesk; a brutalist creative studio gets near-black + sharp accents.
  // Workspaces without an archetype (pre-1.54, or partial-creation state)
  // get the SeldonFrame default tokens — visually identical to the old
  // #111111 fallback.
  const themeRaw = (resolvedTheme ?? null) as {
    primaryColor?: string;
    logoUrl?: string;
    aestheticArchetype?: string;
    fontFamily?: string;
  } | null;
  const archetypeTokens = getArchetypeStyleTokens(themeRaw?.aestheticArchetype ?? null);
  // Stored theme.primaryColor wins (operator can customize it explicitly
  // via update_theme); else fall back to the archetype primary. The
  // archetype IS the source of truth for secondary/background/text/border
  // because those tokens aren't stored on the theme row today.
  const primaryColor = themeRaw?.primaryColor ?? archetypeTokens.primary;
  // Stored fontFamily wins for the body font (mirrors PublicThemeProvider).
  // Headline always comes from the archetype since it's not stored.
  const bodyFont =
    typeof themeRaw?.fontFamily === "string" && themeRaw.fontFamily.length > 0
      ? themeRaw.fontFamily
      : archetypeTokens.bodyFont;
  const effectiveTokens: ArchetypeStyleTokens = {
    ...archetypeTokens,
    primary: primaryColor,
    bodyFont,
  };
  const googleFontUrl = buildEmbedGoogleFontUrl(
    effectiveTokens.headlineFont,
    effectiveTokens.bodyFont,
  );
  const logoUrl =
    typeof themeRaw?.logoUrl === "string" && /^https?:\/\//.test(themeRaw.logoUrl)
      ? themeRaw.logoUrl
      : null;
  const orgName = agentRow.orgName.replace(/[\\`$"<>]/g, "");

  const script = renderEmbedScript({
    turnUrl,
    greeting,
    tokens: effectiveTokens,
    googleFontUrl,
    orgName,
    logoUrl,
  });

  return new NextResponse(script, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // Short cache — operators iterate on greeting / branding.
      "Cache-Control": "public, max-age=300",
    },
  });
}

function renderEmbedScript(input: {
  turnUrl: string;
  greeting: string;
  tokens: ArchetypeStyleTokens;
  googleFontUrl: string | null;
  orgName: string;
  logoUrl: string | null;
}): string {
  // bodyFontStack is the CSS font-family value the panel uses. The
  // workspace's body font (from the archetype OR stored theme.fontFamily)
  // wins; system fallbacks catch the case where the font failed to load
  // (offline operator, Fontshare font not injected, etc.) so text is
  // always legible. Single quotes around the family name handle multi-word
  // names like "Cabinet Grotesk" or "Playfair Display".
  const bodyFontStack = `'${input.tokens.bodyFont}',system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif`;
  const headlineFontStack = `'${input.tokens.headlineFont}',${bodyFontStack}`;
  const config = {
    turnUrl: input.turnUrl,
    greeting: input.greeting,
    primaryColor: input.tokens.primary,
    secondaryColor: input.tokens.secondary,
    backgroundColor: input.tokens.background,
    textColor: input.tokens.text,
    borderColor: input.tokens.border,
    bodyFontStack,
    headlineFontStack,
    googleFontUrl: input.googleFontUrl,
    orgName: input.orgName,
    logoUrl: input.logoUrl,
  };
  // The embed runs as an IIFE. Self-contained — no framework deps.
  // Renders shadow-DOM-free for max compatibility (works inside iframes,
  // email-builder canvases, etc.). Style namespaced with .sf-agent-* to
  // avoid collisions.
  return `(function(){
  if (window.__sf_agent_loaded__) return;
  window.__sf_agent_loaded__ = true;
  var CFG = ${JSON.stringify(config)};
  var SESSION_KEY = "sf_agent_session_" + (CFG.turnUrl.split("/turn")[0].split("/").pop() || "default");
  var sessionId = (function(){
    try {
      var existing = localStorage.getItem(SESSION_KEY);
      if (existing) return existing;
      var fresh = "anon-" + Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
      localStorage.setItem(SESSION_KEY, fresh);
      return fresh;
    } catch(e) { return "anon-" + Date.now().toString(36); }
  })();
  var conversationId = null;

  // 2026-05-22 — inject Google Fonts link into host page BEFORE the
  // panel CSS mounts, so the @font-face declarations are parsed by the
  // time the bubble renders. Skipped when CFG.googleFontUrl is null
  // (workspace uses Fontshare-only fonts; the embed falls through to
  // the system stack instead of trying to load a Fontshare license).
  // De-duped via a unique data-attr so loading multiple embeds on the
  // same page doesn't insert N identical link tags.
  if (CFG.googleFontUrl && !document.querySelector('link[data-sf-agent-fonts="1"]')) {
    var fontLink = document.createElement("link");
    fontLink.rel = "stylesheet";
    fontLink.href = CFG.googleFontUrl;
    fontLink.setAttribute("data-sf-agent-fonts", "1");
    document.head.appendChild(fontLink);
  }

  var style = document.createElement("style");
  style.textContent = [
    // v1.28.2 — bubble: subtle rest pulse → wakes attention without nagging
    ".sf-agent-bubble{position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;background:" + CFG.primaryColor + ";color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,0.15),0 1px 4px rgba(0,0,0,0.08);z-index:2147483646;font-family:" + CFG.bodyFontStack + ";border:none;transition:transform .2s cubic-bezier(.34,1.56,.64,1),box-shadow .2s ease}",
    ".sf-agent-bubble:hover{transform:scale(1.08)}",
    ".sf-agent-bubble:active{transform:scale(.95)}",
    ".sf-agent-bubble:focus-visible{outline:2px solid " + CFG.primaryColor + ";outline-offset:3px}",
    // Panel: spring slide-up reveal. Hidden = opacity 0 + translateY(8px) + scale(.98)
    // 2026-05-22 — font-family flipped from hardcoded -apple-system stack
    // to CFG.bodyFontStack so the workspace's archetype/stored font wins
    // (with the same -apple-system stack as fallback when the font
    // doesn't load).
    ".sf-agent-panel{position:fixed;bottom:88px;right:20px;width:380px;max-width:calc(100vw - 40px);height:560px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,0.18),0 4px 12px rgba(0,0,0,0.08);z-index:2147483647;display:flex;flex-direction:column;overflow:hidden;font-family:" + CFG.bodyFontStack + ";opacity:0;transform:translateY(8px) scale(.98);pointer-events:none;transition:opacity .22s ease,transform .28s cubic-bezier(.34,1.56,.64,1)}",
    ".sf-agent-panel.open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}",
    // Mobile: full-screen below sm. Bigger touch targets, no rounded corners.
    "@media (max-width:640px){.sf-agent-panel{bottom:0;right:0;left:0;top:0;width:100%;max-width:100%;height:100%;max-height:100%;border-radius:0}.sf-agent-bubble{bottom:16px;right:16px}}",
    "@media (prefers-reduced-motion:reduce){.sf-agent-panel,.sf-agent-bubble{transition:none}}",
    ".sf-agent-header{padding:14px 16px;background:" + CFG.primaryColor + ";color:#fff;display:flex;justify-content:space-between;align-items:center;gap:8px}",
    ".sf-agent-header-left{display:flex;align-items:center;gap:10px;min-width:0}",
    ".sf-agent-logo{width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;flex-shrink:0;overflow:hidden;font-family:" + CFG.headlineFontStack + "}",
    ".sf-agent-logo img{width:100%;height:100%;object-fit:cover}",
    // 2026-05-22 — brand name in header uses the archetype's headline
    // font so a clinical-trust dental gets Cabinet-Grotesk-styled name
    // while a bold-urgency plumber gets Outfit.
    ".sf-agent-header strong{font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:" + CFG.headlineFontStack + "}",
    ".sf-agent-close{background:transparent;border:none;color:#fff;cursor:pointer;font-size:24px;padding:4px 8px;opacity:.85;border-radius:6px;line-height:1}",
    ".sf-agent-close:hover{opacity:1;background:rgba(255,255,255,.12)}",
    ".sf-agent-close:focus-visible{outline:2px solid #fff;outline-offset:1px}",
    // v1.40.11 — explicit overflow-x:hidden + min-width:0 so a long
    // unbreakable token in an assistant reply (URL, code block, long
    // ID) can't push the panel into horizontal scroll on mobile. min-width:0
    // overrides the flex-default min-width:auto which would otherwise
    // refuse to shrink below content size.
    // 2026-05-22 — message scroll background pulls from the archetype
    // (warm cream for editorial-warm, clean white for bold-urgency,
    // warm cream for cinematic-aspirational, etc.) so the panel surface
    // matches the workspace's brand tone instead of always being #f7f7f5.
    ".sf-agent-messages{flex:1;overflow-y:auto;overflow-x:hidden;min-width:0;padding:16px;display:flex;flex-direction:column;gap:10px;background:" + CFG.backgroundColor + ";scroll-behavior:smooth}",
    // v1.40.11 — overflow-wrap:anywhere + min-width:0 so long URLs,
    // long emails, long tokens wrap inside the bubble instead of
    // overflowing the panel width on mobile.
    ".sf-agent-msg{max-width:85%;min-width:0;padding:10px 14px;border-radius:16px;font-size:14px;line-height:1.5;word-wrap:break-word;overflow-wrap:anywhere;animation:sf-agent-msg-in .22s cubic-bezier(.34,1.56,.64,1)}",
    "@keyframes sf-agent-msg-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}",
    "@media (prefers-reduced-motion:reduce){.sf-agent-msg{animation:none}}",
    ".sf-agent-msg.user{align-self:flex-end;background:" + CFG.primaryColor + ";color:#fff;border-bottom-right-radius:6px}",
    // 2026-05-22 — assistant bubble text + border pulled from archetype
    // text/border tokens; near-black still common but archetype-specific
    // (e.g., editorial-warm uses #1f1c19, brutalist uses #0a0a0a).
    ".sf-agent-msg.assistant{align-self:flex-start;background:#fff;color:" + CFG.textColor + ";border-bottom-left-radius:6px;border:1px solid " + CFG.borderColor + "}",
    ".sf-agent-msg.system{align-self:center;color:#888;font-size:12px;font-style:italic;background:transparent;border:none;padding:4px 10px}",
    // Markdown styles inside assistant messages
    ".sf-agent-msg.assistant strong{font-weight:600;color:inherit}",
    ".sf-agent-msg.assistant em{font-style:italic}",
    ".sf-agent-msg.assistant a{color:" + CFG.primaryColor + ";text-decoration:underline}",
    ".sf-agent-msg.assistant code{background:#f0f0ec;padding:1px 5px;border-radius:4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em}",
    ".sf-agent-msg.assistant ul{margin:6px 0;padding-left:20px}",
    ".sf-agent-msg.assistant li{margin:2px 0}",
    ".sf-agent-typing{align-self:flex-start;color:#888;font-size:13px;padding:6px 12px;display:flex;gap:4px}",
    ".sf-agent-typing span{width:6px;height:6px;background:#bbb;border-radius:50%;animation:sf-agent-typing-bounce 1.2s infinite}",
    ".sf-agent-typing span:nth-child(2){animation-delay:.15s}",
    ".sf-agent-typing span:nth-child(3){animation-delay:.3s}",
    "@keyframes sf-agent-typing-bounce{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-4px)}}",
    // 2026-05-22 — form divider uses archetype border token so the
    // panel's transition from messages to input reads consistent with
    // the brand (warm border for editorial-warm, hard near-black for
    // brutalist, soft cream for cinematic-aspirational, etc.).
    ".sf-agent-form{display:flex;gap:8px;padding:12px;border-top:1px solid " + CFG.borderColor + ";background:#fff;align-items:flex-end}",
    // v1.40.8 — explicit color + background on .sf-agent-input. Pre-1.40.8
    // the input had no color rule and inherited from the host page's
    // color: var(--sf-text). On workspaces whose stored theme is dark
    // (e.g. operators who customized) or when the host page's CSS sets
    // color globally, typed characters rendered white-on-white and were
    // invisible. Hardcoding both color and background isolates the chat
    // widget from host-page CSS — the input is always readable.
    // 2026-05-22 — input border + text color now archetype-driven; the
    // input still has an explicit color/background to defend against
    // host-page color cascades (the v1.40.8 fix), it's just no longer
    // hardcoded to #111.
    ".sf-agent-input{flex:1;padding:10px 14px;border:1px solid " + CFG.borderColor + ";border-radius:12px;font-size:14px;outline:none;font-family:inherit;resize:none;max-height:120px;line-height:1.4;transition:border-color .15s;color:" + CFG.textColor + ";background:#fff;-webkit-text-fill-color:" + CFG.textColor + "}",
    ".sf-agent-input::placeholder{color:#999;opacity:1}",
    ".sf-agent-input:focus{border-color:" + CFG.primaryColor + "}",
    // 2026-05-22 — send button uses headline font for brand consistency
    // (the headline font is the archetype's "voice" — Outfit for trades,
    // Cabinet Grotesk for clinical, etc.).
    ".sf-agent-send{padding:10px 16px;background:" + CFG.primaryColor + ";color:#fff;border:none;border-radius:12px;cursor:pointer;font-size:14px;font-weight:600;height:42px;flex-shrink:0;transition:transform .12s ease,opacity .15s ease;font-family:" + CFG.headlineFontStack + "}",
    ".sf-agent-send:hover:not(:disabled){transform:translateY(-1px)}",
    ".sf-agent-send:active:not(:disabled){transform:translateY(0) scale(.97)}",
    ".sf-agent-send:focus-visible{outline:2px solid " + CFG.primaryColor + ";outline-offset:2px}",
    ".sf-agent-send:disabled{opacity:.5;cursor:not-allowed}",
    ".sf-agent-footer{padding:8px 12px;text-align:center;font-size:11px;color:#999;border-top:1px solid #f0f0ec;background:#fff}",
    ".sf-agent-footer a{color:#999}",
    ".sf-agent-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}"
  ].join("");
  document.head.appendChild(style);

  var bubble = document.createElement("button");
  bubble.className = "sf-agent-bubble";
  bubble.setAttribute("aria-label", "Open chat");
  bubble.setAttribute("aria-expanded", "false");
  bubble.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 9h8"/><path d="M8 13h6"/><path d="M9 18h-3a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-3l-3 3l-3 -3z"/></svg>';

  var panel = document.createElement("div");
  panel.className = "sf-agent-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Chat with " + CFG.orgName);
  panel.setAttribute("aria-modal", "false"); // operator's site behind stays interactive
  // v1.28.2 — header with optional operator logo + brand name
  var logoMarkup = CFG.logoUrl
    ? '<span class="sf-agent-logo"><img src="' + escapeAttr(CFG.logoUrl) + '" alt="" /></span>'
    : '<span class="sf-agent-logo">' + escapeHtml(CFG.orgName.charAt(0).toUpperCase()) + '</span>';
  panel.innerHTML = [
    '<div class="sf-agent-header">',
    '<div class="sf-agent-header-left">',
    logoMarkup,
    '<strong>' + escapeHtml(CFG.orgName) + '</strong>',
    '</div>',
    '<button class="sf-agent-close" aria-label="Close chat" type="button">\\u00d7</button>',
    '</div>',
    '<div class="sf-agent-messages" id="sf-agent-msgs" role="log" aria-live="polite" aria-relevant="additions"></div>',
    '<form class="sf-agent-form" id="sf-agent-form" autocomplete="off">',
    '<label for="sf-agent-input" class="sf-agent-sr">Message</label>',
    '<textarea class="sf-agent-input" id="sf-agent-input" rows="1" placeholder="Type a message..." aria-label="Type a message"></textarea>',
    '<button class="sf-agent-send" type="submit" aria-label="Send message">Send</button>',
    '</form>',
    '<div class="sf-agent-footer">Powered by <a href="https://seldonframe.com" target="_blank" rel="noopener">SeldonFrame</a></div>'
  ].join("");

  function escapeHtml(s){return String(s).replace(/[&<>"']/g, function(c){return ({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"})[c];});}
  function escapeAttr(s){return escapeHtml(s);}

  // v1.28.2 — minimal inline-markdown renderer. Handles **bold**, *italic*,
  // \`code\`, [text](url), - bullet lists, and line breaks. Output is HTML —
  // we escapeHtml() FIRST then re-inject sanctioned tags. Links are
  // hardened with rel=noopener target=_blank. No raw HTML survives.
  function renderMarkdown(text){
    var safe = escapeHtml(text);
    // Code spans: \`x\` -> <code>x</code>
    safe = safe.replace(/\`([^\`\\n]+)\`/g, '<code>$1</code>');
    // Bold: **x** -> <strong>x</strong>
    safe = safe.replace(/\\*\\*([^*\\n]+)\\*\\*/g, '<strong>$1</strong>');
    // Italic: *x* -> <em>x</em> (only when not adjacent to letters)
    safe = safe.replace(/(^|[^*\\w])\\*([^*\\n]+)\\*(?!\\w)/g, '$1<em>$2</em>');
    // Links: [text](https://...) — only http/https
    safe = safe.replace(/\\[([^\\]\\n]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    // Bullet lists: lines starting with "- " group into <ul>
    var lines = safe.split("\\n");
    var out = [];
    var inList = false;
    for (var i = 0; i < lines.length; i++){
      var line = lines[i];
      var bullet = line.match(/^- (.+)$/);
      if (bullet){
        if (!inList){ out.push("<ul>"); inList = true; }
        out.push("<li>" + bullet[1] + "</li>");
      } else {
        if (inList){ out.push("</ul>"); inList = false; }
        out.push(line);
      }
    }
    if (inList) out.push("</ul>");
    // Line breaks: convert remaining \\n to <br>
    return out.join("\\n").replace(/\\n/g, "<br>");
  }

  var msgsEl = panel.querySelector("#sf-agent-msgs");
  var formEl = panel.querySelector("#sf-agent-form");
  var inputEl = panel.querySelector("#sf-agent-input");
  var sendBtn = panel.querySelector(".sf-agent-send");
  var closeBtn = panel.querySelector(".sf-agent-close");

  function appendMessage(role, content){
    var el = document.createElement("div");
    el.className = "sf-agent-msg " + role;
    if (role === "assistant" && content){
      // v1.28.2 — markdown rendering for agent responses (links, bold,
      // bullets, code spans). User + system messages stay as plain text.
      el.innerHTML = renderMarkdown(content);
    } else {
      el.textContent = content;
    }
    msgsEl.appendChild(el);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return el;
  }

  function appendTyping(){
    var el = document.createElement("div");
    el.className = "sf-agent-typing";
    el.setAttribute("aria-label", "Agent is typing");
    el.innerHTML = "<span></span><span></span><span></span>";
    msgsEl.appendChild(el);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return el;
  }

  // v1.28.2 — auto-grow textarea up to max-height
  function autoGrow(el){
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  function openPanel(){
    panel.classList.add("open");
    bubble.setAttribute("aria-expanded", "true");
    if (!msgsEl.children.length){
      appendMessage("assistant", CFG.greeting);
    }
    setTimeout(function(){ inputEl.focus(); }, 100);
  }
  function closePanel(){
    panel.classList.remove("open");
    bubble.setAttribute("aria-expanded", "false");
    bubble.focus();
  }

  bubble.addEventListener("click", openPanel);
  closeBtn.addEventListener("click", closePanel);

  // v1.28.2 — Esc closes panel; Enter sends, Shift+Enter newline
  document.addEventListener("keydown", function(e){
    if (e.key === "Escape" && panel.classList.contains("open")){
      closePanel();
    }
  });
  inputEl.addEventListener("input", function(){ autoGrow(inputEl); });
  inputEl.addEventListener("keydown", function(e){
    if (e.key === "Enter" && !e.shiftKey){
      e.preventDefault();
      formEl.requestSubmit();
    }
  });

  // v1.40.11 — sending flag prevents double-submit without disabling
  // the input. Pre-1.40.11 we set inputEl.disabled = true during send,
  // which on iOS Safari dismisses the soft keyboard. The later
  // inputEl.focus() call (outside a user gesture context) couldn't
  // reopen it, so the user had to tap the input again to send another
  // message. Mobile UX death.
  // Fix: leave the input enabled (keyboard stays up, focus preserved).
  // Disable the send button instead — gives visual feedback that the
  // send is in flight without breaking the input.
  var sending = false;

  formEl.addEventListener("submit", async function(e){
    e.preventDefault();
    if (sending) return; // ignore re-submits while a turn is in flight
    var msg = inputEl.value.trim();
    if (!msg) return;
    sending = true;
    inputEl.value = "";
    inputEl.style.height = "auto"; // reset textarea height after send
    if (sendBtn) sendBtn.disabled = true; // visual feedback, no keyboard impact
    appendMessage("user", msg);
    var typing = appendTyping();
    try {
      // v1.26.2 — request SSE stream for typewriter effect.
      var res = await fetch(CFG.turnUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
        body: JSON.stringify({
          conversation_id: conversationId,
          anonymous_session_id: sessionId,
          message: msg,
          stream: true,
          channel_meta: {
            referrer: document.referrer || null,
            page_url: location.href,
          }
        })
      });
      var ctype = (res.headers.get("content-type") || "").toLowerCase();
      if (ctype.indexOf("text/event-stream") === -1) {
        // Server fell back to JSON (older route, error, etc.)
        var data = await res.json();
        if (data.conversation_id) conversationId = data.conversation_id;
        typing.remove();
        appendMessage(data.message ? "assistant" : "system",
          data.message || "Something went wrong. Please try again.");
        return;
      }
      // SSE consumer ─────────────────────────────────────────────────
      // v1.28.2 — accumulate raw text + re-render markdown on each delta.
      // Re-rendering on every chunk keeps responses cheap (responses are
      // <600 chars typically) AND ensures bold/links/bullets resolve as
      // soon as the closing token streams in. ARIA-live=polite on the
      // messages region announces the final assistant response to AT
      // users without spamming on every token.
      typing.remove();
      var assistantEl = appendMessage("assistant", "");
      assistantEl.dataset.streaming = "true";
      var assistantText = "";
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = "";
      var currentEvent = "delta";
      while (true) {
        var step = await reader.read();
        if (step.done) break;
        buffer += decoder.decode(step.value, { stream: true });
        var lines = buffer.split("\\n");
        // keep last partial line in buffer
        buffer = lines.pop() || "";
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          if (line.indexOf("event:") === 0) {
            currentEvent = line.slice(6).trim();
          } else if (line.indexOf("data:") === 0) {
            var payload = line.slice(5).trim();
            if (!payload) continue;
            try {
              var json = JSON.parse(payload);
              if (currentEvent === "start" && json.conversation_id) {
                conversationId = json.conversation_id;
              } else if (currentEvent === "delta" && json.text) {
                assistantText += json.text;
                assistantEl.innerHTML = renderMarkdown(assistantText);
                msgsEl.scrollTop = msgsEl.scrollHeight;
              } else if (currentEvent === "done") {
                if (json.conversation_id) conversationId = json.conversation_id;
                // Final markdown re-render to catch any partial-token edges
                if (assistantText){
                  assistantEl.innerHTML = renderMarkdown(assistantText);
                }
              } else if (currentEvent === "error") {
                if (!assistantText) {
                  assistantEl.remove();
                  appendMessage("system", "Connection issue. Please try again.");
                }
              }
            } catch (parseErr) {
              // ignore malformed event chunk
            }
          }
        }
      }
      assistantEl.dataset.streaming = "false";
      if (!assistantText) {
        assistantEl.remove();
        appendMessage("system", "Something went wrong. Please try again.");
      }
    } catch (err) {
      typing.remove();
      appendMessage("system", "Connection issue. Please try again.");
    } finally {
      // v1.40.11 — re-enable button only. Don't toggle inputEl.disabled
      // and don't call inputEl.focus() — on iOS the programmatic focus
      // call (outside a user gesture) doesn't reopen the keyboard. The
      // input was never disabled, so focus + keyboard are preserved
      // naturally. User can type the next message immediately.
      sending = false;
      if (sendBtn) sendBtn.disabled = false;
    }
  });

  document.body.appendChild(bubble);
  document.body.appendChild(panel);
})();
`;
}
