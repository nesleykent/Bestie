# Bounded progress evidence in planning and analysis

Scope: `src/app/features/session-analysis.js`, `opportunity-analysis.js`, `hunt-comparison.js`
(the all-tabs/Bestiary Sessions aggregate — there is no separate `all-tabs-analysis.js` file;
`buildAllTabsAnalysis`/`aggregateAllTabsSummary` live in `hunt-comparison.js`), and
`charm-plan.js`. Tests: `tests/planning-evidence.test.js`. This addresses the remaining
planning-correctness items under completion ledger row **C05** in
`docs/project-completion.md`; it does not set that row's status.

The pure engine work was independently reviewed and integrated into the existing coordinator and renderers.

## The problem

`getBestiaryKills` in `main.js` already derives a kill floor from a stage tile via
`bestiaryTracker.derive(...).kills` (see `src/app/trackers/bestiary.js`), so a floor was never
literally invented as a typed count. But once that single number left the tracker, every
planning engine treated it as an exact fact:

- `session-analysis.js`'s `recalculateProgress` even **coerced** whatever it was handed with
  `Number(...)`. A plain floor number survived that; anything richer than a number (i.e. the
  evidence object this change introduces) would have silently become `NaN → 0`. This is fixed
  as part of this change (see below) — it was latent because nothing had tried to pass
  richer evidence in yet.
- `opportunity-analysis.js` had no concept of "never recorded" at all — a creature with no
  Bestiary entry and a creature with a confirmed zero kill count were computed identically,
  and both could be ranked "Finishable Now" the moment any session happened to measure a rate
  for them.
- `hunt-comparison.js`'s `aggregateAllTabsSummary` summed each hunt's independent
  `summarizeBestiaryMonsters(...)` output. A creature selected in two hunts paid out its full
  charm reward twice, and the combined time summed both hunts' independent "slowest selected
  monster" bottlenecks even when they shared the same bottleneck creature.

## The evidence shape

`session-analysis.js` exports a new normalizer:

```js
normalizeProgressEvidence(value) // → { kills, known, isFloor, killsCeiling }
```

`value` is accepted in two forms:

- **A bare number** (every existing caller) → `{ kills: value, known: true, isFloor: false, killsCeiling: null }`.
  Numerically and behaviorally identical to today.
- **An evidence object** → `{ kills, known, isFloor, killsCeiling }`, where:
  - `known: false` means the entry was never touched at all (no tile, no typed count).
    `kills` is meaningless in this case and is not trusted for anything except the existing
    pessimistic ("assume no progress") fields.
  - `known: true, isFloor: true` means a tile was picked but no exact count was typed —
    `kills` is the floor that tile implies and `killsCeiling` (nullable) is the most it could
    hide, exactly `bestiaryTracker.derive(...).killsCeiling`.
  - `known: true, isFloor: false` is an exact count — a typed number, or a reviewed "never
    killed" (`STAGE_NEVER_KILLED`) zero.

This mirrors `deriveBestiaryRow`'s own `kills` / `isFloor` / `killsCeiling` / `answered`
fields one-for-one, so the mapping from a tracker row to evidence is a direct field rename,
not new logic (see main.js wiring below).

## Engine changes (additive; legacy numeric callers unaffected)

**`session-analysis.js`** — `buildMonsterProgress` (used by `analyzeSession` and
`recalculateProgress`) now normalizes its `totalKills` argument through
`normalizeProgressEvidence`. Every existing field (`totalKills`, `remainingKills`,
`timeRemainingMinutes`, `charmsPerHour`, ...) keeps its exact prior value and meaning for a
bare-number input — it is still the pessimistic "assume no more progress than proven" reading.
New, additive fields:

- `progressKnown` (bool) — `false` only for a genuinely untouched entry.
- `isProgressFloor` (bool) — `true` for a stage-tile-only reading.
- `remainingKillsAtLeast`, `timeRemainingMinutesAtLeast` — the optimistic bound: `0` for an
  untouched entry (it could already be complete), the tile's ceiling-derived remainder for a
  floor, and identical to the existing pessimistic fields for an exact count.

`summarizeBestiaryMonsters` gained matching additive fields:
`maxTimeRemainingMinutesAtLeast`, `hasUnknownProgress`, `hasFloorProgress`. Its existing
`totalCharms` / `maxTimeRemainingMinutes` / `totalCharmsPerHour` are unchanged.

`recalculateProgress` no longer does `Number(totalKillsByName[monster.name] || 0)` — that
would have flattened an evidence object to `NaN → 0`, silently discarding it. It now passes
the raw value through and lets `buildMonsterProgress` normalize it. This is the one bug-fix
in this file that changes behavior for a non-number input; a bare number is byte-for-byte
unaffected (`tests/planning-evidence.test.js`, "unknown Bestiary progress is bounded...").

**`opportunity-analysis.js`** — `buildEntry` takes evidence (via `normalizeProgressEvidence`)
instead of a bare `kills` number. New per-entry fields: `progressKnown`, `isProgressFloor`,
`killsLeftAtLeast`. `buildOpportunityAnalysis`'s `totals` gained `unknownProgress` /
`charmsUnknownProgress`, counted separately from `neverHunted` / `charmsNeverHunted` (a
confirmed zero); `charmsUnclaimed` now includes the unknown bucket. `finishable` and
`quickWins`/`blindSpots` now require `progressKnown` — an untouched entry is never ranked
"Finishable Now" even when a session happens to have measured a rate for it, because the
"kills left" backing that rank cannot be trusted. A new `unknownProgress` /
`unknownProgressCount` result lists those entries on their own, so they stay visible instead
of disappearing.

