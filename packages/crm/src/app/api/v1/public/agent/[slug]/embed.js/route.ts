// v1.26.1 — agent embed.js endpoint
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

  if (!agentRow || agentRow.slug !== agentSlugPart || agentRow.status !== "live") {
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
  const themeRaw = (agentRow.theme ?? null) as { primaryColor?: string } | null;
  const primaryColor = themeRaw?.primaryColor ?? "#111111";
  const orgName = agentRow.orgName.replace(/[\\`$"<>]/g, "");

  const script = renderEmbedScript({
    turnUrl,
    greeting,
    primaryColor,
    orgName,
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
  primaryColor: string;
  orgName: string;
}): string {
  const config = {
    turnUrl: input.turnUrl,
    greeting: input.greeting,
    primaryColor: input.primaryColor,
    orgName: input.orgName,
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

  var style = document.createElement("style");
  style.textContent = [
    ".sf-agent-bubble{position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;background:" + CFG.primaryColor + ";color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,0.15);z-index:2147483646;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;border:none;font-size:24px;transition:transform .15s ease}",
    ".sf-agent-bubble:hover{transform:scale(1.05)}",
    ".sf-agent-panel{position:fixed;bottom:88px;right:20px;width:380px;max-width:calc(100vw - 40px);height:560px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,0.2);z-index:2147483647;display:none;flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}",
    ".sf-agent-panel.open{display:flex}",
    ".sf-agent-header{padding:14px 16px;background:" + CFG.primaryColor + ";color:#fff;display:flex;justify-content:space-between;align-items:center}",
    ".sf-agent-header strong{font-size:14px;font-weight:600}",
    ".sf-agent-close{background:transparent;border:none;color:#fff;cursor:pointer;font-size:20px;padding:0 4px;opacity:.85}",
    ".sf-agent-close:hover{opacity:1}",
    ".sf-agent-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:#f7f7f5}",
    ".sf-agent-msg{max-width:80%;padding:10px 12px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}",
    ".sf-agent-msg.user{align-self:flex-end;background:" + CFG.primaryColor + ";color:#fff;border-bottom-right-radius:4px}",
    ".sf-agent-msg.assistant{align-self:flex-start;background:#fff;color:#111;border-bottom-left-radius:4px;border:1px solid #e5e5e1}",
    ".sf-agent-msg.system{align-self:center;color:#888;font-size:12px;font-style:italic;background:transparent}",
    ".sf-agent-typing{align-self:flex-start;color:#888;font-size:13px;padding:8px 12px}",
    ".sf-agent-form{display:flex;gap:8px;padding:12px;border-top:1px solid #e5e5e1;background:#fff}",
    ".sf-agent-input{flex:1;padding:10px 12px;border:1px solid #e5e5e1;border-radius:10px;font-size:14px;outline:none;font-family:inherit}",
    ".sf-agent-input:focus{border-color:" + CFG.primaryColor + "}",
    ".sf-agent-send{padding:10px 16px;background:" + CFG.primaryColor + ";color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:14px;font-weight:600}",
    ".sf-agent-send:disabled{opacity:.5;cursor:not-allowed}",
    ".sf-agent-footer{padding:8px 12px;text-align:center;font-size:11px;color:#999;border-top:1px solid #f0f0ec;background:#fff}",
    ".sf-agent-footer a{color:#999}"
  ].join("");
  document.head.appendChild(style);

  var bubble = document.createElement("button");
  bubble.className = "sf-agent-bubble";
  bubble.setAttribute("aria-label", "Open chat");
  bubble.innerHTML = "&#128172;";

  var panel = document.createElement("div");
  panel.className = "sf-agent-panel";
  panel.innerHTML = [
    '<div class="sf-agent-header"><strong>' + escapeHtml(CFG.orgName) + '</strong>',
    '<button class="sf-agent-close" aria-label="Close chat">\\u00d7</button></div>',
    '<div class="sf-agent-messages" id="sf-agent-msgs"></div>',
    '<form class="sf-agent-form" id="sf-agent-form" autocomplete="off">',
    '<input class="sf-agent-input" id="sf-agent-input" type="text" placeholder="Type a message..." />',
    '<button class="sf-agent-send" type="submit">Send</button>',
    '</form>',
    '<div class="sf-agent-footer">Powered by <a href="https://seldonframe.com" target="_blank" rel="noopener">SeldonFrame</a></div>'
  ].join("");

  function escapeHtml(s){return String(s).replace(/[&<>"']/g, function(c){return ({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"})[c];});}

  var msgsEl = panel.querySelector("#sf-agent-msgs");
  var formEl = panel.querySelector("#sf-agent-form");
  var inputEl = panel.querySelector("#sf-agent-input");
  var closeBtn = panel.querySelector(".sf-agent-close");

  function appendMessage(role, content){
    var el = document.createElement("div");
    el.className = "sf-agent-msg " + role;
    el.textContent = content;
    msgsEl.appendChild(el);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return el;
  }

  function appendTyping(){
    var el = document.createElement("div");
    el.className = "sf-agent-typing";
    el.textContent = "Typing...";
    msgsEl.appendChild(el);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return el;
  }

  bubble.addEventListener("click", function(){
    panel.classList.add("open");
    if (!msgsEl.children.length){
      appendMessage("assistant", CFG.greeting);
    }
    setTimeout(function(){ inputEl.focus(); }, 50);
  });
  closeBtn.addEventListener("click", function(){ panel.classList.remove("open"); });

  formEl.addEventListener("submit", async function(e){
    e.preventDefault();
    var msg = inputEl.value.trim();
    if (!msg) return;
    inputEl.value = "";
    inputEl.disabled = true;
    appendMessage("user", msg);
    var typing = appendTyping();
    try {
      var res = await fetch(CFG.turnUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          anonymous_session_id: sessionId,
          message: msg,
          channel_meta: {
            referrer: document.referrer || null,
            page_url: location.href,
          }
        })
      });
      var data = await res.json();
      if (data.conversation_id) conversationId = data.conversation_id;
      typing.remove();
      if (data.message) {
        appendMessage("assistant", data.message);
      } else {
        appendMessage("system", "Something went wrong. Please try again.");
      }
    } catch (err) {
      typing.remove();
      appendMessage("system", "Connection issue. Please try again.");
    } finally {
      inputEl.disabled = false;
      inputEl.focus();
    }
  });

  document.body.appendChild(bubble);
  document.body.appendChild(panel);
})();
`;
}
