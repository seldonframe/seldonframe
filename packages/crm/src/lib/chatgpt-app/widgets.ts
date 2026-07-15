// ChatGPT App v2 — MCP Apps widget resources.
//
// Two self-contained HTML documents served over `resources/read`, rendered
// inline by an MCP Apps host (ChatGPT, or any other MCP Apps client) alongside
// the matching tool's result. Both documents are:
//   - typographic only — NO remote images, NO external requests (empty CSP)
//   - inline CSS/JS, system font stack, dark theme (#1F2B24 / #F6F2EA / green)
//   - defensive about untrusted data: every value from structuredContent is
//     written via textContent, never innerHTML
//   - tolerant of the "no input yet" state (approval-gated tools may mount the
//     widget before any tool-result arrives)
//
// Kept in their own file (rather than inline in chatgpt-mcp-rpc.ts) so the wire
// layer stays lean and readable — these are large template-literal blobs.

/** Stable MCP resource URIs. Referenced from tool descriptor `_meta.ui` and
 *  from `resources/list` + `resources/read`. */
export const BUILD_RESULT_WIDGET_URI = "ui://widget/build-result.html";
export const AGENT_CAROUSEL_WIDGET_URI = "ui://widget/agent-carousel.html";

/** The `_meta` object every widget resource's CONTENTS carry: the modern MCP
 *  Apps `ui` shape plus the legacy ChatGPT alias, both declaring an EMPTY CSP
 *  (no external connect/resource domains — the widgets are self-contained). */
function widgetResourceMeta(): Record<string, unknown> {
  return {
    ui: {
      prefersBorder: true,
      csp: { connectDomains: [], resourceDomains: [] },
    },
    "openai/widgetCSP": { connect_domains: [], resource_domains: [] },
  };
}

// ─── build-result card ────────────────────────────────────────────────────
//
// Renders a build_workspace result: business name, the live URL as the hero
// link, a row of four static chips (Website · Booking · CRM · AI chat), a
// primary "Open your site ↗" CTA (workspace url), and a secondary "Claim it
// (free)" CTA (claim url, omitted when absent). No prices, no upsell — the
// claim flow is free, full stop.

