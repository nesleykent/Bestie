# Contributing

Thank you for helping improve Bestie. Contributions may involve Tibia progress tracking, Hunt Analyzer processing, planning, bundled game data, documentation, accessibility, or repository maintenance.

## Before starting

- Search the [open issues](https://github.com/nesleykent/Bestie/issues) to avoid duplicate work.
- Use a bug report for broken behavior and a feature request for a new workflow or product change.
- Keep changes focused. Unrelated cleanup makes behavior and dataset changes harder to verify.
- Treat bundled Tibia metadata as read-only application data. Player-owned progress belongs in browser state, imports, or session records.

## Local development

The application is dependency-free and uses native HTML, CSS, and JavaScript modules. From the repository root, run:

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

Then open `http://127.0.0.1:4173/src/`. Stop the server with `Ctrl+C` when finished.

Python's basic server permits browser caching. If a module change appears to have no effect, hard-reload with `Cmd+Shift+R` on macOS or `Ctrl+Shift+R` elsewhere. Keeping **Disable cache** enabled in browser developer tools is useful during active development.

## Source responsibilities

| Path | Responsibility |
|---|---|
| `src/app/features/` | Parsing, calculations, planning, comparisons, and task estimates |
| `src/app/services/` | Read-only dataset loading |
| `src/app/state/` | Progress, sessions, persistence, transfers, and undo |
| `src/app/trackers/` | Tracker rules, fields, totals, and status |
| `src/app/ui/` | Shared and feature-specific rendering |
| `src/data/` | Bundled Tibia metadata snapshots |
| `src/styles/` | Design tokens and application styling |
| `docs/` | Product, UX, architecture, and audit documentation |
| `.github/` | GitHub templates and automation |

Read [Repository Structure](docs/repository-structure.md) before changing a responsibility boundary.

## Verification

Run checks that match the risk of the change. Before opening a pull request, at minimum:

```bash
git diff --check
rg --files src/app -g '*.js' | xargs -n1 node --check
for file in src/data/*.json; do python3 -m json.tool "$file" > /dev/null; done
```

For rendered changes, also verify:

- the intended page and primary interaction in a browser;
- the browser console has no relevant errors or warnings;
- desktop and mobile-sized layouts when responsive behavior is affected;
- filtering, persistence, undo, and import behavior when the changed surface uses them;
- no accidental loss of visible information or functional density.

For calculation changes, include a small reproducible example with known inputs and expected output. For dataset changes, state the source and snapshot date.

## Pull requests

A useful pull request explains the player problem, the chosen change, and how the result was verified. Include screenshots for visible changes and call out limitations or follow-up work explicitly.

Before submitting, confirm that:

- the change stays within the stated scope;
- names and rules match current Tibia terminology;
- character-wide progress is not accidentally stored as session-owned data;
- user-provided text and imported data are rendered safely;
- `README.md` and architecture documentation are updated when behavior or structure changes;
- all relevant checks pass.

By contributing, you agree that your contribution is licensed under the repository's [GPL-3.0 license](LICENSE).
