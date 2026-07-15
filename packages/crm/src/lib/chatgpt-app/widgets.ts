// ChatGPT App v2 — MCP Apps widget resources.
//
// Two self-contained HTML documents served over `resources/read`, rendered
// inline by an MCP Apps host (ChatGPT, or any other MCP Apps client) alongside
// the matching tool's result. Both documents are:
//   - typographic only — NO remote images, NO external requests (empty CSP)
//   - inline CSS/JS, brand look (paper #F6F2EA cards, ink #221D17, forest #1F2B24)
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
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Hanken Grotesk", "Segoe UI", system-ui, -apple-system, sans-serif;
    background: transparent;
  }
  .card { background: #F6F2EA; color: #221D17; border: 1px solid rgba(34,29,23,0.12); border-radius: 16px; padding: 22px 24px; max-width: 480px; }
  .biz { font-size: 11.5px; font-family: "DM Mono", ui-monospace, Consolas, monospace; font-weight: 500; color: #1F2B24; opacity: .8; margin: 0 0 8px; letter-spacing: .12em; text-transform: uppercase; }
  .hero { display: block; font-size: 17px; font-weight: 700; color: #1F2B24; letter-spacing: -0.01em; text-decoration: underline; text-decoration-color: rgba(31,43,36,0.35); text-underline-offset: 3px; word-break: break-all; margin-bottom: 16px; }
  .hero:hover { text-decoration-color: #1F2B24; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
  .chip { background: rgba(31,43,36,0.06); color: #1F2B24; border: 1px solid rgba(31,43,36,0.16); border-radius: 7px; padding: 4px 11px; font-size: 11px; font-weight: 600; font-family: "DM Mono", ui-monospace, Consolas, monospace; text-transform: uppercase; letter-spacing: .08em; }
  .ctas { display: flex; gap: 10px; flex-wrap: wrap; }
  .btn { display: inline-block; text-decoration: none; font-size: 14px; font-weight: 700; border-radius: 9px; padding: 11px 18px; letter-spacing: -0.01em; }
  .btn-primary { background: #221D17; color: #F6F2EA; }
  .btn-secondary { background: transparent; color: #221D17; border: 1.5px solid rgba(34,29,23,0.22); }
  .empty { color: rgba(34,29,23,0.6); font-size: 14px; margin: 0; }
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
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Hanken Grotesk", "Segoe UI", system-ui, -apple-system, sans-serif;
    background: transparent;
  }
  .row { display: flex; gap: 12px; overflow-x: auto; padding: 4px 2px 12px; -webkit-overflow-scrolling: touch; }
  .row::-webkit-scrollbar { height: 6px; }
  .row::-webkit-scrollbar-thumb { background: rgba(127,127,127,0.35); border-radius: 3px; }
  .card { flex: 0 0 232px; background: #F6F2EA; color: #221D17; border: 1px solid rgba(34,29,23,0.12); border-radius: 16px; padding: 18px 18px 16px; display: flex; flex-direction: column; gap: 9px; }
  .badge { align-self: flex-start; background: rgba(31,43,36,0.06); color: #1F2B24; border: 1px solid rgba(31,43,36,0.16); border-radius: 6px; padding: 3px 9px; font-size: 10.5px; font-weight: 600; font-family: "DM Mono", ui-monospace, Consolas, monospace; text-transform: uppercase; letter-spacing: .09em; }
  .name { font-size: 16px; font-weight: 700; letter-spacing: -0.01em; margin: 0; }
  .desc { font-size: 13px; color: rgba(34,29,23,0.72); margin: 0; line-height: 1.5; flex: 1; }
  .cta { margin-top: auto; background: #221D17; color: #F6F2EA; border: none; border-radius: 9px; padding: 10px 12px; font-size: 13.5px; font-weight: 700; letter-spacing: -0.01em; cursor: pointer; font-family: inherit; }
  .cta:active { opacity: .85; }
  .empty { opacity: .7; font-size: 14px; padding: 8px 2px; margin: 0; }
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
