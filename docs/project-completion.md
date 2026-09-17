# Bestie project completion model

Last updated: 2026-09-17. Baseline: `a2359f7`. Status: **IN PROGRESS — not PROJECT_COMPLETE**.

## Authority and scope

Bestie is a dependency-free, static, local-first Tibia character companion. Its product comprises Tracking, Analysis, Data, Tools, Data Management, and a Dashboard presenting their owned data. The README's explicitly planned capabilities are part of this completion mission; reference repositories supply evidence, not additional requirements. Quest mission tracking, Weekly Delivery Tasks, automatic account mirroring, and guaranteed hunt performance remain expressly outside current product boundaries.

Evidence priority: explicit user commands and AGENTS.md; current product commitments; implementation and subsequent git decisions; historical proposals; external references. The August UX documents were imported in the initial September release and contain obsolete visual-approval gates and navigation proposals. Later commits `4c2b6a1`, `02f8f3d`, and `0af4cd2` establish Dashboard entry, sidebar navigation, and hash routing. These delivered choices are retained. Source `tracker-progress.js` explicitly supersedes the old mandatory source-group entry system with per-entry reviewed state. Historical requirements about data integrity, recoverability, contextual actions, and honest uncertainty remain relevant; obsolete redesign instructions do not authorize replacing working UI.

## Architecture reconstructed

- `src/app/main.js` coordinates events and renders the static shell. Pure feature engines live in `features/`; read-only metadata normalization in `services/`; progress rules in `trackers/`; HTML renderers in `ui/`.
- `character-workspace.js` owns the roster. One active workspace is projected into runtime state. `hunt-workspace.js` owns shared sessions, tracker records, planning constraints, and weapon plans.
- `bestie-app-v1` in localStorage stores all characters. Older Bestie and Bestiary Session Analyzer keys migrate without removing originals. Browser-local backup supports the legacy single workspace and current multi-character formats.
- Tracker progress stores user-owned fields, with absent values distinct from reviewed zero/no. Metadata and derived totals are never imported as canonical truth. Measuring Tibia derives area achievements.
- A session owns raw Hunt Analyzer text, processed duration and kills, selection, task target, date, mode, and notes. Bestiary progress belongs to the character. Proficiency uses all classified kills. Plans consume shared evidence.
- GitHub Pages publishes static files. CI runs Node tests, static integrity checks, and the staging build. Runtime has no package dependencies.

## PROJECT_COMPLETE gate

All confirmed rows below must be verified complete, or precisely documented as externally blocked after all independent work has finished. An external blocker is **not** PROJECT_COMPLETE. Optional enhancements are excluded from the gate.

1. Each README roadmap capability has a usable end-to-end implementation, clear ownership, honest missing/stale data states, and documentation matching runtime.
2. Existing seven trackers, shared sessions, Bestiary/Task/proficiency calculations, comparisons and planning retain their working behavior and density.
3. Invalid text/imports/storage failures cannot silently replace valid progress or produce invented estimates. Supported legacy backups and browser state survive migration.
4. Data sources have provenance, snapshot/update contracts, validation, and appropriate attribution. Automatic repository data remains separate from private browser progress.
5. Unit/integration tests cover formulas with independent examples, malformed parser input, planner behavior, transfer/migrations, and source adapters. Complete tests/lint/build pass.
6. Actual desktop and mobile browser checks cover navigation, editing, plans, tools, persistence, backup/restore, errors and console health. Screenshots substantiate layout checks.
7. A final fresh audit checks every item, reference mapping, TODO/placeholder/dead paths and documentation. Changes are committed and synchronized to GitHub; optional work and external blockers are reported honestly.

## Completion ledger

Every row includes its evidence, implementation state/files, dependencies, plan and verification. Status vocabulary: OPEN, IMPLEMENTING, VERIFIED, EXTERNALLY BLOCKED, OPTIONAL.

