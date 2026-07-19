# Visual-gating a host-gated route in dev: header-spoof proxies break hydration — split the gate

## The problem, in one line
The marketing landing only renders on marketing hosts (`src/proxy.ts` treats `localhost` as the app host and 307s `/` to /login), so the pre-merge visual gate needed a marketing-host render locally — but the obvious fix (a tiny local reverse proxy injecting `x-forwarded-host: www.seldonframe.com`) produced pages where React never hydrated at all: zero `__reactFiber` keys anywhere, no console errors, every button dead.

## The approach
1. Confirm the host gate with curl first: `curl -H "x-forwarded-host: www.seldonframe.com" http://localhost:3100/` → 200 marketing page (and without the header → 307 /login). The spoof works for SSR.
2. Run a ~15-line Node `http` proxy on :3101 that forwards to the dev server on :3100 adding the header. Browser screenshots through :3101 render perfectly — **SSR HTML + CSS need no hydration**, so all full-page visual shots (light, dark, mobile) are valid through the proxy.
3. Do NOT debug interactivity through the proxy. Diagnose with a fiber probe (`Object.keys(el).filter(k => k.startsWith("__react"))` on the dead button): empty through the proxy, populated on direct `http://localhost:3100/<public-route>`. The proxy environment kills hydration (Next 16 dev cross-origin/forwarded-host protection is the likely mechanism; it fails SILENTLY — no console error).
4. Verify interactions on a route that IS reachable on the direct host (here `/record`, public on any host) where hydration works, and push any interaction that structurally needs the marketing host (the `/` in-place mode flip) to the post-deploy live smoke list, logged explicitly as "not locally verifiable — harness limit, zero product signal".
5. Also probe hydration readiness before trusting any click result: a click during dev-server first-compile lands on un-hydrated SSR markup and silently does nothing — indistinguishable from a real bug until you check fibers.

## Judgment calls
- Did NOT edit the Windows hosts file (system config change), did NOT add `allowedDevOrigins` to next.config just for the gate (contaminates the artifact under test), did NOT add localhost to `marketingHosts` in product code (same reason).
- Did NOT keep debugging the proxy once the split (screenshots-via-proxy / interactions-direct) answered every gate question — the harness is not the product; time-box harness bugs.
- Treated "click did nothing, zero console errors" as a fact to bisect (fiber probe → direct-host control test), not as a product bug to fix — the same symptom had three possible causes (pre-hydration click, proxy-killed hydration, real handler bug) and only the control test separated them.

## The reusable rule, one line
A header-spoofing proxy is valid for SSR screenshots but silently kills Next dev hydration — split the visual gate (shots through the proxy, interactions on a direct-host public route, the rest to post-deploy smoke), and always fiber-probe before believing a dead click.

Related: `docs/learnings/2026-07-12-worktree-neon-branch-visual-gate.md` (the base method this extends), memory `vision-verify`.
