# Repository Structure

```text
Bestie/
|-- .github/
|   |-- ISSUE_TEMPLATE/
|   |   |-- bug_report.md
|   |   `-- feature_request.md
|   `-- workflows/
|       |-- ci.yml
|       `-- deploy-pages.yml
|-- docs/
|   `-- repository-structure.md
|-- src/
|   |-- app/
|   |   |-- features/
|   |   |   |-- charm-plan.js
|   |   |   |-- hunt-comparison.js
|   |   |   |-- opportunity-analysis.js
|   |   |   |-- session-analysis.js
|   |   |   |-- session-parser.js
|   |   |   `-- task-analysis.js
|   |   |-- services/
|   |   |   |-- achievements-repository.js
|   |   |   |-- bestiary-repository.js
|   |   |   |-- bosstiary-repository.js
|   |   |   |-- charms-repository.js
|   |   |   |-- measuring-tibia-repository.js
|   |   |   |-- quests-repository.js
|   |   |   `-- titles-repository.js
|   |   |-- state/
|   |   |   |-- app-workspace-transfer.js
|   |   |   |-- character-workspace.js
|   |   |   |-- hunt-workspace.js
|   |   |   |-- local-store.js
|   |   |   |-- tracker-progress.js
|   |   |   |-- tracker-transfer.js
|   |   |   `-- workspace-transfer.js
|   |   |-- trackers/
|   |   |   |-- achievements.js
|   |   |   |-- bestiary.js
|   |   |   |-- bosstiary.js
|   |   |   |-- charms.js
|   |   |   |-- measuring-tibia.js
|   |   |   |-- quests.js
|   |   |   |-- registry.js
|   |   |   `-- titles.js
|   |   |-- ui/
|   |   |   |-- render-all-tabs.js
|   |   |   |-- render-blocks.js
|   |   |   |-- render-character-switcher.js
|   |   |   |-- render-charm-plan.js
|   |   |   |-- render-comparison.js
|   |   |   |-- render-hunt-tabs.js
|   |   |   |-- render-opportunities.js
|   |   |   |-- render-results.js
|   |   |   |-- render-session-library.js
|   |   |   |-- render-tracker.js
|   |   |   |-- render-task-results.js
|   |   |   `-- render-task-sessions.js
|   |   |-- utils/
|   |   |   `-- formatters.js
|   |   `-- main.js
|   |-- data/
|   |   |-- achievements.json
|   |   |-- bestiary.json
|   |   |-- bosstiary.json
|   |   |-- charms.json
|   |   |-- measuring-tibia.json
|   |   |-- quests.json
|   |   `-- titles.json
|   |-- styles/
|   |   `-- main.css
|   `-- index.html
|-- .gitignore
|-- CONTRIBUTING.md
|-- index.html
|-- LICENSE
`-- README.md
```

## Notes

- All application runtime code lives under `src/`.
- Bestiary and Tasks are the two top-level modes over one session collection. A session holds shared evidence plus each
  mode's own state, and each mode keeps its own current view.
- `state/hunt-workspace.js` owns the session collection. Each session is the Bestiary analysis of one pasted Hunt Analyzer.
- `state/character-workspace.js` owns the character roster. Each character wraps one whole workspace (the shape `hunt-workspace.js` already defines); only the active character's workspace lives on the app's flat runtime state at any time, `state/app-workspace-transfer.js` exports/imports every character in one file, and `state/local-store.js`'s single-workspace key is read once, non-destructively, to migrate pre-multi-character data into the first character.
- `features/hunt-comparison.js` only ranks and combines Bestiary results that the sessions already calculated.
- Fixed Bestiary feature tabs are alphabetical: Bestiary Sessions, Charm Points Plan, Opportunities, and Session History. Individual session tabs follow them; `Compare Sessions` renders the charm-rate ranking within Bestiary Sessions.
- `state/workspace-transfer.js` serializes the workspace to a file and validates one on the way back in.
- Respawn mode is session metadata, availability is a workspace-level ignore list, and the plan's own respawn mode is a
  separate workspace value. All three filter only the planner's input, never a session's own data.
- `features/charm-plan.js` plans against available time only, and reads the per-creature times the session estimates produced.
- Bestiary Sessions rows are each session's own estimate rows. Only its summary aggregates them, by adding each session's longest time.
- The repository root is limited to metadata, documentation, license material, and the GitHub Pages redirect entry point.
- GitHub automation lives under `.github/` and is separated from application source.