| ID / classification | Requirement and evidence | Current state / files | Dependencies and implementation plan | Verification | Status |
|---|---|---|---|---|---|
| C01 CONFIRMED REQUIREMENT | Seven accurate progression trackers; README Feature reference | Implemented in `trackers/`, `services/`, `tracker-progress.js`; coverage concentrated on achievements/context | Audit all threshold/currency/derived-area rules; add independent semantic tests | Dataset-backed fixtures, zero/unknown, derived achievements, import and undo | OPEN |
| C02 DEFECT / TEST GAP | Safe persisted state and backup/restore; README ownership, UX recovery | `app-workspace-transfer.js` accepts malformed character arrays; nested sessions trusted; future versions not rejected; UI replaces roster | Strict non-destructive import validation; normalize legacy storage safely; review counts and recovery; never discard valid data on invalid restore | Malformed/future/legacy backups, character isolation, roundtrip, browser restore | OPEN |
| C03 DEFECT / TEST GAP | Storage failure feedback and complete reset; local-first contract | `local-store.js` reads storage getters outside guards; clear result ignored by `main.js`; preference key omitted | Guard getter access; ensure reset outcome accurate; preserve evidence when storage unavailable/corrupt | Throwing getter/quota/removal tests and browser feedback | OPEN |
| C04 CONFIRMED REQUIREMENT / PARTIAL IMPLEMENTATION | Full Hunt Analysis; README Analysis expansion | `session-parser.js` reads duration/kills only; one shared archive exists | Extend shared parser with XP, rates, loot/supplies/balance, damage/healing, drops and diagnostics; persist processed evidence independently from drafts; add analysis and comparison UI | Real representative exports, missing vs zero, signed balance, malformed/grouped counts, draft stability | OPEN |
| C05 DEFECT / TEST GAP | Honest Bestiary/Task estimates and optimal Charm Plan; README formulas | `session-analysis.js`, `task-analysis.js`, `charm-plan.js`; time parser accepts invalid substrings; task missing rate yields zero time; duplicate objectives can inflate reward | Validate inputs, preserve uncertainty, enforce one completion reward per creature; test optimizer against independent small exhaustive search | Exact formulas, zero rate, stage bounds, duplicate creatures, budget and tie-break examples | OPEN |
| C06 CONFIRMED REQUIREMENT | Charmwise; README Analysis expansion | Charms tracked but no recommendation engine | Use recorded budget/stages and creature/hunt context; expose reasons, affordability and unknown inputs; promotion echoes supported explicitly | Budget isolation, upgrade costs, comparable contextual candidates, UI | OPEN |
| C07 CONFIRMED REQUIREMENT / DATA GAP | Curated Hunt Grounds and objective-based Hunt Planner; README Data/Analysis expansion | No ground dataset or planner | Inspect TibiaPal and exiva references; provenance-preserving curated adapter; level/vocation/objective filters; link measured sessions without treating XP/h as creature kill rate | Schema/duplicate/source checks, supported vocation filters and measured-vs-reference separation | OPEN |
| C08 CONFIRMED REQUIREMENT | Repository character configuration and automated Character History; README data model | Roster is local only; no configured public-data pipeline | TibiaData adapter, timestamped snapshots/highscore/death evolution, scheduled update workflow, empty/stale states; do not publish local sessions | API fixtures/errors, idempotent same-period updates, character changes and world resolution | OPEN |
| C09 CONFIRMED REQUIREMENT | World-specific Market Watch; README data expansion | No implementation | Resolve configured World, selected item config, TibiaMarket source adapter and refresh pipeline; timestamps and unavailable prices; share with Imbuements | World/item mismatch rejection, freshness, missing price, source failures | OPEN |
| C10 CONFIRMED REQUIREMENT | Elemental Damage tool; README Planned tools | Bestiary service omits combat stats; no calculator | Source-backed creature resistance/HP data where available; pure elemental math, explicit unknowns; compact tool UI | Neutral/resistant/weak/immune examples, mixed attacks and incomplete data | OPEN |
| C11 CONFIRMED REQUIREMENT | Imbuements tool; README Planned tools | No implementation | Canonical stages/materials, manual prices with optional Market evidence, duration/cost/value calculations | Material totals, guarantee/success assumptions, cost per hour and missing prices | OPEN |
| C12 CONFIRMED REQUIREMENT | Minimap Markers local merge/conversion/backups; README Planned tools | No implementation | Study tibia-maps-merge and TibiaMaps format; own validated binary/JSON parser and coordinate merge retaining personal entries; downloads and review | Binary roundtrip, truncated/bad files, Unicode, same-coordinate conflicts, original backup preserved | OPEN |
| C13 CONFIRMED REQUIREMENT | Morning Tibia World Board / Guide parsing; README Planned tools | No implementation | Adapt explicitly licensed domain/parser references; world-aware local inputs, detected/unknown outcomes, no invented inactive states | Reference fixtures, partial/malformed dialogue, manual correction, browser UI | OPEN |
| C14 CONFIRMED REQUIREMENT | Stamina and XP & Level tools; README Planned tools | No implementation | Verify formulas and thresholds; pure engines and compact accessible forms with units and edge validation | Independent level XP, inverse boundaries, stamina threshold crossing and rates | OPEN |
| C15 CONFIRMED REQUIREMENT / PARTIAL IMPLEMENTATION | Data Management selected/all clearing, migration, export/restore; README expansion | Whole backup, tracker CSV/JSON, all reset exist; selected clearing absent | Shared data-management page with scoped counts, preview and recovery; source caches distinct | Scope isolation, confirmed clears, cancellation, backup compatibility, undo | OPEN |
| C16 CONFIRMED REQUIREMENT / PARTIAL IMPLEMENTATION | Dashboard connects progression/history/hunts/analysis/Market/tools; README Dashboard expansion | Tracker summaries only in `render-dashboard.js` | Present existing owned data and contextual next actions; preserve compact tracker summary density | Empty/populated/missing/stale views, action destinations, phone and desktop | OPEN |
| C17 PARTIAL IMPLEMENTATION | Persistent objective/return/recovery loop; UX journey and scenarios | Bookmarks, plan inputs and sessions persist; no explicit objective entity or reconciliation workflow | Retain accepted navigation; introduce scoped objective state and source links, correction return context and explicit evidence-to-truth review without automatic kill addition | Resume objective, source changes, cross-tracker goal, reconciliation/cancel/undo | OPEN |
| C18 DOCUMENTATION GAP | Docs describe delivered product; README and CONTRIBUTING | Roadmap lists implemented backup as future; repository map has removed files/styles; old approval gates contradict later implementation | Mark historical proposals explicitly; update architecture, feature docs, source contracts and commands as delivered | Link/file checks plus manual doc-to-runtime audit | OPEN |
| C19 TEST GAP | End-to-end validation and release integrity | 53 baseline tests pass; no durable browser suite; Pages can deploy independently of CI | Expand relevant tests; portable browser scenario script; gate deployment with checks | Full test/lint/build, browser scenarios at desktop/mobile, workflow inspection | OPEN |
| C20 DATA GAP | Snapshot completeness, provenance and updateability; README bundled datasets | Seven datasets with stated counts; no consolidated source manifest or semantic validation | Audit actual records, source dates, foreign progress fields and links; source manifest and reproducible refresh where feasible | Required fields, unique identities, thresholds, costs, cross-dataset joins, update diff | OPEN |

