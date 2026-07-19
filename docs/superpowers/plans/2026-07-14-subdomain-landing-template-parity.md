# Subdomain landing-template parity — plan

Spec: `docs/superpowers/specs/2026-07-14-subdomain-landing-template-parity-design.md`
Worktree: `.claude/worktrees/nostalgic-mcnulty-bcc4e0`, branch `claude/cranky-driscoll-e2efa0` off `origin/main` @ `ea4bffd9d`.

TDD, commit-per-task. Run single specs with
`cd packages/crm && node --import tsx --test tests/unit/landing/render-landing-template.spec.ts`
(the repo runner `node scripts/run-unit-tests.js` globs everything and has a
known DB-bound failure baseline — judge full-suite runs by delta only;
baseline log: scratchpad `unit-baseline.log`).

## Task 1 — shared `renderLandingTemplate` (test-first)

1. Write `packages/crm/tests/unit/landing/render-landing-template.spec.ts`
   covering spec test cases 1–6. Reuse the fixture style of
   `tests/unit/r1-payload-to-template.spec.ts` (a representative
   `R1LandingPayload` + a raw-soul object). Assert on the returned element's
   `type` (`=== LANDING_TEMPLATES["clinical-luxe"]` etc.) and `props`
   (`data.business_name`, `ctas.bookUrl/intakeUrl/callHref`, `theme`).
   `process.env.WORKSPACE_BASE_DOMAIN` may be unset — assert hrefs contain the
   slug + `/book` / intake path rather than a hardcoded host, or set the env
   var in the spec's setup. Run → **must fail** (module doesn't exist).
2. Create `packages/crm/src/lib/landing/render-landing-template.tsx` per the
   spec signature. Body = /w's current template branch
   (`/w/[slug]/page.tsx:179-206`) lifted verbatim:
   - `if (!isLandingTemplateId(input.landingTemplate)) return null;`
   - `const Tpl = LANDING_TEMPLATES[input.landingTemplate];`
   - `withTemplateDefaults(input.r1 ? r1PayloadToTemplateData(input.r1.payload) : submittedSoulToTemplateData(input.soul), input.landingTemplate)`
   - `const explicitArchetype = input.r1?.archetype ?? input.themeArchetype;`
   - `explicitArchetype && explicitArchetype in ARCHETYPES ? archetypeToSfTheme(explicitArchetype as AestheticArchetypeId) : undefined`
   - return `<Tpl data={templateData} ctas={buildTemplateCtas(input.slug, input.orgId, templateData.phone)} theme={sfTheme} />`
   Carry over /w's explanatory comments (default-photos fill, explicit-archetype-only
   re-skin) — they document non-obvious intent.
3. Run the spec → green. Commit
   `feat(landing): extract shared renderLandingTemplate from /w's template branch`.

## Task 2 — /w refactor (behavior-preserving)

1. In `packages/crm/src/app/(public)/w/[slug]/page.tsx`, replace the inline
   template branch (lines ~179-206) with:
   ```tsx
   const templatePage = renderLandingTemplate({
     slug,
     orgId: ctx.orgId,
     landingTemplate,
     r1: r1 ? { payload: r1.payload, archetype: r1.archetype } : null,
     soul: ctx.soul,
     themeArchetype: ctx.theme?.aestheticArchetype,
   });
   if (templatePage) {
     return (
       <>
         {templatePage}
         {chatbotEmbed && <ChatbotEmbedScript embedUrl={chatbotEmbed.embedUrl} />}
       </>
     );
   }
   ```
   Keep the big "Health-templates pilot" comment (move/trim as fits). Drop the
   now-unused imports (`LANDING_TEMPLATES`, `withTemplateDefaults`,
   `r1PayloadToTemplateData` — note `submittedSoulToTemplateData` is still used
   by `generateMetadata`; `isLandingTemplateId`, `archetypeToSfTheme`,
   `buildTemplateCtas` become unused; `ARCHETYPES`/`AestheticArchetypeId` are
   still used by the R1 liveArchetype block). Verify each import's remaining
   usage before removing — don't guess.
2. Full unit run delta-clean + `npx tsc --noEmit` delta-clean (see repo
   worktree-typecheck method; judge by delta vs main, not absolute zero).
   Commit `refactor(landing): /w template branch → shared renderLandingTemplate`.

## Task 3 — /s home branch honors landingTemplate (the fix)

`packages/crm/src/app/(public)/s/[orgSlug]/[...slug]/page.tsx`:

1. In the `isHomePage(pageSlug)` branch of the default export:
   - **r1 case:** immediately after `if (r1Data) {`, before the href rewrite:
     ```tsx
     // Health-templates parity (mirrors /w/[slug]): a workspace that picked a
     // premium template renders it on its subdomain too — /w and the subdomain
     // must never diverge. The template builds its own workspace-scoped CTAs,
     // so it skips the r1 href-rewrite below.
     const templatePage = renderLandingTemplate({
       slug: orgSlug,
       orgId: r1Data.orgId,
       landingTemplate: r1Data.landingTemplate,
       r1: { payload: r1Data.payload, archetype: r1Data.archetype },
       soul: null,
       themeArchetype: r1Data.theme?.aestheticArchetype,
     });
     if (templatePage) {
       const embed = await getPublicChatbotEmbed(r1Data.orgId);
       return (
         <>
           {templatePage}
           {embed && <ChatbotEmbedScript embedUrl={embed.embedUrl} />}
         </>
       );
     }
     ```
   - **soul-only case:** in the `else` of `if (r1Data)` (new — today the null
     case just falls through), resolve `getWorkspaceTemplateContext(orgSlug)`;
     if ctx non-null, call `renderLandingTemplate` with
     `landingTemplate: ctx.theme?.landingTemplate`, `r1: null`, `soul: ctx.soul`,
     `themeArchetype: ctx.theme?.aestheticArchetype`; non-null → return it +
     chatbot embed for `ctx.orgId`. Null / no ctx → fall through to the legacy
     PageRenderer path unchanged.
2. `generateMetadata` home branch: when `loadLandingPayload` returns null,
   mirror /w's soul fallback (`getWorkspaceTemplateContext` →
   `submittedSoulToTemplateData`; bail to `{}` when soul has no real
   business_name — /w uses the `"Our Practice"` sentinel; robots per
   `!(ownerId === null && settings["origin"] === WEB_UNGATED_ORIGIN)` — inline
   the predicate, do NOT export the helper from /w's page.tsx (route-file
   exports gotcha, L-31); canonical `/w/${orgSlug}`).
3. Full unit run delta-clean + tsc delta-clean. Commit
   `fix(landing): subdomain /s home honors theme.landingTemplate — /w parity`.

## Task 4 — gate

`/verify-build` via the verify-runner agent (independent checker), then
reviewer on the whole diff. Fix-forward on FAIL; nothing merges without green.

## Guardrails

- Minimal impact: no changes to the legacy PageRenderer path, the /s services
  branch, or /w's R1 (non-template) path beyond the extracted function call.
- No new deps, no migrations, no env vars.
- The shared module stays pure (no db imports) so it unit-tests without mocks
  and either route can call it from any context.
