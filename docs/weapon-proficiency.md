# Weapon Proficiency

## Repository investigation and integration

Bestie is a dependency-free HTML/CSS/native JavaScript module application. `index.html` redirects to `src/index.html`; `src/app/main.js` coordinates feature renderers and events. Before this feature, navigation only changed `mode`/view state; no URL router existed. `state/page-route.js` now adapts that same navigation to hash URLs. A plain entry URL still opens Dashboard. The dedicated page is `src/index.html#weapon-proficiency`; optional `?session=<id>` inside the hash selects an existing session. Hashes stay entirely client-side, preserving direct entry, reload and history under `/Bestie/` on GitHub Pages.

The existing sidebar owns navigation; `render-proficiency.js` renders a full page into its shared page shell. It uses `render-blocks`, existing formatters, controls, tables, design tokens and the existing responsive breakpoints. Metrics use four columns on desktop and two on small screens; the full creature table remains keyboard-scrollable inside its own region. No existing information is removed to fit the new feature.

| Responsibility | Existing source / integration |
|---|---|
| Hunt Analyzer | `features/session-parser.js`: one `parseHuntSession` result feeds Bestiary and Tasks when processed |
| Creature source | `data/bestiary.json` → `services/bestiary-repository.js`; canonical `difficulty` → `Difficulty` |
| Name matching | `features/creature-names.js`: trim, collapse whitespace, case-insensitive exact match; no alias catalog exists in this snapshot |
| Bestiary calculations | `features/session-analysis.js`; character-wide progress and charm reward remain independent |
| Charm Plan | `features/charm-plan.js`; no proficiency changes to its reward optimization |
| Shared session | `state/hunt-workspace.js`: duration plus all normalized kills in existing `taskMonsters`, Bestiary analysis in `matchedMonsters` |
| Proficiency | `features/weapon-proficiency.js`: pure calculation using all session kills, regardless of selected/completed Bestiary entries |
| History / Compare | `ui/render-session-library.js`, `ui/render-comparison.js`, proficiency comparison renderer; derive values on demand |
| Character / persistence | Existing `character-workspace.js`, `local-store.js`, `getWorkspaceSnapshot`, export/import; no new storage key |
| Weapon plans | `state/weapon-plans.js`; only user-owned weapon identifier/current XP/target XP and active plan are saved |
| Styles / formatters | Existing `styles/tokens.css`, `styles/app.css`, `utils/formatters.js` |
| Test / lint / build | Node built-in test runner; dependency-free static integrity checks and staging build; no existing TS typecheck |
| Deployment | Existing `.github/workflows/deploy-pages.yml` uploads the repository on pushes to `main`; no server rewrite needed |

```text
Hunt Analyzer → parseHuntSession → normalized duration + all creature kills
                                  ├─ Bestiary engine → progress / charm plan
                                  └─ shared session → difficulty → proficiency engine
                                                      ├─ Weapon Proficiency page
                                                      ├─ Session History
                                                      └─ Compare Sessions
```

## Calculation and data contract

`PROFICIENCY_BY_DIFFICULTY` in `features/weapon-proficiency.js` is the only runtime XP reward table. It contains Harmless 1, Trivial 30, Easy 70, Medium 100, Hard 165, Challenging 240. Every one of the 833 canonical creature entries has a recognized difficulty in the current snapshot. No classification discrepancies were found and no dataset values were changed. Normal creature XP is neither loaded for this engine nor used to infer difficulty.

Per creature: kills × reward. Session total: sum of classified, valid creature totals. XP/h: total ÷ (duration in minutes ÷ 60). Contributions are unrounded percentages of the known subtotal; the UI rounds percentages to one decimal, so displayed percentages may not sum to exactly 100%. XP totals remain exact integers. The fixture contains 600 Makara (Hard) and 450 Rotten Golem (Challenging): 99,000 + 108,000 = 207,000 XP; 90 minutes yields 138,000 XP/h.

Unknown creatures remain visible as **Unclassified** with no invented XP. Invalid kills or unsupported integer ranges create diagnostics. A partial result displays **Known** XP/rate and a subtotal; no partial result wins the proficiency ranking or drives time/session projections. Zero/invalid duration displays an unavailable rate rather than Infinity. Valid zero kills remain zero. Integer XP is supported up to JavaScript's safe integer range; totals exceeding it are unavailable rather than rounded silently.

The parser preserves the documented English `Session: HH:MMh` and `<count>x <name>` format. Invalid kill lines and unsafe counts are diagnosed instead of silently converting a negative or fractional suffix to positive kills. Its legacy extraction exports remain available. Bestiary and Tasks consume the same parsed object during processing.

Older sessions with all-creature evidence use their existing `taskMonsters`; older raw-only sessions can reuse the parser. Sessions containing only matched rows and no raw/all-creature evidence are conservatively labeled partial. New parsing diagnostics are persisted with the processed evidence, so editing an unprocessed draft does not rewrite calculated results. Derived proficiency totals/breakdowns are never persisted.

## Weapon planning and limits

Plans belong to the active character and identify a particular weapon. Named plans have independent manual current XP and target XP; switching a plan does not move XP between weapons. The session measures an assumed rate, not an automatic allocation of kills to equipment. Remaining XP is `max(0, target-current)`, time is remaining/rate, equivalent sessions are remaining/session XP, and optional single-creature kills are rounded up. Reached targets yield zero remaining work.

No official weapon threshold catalog or reliable threshold reference was present in the repository. Targets are manual; the pure planner accepts `targetXP` so a future verified milestone catalog can provide it without changing the engine. The Hunt Analyzer does not identify equipped weapons or how kills were distributed among them. These concrete limits are shown in the page.

## Verification

`npm test` covers all six reward classes, the exact mixed-session example, unknown/missing difficulty, invalid and zero duration/kills, large and tiny values, subtotal equality, parsing and domain integration, legacy saves, character isolation, export/import, route serialization, rendered escaping, ranking and existing Bestiary/Task/Charm contracts.

`npm run lint` checks every JS module's syntax, relative imports, bundled JSON, duplicate entry-page IDs and local assets. `npm run build` stages the unchanged static application under ignored `dist/`. There was no automated unit test suite, package manifest, lint tool or compiler before this feature; existing CI structure/data validation is retained and the new checks are added. No TypeScript typecheck is configured or claimed.

Browser validation uses Playwright with an isolated Chrome profile and a local static server mounted at `/Bestie/`, matching the deployment prefix. Checks cover direct URL, reload, history, internal navigation, shared sessions, character/weapon isolation, zero duration, unknown creatures, history/comparison and desktop/tablet/mobile layouts. Temporary screenshots and review output are kept outside the repository.