Respawn-mode separation is opt-in and additive: sessions may now carry an optional
`respawnMode` field (`"regular" | "rapid"`, matching `hunt.respawnMode` elsewhere in the app).
`buildMeasuredRates` (unchanged return shape, still pools every mode — the default/legacy
path) now also stamps `respawnMode` on each rate for information. A new
`buildMeasuredRatesByMode(sessions)` returns a `Map<name, Map<mode, rate>>` built only from
sessions that state a mode. `buildOpportunityAnalysis(..., { respawnMode })` — a new, optional
fourth-argument key — restricts `finishable` to that mode's own measured rate and excludes a
creature entirely rather than substituting a rate from the other mode. Omitting the option
(every current call site) reproduces prior behavior exactly.

**`hunt-comparison.js`** — `aggregateAllTabsSummary`'s parameter changed from an array of
pre-built per-hunt summaries to the hunt groups themselves
(`buildAllTabsAnalysis(...).participatingHunts`, each `{ id, label, selectedMonsters }`). This
is the one **non-additive** signature change in this work, and it is required: a pre-built
summary has already collapsed away which specific monsters made it up, so there is no way to
detect a creature repeated across hunts from that shape. The function now walks hunts in their
existing order, keeps a running `Set` of creature names already credited, and calls
`summarizeBestiaryMonsters` per hunt only on the monsters not already credited to an earlier
hunt in the sequence. A shared creature is paid, and timed, once — attributed to the first hunt
it appears in. `Infinity`/`0` rates propagate through the plain running sum with no special
casing (see `tests/planning-evidence.test.js`, the zero-rate and duplicate-reward cases). The
function's return shape (`{ totalCharms, totalTimeMinutes, charmRate }`) is unchanged, so
`render-all-tabs.js` needs no changes.

**`charm-plan.js`** — unchanged optimization logic and numeric output (the existing exhaustive
oracle test in `tests/planning-contracts.test.js` still passes unmodified). Each monster
object may now carry `progressKnown` / `isProgressFloor` (default `true` / `false` when
absent, i.e. legacy monsters are still read as exact); those tags are threaded through into
`plan.entries` and `plan.route[].entries`, and a new top-level `plan.hasBoundedEstimates`
flag is `true` when any included entry rests on unknown or floor-only progress. The optimizer
was deliberately **not** changed to exclude unknown-progress monsters — it already uses each
monster's `timeRemainingMinutes`, which (per the session-analysis.js fix above) is already the
conservative/pessimistic bound for unknown or floor progress. Excluding them outright would
just forgo an opportunity the plan actually has room for; tagging them lets the UI flag the
uncertainty without ever overstating what the plan can promise.

## Integrated behavior

`main.js` supplies evidence from the Bestiary tracker, including reviewed zero. Exact session inputs clear obsolete stage tiles; empty clears the recorded total; negative, partial and unsafe counts are rejected. Every changed session total and bulk reset captures previous entries for undo. All-session aggregation receives individual hunt groups and credits each creature to its first selected session in tab order. It is a conservative route estimate, not an optimal schedule.

Session tables show unknown/range estimates. Session and Charm Plan summaries qualify potential rewards. Opportunities separate unrecorded entries from confirmed unfinished entries, show conservative stage bounds, and use an explicit Regular/Rapid selection shared with the charm plan. Page changes and reload preserve the selected mode.

## Test coverage

`tests/planning-evidence.test.js` (independent of `tests/planning-contracts.test.js`, which is
untouched and still passes):

- `normalizeProgressEvidence` on a bare number, `undefined`, and malformed evidence fields.
- Unknown vs. reviewed-zero vs. legacy-number progress through `recalculateProgress`, including
  that a legacy numeric caller's output is byte-for-byte unchanged.
- A stage-only tile's lower/upper remaining-kills and remaining-time bounds.
- `isBestiaryEntryComplete` unaffected by evidence shape, including undoing progress from a
  typed complete count back down to an incomplete floor tile.
- All-session (`hunt-comparison.js`) duplicate-reward and duplicate-time dedup across hunts,
  including an already-complete shared creature and a zero-measured-rate (infinite time) hunt
  mixed with a finite one.
- Opportunity analysis distinguishing unknown progress from a confirmed never-hunted zero, and
  excluding unknown progress from "Finishable Now" even when a rate exists for it.
- Opportunity analysis respawn-mode separation: default pooling unchanged; an explicit mode
  request uses only that mode's rate and excludes a creature rather than substituting another
  mode's rate.
- Charm plan evidence tagging (`progressKnown`, `isProgressFloor`, `plan.hasBoundedEstimates`)
  without any change to the optimizer's charm/time totals.

Primary verification: evidence and optimizer suites pass, including the independent 120-case exhaustive oracle. Chrome verified unknown progress, reviewed zero and malformed counts after reload, all-session rendering, mode selection and desktop/mobile layouts. Full-suite counts are recorded in the completion ledger.