## Reference ecosystem ledger

Sources are checked out read-only under `/tmp/bestie-references` for inspection. Record exact revisions and license decisions in `docs/data-sources.md` before incorporating source material.

| Reference | Relevance / decision |
|---|---|
| nesleykent/exiva-xp | Shared static architecture, full analyzer, character crawler, grounds/market/tool domain evidence. No root license observed: inspect concepts and formulas, do not blindly copy implementation or private character history. |
| nesleykent/tibia-maps-merge | Binary marker format, coordinate priority and backup workflow directly match C12. No root license observed: independent implementation unless licensing is established. |
| nesleykent/morning-tibia | MIT; World Board and Guide parser/dataset directly relevant to C13. Preserve notice if adapted. |
| tibiamaps/tibia-kill-stats | Official world kill statistics; may corroborate creature naming, not personal kill-rate evidence. |
| xandymelo/TibiaServerLog | Server-log parsing differs from Hunt Analyzer; useful malformed input/examples, not automatic scope expansion. No root license observed. |
| gstadtler/tibia-server-log | Server-backed parser UI; backend dependency does not fit local-first architecture. No wholesale reuse. |
| mathiasbynens/tibia-xp-history | TibiaData crawler/date/XP history architecture relevant to C08/C14; inspect provenance/license. |
| tibiadata/tibiadata-api-assets | MIT; world/creature/spell reference identifiers, generated-data workflow. |
| tibiamaps/tibia-map-data | Community markers useful to C12; inspect format/license selectively without cloning tile history. |
| Galarzaa90/tibiawiki-sql | Apache-2.0 generator and explicit TibiaWiki data attribution; combat and imbuement schema/provenance reference. |
| mathiasbynens/tibia-bosses | Boss/kill history reference; broader spawn prediction is optional unless supported by Bestie requirements. |
| Coder-World04/Complete-System-Design | Broad architecture reference; distributed services are not required for this static application. Selective inspection only. |
| PawelKusnierek/TibiaPal | MIT; grounds, XP/stamina/imbuement domain evidence and source fixtures. Preserve notice for copied data/code. |

## Optional enhancements (excluded from gate)

- Live account synchronization or credential-based access.
- Quest mission graphs, Weekly Delivery Task estimation, equipment/Wheel inference.
- Boss spawn prediction, public social logbooks, automatic gameplay/map interaction.
- Framework/backend rewrite or wholesale UI redesign.
- New weapon threshold catalog without a reliable source; manual targets remain supported.

## Validation log

- Baseline 2026-09-17: `npm test` **53/53**, `npm run lint` **pass**, `npm run build` **pass**.
- Baseline git: `main` matches origin `a2359f7`; user-owned untracked `bestielogo1.png` and `bestielogo2.png` left untouched.
- Network tools require sandbox escalation; escalated `git ls-remote` succeeds. GitHub authentication must be rechecked outside sandbox before calling it blocked.
- Claude secondary read-only audit launched; output pending in `/tmp/bestie-claude-audit.txt`.

## External blockers

None established yet. Configuration choices, source availability, and service access are under investigation. Missing configuration must produce a useful setup state and does not block independent implementation.

## Next work

Finish source/runtime investigation, address integrity defects first, then shared full analysis and tool/data dependencies. Update each row with implementation and verification evidence as work lands. Never infer completion from this document or test counts alone.