const BUILD_RESULT_WIDGET_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: transparent;
  }
  .card { background: #1F2B24; color: #F6F2EA; border-radius: 16px; padding: 20px 22px; max-width: 480px; }
  .biz { font-size: 12px; opacity: .7; margin: 0 0 6px; letter-spacing: .04em; text-transform: uppercase; }
  .hero { display: block; font-size: 19px; font-weight: 600; color: #4ade80; text-decoration: none; word-break: break-all; margin-bottom: 14px; }
  .hero:hover { text-decoration: underline; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 18px; }
  .chip { background: rgba(74,222,128,.12); color: #4ade80; border: 1px solid rgba(74,222,128,.35); border-radius: 999px; padding: 4px 12px; font-size: 12px; font-weight: 500; }
  .ctas { display: flex; gap: 10px; flex-wrap: wrap; }
  .btn { display: inline-block; text-decoration: none; font-size: 14px; font-weight: 600; border-radius: 10px; padding: 10px 16px; }
  .btn-primary { background: #4ade80; color: #0f1a12; }
  .btn-secondary { background: transparent; color: #F6F2EA; border: 1px solid rgba(246,242,234,.25); }
  .empty { opacity: .65; font-size: 14px; margin: 0; }
</style>
</head>
<body>
<div class="card" id="card"><p class="empty" id="empty">Building your workspace&hellip;</p></div>
<script>
(function () {
  var CHIPS = ["Website", "Booking", "CRM", "AI chat"];
  var card = document.getElementById("card");

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function render(data) {
    if (!data || typeof data.url !== "string" || data.url.length === 0) return;
    clear(card);

    var biz = document.createElement("p");
    biz.className = "biz";
    biz.textContent = typeof data.name === "string" && data.name ? data.name : "Your workspace";
    card.appendChild(biz);

    var hero = document.createElement("a");
    hero.className = "hero";
    hero.href = data.url;
    hero.target = "_blank";
    hero.rel = "noopener noreferrer";
    hero.textContent = data.url;
    card.appendChild(hero);

    var chips = document.createElement("div");
    chips.className = "chips";
    for (var i = 0; i < CHIPS.length; i++) {
      var chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = CHIPS[i];
      chips.appendChild(chip);
    }
    card.appendChild(chips);

    var ctas = document.createElement("div");
    ctas.className = "ctas";

    var open = document.createElement("a");
    open.className = "btn btn-primary";
    open.href = data.url;
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    open.textContent = "Open your site \\u2197";
    ctas.appendChild(open);

    if (typeof data.claimUrl === "string" && data.claimUrl.length > 0) {
      var claim = document.createElement("a");
      claim.className = "btn btn-secondary";
      claim.href = data.claimUrl;
      claim.target = "_blank";
      claim.rel = "noopener noreferrer";
      claim.textContent = "Claim it (free)";
      ctas.appendChild(claim);
    }
    card.appendChild(ctas);
  }

  function structuredContentOf(payload) {
    if (!payload) return null;
    if (payload.structuredContent) return payload.structuredContent;
    if (payload.result && payload.result.structuredContent) return payload.result.structuredContent;
    return null;
  }

  window.addEventListener("message", function (event) {
    var msg = event.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "ui/notifications/tool-result") {
      render(structuredContentOf(msg.params || msg));
    }
  });

  try {
    if (window.openai && window.openai.toolOutput) {
      render(window.openai.toolOutput);
    }
  } catch (e) {}
})();
</script>
</body>
</html>
`;

// ─── agent carousel ────────────────────────────────────────────────────────
//
// Renders a browse_marketplace result: a horizontal scroll row of up to 8
// free-agent cards (name, one-line description, category badge), each with a
// single "Add to my workspace" CTA. The CTA calls deploy_agent directly via a
// `tools/call` postMessage WHEN a workspace_token is available on the widget's
// own channel (result._meta / widgetState — never structuredContent, never
// hard-coded); otherwise it falls back to a `ui/message` follow-up so the
// model can drive deploy_agent itself.

const AGENT_CAROUSEL_WIDGET_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: transparent;
  }
  .row { display: flex; gap: 12px; overflow-x: auto; padding: 4px 2px 10px; -webkit-overflow-scrolling: touch; }
  .row::-webkit-scrollbar { height: 6px; }
  .row::-webkit-scrollbar-thumb { background: rgba(246,242,234,.2); border-radius: 3px; }
  .card { flex: 0 0 220px; background: #1F2B24; color: #F6F2EA; border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
  .badge { align-self: flex-start; background: rgba(74,222,128,.12); color: #4ade80; border: 1px solid rgba(74,222,128,.35); border-radius: 999px; padding: 2px 10px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .03em; }
  .name { font-size: 15px; font-weight: 600; margin: 0; }
  .desc { font-size: 13px; opacity: .75; margin: 0; line-height: 1.4; flex: 1; }
  .cta { margin-top: auto; background: #4ade80; color: #0f1a12; border: none; border-radius: 10px; padding: 9px 12px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .cta:active { opacity: .85; }
  .empty { opacity: .65; font-size: 14px; padding: 8px 2px; margin: 0; }
</style>
</head>
<body>
<div class="row" id="row"><p class="empty" id="empty">Browsing agents&hellip;</p></div>
<script>
(function () {
  var row = document.getElementById("row");
  var MAX_CARDS = 8;
  var token = null;

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  // Feature-detect a workspace_token the HOST may be carrying forward from an
  // earlier build_workspace tool result in this same conversation. There is no
  // channel that guarantees this reaches a DIFFERENT tool result's widget —
  // absence here is the normal case, and the CTA falls back to ui/message.
  function findToken(meta) {
    try {
      if (meta && typeof meta["seldonframe/workspaceToken"] === "string" && meta["seldonframe/workspaceToken"]) {
        return meta["seldonframe/workspaceToken"];
      }
    } catch (e) {}
    try {
      if (window.openai && window.openai.widgetState && typeof window.openai.widgetState.workspaceToken === "string") {
        return window.openai.widgetState.workspaceToken;
      }
    } catch (e) {}
    try {
      if (
        window.openai &&
        window.openai.toolOutput &&
        window.openai.toolOutput._meta &&
        typeof window.openai.toolOutput._meta["seldonframe/workspaceToken"] === "string"
      ) {
        return window.openai.toolOutput._meta["seldonframe/workspaceToken"];
      }
    } catch (e) {}
    return null;
  }

  function addToWorkspace(slug) {
    if (token) {
      window.parent.postMessage(
        {
          jsonrpc: "2.0",
          id: "deploy_" + slug + "_" + Date.now(),
          method: "tools/call",
          params: { name: "deploy_agent", arguments: { workspace_token: token, agent_slug: slug } },
        },
        "*",
      );
    } else {
      window.parent.postMessage(
        { type: "ui/message", payload: { content: "Install " + slug + " into my workspace" } },
        "*",
      );
    }
  }

  function render(data) {
    if (!data || !Array.isArray(data.agents)) return;
    clear(row);
    var agents = data.agents.slice(0, MAX_CARDS);
    if (agents.length === 0) {
      var empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "No agents found.";
      row.appendChild(empty);
      return;
    }
    for (var i = 0; i < agents.length; i++) {
      var agent = agents[i];
      if (!agent || typeof agent.slug !== "string" || typeof agent.name !== "string") continue;

      var card = document.createElement("div");
      card.className = "card";

      if (typeof agent.niche === "string" && agent.niche.length > 0) {
        var badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = agent.niche;
        card.appendChild(badge);
      }

      var name = document.createElement("p");
      name.className = "name";
      name.textContent = agent.name;
      card.appendChild(name);

      var desc = document.createElement("p");
      desc.className = "desc";
      desc.textContent = typeof agent.description === "string" ? agent.description : "";
      card.appendChild(desc);

      var cta = document.createElement("button");
      cta.className = "cta";
      cta.type = "button";
      cta.textContent = "Add to my workspace";
      (function (theSlug) {
        cta.addEventListener("click", function () {
          addToWorkspace(theSlug);
        });
      })(agent.slug);
      card.appendChild(cta);

      row.appendChild(card);
    }
  }

  function structuredContentOf(payload) {
    if (!payload) return null;
    if (payload.structuredContent) return payload.structuredContent;
    if (payload.result && payload.result.structuredContent) return payload.result.structuredContent;
    return null;
  }

  function metaOf(payload) {
    if (!payload) return null;
    if (payload._meta) return payload._meta;
    if (payload.result && payload.result._meta) return payload.result._meta;
    return null;
  }

  window.addEventListener("message", function (event) {
    var msg = event.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "ui/notifications/tool-result") {
      var payload = msg.params || msg;
      var t = findToken(metaOf(payload));
      if (t) token = t;
      render(structuredContentOf(payload));
    }
  });

  try {
    var t2 = findToken(null);
    if (t2) token = t2;
    if (window.openai && window.openai.toolOutput) {
      render(window.openai.toolOutput);
    }
  } catch (e) {}
})();
</script>
</body>
</html>
`;

/** One MCP resource descriptor + its self-contained HTML text. */
export type ChatGptWidgetResource = {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
};

/** The `resources/list` entries for the two widgets — no `text` here (that's
 *  `resources/read`'s job); listing stays a lightweight index. */
export const CHATGPT_WIDGET_RESOURCES: ChatGptWidgetResource[] = [
  {
    uri: BUILD_RESULT_WIDGET_URI,
    name: "Workspace build result",
    description: "Inline card showing the newly built workspace's live URL, chips, and free claim link.",
    mimeType: "text/html;profile=mcp-app",
  },
  {
    uri: AGENT_CAROUSEL_WIDGET_URI,
    name: "Agent carousel",
    description: "Horizontal row of free agents from browse_marketplace, each with an install CTA.",
    mimeType: "text/html;profile=mcp-app",
  },
];

/** The full `resources/read` contents entry for one widget URI, or undefined
 *  for an unknown URI (the handler turns that into a JSON-RPC error). */
export function getChatGptWidgetResourceContent(uri: string): Record<string, unknown> | undefined {
  const resource = CHATGPT_WIDGET_RESOURCES.find((r) => r.uri === uri);
  if (!resource) return undefined;
  const html = uri === BUILD_RESULT_WIDGET_URI ? BUILD_RESULT_WIDGET_HTML : AGENT_CAROUSEL_WIDGET_HTML;
  return {
    uri,
    mimeType: resource.mimeType,
    text: html,
    _meta: widgetResourceMeta(),
  };
}
